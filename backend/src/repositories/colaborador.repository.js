import { withTransaction } from '../db/pool.js'
import { criarFiltro } from '../db/filtros.js'
import { listarPaginado } from '../db/consultas.js'
import { montarOrdenacao } from '../http/paginacao.js'

/**
 * Repositório de colaboradores (RF16 / RF17 / RN08).
 *
 * A disponibilidade semanal é o insumo do gatilho `fn_validar_disponibilidade`:
 * é ela que o banco consulta para recusar um agendamento fora do horário
 * cadastrado. Por isso a gravação é "substituir o conjunto inteiro" em uma
 * transação — nunca se edita uma janela pela metade.
 */

const DIAS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']

/** Concatena a grade em texto legível ("Seg 08:00–18:00, Ter 08:00–18:00"). */
const DISPONIBILIDADE_TEXTO = `
  (SELECT string_agg(d.dia || ' ' || d.ini || '–' || d.fim, ', ' ORDER BY d.dia_semana)
     FROM (
       SELECT dc.colaborador_id, dc.dia_semana,
              initcap(to_char(dc.hora_inicio, 'HH24:MI')) AS ini,
              initcap(to_char(dc.hora_fim, 'HH24:MI'))    AS fim,
              CASE dc.dia_semana WHEN 0 THEN 'Dom' WHEN 1 THEN 'Seg' WHEN 2 THEN 'Ter'
                                 WHEN 3 THEN 'Qua' WHEN 4 THEN 'Qui' WHEN 5 THEN 'Sex'
                                 ELSE 'Sáb' END AS dia
         FROM disponibilidade_colaborador dc
     ) d
    WHERE d.colaborador_id = co.usuario_id)`

const DISPONIBILIDADE_JSON = `
  COALESCE((
    SELECT jsonb_agg(jsonb_build_object(
             'diaSemana', dc.dia_semana,
             'horaInicio', to_char(dc.hora_inicio, 'HH24:MI'),
             'horaFim', to_char(dc.hora_fim, 'HH24:MI')) ORDER BY dc.dia_semana)
      FROM disponibilidade_colaborador dc WHERE dc.colaborador_id = co.usuario_id
  ), '[]'::jsonb)`

const CAMPOS = `
  co.usuario_id AS id, u.nome, co.cargo::text, co.matricula,
  u.telefone, u.email::text AS email, u.ativo,
  ${DISPONIBILIDADE_TEXTO} AS disponibilidade,
  ${DISPONIBILIDADE_JSON} AS disponibilidades`

const ORDENACAO = { nome: 'u.nome', cargo: 'co.cargo', criado: 'u.criado_em' }

export function listar({ tenantId }, { pagina, limite, offset, busca, cargo, ativo, ordenar, direcao }) {
  return withTransaction({ tenantId }, async (db) => {
    const f = criarFiltro()
    f.igual('co.petshop_id', tenantId)
      .igual('co.cargo', cargo)
      .contemAlgum(['u.nome', 'u.email::text', 'co.matricula'], busca)
      .booleano('u.ativo', ativo)

    const ord = montarOrdenacao({ ordenar, direcao }, ORDENACAO, 'nome')
    const from = 'FROM colaborador co JOIN usuario u ON u.id = co.usuario_id'

    return listarPaginado(db, {
      totalSql: `SELECT count(*)::int AS total ${from} ${f.where()}`,
      dadosSql: `SELECT ${CAMPOS} ${from} ${f.where()} ORDER BY ${ord.sql} ${ord.direcao}`,
      params: f.parametros,
      pagina, limite, offset,
    })
  })
}

/**
 * Vitrine mínima da equipe: id, nome, cargo e grade de horários.
 *
 * É o que o tutor precisa para escolher quem vai atender (RF04/RF05). Fica
 * separada de `listar` de propósito: a tela de gestão vê telefone e e-mail
 * da equipe, o tutor não (RNF11 — minimização de dados pessoais).
 */
export function profissionais({ tenantId }) {
  return withTransaction({ tenantId }, async (db) => {
    const { rows } = await db.query(
      `SELECT co.usuario_id AS id, u.nome, co.cargo::text, ${DISPONIBILIDADE_TEXTO} AS disponibilidade
         FROM colaborador co JOIN usuario u ON u.id = co.usuario_id
        WHERE co.petshop_id = $1 AND u.ativo AND co.cargo <> 'ATENDENTE'
        ORDER BY u.nome`,
      [tenantId],
    )
    return rows
  })
}

/** Aceita uma conexão já em transação (ver comentário em cliente.repository). */
export function buscarPorId({ tenantId }, id, db) {
  const executar = async (conn) => {
    const { rows } = await conn.query(
      `SELECT ${CAMPOS}
         FROM colaborador co JOIN usuario u ON u.id = co.usuario_id
        WHERE co.usuario_id = $1 AND co.petshop_id = $2`,
      [id, tenantId],
    )
    return rows[0] ?? null
  }
  return db ? executar(db) : withTransaction({ tenantId }, executar)
}

/** Cria o usuário (perfil COLABORADOR) e a especialização na mesma transação. */
export function criar({ tenantId, usuarioId }, { nome, email, telefone, senhaHash, cargo, matricula, disponibilidade }) {
  return withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO usuario (petshop_id, perfil, nome, email, telefone, senha_hash, consent_lgpd, consent_em)
       VALUES ($1, 'COLABORADOR', $2, $3, $4, $5, true, now())
       RETURNING id`,
      [tenantId, nome, email, telefone ?? null, senhaHash],
    )
    const novoId = rows[0].id

    await db.query(
      `INSERT INTO colaborador (usuario_id, petshop_id, cargo, matricula)
       VALUES ($1, $2, $3, $4)`,
      [novoId, tenantId, cargo, matricula ?? null],
    )

    if (Array.isArray(disponibilidade) && disponibilidade.length > 0) {
      await substituirDisponibilidade(db, tenantId, novoId, disponibilidade)
    }
    return buscarPorId({ tenantId }, novoId, db)
  })
}

export function atualizar({ tenantId, usuarioId }, { id, ...dados }) {
  return withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rowCount } = await db.query(
      `UPDATE usuario u
          SET nome = COALESCE($3, u.nome),
              email = COALESCE($4, u.email),
              telefone = COALESCE($5, u.telefone)
        WHERE u.id = $1 AND u.petshop_id = $2 AND u.perfil = 'COLABORADOR'`,
      [id, tenantId, dados.nome ?? null, dados.email ?? null, dados.telefone ?? null],
    )
    if (rowCount === 0) return null

    await db.query(
      `UPDATE colaborador
          SET cargo = COALESCE($3, cargo),
              matricula = COALESCE($4, matricula)
        WHERE usuario_id = $1 AND petshop_id = $2`,
      [id, tenantId, dados.cargo ?? null, dados.matricula ?? null],
    )
    return buscarPorId({ tenantId }, id, db)
  })
}

/** Inativação (RF03/RN03): a agenda passada fica, o acesso acaba. */
export function inativar({ tenantId, usuarioId }, id) {
  return withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE usuario SET ativo = false
        WHERE id = $1 AND petshop_id = $2 AND perfil = 'COLABORADOR'
        RETURNING id, nome`,
      [id, tenantId],
    )
    return rows[0] ? { ...rows[0], ativo: false } : null
  })
}

export function reativar({ tenantId, usuarioId }, id) {
  return withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE usuario SET ativo = true
        WHERE id = $1 AND petshop_id = $2 AND perfil = 'COLABORADOR' RETURNING id`,
      [id, tenantId],
    )
    return rows[0] ? { id, ativo: true } : null
  })
}

// ---------------------------------------------------------------------
// Disponibilidade (RN08)
// ---------------------------------------------------------------------

async function substituirDisponibilidade(db, tenantId, colaboradorId, janelas) {
  await db.query(
    'DELETE FROM disponibilidade_colaborador WHERE colaborador_id = $1 AND petshop_id = $2',
    [colaboradorId, tenantId],
  )
  for (const janela of janelas) {
    await db.query(
      `INSERT INTO disponibilidade_colaborador (petshop_id, colaborador_id, dia_semana, hora_inicio, hora_fim)
       VALUES ($1, $2, $3, $4, $5)`,
      [tenantId, colaboradorId, janela.diaSemana, janela.horaInicio, janela.horaFim],
    )
  }
}

export const definirDisponibilidade = ({ tenantId, usuarioId }, { id, janelas }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const existe = await db.query(
      'SELECT 1 FROM colaborador WHERE usuario_id = $1 AND petshop_id = $2',
      [id, tenantId],
    )
    if (existe.rowCount === 0) return null
    await substituirDisponibilidade(db, tenantId, id, janelas)
    return buscarPorId({ tenantId }, id, db)
  })

/** Grade semanal de um colaborador, em formato pronto para a tela. */
export const lerDisponibilidade = ({ tenantId }, id) =>
  withTransaction({ tenantId }, async (db) => {
    const { rows } = await db.query(
      `SELECT dia_semana AS "diaSemana",
              to_char(hora_inicio, 'HH24:MI') AS "horaInicio",
              to_char(hora_fim, 'HH24:MI')    AS "horaFim",
              (CASE dia_semana WHEN 0 THEN 'Domingo' WHEN 1 THEN 'Segunda' WHEN 2 THEN 'Terça'
                               WHEN 3 THEN 'Quarta' WHEN 4 THEN 'Quinta' WHEN 5 THEN 'Sexta'
                               ELSE 'Sábado' END) AS dia
         FROM disponibilidade_colaborador
        WHERE colaborador_id = $1 AND petshop_id = $2
        ORDER BY dia_semana`,
      [id, tenantId],
    )
    return rows
  })
