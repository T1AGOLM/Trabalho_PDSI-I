#!/usr/bin/env node
/**
 * Reseta o banco: derruba o schema e recria do zero.
 *
 *   npm run reset && npm run migrate && npm run seed
 */
import pg from 'pg'
import { config } from '../src/config/env.js'

const client = new pg.Client({ ...config.db, user: config.db.adminUser, password: config.db.adminPassword })
await client.connect()
await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;')
console.log('✓ schema public recriado do zero (rode "npm run migrate" em seguida)')
await client.end()