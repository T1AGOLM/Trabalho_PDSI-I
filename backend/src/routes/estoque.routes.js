import { Router } from 'express'
import { z } from 'zod'
import * as produtos from '../repositories/produto.repository.js'
import { contexto, autenticar, exigirPerfil } from '../middleware/auth.js'
import { ErroNaoEncontrado, rota } from '../middleware/errors.js'
import {
  validar, idParam, dataISO, dataOpcional, textoOpcional, booleanoOpcional,
  enumOpcional, inteiroOpcional, dinheiro, dinheiroOpcional,
} from '../middleware/validar.js'
import { schemaPaginacao, schemaOrdenacao, paginacao } from '../http/paginacao.js'

/**
 * Rotas de estoque (RF07–RF09, RF23 / RN02, RN05, RN09).
 *
 * Toda alteração de saldo passa por `movimentacao_estoque`; o saldo é
 * recalculado pelo gatilho do banco. Não existe rota que escreva
 * `quantidade_estoque` direto — de propósito (RNF09: trilha auditável).
 */
export const estoqueRoutes = Router()

const soAdmin = exigirPerfil('GESTOR', 'COLABORADOR')
const soGestor = exigirPerfil('GESTOR')

const queryProdutos = schemaPaginacao.merge(
  schemaOrdenacao(['nome', 'categoria', 'estoque', 'preco', 'validade']),
).merge(z.object({
  busca: textoOpcional(120),
  categoria: textoOpcional(60),
  ativo: booleanoOpcional(),
  abaixoMinimo: booleanoOpcional(),
  vencendoEm: inteiroOpcional(0, 365),
}))

estoqueRoutes.get('/produtos', autenticar, soAdmin, validar({ query: queryProdutos }), rota(async (req, res) => {
  res.json(await produtos.listar(contexto(req), { ...paginacao(req.consulta), ...req.consulta }))
}))

/** Alertas de estoque mínimo (RN05) e validade (RN09). */
estoqueRoutes.get('/produtos/alertas', autenticar, soAdmin, rota(async (req, res) => {
  res.json(await produtos.alertas(contexto(req)))
}))

estoqueRoutes.get('/produtos/:id', autenticar, soAdmin, validar({ params: idParam }), rota(async (req, res) => {
  const produto = await produtos.buscarPorId(contexto(req), req.paramsValidos.id)
  if (!produto) throw new ErroNaoEncontrado('Produto')
  res.json(produto)
}))

/** Histórico de movimentações (RF08 / RNF09) — entrada, saída, ajuste, estorno. */
estoqueRoutes.get('/produtos/:id/movimentacoes', autenticar, soAdmin,
  validar({
    params: idParam,
    query: schemaPaginacao.merge(z.object({
      tipo: enumOpcional(['entrada', 'saida', 'ajuste', 'estorno']),
      de: dataOpcional(),
      ate: dataOpcional(),
    })),
  }),
  rota(async (req, res) => {
    const produto = await produtos.buscarPorId(contexto(req), req.paramsValidos.id)
    if (!produto) throw new ErroNaoEncontrado('Produto')
    res.json(await produtos.movimentacoes(contexto(req), req.paramsValidos.id, {
      ...paginacao(req.consulta), ...req.consulta,
    }))
  }))

const corpoProduto = z.object({
  nome: z.string().trim().min(2).max(180),
  categoria: z.string().trim().min(2).max(60),
  sku: z.string().trim().max(60).optional(),
  preco: dinheiro,
  estoqueMinimo: inteiroOpcional(0, 100_000),
  quantidadeInicial: inteiroOpcional(0, 100_000),
  custoUnitario: dinheiroOpcional(),
  validade: dataISO.optional(),
  fornecedorId: z.coerce.number().int().positive().optional(),
})

estoqueRoutes.post('/produtos', autenticar, soGestor, validar({ corpo: corpoProduto }), rota(async (req, res) => {
  res.status(201).json(await produtos.criar(contexto(req), req.body))
}))

estoqueRoutes.patch('/produtos/:id', autenticar, soGestor,
  validar({ params: idParam, corpo: corpoProduto.partial().omit({ quantidadeInicial: true, custoUnitario: true }) }),
  rota(async (req, res) => {
    const atualizado = await produtos.atualizar(contexto(req), { id: req.paramsValidos.id, ...req.body })
    if (!atualizado) throw new ErroNaoEncontrado('Produto')
    res.json(atualizado)
  }))

/** Entrada de mercadoria: gestor e colaborador (é operação de balcão). */
estoqueRoutes.post('/produtos/:id/entrada', autenticar, soAdmin,
  validar({
    params: idParam,
    corpo: z.object({
      quantidade: z.coerce.number().int().positive().max(100_000),
      observacao: z.string().trim().max(255).optional(),
      validade: dataISO.optional(),
      custoUnitario: dinheiroOpcional(),
    }),
  }),
  rota(async (req, res) => {
    const atualizado = await produtos.registrarEntrada(contexto(req), { id: req.paramsValidos.id, ...req.body })
    if (!atualizado) throw new ErroNaoEncontrado('Produto')
    res.json(atualizado)
  }))

/** Ajuste de inventário (perda, quebra, contagem) — só gestor. */
estoqueRoutes.post('/produtos/:id/ajuste', autenticar, soGestor,
  validar({
    params: idParam,
    corpo: z.object({
      tipo: z.enum(['entrada', 'saida']),
      quantidade: z.coerce.number().int().positive().max(100_000),
      observacao: z.string().trim().max(255).optional(),
    }),
  }),
  rota(async (req, res) => {
    const atualizado = await produtos.registrarAjuste(contexto(req), { id: req.paramsValidos.id, ...req.body })
    if (!atualizado) throw new ErroNaoEncontrado('Produto')
    res.json(atualizado)
  }))

/** Exclusão lógica (RF03/RN03). */
estoqueRoutes.delete('/produtos/:id', autenticar, soGestor, validar({ params: idParam }), rota(async (req, res) => {
  const inativado = await produtos.inativar(contexto(req), req.paramsValidos.id)
  if (!inativado) throw new ErroNaoEncontrado('Produto')
  res.json(inativado)
}))

estoqueRoutes.post('/produtos/:id/reativar', autenticar, soGestor, validar({ params: idParam }), rota(async (req, res) => {
  const reativado = await produtos.reativar(contexto(req), req.paramsValidos.id)
  if (!reativado) throw new ErroNaoEncontrado('Produto')
  res.json(reativado)
}))
