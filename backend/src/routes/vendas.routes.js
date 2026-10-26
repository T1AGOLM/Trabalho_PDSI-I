import { Router } from 'express'
import { z } from 'zod'
import * as vendas from '../repositories/venda.repository.js'
import { contexto, autenticar, exigirPerfil } from '../middleware/auth.js'
import { ErroNaoEncontrado, rota } from '../middleware/errors.js'
import {
  validar, idParam, dataOpcional, textoOpcional, idOpcional, enumOpcional, inteiroOpcional, dinheiroOpcional,
} from '../middleware/validar.js'
import { schemaPaginacao, schemaOrdenacao, paginacao } from '../http/paginacao.js'

/**
 * Rotas do PDV (RF10, RF25, RF26 / RN02, RN11).
 *
 * A venda é uma transação só no banco: itens, pagamentos, baixa de
 * estoque e pontos de fidelidade. O estorno exige perfil GESTOR e o prazo
 * comercial do petshop — validado por gatilho, não aqui.
 */
export const vendasRoutes = Router()

const soOperacao = exigirPerfil('GESTOR', 'COLABORADOR')

const queryVendas = schemaPaginacao.merge(schemaOrdenacao(['data', 'valor', 'cliente', 'status'])).merge(
  z.object({
    de: dataOpcional(),
    ate: dataOpcional(),
    clienteId: idOpcional(),
    status: enumOpcional(['finalizada', 'estornada']),
    formaPagamento: enumOpcional(['dinheiro', 'débito', 'crédito', 'PIX']),
    busca: textoOpcional(120),
  }),
)

/** GET /vendas — histórico com itens e pagamentos aninhados (sem N+1). */
vendasRoutes.get('/vendas', autenticar, soOperacao, validar({ query: queryVendas }), rota(async (req, res) => {
  res.json(await vendas.listar(contexto(req), { ...paginacao(req.consulta), ...req.consulta }))
}))

/** GET /vendas/resumo — totais do período (RF14). */
vendasRoutes.get('/vendas/resumo', autenticar, soOperacao,
  validar({ query: z.object({ de: dataOpcional(), ate: dataOpcional() }) }),
  rota(async (req, res) => {
    res.json(await vendas.resumo(contexto(req), req.consulta))
  }))

/** GET /vendas/:id — comprovante completo (RF10). */
vendasRoutes.get('/vendas/:id', autenticar, soOperacao, validar({ params: idParam }), rota(async (req, res) => {
  const venda = await vendas.buscarPorId(contexto(req), req.paramsValidos.id)
  if (!venda) throw new ErroNaoEncontrado('Venda')
  res.json(venda)
}))

const corposVenda = z.object({
  clienteId: z.coerce.number().int().positive().nullish(),
  agendamentoId: z.coerce.number().int().positive().nullish(),
  desconto: dinheiroOpcional(),
  itens: z.array(z.object({
    produtoId: z.coerce.number().int().positive(),
    quantidade: z.coerce.number().int().positive().max(10_000),
    precoUnitario: dinheiroOpcional(),
  })).min(1, 'Adicione pelo menos um item à venda.'),
  pagamentos: z.array(z.object({
    formaPagamento: z.enum(['dinheiro', 'débito', 'crédito', 'PIX']),
    valor: z.coerce.number().positive().max(9_999_999.99),
  })).min(1, 'Informe ao menos uma forma de pagamento.'),
})

/**
 * POST /vendas — registra a venda (RF10/RF25).
 * RN02 (estoque suficiente) e RF25 (pagamentos fecham o total) são
 * verificadas pelo banco; a mensagem de erro vem traduzida.
 */
vendasRoutes.post('/vendas', autenticar, soOperacao, validar({ corpo: corposVenda }), rota(async (req, res) => {
  res.status(201).json(await vendas.registrar(contexto(req), req.body))
}))

/** POST /vendas/:id/estornar — só gestor, dentro do prazo (RN11). */
vendasRoutes.post('/vendas/:id/estornar', autenticar, exigirPerfil('GESTOR'),
  validar({ params: idParam, corpo: z.object({ motivo: z.string().trim().max(200).optional() }) }),
  rota(async (req, res) => {
    res.json(await vendas.estornar(contexto(req), { id: req.paramsValidos.id, motivo: req.body.motivo }))
  }))
