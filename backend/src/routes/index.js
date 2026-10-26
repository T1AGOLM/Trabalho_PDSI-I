import { Router } from 'express'
import { pool } from '../db/pool.js'
import { config } from '../config/env.js'
import { rota } from '../middleware/errors.js'
import { semCache } from '../middleware/security.js'
import { authRoutes } from './auth.routes.js'
import { cadastrosRoutes } from './cadastros.routes.js'
import { agendaRoutes } from './agenda.routes.js'
import { estoqueRoutes } from './estoque.routes.js'
import { vendasRoutes } from './vendas.routes.js'
import { gestaoRoutes } from './gestao.routes.js'
import { docsRoutes } from './docs.routes.js'

/**
 * Montagem das rotas.
 *
 * Cada arquivo cobre um domínio e é independente dos outros: um recurso
 * novo é um arquivo novo mais uma linha aqui. A ordem abaixo importa
 * apenas onde um caminho literal poderia ser confundido com um `:id`.
 */
export const routes = Router()

// --- Sistema (público) -----------------------------------------------
routes.get('/health', rota(async (_req, res) => {
  const inicio = Date.now()
  try {
    await pool.query('SELECT 1')
    res.json({
      ok: true,
      banco: 'conectado',
      latenciaMs: Date.now() - inicio,
      ambiente: config.env,
      versao: '2.0.0',
    })
  } catch (err) {
    // 503: o processo está vivo, a dependência não. Assim um balanceador
    // tira a instância de rotação em vez de mandar tráfego para ela.
    res.status(503).json({ ok: false, banco: 'indisponível', erro: err.message })
  }
}))

// --- Documentação ----------------------------------------------------
routes.use(docsRoutes)

// --- Domínio ---------------------------------------------------------
// `semCache` em tudo que devolve dado de cliente/pet (RN10/RNF11): nenhum
// proxy ou histórico de navegador guarda a resposta.
routes.use(semCache)
routes.use('/auth', authRoutes)
routes.use(cadastrosRoutes)
routes.use(agendaRoutes)
routes.use(estoqueRoutes)
routes.use(vendasRoutes)
routes.use(gestaoRoutes)

/**
 * Caminhos efetivamente montados, no formato da especificação OpenAPI
 * (`/clientes/{id}`). Serve para que documentação e servidor não saiam de
 * sincronia: o teste unitário compara esta lista com `openapi.paths`.
 */
export function rotasRegistradas(router = routes, prefixo = '') {
  const lista = []
  for (const camada of router.stack ?? []) {
    if (camada.route) {
      const caminho = `${prefixo}${camada.route.path}`.replace(/:(\w+)/g, '{$1}')
      for (const metodo of Object.keys(camada.route.methods)) lista.push({ metodo, caminho })
      continue
    }
    // A documentação não é um recurso da API: fica fora do contrato.
    if (camada.handle === docsRoutes || !camada.handle?.stack) continue
    // Router aninhado: o Express compila o prefixo do `use` em regexp
    // (`^\/auth\/?(?=\/|$)`), que é a única fonte dele em runtime.
    const trecho = camada.regexp.source
      .replace(/^\^/, '')
      .replace(/\\\/\?\(\?=\\\/\|\$\)/, '')
      .replace(/\\\//g, '/')
    lista.push(...rotasRegistradas(camada.handle, `${prefixo}${trecho}`))
  }
  return lista
}
