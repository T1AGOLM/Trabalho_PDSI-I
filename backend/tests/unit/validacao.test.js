import { test } from 'node:test'
import assert from 'node:assert/strict'
import { z } from 'zod'
import {
  dataISO, dataHoraLocal, dinheiro, email, idParam, senha, textoOpcional, validar,
} from '../../src/middleware/validar.js'
import { higienizarEntrada } from '../../src/middleware/security.js'
import { ErroDeValidacao } from '../../src/middleware/errors.js'

test('e-mail é normalizado para minúsculo (coluna CITEXT)', () => {
  assert.equal(email.parse('  GESTOR@PetPlus.COM '), 'gestor@petplus.com')
  assert.equal(email.safeParse('sem-arroba').success, false)
})

test('política de senha exige tamanho, letra e número', () => {
  assert.equal(senha.safeParse('PetPlus1').success, true)
  assert.equal(senha.safeParse('12345678').success, false, 'só números não passam')
  assert.equal(senha.safeParse('abcdefgh').success, false, 'só letras não passam')
  assert.equal(senha.safeParse('Ab1').success, false, 'curta demais')
  // Limite do bcrypt: acima de 72 bytes o hash ficaria ambíguo.
  assert.equal(senha.safeParse('A1' + 'x'.repeat(80)).success, false)
})

test('datas e datas-hora seguem o formato do contrato do front', () => {
  assert.equal(dataISO.safeParse('2026-09-12').success, true)
  assert.equal(dataISO.safeParse('12/09/2026').success, false)
  assert.equal(dataHoraLocal.safeParse('2026-09-12T09:00').success, true)
  assert.equal(dataHoraLocal.safeParse('2026-09-12T09:00:00').success, false)
})

test('id, dinheiro e texto opcional recusam valores absurdos e vazio é ausente', () => {
  assert.equal(idParam.safeParse({ id: '42' }).success, true)
  assert.equal(idParam.safeParse({ id: '-1' }).success, false)
  assert.equal(idParam.safeParse({ id: 'abc' }).success, false)
  assert.equal(dinheiro.safeParse('19.90').success, true)
  assert.equal(dinheiro.safeParse(-1).success, false)
  // ?status= significa "sem filtro", não "string vazia".
  assert.equal(textoOpcional().parse(''), undefined)
  assert.equal(textoOpcional().parse('  banho  '), 'banho')
})

test('validar remove campos não declarados do corpo (anti mass-assignment)', () => {
  const corpo = z.object({ nome: z.string() })
  const middleware = validar({ corpo })

  const req = { body: { nome: 'Ana', petshop_id: 999, perfil: 'GESTOR', ativo: false } }
  middleware(req, {}, () => {})
  assert.deepEqual(req.body, { nome: 'Ana' }, 'só o que foi declarado sobrevive')
})

test('validar converte tipos e encaminha o erro para o tratador', () => {
  const middleware = validar({ params: idParam })

  const req = { params: { id: '7' } }
  middleware(req, {}, () => {})
  assert.equal(req.paramsValidos.id, 7, 'string da URL vira número')

  let capturado = null
  middleware({ params: { id: 'x' } }, {}, (err) => { capturado = err })
  assert.ok(capturado, 'deveria encaminhar o erro em vez de estourar')
  assert.equal(capturado.name, 'ZodError')
})

test('erro de validação sai como 422 com a lista de campos', () => {
  const erro = new ErroDeValidacao([{ campo: 'email', mensagem: 'Informe um e-mail válido' }])
  assert.equal(erro.status, 422)
  assert.equal(erro.codigo, 'VALIDACAO')
  assert.match(erro.detalhe, /email/)
})

test('higienizarEntrada remove poluição de protótipo e bytes nulos', () => {
  // JSON.parse é o caminho real do ataque: cria `__proto__` como chave própria,
  // diferente do literal `{ __proto__: ... }`, que apenas troca o protótipo.
  const req = {
    body: JSON.parse('{"nome":"ok\\u0000","__proto__":{"poluido":true},"constructor":{"x":1}}'),
    query: { busca: 'a\u0000b' },
  }
  req.body.aninhado = JSON.parse('{"__proto__":{"y":2},"manter":"sim"}')

  higienizarEntrada(req, {}, () => {})

  assert.equal(req.body.nome, 'ok')
  assert.equal(req.body.aninhado.manter, 'sim')
  assert.ok(!Object.prototype.hasOwnProperty.call(req.body, '__proto__'))
  assert.ok(!Object.prototype.hasOwnProperty.call(req.body, 'constructor'))
  assert.ok(!Object.prototype.hasOwnProperty.call(req.body.aninhado, '__proto__'))
  assert.equal(req.query.busca, 'ab')
  assert.deepEqual(Object.getPrototypeOf(req.body), Object.prototype, 'o protótipo não foi trocado')
  assert.equal({}.poluido, undefined, 'nada vazou para Object.prototype')
})

test('higienizarEntrada preserva arrays e tipos primitivos', () => {
  const req = { body: { itens: [{ produtoId: 1, quantidade: 2 }], desconto: 0, obs: null } }
  higienizarEntrada(req, {}, () => {})
  assert.deepEqual(req.body.itens, [{ produtoId: 1, quantidade: 2 }])
  assert.equal(req.body.desconto, 0)
  assert.equal(req.body.obs, null)
})
