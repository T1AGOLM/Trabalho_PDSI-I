import { Router } from 'express'
import { z } from 'zod'
import * as pacotes from '../repositories/pacote.repository.js'
import * as notificacoes from '../repositories/notificacao.repository.js'
import * as relatorios from '../repositories/relatorio.repository.js'
import * as petshopRepo from '../repositories/petshop.repository.js'
import { resumo as resumoDashboard } from '../repositories/dashboard.repository.js'
import { gerar as gerarRelatorio, FORMATOS } from '../services/relatorio.service.js'
import { processarFila } from '../services/email.service.js'
import { gerarAvisosDoTenant } from '../services/notificacao.service.js'
import { contexto, autenticar, exigirPerfil } from '../middleware/auth.js'
import { ErroDeNegocio, ErroNaoEncontrado, rota } from '../middleware/errors.js'
import {
  validar, idParam, dataISO, dataOpcional, textoOpcional, idOpcional, booleanoOpcional,
  enumOpcional, dinheiro, inteiroOpcional,
} from '../middleware/validar.js'
import { schemaPaginacao, paginacao } from '../http/paginacao.js'
import { snapshot } from '../observability/metrics.js'
import { config } from '../config/env.js'

/**
 * Rotas de gestão: pacotes, avaliações, painel, notificações, relatórios e
 * configurações da unidade (RF14, RF15, RF19, RF27, RF28, RF29, RF30, RNF17).
 */
export const gestaoRoutes = Router()

const soOperacao = exigirPerfil('GESTOR', 'COLABORADOR')
const soGestor = exigirPerfil('GESTOR')

// =====================================================================
// PACOTES E ASSINATURAS — RF29
// =====================================================================

gestaoRoutes.get('/pacotes', autenticar, validar({ query: schemaPaginacao.merge(z.object({
  busca: textoOpcional(120), ativo: booleanoOpcional(),
})) }), rota(async (req, res) => {
  res.json(await pacotes.listarPacotes(contexto(req), { ...paginacao(req.consulta), ...req.consulta }))
}))

const corpoPacote = z.object({
  nome: z.string().trim().min(2).max(120),
  periodicidade: z.string().trim().min(2).max(40),
  preco: dinheiro,
  servicoIds: z.array(z.coerce.number().int().positive()).max(30).optional(),
})

gestaoRoutes.post('/pacotes', autenticar, soGestor, validar({ corpo: corpoPacote }), rota(async (req, res) => {
  res.status(201).json(await pacotes.criarPacote(contexto(req), req.body))
}))

gestaoRoutes.patch('/pacotes/:id', autenticar, soGestor,
  validar({ params: idParam, corpo: corpoPacote.partial() }), rota(async (req, res) => {
    const atualizado = await pacotes.atualizarPacote(contexto(req), { id: req.paramsValidos.id, ...req.body })
    if (!atualizado) throw new ErroNaoEncontrado('Pacote')
    res.json(atualizado)
  }))

gestaoRoutes.delete('/pacotes/:id', autenticar, soGestor, validar({ params: idParam }), rota(async (req, res) => {
  const inativado = await pacotes.inativarPacote(contexto(req), req.paramsValidos.id)
  if (!inativado) throw new ErroNaoEncontrado('Pacote')
  res.json(inativado)
}))

gestaoRoutes.get('/assinaturas', autenticar, validar({ query: schemaPaginacao.merge(z.object({
  clienteId: idOpcional(),
  status: enumOpcional(['ativo', 'cancelado']),
  busca: textoOpcional(120),
})) }), rota(async (req, res) => {
  const ctx = contexto(req)
  const filtros = { ...paginacao(req.consulta), ...req.consulta }
  // O tutor acompanha as próprias assinaturas (RF29/RF21).
  if (ctx.perfil === 'CLIENTE') filtros.clienteId = ctx.usuarioId
  res.json(await pacotes.listarAssinaturas(ctx, filtros))
}))

gestaoRoutes.post('/assinaturas', autenticar, soOperacao,
  validar({ corpo: z.object({
    pacoteId: z.coerce.number().int().positive(),
    clienteId: z.coerce.number().int().positive(),
    petId: z.coerce.number().int().positive(),
  }) }),
  rota(async (req, res) => {
    res.status(201).json(await pacotes.criarAssinatura(contexto(req), req.body))
  }))

gestaoRoutes.post('/assinaturas/:id/cancelar', autenticar, soGestor, validar({ params: idParam }),
  rota(async (req, res) => {
    const cancelada = await pacotes.cancelarAssinatura(contexto(req), req.paramsValidos.id)
    if (!cancelada) throw new ErroNaoEncontrado('Assinatura ativa')
    res.json(cancelada)
  }))

// =====================================================================
// AVALIAÇÕES — RF28
// =====================================================================

gestaoRoutes.get('/avaliacoes', autenticar, validar({ query: schemaPaginacao.merge(z.object({
  nota: inteiroOpcional(1, 5),
  de: dataOpcional(),
  ate: dataOpcional(),
  ordenar: enumOpcional(['data', 'nota']),
  direcao: enumOpcional(['asc', 'desc']),
})) }), rota(async (req, res) => {
  res.json(await pacotes.listarAvaliacoes(contexto(req), { ...paginacao(req.consulta), ...req.consulta }))
}))

gestaoRoutes.get('/avaliacoes/resumo', autenticar, soOperacao, rota(async (req, res) => {
  res.json(await pacotes.resumoAvaliacoes(contexto(req)))
}))

/** POST /avaliacoes — só o tutor do atendimento, e só depois de concluído. */
gestaoRoutes.post('/avaliacoes', autenticar, exigirPerfil('CLIENTE'),
  validar({ corpo: z.object({
    agendamentoId: z.coerce.number().int().positive(),
    nota: z.coerce.number().int().min(1).max(5),
    comentario: z.string().trim().max(1000).optional(),
  }) }),
  rota(async (req, res) => {
    res.status(201).json(await pacotes.criarAvaliacao(contexto(req), req.body))
  }))

gestaoRoutes.delete('/avaliacoes/:id', autenticar, soGestor, validar({ params: idParam }), rota(async (req, res) => {
  const removida = await pacotes.removerAvaliacao(contexto(req), req.paramsValidos.id)
  if (!removida) throw new ErroNaoEncontrado('Avaliação')
  res.json({ ...removida, removida: true })
}))

// =====================================================================
// PAINEL GERENCIAL — RF14/RF15
// =====================================================================

gestaoRoutes.get('/dashboard', autenticar, soGestor,
  validar({ query: z.object({ de: dataOpcional(), ate: dataOpcional() }) }),
  rota(async (req, res) => {
    res.json(await resumoDashboard(contexto(req), req.consulta))
  }))

// =====================================================================
// NOTIFICAÇÕES — RF12/RF13/RF22
// =====================================================================

gestaoRoutes.get('/notificacoes', autenticar, validar({ query: schemaPaginacao.merge(z.object({
  lida: booleanoOpcional(),
  canal: enumOpcional(['e-mail', 'push']),
  tipo: textoOpcional(40),
  busca: textoOpcional(120),
  pendentes: booleanoOpcional(),
})) }), rota(async (req, res) => {
  res.json(await notificacoes.listar(contexto(req), { ...paginacao(req.consulta), ...req.consulta }))
}))

gestaoRoutes.get('/notificacoes/contadores', autenticar, rota(async (req, res) => {
  res.json(await notificacoes.contadores(contexto(req)))
}))

gestaoRoutes.patch('/notificacoes/:id/lida', autenticar, validar({ params: idParam }), rota(async (req, res) => {
  const marcada = await notificacoes.marcarLida(contexto(req), req.paramsValidos.id)
  if (!marcada) throw new ErroNaoEncontrado('Notificação')
  res.json(marcada)
}))

gestaoRoutes.post('/notificacoes/marcar-todas-lidas', autenticar, rota(async (req, res) => {
  res.json(await notificacoes.marcarTodasLidas(contexto(req)))
}))

/**
 * POST /notificacoes/gerar — força um ciclo de geração + entrega.
 * Útil para demonstrar RF12/RF13 sem esperar o agendador, e para o gestor
 * que quer disparar os lembretes de hoje agora.
 */
gestaoRoutes.post('/notificacoes/gerar', autenticar, soGestor, rota(async (req, res) => {
  const ctx = contexto(req)
  const avisos = await gerarAvisosDoTenant(ctx.tenantId)
  const fila = await processarFila()
  res.json({ ...avisos, ...fila })
}))

// =====================================================================
// RELATÓRIOS — RF27
// =====================================================================

const TIPOS = ['vendas', 'agendamentos', 'estoque', 'financeiro']

gestaoRoutes.get('/relatorios', autenticar, soGestor, validar({ query: schemaPaginacao.merge(z.object({
  tipo: enumOpcional(TIPOS),
  formato: enumOpcional(FORMATOS),
  de: dataOpcional(),
  ate: dataOpcional(),
})) }), rota(async (req, res) => {
  res.json(await relatorios.listar(contexto(req), { ...paginacao(req.consulta), ...req.consulta }))
}))

const queryExportacao = z.object({
  tipo: z.enum(TIPOS),
  formato: z.enum(FORMATOS).default('CSV'),
  de: dataOpcional(),
  ate: dataOpcional(),
})

function validarPeriodo({ de, ate }) {
  if (de && ate && de > ate) {
    throw new ErroDeNegocio('A data inicial não pode ser posterior à final.', { status: 422, codigo: 'PERIODO_INVALIDO' })
  }
}

/** GET /relatorios/exportar — baixa o arquivo (RF27). */
gestaoRoutes.get('/relatorios/exportar', autenticar, soGestor, validar({ query: queryExportacao }),
  rota(async (req, res) => {
    validarPeriodo(req.consulta)
    const saida = await gerarRelatorio(contexto(req), req.consulta)
    res.setHeader('Content-Type', saida.contentType)
    // `attachment` com nome determinístico: o front só dispara o download.
    res.setHeader('Content-Disposition', `attachment; filename="${saida.nomeArquivo}"`)
    res.setHeader('X-Relatorio-Linhas', String(saida.resumo.linhas))
    res.send(saida.arquivo)
  }))

/** POST /relatorios/exportar — mesma coisa, para clientes que preferem POST. */
gestaoRoutes.post('/relatorios/exportar', autenticar, soGestor, validar({ corpo: queryExportacao }),
  rota(async (req, res) => {
    validarPeriodo(req.body)
    const saida = await gerarRelatorio(contexto(req), req.body)
    res.setHeader('Content-Type', saida.contentType)
    res.setHeader('Content-Disposition', `attachment; filename="${saida.nomeArquivo}"`)
    res.send(saida.arquivo)
  }))

/** Resumo em JSON (para a tela montar prévia/pré-visualização sem baixar). */
gestaoRoutes.get('/relatorios/previa', autenticar, soGestor, validar({ query: queryExportacao }),
  rota(async (req, res) => {
    validarPeriodo(req.consulta)
    res.json(await relatorios.dados(contexto(req), req.consulta))
  }))

// =====================================================================
// CONFIGURAÇÕES DA UNIDADE — RF16 / RN11 / RF12 / RF20
// =====================================================================

gestaoRoutes.get('/petshop', autenticar, soOperacao, rota(async (req, res) => {
  const unidade = await petshopRepo.obter(contexto(req))
  if (!unidade) throw new ErroNaoEncontrado('Unidade')
  res.json(unidade)
}))

gestaoRoutes.patch('/petshop', autenticar, soGestor,
  validar({ corpo: z.object({
    nome: z.string().trim().min(3).max(150).optional(),
    email: z.string().trim().toLowerCase().email().optional(),
    telefone: z.string().trim().max(20).optional(),
    endereco: z.string().trim().max(255).optional(),
    prazoEstornoDias: z.coerce.number().int().min(0).max(365).optional(),
    antecedenciaLembreteH: z.coerce.number().int().min(1).max(168).optional(),
    antecedenciaValidadeD: z.coerce.number().int().min(1).max(365).optional(),
    pontosPorReal: z.coerce.number().min(0).max(1000).optional(),
  }) }),
  rota(async (req, res) => {
    const atualizada = await petshopRepo.atualizar(contexto(req), req.body)
    if (!atualizada) throw new ErroNaoEncontrado('Unidade')
    res.json(atualizada)
  }))

/** Usuários da unidade (tela de configurações / auditoria de acessos). */
gestaoRoutes.get('/petshop/usuarios', autenticar, soGestor,
  validar({ query: z.object({ perfil: enumOpcional(['GESTOR', 'COLABORADOR', 'CLIENTE']) }) }),
  rota(async (req, res) => {
    res.json(await petshopRepo.usuarios(contexto(req), req.consulta))
  }))

// =====================================================================
// OBSERVABILIDADE — RNF17
// =====================================================================

/**
 * GET /metrics — métricas de processo e de requisição.
 *
 * Protegido por token (`METRICS_TOKEN`, para o coletor) **ou** por perfil
 * GESTOR (para inspeção manual). Nunca é público: expõe topologia interna.
 */
gestaoRoutes.get('/metrics', async (req, res, next) => {
  const token = req.headers['x-metrics-token']
  if (config.metrics.token && token === config.metrics.token) {
    return res.json(snapshot())
  }
  return autenticar(req, res, () => soGestor(req, res, () => res.json(snapshot())))
})

/** Saúde detalhada: além do SELECT 1, mostra fila pendente e pool. */
gestaoRoutes.get('/health/detalhado', autenticar, soGestor, rota(async (req, res) => {
  const inicio = Date.now()
  const pendentes = await notificacoes.contadores(contexto(req))
  res.json({
    ok: true,
    latenciaBancoMs: Date.now() - inicio,
    pool: snapshot().pool,
    fila: pendentes,
    uptimeSegundos: snapshot().uptimeSegundos,
  })
}))
