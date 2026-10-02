require('dotenv').config();
const { Pool } = require('pg');

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME
});

async function cadastrar() {
  try {
    // 1. Cadastrar tutor
    const tutor = await pool.query(
      "INSERT INTO tutores (nome, telefone, email) VALUES ($1, $2, $3) RETURNING *",
      ['Jakeliny', '86999999999', 'jakeiny@teste.com']
    );
    console.log('Tutor cadastrado:', tutor.rows[0]);

    // 2. Cadastrar pet desse tutor
    const pet = await pool.query(
      "INSERT INTO pets (nome, especie, raca, idade, tutor_id) VALUES ($1, $2, $3, $4, $5) RETURNING *",
      ['Thor', 'Cachorro', 'Labrador', 3, tutor.rows[0].id]
    );
    console.log('Pet cadastrado:', pet.rows[0]);

    console.log('CADASTRO OK! Agora testa no navegador http://localhost:3000/tutores');
    process.exit();
  } catch (err) {
    console.error(err.message);
  }
}
cadastrar();