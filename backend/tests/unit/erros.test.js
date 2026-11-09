import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  ErroDeNegocio, ErroDeValidacao, ErroNaoEncontrado, ErroDePermissao, traduzirErroBanco, tratadorDeErros,
} from '../../src/middleware/errors.js'

/** Erro do PostgreSQL simulado: só os campos que o tradutor consulta. */
const pg = (code, extra = {}) => Object.assign(new Error(extra.message ?? 'erro do banco'), { code, ...extra })

test('violação de unicidade vira 409', () => {
  const e = traduzirErroBanco(pg('23505', { detail: 'Key (email)=(a@b.c) already exists.' }))
  assert.equal(e.status, 409)
  assert.equal(e.codigo, 'UNIQUE_VIOLATION')
})

test('conflito de agenda (EXCLUDE de RN01) vira 409 com código próprio', () => {
  const e = traduzirErroBanco(pg('23P01', { constraint: 'agendamento_sem_conflito_profissional' }))
  assert.equal(e.status, 409)
  assert.equal(e.codigo, 'CONFLITO_AGENDA')
  assert.match(e.message, /RN01/)
})

test('EXCLUDE desconhecido continua sendo 409, mas genérico', () => {
  const e = traduzirErroBanco(pg('23P01', { constraint: 'outra_restricao' }))
  assert.equal(e.status, 409)
  assert.equal(e.codigo, 'EXCLUDE_VIOLATION')
})

test('violação de CHECK vira 422 preservando a mensagem do gatilho', () => {
  const e = traduzirErroBanco(pg('23514', { detail: 'Fora da disponibilidade cadastrada (RN08)' }))
  assert.equal(e.status, 422)
  assert.equal(e.codigo, 'CHECK_VIOLATION')
  assert.match(e.detalhe, /RN08/)
})

test('permissão negada (gatilho RN11) vira 403 com a mensagem de negócio', () => {
  const e = traduzirErroBanco(pg('42501', { message: 'Somente gestores podem estornar vendas (RN11)' }))
  assert.equal(e.status, 403)
  assert.equal(e.codigo, 'PERMISSAO_NEGADA')
  assert.match(e.message, /gestores/)
})

test('42501 de Row-Level Security não vaza detalhe do banco', () => {
  const e = traduzirErroBanco(pg('42501', { message: 'new row violates row-level security policy for table "pet"' }))
  assert.equal(e.status, 403)
  assert.equal(e.codigo, 'TENANT_VIOLATION')
  assert.doesNotMatch(e.message, /pet/)
})

test('FK quebrada vira 422 e timeout de consulta vira 504', () => {
  assert.equal(traduzirErroBanco(pg('23503')).status, 422)
  assert.equal(traduzirErroBanco(pg('57014')).status, 504)
})

test('deadlock vira 409 (o cliente pode repetir)', () => {
  const e = traduzirErroBanco(pg('40P01'))
  assert.equal(e.status, 409)
  assert.equal(e.codigo, 'DEADLOCK')
})

test('erro de SQL do próprio código vira 500, não 4xx', () => {
  const e = traduzirErroBanco(pg('42703', { message: 'column "x" does not exist', position: '10' }))
  assert.equal(e.status, 500)
  assert.equal(e.codigo, 'SQL_INVALIDO')
})

test('código desconhecido devolve null (o tratador decide)', () => {
  assert.equal(traduzirErroBanco(pg('XX000')), null)
  assert.equal(traduzirErroBanco(new Error('sem código')), null)
})

test('erros de negócio carregam status, código e campos', () => {
  assert.equal(new ErroNaoEncontrado('Venda').status, 404)
  assert.equal(new ErroDePermissao('só gestor', 'PERFIL_INSUFICIENTE').codigo, 'PERFIL_INSUFICIENTE')
  const validacao = new ErroDeValidacao([{ campo: 'email', mensagem: 'inválido' }])
  assert.equal(validacao.status, 422)
  assert.deepEqual(validacao.campos, [{ campo: 'email', mensagem: 'inválido' }])
  assert.equal(new ErroDeNegocio('x', { status: 503 }).status, 503)
})

test('resposta HTTP preserva a mensagem e o campo recusado na validação', () => {
  let status, corpo
  const res = {
    status(valor) { status = valor; return this },
    json(valor) { corpo = JSON.parse(JSON.stringify(valor)); return this },
  }
  tratadorDeErros(new ErroDeValidacao([{ campo: 'telefone', mensagem: 'Informe ao menos 8 caracteres.' }]), {}, res, () => {})
  assert.equal(status, 422)
  assert.equal(corpo.erro, 'Dados inválidos na requisição.')
  assert.match(corpo.detalhe, /telefone/)
  assert.equal(corpo.campos[0].campo, 'telefone')
  tratadorDeErros(new ErroDeNegocio('Consentimento obrigatório.', { codigo: 'LGPD_CONSENTIMENTO' }), {}, res, () => {})
  assert.equal(corpo.erro, 'Consentimento obrigatório.')
})
for (const [nome, erro, esperado, mensagem] of [
  ['JSON inválido', { type: 'entity.parse.failed' }, 400, 'Corpo da requisição não é um JSON válido.'],
  ['corpo grande', { type: 'entity.too.large' }, 413, 'Requisição maior que o limite permitido.'],
  ['origem bloqueada', new Error('CORS bloqueado'), 403, 'Origem não permitida.'],
  ['status explícito', Object.assign(new Error('Tente mais tarde.'), { status: 429 }), 429, 'Tente mais tarde.'],
  ['erro interno', new Error('detalhe privado de infraestrutura'), 500, 'Erro interno do servidor.'],
]) {
  test(`resposta HTTP de ${nome} mantém mensagem legível e não expõe o erro interno`, () => {
    let status, corpo
    const res = {
      status(valor) { status = valor; return this },
      json(valor) { corpo = JSON.parse(JSON.stringify(valor)); return this },
    }
    tratadorDeErros(erro, { method: 'POST', originalUrl: '/teste' }, res, () => {})
    assert.equal(status, esperado)
    assert.equal(corpo.erro, mensagem)
    assert.doesNotMatch(JSON.stringify(corpo), /detalhe privado|stack/)
  })
}