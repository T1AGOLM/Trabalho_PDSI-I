import { withTransaction } from '../db/pool.js'
import { criarFiltro } from '../db/filtros.js'
import { listarPaginado } from '../db/consultas.js'
import { montarOrdenacao } from '../http/paginacao.js'

/**
 * Repositório de pets (RF02/RF03/RF11/RF21).
 *
 * O pet pertence a um tutor do MESMO tenant: a FK composta
 * `pet_cliente_mesmo_petshop` garante isso no banco, não aqui.
 */

const CAMPOS = `
  p.id, p.cliente_id AS "clienteId", u.nome AS "clienteNome", u.telefone AS "clienteTelefone",
  p.nome, p.especie, p.raca, p.porte, p.idade,
  to_char(p.data_nascimento, 'YYYY-MM-DD') AS "dataNascimento",
  p.observacoes_saude AS "observacoesSaude",
  p.ativo,
  to_char(p.criado_em, 'YYYY-MM-DD') AS "criadoEm"`

const ORDENACAO = { nome: 'p.nome', tutor: 'u.nome', criado: 'p.criado_em' }

export function listar({ tenantId }, { pagina, limite, offset, busca, clienteId, ativo, ordenar, direcao }) {
  return withTransaction({ tenantId }, async (db) => {
    const f = criarFiltro()
    f.igual('p.petshop_id', tenantId)
      .igual('p.cliente_id', clienteId)
      .contemAlgum(['p.nome', 'p.raca', 'p.especie', 'u.nome'], busca)
      .booleano('p.ativo', ativo)

    const ord = montarOrdenacao({ ordenar, direcao }, ORDENACAO, 'nome')
    const from = 'FROM pet p JOIN usuario u ON u.id = p.cliente_id'

    return listarPaginado(db, {
      totalSql: `SELECT count(*)::int AS total ${from} ${f.where()}`,
      dadosSql: `SELECT ${CAMPOS} ${from} ${f.where()} ORDER BY ${ord.sql} ${ord.direcao}`,
      params: f.parametros,
      pagina, limite, offset,
    })
  })
}

/** Aceita uma conexão já em transação (ver comentário em cliente.repository). */
export function buscarPorId({ tenantId }, id, db) {
  const executar = async (conn) => {
    const { rows } = await conn.query(
      `SELECT ${CAMPOS}
         FROM pet p JOIN usuario u ON u.id = p.cliente_id
        WHERE p.id = $1 AND p.petshop_id = $2`,
      [id, tenantId],
    )
    return rows[0] ?? null
  }
  return db ? executar(db) : withTransaction({ tenantId }, executar)
}

export function criar({ tenantId, usuarioId }, dados) {
  return withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO pet (petshop_id, cliente_id, nome, especie, raca, porte, idade, data_nascimento, observacoes_saude)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING id`,
      [tenantId, dados.clienteId, dados.nome, dados.especie ?? 'Cachorro', dados.raca ?? null,
       dados.porte ?? null, dados.idade ?? null, dados.dataNascimento ?? null, dados.observacoesSaude ?? null],
    )
    return buscarPorId({ tenantId }, rows[0].id, db)
  })
}

export function atualizar({ tenantId, usuarioId }, { id, ...dados }) {
  return withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE pet
          SET nome             = COALESCE($3, nome),
              especie          = COALESCE($4, especie),
              raca             = COALESCE($5, raca),
              porte            = COALESCE($6, porte),
              idade            = COALESCE($7, idade),
              data_nascimento  = COALESCE($8, data_nascimento),
              observacoes_saude = COALESCE($9, observacoes_saude)
        WHERE id = $1 AND petshop_id = $2
        RETURNING id`,
      [id, tenantId, dados.nome ?? null, dados.especie ?? null, dados.raca ?? null,
       dados.porte ?? null, dados.idade ?? null, dados.dataNascimento ?? null,
       dados.observacoesSaude ?? null],
    )
    if (!rows[0]) return null
    return buscarPorId({ tenantId }, id, db)
  })
}

/** Exclusão lógica (RF03): o pet sai das listagens, o histórico fica. */
export function inativar({ tenantId, usuarioId }, id) {
  return withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      'UPDATE pet SET ativo = false WHERE id = $1 AND petshop_id = $2 RETURNING id, nome',
      [id, tenantId],
    )
    return rows[0] ? { ...rows[0], ativo: false } : null
  })
}

export function reativar({ tenantId, usuarioId }, id) {
  return withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      'UPDATE pet SET ativo = true WHERE id = $1 AND petshop_id = $2 RETURNING id',
      [id, tenantId],
    )
    return rows[0] ? { id, ativo: true } : null
  })
}

/**
 * Linha do tempo de saúde (RF11 / RF21).
 *
 * Junta os registros clínicos (vacina, atendimento, banho, observação) com
 * os agendamentos já concluídos — a mesma visão que o tutor acompanha
 * online e que o colaborador consulta no balcão.
 */
export function historico({ tenantId }, petId, { limite = 200 } = {}) {
  return withTransaction({ tenantId }, async (db) => {
    const pet = await buscarPorId({ tenantId }, petId, db)
    if (!pet) return null

    const [registros, atendimentos] = await Promise.all([
      db.query(
        `SELECT r.id, r.tipo::text, to_char(r.data, 'YYYY-MM-DD') AS data,
                r.descricao, to_char(r.proximo_vencimento, 'YYYY-MM-DD') AS "proximoVencimento",
                (r.proximo_vencimento - CURRENT_DATE) AS "diasParaVencer",
                'registro' AS origem
           FROM registro_saude r
          WHERE r.pet_id = $1 AND r.petshop_id = $2
          ORDER BY r.data DESC, r.id DESC
          LIMIT $3`,
        [petId, tenantId, limite],
      ),
      db.query(
        `SELECT a.id, 'atendimento' AS tipo,
                petplus_data_hora_local(a.data_hora, ps.timezone) AS "dataHora",
                to_char(a.data_hora AT TIME ZONE ps.timezone, 'YYYY-MM-DD') AS data,
                s.nome AS servico, uco.nome AS profissional, a.valor,
                a.status::text, 'agendamento' AS origem
           FROM agendamento a
           JOIN petshop ps  ON ps.id = a.petshop_id
           JOIN servico s   ON s.id = a.servico_id
           JOIN colaborador co ON co.usuario_id = a.colaborador_id
           JOIN usuario uco ON uco.id = co.usuario_id
          WHERE a.pet_id = $1 AND a.petshop_id = $2
          ORDER BY a.data_hora DESC
          LIMIT $3`,
        [petId, tenantId, limite],
      ),
    ])

    // Ordenação cronológica decrescente do conjunto (RF11: "linha do tempo").
    const linhaDoTempo = [
      ...registros.rows.map((r) => ({ ...r, chave: `${r.data}T00:00` })),
      ...atendimentos.rows.map((a) => ({ ...a, chave: a.dataHora ?? a.data })),
    ].sort((a, b) => (a.chave < b.chave ? 1 : -1))

    return { pet, linhaDoTempo }
  })
}
