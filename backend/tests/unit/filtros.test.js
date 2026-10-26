import { test } from 'node:test'
import assert from 'node:assert/strict'
import { criarFiltro } from '../../src/db/filtros.js'

/**
 * Testes unitários das camadas puras (RNF16).
 *
 * Aqui não há banco nem HTTP: são funções que transformam entrada em
 * consulta/SQL e cujo erro é silencioso em produção (um `WHERE` faltando
 * vira um vazamento de dados). São exatamente as que merecem teste
 * exaustivo e barato.
 */

test('filtro vazio não gera WHERE', () => {
  const f = criarFiltro()
  assert.equal(f.where(), '')
  assert.equal(f.vazio, true)
})

test('igual numera os parâmetros na ordem de uso', () => {
  const f = criarFiltro()
  f.igual('a.petshop_id', 1).igual('a.status', 'confirmado')
  assert.equal(f.where(), 'WHERE a.petshop_id = $1 AND a.status = $2')
  assert.deepEqual(f.parametros, [1, 'confirmado'])
})

test('valores ausentes são ignorados, não viram filtro nulo', () => {
  const f = criarFiltro()
  f.igual('a.petshop_id', 1).igual('a.tipo', undefined).igual('a.outro', null).igual('a.vazio', '')
  assert.equal(f.where(), 'WHERE a.petshop_id = $1')
  assert.deepEqual(f.parametros, [1])
})

test('contem coloca o curinga no VALOR, nunca no SQL', () => {
  const f = criarFiltro()
  f.contem('p.nome', "ração'; DROP TABLE pet; --")
  assert.equal(f.where(), 'WHERE p.nome ILIKE $1')
  assert.deepEqual(f.parametros, ["%ração'; DROP TABLE pet; --%"])
})

test('contemAlgum monta um OR com o mesmo parâmetro', () => {
  const f = criarFiltro()
  f.contemAlgum(['p.nome', 'u.nome'], 'ana')
  assert.equal(f.where(), 'WHERE (p.nome ILIKE $1 OR u.nome ILIKE $1)')
  assert.deepEqual(f.parametros, ['%ana%'])
})

test('emLista aceita array e ignora lista vazia', () => {
  const a = criarFiltro()
  a.emLista('p.id', [1, 2, 3])
  assert.equal(a.where(), 'WHERE p.id = ANY($1::bigint[])')
  assert.deepEqual(a.parametros, [[1, 2, 3]])

  const b = criarFiltro()
  b.emLista('p.id', [])
  assert.equal(b.where(), '')
})

test('entre aceita só um dos lados', () => {
  const f = criarFiltro()
  f.entre('a.data_hora::date', '2026-09-01', '2026-09-30')
  assert.equal(f.where(), 'WHERE a.data_hora::date >= $1 AND a.data_hora::date <= $2')

  const g = criarFiltro()
  g.entre('a.data_hora::date', undefined, '2026-09-30')
  assert.equal(g.where(), 'WHERE a.data_hora::date <= $1')
})

test('booleano normaliza texto da query string', () => {
  const f = criarFiltro()
  f.booleano('a.ativo', 'true').booleano('a.inativo', 'false')
  assert.equal(f.where(), 'WHERE a.ativo = $1 AND a.inativo = $2')
  assert.deepEqual(f.parametros, [true, false])
})

test('sql literal injeta valores como parâmetros, não como texto', () => {
  const f = criarFiltro()
  f.igual('v.petshop_id', 7)
    .sql("v.status = 'finalizada' AND (v.data_hora AT TIME ZONE ps.timezone)::date >= ?::date", '2026-09-01')
  assert.equal(
    f.where(),
    "WHERE v.petshop_id = $1 AND v.status = 'finalizada' AND (v.data_hora AT TIME ZONE ps.timezone)::date >= $2::date",
  )
  assert.deepEqual(f.parametros, [7, '2026-09-01'])
})
