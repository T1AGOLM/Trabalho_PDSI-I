#!/usr/bin/env node
/**
 * Runner de migrations.
 *
 * Aplica, em ordem alfabética, todos os arquivos .sql de
 * Banco_de_Dados/sql, registrando o que já rodou na tabela
 * `schema_migrations`. Cada arquivo roda dentro da sua própria
 * transação: ou entra inteiro, ou nada entra.
 *
 *   npm run migrate
 */
import { readdir, readFile } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import pg from 'pg'
import { config } from '../src/config/env.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const SQL_DIR = path.resolve(__dirname, '../../Banco_de_Dados/sql')

/** Migrations Aplicadas manualmente via console/psql, não pelo runner. */
const NAO_APLICAVEIS = new Set(['010_seed.sql'])

async function main() {
  const client = new pg.Client({ ...config.db, user: config.db.adminUser, password: config.db.adminPassword })
  await client.connect()

  console.log(`→ conectando em ${config.db.host}:${config.db.port}/${config.db.database} como ${config.db.adminUser}`)

  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      nome      VARCHAR(255) PRIMARY KEY,
      aplicado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `)

  const arquivos = (await readdir(SQL_DIR)).filter((f) => f.endsWith('.sql')).sort()
  const { rows } = await client.query('SELECT nome FROM schema_migrations')
  const aplicados = new Set(rows.map((r) => r.nome))

  for (const arquivo of arquivos) {
    if (aplicados.has(arquivo)) {
      console.log(`  = ${arquivo} (já aplicado)`)
      continue
    }
    if (NAO_APLICAVEIS.has(arquivo)) {
      console.log(`  · ${arquivo} (não é migration; use "npm run seed")`)
      continue
    }

    const sql = await readFile(path.join(SQL_DIR, arquivo), 'utf8')
    try {
      await client.query('BEGIN')
      await client.query(sql)
      await client.query('INSERT INTO schema_migrations (nome) VALUES ($1)', [arquivo])
      await client.query('COMMIT')
      console.log(`  ✓ ${arquivo}`)
    } catch (err) {
      await client.query('ROLLBACK').catch(() => {})
      console.error(`  ✗ ${arquivo}\n    ${err.message}`)
      throw err
    }
  }

  // Um resumo do que foi criado, útil para conferir rapidamente.
  const tabelas = await client.query(
    `SELECT table_name FROM information_schema.tables
      WHERE table_schema='public' AND table_type='BASE TABLE'
        AND table_name NOT IN ('schema_migrations')
      ORDER BY table_name`,
  )
  console.log(`\n✓ schema aplicado — ${tabelas.rowCount} tabelas`)
  console.log('  ' + tabelas.rows.map((t) => t.table_name).join(', '))

  await client.end()
}

main().catch((err) => {
  console.error('\nmigration falhou:', err.message)
  process.exit(1)
})