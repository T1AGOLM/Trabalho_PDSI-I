import 'dotenv/config'
import { z } from 'zod'

/**
 * Configuração central da aplicação.
 *
 * Tudo que muda entre ambientes (dev, homologação, produção) entra por
 * variável de ambiente — nenhum valor fica "hard-coded" em um segundo
 * lugar, e **nada é lido de `process.env` fora deste arquivo**.
 *
 * O schema abaixo valida e normaliza cada variável na inicialização: um
 * valor ausente ou inválido derruba o processo na partida, com uma
 * mensagem dizendo qual variável e por quê — em vez de virar um `NaN`
 * silencioso no meio de uma consulta.
 */

/** Booleano de ambiente: aceita true/false/1/0/sim/não. Sem `coerce`, que trataria "false" como verdadeiro. */
const booleano = (padrao) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === '' ? padrao : ['true', '1', 'sim', 'yes'].includes(v.toLowerCase())))

/** Lista separada por vírgula — usada para a allowlist de CORS. */
const lista = (padrao) =>
  z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === '' ? padrao : v.split(',').map((s) => s.trim()).filter(Boolean)))

const SEGREDO_PADRAO = 'petplus-dev-secret-troque-em-producao'

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().max(65535).default(3333),

  // --- Banco de dados -------------------------------------------------
  DB_HOST: z.string().min(1).default('localhost'),
  DB_PORT: z.coerce.number().int().positive().default(5432),
  DB_NAME: z.string().min(1).default('petplus'),
  // Papel da aplicação: NÃO é dono das tabelas, por isso o RLS se aplica a ele.
  DB_USER: z.string().min(1).default('petplus_app'),
  DB_PASSWORD: z.string().default('petplus_app'),
  // Dono do schema: usado só por migrations, seed e geração do dicionário.
  DB_ADMIN_USER: z.string().min(1).default('petplus'),
  DB_ADMIN_PASSWORD: z.string().default('petplus'),
  DB_POOL_MAX: z.coerce.number().int().positive().max(200).default(10),
  DB_IDLE_TIMEOUT_MS: z.coerce.number().int().positive().default(30_000),
  DB_CONNECTION_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),
  /** Teto de tempo por consulta (evita uma query presa segurar uma conexão do pool — RNF01). */
  DB_STATEMENT_TIMEOUT_MS: z.coerce.number().int().positive().default(10_000),

  // --- Autenticação ---------------------------------------------------
  JWT_SECRET: z.string().min(1).default(SEGREDO_PADRAO),
  JWT_EXPIRES_IN: z.string().min(1).default('30m'),
  JWT_REFRESH_EXPIRES_IN: z.string().min(1).default('7d'),
  BCRYPT_ROUNDS: z.coerce.number().int().min(8).max(15).default(10),

  // --- HTTP ------------------------------------------------------------
  CORS_ORIGIN: lista(['http://localhost:5173']),
  BODY_LIMIT: z.string().min(1).default('1mb'),
  /** Atrás de proxy/balanceador: confiar em X-Forwarded-* para IP e protocolo. */
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(0),
  REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
  COOKIE_SECURE: booleano(false),
  COOKIE_DOMAIN: z.string().optional(),

  // --- Rate limiting ---------------------------------------------------
  RATE_LIMIT_ENABLED: booleano(true),
  RATE_LIMIT_GLOBAL_MAX: z.coerce.number().int().positive().default(600),
  RATE_LIMIT_LOGIN_MAX: z.coerce.number().int().positive().default(10),
  RATE_LIMIT_RECUPERACAO_MAX: z.coerce.number().int().positive().default(5),

  // --- Observabilidade (RNF17) ------------------------------------------
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  /** Formatação legível no terminal; em produção, sempre JSON de uma linha. */
  LOG_PRETTY: booleano(true),
  /** Token exigido por GET /api/metrics. Sem ele, a rota exige perfil GESTOR. */
  METRICS_TOKEN: z.string().optional(),

  // --- E-mail / outbox (RF12/RF13/RF24) ---------------------------------
  /**
   * `console` grava o e-mail renderizado no log (padrão: demonstra o fluxo
   * inteiro sem provedor). Trocar por um provedor real é implementar um
   * novo adaptador em `src/services/email.service.js` — o resto não muda.
   */
  EMAIL_TRANSPORT: z.enum(['console', 'arquivo']).default('console'),
  EMAIL_FROM: z.string().default('PetPlus <nao-responda@petplus.local>'),
  /** Pasta dos e-mails quando EMAIL_TRANSPORT=arquivo (caixa de saída inspecionável). */
  EMAIL_OUTBOX_DIR: z.string().default('var/emails'),
  /** Processador de lembretes em background (RF12/RF13). */
  LEMBRETES_ENABLED: booleano(true),
  LEMBRETES_INTERVALO_MIN: z.coerce.number().int().positive().default(15),
})

const resultado = schema.safeParse(process.env)

if (!resultado.success) {
  const problemas = resultado.error.issues
    .map((i) => `  • ${i.path.join('.') || '(raiz)'}: ${i.message}`)
    .join('\n')
  throw new Error(`Configuração inválida:\n${problemas}`)
}

const env = resultado.data

// Guardas de produção: falhar na partida é melhor do que servir tráfego
// com o segredo de desenvolvimento ou com CORS aberto.
if (env.NODE_ENV === 'production') {
  const erros = []
  if (env.JWT_SECRET === SEGREDO_PADRAO || env.JWT_SECRET.length < 32) {
    erros.push('JWT_SECRET precisa ter ao menos 32 caracteres e não pode ser o valor de desenvolvimento.')
  }
  if (!env.COOKIE_SECURE) {
    erros.push('COOKIE_SECURE deve ser true em produção (cookie de sessão apenas via HTTPS).')
  }
  if (env.CORS_ORIGIN.includes('*')) {
    erros.push('CORS_ORIGIN não pode ser "*" em produção: informe a lista de origens permitidas.')
  }
  if (env.LOG_PRETTY) {
    erros.push('LOG_PRETTY deve ser false em produção (logs estruturados em JSON).')
  }
  if (erros.length) throw new Error(`Configuração insegura para produção:\n${erros.map((e) => `  • ${e}`).join('\n')}`)
}

export const config = {
  env: env.NODE_ENV,
  isProd: env.NODE_ENV === 'production',
  isTest: env.NODE_ENV === 'test',
  port: env.PORT,

  db: {
    host: env.DB_HOST,
    port: env.DB_PORT,
    database: env.DB_NAME,
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    // Dono do schema: migrations, seed e dicionário.
    adminUser: env.DB_ADMIN_USER,
    adminPassword: env.DB_ADMIN_PASSWORD,
    max: env.DB_POOL_MAX,
    idleTimeoutMillis: env.DB_IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: env.DB_CONNECTION_TIMEOUT_MS,
    statementTimeoutMs: env.DB_STATEMENT_TIMEOUT_MS,
  },

  auth: {
    jwtSecret: env.JWT_SECRET,
    jwtExpiresIn: env.JWT_EXPIRES_IN,
    jwtRefreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
    bcryptRounds: env.BCRYPT_ROUNDS,
  },

  http: {
    corsOrigins: env.CORS_ORIGIN,
    bodyLimit: env.BODY_LIMIT,
    trustProxy: env.TRUST_PROXY,
    requestTimeoutMs: env.REQUEST_TIMEOUT_MS,
    cookie: {
      secure: env.COOKIE_SECURE,
      domain: env.COOKIE_DOMAIN,
      // Lido pelo cookie-parser; o nome do cookie também nomeia o JWT.
      name: 'petplus_token',
      refreshName: 'petplus_refresh',
    },
  },

  rateLimit: {
    enabled: env.RATE_LIMIT_ENABLED,
    globalMax: env.RATE_LIMIT_GLOBAL_MAX,
    loginMax: env.RATE_LIMIT_LOGIN_MAX,
    recuperacaoMax: env.RATE_LIMIT_RECUPERACAO_MAX,
  },

  log: {
    level: env.LOG_LEVEL,
    pretty: env.LOG_PRETTY && env.NODE_ENV !== 'production',
  },

  metrics: {
    token: env.METRICS_TOKEN,
  },

  email: {
    transport: env.EMAIL_TRANSPORT,
    from: env.EMAIL_FROM,
    outboxDir: env.EMAIL_OUTBOX_DIR,
  },

  lembretes: {
    enabled: env.LEMBRETES_ENABLED,
    intervaloMin: env.LEMBRETES_INTERVALO_MIN,
  },
}

export const SEGREDO_DE_DESENVOLVIMENTO = SEGREDO_PADRAO
