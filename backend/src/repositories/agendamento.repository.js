import { withTransaction } from '../db/pool.js'

/**
 * Repositório de agendamentos.
 *
 * O banco já recusa conflito de agenda (RN01), indisponibilidade (RN08) e
 * sobreposição de bloqueio (RN12) por constraint/trigger. Este repositório
 * apenas escreve e deixa o banco decidir — duplicar essas regras em JS
 * seria criar duas fontes de verdade para a mesma regra.
 */

export const listar = (tenantId) =>
  withTransaction({ tenantId }, (db) =>
    db.query(`
      SELECT a.id, a.pet_id AS "petId", a.cliente_id AS "clienteId",
             a.colaborador_id AS "colaboradorId", a.servico_id AS "servicoId",
             petplus_data_hora_local(a.data_hora, ps.timezone) AS "dataHora",
             a.status::text
        FROM agendamento a
        JOIN petshop ps ON ps.id = a.petshop_id
       WHERE a.petshop_id = $1
       ORDER BY a.data_hora`, [tenantId]),
  )

/**
 * Cria um agendamento (RF04).
 *
 * `dataHora` é o texto local 'YYYY-MM-DD"T"HH24:MI'. O fim do atendimento
 * é calculado aqui a partir da duração do serviço — é o que o EXCLUDE de
 * RN01 compara.
 */
export const criar = ({ tenantId, usuarioId }, dados) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows: servico } = await db.query(
      'SELECT id, duracao, preco FROM servico WHERE id = $1 AND petshop_id = $2',
      [dados.servicoId, tenantId],
    )
    if (!servico[0]) {
      const err = new Error('Serviço não encontrado nesta unidade.')
      err.status = 422
      throw err
    }

    // `cliente_id` NÃO vem da requisição: é preenchido pelo próprio banco a
    // partir do pet. Assim a coerência tutor × pet é garantida pela FK
    // composta `agendamento_pet_e_cliente_coerentes`, e o cliente nem
    // consegue "plantar" uma venda na conta de outro tutor.
    const { rows: criado } = await db.query(
      `INSERT INTO agendamento
         (petshop_id, pet_id, cliente_id, colaborador_id, servico_id,
          data_hora, data_hora_fim, status, valor, criado_por)
       SELECT $1, p.id, p.cliente_id, $2, $3,
              petplus_para_ts($4, ps.timezone),
              petplus_para_ts($4, ps.timezone) + make_interval(mins => $5),
              'confirmado', $6, $7
         FROM pet p
         JOIN petshop ps ON ps.id = $1
        WHERE p.id = $8 AND p.ativo
        RETURNING id`,
      [tenantId, dados.colaboradorId, servico[0].id, dados.dataHora,
       servico[0].duracao, servico[0].preco, usuarioId, dados.petId],
    )

    if (!criado[0]) {
      const err = new Error('Pet não encontrado ou inativo nesta unidade.')
      err.status = 422
      throw err
    }
    return criado[0]
  })

export const remarcar = ({ tenantId, usuarioId }, { id, dataHora }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE agendamento a
          SET data_hora     = petplus_para_ts($3, ps.timezone),
              data_hora_fim = petplus_para_ts($3, ps.timezone)
                              + make_interval(mins => s.duracao),
              status        = 'confirmado',
              cancelado_em  = NULL,
              motivo_cancelamento = NULL
         FROM servico s, petshop ps
        WHERE a.id = $1 AND a.petshop_id = $2
          AND a.servico_id = s.id AND ps.id = a.petshop_id
        RETURNING a.id`,
      [id, tenantId, dataHora],
    )
    return rows[0]
  })

export const cancelar = ({ tenantId, usuarioId }, { id, motivo }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE agendamento
          SET status = 'cancelado',
              cancelado_em = now(),
              motivo_cancelamento = $3
        WHERE id = $1 AND petshop_id = $2
        RETURNING id`,
      [id, tenantId, motivo ?? null],
    )
    return rows[0]
  })

export const concluir = ({ tenantId, usuarioId }, id) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE agendamento SET status = 'concluído'
        WHERE id = $1 AND petshop_id = $2 AND status = 'confirmado'
        RETURNING id`,
      [id, tenantId],
    )
    return rows[0]
  })