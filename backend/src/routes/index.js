import { Router } from 'express'
import bcrypt from 'bcryptjs'
import * as auth from '../services/auth.service.js'
import { buscarBootstrap } from '../repositories/bootstrap.repository.js'
import * as agendamentoRepo from '../repositories/agendamento.repository.js'
import * as vendaRepo from '../repositories/venda.repository.js'
import * as produtoRepo from '../repositories/produto.repository.js'
import * as clienteRepo from '../repositories/cliente.repository.js'
import { config } from '../config/env.js'
import { autenticar, exigirPerfil } from '../middleware/auth.js'
import { ErroDeNegocio, rota } from '../middleware/errors.js'

export const routes = Router()

/** Contexto derivado do JWT — é o que identifica o tenant de tudo. */
const ctx = (req) => ({
  tenantId: req.usuario.petshop_id,
  usuarioId: req.usuario.id,
})

// =====================================================================
// AUTENTICAÇÃO (RF18 / RF24)
// =====================================================================

routes.post('/auth/login', rota(async (req, res) => {
  const { email, senha } = req.body ?? {}
  if (!email || !senha) {
    throw new ErroDeNegocio('Informe e-mail e senha.', { status: 400 })
  }
  res.json(await auth.login({ email: String(email).trim().toLowerCase(), senha }))
}))

routes.post('/auth/cadastro', rota(async (req, res) => {
  const { nome, email, senha, telefone, endereco, consentimento } = req.body ?? {}
  if (!nome || !email || !senha) {
    throw new ErroDeNegocio('Nome, e-mail e senha são obrigatórios.', { status: 400 })
  }
  if (String(senha).length < 6) {
    throw new ErroDeNegocio('A senha deve ter ao menos 6 caracteres.', { status: 422 })
  }
  if (!consentimento) {
    throw new ErroDeNegocio(
      'É necessário autorizar o uso dos seus dados e dos dados de saúde do pet (LGPD).',
      { status: 422, codigo: 'LGPD_CONSENTIMENTO' },
    )
  }
  res.status(201).json(await auth.cadastrarCliente({
    nome, email: String(email).trim().toLowerCase(), telefone, endereco,
    senha, consentimento,
  }))
}))

routes.post('/auth/recuperar-senha', rota(async (req, res) => {
  res.json(await auth.solicitarRecuperacao({ email: String(req.body?.email ?? '').trim().toLowerCase() }))
}))

routes.post('/auth/redefinir-senha', rota(async (req, res) => {
  const { token, senha } = req.body ?? {}
  if (!token || !senha) {
    throw new ErroDeNegocio('Token e nova senha são obrigatórios.', { status: 400 })
  }
  res.json(await auth.redefinirSenha({ token, senha }))
}))

routes.get('/auth/eu', autenticar, rota(async (req, res) => {
  res.json({
    id: req.usuario.id,
    nome: req.usuario.nome,
    email: req.usuario.email,
    perfil: req.usuario.perfil,
    petshopId: req.usuario.petshop_id,
  })
}))

// =====================================================================
// BOOTSTRAP — snapshot no formato de src/data.ts
// =====================================================================

routes.get('/bootstrap', autenticar, rota(async (req, res) => {
  res.json(await buscarBootstrap(req.usuario.petshop_id))
}))

// =====================================================================
// CLIENTES E PETS (RF01–RF03)
// =====================================================================

routes.get('/clientes/:id/pets', autenticar, rota(async (req, res) => {
  res.json(await clienteRepo.listarPets(
    ctx(req), Number(req.params.id),
  ))
}))

routes.post('/clientes', autenticar, exigirPerfil('GESTOR'), rota(async (req, res) => {
  const { nome, email, telefone, endereco, senha, pet } = req.body ?? {}
  if (!nome || !email) {
    throw new ErroDeNegocio('Nome e e-mail são obrigatórios.', { status: 400 })
  }
  // Sem senha explícita, geramos uma temporária — o cliente pode
  // redefini-la pelo fluxo de recuperação (RF24).
  const senhaHash = await bcrypt.hash(
    senha ?? Math.random().toString(36).slice(2, 12),
    config.auth.bcryptRounds,
  )

  res.status(201).json(await clienteRepo.criar(ctx(req), {
    nome, email: String(email).trim().toLowerCase(), telefone, endereco, senhaHash, pet,
  }))
}))

// =====================================================================
// AGENDAMENTOS (RF04–RF06 / RN01, RN04, RN08)
// =====================================================================

routes.get('/agendamentos', autenticar, rota(async (req, res) => {
  const { rows } = await agendamentoRepo.listar(req.usuario.petshop_id)
  res.json(rows)
}))

routes.post('/agendamentos', autenticar, rota(async (req, res) => {
  const { petId, servicoId, colaboradorId, dataHora } = req.body ?? {}
  if (!petId || !servicoId || !colaboradorId || !dataHora) {
    throw new ErroDeNegocio(
      'Informe pet, serviço, profissional e horário.', { status: 400 },
    )
  }
  const criado = await agendamentoRepo.criar(ctx(req), {
    petId: Number(petId), servicoId: Number(servicoId),
    colaboradorId: Number(colaboradorId), dataHora,
  })
  res.status(201).json({ id: criado.id, status: 'confirmado' })
}))

routes.patch('/agendamentos/:id/remarcar', autenticar, rota(async (req, res) => {
  const { dataHora } = req.body ?? {}
  if (!dataHora) throw new ErroDeNegocio('Informe a nova data e hora.', { status: 400 })
  const alvo = await agendamentoRepo.remarcar(ctx(req), {
    id: Number(req.params.id), dataHora,
  })
  if (!alvo) throw new ErroDeNegocio('Agendamento não encontrado.', { status: 404 })
  res.json(alvo)
}))

routes.patch('/agendamentos/:id/cancelar', autenticar, rota(async (req, res) => {
  const alvo = await agendamentoRepo.cancelar(ctx(req), {
    id: Number(req.params.id), motivo: req.body?.motivo,
  })
  if (!alvo) throw new ErroDeNegocio('Agendamento não encontrado.', { status: 404 })
  res.json(alvo)
}))

routes.patch('/agendamentos/:id/concluir', autenticar, rota(async (req, res) => {
  const alvo = await agendamentoRepo.concluir(ctx(req), Number(req.params.id))
  if (!alvo) throw new ErroDeNegocio('Agendamento não encontrado ou não confirmado.', { status: 404 })
  res.json(alvo)
}))

// =====================================================================
// PDV — VENDAS (RF10 / RF25 / RF26 / RN02 / RN11)
// =====================================================================

routes.get('/vendas', autenticar, rota(async (req, res) => {
  const { rows } = await vendaRepo.listar(req.usuario.petshop_id)
  res.json(rows)
}))

routes.post('/vendas', autenticar, rota(async (req, res) => {
  const { clienteId, itens, pagamentos, desconto } = req.body ?? {}
  const venda = await vendaRepo.registrar(ctx(req), {
    clienteId: clienteId ? Number(clienteId) : null,
    itens, pagamentos, desconto,
  })
  res.status(201).json(venda)
}))

// RN11: o banco exige perfil GESTOR; a rota deixa explícito o mesmo requisito.
routes.post('/vendas/:id/estornar', autenticar, exigirPerfil('GESTOR'), rota(async (req, res) => {
  res.json(await vendaRepo.estornar(ctx(req), {
    id: Number(req.params.id), motivo: req.body?.motivo,
  }))
}))

// =====================================================================
// ESTOQUE (RF07–RF09 / RN05 / RN09)
// =====================================================================

routes.get('/produtos', autenticar, rota(async (req, res) => {
  const { rows } = await produtoRepo.listar(req.usuario.petshop_id)
  res.json(rows)
}))

routes.get('/produtos/alertas', autenticar, rota(async (req, res) => {
  res.json(await produtoRepo.alertas(req.usuario.petshop_id))
}))

routes.post('/produtos', autenticar, exigirPerfil('GESTOR'), rota(async (req, res) => {
  const { nome, categoria, preco } = req.body ?? {}
  if (!nome || !categoria || preco == null) {
    throw new ErroDeNegocio('Nome, categoria e preço são obrigatórios.', { status: 400 })
  }
  res.status(201).json(await produtoRepo.criar(ctx(req), req.body))
}))

routes.patch('/produtos/:id', autenticar, exigirPerfil('GESTOR'), rota(async (req, res) => {
  res.json(await produtoRepo.atualizar(ctx(req), { id: Number(req.params.id), ...req.body }))
}))

routes.post('/produtos/:id/entrada', autenticar, exigirPerfil('GESTOR'), rota(async (req, res) => {
  const { quantidade } = req.body ?? {}
  if (!quantidade || Number(quantidade) <= 0) {
    throw new ErroDeNegocio('Informe uma quantidade maior que zero.', { status: 422 })
  }
  res.json(await produtoRepo.registrarEntrada(ctx(req), {
    id: Number(req.params.id), quantidade: Number(quantidade), observacao: req.body?.observacao,
  }))
}))

routes.delete('/produtos/:id', autenticar, exigirPerfil('GESTOR'), rota(async (req, res) => {
  res.json(await produtoRepo.inativar(ctx(req), Number(req.params.id)))
}))