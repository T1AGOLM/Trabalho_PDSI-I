import pg from 'pg'
import { config } from '../config/env.js'

const { Pool, types } = pg

/**
 * NUMERIC vem como string por padrão no node-postgres para não perder
 * precisão. O domínio do PetPlus só usa dinheiro com 2 casas, então
 * convertemos para number na fronteira — o backend robusto pode remover
 * isto e usar decimal.js quando precisar de precisão arbitrária.
 */
types.setTypeParser(types.builtins.NUMERIC, (v) => (v === null ? null : Number(v)))
// BIGINT (ids) também: todos os ids do PetPlus cabem em Number com folga.
types.setTypeParser(types.builtins.INT8, (v) => (v === null ? null : Number(v)))

export const pool = new Pool(config.db)

pool.on('error', (err) => {
  // Um cliente derrubado não pode derrubar o pool inteiro.
  console.error('[db] erro ocioso no pool:', err.message)
})

/**
 * Executa uma consulta no pool.
 * @param {string} text  SQL parametrizado ($1, $2, ...)
 * @param {any[]}  params
 */
export const query = (text, params) => pool.query(text, params)

/**
 * Executa `fn` dentro de uma transação, já com o tenant e o usuário
 * da sessão definidos. Tudo que a camada de negócio fizer de escrita
 * deve passar por aqui:
 *
 *   - BEGIN
 *   - SET LOCAL app.petshop_id / app.usuario_id   (aciona as políticas RLS)
 *   - ...fn(client)...
 *   - COMMIT  (ou ROLLBACK em qualquer erro)
 *
 * `SET LOCAL` garante que o valor desapareça no fim da transação, então
 * uma conexão devolvida ao pool nunca "vaza" o tenant anterior.
 */
export async function withTransaction({ tenantId, usuarioId }, fn) {
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

export const closePool = () => pool.end()