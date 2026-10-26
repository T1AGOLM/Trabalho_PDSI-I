import { pool } from '../db/pool.js'

/**
 * Métricas de aplicação (RNF17).
 *
 * Coleta em memória, sem agente externo: contadores de requisição por
 * rota/status, latência por percentil e estado do pool. É o mínimo para
 * responder "está lento?" e "está errando?" — e serve como fonte para
 * Prometheus/OpenTelemetry quando o projeto for para produção.
 *
 * O reservatório de latências guarda as últimas 1000 amostras: suficiente
 * para percentis estáveis sem crescer para sempre.
 */
const RESERVATORIO = 1000
const latencias = []
const contadores = new Map()
const inicio = Date.now()

const chave = (nome, rotulos) =>
  `${nome}${rotulos ? `{${Object.entries(rotulos).map(([k, v]) => `${k}="${v}"`).join(',')}}` : ''}`

export const incrementar = (nome, rotulos) => {
  const k = chave(nome, rotulos)
  contadores.set(k, (contadores.get(k) ?? 0) + 1)
}

const percentil = (p) => {
  if (latencias.length === 0) return 0
  const ordenadas = [...latencias].sort((a, b) => a - b)
  const indice = Math.min(ordenadas.length - 1, Math.floor((p / 100) * ordenadas.length))
  return Math.round(ordenadas[indice] * 100) / 100
}

/**
 * Middleware de coleta: mede a duração, conta por rota e por faixa de
 * status. A rota é rotulada pelo **padrão** (ex.: `/api/produtos/:id`),
 * nunca pelo id — sem isso o contador cresceria sem limite.
 */
export function medirRequisicoes(req, res, next) {
  const inicioReq = process.hrtime.bigint()
  res.on('finish', () => {
    const ms = Number(process.hrtime.bigint() - inicioReq) / 1e6
    latencias.push(ms)
    if (latencias.length > RESERVATORIO) latencias.shift()

    const padrao = req.route?.path ? `${req.baseUrl}${req.route.path}` : req.baseUrl || req.path
    incrementar('requisicoes_total', { rota: padrao, metodo: req.method })
    incrementar('respostas_total', { status: String(Math.floor(res.statusCode / 100)) + 'xx' })
    if (res.statusCode >= 500) incrementar('erros_5xx_total', { rota: padrao })
    if (res.statusCode === 401 || res.statusCode === 403) incrementar('acessos_negados_total', { rota: padrao })
    if (res.statusCode === 429) incrementar('limites_excedidos_total')
  })
  next()
}

/** Retrato instantâneo — é o corpo de GET /api/metrics. */
export function snapshot() {
  const memoria = process.memoryUsage()
  return {
    uptimeSegundos: Math.floor((Date.now() - inicio) / 1000),
    memoria: {
      rssMb: Math.round(memoria.rss / 1024 / 1024),
      heapUsadoMb: Math.round(memoria.heapUsed / 1024 / 1024),
    },
    latencia: {
      amostras: latencias.length,
      p50: percentil(50),
      p95: percentil(95),
      p99: percentil(99),
    },
    pool: {
      total: pool.totalCount,
      ociosas: pool.idleCount,
      aguardando: pool.waitingCount,
    },
    contadores: Object.fromEntries(contadores),
  }
}
