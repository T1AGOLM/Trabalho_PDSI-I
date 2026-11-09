import { describe, test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import express from 'express'
import cookieParser from 'cookie-parser'
import pg from 'pg'
import { readFile } from 'node:fs/promises'
import { authRoutes } from '../../src/routes/auth.routes.js'
import { tratadorDeErros } from '../../src/middleware/errors.js'
import { pool, withTransaction } from '../../src/db/pool.js'
import { config } from '../../src/config/env.js'

// Opt-in duplo: nunca roda contra o banco de trabalho por acidente.
// Exige schema + seed aplicados em um banco exclusivo cujo nome contenha test.
const habilitado = process.env.PETPLUS_BANCO_TESTE === '1'
describe('segurança de sessões com PostgreSQL real', {
  skip: habilitado ? false : 'Pendente: configure banco exclusivo e PETPLUS_BANCO_TESTE=1.',
}, () => {
  let server
  let base
  const anterior = { rate: config.rateLimit.enabled, expor: config.email.exporTokenRecuperacao, rounds: config.auth.bcryptRounds }
  before(async () => {
    assert.match(config.db.database, /test/i, 'DB_NAME deve identificar explicitamente um banco de teste.')
    assert.equal(config.isProd, false, 'Suíte de mutações não executa em produção.')
    await pool.query('SELECT 1')
    config.rateLimit.enabled = false
    config.email.exporTokenRecuperacao = true
    config.auth.bcryptRounds = 8
    const app = express()
    app.use(express.json(), cookieParser())
    app.use('/auth', authRoutes)
    app.use(tratadorDeErros)
    server = app.listen(0, '127.0.0.1')
    await new Promise(resolve => server.once('listening', resolve))
    base = `http://127.0.0.1:${server.address().port}/auth`
  })
  after(async () => {
    config.rateLimit.enabled = anterior.rate
    config.email.exporTokenRecuperacao = anterior.expor
    config.auth.bcryptRounds = anterior.rounds
    if (server) {
      server.closeAllConnections()
      await new Promise(resolve => server.close(resolve))
    }
    await pool.end()
  })

  async function chamar(caminho, { metodo = 'GET', token, body } = {}) {
    const res = await fetch(base + caminho, {
      method: metodo,
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
    })
    return { status: res.status, body: await res.json(), headers: res.headers }
  }
  async function conta() {
    const dados = { nome: 'Tutor Teste Segurança', email: `seguranca-${crypto.randomUUID()}@example.com`, senha: 'SenhaInicial123', consentimento: true }
    const criada = await chamar('/cadastro', { metodo: 'POST', body: dados })
    assert.equal(criada.status, 201, JSON.stringify(criada.body))
    return { ...criada.body, dados }
  }

  test('duas redefinições reais: exatamente um sucesso e um TOKEN_INVALIDO', async () => {
    const usuario = await conta()
    const pedido = await chamar('/recuperar-senha', { metodo: 'POST', body: { email: usuario.dados.email } })
    assert.match(pedido.body.token, /^[a-f0-9]{64}$/)
    const resultados = await Promise.all([
      chamar('/redefinir-senha', { metodo: 'POST', body: { token: pedido.body.token, senha: 'NovaSenha123' } }),
      chamar('/redefinir-senha', { metodo: 'POST', body: { token: pedido.body.token, senha: 'NovaSenha456' } }),
    ])
    assert.equal(resultados.filter(r => r.status === 200).length, 1)
    assert.equal(resultados.filter(r => r.body.codigo === 'TOKEN_INVALIDO').length, 1)
    assert.equal((await chamar('/eu', { token: usuario.token })).status, 401)
    const avisos = await withTransaction({ tenantId: usuario.usuario.petshopId }, db => db.query(
      "SELECT mensagem FROM notificacao WHERE usuario_id = $1 AND tipo = 'recuperacao_senha'", [usuario.usuario.id],
    ))
    assert.ok(avisos.rows.length > 0)
    assert.ok(avisos.rows.every(r => !r.mensagem.includes(pedido.body.token) && !r.mensagem.includes('token=')))
  })

  test('dois refresh reais: exatamente um sucesso e um REFRESH_REUTILIZADO', async () => {
    const usuario = await conta()
    const resultados = await Promise.all([
      chamar('/refresh', { metodo: 'POST', body: { refreshToken: usuario.refreshToken } }),
      chamar('/refresh', { metodo: 'POST', body: { refreshToken: usuario.refreshToken } }),
    ])
    assert.equal(resultados.filter(r => r.status === 200).length, 1)
    assert.equal(resultados.filter(r => r.body.codigo === 'REFRESH_REUTILIZADO').length, 1)
    assert.equal((await chamar('/eu', { token: usuario.token })).status, 401)
  })

  test('logout com apenas JWT rejeita imediatamente o access token antigo', async () => {
    const usuario = await conta()
    assert.equal((await chamar('/eu', { token: usuario.token })).status, 200)
    const logout = await chamar('/logout', { metodo: 'POST', token: usuario.token })
    assert.equal(logout.status, 200)
    assert.match(logout.headers.get('set-cookie'), /petplus_token=;/)
    assert.equal((await chamar('/eu', { token: usuario.token })).status, 401)
  })

  test('troca de senha rejeita JWT de todas as sessões e aceita a nova senha', async () => {
    const usuario = await conta()
    const outra = await chamar('/login', { metodo: 'POST', body: { email: usuario.dados.email, senha: usuario.dados.senha } })
    const troca = await chamar('/senha', { metodo: 'PATCH', token: usuario.token, body: { senhaAtual: usuario.dados.senha, novaSenha: 'NovaSenha123' } })
    assert.equal(troca.status, 200)
    assert.equal((await chamar('/eu', { token: usuario.token })).status, 401)
    assert.equal((await chamar('/eu', { token: outra.body.token })).status, 401)
    assert.equal((await chamar('/login', { metodo: 'POST', body: { email: usuario.dados.email, senha: 'NovaSenha123' } })).status, 200)
  })

  test('consentimento inválido não cria usuário; true permite cadastro', async () => {
    for (const consentimento of ['false', '0', false, undefined]) {
      const resposta = await chamar('/cadastro', { metodo: 'POST', body: {
        nome: 'Tutor Teste', email: `invalido-${crypto.randomUUID()}@example.com`, senha: 'Senha1234', consentimento,
      } })
      assert.equal(resposta.status, 422)
      assert.equal(resposta.body.codigo, 'LGPD_CONSENTIMENTO')
    }
    await conta()
  })

  test('migração de compatibilidade pode ser repetida sem alterar dados ou saldos', async () => {
    const admin = new pg.Client({ ...config.db, user: config.db.adminUser, password: config.db.adminPassword })
    const resumo = `SELECT
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(c) ORDER BY usuario_id)::text,'[]')) FROM cliente c) clientes,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(m) ORDER BY id)::text,'[]')) FROM fidelidade_movimentacao m) extrato,
      (SELECT md5(COALESCE(jsonb_agg(to_jsonb(n) ORDER BY id)::text,'[]')) FROM notificacao n) notificacoes`
    try {
      await admin.connect()
      await admin.query('BEGIN')
      const antes = (await admin.query(resumo)).rows[0]
      const sql = await readFile(new URL('../../../Banco_de_Dados/sql/009_compatibilidade_backend_atual.sql', import.meta.url), 'utf8')
      await admin.query(sql)
      assert.deepEqual((await admin.query(resumo)).rows[0], antes)
    } finally {
      await admin.query('ROLLBACK').catch(() => {})
      await admin.end()
    }
  })
})
