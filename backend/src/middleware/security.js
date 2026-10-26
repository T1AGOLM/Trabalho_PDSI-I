import crypto from 'node:crypto'
import cors from 'cors'
import helmet from 'helmet'
import { ipKeyGenerator, rateLimit } from 'express-rate-limit'
import { config } from '../config/env.js'
import { logger } from '../observability/logger.js'

/**
 * Camada de segurança HTTP (RNF06). Reúne, em um só lugar, o que toda
 * requisição recebe antes de chegar a qualquer regra de negócio:
 * cabeçalhos, CORS, identificação, limite de taxa e higienização.
 */

// ---------------------------------------------------------------------
// Cabeçalhos de segurança
// ---------------------------------------------------------------------

const baseHelmet = {
  hidePoweredBy: true,
  crossOriginResourcePolicy: { policy: 'same-site' },
  frameguard: { action: 'deny' },
  referrerPolicy: { policy: 'no-referrer' },
  noSniff: true,
  // HSTS só faz sentido (e não atrapalha) sob HTTPS: em desenvolvimento,
  // fixar o navegador em https://localhost quebraria o Vite.
  ...(config.isProd ? { hsts: { maxAge: 15_552_000, includeSubDomains: true } } : { hsts: false }),
}

/** API: nada de script, estilo ou enquadramento — é uma API JSON. */
const helmetApi = helmet({
  ...baseHelmet,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'none'"],
      scriptSrc: ["'none'"],
      styleSrc: ["'none'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'none'"],
      formAction: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
})

/** Documentação (Swagger UI): precisa de script/estilo inline próprios. */
const helmetDocs = helmet({
  ...baseHelmet,
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'none'"],
      objectSrc: ["'none'"],
    },
  },
})

export const cabecalhosSeguranca = (req, res, next) =>
  (req.path.startsWith('/api/docs') ? helmetDocs : helmetApi)(req, res, next)

// ---------------------------------------------------------------------
// CORS com allowlist
// ---------------------------------------------------------------------

/**
 * Só as origens declaradas em `CORS_ORIGIN` recebem o cabeçalho. Requisição
 * sem `Origin` (curl, mesmo host, health check) continua passando — é o
 * comportamento correto e não abre nada: sem `Origin`, o navegador não pode
 * ler a resposta de outro domínio.
 */
export const corsRestrito = cors({
  origin(origem, cb) {
    if (!origem) return cb(null, true)
    if (config.http.corsOrigins.includes(origem)) return cb(null, true)
    logger.warn({ origem }, 'origem bloqueada pelo CORS')
    return cb(new Error('Origem não permitida pelo CORS.'))
  },
  credentials: true,
  methods: ['GET', 'POST', 'PATCH', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id'],
  exposedHeaders: ['X-Request-Id', 'RateLimit', 'RateLimit-Policy', 'Retry-After'],
  maxAge: 600,
})

// ---------------------------------------------------------------------
// Identificação da requisição (RNF17)
// ---------------------------------------------------------------------

/**
 * Um id por requisição, devolvido no cabeçalho e presente em todo log dela.
 * Se o cliente/proxy já mandou um `X-Request-Id`, respeitamos (permite
 * correlacionar a chamada de ponta a ponta), limitando o tamanho.
 */
export function idDaRequisicao(req, res, next) {
  const enviado = req.headers['x-request-id']
  req.id = typeof enviado === 'string' && enviado.length > 0 && enviado.length <= 64
    ? enviado
    : crypto.randomUUID()
  res.setHeader('X-Request-Id', req.id)
  next()
}

// ---------------------------------------------------------------------
// Timeout de requisição
// ---------------------------------------------------------------------

/**
 * Nenhuma requisição fica pendurada indefinidamente segurando uma conexão
 * do pool (RNF01/RNF05). O banco já tem `statement_timeout`; aqui a rede
 * também tem um teto.
 */
export function tempoLimite(ms = config.http.requestTimeoutMs) {
  return (req, res, next) => {
    const temporizador = setTimeout(() => {
      if (res.headersSent) return
      logger.warn({ reqId: req.id, rota: `${req.method} ${req.originalUrl}` }, 'requisição abortada por timeout')
      res.status(503).json({ erro: 'Tempo de resposta excedido. Tente novamente.', codigo: 'TIMEOUT' })
    }, ms)
    const encerrar = () => clearTimeout(temporizador)
    res.on('finish', encerrar)
    res.on('close', encerrar)
    next()
  }
}

// ---------------------------------------------------------------------
// Rate limiting
// ---------------------------------------------------------------------

/**
 * A chave é o IP (por subnet, no caso de IPv6, via `ipKeyGenerator`) —
 * ou o IP **mais** um identificador do corpo, quando existe, para que uma
 * tentativa de força bruta contra o mesmo e-mail não escape por trocar de
 * endereço, e para que vários usuários atrás do mesmo NAT não se derrubem.
 */
const chavePorIpE = (campo) => (req) => {
  const ip = ipKeyGenerator(req.ip)
  const identidade = String(req.body?.[campo] ?? '').trim().toLowerCase().slice(0, 120)
  return identidade ? `${ip}|${identidade}` : ip
}

const respostaLimite = (mensagem, codigo) => (req, res) => {
  res.status(429).json({ erro: mensagem, codigo })
}

/** Teto geral por IP — protege a API inteira de varredura/abuso. */
export const limiteGlobal = rateLimit({
  windowMs: 60_000,
  limit: config.rateLimit.globalMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => !config.rateLimit.enabled,
  handler: respostaLimite('Muitas requisições. Aguarde um instante.', 'LIMITE_EXCEDIDO'),
})

/** Login: poucas tentativas por IP+e-mail (força bruta e credential stuffing). */
export const limiteLogin = rateLimit({
  windowMs: 15 * 60_000,
  limit: config.rateLimit.loginMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  skip: () => !config.rateLimit.enabled,
  keyGenerator: chavePorIpE('email'),
  handler: respostaLimite(
    'Muitas tentativas de login. Por segurança, aguarde 15 minutos antes de tentar novamente.',
    'LIMITE_LOGIN',
  ),
})

/** Recuperação de senha e cadastro: evitam spam de e-mail e criação em massa. */
export const limiteRecuperacao = rateLimit({
  windowMs: 60 * 60_000,
  limit: config.rateLimit.recuperacaoMax,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => !config.rateLimit.enabled,
  keyGenerator: chavePorIpE('email'),
  handler: respostaLimite('Muitos pedidos a partir deste endereço. Tente novamente mais tarde.', 'LIMITE_RECUPERACAO'),
})

/** Escrita (POST/PATCH/PUT/DELETE): teto mais baixo que a leitura. */
export const limiteEscrita = rateLimit({
  windowMs: 60_000,
  limit: Math.max(30, Math.floor(config.rateLimit.globalMax / 4)),
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: () => !config.rateLimit.enabled,
  handler: respostaLimite('Muitas operações de escrita em sequência. Aguarde um instante.', 'LIMITE_ESCRITA'),
})

// ---------------------------------------------------------------------
// Higienização da entrada
// ---------------------------------------------------------------------

const CHAVES_PROIBIDAS = new Set(['__proto__', 'constructor', 'prototype'])

/** Remove recursivamente chaves de poluição de protótipo e bytes nulos. */
function higienizar(valor, profundidade = 0) {
  if (profundidade > 12 || valor === null || typeof valor !== 'object') {
    if (typeof valor === 'string') return valor.replace(/\0/g, '')
    return valor
  }
  if (Array.isArray(valor)) return valor.map((v) => higienizar(v, profundidade + 1))

  const limpo = {}
  for (const [chave, v] of Object.entries(valor)) {
    if (CHAVES_PROIBIDAS.has(chave)) continue
    limpo[chave] = higienizar(v, profundidade + 1)
  }
  return limpo
}

/**
 * Limpa corpo e query antes de qualquer validação. O Express já roda com
 * `query parser: simple` (sem objetos aninhados vindos da URL), e aqui a
 * proteção é estendida ao corpo: nenhuma chave especial chega ao domínio.
 */
export function higienizarEntrada(req, _res, next) {
  if (req.body && typeof req.body === 'object') req.body = higienizar(req.body)
  if (req.query && typeof req.query === 'object') req.query = higienizar(req.query)
  next()
}

/**
 * Resposta autenticada nunca deve ser guardada em cache intermediário
 * (proxy, CDN, histórico do navegador) — são dados de clientes e pets
 * (RN10/RNF11).
 */
export function semCache(_req, res, next) {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, private')
  res.setHeader('Pragma', 'no-cache')
  next()
}
