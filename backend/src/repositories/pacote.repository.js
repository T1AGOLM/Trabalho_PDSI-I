import { withTransaction } from '../db/pool.js'
import { criarFiltro } from '../db/filtros.js'
import { listarPaginado } from '../db/consultas.js'

/**
 * Repositório de pacotes e avaliações (RF28 / RF29).
 *
 * Pacote (`pacote_servico`) é o plano; `assinatura_pacote` é a adesão de
 * um tutor e seu pet a esse plano. Os serviços incluídos vivem na tabela
 * de junção N:N (`pacote_servico_item`) e saem agregados em JSON.
 */

const SERVICOS_JSON = `
  COALESCE((SELECT jsonb_agg(jsonb_build_object('id', s.id, 'nome', s.nome) ORDER BY s.nome)
              FROM pacote_servico_item psi
              JOIN servico s ON s.id = psi.servico_id
             WHERE psi.pacote_id = pc.id), '[]'::jsonb)`

const CAMPOS_PACOTE = `
  pc.id, pc.nome, pc.periodicidade, pc.preco, pc.ativo,
  ${SERVICOS_JSON} AS servicos,
  COALESCE((SELECT array_agg(s.nome ORDER BY s.nome)
              FROM pacote_servico_item psi JOIN servico s ON s.id = psi.servico_id
             WHERE psi.pacote_id = pc.id), '{}') AS "servicosNomes",
  (SELECT count(*)::int FROM assinatura_pacote a
    WHERE a.pacote_id = pc.id AND a.status = 'ativo') AS "assinaturasAtivas"`

export const listarPacotes = ({ tenantId }, { pagina, limite, offset, busca, ativo }) =>
  withTransaction({ tenantId }, async (db) => {
    const f = criarFiltro()
    f.igual('pc.petshop_id', tenantId).contem('pc.nome', busca).booleano('pc.ativo', ativo)
    const from = 'FROM pacote_servico pc'
    return listarPaginado(db, {
      totalSql: `SELECT count(*)::int AS total ${from} ${f.where()}`,
      dadosSql: `SELECT ${CAMPOS_PACOTE} ${from} ${f.where()} ORDER BY pc.nome`,
      params: f.parametros,
      pagina, limite, offset,
    })
  })

export const criarPacote = ({ tenantId, usuarioId }, { nome, periodicidade, preco, servicoIds }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO pacote_servico (petshop_id, nome, periodicidade, preco)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [tenantId, nome, periodicidade, preco],
    )
    for (const servicoId of servicoIds ?? []) {
      await db.query(
        'INSERT INTO pacote_servico_item (pacote_id, servico_id, petshop_id) VALUES ($1, $2, $3)',
        [rows[0].id, servicoId, tenantId],
      )
    }
    return buscarPacote({ tenantId }, rows[0].id, db)
  })

/** Aceita uma conexão já em transação (ver comentário em cliente.repository). */
export const buscarPacote = ({ tenantId }, id, db) => {
  const executar = async (conn) => {
    const { rows } = await conn.query(
      `SELECT ${CAMPOS_PACOTE} FROM pacote_servico pc WHERE pc.id = $1 AND pc.petshop_id = $2`,
      [id, tenantId],
    )
    return rows[0] ?? null
  }
  return db ? executar(db) : withTransaction({ tenantId }, executar)
}

export const atualizarPacote = ({ tenantId, usuarioId }, { id, ...dados }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE pacote_servico
          SET nome          = COALESCE($3, nome),
              periodicidade = COALESCE($4, periodicidade),
              preco         = COALESCE($5, preco)
        WHERE id = $1 AND petshop_id = $2
        RETURNING id`,
      [id, tenantId, dados.nome ?? null, dados.periodicidade ?? null, dados.preco ?? null],
    )
    if (!rows[0]) return null

    // A lista de serviços, quando informada, substitui o conjunto inteiro.
    if (Array.isArray(dados.servicoIds)) {
      await db.query('DELETE FROM pacote_servico_item WHERE pacote_id = $1 AND petshop_id = $2', [id, tenantId])
      for (const servicoId of dados.servicoIds) {
        await db.query(
          'INSERT INTO pacote_servico_item (pacote_id, servico_id, petshop_id) VALUES ($1, $2, $3)',
          [id, servicoId, tenantId],
        )
      }
    }
    return buscarPacote({ tenantId }, id, db)
  })

export const inativarPacote = ({ tenantId, usuarioId }, id) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      'UPDATE pacote_servico SET ativo = false WHERE id = $1 AND petshop_id = $2 RETURNING id',
      [id, tenantId],
    )
    return rows[0] ? { id, ativo: false } : null
  })

// ---------------------------------------------------------------------
// Assinaturas (adesão de um tutor a um pacote)
// ---------------------------------------------------------------------

const CAMPOS_ASSINATURA = `
  a.id, a.pacote_id AS "pacoteId", pc.nome, pc.periodicidade, pc.preco,
  a.cliente_id AS "clienteId", u.nome AS "clienteNome",
  a.pet_id AS "petId", p.nome AS "petNome",
  a.status::text, to_char(a.iniciada_em, 'YYYY-MM-DD') AS "iniciadaEm",
  to_char(a.encerrada_em, 'YYYY-MM-DD') AS "encerradaEm",
  COALESCE((SELECT array_agg(s.nome ORDER BY s.nome)
              FROM pacote_servico_item psi JOIN servico s ON s.id = psi.servico_id
             WHERE psi.pacote_id = pc.id), '{}') AS servicos`

export const listarAssinaturas = ({ tenantId }, { pagina, limite, offset, clienteId, status, busca }) =>
  withTransaction({ tenantId }, async (db) => {
    const f = criarFiltro()
    f.igual('a.petshop_id', tenantId).igual('a.cliente_id', clienteId).igual('a.status', status)
      .contemAlgum(['u.nome', 'pc.nome', 'p.nome'], busca)

    const from = `FROM assinatura_pacote a
                  JOIN pacote_servico pc ON pc.id = a.pacote_id
                  JOIN usuario u ON u.id = a.cliente_id
                  JOIN pet p ON p.id = a.pet_id`

    return listarPaginado(db, {
      totalSql: `SELECT count(*)::int AS total ${from} ${f.where()}`,
      dadosSql: `SELECT ${CAMPOS_ASSINATURA} ${from} ${f.where()} ORDER BY a.iniciada_em DESC`,
      params: f.parametros,
      pagina, limite, offset,
    })
  })

export const criarAssinatura = ({ tenantId, usuarioId }, { pacoteId, clienteId, petId }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    // O pet precisa ser do tutor informado — a FK composta garante, mas a
    // checagem explícita devolve mensagem melhor do que um erro de FK.
    const pet = await db.query(
      'SELECT id FROM pet WHERE id = $1 AND cliente_id = $2 AND petshop_id = $3',
      [petId, clienteId, tenantId],
    )
    if (!pet.rows[0]) {
      throw Object.assign(new Error('O pet informado não pertence a este tutor.'), { status: 422 })
    }

    const { rows } = await db.query(
      `INSERT INTO assinatura_pacote (petshop_id, pacote_id, cliente_id, pet_id, status)
       VALUES ($1, $2, $3, $4, 'ativo')
       RETURNING id`,
      [tenantId, pacoteId, clienteId, petId],
    )
    const { rows: criada } = await db.query(
      `SELECT ${CAMPOS_ASSINATURA}
         FROM assinatura_pacote a
         JOIN pacote_servico pc ON pc.id = a.pacote_id
         JOIN usuario u ON u.id = a.cliente_id
         JOIN pet p ON p.id = a.pet_id
        WHERE a.id = $1`,
      [rows[0].id],
    )
    return criada[0]
  })

export const cancelarAssinatura = ({ tenantId, usuarioId }, id) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE assinatura_pacote
          SET status = 'cancelado', encerrada_em = now()
        WHERE id = $1 AND petshop_id = $2 AND status = 'ativo'
        RETURNING id`,
      [id, tenantId],
    )
    return rows[0] ? { id, status: 'cancelado' } : null
  })

// =====================================================================
// Avaliações (RF28)
// =====================================================================

const CAMPOS_AVALIACAO = `
  av.id, av.agendamento_id AS "agendamentoId",
  av.cliente_id AS "clienteId", u.nome AS "clienteNome",
  p.nome AS "petNome", s.nome AS "servicoNome",
  av.nota, av.comentario,
  petplus_data_hora_local(av.data, ps.timezone) AS data`

const FROM_AVALIACAO = `
  FROM avaliacao av
  JOIN petshop ps ON ps.id = av.petshop_id
  JOIN usuario u  ON u.id  = av.cliente_id
  JOIN agendamento a ON a.id = av.agendamento_id
  JOIN pet p      ON p.id  = a.pet_id
  JOIN servico s  ON s.id  = a.servico_id`

export function listarAvaliacoes({ tenantId }, { pagina, limite, offset, nota, de, ate, ordenar, direcao }) {
  return withTransaction({ tenantId }, async (db) => {
    const f = criarFiltro()
    f.igual('av.petshop_id', tenantId).igual('av.nota', nota).entre('av.data::date', de, ate)
    const ord = ordenar === 'nota'
      ? { sql: 'av.nota', direcao: (direcao ?? 'desc').toUpperCase() }
      : { sql: 'av.data', direcao: (direcao ?? 'desc').toUpperCase() }

    return listarPaginado(db, {
      totalSql: `SELECT count(*)::int AS total ${FROM_AVALIACAO} ${f.where()}`,
      dadosSql: `SELECT ${CAMPOS_AVALIACAO} ${FROM_AVALIACAO} ${f.where()} ORDER BY ${ord.sql} ${ord.direcao}`,
      params: f.parametros,
      pagina, limite, offset,
    })
  })
}

export const buscarAvaliacao = ({ tenantId }, id, db) => {
  const executar = async (conn) => {
    const { rows } = await conn.query(`SELECT ${CAMPOS_AVALIACAO} ${FROM_AVALIACAO} WHERE av.id = $1 AND av.petshop_id = $2`, [id, tenantId])
    return rows[0] ?? null
  }
  return db ? executar(db) : withTransaction({ tenantId }, executar)
}

/**
 * Registra a avaliação (RF28). Só o tutor do atendimento pode avaliar, e
 * apenas um atendimento concluído — as duas condições são verificadas
 * pelos vínculos (agendamento → cliente) e pelo status.
 */
export const criarAvaliacao = ({ tenantId, usuarioId }, { agendamentoId, nota, comentario }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows: agendamento } = await db.query(
      `SELECT id, cliente_id, status::text
         FROM agendamento
        WHERE id = $1 AND petshop_id = $2`,
      [agendamentoId, tenantId],
    )
    const alvo = agendamento[0]
    if (!alvo) throw Object.assign(new Error('Agendamento não encontrado.'), { status: 404 })
    if (alvo.cliente_id !== usuarioId) {
      throw Object.assign(new Error('Você só pode avaliar os seus próprios atendimentos.'), { status: 403 })
    }
    if (alvo.status !== 'concluído') {
      throw Object.assign(new Error('Só é possível avaliar um atendimento concluído.'), { status: 422 })
    }

    const jaAvaliado = await db.query('SELECT 1 FROM avaliacao WHERE agendamento_id = $1', [agendamentoId])
    if (jaAvaliado.rowCount > 0) {
      throw Object.assign(new Error('Este atendimento já foi avaliado.'), { status: 409 })
    }

    const { rows } = await db.query(
      `INSERT INTO avaliacao (petshop_id, agendamento_id, cliente_id, nota, comentario)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [tenantId, agendamentoId, alvo.cliente_id, nota, comentario ?? null],
    )
    return buscarAvaliacao({ tenantId }, rows[0].id, db)
  })

export const removerAvaliacao = ({ tenantId, usuarioId }, id) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      'DELETE FROM avaliacao WHERE id = $1 AND petshop_id = $2 RETURNING id',
      [id, tenantId],
    )
    return rows[0] ?? null
  })

/** Média e distribuição das notas (indicador do painel — RF15/RF28). */
export const resumoAvaliacoes = ({ tenantId }) =>
  withTransaction({ tenantId }, async (db) => {
    const { rows } = await db.query(
      `SELECT COALESCE(round(avg(nota)::numeric, 2), 0) AS media,
              count(*)::int AS total,
              count(*) FILTER (WHERE nota = 5)::int AS "cinco",
              count(*) FILTER (WHERE nota = 4)::int AS "quatro",
              count(*) FILTER (WHERE nota = 3)::int AS "tres",
              count(*) FILTER (WHERE nota = 2)::int AS "dois",
              count(*) FILTER (WHERE nota = 1)::int AS "um"
         FROM avaliacao WHERE petshop_id = $1`,
      [tenantId],
    )
    return rows[0]
  })
