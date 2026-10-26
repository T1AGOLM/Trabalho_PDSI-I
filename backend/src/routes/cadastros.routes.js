import { Router } from 'express'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import * as clientes from '../repositories/cliente.repository.js'
import * as pets from '../repositories/pet.repository.js'
import * as colaboradores from '../repositories/colaborador.repository.js'
import * as servicos from '../repositories/servico.repository.js'
import * as registros from '../repositories/registro-saude.repository.js'
import { contexto, autenticar, exigirPerfil } from '../middleware/auth.js'
import { ErroDeNegocio, ErroNaoEncontrado, ErroDePermissao, rota } from '../middleware/errors.js'
import {
  validar, idParam, dataISO, dataOpcional, textoOpcional, idOpcional, booleanoOpcional,
  enumOpcional, inteiroOpcional, dinheiro, dinheiroOpcional, email as schemaEmail,
  telefone as schemaTelefone,
} from '../middleware/validar.js'
import { schemaPaginacao, schemaOrdenacao, paginacao } from '../http/paginacao.js'
import { config } from '../config/env.js'

/**
 * Rotas de cadastro (RF01–RF03, RF07, RF11, RF16, RF20, RF21, RF29).
 *
 * Padrão de autorização (RN03/RN10):
 *  - **leitura** para gestor e colaborador (é a operação do balcão);
 *  - **escrita** conforme a regra: excluir cadastro é só do gestor (RN03);
 *  - o **cliente** nunca acessa as rotas administrativas: o que ele pode
 *    ver sai de `/pets`, `/registros-saude` e `/agendamentos`, já
 *    filtrados pelo próprio id.
 */
export const cadastrosRoutes = Router()

const soAdmin = exigirPerfil('GESTOR', 'COLABORADOR')

/** Query base de toda listagem: paginação + busca + status. */
const queryListagem = (ordenarChaves) =>
  schemaPaginacao.merge(schemaOrdenacao(ordenarChaves)).merge(
    z.object({ busca: textoOpcional(120), ativo: booleanoOpcional() }),
  )

// =====================================================================
// CLIENTES (tutores) — RF01/RF02/RF03
// =====================================================================

const queryClientes = queryListagem(['nome', 'email', 'pontos', 'criado'])

cadastrosRoutes.get('/clientes', autenticar, soAdmin, validar({ query: queryClientes }), rota(async (req, res) => {
  res.json(await clientes.listar(contexto(req), { ...paginacao(req.consulta), ...req.consulta }))
}))

/**
 * GET /clientes/:id — ficha do tutor.
 *
 * O gestor e o colaborador veem qualquer tutor da unidade; o próprio tutor
 * vê a sua ficha (é o que a área "Meu Perfil" consome). Qualquer outro id
 * com perfil CLIENTE é recusado — RN10.
 */
cadastrosRoutes.get('/clientes/:id', autenticar, validar({ params: idParam }), rota(async (req, res) => {
  const ctx = contexto(req)
  if (ctx.perfil === 'CLIENTE' && req.paramsValidos.id !== ctx.usuarioId) {
    throw new ErroDePermissao('Você só pode consultar o seu próprio cadastro.')
  }
  const cliente = await clientes.buscarPorId(ctx, req.paramsValidos.id)
  if (!cliente) throw new ErroNaoEncontrado('Cliente')
  res.json(cliente)
}))

const corpoCliente = z.object({
  nome: z.string().trim().min(3).max(150),
  email: schemaEmail,
  telefone: schemaTelefone.optional(),
  cpf: z.string().regex(/^\d{11}$/, 'CPF deve ter 11 dígitos').optional(),
  endereco: z.string().trim().max(255).optional(),
  senha: z.string().min(8).max(72).optional(),
  consentimento: z.coerce.boolean().default(true),
  pet: z.object({
    nome: z.string().trim().min(1).max(100),
    especie: z.string().trim().max(40).optional(),
    raca: z.string().trim().max(60).optional(),
    porte: z.string().trim().max(20).optional(),
    idade: z.coerce.number().int().min(0).max(40).optional(),
    dataNascimento: dataISO.optional(),
    observacoesSaude: z.string().trim().max(2000).optional(),
  }).optional(),
})

cadastrosRoutes.post('/clientes', autenticar, soAdmin, validar({ corpo: corpoCliente }), rota(async (req, res) => {
  const { senha, ...dados } = req.body
  // Sem senha explícita, geramos uma temporária: o tutor entra pelo fluxo
  // de recuperação (RF24) e define a dele. A senha em claro nunca é gravada.
  const senhaHash = await bcrypt.hash(senha ?? Math.random().toString(36).slice(2, 14), config.auth.bcryptRounds)
  res.status(201).json(await clientes.criar(contexto(req), { ...dados, senhaHash }))
}))

/**
 * PATCH /clientes/:id — atualização de dados e do consentimento LGPD (RNF11).
 * O próprio tutor mantém os seus dados no autoatendimento; para ele, o id
 * tem de ser o da sessão (mesma regra do GET acima).
 */
cadastrosRoutes.patch('/clientes/:id', autenticar,
  validar({ params: idParam, corpo: corpoCliente.partial().omit({ pet: true }) }),
  rota(async (req, res) => {
    const ctx = contexto(req)
    if (ctx.perfil === 'CLIENTE' && req.paramsValidos.id !== ctx.usuarioId) {
      throw new ErroDePermissao('Você só pode alterar o seu próprio cadastro.')
    }
    const { senha, ...dados } = req.body
    const atualizado = await clientes.atualizar(ctx, { id: req.paramsValidos.id, ...dados })
    if (!atualizado) throw new ErroNaoEncontrado('Cliente')
    res.json(atualizado)
  }))

/** DELETE /clientes/:id — exclusão lógica, só gestor (RF03 + RN03). */
cadastrosRoutes.delete('/clientes/:id', autenticar, exigirPerfil('GESTOR'), validar({ params: idParam }),
  rota(async (req, res) => {
    const inativado = await clientes.inativar(contexto(req), req.paramsValidos.id)
    if (!inativado) throw new ErroNaoEncontrado('Cliente')
    res.json(inativado)
  }))

cadastrosRoutes.post('/clientes/:id/reativar', autenticar, exigirPerfil('GESTOR'), validar({ params: idParam }),
  rota(async (req, res) => {
    const reativado = await clientes.reativar(contexto(req), req.paramsValidos.id)
    if (!reativado) throw new ErroNaoEncontrado('Cliente')
    res.json(reativado)
  }))

// Fidelidade (RF20/RN07) -------------------------------------------------

cadastrosRoutes.get('/clientes/:id/fidelidade', autenticar, soAdmin, validar({ params: idParam }),
  rota(async (req, res) => {
    const resultado = await clientes.fidelidade(contexto(req), req.paramsValidos.id)
    if (!resultado) throw new ErroNaoEncontrado('Cliente')
    res.json(resultado)
  }))

/** Lança pontos manualmente (cortesia, correção de caixa). */
cadastrosRoutes.post('/clientes/:id/fidelidade', autenticar, exigirPerfil('GESTOR'),
  validar({
    params: idParam,
    corpo: z.object({
      tipo: z.enum(['credito', 'debito']),
      pontos: z.coerce.number().int().positive().max(100_000),
      descricao: z.string().trim().max(200).optional(),
    }),
  }),
  rota(async (req, res) => {
    const { id } = req.paramsValidos
    const cliente = await clientes.buscarPorId(contexto(req), id)
    if (!cliente) throw new ErroNaoEncontrado('Cliente')
    // RN07: o resgate só passa se houver saldo — a resposta vem do banco.
    res.status(201).json(await clientes.movimentarPontos(contexto(req), { clienteId: id, ...req.body }))
  }))

/** Saldo do próprio tutor (tela "Fidelidade" da área do cliente). */
cadastrosRoutes.get('/fidelidade', autenticar, exigirPerfil('CLIENTE'), rota(async (req, res) => {
  const resultado = await clientes.fidelidade(contexto(req), req.usuario.id)
  res.json(resultado ?? { clienteId: req.usuario.id, saldo: 0, extrato: [] })
}))

/**
 * POST /fidelidade/resgate — o próprio tutor troca pontos por um benefício
 * (RF20/RN07).
 *
 * O id do cliente vem da SESSÃO, nunca do corpo: ninguém debita pontos
 * alheios. O saldo insuficiente (RN07) é recusado pelo gatilho do banco, que
 * mantém o extrato e o saldo no mesmo lugar.
 */
cadastrosRoutes.post('/fidelidade/resgate', autenticar, exigirPerfil('CLIENTE'),
  validar({
    corpo: z.object({
      pontos: z.coerce.number().int().positive().max(10_000),
      descricao: z.string().trim().min(3).max(120),
    }),
  }),
  rota(async (req, res) => {
    const ctx = contexto(req)
    res.status(201).json(await clientes.movimentarPontos(ctx, {
      clienteId: ctx.usuarioId,
      tipo: 'debito',
      ...req.body,
    }))
  }))

// =====================================================================
// PETS — RF02/RF03/RF11/RF21
// =====================================================================

const queryPets = queryListagem(['nome', 'tutor', 'criado']).merge(z.object({ clienteId: idOpcional() }))

cadastrosRoutes.get('/pets', autenticar, soAdmin, validar({ query: queryPets }), rota(async (req, res) => {
  res.json(await pets.listar(contexto(req), { ...paginacao(req.consulta), ...req.consulta }))
}))

/** O cliente vê os próprios pets; gestor/colaborador usam a rota acima. */
cadastrosRoutes.get('/pets/meus', autenticar, validar({ query: schemaPaginacao }), rota(async (req, res) => {
  const clienteId = contexto(req).clienteId
  if (!clienteId) throw new ErroDeNegocio('Disponível apenas para o perfil cliente.', { status: 403, codigo: 'PERFIL_INSUFICIENTE' })
  res.json(await pets.listar(contexto(req), { ...paginacao(req.consulta), clienteId }))
}))

cadastrosRoutes.get('/pets/:id', autenticar, validar({ params: idParam }), rota(async (req, res) => {
  const pet = await pets.buscarPorId(contexto(req), req.paramsValidos.id)
  if (!pet) throw new ErroNaoEncontrado('Pet')
  // RN10: o tutor só enxerga o próprio pet.
  if (req.usuario.perfil === 'CLIENTE' && pet.clienteId !== req.usuario.id) {
    throw new ErroDeNegocio('Você só pode consultar os seus próprios pets.', { status: 403, codigo: 'ACESSO_NEGADO' })
  }
  res.json(pet)
}))

/** Linha do tempo do pet (RF11/RF21). */
cadastrosRoutes.get('/pets/:id/historico', autenticar, validar({ params: idParam }), rota(async (req, res) => {
  const pet = await pets.buscarPorId(contexto(req), req.paramsValidos.id)
  if (!pet) throw new ErroNaoEncontrado('Pet')
  if (req.usuario.perfil === 'CLIENTE' && pet.clienteId !== req.usuario.id) {
    throw new ErroDeNegocio('Você só pode consultar os seus próprios pets.', { status: 403, codigo: 'ACESSO_NEGADO' })
  }
  res.json(await pets.historico(contexto(req), req.paramsValidos.id))
}))

/**
 * RN10: o tutor só altera o próprio pet. Gestor e colaborador cuidam do
 * cadastro da unidade inteira (é a operação de balcão).
 */
async function exigirDonoDoPet(req, petId) {
  if (req.usuario.perfil !== 'CLIENTE') return
  const pet = await pets.buscarPorId(contexto(req), petId)
  if (!pet) throw new ErroNaoEncontrado('Pet')
  if (pet.clienteId !== req.usuario.id) {
    throw new ErroDePermissao('Você só pode alterar os seus próprios pets.')
  }
}

const corpoPet = z.object({
  clienteId: z.coerce.number().int().positive(),
  nome: z.string().trim().min(1).max(100),
  especie: z.string().trim().max(40).default('Cachorro'),
  raca: z.string().trim().max(60).optional(),
  porte: z.string().trim().max(20).optional(),
  idade: z.coerce.number().int().min(0).max(40).optional(),
  dataNascimento: dataISO.optional(),
  observacoesSaude: z.string().trim().max(2000).optional(),
})

/**
 * O tutor cadastra o próprio pet pelo autoatendimento (RF02/UC19).
 *
 * Quando o perfil é CLIENTE, o `clienteId` tem de ser o dele: um id de
 * outro tutor é recusado com 403 em vez de "corrigido" em silêncio — quem
 * tentou escrever na ficha alheia precisa saber que não pode (RN10).
 */
cadastrosRoutes.post('/pets', autenticar, validar({ corpo: corpoPet }), rota(async (req, res) => {
  const ctx = contexto(req)
  if (ctx.perfil === 'CLIENTE' && req.body.clienteId !== ctx.usuarioId) {
    throw new ErroDePermissao('Você só pode cadastrar pets no seu próprio nome.')
  }
  res.status(201).json(await pets.criar(ctx, req.body))
}))

cadastrosRoutes.patch('/pets/:id', autenticar,
  validar({ params: idParam, corpo: corpoPet.partial().omit({ clienteId: true }) }),
  rota(async (req, res) => {
    await exigirDonoDoPet(req, req.paramsValidos.id)
    const atualizado = await pets.atualizar(contexto(req), { id: req.paramsValidos.id, ...req.body })
    if (!atualizado) throw new ErroNaoEncontrado('Pet')
    res.json(atualizado)
  }))

cadastrosRoutes.delete('/pets/:id', autenticar, validar({ params: idParam }),
  rota(async (req, res) => {
    await exigirDonoDoPet(req, req.paramsValidos.id)
    const inativado = await pets.inativar(contexto(req), req.paramsValidos.id)
    if (!inativado) throw new ErroNaoEncontrado('Pet')
    res.json(inativado)
  }))

// =====================================================================
// HISTÓRICO DE SAÚDE — RF11/RF13/RF21
// =====================================================================

const queryRegistros = schemaPaginacao.merge(schemaOrdenacao(['data', 'tipo', 'pet'])).merge(z.object({
  petId: idOpcional(),
  clienteId: idOpcional(),
  tipo: enumOpcional(['vacina', 'atendimento', 'banho', 'observação']),
  de: dataOpcional(),
  ate: dataOpcional(),
  busca: textoOpcional(120),
}))

cadastrosRoutes.get('/registros-saude', autenticar, validar({ query: queryRegistros }), rota(async (req, res) => {
  const ctx = contexto(req)
  const filtros = { ...paginacao(req.consulta), ...req.consulta }
  // RN10/RF21: o tutor vê apenas os registros dos próprios pets.
  if (ctx.perfil === 'CLIENTE') filtros.clienteId = ctx.usuarioId
  res.json(await registros.listar(ctx, filtros))
}))

/** Alertas de vacina a vencer (RF13) — usado pelo painel e pela tela de saúde. */
cadastrosRoutes.get('/registros-saude/vacinas-a-vencer', autenticar, soAdmin, rota(async (req, res) => {
  res.json(await registros.vacinasAVencer(contexto(req)))
}))

const corpoRegistro = z.object({
  petId: z.coerce.number().int().positive(),
  tipo: z.enum(['vacina', 'atendimento', 'banho', 'observação']),
  data: dataISO.optional(),
  descricao: z.string().trim().min(3).max(2000),
  proximoVencimento: dataISO.optional(),
})

cadastrosRoutes.post('/registros-saude', autenticar, soAdmin, validar({ corpo: corpoRegistro }), rota(async (req, res) => {
  res.status(201).json(await registros.criar(contexto(req), req.body))
}))

cadastrosRoutes.patch('/registros-saude/:id', autenticar, soAdmin,
  validar({ params: idParam, corpo: corpoRegistro.partial().omit({ petId: true }) }),
  rota(async (req, res) => {
    const atualizado = await registros.atualizar(contexto(req), { id: req.paramsValidos.id, ...req.body })
    if (!atualizado) throw new ErroNaoEncontrado('Registro de saúde')
    res.json(atualizado)
  }))

cadastrosRoutes.delete('/registros-saude/:id', autenticar, exigirPerfil('GESTOR'), validar({ params: idParam }),
  rota(async (req, res) => {
    const removido = await registros.remover(contexto(req), req.paramsValidos.id)
    if (!removido) throw new ErroNaoEncontrado('Registro de saúde')
    res.json({ ...removido, removido: true })
  }))

// =====================================================================
// COLABORADORES — RF16/RF17/RN08
// =====================================================================

const queryColaboradores = queryListagem(['nome', 'cargo', 'criado']).merge(z.object({
  cargo: enumOpcional(['ATENDENTE', 'TOSADOR', 'BANHISTA', 'VETERINARIO']),
}))

cadastrosRoutes.get('/colaboradores', autenticar, soAdmin, validar({ query: queryColaboradores }),
  rota(async (req, res) => {
    res.json(await colaboradores.listar(contexto(req), { ...paginacao(req.consulta), ...req.consulta }))
  }))

cadastrosRoutes.get('/colaboradores/:id', autenticar, soAdmin, validar({ params: idParam }), rota(async (req, res) => {
  const colaborador = await colaboradores.buscarPorId(contexto(req), req.paramsValidos.id)
  if (!colaborador) throw new ErroNaoEncontrado('Colaborador')
  res.json(colaborador)
}))

const janela = z.object({
  diaSemana: z.coerce.number().int().min(0).max(6),
  horaInicio: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
  horaFim: z.string().regex(/^\d{2}:\d{2}$/, 'Use HH:MM'),
}).refine((j) => j.horaFim > j.horaInicio, { message: 'O fim deve ser depois do início', path: ['horaFim'] })

const corpoColaborador = z.object({
  nome: z.string().trim().min(3).max(150),
  email: schemaEmail,
  telefone: schemaTelefone.optional(),
  senha: z.string().min(8).max(72).optional(),
  cargo: z.enum(['ATENDENTE', 'TOSADOR', 'BANHISTA', 'VETERINARIO']),
  matricula: z.string().trim().max(30).optional(),
  disponibilidade: z.array(janela).max(21).optional(),
})

cadastrosRoutes.post('/colaboradores', autenticar, exigirPerfil('GESTOR'), validar({ corpo: corpoColaborador }),
  rota(async (req, res) => {
    const { senha, ...dados } = req.body
    const senhaHash = await bcrypt.hash(senha ?? Math.random().toString(36).slice(2, 14), config.auth.bcryptRounds)
    res.status(201).json(await colaboradores.criar(contexto(req), { ...dados, senhaHash }))
  }))

cadastrosRoutes.patch('/colaboradores/:id', autenticar, exigirPerfil('GESTOR'),
  validar({ params: idParam, corpo: corpoColaborador.partial().omit({ disponibilidade: true }) }),
  rota(async (req, res) => {
    const atualizado = await colaboradores.atualizar(contexto(req), { id: req.paramsValidos.id, ...req.body })
    if (!atualizado) throw new ErroNaoEncontrado('Colaborador')
    res.json(atualizado)
  }))

cadastrosRoutes.delete('/colaboradores/:id', autenticar, exigirPerfil('GESTOR'), validar({ params: idParam }),
  rota(async (req, res) => {
    const inativado = await colaboradores.inativar(contexto(req), req.paramsValidos.id)
    if (!inativado) throw new ErroNaoEncontrado('Colaborador')
    res.json(inativado)
  }))

/** Disponibilidade semanal (RN08) — substitui o conjunto inteiro. */
cadastrosRoutes.get('/colaboradores/:id/disponibilidade', autenticar, soAdmin, validar({ params: idParam }),
  rota(async (req, res) => {
    res.json(await colaboradores.lerDisponibilidade(contexto(req), req.paramsValidos.id))
  }))

cadastrosRoutes.put('/colaboradores/:id/disponibilidade', autenticar, exigirPerfil('GESTOR'),
  validar({ params: idParam, corpo: z.object({ janelas: z.array(janela).max(21) }) }),
  rota(async (req, res) => {
    const resultado = await colaboradores.definirDisponibilidade(contexto(req), {
      id: req.paramsValidos.id,
      janelas: req.body.janelas,
    })
    if (!resultado) throw new ErroNaoEncontrado('Colaborador')
    res.json(resultado)
  }))

// =====================================================================
// SERVIÇOS — RF04/RF07
// =====================================================================

const queryServicos = queryListagem(['nome', 'preco', 'tipo', 'duracao']).merge(z.object({
  tipo: enumOpcional(['banho', 'tosa', 'consulta']),
}))

cadastrosRoutes.get('/servicos', autenticar, validar({ query: queryServicos }), rota(async (req, res) => {
  res.json(await servicos.listar(contexto(req), { ...paginacao(req.consulta), ...req.consulta }))
}))

const corpoServico = z.object({
  nome: z.string().trim().min(2).max(120),
  tipo: z.enum(['banho', 'tosa', 'consulta']),
  duracao: z.coerce.number().int().positive().max(1440),
  preco: dinheiro,
})

cadastrosRoutes.post('/servicos', autenticar, exigirPerfil('GESTOR'), validar({ corpo: corpoServico }),
  rota(async (req, res) => {
    res.status(201).json(await servicos.criar(contexto(req), req.body))
  }))

cadastrosRoutes.patch('/servicos/:id', autenticar, exigirPerfil('GESTOR'),
  validar({ params: idParam, corpo: corpoServico.partial() }),
  rota(async (req, res) => {
    const atualizado = await servicos.atualizar(contexto(req), { id: req.paramsValidos.id, ...req.body })
    if (!atualizado) throw new ErroNaoEncontrado('Serviço')
    res.json(atualizado)
  }))

cadastrosRoutes.delete('/servicos/:id', autenticar, exigirPerfil('GESTOR'), validar({ params: idParam }),
  rota(async (req, res) => {
    const inativado = await servicos.inativar(contexto(req), req.paramsValidos.id)
    if (!inativado) throw new ErroNaoEncontrado('Serviço')
    res.json(inativado)
  }))

// =====================================================================
// FORNECEDORES — RF07
// =====================================================================

const queryFornecedores = queryListagem(['nome', 'criado'])

cadastrosRoutes.get('/fornecedores', autenticar, soAdmin, validar({ query: queryFornecedores }),
  rota(async (req, res) => {
    res.json(await servicos.listarFornecedores(contexto(req), { ...paginacao(req.consulta), ...req.consulta }))
  }))

const corpoFornecedor = z.object({
  nome: z.string().trim().min(2).max(150),
  cnpj: z.string().regex(/^\d{14}$/, 'CNPJ deve ter 14 dígitos (sem máscara)'),
  contato: z.string().trim().max(60).optional(),
  email: schemaEmail.optional(),
  telefone: schemaTelefone.optional(),
  endereco: z.string().trim().max(255).optional(),
})

cadastrosRoutes.post('/fornecedores', autenticar, exigirPerfil('GESTOR'), validar({ corpo: corpoFornecedor }),
  rota(async (req, res) => {
    res.status(201).json(await servicos.criarFornecedor(contexto(req), req.body))
  }))

cadastrosRoutes.patch('/fornecedores/:id', autenticar, exigirPerfil('GESTOR'),
  validar({ params: idParam, corpo: corpoFornecedor.partial() }),
  rota(async (req, res) => {
    const atualizado = await servicos.atualizarFornecedor(contexto(req), { id: req.paramsValidos.id, ...req.body })
    if (!atualizado) throw new ErroNaoEncontrado('Fornecedor')
    res.json(atualizado)
  }))

cadastrosRoutes.delete('/fornecedores/:id', autenticar, exigirPerfil('GESTOR'), validar({ params: idParam }),
  rota(async (req, res) => {
    const inativado = await servicos.inativarFornecedor(contexto(req), req.paramsValidos.id)
    if (!inativado) throw new ErroNaoEncontrado('Fornecedor')
    res.json(inativado)
  }))
