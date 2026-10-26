#!/usr/bin/env node
/**
 * Carrega os dados de demonstração (Banco_de_Dados/sql/010_seed.sql).
 *
 *   npm run seed
 *
 * Roda como usuário dono do schema e define o tenant antes de escrever,
 * porque as políticas RLS estão habilitadas com FORCE.
 *
 * `npm run reset` derruba o schema e o recria vazio; o seed usa
 * `ON CONFLICT (id) DO NOTHING`, então pode rodar sobre um banco que já tem
 * as mesmas tabelas. Nesses casos as sequences precisam estar no máximo
 * atual da base, senão os ids nova população entram em conflito. Assim,
 * `levantarSequences` puxa o máximo de cada tabela e reza a sequence antes
 * de rodar o SQL de demonstração.
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

/**
 * Levanta as sequences das tabelas do seed para o valor que elas estão
 * com base nos dados reais da base (e não no máximo esperado de um seed).
 * Retorna a lista de queries de setval prontas para executar.
 */
async function levantarSequences() {
  const { rows } = await client.query(
    `SELECT relname
     FROM pg_class c
     JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE c.relkind = 'r'
       AND relname IN ('petshop','usuario','pet','servico','agendamento','bloqueio_agenda','registro_saude','fornecedor','produto','venda','lote','pacote_servico','assinatura_pacote','avaliacao','notificacao','relatorio')
     ORDER BY 1`,
  )
  if (!rows.length) return []

  const queries = []
  for (const { relname: nome } of rows) {
    const { rows: [r] } = await client.query(
      `SELECT COALESCE(max(id), 0) AS mx FROM public."${nome}"`,
    )
    const mx = Math.max(Number(r.mx), 100)
    queries.push(
      `SELECT setval(pg_get_serial_sequence('public."${nome}"', 'id'), ${mx})`,
    )
  }
  return queries
}

try {
  await client.connect()
  const queries = await levantarSequences()
  if (queries.length) await client.query(queries.join('; '))

  const sql = await readFile(SEED_FILE, 'utf8')
  await client.query(sql)

  const { rows } = await client.query(`\n    SELECT 'clientes' t, count(*) n FROM cliente\n    UNION ALL SELECT 'pets',          count(*) FROM pet\n    UNION ALL SELECT 'colaboradores', count(*) FROM colaborador\n    UNION ALL SELECT 'servicos',      count(*) FROM servico\n    UNION ALL SELECT 'agendamentos',  count(*) FROM agendamento\n    UNION ALL SELECT 'produtos',      count(*) FROM produto\n    UNION ALL SELECT 'vendas',        count(*) FROM venda\n    UNION ALL SELECT 'itens_venda',   count(*) FROM item_venda\n    UNION ALL SELECT 'pagamentos',    count(*) FROM pagamento\n    UNION ALL SELECT 'avaliacoes',    count(*) FROM avaliacao\n    UNION ALL SELECT 'notificacoes',  count(*) FROM notificacao\n    ORDER BY 1\n  `)
  console.log('✓ seed aplicado:')
  for (const r of rows) console.log(`    ${r.t.padEnd(16)} ${r.n}`)
} catch (err) {
  console.error('✗ seed falhou:', err.message)
  process.exitCode = 1
} finally {
  await client.end().catch(() => {})
}
