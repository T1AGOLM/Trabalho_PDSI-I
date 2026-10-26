import { withTransaction } from '../db/pool.js'
import { criarFiltro } from '../db/filtros.js'
import { listarPaginado } from '../db/consultas.js'
import { montarOrdenacao } from '../http/paginacao.js'

/**
 * Repositório de produtos e estoque (RF07–RF09 / RF23 / RN02 / RN05 / RN09).
 *
 * `quantidade_estoque` **nunca** é escrita diretamente: todo saldo novo
 * vem de uma linha em `movimentacao_estoque`, e o gatilho
 * `fn_movimentar_estoque` soma/subtrai no produto. Isso mantém a trilha
 * auditável (RNF09) e garante estoque não negativo mesmo com dois PDVs
 * vendendo ao mesmo tempo (a linha do produto é travada no banco).
 */

const CAMPOS = `
  p.id, p.nome, p.categoria, p.sku,
  p.quantidade_estoque AS "quantidadeEstoque",
  p.estoque_minimo     AS "estoqueMinimo",
  to_char(p.validade, 'YYYY-MM-DD') AS validade,
  p.preco,
  p.fornecedor_id AS "fornecedorId", f.nome AS "fornecedorNome",
  p.ativo,
  (p.quantidade_estoque <= p.estoque_minimo) AS "abaixoMinimo",
  (p.validade IS NOT NULL AND p.validade <= CURRENT_DATE + ps.antecedencia_validade_d) AS "validadeProxima",
  CASE WHEN p.validade IS NULL THEN NULL ELSE (p.validade - CURRENT_DATE) END AS "diasParaVencer"`

const ORDENACAO = {
  nome: 'p.nome',
  categoria: 'p.categoria',
  estoque: 'p.quantidade_estoque',
  preco: 'p.preco',
  validade: 'p.validade',
}

export function listar({ tenantId }, { pagina, limite, offset, busca, categoria, ativo,
  abaixoMinimo, vencendoEm, ordenar, direcao }) {
  return withTransaction({ tenantId }, async (db) => {
    const f = criarFiltro()
    f.igual('p.petshop_id', tenantId)
      .contemAlgum(['p.nome', 'p.categoria', 'p.sku'], busca)
      .igual('p.categoria', categoria)
      .booleano('p.ativo', ativo)

    if (abaixoMinimo === true || abaixoMinimo === 'true') {
      f.sql('p.quantidade_estoque <= p.estoque_minimo')
    }
    // `?vencendoEm=30` → vence nos próximos N dias (RF23).
    if (vencendoEm !== undefined) {
      f.sql('p.validade IS NOT NULL AND p.validade <= CURRENT_DATE + ?::int', Number(vencendoEm))
    }

    const ord = montarOrdenacao({ ordenar, direcao }, ORDENACAO, 'nome')
    const from = `FROM produto p
                  LEFT JOIN fornecedor f ON f.id = p.fornecedor_id
                  JOIN petshop ps ON ps.id = p.petshop_id`

    return listarPaginado(db, {
      totalSql: `SELECT count(*)::int AS total ${from} ${f.where()}`,
      dadosSql: `SELECT ${CAMPOS} ${from} ${f.where()} ORDER BY ${ord.sql} ${ord.direcao}`,
      params: f.parametros,
      pagina, limite, offset,
    })
  })
}

/** Aceita uma conexão já em transação (ver comentário em cliente.repository). */
export const buscarPorId = ({ tenantId }, id, db) => {
  const executar = async (conn) => {
    const { rows } = await conn.query(
      `SELECT ${CAMPOS}
         FROM produto p
         LEFT JOIN fornecedor f ON f.id = p.fornecedor_id
         JOIN petshop ps ON ps.id = p.petshop_id
        WHERE p.id = $1 AND p.petshop_id = $2`,
      [id, tenantId],
    )
    return rows[0] ?? null
  }
  return db ? executar(db) : withTransaction({ tenantId }, executar)
}

/** Cadastra o produto e, se houver saldo inicial, a entrada vai pela trilha (RF08). */
export const criar = ({ tenantId, usuarioId }, dados) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO produto (petshop_id, fornecedor_id, nome, categoria, sku, estoque_minimo, validade, preco)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id`,
      [tenantId, dados.fornecedorId ?? null, dados.nome, dados.categoria, dados.sku ?? null,
       dados.estoqueMinimo ?? 0, dados.validade || null, dados.preco],
    )
    const id = rows[0].id

    const inicial = Number(dados.quantidadeInicial ?? 0)
    if (inicial > 0) {
      const lote = await db.query(
        `INSERT INTO lote (petshop_id, produto_id, fornecedor_id, quantidade, custo_unitario, validade)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
        [tenantId, id, dados.fornecedorId ?? null, inicial, dados.custoUnitario ?? 0, dados.validade || null],
      )
      await db.query(
        `INSERT INTO movimentacao_estoque
           (petshop_id, produto_id, tipo, quantidade, lote_id, usuario_id, observacao)
         VALUES ($1, $2, 'entrada', $3, $4, $5, 'Cadastro do produto')`,
        [tenantId, id, inicial, lote.rows[0].id, usuarioId],
      )
    }
    return buscarPorId({ tenantId }, id, db)
  })

export const atualizar = ({ tenantId, usuarioId }, { id, ...dados }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE produto
          SET nome           = COALESCE($3, nome),
              categoria      = COALESCE($4, categoria),
              sku            = COALESCE($5, sku),
              estoque_minimo = COALESCE($6, estoque_minimo),
              validade       = COALESCE($7, validade),
              preco          = COALESCE($8, preco),
              fornecedor_id  = COALESCE($9, fornecedor_id)
        WHERE id = $1 AND petshop_id = $2
        RETURNING id`,
      [id, tenantId, dados.nome ?? null, dados.categoria ?? null, dados.sku ?? null,
       dados.estoqueMinimo ?? null, dados.validade || null, dados.preco ?? null,
       dados.fornecedorId ?? null],
    )
    if (!rows[0]) return null
    return buscarPorId({ tenantId }, id, db)
  })

/** Exclusão lógica (RF03): sai das listagens, o histórico de vendas fica. */
export const inativar = ({ tenantId, usuarioId }, id) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      'UPDATE produto SET ativo = false WHERE id = $1 AND petshop_id = $2 RETURNING id, nome',
      [id, tenantId],
    )
    return rows[0] ? { ...rows[0], ativo: false } : null
  })

export const reativar = ({ tenantId, usuarioId }, id) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      'UPDATE produto SET ativo = true WHERE id = $1 AND petshop_id = $2 RETURNING id',
      [id, tenantId],
    )
    return rows[0] ? { id, ativo: true } : null
  })

/** Entrada de mercadoria (RF07): gera lote e movimentação de entrada. */
export const registrarEntrada = ({ tenantId, usuarioId }, { id, quantidade, observacao, validade, custoUnitario }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const produto = await buscarPorId({ tenantId }, id, db)
    if (!produto) return null

    const lote = await db.query(
      `INSERT INTO lote (petshop_id, produto_id, fornecedor_id, quantidade, custo_unitario, validade)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [tenantId, id, produto.fornecedorId ?? null, quantidade, custoUnitario ?? 0, validade || produto.validade || null],
    )

    await db.query(
      `INSERT INTO movimentacao_estoque
         (petshop_id, produto_id, tipo, quantidade, lote_id, usuario_id, observacao)
       VALUES ($1, $2, 'entrada', $3, $4, $5, $6)`,
      [tenantId, id, quantidade, lote.rows[0].id, usuarioId, observacao ?? 'Entrada de estoque'],
    )

    // A validade do produto acompanha a do lote mais recente (RN09).
    if (validade) {
      await db.query('UPDATE produto SET validade = $3 WHERE id = $1 AND petshop_id = $2', [id, tenantId, validade])
    }
    return buscarPorId({ tenantId }, id, db)
  })

/** Ajuste de inventário (RNF09: fica na trilha como qualquer movimentação). */
export const registrarAjuste = ({ tenantId, usuarioId }, { id, quantidade, tipo, observacao }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const produto = await buscarPorId({ tenantId }, id, db)
    if (!produto) return null

    // Um 'ajuste' com tipo positivo vira entrada; com tipo negativo, saída.
    const entrada = tipo === 'entrada'
    await db.query(
      `INSERT INTO movimentacao_estoque
         (petshop_id, produto_id, tipo, quantidade, usuario_id, observacao)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [tenantId, id, entrada ? 'entrada' : 'saida', quantidade, usuarioId,
       observacao ?? `Ajuste de inventário (${entrada ? 'acréscimo' : 'baixa'})`],
    )
    return buscarPorId({ tenantId }, id, db)
  })

/** Histórico de movimentações do produto (RF08 / RNF09). */
export function movimentacoes({ tenantId }, produtoId, { pagina, limite, offset, tipo, de, ate }) {
  return withTransaction({ tenantId }, async (db) => {
    const f = criarFiltro()
    f.igual('m.petshop_id', tenantId)
      .igual('m.produto_id', produtoId)
      .igual('m.tipo', tipo)
      .entre('m.data_hora::date', de, ate)

    const from = `FROM movimentacao_estoque m
                  LEFT JOIN usuario u ON u.id = m.usuario_id`

    return listarPaginado(db, {
      totalSql: `SELECT count(*)::int AS total ${from} ${f.where()}`,
      dadosSql: `SELECT m.id, m.tipo::text, m.quantidade, m.observacao,
                        u.nome AS usuario, m.venda_id AS "vendaId", m.lote_id AS "loteId",
                        petplus_data_hora_local(m.data_hora, ps.timezone) AS "dataHora"
                   ${from}
                   JOIN petshop ps ON ps.id = m.petshop_id
                   ${f.where()}
                  ORDER BY m.data_hora DESC`,
      params: f.parametros,
      pagina, limite, offset,
    })
  })
}

/** Alertas de estoque mínimo (RN05) e validade (RN09) — views do banco. */
export const alertas = ({ tenantId }) =>
  withTransaction({ tenantId }, async (db) => {
    const [estoque, validade, resumo] = await Promise.all([
      db.query(`SELECT id, nome, categoria, quantidade_estoque AS "quantidadeEstoque",
                       estoque_minimo AS "estoqueMinimo", deficit
                  FROM vw_alerta_estoque_minimo ORDER BY deficit DESC`),
      db.query(`SELECT id, nome, categoria, to_char(validade, 'YYYY-MM-DD') AS validade,
                       quantidade_estoque AS "quantidadeEstoque", dias_para_vencer AS "diasParaVencer"
                  FROM vw_alerta_validade ORDER BY dias_para_vencer`),
      db.query(`SELECT (SELECT count(*)::int FROM vw_alerta_estoque_minimo) AS "estoqueMinimo",
                       (SELECT count(*)::int FROM vw_alerta_validade) AS validade`),
    ])
    return { estoque: estoque.rows, validade: validade.rows, totais: resumo.rows[0] }
  })
