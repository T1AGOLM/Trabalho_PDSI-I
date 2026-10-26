import { Router } from 'express'
import { z } from 'zod'
import * as agenda from '../repositories/agenda.repository.js'
import * as colaboradores from '../repositories/colaborador.repository.js'
import { contexto, autenticar, exigirPerfil } from '../middleware/auth.js'
import { ErroDeNegocio, ErroNaoEncontrado, rota } from '../middleware/errors.js'
import {
  validar, idParam, dataISO, dataHoraLocal, dataOpcional, textoOpcional, idOpcional,
  enumOpcional, inteiroOpcional, dinheiroOpcional,
} from '../middleware/validar.js'
import { schemaPaginacao, schemaOrdenacao, paginacao } from '../http/paginacao.js'
import { withTransaction } from '../db/pool.js'

/**
 * Rotas da agenda (RF04–RF06, RF17, RF30 / RN01, RN04, RN08, RN12).
 *
 * O conflito de horário, a disponibilidade e a sobreposição de bloqueio
 * são decididos pelo BANCO (constraint EXCLUDE + gatilhos). Aqui ficam a
 * validação de entrada e o recorte de quem pode ver/alterar o quê.
 */
export const agendaRoutes = Router()

const STATUS = ['confirmado', 'cancelado', 'concluído']

/** RN10: o tutor só enxerga e só mexe no que é dele. */
function exigirDonoDoAgendamento(req, agendamento) {
  if (req.usuario.perfil === 'CLIENTE' && agendamento.clienteId !== req.usuario.id) {
    throw new ErroDeNegocio('Você só pode acessar os seus próprios agendamentos.', { status: 403, codigo: 'ACESSO_NEGADO' })
  }
  return agendamento
}

const queryAgendamentos = schemaPaginacao.merge(schemaOrdenacao(['data', 'cliente', 'status', 'valor'])).merge(
  z.object({
    de: dataOpcional(),
    ate: dataOpcional(),
    status: enumOpcional(STATUS),
    colaboradorId: idOpcional(),
    clienteId: idOpcional(),
    petId: idOpcional(),
    servicoId: idOpcional(),
    busca: textoOpcional(120),
  }),
)

/** GET /agendamentos — listagem com filtros de período, status e pessoa. */
agendaRoutes.get('/agendamentos', autenticar, validar({ query: queryAgendamentos }), rota(async (req, res) => {
  const ctx = contexto(req)
  const filtros = { ...paginacao(req.consulta), ...req.consulta }
  // O tutor só vê os próprios agendamentos, independente do que pediu.
  if (ctx.perfil === 'CLIENTE') filtros.clienteId = ctx.usuarioId
  res.json(await agenda.listar(ctx, filtros))
}))

/** GET /agenda/dia?data=YYYY-MM-DD — grade do dia (dashboard e balcão). */
agendaRoutes.get('/agenda/dia', autenticar, exigirPerfil('GESTOR', 'COLABORADOR'),
  validar({ query: z.object({ data: dataISO }) }), rota(async (req, res) => {
    res.json(await agenda.agendaDoDia(contexto(req), req.consulta.data))
  }))

/** GET /agenda/horarios-livres — sugestão de horários (RF04/RF05). */
agendaRoutes.get('/agenda/horarios-livres', autenticar,
  validar({
    query: z.object({
      colaboradorId: z.coerce.number().int().positive(),
      data: dataISO,
      duracao: inteiroOpcional(10, 480),
    }),
  }),
  rota(async (req, res) => {
    res.json(await agenda.horariosLivres(contexto(req), {
      colaboradorId: req.consulta.colaboradorId,
      data: req.consulta.data,
      duracao: req.consulta.duracao ?? 60,
    }))
  }))

/**
 * GET /profissionais — vitrine da equipe para o tutor escolher (RF04/RF05).
 * Devolve só id, nome, cargo e disponibilidade; telefone e e-mail da equipe
 * ficam restritos ao gestor (RNF11).
 */
agendaRoutes.get('/profissionais', autenticar, rota(async (req, res) => {
  res.json(await colaboradores.profissionais(contexto(req)))
}))

agendaRoutes.get('/agendamentos/:id', autenticar, validar({ params: idParam }), rota(async (req, res) => {
  const agendamento = await agenda.buscarPorId(contexto(req), req.paramsValidos.id)
  if (!agendamento) throw new ErroNaoEncontrado('Agendamento')
  res.json(exigirDonoDoAgendamento(req, agendamento))
}))

const corpoAgendamento = z.object({
  petId: z.coerce.number().int().positive(),
  servicoId: z.coerce.number().int().positive(),
  colaboradorId: z.coerce.number().int().positive(),
  dataHora: dataHoraLocal,
  valor: dinheiroOpcional(),
  observacoes: z.string().trim().max(1000).optional(),
})

/** POST /agendamentos — cria (RF04). O banco valida RN01 e RN08. */
agendaRoutes.post('/agendamentos', autenticar, validar({ corpo: corpoAgendamento }), rota(async (req, res) => {
  const ctx = contexto(req)

  // Um tutor não pode agendar o pet de outra pessoa: o vínculo é
  // conferido antes, mesmo com a FK composta já impedindo o registro.
  if (ctx.perfil === 'CLIENTE') {
    const { rows } = await withTransaction(ctx, (db) => db.query(
      'SELECT cliente_id FROM pet WHERE id = $1 AND petshop_id = $2 AND ativo',
      [req.body.petId, ctx.tenantId],
    ))
    if (!rows[0] || rows[0].cliente_id !== ctx.usuarioId) {
      throw new ErroDeNegocio('Você só pode agendar para os seus próprios pets.', { status: 403, codigo: 'ACESSO_NEGADO' })
    }
  }

  res.status(201).json(await agenda.criar(ctx, req.body))
}))

/** PATCH /agendamentos/:id/remarcar — move e revalida o conflito. */
agendaRoutes.patch('/agendamentos/:id/remarcar', autenticar,
  validar({ params: idParam, corpo: z.object({ dataHora: dataHoraLocal }) }),
  rota(async (req, res) => {
    const ctx = contexto(req)
    const atual = await agenda.buscarPorId(ctx, req.paramsValidos.id)
    if (!atual) throw new ErroNaoEncontrado('Agendamento')
    exigirDonoDoAgendamento(req, atual)

    const remarcado = await agenda.remarcar(ctx, { id: req.paramsValidos.id, dataHora: req.body.dataHora })
    if (!remarcado) throw new ErroNaoEncontrado('Agendamento')
    res.json(remarcado)
  }))

/** PATCH /agendamentos/:id/cancelar — libera o horário (RN04). */
agendaRoutes.patch('/agendamentos/:id/cancelar', autenticar,
  validar({ params: idParam, corpo: z.object({ motivo: z.string().trim().max(200).optional() }) }),
  rota(async (req, res) => {
    const ctx = contexto(req)
    const atual = await agenda.buscarPorId(ctx, req.paramsValidos.id)
    if (!atual) throw new ErroNaoEncontrado('Agendamento')
    exigirDonoDoAgendamento(req, atual)

    const cancelado = await agenda.cancelar(ctx, { id: req.paramsValidos.id, motivo: req.body.motivo })
    if (!cancelado) throw new ErroNaoEncontrado('Agendamento já cancelado.')
    res.json(cancelado)
  }))

/** PATCH /agendamentos/:id/concluir — só a equipe conclui (RF17). */
agendaRoutes.patch('/agendamentos/:id/concluir', autenticar, exigirPerfil('GESTOR', 'COLABORADOR'),
  validar({ params: idParam }), rota(async (req, res) => {
    const concluido = await agenda.concluir(contexto(req), req.paramsValidos.id)
    if (!concluido) throw new ErroNaoEncontrado('Agendamento confirmado')
    res.json(concluido)
  }))

// =====================================================================
// BLOQUEIOS DE AGENDA — RF30 / RN12
// =====================================================================

const queryBloqueios = schemaPaginacao.merge(
  z.object({
    colaboradorId: idOpcional(),
    de: dataOpcional(),
    ate: dataOpcional(),
    busca: textoOpcional(120),
  }),
)

agendaRoutes.get('/bloqueios', autenticar, exigirPerfil('GESTOR', 'COLABORADOR'),
  validar({ query: queryBloqueios }), rota(async (req, res) => {
    const ctx = contexto(req)
    const filtros = { ...paginacao(req.consulta), ...req.consulta }
    // O colaborador acompanha os próprios bloqueios (RF30).
    if (ctx.perfil === 'COLABORADOR') filtros.colaboradorId = ctx.colaboradorId
    res.json(await agenda.listarBloqueios(ctx, filtros))
  }))

const corpoBloqueio = z.object({
  colaboradorId: z.coerce.number().int().positive(),
  dataInicio: dataISO,
  dataFim: dataISO,
  motivo: z.string().trim().min(3).max(200),
}).refine((b) => b.dataFim >= b.dataInicio, { message: 'A data final deve ser igual ou posterior à inicial', path: ['dataFim'] })

/** POST /bloqueios — o gatilho recusa sobreposição com atendimento confirmado (RN12). */
agendaRoutes.post('/bloqueios', autenticar, exigirPerfil('GESTOR', 'COLABORADOR'),
  validar({ corpo: corpoBloqueio }), rota(async (req, res) => {
    const ctx = contexto(req)
    // O colaborador bloqueia a própria agenda; o gestor bloqueia qualquer um.
    if (ctx.perfil === 'COLABORADOR' && req.body.colaboradorId !== ctx.colaboradorId) {
      throw new ErroDeNegocio('Você só pode bloquear a sua própria agenda.', { status: 403, codigo: 'ACESSO_NEGADO' })
    }
    res.status(201).json(await agenda.criarBloqueio(ctx, req.body))
  }))

agendaRoutes.delete('/bloqueios/:id', autenticar, exigirPerfil('GESTOR', 'COLABORADOR'),
  validar({ params: idParam }), rota(async (req, res) => {
    const ctx = contexto(req)
    if (ctx.perfil === 'COLABORADOR') {
      const lista = await agenda.listarBloqueios(ctx, { pagina: 1, limite: 1, offset: 0, colaboradorId: ctx.colaboradorId })
      if (!lista.dados.some((b) => b.id === req.paramsValidos.id)) {
        throw new ErroDeNegocio('Você só pode remover os seus próprios bloqueios.', { status: 403, codigo: 'ACESSO_NEGADO' })
      }
    }
    const removido = await agenda.removerBloqueio(ctx, req.paramsValidos.id)
    if (!removido) throw new ErroNaoEncontrado('Bloqueio')
    res.json({ ...removido, removido: true })
  }))
