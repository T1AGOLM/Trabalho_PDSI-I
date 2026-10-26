/**
 * Listagem paginada com total.
 *
 * O `total` precisa existir mesmo quando a página pedida está vazia (é o
 * que permite à interface desenhar "página 4 de 3" e voltar para a última
 * com dados). Por isso a contagem é uma consulta própria, e não um
 * `count(*) OVER ()` que desapareceria junto com as linhas.
 *
 * As duas consultas rodam na **mesma conexão e transação** do tenant: o
 * total enxerga exatamente o mesmo recorte (filtros + RLS) que as linhas.
 */
export async function listarPaginado(db, { totalSql, dadosSql, params = [], pagina, limite, offset }) {
  const [contagem, linhas] = await Promise.all([
    db.query(totalSql, params),
    db.query(`${dadosSql} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`, [...params, limite, offset]),
  ])

  const total = Number(contagem.rows[0]?.total ?? 0)
  return {
    dados: linhas.rows,
    pagina,
    limite,
    total,
    paginas: Math.max(1, Math.ceil(total / limite)),
  }
}
