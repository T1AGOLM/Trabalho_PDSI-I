import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { pool } from '../../src/db/pool.js'
import { config } from '../../src/config/env.js'
import { redefinirSenha, trocarSenha } from '../../src/services/auth.service.js'
import { renovarSessao, encerrarSessao } from '../../src/services/sessao.service.js'
import { assinarToken, autenticar, lerSessaoDoAccessToken } from '../../src/middleware/auth.js'

// Dublê transacional para testar decisões do serviço sem PostgreSQL.
// A exclusão mútua aqui é simulada; a concorrência real deve ser testada
// separadamente em tests/integration/seguranca-sessoes.test.js.
async function preparar(t, { falharSenha = false, falharRevogacao = false } = {}) {
  const usuario = { id: 9, petshop_id: 1, perfil: 'CLIENTE', nome: 'Teste', email: 'teste@example.com', ativo: true,
    senha_hash: await bcrypt.hash('SenhaAntiga123', 8) }
  const estado = { usuario, usado: false, refresh: [{ id: 1, usuario_id: 9, revogado_em: null }] }
  let fila = Promise.resolve()
  t.mock.method(pool, 'query', async (sql) => {
    if (sql.includes('petplus_buscar_token_recuperacao')) return { rows: estado.usado ? [] : [{ id: 1, petshop_id: 1, usuario_id: 9 }] }
    if (sql.includes('petplus_buscar_refresh_token')) return { rows: [{ ...estado.refresh[0], petshop_id: 1, expira_em: new Date(Date.now() + 60_000) }] }
    throw new Error('Consulta inesperada no teste: ' + sql)
  })
  t.mock.method(pool, 'connect', async () => {
    const anterior = fila
    let liberar
    fila = new Promise(resolve => { liberar = resolve })
    await anterior
    const copia = structuredClone(estado)
    return {
      release: liberar,
      async query(sql, params) {
        if (sql === 'ROLLBACK') Object.assign(estado, copia)
        if (['BEGIN', 'COMMIT', 'ROLLBACK'].includes(sql) || sql.includes('set_config')) return { rows: [], rowCount: 0 }
        if (sql.includes('UPDATE token_recuperacao')) {
          if (estado.usado) return { rows: [], rowCount: 0 }
          estado.usado = true
          return { rows: [{ id: 1, petshop_id: 1, usuario_id: 9 }], rowCount: 1 }
        }
        if (sql.includes('UPDATE usuario SET senha_hash')) {
          if (falharSenha) throw new Error('falha simulada ao gravar senha')
          estado.usuario.senha_hash = params[0]
          return { rows: [], rowCount: 1 }
        }
        if (sql.includes('FROM usuario')) {
          const sessao = estado.refresh.find(r => r.id === params?.[2])
          if (sql.includes('JOIN refresh_token') && (!sessao || sessao.revogado_em)) return { rows: [], rowCount: 0 }
          return { rows: [estado.usuario], rowCount: 1 }
        }
        if (sql.includes('INSERT INTO refresh_token')) {
          const id = estado.refresh.length + 1
          estado.refresh.push({ id, usuario_id: 9, revogado_em: null })
          return { rows: [{ id }], rowCount: 1 }
        }
        if (sql.includes('UPDATE refresh_token')) {
          if (sql.includes('WHERE usuario_id')) {
            if (falharRevogacao) throw new Error('falha simulada ao revogar sessões')
            estado.refresh.forEach(r => { r.revogado_em = new Date() })
            return { rows: [], rowCount: estado.refresh.length }
          }
          const registro = estado.refresh.find(r => r.id === params[0])
          if (sql.includes('SET substituido_por')) {
            registro.substituido_por = params[1]
            return { rows: [], rowCount: 1 }
          }
          if (registro.revogado_em) return { rows: [], rowCount: 0 }
          registro.revogado_em = new Date()
          return { rows: [{ id: registro.id }], rowCount: 1 }
        }
        throw new Error('Consulta inesperada na transação de teste: ' + sql)
      },
    }
  })
  const rounds = config.auth.bcryptRounds
  config.auth.bcryptRounds = 8
  t.after(() => { config.auth.bcryptRounds = rounds; t.mock.restoreAll() })
  return estado
}

test('duas redefinições concorrentes produzem um sucesso e um TOKEN_INVALIDO (banco simulado)', async t => {
  const estado = await preparar(t)
  const token = crypto.randomBytes(32).toString('hex')
  const resultados = await Promise.allSettled([
    redefinirSenha({ token, senha: 'NovaSenha123' }),
    redefinirSenha({ token, senha: 'NovaSenha456' }),
  ])
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(resultados.find(r => r.status === 'rejected').reason.codigo, 'TOKEN_INVALIDO')
  assert.equal(estado.usado, true)
})

async function statusDoToken(token) {
  let status = 200
  const res = { status(codigo) { status = codigo; return this }, json() {} }
  await autenticar({ headers: { authorization: 'Bearer ' + token } }, res, err => { if (err) throw err })
  return status
}

test('logout com apenas access token invalida imediatamente o JWT (banco simulado)', async t => {
  const estado = await preparar(t)
  const token = assinarToken(estado.usuario, 1)
  assert.equal(await statusDoToken(token), 200)
  const sessaoAccess = lerSessaoDoAccessToken({ headers: { authorization: 'Bearer ' + token } })
  await encerrarSessao({ sessaoAccess })
  assert.equal(await statusDoToken(token), 401)
})

test('troca de senha revoga todas as sessões e rejeita o JWT antigo (banco simulado)', async t => {
  const estado = await preparar(t)
  const token = assinarToken(estado.usuario, 1)
  await trocarSenha({ usuarioId: 9, tenantId: 1, senhaAtual: 'SenhaAntiga123', novaSenha: 'NovaSenha123' })
  assert.equal(await bcrypt.compare('NovaSenha123', estado.usuario.senha_hash), true)
  assert.equal(await statusDoToken(token), 401)
})

test('redefinição revoga todas as sessões e rejeita o JWT antigo (banco simulado)', async t => {
  const estado = await preparar(t)
  const token = assinarToken(estado.usuario, 1)
  await redefinirSenha({ token: 'token-recuperacao', senha: 'NovaSenha123' })
  assert.equal(await statusDoToken(token), 401)
})

for (const operacao of ['trocar', 'redefinir']) {
  test(`falha na revogação reverte senha e consumo: ${operacao} (banco simulado)`, async t => {
    const estado = await preparar(t, { falharRevogacao: true })
    const executar = operacao === 'trocar'
      ? () => trocarSenha({ usuarioId: 9, tenantId: 1, senhaAtual: 'SenhaAntiga123', novaSenha: 'NovaSenha123' })
      : () => redefinirSenha({ token: 'token', senha: 'NovaSenha123' })
    await assert.rejects(executar(), /falha simulada ao revogar/)
    assert.equal(await bcrypt.compare('SenhaAntiga123', estado.usuario.senha_hash), true)
    assert.equal(estado.usado, false)
    assert.equal(estado.refresh[0].revogado_em, null)
  })
}

test('falha na gravação da senha reverte o consumo do token (banco simulado)', async t => {
  const estado = await preparar(t, { falharSenha: true })
  await assert.rejects(redefinirSenha({ token: 'token', senha: 'NovaSenha123' }), /falha simulada/)
  assert.equal(estado.usado, false)
  assert.equal(await bcrypt.compare('SenhaAntiga123', estado.usuario.senha_hash), true)
})

test('dois refresh concorrentes emitem apenas uma renovação (banco simulado)', async t => {
  const estado = await preparar(t)
  const resultados = await Promise.allSettled([
    renovarSessao({ refreshToken: 'mesmo-refresh-token' }),
    renovarSessao({ refreshToken: 'mesmo-refresh-token' }),
  ])
  assert.equal(resultados.filter(r => r.status === 'fulfilled').length, 1)
  assert.equal(resultados.find(r => r.status === 'rejected').reason.codigo, 'REFRESH_REUTILIZADO')
  assert.equal(estado.refresh.length, 2, 'não deve emitir uma terceira sessão')
  assert.ok(estado.refresh.every(r => r.revogado_em), 'reuso revoga inclusive a sessão vencedora')
})
