import { withTransaction } from '../db/pool.js'
import { criarFiltro } from '../db/filtros.js'
import { listarPaginado } from '../db/consultas.js'
import { montarOrdenacao } from '../http/paginacao.js'

/**
 * Repositório de serviços (RF04/RF07) — banho, tosa e consulta, com
 * duração (usada no cálculo do fim do atendimento e na ocupação da
 * agenda) e preço congelado no agendamento.
 */

const CAMPOS = `s.id, s.nome, s.tipo::text, s.duracao, s.preco, s.ativo`

const ORDENACAO = { nome: 's.nome', preco: 's.preco', tipo: 's.tipo', duracao: 's.duracao' }

export function listar({ tenantId }, { pagina, limite, offset, busca, tipo, ativo, ordenar, direcao }) {
  return withTransaction({ tenantId }, async (db) => {
    const f = criarFiltro()
    f.igual('s.petshop_id', tenantId).igual('s.tipo', tipo).contem('s.nome', busca).booleano('s.ativo', ativo)

    const ord = montarOrdenacao({ ordenar, direcao }, ORDENACAO, 'nome')
    const from = 'FROM servico s'

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
      `SELECT ${CAMPOS} FROM servico s WHERE s.id = $1 AND s.petshop_id = $2`,
      [id, tenantId],
    )
    return rows[0] ?? null
  }
  return db ? executar(db) : withTransaction({ tenantId }, executar)
}

export const criar = ({ tenantId, usuarioId }, dados) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO servico (petshop_id, nome, tipo, duracao, preco)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [tenantId, dados.nome, dados.tipo, dados.duracao, dados.preco],
    )
    return buscarPorId({ tenantId }, rows[0].id, db)
  })

export const atualizar = ({ tenantId, usuarioId }, { id, ...dados }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE servico
          SET nome    = COALESCE($3, nome),
              tipo    = COALESCE($4, tipo),
              duracao = COALESCE($5, duracao),
              preco   = COALESCE($6, preco)
        WHERE id = $1 AND petshop_id = $2
        RETURNING id`,
      [id, tenantId, dados.nome ?? null, dados.tipo ?? null, dados.duracao ?? null, dados.preco ?? null],
    )
    if (!rows[0]) return null
    return buscarPorId({ tenantId }, id, db)
  })

export const inativar = ({ tenantId, usuarioId }, id) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      'UPDATE servico SET ativo = false WHERE id = $1 AND petshop_id = $2 RETURNING id, nome',
      [id, tenantId],
    )
    return rows[0] ? { ...rows[0], ativo: false } : null
  })

export const reativar = ({ tenantId, usuarioId }, id) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      'UPDATE servico SET ativo = true WHERE id = $1 AND petshop_id = $2 RETURNING id',
      [id, tenantId],
    )
    return rows[0] ? { id, ativo: true } : null
  })

// =====================================================================
// Fornecedores (RF07)
// =====================================================================

const CAMPOS_FORNECEDOR = `f.id, f.nome, f.cnpj, f.contato, f.email::text AS email,
                           f.telefone, f.endereco, f.ativo`

const ORDENACAO_FORNECEDOR = { nome: 'f.nome', criado: 'f.criado_em' }

export function listarFornecedores({ tenantId }, { pagina, limite, offset, busca, ativo, ordenar, direcao }) {
  return withTransaction({ tenantId }, async (db) => {
    const f = criarFiltro()
    f.igual('f.petshop_id', tenantId).contemAlgum(['f.nome', 'f.cnpj', 'f.contato'], busca).booleano('f.ativo', ativo)

    const ord = montarOrdenacao({ ordenar, direcao }, ORDENACAO_FORNECEDOR, 'nome')
    const from = 'FROM fornecedor f'

    return listarPaginado(db, {
      totalSql: `SELECT count(*)::int AS total ${from} ${f.where()}`,
      // Quantos produtos dependem do fornecedor — evita inativar um
      // fornecedor ativo sem saber o impacto.
      dadosSql: `SELECT ${CAMPOS_FORNECEDOR},
                        (SELECT count(*)::int FROM produto p WHERE p.fornecedor_id = f.id AND p.ativo) AS "produtosAtivos"
                   ${from} ${f.where()} ORDER BY ${ord.sql} ${ord.direcao}`,
      params: f.parametros,
      pagina, limite, offset,
    })
  })
}

export const buscarFornecedor = ({ tenantId }, id, db) => {
  const executar = async (conn) => {
    const { rows } = await conn.query(
      `SELECT ${CAMPOS_FORNECEDOR} FROM fornecedor f WHERE f.id = $1 AND f.petshop_id = $2`,
      [id, tenantId],
    )
    return rows[0] ?? null
  }
  return db ? executar(db) : withTransaction({ tenantId }, executar)
}

export const criarFornecedor = ({ tenantId, usuarioId }, dados) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO fornecedor (petshop_id, nome, cnpj, contato, email, telefone, endereco)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [tenantId, dados.nome, dados.cnpj, dados.contato ?? null, dados.email ?? null,
       dados.telefone ?? null, dados.endereco ?? null],
    )
    return buscarFornecedor({ tenantId }, rows[0].id, db)
  })

export const atualizarFornecedor = ({ tenantId, usuarioId }, { id, ...dados }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE fornecedor
          SET nome     = COALESCE($3, nome),
              cnpj     = COALESCE($4, cnpj),
              contato  = COALESCE($5, contato),
              email    = COALESCE($6, email),
              telefone = COALESCE($7, telefone),
              endereco = COALESCE($8, endereco)
        WHERE id = $1 AND petshop_id = $2
        RETURNING id`,
      [id, tenantId, dados.nome ?? null, dados.cnpj ?? null, dados.contato ?? null,
       dados.email ?? null, dados.telefone ?? null, dados.endereco ?? null],
    )
    if (!rows[0]) return null
    return buscarFornecedor({ tenantId }, id, db)
  })

export const inativarFornecedor = ({ tenantId, usuarioId }, id) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      'UPDATE fornecedor SET ativo = false WHERE id = $1 AND petshop_id = $2 RETURNING id, nome',
      [id, tenantId],
    )
    return rows[0] ? { ...rows[0], ativo: false } : null
  })
