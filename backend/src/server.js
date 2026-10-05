import express from 'express'
import cors from 'cors'
import { config } from './config/env.js'
import { routes } from './routes/index.js'
import { naoEncontrado, tratadorDeErros } from './middleware/errors.js'
import { pool, closePool } from './db/pool.js'

/**
 * Ponto de entrada da API.
 *
 * A API é propositalmente fina: parse, autenticação, roteamento e
 * tratamento de erro. Regras de negócio moram nos serviços e SQL mora no
 * banco. É essa separação que permite substituir qualquer camada sem
 * quebrar as outras quando o backend robusto for construído.
 */
const app = express()

app.use(cors({ origin: config.cors.origin, credentials: true }))
app.use(express.json({ limit: '1mb' }))

// Health check — usado por deploy e por quem está esperando o banco subir.
app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1')
    res.json({ ok: true, banco: 'conectado', ambiente: config.env })
  } catch (err) {
    res.status(503).json({ ok: false, banco: 'indisponível', erro: err.message })
  }
})

app.use('/api', routes)

// 404 de rota desconhecida e tratador final de erros.
app.use(naoEncontrado)
app.use(tratadorDeErros)

const server = app.listen(config.port, () => {
  console.log(`🐾 PetPlus API em http://localhost:${config.port}`)
  console.log(`   banco: ${config.db.host}:${config.db.port}/${config.db.database} como ${config.db.user}`)
  console.log(`   CORS liberado para ${config.cors.origin}`)
})

// Encerramento limpo: fecha o servidor e o pool antes de sair.
for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, async () => {
    console.log(`\n${sinal} recebido, encerrando...`)
    server.close(async () => {
      await closePool()
      process.exit(0)
    })
  })
}