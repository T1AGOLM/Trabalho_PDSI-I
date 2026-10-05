import jwt from 'jsonwebtoken'
import { config } from '../config/env.js'
import { withTransaction } from '../db/pool.js'

/**
 * Middleware de autenticação (RNF04).
 *
 * O token JWT carrega o tenant e o usuário. A partir dele, cada consulta
 * roda dentro de uma transação com `app.petshop_id` definido — é isso que
 * ativa as políticas de Row-Level Security e garante o isolamento entre
 * petshops (RNF13).
 */

/** Lê o token do cabeçalho Authorization ou do cookie httpOnly. */
function lerToken(req) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice(7)
  return req.cookies?.petplus_token ?? null
}

/**
 * Exige um usuário autenticado e anexa `req.usuario`.
 * Se não houver token válido, responde 401.
 */
export async function autenticar(req, res, next) {
  const token = lerToken(req)
  if (!token) return res.status(401).json({ erro: 'Não autenticado.' })

  let payload
  try {
    payload = jwt.verify(token, config.auth.jwtSecret)
  } catch (err) {
    const mensagem = err.name === 'TokenExpiredError'
      ? 'Sessão expirada. Faça login novamente.'
      : 'Token inválido.'
    return res.status(401).json({ erro: mensagem })
  }

  try {
    // Reconsultamos o usuário: uma conta desativada ou removida não pode
    // continuar operando com um token ainda válido.
    //
    // A leitura roda dentro de uma transação COM `app.petshop_id` definido:
    // sem isso as políticas de RLS filtrariam a própria busca de sessão e
    // ninguém conseguiria se autenticar. O tenant vem do token já validado,
    // então não há como um token apontar para a unidade errada.
    const { rows } = await withTransaction({ tenantId: payload.petshopId }, (db) =>
      db.query(
        `SELECT id, petshop_id, perfil, nome, email, ativo
           FROM usuario
          WHERE id = $1 AND petshop_id = $2`,
        [payload.sub, payload.petshopId],
      ),
    )
    const usuario = rows[0]
    if (!usuario) return res.status(401).json({ erro: 'Usuário não encontrado.' })
    if (!usuario.ativo) return res.status(403).json({ erro: 'Usuário inativo.' })

    req.usuario = usuario
    next()
  } catch (err) {
    next(err)
  }
}

/**
 * Exige um ou mais perfis (RN03 / RF18).
 *   exigirPerfil('GESTOR', 'COLABORADOR')
 */
export function exigirPerfil(...perfis) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ erro: 'Não autenticado.' })
    if (!perfis.includes(req.usuario.perfil)) {
      return res.status(403).json({
        erro: 'Acesso negado.',
        detalhe: `Esta ação exige o perfil: ${perfis.join(' ou ')}.`,
      })
    }
    next()
  }
}

/** Emite o token de sessão. */
export function assinarToken(usuario) {
  return jwt.sign(
    {
      sub: usuario.id,
      petshopId: usuario.petshop_id,
      perfil: usuario.perfil,
      nome: usuario.nome,
    },
    config.auth.jwtSecret,
    { expiresIn: config.auth.jwtExpiresIn },
  )
}