import { z } from 'zod'

/**
 * Validação de entrada com zod.
 *
 * Toda rota declara o formato do que aceita. O validador:
 *
 *   1. **rejeita** o que não bate (422 com a lista de campos), e
 *   2. **remove o que não foi declarado** — o zod descarta chaves
 *      desconhecidas por padrão, então um `{"petshop_id": 2}` mandado pelo
 *      cliente nunca chega ao repositório.
 *
 * É a barreira que impede *mass assignment* e boa parte do abuso de payload.
 */
export function validar({ corpo, query, params } = {}) {
  return (req, _res, next) => {
    try {
      // O corpo validado substitui o cru: daqui para frente só existe o que
      // foi declarado, já com tipos convertidos.
      if (corpo) req.body = corpo.parse(req.body ?? {})
      if (query) req.consulta = query.parse(req.query ?? {})
      if (params) req.paramsValidos = params.parse(req.params ?? {})
      next()
    } catch (err) {
      next(err)
    }
  }
}

/** Consulta já validada (ou um default, quando a rota não declara schema). */
export const consulta = (req, padrao = {}) => req.consulta ?? padrao

/** `:id` numérico — usado por quase toda rota de recurso. */
export const idParam = z.object({ id: z.coerce.number().int().positive() })

/** Data no formato `YYYY-MM-DD` (contrato do front) ou string vazia. */
export const dataISO = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use o formato AAAA-MM-DD')

/** Data e hora local `YYYY-MM-DDTHH:MM` — o formato que o banco converte via `petplus_para_ts`. */
export const dataHoraLocal = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Use o formato AAAA-MM-DDTHH:MM')

export const dinheiro = z.coerce.number().nonnegative().max(9_999_999.99)
export const inteiroPositivo = z.coerce.number().int().positive()

/**
 * Filtros vindos da query string chegam como texto e podem vir vazios
 * (`?status=`) — que significa "sem filtro", não "valor vazio". Estes
 * ajudantes fazem essa tradução uma vez, em vez de em cada rota.
 */
const vazioEhAusente = (schema) => z.preprocess((v) => (v === '' ? undefined : v), schema.optional())

export const textoOpcional = (max = 200) => vazioEhAusente(z.string().trim().max(max))
export const idOpcional = () => vazioEhAusente(z.coerce.number().int().positive())
export const booleanoOpcional = () =>
  vazioEhAusente(z.enum(['true', 'false', '1', '0']).transform((v) => v === 'true' || v === '1'))
export const enumOpcional = (valores) => vazioEhAusente(z.enum(valores))
export const dataOpcional = () => vazioEhAusente(dataISO)
export const dataHoraOpcional = () => vazioEhAusente(dataHoraLocal)
export const inteiroOpcional = (min = 0, max = 100_000) =>
  vazioEhAusente(z.coerce.number().int().min(min).max(max))
export const dinheiroOpcional = () => vazioEhAusente(dinheiro)

/** Telefone brasileiro em formato livre (mantém a flexibilidade do protótipo). */
export const telefone = z.string().trim().min(8).max(20)

/** E-mail normalizado: sempre minúsculo para casar com a coluna CITEXT. */
export const email = z.string().trim().toLowerCase().email('Informe um e-mail válido')

/**
 * Política de senha (RNF02/RNF06): mínimo 8 caracteres, com letra e número.
 * O protótipo usava 6; a regra nova vale para cadastro e redefinição.
 */
export const senha = z
  .string()
  .min(8, 'A senha deve ter ao menos 8 caracteres.')
  .max(72, 'A senha não pode passar de 72 caracteres (limite do bcrypt).')
  .regex(/[A-Za-zÀ-ÿ]/, 'A senha deve conter ao menos uma letra.')
  .regex(/\d/, 'A senha deve conter ao menos um número.')
