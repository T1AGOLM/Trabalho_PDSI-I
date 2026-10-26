import { withTransaction } from '../db/pool.js'
import { criarFiltro } from '../db/filtros.js'
import { listarPaginado } from '../db/consultas.js'
import { montarOrdenacao } from '../http/paginacao.js'

/**
 * Repositório do histórico de saúde (RF11 / RF13 / RF21).
 *
 * É a linha do tempo do pet: vacinas, atendimentos, banhos e observações
 * veterinárias. `proximo_vencimento` alimenta o alerta de vacina (RF13) e
 * a coluna `observacoes_saude` do pet (RF02) fica onde sempre esteve.
 */

const CAMPOS = `
  r.id, r.pet_id AS "petId", p.nome AS "petNome",
  p.cliente_id AS "clienteId", u.nome AS "clienteNome", -- o tutor é derivado do pet
  r.tipo::text, to_char(r.data, 'YYYY-MM-DD') AS data, r.descricao,
  to_char(r.proximo_vencimento, 'YYYY-MM-DD') AS "proximoVencimento",
  CASE WHEN r.proximo_vencimento IS NULL THEN NULL
       ELSE (r.proximo_vencimento - CURRENT_DATE) END AS "diasParaVencer"`

/** O tutor do pet é derivado (`p.cliente_id`), não informado pelo cliente. */
const FROM = `
  FROM registro_saude r
  JOIN pet p     ON p.id = r.pet_id
  JOIN usuario u ON u.id = p.cliente_id`

const ORDENACAO = { data: 'r.data', tipo: 'r.tipo', pet: 'p.nome' }

export function listar({ tenantId }, { pagina, limite, offset, petId, clienteId, tipo, de, ate, busca, ordenar, direcao }) {
  return withTransaction({ tenantId }, async (db) => {
    const f = criarFiltro()
    f.igual('r.petshop_id', tenantId)
      .igual('r.pet_id', petId)
      .igual('p.cliente_id', clienteId)
      .igual('r.tipo', tipo)
      .contemAlgum(['r.descricao', 'p.nome'], busca)
      .entre('r.data', de, ate)

    const ord = montarOrdenacao({ ordenar, direcao }, ORDENACAO, 'data')
    const direcaoFinal = ordenar ? ord.direcao : 'DESC'

    return listarPaginado(db, {
      totalSql: `SELECT count(*)::int AS total ${FROM} ${f.where()}`,
      dadosSql: `SELECT ${CAMPOS} ${FROM} ${f.where()} ORDER BY ${ord.sql} ${direcaoFinal}`,
      params: f.parametros,
      pagina, limite, offset,
    })
  })
}

/** Aceita uma conexão já em transação (ver comentário em cliente.repository). */
export const buscarPorId = ({ tenantId }, id, db) => {
  const executar = async (conn) => {
    const { rows } = await conn.query(`SELECT ${CAMPOS} ${FROM} WHERE r.id = $1 AND r.petshop_id = $2`, [id, tenantId])
    return rows[0] ?? null
  }
  return db ? executar(db) : withTransaction({ tenantId }, executar)
}

export const criar = ({ tenantId, usuarioId }, dados) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO registro_saude (petshop_id, pet_id, tipo, data, descricao, proximo_vencimento)
       VALUES ($1, $2, $3, COALESCE($4::date, CURRENT_DATE), $5, $6)
       RETURNING id`,
      [tenantId, dados.petId, dados.tipo, dados.data ?? null, dados.descricao, dados.proximoVencimento ?? null],
    )
    return buscarPorId({ tenantId }, rows[0].id, db)
  })

export const atualizar = ({ tenantId, usuarioId }, { id, ...dados }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE registro_saude
          SET tipo               = COALESCE($3, tipo),
              data               = COALESCE($4::date, data),
              descricao          = COALESCE($5, descricao),
              proximo_vencimento = COALESCE($6::date, proximo_vencimento)
        WHERE id = $1 AND petshop_id = $2
        RETURNING id`,
      [id, tenantId, dados.tipo ?? null, dados.data ?? null, dados.descricao ?? null,
       dados.proximoVencimento ?? null],
    )
    if (!rows[0]) return null
    return buscarPorId({ tenantId }, id, db)
  })

/** Remoção física: é dado clínico do pet, não um cadastro do petshop —
 *  mas só o gestor pode (RN03) e a operação fica na auditoria. */
export const remover = ({ tenantId, usuarioId }, id) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      'DELETE FROM registro_saude WHERE id = $1 AND petshop_id = $2 RETURNING id, descricao',
      [id, tenantId],
    )
    return rows[0] ?? null
  })

/** Vacinas a vencer na janela configurada (RF13/RF23 do lado do pet). */
export const vacinasAVencer = ({ tenantId }) =>
  withTransaction({ tenantId }, async (db) => {
    const { rows } = await db.query(
      `SELECT r.id, p.nome AS "petNome", u.nome AS "clienteNome", r.descricao,
              to_char(r.proximo_vencimento, 'YYYY-MM-DD') AS "proximoVencimento",
              (r.proximo_vencimento - CURRENT_DATE) AS "diasParaVencer"
         FROM registro_saude r
         JOIN petshop ps ON ps.id = r.petshop_id
         JOIN pet p      ON p.id  = r.pet_id
         JOIN usuario u  ON u.id  = p.cliente_id
        WHERE r.petshop_id = $1
          AND r.tipo = 'vacina'
          AND r.proximo_vencimento IS NOT NULL
          AND r.proximo_vencimento <= CURRENT_DATE + ps.antecedencia_validade_d
        ORDER BY r.proximo_vencimento`,
      [tenantId],
    )
    return rows
  })
