import { withTransaction } from '../db/pool.js'
import { criarFiltro } from '../db/filtros.js'
import { listarPaginado } from '../db/consultas.js'
import { montarOrdenacao } from '../http/paginacao.js'

/**
 * Repositório da agenda (RF04–RF06 / RF17 / RF30).
 *
 * O banco já recusa conflito de agenda (RN01), indisponibilidade (RN08),
 * bloqueio sobre agendamento confirmado (RN12) e cancelamento sem data
 * (CHECK). Este repositório apenas escreve e deixa o banco decidir —
 * duplicar essas regras em JS criaria duas fontes de verdade.
 */

/** Campos já "achatados" para a tela: nome do pet, do tutor, do serviço.
 *  Trazer tudo em uma consulta evita N+1 (o protótipo fazia lookups em
 *  memória; aqui o banco entrega a linha pronta). */
const CAMPOS = `
  a.id, a.pet_id AS "petId", p.nome AS "petNome", p.raca AS "petRaca", p.especie AS "petEspecie",
  p.idade AS "petIdade", p.observacoes_saude AS "petObservacoesSaude",
  a.cliente_id AS "clienteId", ucl.nome AS "clienteNome", ucl.telefone AS "clienteTelefone",
  ucl.email::text AS "clienteEmail",
  a.colaborador_id AS "colaboradorId", uco.nome AS "colaboradorNome", co.cargo::text AS "colaboradorCargo",
  a.servico_id AS "servicoId", s.nome AS "servicoNome", s.tipo::text AS "servicoTipo",
  s.duracao AS "servicoDuracao", s.preco AS "servicoPreco",
  petplus_data_hora_local(a.data_hora, ps.timezone)     AS "dataHora",
  petplus_data_hora_local(a.data_hora_fim, ps.timezone) AS "dataHoraFim",
  a.status::text, a.valor, a.observacoes,
  petplus_data_hora_local(a.cancelado_em, ps.timezone) AS "canceladoEm",
  a.motivo_cancelamento AS "motivoCancelamento",
  (a.data_hora < now()) AS passado`

const FROM = `
  FROM agendamento a
  JOIN petshop ps      ON ps.id = a.petshop_id
  JOIN pet p           ON p.id  = a.pet_id
  JOIN cliente cl      ON cl.usuario_id = a.cliente_id
  JOIN usuario ucl     ON ucl.id = cl.usuario_id
  JOIN colaborador co  ON co.usuario_id = a.colaborador_id
  JOIN usuario uco     ON uco.id = co.usuario_id
  JOIN servico s       ON s.id = a.servico_id`

const ORDENACAO = { data: 'a.data_hora', cliente: 'ucl.nome', status: 'a.status', valor: 'a.valor' }

export function listar({ tenantId }, { pagina, limite, offset, de, ate, status, colaboradorId,
  clienteId, petId, servicoId, busca, ordenar, direcao }) {
  return withTransaction({ tenantId }, async (db) => {
    const f = criarFiltro()
    f.igual('a.petshop_id', tenantId)
      .igual('a.colaborador_id', colaboradorId)
      .igual('a.cliente_id', clienteId)
      .igual('a.pet_id', petId)
      .igual('a.servico_id', servicoId)
      .igual('a.status', status)
      .contemAlgum(['p.nome', 'ucl.nome', 'uco.nome', 's.nome'], busca)
    // Filtro por período: `de`/`ate` são datas locais do petshop, então a
    // comparação é feita na data local (e não no instante do servidor).
    if (de) f.sql('(a.data_hora AT TIME ZONE ps.timezone)::date >= ?::date', de)
    if (ate) f.sql('(a.data_hora AT TIME ZONE ps.timezone)::date <= ?::date', ate)

    const ord = montarOrdenacao({ ordenar, direcao }, ORDENACAO, 'data')
    const direcaoFinal = ordenar ? ord.direcao : 'ASC'

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
    const { rows } = await conn.query(`SELECT ${CAMPOS} ${FROM} WHERE a.id = $1 AND a.petshop_id = $2`, [id, tenantId])
    return rows[0] ?? null
  }
  return db ? executar(db) : withTransaction({ tenantId }, executar)
}

/**
 * Cria um agendamento (RF04).
 *
 * `dataHora` é o texto local no formato 'YYYY-MM-DDTHH:MM'; o fim é
 * calculado a partir da duração do serviço — é o intervalo que a
 * constraint EXCLUDE de RN01 compara.
 *
 * `cliente_id` NÃO vem da requisição: é preenchido a partir do pet, então
 * a coerência tutor × pet é garantida pela FK composta
 * `agendamento_pet_e_cliente_coerentes` — o cliente não consegue agendar
 * um pet que não é dele nem "plantar" um atendimento na conta de outro.
 */
export const criar = ({ tenantId, usuarioId }, dados) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const servico = await db.query(
      'SELECT id, duracao, preco FROM servico WHERE id = $1 AND petshop_id = $2 AND ativo',
      [dados.servicoId, tenantId],
    )
    if (!servico.rows[0]) {
      throw Object.assign(new Error('Serviço não encontrado ou inativo nesta unidade.'), { status: 422 })
    }

    const { rows } = await db.query(
      `INSERT INTO agendamento
         (petshop_id, pet_id, cliente_id, colaborador_id, servico_id,
          data_hora, data_hora_fim, status, valor, observacoes, criado_por)
       SELECT $1, p.id, p.cliente_id, $2, $3,
              petplus_para_ts($4, ps.timezone),
              petplus_para_ts($4, ps.timezone) + make_interval(mins => $5),
              'confirmado', $6, $7, $8
         FROM pet p
         JOIN petshop ps ON ps.id = $1
        WHERE p.id = $9 AND p.petshop_id = $1 AND p.ativo
        RETURNING id`,
      [tenantId, dados.colaboradorId, servico.rows[0].id, dados.dataHora, servico.rows[0].duracao,
       dados.valor ?? servico.rows[0].preco, dados.observacoes ?? null, usuarioId, dados.petId],
    )
    if (!rows[0]) {
      throw Object.assign(new Error('Pet não encontrado ou inativo nesta unidade.'), { status: 422 })
    }
    return buscarPorId({ tenantId }, rows[0].id, db)
  })

export const remarcar = ({ tenantId, usuarioId }, { id, dataHora }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE agendamento a
          SET data_hora     = petplus_para_ts($3, ps.timezone),
              data_hora_fim = petplus_para_ts($3, ps.timezone) + make_interval(mins => s.duracao),
              status        = 'confirmado',
              cancelado_em  = NULL,
              motivo_cancelamento = NULL
         FROM servico s, petshop ps
        WHERE a.id = $1 AND a.petshop_id = $2
          AND a.servico_id = s.id AND ps.id = a.petshop_id
        RETURNING a.id`,
      [id, tenantId, dataHora],
    )
    if (!rows[0]) return null
    return buscarPorId({ tenantId }, id, db)
  })

/** Cancela e libera o horário (RN04). O motivo é obrigatório para a auditoria. */
export const cancelar = ({ tenantId, usuarioId }, { id, motivo }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE agendamento
          SET status = 'cancelado', cancelado_em = now(), motivo_cancelamento = $3
        WHERE id = $1 AND petshop_id = $2 AND status <> 'cancelado'
        RETURNING id`,
      [id, tenantId, motivo ?? 'Cancelado pelo sistema'],
    )
    if (!rows[0]) return null
    return buscarPorId({ tenantId }, id, db)
  })

/**
 * Conclui o atendimento (RF17) e credita os pontos de fidelidade do tutor
 * na mesma transação — a mesma regra do PDV (RF20).
 */
export const concluir = ({ tenantId, usuarioId }, id) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE agendamento SET status = 'concluído'
        WHERE id = $1 AND petshop_id = $2 AND status = 'confirmado'
        RETURNING id, cliente_id, valor`,
      [id, tenantId],
    )
    if (!rows[0]) return null

    const taxa = await db.query('SELECT pontos_por_real FROM petshop WHERE id = $1', [tenantId])
    const pontos = Math.floor(Number(rows[0].valor) * Number(taxa.rows[0]?.pontos_por_real ?? 0))
    if (pontos > 0) {
      const descricao = `Atendimento concluído #${id}`
      const jaCreditado = await db.query(
        `SELECT 1 FROM fidelidade_movimentacao
          WHERE cliente_id = $1 AND petshop_id = $2 AND descricao = $3`,
        [rows[0].cliente_id, tenantId, descricao],
      )
      if (jaCreditado.rowCount === 0) {
        await db.query(
          `INSERT INTO fidelidade_movimentacao (petshop_id, cliente_id, tipo, pontos, descricao, usuario_id)
           VALUES ($1, $2, 'credito', $3, $4, $5)`,
          [tenantId, rows[0].cliente_id, pontos, descricao, usuarioId],
        )
      }
    }
    return buscarPorId({ tenantId }, id, db)
  })

/** Agenda de um dia (usada pelo Dashboard e pela visão do colaborador). */
export const agendaDoDia = ({ tenantId }, data) =>
  withTransaction({ tenantId }, async (db) => {
    const { rows } = await db.query(
      `SELECT ${CAMPOS}
         ${FROM}
        WHERE a.petshop_id = $1
          AND (a.data_hora AT TIME ZONE ps.timezone)::date = $2::date
          AND a.status <> 'cancelado'
        ORDER BY a.data_hora`,
      [tenantId, data],
    )
    return rows
  })

// =====================================================================
// Bloqueios de agenda (RF30 / RN12)
// =====================================================================

const CAMPOS_BLOQUEIO = `
  b.id, b.colaborador_id AS "colaboradorId", u.nome AS "colaboradorNome",
  to_char(b.data_inicio, 'YYYY-MM-DD') AS "dataInicio",
  to_char(b.data_fim, 'YYYY-MM-DD')    AS "dataFim",
  b.motivo, to_char(b.data_inicio, 'DD/MM/YYYY') || ' a ' || to_char(b.data_fim, 'DD/MM/YYYY') AS periodo`

export function listarBloqueios({ tenantId }, { pagina, limite, offset, colaboradorId, de, ate, busca }) {
  return withTransaction({ tenantId }, async (db) => {
    const f = criarFiltro()
    f.igual('b.petshop_id', tenantId)
      .igual('b.colaborador_id', colaboradorId)
      .contemAlgum(['u.nome', 'b.motivo'], busca)
    // Intervalo: bloqueios que tocam a janela pedida.
    if (de) f.sql('b.data_fim >= ?::date', de)
    if (ate) f.sql('b.data_inicio <= ?::date', ate)

    const from = 'FROM bloqueio_agenda b JOIN usuario u ON u.id = b.colaborador_id'

    return listarPaginado(db, {
      totalSql: `SELECT count(*)::int AS total ${from} ${f.where()}`,
      dadosSql: `SELECT ${CAMPOS_BLOQUEIO} ${from} ${f.where()} ORDER BY b.data_inicio DESC`,
      params: f.parametros,
      pagina, limite, offset,
    })
  })
}

/** O gatilho `fn_validar_bloqueio` recusa sobreposição com agendamento confirmado (RN12). */
export const criarBloqueio = ({ tenantId, usuarioId }, dados) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO bloqueio_agenda (petshop_id, colaborador_id, data_inicio, data_fim, motivo)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id`,
      [tenantId, dados.colaboradorId, dados.dataInicio, dados.dataFim, dados.motivo],
    )
    const { rows: criado } = await db.query(
      `SELECT ${CAMPOS_BLOQUEIO} FROM bloqueio_agenda b JOIN usuario u ON u.id = b.colaborador_id WHERE b.id = $1`,
      [rows[0].id],
    )
    return criado[0]
  })

export const removerBloqueio = ({ tenantId, usuarioId }, id) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      'DELETE FROM bloqueio_agenda WHERE id = $1 AND petshop_id = $2 RETURNING id, motivo',
      [id, tenantId],
    )
    return rows[0] ?? null
  })

/**
 * Horários livres de um profissional em uma data (RF04/RF05: a tela sugere
 * só o que está realmente disponível).
 */
export const horariosLivres = ({ tenantId }, { colaboradorId, data, duracao = 60 }) =>
  withTransaction({ tenantId }, async (db) => {
    const { rows } = await db.query(
      `WITH params AS (
         SELECT $1::bigint AS colaborador_id, $2::date AS dia, $3::int AS duracao,
                (SELECT timezone FROM petshop WHERE id = $4) AS tz
       ),
       janela AS (
         SELECT gs AS inicio,
                gs + make_interval(mins => p.duracao) AS fim
           FROM params p
           JOIN disponibilidade_colaborador dc
             ON dc.colaborador_id = p.colaborador_id
            AND dc.dia_semana = EXTRACT(DOW FROM p.dia)::smallint
           CROSS JOIN LATERAL generate_series(
                  p.dia + dc.hora_inicio,
                  p.dia + dc.hora_fim - make_interval(mins => p.duracao),
                  interval '30 minutes') AS gs
       )
       SELECT to_char(j.inicio, 'HH24:MI') AS hora
         FROM janela j, params p
        WHERE NOT EXISTS (
                SELECT 1 FROM bloqueio_agenda b
                 WHERE b.colaborador_id = p.colaborador_id AND b.petshop_id = $4
                   AND p.dia BETWEEN b.data_inicio AND b.data_fim)
          AND NOT EXISTS (
                SELECT 1 FROM agendamento a
                 WHERE a.colaborador_id = p.colaborador_id AND a.petshop_id = $4
                   AND a.status <> 'cancelado'
                   AND tstzrange(a.data_hora, a.data_hora_fim, '[)')
                       && tstzrange((p.dia + j.inicio::time) AT TIME ZONE p.tz,
                                    (p.dia + j.fim::time)    AT TIME ZONE p.tz, '[)'))
        ORDER BY j.inicio`,
      [colaboradorId, data, duracao, tenantId],
    )
    return rows.map((r) => r.hora)
  })
