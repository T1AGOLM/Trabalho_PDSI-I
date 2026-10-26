import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  LIMITE_MAX, LIMITE_PADRAO, montarOrdenacao, paginacao, schemaOrdenacao, schemaPaginacao,
} from '../../src/http/paginacao.js'
import { listarPaginado } from '../../src/db/consultas.js'

/** Banco de mentira: registra as consultas e devolve o que o teste mandar. */
const dbFalso = (respostas) => {
  const chamadas = []
  let i = 0
  return {
    chamadas,
    query: async (sql, params) => {
      chamadas.push({ sql, params })
      return respostas[i++]
    },
  }
}

test('paginacao converte página e limite em offset', () => {
  assert.deepEqual(paginacao({ pagina: 3, limite: 10 }), { pagina: 3, limite: 10, offset: 20 })
  assert.deepEqual(paginacao({}), { pagina: 1, limite: LIMITE_PADRAO, offset: 0 })
})

test('schema de paginação recusa limites absurdos', () => {
  assert.deepEqual(schemaPaginacao.parse({ pagina: '2', limite: '10' }), { pagina: 2, limite: 10 })
  assert.equal(schemaPaginacao.safeParse({ pagina: 0 }).success, false)
  assert.equal(schemaPaginacao.safeParse({ limite: LIMITE_MAX + 1 }).success, false)
  // Texto não numérico não pode virar NaN no SQL.
  assert.equal(schemaPaginacao.safeParse({ pagina: 'abc' }).success, false)
})

test('listarPaginado anexa limite e offset como parâmetros, nunca como texto', async () => {
  const db = dbFalso([{ rows: [{ total: '3' }] }, { rows: [{ id: 1 }] }])
  await listarPaginado(db, {
    totalSql: 'SELECT count(*)::int AS total FROM cliente WHERE petshop_id = $1',
    dadosSql: 'SELECT * FROM cliente WHERE petshop_id = $1 ORDER BY nome',
    params: [7],
    pagina: 2,
    limite: 10,
    offset: 10,
  })

  assert.equal(db.chamadas.length, 2)
  assert.match(db.chamadas[1].sql, /LIMIT \$2 OFFSET \$3$/)
  assert.deepEqual(db.chamadas[1].params, [7, 10, 10])
  // A contagem roda no mesmo recorte da listagem (mesmos filtros).
  assert.deepEqual(db.chamadas[0].params, [7])
})

test('listarPaginado preserva o total mesmo com a página vazia', async () => {
  const db = dbFalso([{ rows: [{ total: 137 }] }, { rows: [] }])
  const pagina = await listarPaginado(db, {
    totalSql: 'SELECT count(*)::int AS total FROM produto WHERE petshop_id = $1',
    dadosSql: 'SELECT * FROM produto WHERE petshop_id = $1',
    params: [1],
    pagina: 9,
    limite: 25,
    offset: 200,
  })

  assert.equal(pagina.total, 137, 'o total sobrevive à página vazia')
  assert.equal(pagina.paginas, 6)
  assert.equal(pagina.pagina, 9, 'a interface precisa saber qual página respondeu')
  assert.deepEqual(pagina.dados, [])
})

test('listarPaginado nunca devolve zero páginas', async () => {
  const db = dbFalso([{ rows: [{ total: 0 }] }, { rows: [] }])
  const pagina = await listarPaginado(db, { totalSql: 'q', dadosSql: 'q', params: [], pagina: 1, limite: 25, offset: 0 })
  assert.equal(pagina.paginas, 1)
})

test('ordenação usa allowlist: chave desconhecida cai no padrão', () => {
  const mapa = { nome: 'u.nome', criado: 'u.criado_em' }
  assert.equal(montarOrdenacao({ ordenar: 'criado', direcao: 'desc' }, mapa, 'nome').sql, 'u.criado_em')
  assert.equal(montarOrdenacao({ ordenar: 'criado', direcao: 'desc' }, mapa, 'nome').direcao, 'DESC')
  // Tentativa de injeção por ORDER BY: não entra.
  const injecao = montarOrdenacao({ ordenar: 'nome; DROP TABLE pet' }, mapa, 'nome')
  assert.equal(injecao.sql, 'u.nome')
  assert.equal(injecao.chave, 'nome')
  // Chave herdada do protótipo também não vale como coluna.
  assert.equal(montarOrdenacao({ ordenar: 'constructor' }, mapa, 'nome').sql, 'u.nome')
})

test('direção desconhecida vira ASC', () => {
  assert.equal(montarOrdenacao({ direcao: 'aleatoria' }, { nome: 'u.nome' }, 'nome').direcao, 'ASC')
})

test('schema de ordenação restringe às chaves declaradas', () => {
  const schema = schemaOrdenacao(['nome', 'preco'])
  assert.equal(schema.safeParse({ ordenar: 'preco' }).success, true)
  assert.equal(schema.safeParse({ ordenar: 'senha_hash' }).success, false)
})
