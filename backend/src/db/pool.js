import pg from 'pg'
import { config } from '../config/env.js'

const { Pool, types } = pg

/**
 * NUMERIC vem como string por padrão no node-postgres para não perder
 * precisão. O domínio do PetPlus só usa dinheiro com 2 casas, então
 * convertemos para number na fronteira — trocar por decimal.js quando
 * precisar de precisão arbitrária é mudar só este arquivo.
 */
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)))
// BIGINT (ids) também: todos os ids do PetPlus cabem em Number com folga.
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : Number(v)))

/**
 * Pool de conexões.
 *
 * `statement_timeout` é a primeira linha de defesa contra uma consulta
 * patológica (índice faltando, plano ruim): ela é interrompida no banco em
 * vez de segurar uma conexão do pool e escalar para indisponibilidade
 * (RNF01/RNF05). O `application_name` aparece em `pg_stat_activity`,
 * então dá para ver na hora quem está travando o quê.
 */
export const pool = new Pool({
  host: config.db.host,
  port: config.db.port,
  database: config.db.database,
  user: config.db.user,
  password: config.db.password,
  max: config.db.max,
  idleTimeoutMillis: config.db.idleTimeoutMillis,
  connectionTimeoutMillis: config.db.connectionTimeoutMillis,
  statement_timeout: config.db.statementTimeoutMs,
  query_timeout: config.db.statementTimeoutMs + 2_000,
  application_name: 'petplus-api',
})

pool.on('error', (err) => {
  // Um cliente derrubado não pode derrubar o pool inteiro.
  console.error('[db] erro ocioso no pool:', err.message)
})

/**
 * Consulta fora de transação. Use **somente** onde não existe tenant
 * conhecido (login, cadastro público) — para todo o resto existe
 * `withTransaction`, que liga as políticas de RLS.
 */
export const query = (text, params) => pool.query(text, params)

/** Igual a `query`, mas devolve a primeira linha (ou `null`). */
export async function queryOne(text, params) {
  const { rows } = await pool.query(text, params)
  return rows[0] ?? null
}

/**
 * Executa `fn` dentro de uma transação, já com o tenant e o usuário da
 * sessão definidos. Tudo que a camada de negócio fizer de escrita deve
 * passar por aqui:
 *
 *   - BEGIN
 *   - SET LOCAL app.petshop_id / app.usuario_id   (aciona as políticas RLS)
 *   - ...fn(client)...
 *   - COMMIT  (ou ROLLBACK em qualquer erro)
 *
 * `SET LOCAL` (via `set_config(..., true)`) garante que o valor desapareça
 * no fim da transação, então uma conexão devolvida ao pool nunca "vaza" o
 * tenant anterior.
 */
export async function withTransaction({ tenantId, usuarioId } = {}, fn) {
  const client = await pool.connect()
  try {
    await client.query('BEGIN')
    if (tenantId != null) {
      await client.query('SELECT set_config($1, $2, true)', ['app.petshop_id', String(tenantId)])
    }
    if (usuarioId != null) {
      await client.query('SELECT set_config($1, $2, true)', ['app.usuario_id', String(usuarioId)])
    }
    const result = await fn(client)
    await client.query('COMMIT')
    return result
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  } finally {
    client.release()
  }
}

/** Executa `fn` num cliente dedicado, sem abrir transação (uso em scripts). */
export const comCliente = async (fn) => {
  const client = await pool.connect()
  try {
    return await fn(client)
  } finally {
    client.release()
  }
}

export const closePool = () => pool.end()
