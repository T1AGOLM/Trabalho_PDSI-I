import crypto from 'node:crypto'
import { query, queryOne, withTransaction } from '../db/pool.js'
import { assinarToken } from '../middleware/auth.js'
import { ErroDeNegocio } from '../middleware/errors.js'
import { config } from '../config/env.js'

/**
 * Sessões (RNF04 / RNF06).
 *
 * O access token é um JWT curto e stateless. O refresh token é um segredo
 * aleatório de 256 bits que **só existe no banco como SHA-256** e é
 * rotacionado a cada renovação:
 *
 *   login        → (access₁, refresh₁)
 *   refresh₁     → (access₂, refresh₂), refresh₁ marcado como revogado
 *   refresh₁ ✗   → reapresentação! A família inteira é revogada.
 *
 * É esse último passo que transforma um vazamento de token em um evento
 * detectável e contido, em vez de uma sessão eterna para o atacante.
 */

/** Hash do refresh token — é o que vai para a coluna (nunca o valor em claro). */
export const hashDoToken = (token) => crypto.createHash('sha256').update(String(token)).digest('hex')

/** Gera um segredo opaco de 256 bits. */
const novoToken = () => crypto.randomBytes(32).toString('hex')

/**
 * Converte '30m' / '8h' / '7d' / '3600' (segundos) em milissegundos.
 * O JWT tem o seu próprio cálculo de expiração; aqui precisamos do mesmo
 * prazo para a coluna `expira_em` do refresh token.
 */
export function duracaoEmMs(duracao) {
  const texto = String(duracao).trim()
  const match = /^(\d+)\s*([smhd])?$/i.exec(texto)
  if (!match) throw new Error(`Duração inválida: ${duracao}`)
  const valor = Number(match[1])
  const unidade = (match[2] ?? 's').toLowerCase()
  const fator = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 }[unidade]
  return valor * fator
}

/** Prazo do access token em segundos (vai na resposta para o cliente programar a renovação). */
export const segundosDoAccessToken = () => Math.floor(duracaoEmMs(config.auth.jwtExpiresIn) / 1000)

/**
 * Cria uma sessão nova (login/cadastro) e devolve o par de tokens.
 * A gravação do refresh acontece dentro da transação do tenant.
 */
export async function criarSessao({ usuario, ip, userAgent }) {
  const refreshToken = novoToken()
  const expiraEm = new Date(Date.now() + duracaoEmMs(config.auth.jwtRefreshExpiresIn))

  const criado = await withTransaction({ tenantId: usuario.petshop_id, usuarioId: usuario.id }, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO refresh_token (petshop_id, usuario_id, token_hash, expira_em, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [usuario.petshop_id, usuario.id, hashDoToken(refreshToken), expiraEm, userAgent ?? null, ip ?? null],
    )
    return rows[0]
  })

  return {
    token: assinarToken(usuario),
    refreshToken,
    refreshTokenId: criado.id,
    expiraEmSegundos: segundosDoAccessToken(),
    refreshExpiraEm: expiraEm.toISOString(),
    usuario,
  }
}

/** Revoga (logicamente) um refresh token pelo id. */
const revogar = (db, id) =>
  db.query('UPDATE refresh_token SET revogado_em = now() WHERE id = $1 AND revogado_em IS NULL', [id])

/** Revoga todas as sessões de um usuário — usada em troca de senha e em reuso detectado. */
export function revogarSessoesDoUsuario({ tenantId, usuarioId }) {
  return withTransaction({ tenantId, usuarioId }, (db) =>
    db.query('UPDATE refresh_token SET revogado_em = now() WHERE usuario_id = $1 AND revogado_em IS NULL', [usuarioId]))
}

/**
 * Renova a sessão a partir de um refresh token, com rotação.
 *
 * A busca roda por `petplus_buscar_refresh_token()`, o escape hatch de RLS:
 * quando o access token expirou, ainda não existe tenant na sessão.
 */
export async function renovarSessao({ refreshToken, ip, userAgent }) {
  if (!refreshToken) {
    throw new ErroDeNegocio('Sessão não informada.', { status: 401, codigo: 'SEM_REFRESH_TOKEN' })
  }

  const registro = await queryOne('SELECT * FROM petplus_buscar_refresh_token($1)', [hashDoToken(refreshToken)])
  if (!registro) {
    throw new ErroDeNegocio('Sessão inválida. Faça login novamente.', { status: 401, codigo: 'REFRESH_INVALIDO' })
  }

  // Reuso de token já rotacionado: alguém está com uma cópia antiga.
  // Não dá para saber se é o atacante ou o dono, então caem todas.
  if (registro.revogado_em) {
    await revogarSessoesDoUsuario({ tenantId: registro.petshop_id, usuarioId: registro.usuario_id })
    throw new ErroDeNegocio(
      'Sessão encerrada por segurança. Entre novamente.',
      { status: 401, codigo: 'REFRESH_REUTILIZADO' },
    )
  }

  if (new Date(registro.expira_em) <= new Date()) {
    throw new ErroDeNegocio('Sessão expirada. Faça login novamente.', { status: 401, codigo: 'REFRESH_EXPIRADO' })
  }

  // A conta pode ter sido desativada entre a emissão e a renovação.
  const usuario = await withTransaction({ tenantId: registro.petshop_id }, async (db) => {
    const { rows } = await db.query(
      'SELECT id, petshop_id, perfil, nome, email::text AS email, ativo FROM usuario WHERE id = $1',
      [registro.usuario_id],
    )
    return rows[0]
  })
  if (!usuario || !usuario.ativo) {
    throw new ErroDeNegocio('Conta inativa ou removida.', { status: 403, codigo: 'CONTA_INATIVA' })
  }

  const novoRefresh = novoToken()
  const expiraEm = new Date(Date.now() + duracaoEmMs(config.auth.jwtRefreshExpiresIn))

  await withTransaction({ tenantId: registro.petshop_id, usuarioId: registro.usuario_id }, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO refresh_token (petshop_id, usuario_id, token_hash, expira_em, user_agent, ip)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id`,
      [registro.petshop_id, registro.usuario_id, hashDoToken(novoRefresh), expiraEm, userAgent ?? null, ip ?? null],
    )
    // A rotação é atômica: o token antigo só é revogado junto com o novo.
    await db.query(
      'UPDATE refresh_token SET revogado_em = now(), substituido_por = $2 WHERE id = $1',
      [registro.id, rows[0].id],
    )
  })

  return {
    token: assinarToken(usuario),
    refreshToken: novoRefresh,
    expiraEmSegundos: segundosDoAccessToken(),
    refreshExpiraEm: expiraEm.toISOString(),
    usuario,
  }
}

/**
 * Encerra a sessão do token informado. Sem token válido, não faz nada —
 * logout nunca deve devolver erro para o cliente.
 */
export async function encerrarSessao({ refreshToken }) {
  if (!refreshToken) return { encerrada: false }
  const registro = await queryOne('SELECT * FROM petplus_buscar_refresh_token($1)', [hashDoToken(refreshToken)])
  if (!registro) return { encerrada: false }
  await withTransaction({ tenantId: registro.petshop_id, usuarioId: registro.usuario_id }, (db) => revogar(db, registro.id))
  return { encerrada: true }
}

/**
 * Limpeza da tabela: remove tokens vencidos ou revogados há mais de 30
 * dias. Chamada pelo agendador (não é por requisição).
 */
export async function limparTokensAntigos() {
  const { rowCount } = await query(
    `DELETE FROM refresh_token
      WHERE expira_em < now() - interval '30 days'
         OR (revogado_em IS NOT NULL AND revogado_em < now() - interval '30 days')`,
  )
  return rowCount
}
