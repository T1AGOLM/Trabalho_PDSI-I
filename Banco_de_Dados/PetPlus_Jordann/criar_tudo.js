require('dotenv').config();
const fs = require('fs');
const { Pool } = require('pg');
const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME
});
async function rodar(){
  const sql = fs.readFileSync('tabelas.sql','utf8');
  await pool.query(sql);
  console.log('TUDO CRIADO! 4 tabelas + 5 serviços');
  const t = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public'");
  console.log(t.rows);
  process.exit();
}
rodar();