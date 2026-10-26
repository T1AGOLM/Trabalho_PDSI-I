import { test } from 'node:test'
import assert from 'node:assert/strict'
import crypto from 'node:crypto'
import jwt from 'jsonwebtoken'
import { duracaoEmMs, hashDoToken, segundosDoAccessToken } from '../../src/services/sessao.service.js'
import { assinarToken, lerRefreshToken } from '../../src/middleware/auth.js'
import { config } from '../../src/config/env.js'
import { openapi } from '../../src/docs/openapi.js'
import { modelos } from '../../src/services/email.service.js'

test('duração textual vira milissegundos nas unidades suportadas', () => {
  assert.equal(duracaoEmMs('30m'), 1_800_000)
  assert.equal(duracaoEmMs('8h'), 28_800_000)
  assert.equal(duracaoEmMs('7d'), 604_800_000)
  assert.equal(duracaoEmMs('45s'), 45_000)
  // Sem sufixo, segundos — a mesma convenção do jsonwebtoken.
  assert.equal(duracaoEmMs('3600'), 3_600_000)
  assert.throws(() => duracaoEmMs('meia hora'), /Duração inválida/)
})

test('prazo do access token é positivo e coerente com a configuração', () => {
  const segundos = segundosDoAccessToken()
  assert.ok(Number.isInteger(segundos) && segundos > 0, `segundos=${segundos}`)
  assert.equal(segundos, Math.floor(duracaoEmMs(config.auth.jwtExpiresIn) / 1000))
})

test('hash do refresh token é SHA-256 estável e não revela o valor', () => {
  const token = crypto.randomBytes(32).toString('hex')
  const hash = hashDoToken(token)
  assert.equal(hash.length, 64)
  assert.match(hash, /^[0-9a-f]{64}$/)
  assert.equal(hashDoToken(token), hash, 'deve ser determinístico')
  assert.notEqual(hashDoToken(token + 'x'), hash)
  assert.ok(!hash.includes(token.slice(0, 8)), 'o hash não pode conter o token')
})

test('JWT carrega tenant e perfil, assinado com o algoritmo esperado', () => {
  const token = assinarToken({ id: 7, petshop_id: 1, perfil: 'GESTOR', nome: 'Marcos' })
  const cabecalho = JSON.parse(Buffer.from(token.split('.')[0], 'base64url').toString())
  assert.equal(cabecalho.alg, 'HS256')

  const payload = jwt.verify(token, config.auth.jwtSecret, {
    algorithms: ['HS256'], issuer: 'petplus-api', audience: 'petplus',
  })
  assert.equal(payload.sub, 7)
  assert.equal(payload.petshopId, 1)
  assert.equal(payload.perfil, 'GESTOR')
  assert.ok(payload.exp > payload.iat, 'deve ter expiração futura')
})

test('a assinatura do token é rejeitada com outro segredo ou outro algoritmo', () => {
  const token = assinarToken({ id: 1, petshop_id: 1, perfil: 'CLIENTE', nome: 'X' })
  assert.throws(
    () => jwt.verify(token, 'outro-segredo-qualquer', { algorithms: ['HS256'], issuer: 'petplus-api' }),
    /invalid signature/,
  )
})

test('o refresh vem do cookie httpOnly e, na falta dele, do corpo', () => {
  const nome = config.http.cookie.refreshName
  assert.equal(lerRefreshToken({ cookies: { [nome]: 'abc123' } }), 'abc123')
  assert.equal(lerRefreshToken({ cookies: {}, body: { refreshToken: 'do-corpo' } }), 'do-corpo')
  assert.equal(lerRefreshToken({}), null)
})

test('modelos de e-mail citam o dado essencial de cada aviso', () => {
  const lembrete = modelos.lembreteAgendamento({
    tutor: 'Ana', pet: 'Bolinha', servico: 'Banho', profissional: 'Júlia', quando: '12/09/2026 às 09:00',
  })
  assert.match(lembrete.assunto, /Bolinha/)
  assert.match(lembrete.texto, /Ana/)
  assert.match(lembrete.texto, /12\/09\/2026 às 09:00/)

  const reset = modelos.recuperacaoSenha({
    nome: 'Ana', link: 'http://app/#/redefinir-senha?token=abc', validadeMinutos: 60,
  })
  assert.match(reset.texto, /http:\/\/app\/#\/redefinir-senha\?token=abc/)
  assert.match(reset.texto, /60 minutos/)

  const vacina = modelos.vacinaAVencer({
    tutor: 'Ana', pet: 'Bolinha', vacina: 'V10', vencimento: '01/10/2026', dias: 12,
  })
  assert.match(vacina.assunto, /12 dia/)
})

test('a documentação cobre todas as rotas montadas pelo servidor', async () => {
  const { rotasRegistradas } = await import('../../src/routes/index.js')
  const caminhos = Object.keys(openapi.paths)
  assert.ok(caminhos.length > 20, `esperava um catálogo grande, veio ${caminhos.length}`)

  for (const rota of rotasRegistradas()) {
    assert.ok(
      caminhos.includes(rota.caminho),
      `rota ${rota.metodo.toUpperCase()} ${rota.caminho} não está documentada`,
    )
  }
})

test('todo caminho documentado declara resumo e as respostas de erro padronizadas', () => {
  for (const [caminho, metodos] of Object.entries(openapi.paths)) {
    for (const [metodo, operacao] of Object.entries(metodos)) {
      assert.ok(operacao.responses, `${metodo.toUpperCase()} ${caminho} sem responses`)
      assert.ok(operacao.summary, `${metodo.toUpperCase()} ${caminho} sem summary`)
      assert.ok(
        operacao.responses['422'] || operacao.responses['404'],
        `${metodo.toUpperCase()} ${caminho} não documenta erro de cliente`,
      )
    }
  }
})

test('a especificação fecha a API por padrão: só /auth e infraestrutura são públicas', () => {
  assert.deepEqual(openapi.security, [{ bearerAuth: [] }, { cookieAuth: [] }])

  for (const [caminho, metodos] of Object.entries(openapi.paths)) {
    const infra = ['/health', '/health/detalhado', '/metrics']
    if (caminho.startsWith('/auth/') || infra.includes(caminho)) continue
    for (const [metodo, operacao] of Object.entries(metodos)) {
      assert.notDeepEqual(
        operacao.security,
        [],
        `${metodo.toUpperCase()} ${caminho} não pode estar aberto ao público`,
      )
    }
  }
})
