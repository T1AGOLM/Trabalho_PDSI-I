import jwt from 'jsonwebtoken'
import { config } from '../config/env.js'
import { withTransaction } from '../db/pool.js'
import { ErroDePermissao } from './errors.js'

/**
 * Autenticação e autorização (RNF04 / RN03 / RN10).
 *
 * O token carrega o tenant e o usuário; a cada requisição o middleware
 * **reconsulta** o usuário no banco, dentro de uma transação com
 * `app.petshop_id` definido. Assim uma conta desativada ou removida para
 * de operar imediatamente, mesmo com um token ainda válido na mão.
 *
 * O que o cliente autorizado pode fazer é decidido por `exigirPerfil` e
 * pelos escopos abaixo — a checagem de perfil é feita **na rota**, e o
 * banco repete as regras críticas por gatilho/constraint (defesa em
 * profundidade: nenhuma das duas camadas é a única barreira).
 */

/** Lê o token do cabeçalho Authorization (clientes de API) ou do cookie httpOnly (navegador). */
function lerToken(req) {
  const header = req.headers.authorization
  if (header?.startsWith('Bearer ')) return header.slice(7)
  return req.cookies?.[config.http.cookie.name] ?? null
}

/** Token de renovação: cookie próprio ou corpo da requisição. */
export function lerRefreshToken(req) {
  return req.cookies?.[config.http.cookie.refreshName] ?? req.body?.refreshToken ?? null
}

/**
 * Exige um usuário autenticado e anexa `req.usuario`.
 * Responde 401 quando não há token válido.
 */
export async function autenticar(req, res, next) {
  const token = lerToken(req)
  if (!token) {
    return res.status(401).json({ erro: 'Não autenticado.', codigo: 'SEM_TOKEN' })
  }

  let payload
  try {
    payload = jwt.verify(token, config.auth.jwtSecret, {
      algorithms: ['HS256'], // nenhum outro algoritmo é aceito (evita alg confusion)
      issuer: 'petplus-api',
    })
  } catch (err) {
    const mensagem = err.name === 'TokenExpiredError'
      ? 'Sessão expirada. Renove a sessão ou faça login novamente.'
      : 'Token inválido.'
    return res.status(401).json({ erro: mensagem, codigo: err.name === 'TokenExpiredError' ? 'TOKEN_EXPIRADO' : 'TOKEN_INVALIDO' })
  }

  try {
    // Sem `app.petshop_id` definido, as políticas de RLS filtrariam a própria
    // busca de sessão e ninguém se autenticaria. O tenant vem do token JÁ
    // verificado (assinatura conferida acima), então não há como um token
    // apontar para outra unidade.
    const { rows } = await withTransaction({ tenantId: payload.petshopId }, (db) =>
      db.query(
        `SELECT id, petshop_id, perfil, nome, email::text AS email, ativo
           FROM usuario
          WHERE id = $1 AND petshop_id = $2`,
        [payload.sub, payload.petshopId],
      ),
    )
    const usuario = rows[0]
    if (!usuario) return res.status(401).json({ erro: 'Usuário não encontrado.', codigo: 'USUARIO_AUSENTE' })
    if (!usuario.ativo) return res.status(403).json({ erro: 'Usuário inativo.', codigo: 'USUARIO_INATIVO' })

    req.usuario = usuario
    next()
  } catch (err) {
    next(err)
  }
}

/** Autenticação opcional: anexa `req.usuario` quando houver token, mas não bloqueia. */
export async function autenticarOpcional(req, res, next) {
  if (!lerToken(req)) return next()
  return autenticar(req, res, () => next())
}

/**
 * Exige um ou mais perfis (RF18 / RN03).
 *   exigirPerfil('GESTOR', 'COLABORADOR')
 */
export function exigirPerfil(...perfis) {
  return (req, res, next) => {
    if (!req.usuario) return res.status(401).json({ erro: 'Não autenticado.', codigo: 'SEM_TOKEN' })
    if (!perfis.includes(req.usuario.perfil)) {
      return next(new ErroDePermissao(
        `Esta ação exige o perfil: ${perfis.join(' ou ')}.`,
        'PERFIL_INSUFICIENTE',
      ))
    }
    next()
  }
}

/**
 * Contexto derivado do JWT — é o que identifica o tenant de tudo.
 * Toda rota passa isto para o repositório: o repositório nunca aceita
 * `petshop_id` vindo do corpo da requisição.
 */
export const contexto = (req) => ({
  tenantId: req.usuario.petshop_id,
  usuarioId: req.usuario.id,
  perfil: req.usuario.perfil,
  // `cliente` e `colaborador` são especializações de `usuario`: a PK
  // dessas tabelas é o próprio `usuario_id`.
  clienteId: req.usuario.perfil === 'CLIENTE' ? req.usuario.id : null,
  colaboradorId: req.usuario.perfil === 'COLABORADOR' ? req.usuario.id : null,
})

/** Somente gestor (RN03: excluir cadastros, estornar venda, configurar a unidade). */
export const exigirGestor = exigirPerfil('GESTOR')

/** Emite o token de acesso. */
export function assinarToken(usuario) {
  return jwt.sign(
    {
      sub: usuario.id,
      petshopId: usuario.petshop_id,
      perfil: usuario.perfil,
      nome: usuario.nome,
    },
    config.auth.jwtSecret,
    {
      expiresIn: config.auth.jwtExpiresIn,
      issuer: 'petplus-api',
      audience: 'petplus',
      algorithm: 'HS256',
    },
  )
}

/**
 * Opções do cookie de sessão: inacessível ao JavaScript (`httpOnly`, o que
 * neutraliza roubo por XSS), restrito a requisições do próprio site
 * (`sameSite: lax`) e marcado `secure` em produção.
 */
export const opcoesDoCookie = (segundos) => ({
  httpOnly: true,
  secure: config.http.cookie.secure,
  sameSite: 'lax',
  domain: config.http.cookie.domain,
  path: '/',
  maxAge: segundos * 1000,
})

/** Aplica os dois cookies de sessão na resposta. */
export function gravarCookies(res, { token, refreshToken, expiraEmSegundos }) {
  res.cookie(config.http.cookie.name, token, opcoesDoCookie(expiraEmSegundos))
  res.cookie(
    config.http.cookie.refreshName,
    refreshToken,
    opcoesDoCookie(Math.floor(duracaoSegura(config.auth.jwtRefreshExpiresIn))),
  )
}

/** Limpa os cookies de sessão (logout). */
export function limparCookies(res) {
  for (const nome of [config.http.cookie.name, config.http.cookie.refreshName]) {
    res.clearCookie(nome, { ...opcoesDoCookie(0), maxAge: undefined })
  }
}

/** Segundos de uma duração textual — usado só para o `maxAge` do cookie. */
function duracaoSegura(duracao) {
  const match = /^(\d+)\s*([smhd])?$/i.exec(String(duracao).trim())
  if (!match) return 86_400
  const fator = { s: 1, m: 60, h: 3600, d: 86_400 }[(match[2] ?? 's').toLowerCase()]
  return Number(match[1]) * fator
}
