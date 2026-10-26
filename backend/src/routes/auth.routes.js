import { Router } from 'express'
import { z } from 'zod'
import * as auth from '../services/auth.service.js'
import { encerrarSessao, renovarSessao } from '../services/sessao.service.js'
import {
  autenticar, gravarCookies, lerRefreshToken, limparCookies, contexto,
} from '../middleware/auth.js'
import { rota } from '../middleware/errors.js'
import { limiteLogin, limiteRecuperacao, semCache } from '../middleware/security.js'
import { senha as schemaSenha, email as schemaEmail, telefone as schemaTelefone, validar } from '../middleware/validar.js'

export const authRoutes = Router()

/** IP real do cliente (respeita proxy quando configurado). */
const ipDe = (req) => req.ip ?? null
const uaDe = (req) => String(req.headers['user-agent'] ?? '').slice(0, 200)

const respostaDeSessao = (res, sessao) => {
  gravarCookies(res, sessao)
  res.json({
    token: sessao.token,
    refreshToken: sessao.refreshToken,
    expiraEmSegundos: sessao.expiraEmSegundos,
    refreshExpiraEm: sessao.refreshExpiraEm,
    usuario: sessao.usuario,
  })
}

/**
 * POST /api/auth/login (RF18)
 *
 * Devolve o token no corpo (para clientes de API) e grava os cookies
 * httpOnly (para o navegador, que passa a não precisar guardar token no
 * localStorage — o que elimina o roubo de sessão por XSS).
 */
authRoutes.post(
  '/login',
  limiteLogin,
  validar({ corpo: z.object({ email: schemaEmail, senha: z.string().min(1).max(200) }) }),
  rota(async (req, res) => {
    const sessao = await auth.login({
      email: req.body.email,
      senha: req.body.senha,
      ip: ipDe(req),
      userAgent: uaDe(req),
    })
    respostaDeSessao(res, sessao)
  }),
)

/** POST /api/auth/cadastro (RF01/RF02/RNF11) — tutor com consentimento LGPD. */
authRoutes.post(
  '/cadastro',
  limiteRecuperacao,
  validar({
    corpo: z.object({
      nome: z.string().trim().min(3).max(150),
      email: schemaEmail,
      senha: schemaSenha,
      telefone: schemaTelefone.optional(),
      endereco: z.string().trim().max(255).optional(),
      consentimento: z.coerce.boolean(),
    }),
  }),
  rota(async (req, res) => {
    const sessao = await auth.cadastrarCliente({ ...req.body, ip: ipDe(req), userAgent: uaDe(req) })
    res.status(201)
    respostaDeSessao(res, sessao)
  }),
)

/**
 * POST /api/auth/refresh
 *
 * Renova o access token com rotação do refresh token. Reapresentar um
 * token já rotacionado derruba todas as sessões do usuário (indício de
 * vazamento) — ver `sessao.service.renovarSessao`.
 */
authRoutes.post(
  '/refresh',
  validar({ corpo: z.object({ refreshToken: z.string().min(10).max(200).optional() }) }),
  rota(async (req, res) => {
    const sessao = await renovarSessao({
      refreshToken: lerRefreshToken(req),
      ip: ipDe(req),
      userAgent: uaDe(req),
    })
    respostaDeSessao(res, sessao)
  }),
)

/** POST /api/auth/logout — encerra a sessão atual e limpa os cookies. */
authRoutes.post(
  '/logout',
  validar({ corpo: z.object({ refreshToken: z.string().min(10).max(200).optional() }).optional() }),
  rota(async (req, res) => {
    await encerrarSessao({ refreshToken: lerRefreshToken(req) })
    limparCookies(res)
    res.status(200).json({ encerrada: true })
  }),
)

/** POST /api/auth/recuperar-senha (RF24). */
authRoutes.post(
  '/recuperar-senha',
  limiteRecuperacao,
  validar({ corpo: z.object({ email: schemaEmail }) }),
  rota(async (req, res) => {
    res.json(await auth.solicitarRecuperacao({ email: req.body.email }))
  }),
)

/** POST /api/auth/redefinir-senha (RF24) — consome o token e derruba sessões. */
authRoutes.post(
  '/redefinir-senha',
  limiteRecuperacao,
  validar({ corpo: z.object({ token: z.string().min(10).max(200), senha: schemaSenha }) }),
  rota(async (req, res) => {
    res.json(await auth.redefinirSenha(req.body))
  }),
)

/** GET /api/auth/eu — sessão atual. */
authRoutes.get('/eu', autenticar, semCache, rota(async (req, res) => {
  res.json(auth.sessaoAtual(req.usuario))
}))

/** PATCH /api/auth/senha — troca de senha do próprio usuário. */
authRoutes.patch(
  '/senha',
  autenticar,
  validar({ corpo: z.object({ senhaAtual: z.string().min(1).max(200), novaSenha: schemaSenha }) }),
  rota(async (req, res) => {
    const { tenantId, usuarioId } = contexto(req)
    const resultado = await auth.trocarSenha({
      tenantId,
      usuarioId,
      senhaAtual: req.body.senhaAtual,
      novaSenha: req.body.novaSenha,
    })
    // A sessão atual continua válida, mas os cookies são reemitidos para
    // deixar claro que as OUTRAS sessões caíram.
    res.json(resultado)
  }),
)
