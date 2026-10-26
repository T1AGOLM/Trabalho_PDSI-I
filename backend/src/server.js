import express from 'express'
import compression from 'compression'
import cookieParser from 'cookie-parser'
import { config } from './config/env.js'
import { logger } from './observability/logger.js'
import { medirRequisicoes } from './observability/metrics.js'
import { routes } from './routes/index.js'
import { naoEncontrado, tratadorDeErros } from './middleware/errors.js'
import {
  cabecalhosSeguranca, corsRestrito, higienizarEntrada, idDaRequisicao, limiteGlobal, tempoLimite,
} from './middleware/security.js'
import { pool, closePool } from './db/pool.js'
import { iniciarAgendador, pararAgendador } from './jobs/agendador.js'

/**
 * Ponto de entrada da API.
 *
 * A ordem dos middlewares é a ordem de defesa:
 *
 *   1. identificação e métrica (todo o resto é rastreável);
 *   2. cabeçalhos de segurança e CORS restrito;
 *   3. compressão e parse do corpo (com limite);
 *   4. limpeza da entrada;
 *   5. timeout e limite de taxa;
 *   6. rotas → 404 → tratador de erros.
 *
 * Nada aqui contém regra de negócio: é a mesma separação em camadas do
 * projeto (routes → services → repositories → banco), agora com a
 * segurança HTTP explícita em um lugar só.
 */
const app = express()

// Atrás de proxy/balanceador, `req.ip` e `req.protocol` precisam confiar
// nos cabeçalhos X-Forwarded-* — com valor padrão 0 (confiança em ninguém).
app.set('trust proxy', config.http.trustProxy)
// `simple` impede `?a[b]=c` criar objeto aninhado na query (vetor clássico
// de poluição de protótipo e de confusão de parâmetros HTTP).
app.set('query parser', 'simple')
app.disable('x-powered-by')

app.use(idDaRequisicao)
app.use(medirRequisicoes)
app.use(cabecalhosSeguranca)
app.use(corsRestrito)
app.use(compression({ threshold: 1024 }))
app.use(express.json({ limit: config.http.bodyLimit }))
app.use(cookieParser())
app.use(higienizarEntrada)
app.use(tempoLimite())
app.use(limiteGlobal)

app.use('/api', routes)

app.use(naoEncontrado)
app.use(tratadorDeErros)

const server = app.listen(config.port, () => {
  logger.info({
    porta: config.port,
    ambiente: config.env,
    banco: `${config.db.host}:${config.db.port}/${config.db.database}`,
    usuarioBanco: config.db.user,
    cors: config.http.corsOrigins,
    rateLimit: config.rateLimit.enabled,
  }, `🐾 PetPlus API em http://localhost:${config.port} (docs em /api/docs)`)

  iniciarAgendador()
})

// ---------------------------------------------------------------------
// Encerramento limpo
// ---------------------------------------------------------------------

/** Para de aceitar conexões, espera o que está em voo e fecha o pool. */
async function encerrar(motivo) {
  logger.info({ motivo }, 'encerrando a API')
  pararAgendador()
  server.close(async () => {
    await closePool().catch(() => {})
    logger.info('API encerrada')
    process.exit(0)
  })
  // Se algo travar, não ficamos pendurados para sempre.
  setTimeout(() => process.exit(1), 10_000).unref()
}

for (const sinal of ['SIGINT', 'SIGTERM']) {
  process.on(sinal, () => encerrar(sinal))
}

// Falha não tratada: registrar com contexto e encerrar. Um processo em
// estado desconhecido servindo tráfego é pior do que um reinício.
process.on('unhandledRejection', (motivo) => {
  logger.fatal({ err: motivo }, 'promise rejeitada sem tratamento')
  encerrar('unhandledRejection')
})
process.on('uncaughtException', (err) => {
  logger.fatal({ err }, 'exceção não capturada')
  encerrar('uncaughtException')
})

export { app, server }
