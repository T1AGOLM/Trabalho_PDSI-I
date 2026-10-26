/**
 * Construtor de `WHERE` parametrizado.
 *
 * Existe para que nenhuma rota precise concatenar SQL: cada método
 * adiciona um parâmetro posicional ($1, $2, …) e devolve o próprio
 * objeto, permitindo encadear filtros opcionais sem `if` espalhado.
 *
 *   const f = criarFiltro()
 *   f.igual('p.petshop_id', tenantId).ilike('p.nome', busca).intervalo(...)
 *   db.query(`SELECT ... FROM produto p ${f.where()} ORDER BY p.nome LIMIT $2 OFFSET $3`, f.parametros)
 *
 * Regra de ouro: **a coluna é sempre literal do código** (nunca entra por
 * parâmetro do usuário); o valor do usuário sempre entra como parâmetro.
 */
export function criarFiltro() {
  const partes = []
  const parametros = []

  const add = (valor) => {
    parametros.push(valor)
    return `$${parametros.length}`
  }

  const api = {
    parametros,

    /** `coluna = valor` — ignorado quando o valor não foi informado. */
    igual(coluna, valor) {
      if (valor === undefined || valor === null || valor === '') return api
      partes.push(`${coluna} = ${add(valor)}`)
      return api
    },

    diferente(coluna, valor) {
      if (valor === undefined || valor === null || valor === '') return api
      partes.push(`${coluna} IS DISTINCT FROM ${add(valor)}`)
      return api
    },

    /** Busca textual case-insensitive. O curinga vai no valor, não no SQL. */
    contem(coluna, valor) {
      const texto = String(valor ?? '').trim()
      if (!texto) return api
      partes.push(`${coluna} ILIKE ${add(`%${texto}%`)}`)
      return api
    },

    /** Busca textual em qualquer uma das colunas (`a ILIKE %x% OR b ILIKE %x%`). */
    contemAlgum(colunas, valor) {
      const texto = String(valor ?? '').trim()
      if (!texto) return api
      const curinga = add(`%${texto}%`)
      partes.push(`(${colunas.map((c) => `${c} ILIKE ${curinga}`).join(' OR ')})`)
      return api
    },

    /** Pertence a uma lista (`= ANY(...)`), ignorado quando vazia. */
    emLista(coluna, valores) {
      if (!Array.isArray(valores) || valores.length === 0) return api
      partes.push(`${coluna} = ANY(${add(valores)}::bigint[])`)
      return api
    },

    /** `coluna BETWEEN de AND ate`, aceitando só um dos lados. */
    entre(coluna, de, ate) {
      if (de !== undefined && de !== null && de !== '') partes.push(`${coluna} >= ${add(de)}`)
      if (ate !== undefined && ate !== null && ate !== '') partes.push(`${coluna} <= ${add(ate)}`)
      return api
    },

    /** Condição booleana simples: `filtro.verdadeiro('p.ativo', true)`. */
    booleano(coluna, valor) {
      if (valor === undefined || valor === null || valor === '') return api
      const v = valor === true || valor === 'true' || valor === '1'
      partes.push(`${coluna} = ${add(v)}`)
      return api
    },

    /** Escape para um pedaço de SQL literal do código. */
    sql(texto, ...valores) {
      const marcadores = valores.map(add)
      partes.push(texto.replace(/\?/g, () => marcadores.shift()))
      return api
    },

    get vazio() {
      return partes.length === 0
    },

    where() {
      return partes.length ? `WHERE ${partes.join(' AND ')}` : ''
    },
  }

  return api
}

/**
 * Junta um `WHERE` extra ao já produzido, sem quebrar o encadeamento:
 * útil quando o repositório precisa de um predicado fixo (ex.: o filtro
 * de alerta de validade que depende do petshop).
 */
export function juntar(filtro, condicao) {
  filtro.sql(condicao)
  return filtro
}
