import { withTransaction } from '../db/pool.js'
import { criarFiltro } from '../db/filtros.js'
import { listarPaginado } from '../db/consultas.js'
import { montarOrdenacao } from '../http/paginacao.js'

/**
 * Repositório de clientes (tutores) — RF01/RF02/RF03/RF20.
 *
 * `cliente` é especialização de `usuario`: nome, e-mail, telefone e a
 * flag `ativo` vivem em `usuario`; endereço, CPF e pontos em `cliente`.
 * As duas tabelas são sempre escritas na mesma transação, porque a FK
 * composta `cliente_petshop_dono` exige que pertençam ao mesmo tenant.
 */

const CAMPOS = `
  u.id, u.nome, u.email::text AS email, u.telefone,
  u.ativo, u.consent_lgpd AS "consentLgpd",
  to_char(u.consent_em, 'YYYY-MM-DD') AS "consentEm",
  to_char(u.criado_em, 'YYYY-MM-DD') AS "criadoEm",
  c.endereco, c.cpf, c.pontos_fidelidade AS "pontosFidelidade"`

const ORDENACAO = {
  nome: 'u.nome',
  email: 'u.email',
  pontos: 'c.pontos_fidelidade',
  criado: 'u.criado_em',
}

/** Lista paginada, com busca por nome/e-mail/telefone e filtro de status. */
export function listar({ tenantId }, { pagina, limite, offset, busca, ativo, ordenar, direcao }) {
  return withTransaction({ tenantId }, async (db) => {
    const f = criarFiltro()
    f.igual('c.petshop_id', tenantId)
      .contemAlgum(['u.nome', 'u.email::text', 'u.telefone'], busca)
      .booleano('u.ativo', ativo)

    const ord = montarOrdenacao({ ordenar, direcao }, ORDENACAO, 'nome')
    const parametros = f.parametros

    return listarPaginado(db, {
      totalSql: `SELECT count(*)::int AS total
                   FROM cliente c JOIN usuario u ON u.id = c.usuario_id
                   ${f.where()}`,
      // Os pets vêm agregados em JSON: uma consulta devolve a linha pronta
      // para a tela, sem N+1 (o protótipo mostrava os pets na listagem).
      dadosSql: `SELECT ${CAMPOS},
                        COALESCE((
                          SELECT jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'ativo', p.ativo) ORDER BY p.nome)
                            FROM pet p WHERE p.cliente_id = c.usuario_id AND p.ativo
                        ), '[]'::jsonb) AS pets
                   FROM cliente c
                   JOIN usuario u ON u.id = c.usuario_id
                   ${f.where()}
                  ORDER BY ${ord.sql} ${ord.direcao}`,
      params: parametros,
      pagina, limite, offset,
    })
  })
}

/**
 * Ficha completa de um tutor (o detalhe usado na tela de Clientes).
 *
 * Aceita um `db` opcional (uma conexão já dentro de transação): quem acaba
 * de ESCREVER precisa reler pela MESMA conexão, senão a leitura não vê o
 * que ainda não foi commitado.
 */
export function buscarPorId({ tenantId }, id, db) {
  const executar = async (conn) => {
    const { rows } = await conn.query(
      `SELECT ${CAMPOS},
              (SELECT jsonb_agg(jsonb_build_object(
                        'id', p.id, 'nome', p.nome, 'especie', p.especie, 'raca', p.raca,
                        'porte', p.porte, 'idade', p.idade,
                        'observacoesSaude', p.observacoes_saude, 'ativo', p.ativo) ORDER BY p.nome)
                 FROM pet p WHERE p.cliente_id = c.usuario_id) AS pets
         FROM cliente c
         JOIN usuario u ON u.id = c.usuario_id
        WHERE c.usuario_id = $1 AND c.petshop_id = $2`,
      [id, tenantId],
    )
    return rows[0] ?? null
  }
  return db ? executar(db) : withTransaction({ tenantId }, executar)
}

/**
 * Cadastra tutor e, opcionalmente, o primeiro pet (RF01/RF02).
 * `senhaHash` chega pronto da camada de serviço — a senha em claro nunca
 * desce para cá.
 */
export function criar({ tenantId }, { nome, email, telefone, cpf, endereco, senhaHash, consentimento = true, pet }) {
  return withTransaction({ tenantId }, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO usuario (petshop_id, perfil, nome, email, telefone, senha_hash, consent_lgpd, consent_em)
       VALUES ($1, 'CLIENTE', $2, $3, $4, $5, $6, CASE WHEN $6 THEN now() END)
       RETURNING id`,
      [tenantId, nome, email, telefone ?? null, senhaHash, Boolean(consentimento)],
    )
    const clienteId = rows[0].id

    await db.query(
      `INSERT INTO cliente (usuario_id, petshop_id, cpf, endereco, pontos_fidelidade)
       VALUES ($1, $2, $3, $4, 0)`,
      [clienteId, tenantId, cpf ?? null, endereco ?? null],
    )

    if (pet?.nome) {
      await db.query(
        `INSERT INTO pet (petshop_id, cliente_id, nome, especie, raca, porte, idade, data_nascimento, observacoes_saude)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [tenantId, clienteId, pet.nome, pet.especie ?? 'Cachorro', pet.raca ?? null,
         pet.porte ?? null, pet.idade ?? null, pet.dataNascimento ?? null, pet.observacoesSaude ?? null],
      )
    }

    return buscarPorId({ tenantId }, clienteId, db)
  })
}

/** Atualiza dados do tutor (RF01). Campos ausentes ficam como estavam. */
export function atualizar({ tenantId, usuarioId }, { id, ...dados }) {
  return withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rowCount } = await db.query(
      `UPDATE usuario u
          SET nome      = COALESCE($3, u.nome),
              email     = COALESCE($4, u.email),
              telefone  = COALESCE($5, u.telefone),
              consent_lgpd = COALESCE($6, u.consent_lgpd),
              consent_em   = CASE WHEN $6 IS TRUE AND u.consent_em IS NULL THEN now() ELSE u.consent_em END
        WHERE u.id = $1 AND u.petshop_id = $2 AND u.perfil = 'CLIENTE'`,
      [id, tenantId, dados.nome ?? null, dados.email ?? null, dados.telefone ?? null,
       dados.consentLgpd ?? null],
    )
    if (rowCount === 0) return null

    await db.query(
      `UPDATE cliente
          SET endereco = COALESCE($3, endereco),
              cpf      = COALESCE($4, cpf)
        WHERE usuario_id = $1 AND petshop_id = $2`,
      [id, tenantId, dados.endereco ?? null, dados.cpf ?? null],
    )
    return buscarPorId({ tenantId }, id, db)
  })
}

/**
 * Exclusão lógica do tutor (RF03/RN03) e dos seus pets.
 * O histórico (agendamentos, vendas, saúde) permanece — é o que mantém o
 * relatório do petshop correto depois que um cadastro sai de cena.
 */
export function inativar({ tenantId, usuarioId }, id) {
  return withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE usuario SET ativo = false
        WHERE id = $1 AND petshop_id = $2 AND perfil = 'CLIENTE'
        RETURNING id, nome`,
      [id, tenantId],
    )
    if (!rows[0]) return null
    await db.query('UPDATE pet SET ativo = false WHERE cliente_id = $1 AND petshop_id = $2', [id, tenantId])
    return { id: rows[0].id, nome: rows[0].nome, ativo: false }
  })
}

/** Reativa o cadastro (desfaz uma inativação por engano). */
export function reativar({ tenantId, usuarioId }, id) {
  return withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE usuario SET ativo = true
        WHERE id = $1 AND petshop_id = $2 AND perfil = 'CLIENTE'
        RETURNING id`,
      [id, tenantId],
    )
    if (!rows[0]) return null
    await db.query('UPDATE pet SET ativo = true WHERE cliente_id = $1 AND petshop_id = $2', [id, tenantId])
    return { id, ativo: true }
  })
}

// ---------------------------------------------------------------------
// Fidelidade (RF20 / RN07)
// ---------------------------------------------------------------------

/** Saldo e extrato de pontos do tutor. */
export function fidelidade({ tenantId }, clienteId) {
  return withTransaction({ tenantId }, async (db) => {
    const [saldo, extrato] = await Promise.all([
      db.query('SELECT pontos_fidelidade AS saldo FROM cliente WHERE usuario_id = $1 AND petshop_id = $2', [clienteId, tenantId]),
      db.query(
        `SELECT m.id, m.tipo::text, m.pontos, m.descricao,
                petplus_data_hora_local(m.data_hora, ps.timezone) AS "dataHora",
                m.venda_id AS "vendaId"
           FROM fidelidade_movimentacao m
           JOIN petshop ps ON ps.id = m.petshop_id
          WHERE m.cliente_id = $1 AND m.petshop_id = $2
          ORDER BY m.data_hora DESC
          LIMIT 100`,
        [clienteId, tenantId],
      ),
    ])
    if (saldo.rows.length === 0) return null
    return { clienteId, saldo: saldo.rows[0].saldo, extrato: extrato.rows }
  })
}

/**
 * Movimenta pontos. O gatilho `fn_movimentar_pontos` atualiza o saldo e
 * recusa saldo negativo (RN07) — a validação de negócio é do banco; aqui
 * só se registra a intenção.
 */
export function movimentarPontos({ tenantId, usuarioId }, { clienteId, tipo, pontos, descricao, vendaId }) {
  return withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO fidelidade_movimentacao (petshop_id, cliente_id, tipo, pontos, descricao, venda_id, usuario_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [tenantId, clienteId, tipo, pontos, descricao ?? '', vendaId ?? null, usuarioId ?? null],
    )
    const saldo = await db.query(
      'SELECT pontos_fidelidade AS saldo FROM cliente WHERE usuario_id = $1 AND petshop_id = $2',
      [clienteId, tenantId],
    )
    return { id: rows[0].id, saldo: saldo.rows[0].saldo }
  })
}
