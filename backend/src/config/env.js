import 'dotenv/config'

/**
 * Configuração central da aplicação.
 *
 * Tudo que muda entre ambientes (dev, homologação, produção) entra por
 * variável de ambiente — nenhum valor fica "hard-coded" em um segundo
 * lugar. O backend robusto que você vai construir depois já nasce
 * seguindo esse contrato.
 */
const required = (name, fallback) => {
  const value = process.env[name] ?? fallback
  if (value === undefined) {
    throw new Error(`Variável de ambiente obrigatória ausente: ${name}`)
  }
  return value
}

export const config = {
  env: process.env.NODE_ENV ?? 'development',
  port: Number(process.env.PORT ?? 3333),

  db: {
    host: required('DB_HOST', 'localhost'),
    port: Number(process.env.DB_PORT ?? 5432),
    database: required('DB_NAME', 'petplus'),
    user: required('DB_USER', 'petplus_app'),
    password: required('DB_PASSWORD', 'petplus_app'),
    // Dono do schema: usado só pelas migrations e pelo seed.
    adminUser: required('DB_ADMIN_USER', 'petplus'),
    adminPassword: required('DB_ADMIN_PASSWORD', 'petplus'),
    max: Number(process.env.DB_POOL_MAX ?? 10),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  },

  auth: {
    jwtSecret: required('JWT_SECRET', 'petplus-dev-secret-troque-em-producao'),
    jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '8h',
    bcryptRounds: Number(process.env.BCRYPT_ROUNDS ?? 10),
  },

  cors: {
    origin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  },
}