import { z } from 'zod'

/**
 * Paginação e ordenação — contrato único para todas as listagens.
 *
 * Toda rota de coleção responde no mesmo envelope:
 *
 *   { dados: [...], pagina: 1, limite: 25, total: 137, paginas: 6 }
 */

export const LIMITE_PADRAO = 25
export const LIMITE_MAX = 100

export const schemaPaginacao = z.object({
  pagina: z.coerce.number().int().min(1).default(1),
  limite: z.coerce.number().int().min(1).max(LIMITE_MAX).default(LIMITE_PADRAO),
})

/** Converte `pagina`/`limite` em `offset`/`limite` para o SQL. */
export function paginacao({ pagina = 1, limite = LIMITE_PADRAO }) {
  return { pagina, limite, offset: (pagina - 1) * limite }
}

/** Schema de ordenação restrito às chaves aceitas por uma listagem. */
export const schemaOrdenacao = (chaves) =>
  z.object({
    ordenar: z.enum(chaves).optional(),
    direcao: z.enum(['asc', 'desc']).optional(),
  })

/**
 * Ordenação com allowlist.
 *
 * A coluna NUNCA vem da requisição direto para o SQL: o cliente escolhe
 * uma *chave* e o mapa decide a expressão. Isso preserva a consulta
 * parametrizada mesmo com `?ordenar=` saindo da URL.
 *
 *   montarOrdenacao(filtros, { nome: 'u.nome' }, 'nome')
 */
export function montarOrdenacao({ ordenar, direcao }, mapa, padrao) {
  const chave = Object.prototype.hasOwnProperty.call(mapa, ordenar ?? '') ? ordenar : padrao
  return {
    chave,
    sql: mapa[chave],
    direcao: String(direcao ?? 'asc').toLowerCase() === 'desc' ? 'DESC' : 'ASC',
  }
}
