import { withTransaction } from '../db/pool.js'

/**
 * Repositório da unidade (tenant) — RF16 / RF14 / RN11.
 *
 * Aqui ficam as configurações que o gestor controla e que as regras do
 * banco usam como parâmetro: prazo de estorno (RN11), antecedência dos
 * lembretes (RF12), antecedência do alerta de validade (RN09) e a taxa de
 * pontos de fidelidade (RF20).
 */

const CAMPOS = `
  ps.id, ps.nome, ps.cnpj, ps.email::text AS email, ps.telefone, ps.endereco,
  ps.timezone, ps.prazo_estorno_dias AS "prazoEstornoDias",
  ps.antecedencia_lembrete_h AS "antecedenciaLembreteH",
  ps.antecedencia_validade_d AS "antecedenciaValidadeD",
  ps.pontos_por_real AS "pontosPorReal", ps.ativo,
  to_char(ps.criado_em, 'YYYY-MM-DD') AS "criadoEm"`

/** Aceita uma conexão já em transação (ver comentário em cliente.repository). */
export const obter = ({ tenantId }, db) => {
  const executar = async (conn) => {
    const { rows } = await conn.query(`SELECT ${CAMPOS} FROM petshop ps WHERE ps.id = $1`, [tenantId])
    return rows[0] ?? null
  }
  return db ? executar(db) : withTransaction({ tenantId }, executar)
}

export const atualizar = ({ tenantId, usuarioId }, dados) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE petshop
          SET nome                  = COALESCE($2, nome),
              email                 = COALESCE($3, email),
              telefone              = COALESCE($4, telefone),
              endereco              = COALESCE($5, endereco),
              prazo_estorno_dias    = COALESCE($6, prazo_estorno_dias),
              antecedencia_lembrete_h = COALESCE($7, antecedencia_lembrete_h),
              antecedencia_validade_d = COALESCE($8, antecedencia_validade_d),
              pontos_por_real       = COALESCE($9, pontos_por_real)
        WHERE id = $1
        RETURNING id`,
      [tenantId, dados.nome ?? null, dados.email ?? null, dados.telefone ?? null, dados.endereco ?? null,
       dados.prazoEstornoDias ?? null, dados.antecedenciaLembreteH ?? null,
       dados.antecedenciaValidadeD ?? null, dados.pontosPorReal ?? null],
    )
    if (!rows[0]) return null
    return obter({ tenantId }, db)
  })

/** Usuários da unidade (tela de Configurações / Colaboradores). */
export const usuarios = ({ tenantId }, { perfil } = {}) =>
  withTransaction({ tenantId }, async (db) => {
    const { rows } = await db.query(
      `SELECT u.id, u.nome, u.email::text AS email, u.telefone, u.perfil::text, u.ativo,
              petplus_data_hora_local(u.ultimo_acesso, ps.timezone) AS "ultimoAcesso"
         FROM usuario u
         JOIN petshop ps ON ps.id = u.petshop_id
        WHERE u.petshop_id = $1 AND ($2::text IS NULL OR u.perfil::text = $2)
        ORDER BY u.perfil, u.nome`,
      [tenantId, perfil ?? null],
    )
    return rows
  })
