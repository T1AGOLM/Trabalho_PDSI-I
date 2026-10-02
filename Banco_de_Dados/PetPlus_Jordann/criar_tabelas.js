require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME
});

const sql = `
CREATE TABLE IF NOT EXISTS tutores (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  telefone VARCHAR(20),
  email VARCHAR(100)
);

CREATE TABLE IF NOT EXISTS pets (
  id SERIAL PRIMARY KEY,
  nome VARCHAR(100) NOT NULL,
  especie VARCHAR(50) NOT NULL,
  raca VARCHAR(100),
  idade INT,
  tutor_id INT REFERENCES tutores(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS agendamentos (
  id SERIAL PRIMARY KEY,
  pet_id INT REFERENCES pets(id) ON DELETE CASCADE,
  servico VARCHAR(100) NOT NULL,
  data_hora TIMESTAMP NOT NULL,
  status VARCHAR(20) DEFAULT 'pendente'
);
`;

async function criar() {
  try {
    await pool.query(sql);
    console.log('Tabelas criadas com sucesso!');
    const tabelas = await pool.query("SELECT tablename FROM pg_tables WHERE schemaname='public'");
    console.log('Tabelas no banco:', tabelas.rows);
    process.exit();
  } catch (err) {
    console.error('Erro:', err.message);
  }
}
criar();