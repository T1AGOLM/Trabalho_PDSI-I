#!/usr/bin/env node
/**
 * Carrega os dados de demonstração (Banco_de_Dados/sql/010_seed.sql).
 *
 *   npm run seed
 *
 * Roda como usuário dono do schema e define o tenant antes de escrever,
 * porque as políticas RLS estão habilitadas com FORCE.
 */
import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { config } from '../src/config/env.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SEED_FILE = path.resolve(__dirname, '../../Banco_de_Dados/sql/010_seed.sql')

const client = new pg.Client({
  ...config.db,
  user: config.db.adminUser,
  password: config.db.adminPassword,
})

try {
  await client.connect()
  const sql = await readFile(SEED_FILE, 'utf8')
  await client.query(sql)

  const { rows } = await client.query(`
    SELECT 'clientes' t, count(*) n FROM cliente
    UNION ALL SELECT 'pets',          count(*) FROM pet
    UNION ALL SELECT 'colaboradores', count(*) FROM colaborador
    UNION ALL SELECT 'servicos',      count(*) FROM servico
    UNION ALL SELECT 'agendamentos',  count(*) FROM agendamento
    UNION ALL SELECT 'produtos',      count(*) FROM produto
    UNION ALL SELECT 'vendas',        count(*) FROM venda
    UNION ALL SELECT 'itens_venda',   count(*) FROM item_venda
    UNION ALL SELECT 'pagamentos',    count(*) FROM pagamento
    UNION ALL SELECT 'avaliacoes',    count(*) FROM avaliacao
    UNION ALL SELECT 'notificacoes',  count(*) FROM notificacao
    ORDER BY 1
  `)
  console.log('✓ seed aplicado:')
  for (const r of rows) console.log(`    ${r.t.padEnd(16)} ${r.n}`)
} catch (err) {
  console.error('✗ seed falhou:', err.message)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}