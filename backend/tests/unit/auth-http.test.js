import { test } from 'node:test'
import assert from 'node:assert/strict'
import express from 'express'
import cookieParser from 'cookie-parser'
import { cadastrosRoutes } from '../../src/routes/cadastros.routes.js'
import { assinarToken } from '../../src/middleware/auth.js'
import { authRoutes } from '../../src/routes/auth.routes.js'
import { tratadorDeErros } from '../../src/middleware/errors.js'
import { cadastrarCliente } from '../../src/services/auth.service.js'
import { pool } from '../../src/db/pool.js'
import { config } from '../../src/config/env.js'

async function iniciar(t) {
  const app = express()
  app.use(express.json(), cookieParser())
  app.use('/auth', authRoutes)
  app.use('/api', cadastrosRoutes)
  app.use(tratadorDeErros)
  const server = app.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  const limites = config.rateLimit.enabled
  config.rateLimit.enabled = false
  t.after(async () => {
    config.rateLimit.enabled = limites
    t.mock.restoreAll()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  })
  return `http://127.0.0.1:${server.address().port}/auth`
}

for (const valor of ['false', '0', false, undefined, null, 0, 1, 'true']) {
  test(`cadastro HTTP rejeita consentimento ${JSON.stringify(valor)} com código próprio`, async t => {
    const base = await iniciar(t)
    const res = await fetch(base + '/cadastro', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Teste Tutor', email: 'teste@example.com', senha: 'Senha1234', consentimento: valor }),
    })
    assert.equal(res.status, 422)
    assert.equal((await res.json()).codigo, 'LGPD_CONSENTIMENTO')
    await assert.rejects(cadastrarCliente({ consentimento: valor }), err => err.codigo === 'LGPD_CONSENTIMENTO')
  })
}

test('cadastro HTTP aceita true literal e grava consentimento com data (banco simulado)', async t => {
  const base = await iniciar(t)
  const rounds = config.auth.bcryptRounds
  config.auth.bcryptRounds = 8
  t.after(() => { config.auth.bcryptRounds = rounds })
  t.mock.method(pool, 'query', async () => ({ rows: [{ id: 1 }] }))
  let gravouConsentimento = false
  t.mock.method(pool, 'connect', async () => ({ release() {}, async query(sql) {
    if (sql.includes('INSERT INTO usuario')) {
      gravouConsentimento = sql.includes('true, now()')
      return { rows: [{ id: 999, petshop_id: 1, nome: 'Teste Tutor', email: 'teste@example.com', perfil: 'CLIENTE' }] }
    }
    if (sql.includes('INSERT INTO refresh_token')) return { rows: [{ id: 1 }] }
    return { rows: [], rowCount: 1 }
  } }))
  const res = await fetch(base + '/cadastro', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nome: 'Teste Tutor', email: 'teste@example.com', senha: 'Senha1234', consentimento: true }),
  })
  assert.equal(res.status, 201)
  assert.equal(gravouConsentimento, true)
  assert.equal((await res.json()).usuario.nome, 'Teste Tutor')
})

test('logout limpa ambos os cookies mesmo quando o banco falha', async t => {
  const base = await iniciar(t)
  t.mock.method(pool, 'query', async () => { throw new Error('banco indisponível no teste') })
  const res = await fetch(base + '/logout', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refreshToken: 'token-de-teste' }),
  })
  assert.equal(res.status, 500)
  const cookies = res.headers.get('set-cookie')
  assert.match(cookies, /petplus_token=;/)
  assert.match(cookies, /petplus_refresh=;/)
  assert.match(cookies, /Expires=Thu, 01 Jan 1970/)
})

for (const pet of [{ nome: '   ' }, { nome: 'Teste', idade: -1 }, { nome: 'Teste', idade: 1.5 }, { nome: 'Teste', observacoesSaude: 'x'.repeat(2001) }]) {
  test('cadastro HTTP rejeita pet inválido antes de gravar a conta: '+JSON.stringify(pet).slice(0, 70), async t => {
    const base = await iniciar(t)
    t.mock.method(pool, 'connect', () => { assert.fail('Validação deve ocorrer antes da transação.') })
    const res = await fetch(base + '/cadastro', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nome: 'Tutor Teste', email: 'teste@example.com', senha: 'SenhaTeste123', consentimento: true, pet }),
    })
    assert.equal(res.status, 422)
  })
}

for (const senhaInvalida of ['12345678', 'abcdefgh', 'Abc123']) {
  test('cadastro administrativo rejeita senha fraca: '+senhaInvalida, async t => {
    const base = await iniciar(t)
    const gestor = { id: 1, petshop_id: 1, perfil: 'GESTOR', ativo: true }
    t.mock.method(pool, 'connect', async () => ({ release() {}, async query(sql) {
      assert.ok(!sql.includes('INSERT INTO'), 'Senha inválida não deve criar cliente.')
      return { rows: sql.includes('JOIN refresh_token') ? [gestor] : [] }
    } }))
    const res = await fetch(base.replace('/auth', '/api/clientes'), {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer '+assinarToken(gestor, 1) },
      body: JSON.stringify({ nome: 'Cliente Teste', email: 'teste@example.com', senha: senhaInvalida }),
    })
    assert.equal(res.status, 422)
  })
}
