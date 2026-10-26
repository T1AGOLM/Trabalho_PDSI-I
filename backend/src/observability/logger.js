import { createRequire } from 'node:module'
import pino from 'pino'
import { config } from '../config/env.js'

const require = createRequire(import.meta.url)

/**
 * Log estruturado (RNF17).
 *
 * Em produção sai uma linha JSON por evento — pronta para ser lida por
 * qualquer coletor (Loki, CloudWatch, Datadog) sem parsing frágil. Em
 * desenvolvimento, `pino-pretty` é opcional; sem ele, caímos no JSON
 * mesmo, que continua legível.
 */
const alvoPretty = (() => {
  if (!config.log.pretty) return undefined
  try {
    // Dependência opcional: se não estiver instalada, seguimos em JSON.
    return require.resolve('pino-pretty')
  } catch {
    return undefined
  }
})()

export const logger = pino({
  level: config.log.level,
  base: { servico: 'petplus-api', ambiente: config.env },
  timestamp: pino.stdTimeFunctions.isoTime,
  // Nunca logar segredo: senhas, tokens e cabeçalhos de autorização.
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.senha',
      '*.senha_hash',
      '*.token',
      '*.refreshToken',
      '*.token_hash',
      '*.cpf',
      '*.consentimento',
    ],
    censor: '[REDACTED]',
  },
  ...(alvoPretty
    ? {
        transport: {
          target: 'pino-pretty',
          options: { colorize: true, translateTime: 'HH:MM:ss', ignore: 'pid,hostname,servico,ambiente' },
        },
      }
    : {}),
})

/** Logger filho que carrega o id da requisição em todos os registros dela. */
export const loggerDaRequisicao = (req) =>
  req.log ?? logger.child({ reqId: req.id, rota: `${req.method} ${req.originalUrl}` })
