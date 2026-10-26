import { withTransaction } from '../db/pool.js'
import { criarFiltro } from '../db/filtros.js'
import { listarPaginado } from '../db/consultas.js'

/**
 * Repositório de notificações (RF12 / RF13 / RF22).
 *
 * Escopo por perfil (RN10): o **cliente** só vê o que foi endereçado a
 * ele; gestor e colaborador acompanham a fila da unidade (é assim que a
 * operação enxerga "o que o sistema avisou aos tutores").
 */

const CAMPOS = `
  n.id, n.canal::text, n.tipo, n.destinatario, n.mensagem, n.lida,
  petplus_data_hora_local(n.data_envio, ps.timezone) AS "dataEnvio",
  petplus_data_hora_local(n.agendado_para, ps.timezone) AS "agendadoPara",
  petplus_data_hora_local(n.enviado_em, ps.timezone) AS "enviadoEm",
  n.tentativas, n.erro_envio AS "erroEnvio",
  n.agendamento_id AS "agendamentoId", n.registro_saude_id AS "registroSaudeId",
  (n.enviado_em IS NOT NULL) AS enviada`

export function listar(ctx, { pagina, limite, offset, lida, canal, tipo, busca, pendentes }) {
  return withTransaction(ctx, async (db) => {
    const f = criarFiltro()
    f.igual('n.petshop_id', ctx.tenantId)
      .igual('n.canal', canal)
      .igual('n.tipo', tipo)
      .contemAlgum(['n.mensagem', 'n.destinatario'], busca)
      .booleano('n.lida', lida)

    // Cliente só vê as próprias notificações (RN10).
    if (ctx.perfil === 'CLIENTE') f.igual('n.usuario_id', ctx.usuarioId)
    if (pendentes === true || pendentes === 'true') {
      f.sql('n.enviado_em IS NULL AND n.tentativas < 5')
    }

    const from = `FROM notificacao n
                  JOIN petshop ps ON ps.id = n.petshop_id`

    return listarPaginado(db, {
      totalSql: `SELECT count(*)::int AS total ${from} ${f.where()}`,
      dadosSql: `SELECT ${CAMPOS} ${from} ${f.where()} ORDER BY n.data_envio DESC, n.id DESC`,
      params: f.parametros,
      pagina, limite, offset,
    })
  })
}

/** Marca uma notificação como lida — só dentro do escopo do usuário. */
export const marcarLida = (ctx, id) =>
  withTransaction(ctx, async (db) => {
    const f = criarFiltro()
    f.igual('petshop_id', ctx.tenantId).igual('id', id)
    if (ctx.perfil === 'CLIENTE') f.igual('usuario_id', ctx.usuarioId)

    const { rows } = await db.query(
      `UPDATE notificacao SET lida = true ${f.where()} RETURNING id, lida`,
      f.parametros,
    )
    return rows[0] ?? null
  })

export const marcarTodasLidas = (ctx) =>
  withTransaction(ctx, async (db) => {
    const f = criarFiltro()
    f.igual('petshop_id', ctx.tenantId).booleano('lida', false)
    if (ctx.perfil === 'CLIENTE') f.igual('usuario_id', ctx.usuarioId)

    const { rowCount } = await db.query(`UPDATE notificacao SET lida = true ${f.where()}`, f.parametros)
    return { marcadas: rowCount }
  })

/** Contadores usados no sino da interface. */
export const contadores = (ctx) =>
  withTransaction(ctx, async (db) => {
    const f = criarFiltro()
    f.igual('petshop_id', ctx.tenantId)
    if (ctx.perfil === 'CLIENTE') f.igual('usuario_id', ctx.usuarioId)

    const { rows } = await db.query(
      `SELECT count(*) FILTER (WHERE NOT lida)::int AS "naoLidas",
              count(*)::int AS total,
              count(*) FILTER (WHERE enviado_em IS NULL AND tentativas < 5)::int AS pendentes,
              count(*) FILTER (WHERE erro_envio IS NOT NULL)::int AS falhas
         FROM notificacao ${f.where()}`,
      f.parametros,
    )
    return rows[0]
  })
