require('dotenv').config();
const express = require('express');
const path = require('path');
const { Pool } = require('pg');
const cors = require('cors');
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

const pool = new Pool({
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  database: process.env.DB_NAME
});

// lista as 20 tabelas
app.get('/tabelas', async (req,res)=>{
  const r = await pool.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' ORDER BY table_name");
  res.json(r.rows.map(x=>x.table_name));
});

// rota genérica para qualquer tabela
app.get('/api/:tabela', async (req,res)=>{
  try{
    const r = await pool.query(`SELECT * FROM ${req.params.tabela} LIMIT 100`);
    res.json(r.rows);
  }catch(e){ res.status(500).json({erro:e.message}) }
});

app.post('/api/:tabela', async (req,res)=>{
  try{
    const t = req.params.tabela;
    const dados = req.body;
    const colunas = Object.keys(dados).join(',');
    const valores = Object.values(dados);
    const params = valores.map((_,i)=>`$${i+1}`).join(',');
    const r = await pool.query(`INSERT INTO ${t} (${colunas}) VALUES (${params}) RETURNING *`, valores);
    res.json(r.rows[0]);
  }catch(e){ res.status(500).json({erro:e.message}) }
});

// rotas bonitas que seu HTML vai usar
app.get('/clientes', async (req,res)=>{
  const r = await pool.query('SELECT * FROM cliente ORDER BY id');
  res.json(r.rows);
});
app.get('/pets-com-tutor', async (req,res)=>{
  const r = await pool.query('SELECT pet.*, cliente.nome as tutor_nome FROM pet LEFT JOIN cliente ON pet.cliente_id = cliente.id ORDER BY pet.id');
  res.json(r.rows);
});

app.listen(3000, ()=> console.log('PetPlus 20 TABELAS OK em http://localhost:3000 - TOTAL 20'));