import { withTransaction } from '../db/pool.js'
import { criarFiltro } from '../db/filtros.js'
import { listarPaginado } from '../db/consultas.js'

/**
 * Repositório de relatórios (RF27).
 *
 * A tabela `relatorio` guarda o **metadado** de cada exportação gerada
 * (quem pediu, quando, de que tipo, em que formato e para que período).
 * O conteúdo é produzido sob demanda no `relatorio.service`, a partir das
 * consultas abaixo — nada de arquivo órfão no disco.
 */

export const listar = ({ tenantId }, { pagina, limite, offset, tipo, formato, de, ate }) =>
  withTransaction({ tenantId }, async (db) => {
    const f = criarFiltro()
    f.igual('r.petshop_id', tenantId).igual('r.tipo', tipo).igual('r.formato', formato)
      .entre('r.data_geracao::date', de, ate)

    const from = 'FROM relatorio r JOIN usuario u ON u.id = r.usuario_id'

    return listarPaginado(db, {
      totalSql: `SELECT count(*)::int AS total ${from} ${f.where()}`,
      dadosSql: `SELECT r.id, r.tipo::text, r.formato::text, r.periodo,
                        u.nome AS usuario, r.caminho_arquivo AS "caminhoArquivo",
                        petplus_data_hora_local(r.data_geracao, ps.timezone) AS "dataGeracao"
                   ${from} JOIN petshop ps ON ps.id = r.petshop_id
                   ${f.where()} ORDER BY r.data_geracao DESC`,
      params: f.parametros,
      pagina, limite, offset,
    })
  })

export const registrar = ({ tenantId, usuarioId }, { tipo, formato, periodo, caminhoArquivo }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO relatorio (petshop_id, tipo, formato, periodo, usuario_id, caminho_arquivo)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, tipo::text, formato::text, periodo`,
      [tenantId, tipo, formato, periodo, usuarioId, caminhoArquivo ?? null],
    )
    return rows[0]
  })

// ---------------------------------------------------------------------
// Dados de cada tipo de relatório
// ---------------------------------------------------------------------

const periodoDe = (filtro, coluna, de, ate) => {
  if (de) filtro.sql(`${coluna} >= ?::date`, de)
  if (ate) filtro.sql(`${coluna} <= ?::date`, ate)
}

/** Relatório de vendas: uma linha por venda, com formas de pagamento. */
async function dadosVendas(db, tenantId, { de, ate }) {
  const f = criarFiltro()
  f.igual('v.petshop_id', tenantId)
  periodoDe(f, '(v.data_hora AT TIME ZONE ps.timezone)::date', de, ate)

  const { rows } = await db.query(
    `SELECT v.id, petplus_data_hora_local(v.data_hora, ps.timezone) AS "dataHora",
            COALESCE(u.nome, 'Venda avulsa') AS cliente,
            v.status::text,
            v.valor_total AS "valorTotal", v.desconto,
            uop.nome AS operador,
            (SELECT string_agg(pg.forma_pagamento::text || ' ' || to_char(pg.valor, 'FM999999990.00'), ' + ' ORDER BY pg.id)
               FROM pagamento pg WHERE pg.venda_id = v.id) AS pagamentos,
            (SELECT string_agg(iv.quantidade || 'x ' || iv.nome, '; ' ORDER BY iv.id)
               FROM item_venda iv WHERE iv.venda_id = v.id) AS itens
       FROM venda v
       JOIN petshop ps ON ps.id = v.petshop_id
       JOIN usuario uop ON uop.id = v.usuario_id
       LEFT JOIN usuario u ON u.id = v.cliente_id
       ${f.where()}
      ORDER BY v.data_hora DESC`,
    f.parametros,
  )
  return rows
}

/** Relatório de agendamentos: ocupação e receita por atendimento. */
async function dadosAgendamentos(db, tenantId, { de, ate }) {
  const f = criarFiltro()
  f.igual('a.petshop_id', tenantId)
  periodoDe(f, '(a.data_hora AT TIME ZONE ps.timezone)::date', de, ate)

  const { rows } = await db.query(
    `SELECT petplus_data_hora_local(a.data_hora, ps.timezone) AS "dataHora",
            p.nome AS pet, ucl.nome AS tutor, s.nome AS servico,
            uco.nome AS profissional, a.status::text, a.valor,
            s.duracao AS "duracaoMinutos"
       FROM agendamento a
       JOIN petshop ps ON ps.id = a.petshop_id
       JOIN pet p ON p.id = a.pet_id
       JOIN usuario ucl ON ucl.id = a.cliente_id
       JOIN servico s ON s.id = a.servico_id
       JOIN usuario uco ON uco.id = a.colaborador_id
       ${f.where()}
      ORDER BY a.data_hora`,
    f.parametros,
  )
  return rows
}

/** Relatório de estoque: posição atual, valor imobilizado e alertas. */
async function dadosEstoque(db, tenantId) {
  const { rows } = await db.query(
    `SELECT p.nome, p.categoria, p.sku,
            p.quantidade_estoque AS "quantidadeEstoque",
            p.estoque_minimo AS "estoqueMinimo",
            to_char(p.validade, 'YYYY-MM-DD') AS validade,
            p.preco,
            (p.quantidade_estoque * p.preco) AS "valorEmEstoque",
            f.nome AS fornecedor,
            (p.quantidade_estoque <= p.estoque_minimo) AS "abaixoMinimo",
            (p.validade IS NOT NULL AND p.validade <= CURRENT_DATE + ps.antecedencia_validade_d) AS "validadeProxima"
       FROM produto p
       JOIN petshop ps ON ps.id = p.petshop_id
       LEFT JOIN fornecedor f ON f.id = p.fornecedor_id
      WHERE p.petshop_id = $1 AND p.ativo
      ORDER BY p.nome`,
    [tenantId],
  )
  return rows
}

/** Relatório financeiro: faturamento por dia e por forma de pagamento. */
async function dadosFinanceiro(db, tenantId, { de, ate }) {
  const f = criarFiltro()
  f.igual('v.petshop_id', tenantId)
  periodoDe(f, '(v.data_hora AT TIME ZONE ps.timezone)::date', de, ate)
  f.sql("v.status = 'finalizada'")

  const [porDia, porForma, totais] = await Promise.all([
    db.query(
      `SELECT to_char((v.data_hora AT TIME ZONE ps.timezone)::date, 'YYYY-MM-DD') AS dia,
              count(*)::int AS vendas,
              sum(v.valor_total) AS faturamento
         FROM venda v JOIN petshop ps ON ps.id = v.petshop_id
         ${f.where()}
        GROUP BY 1 ORDER BY 1`,
      f.parametros,
    ),
    db.query(
      `SELECT pg.forma_pagamento::text AS "formaPagamento",
              count(*)::int AS quantidade, sum(pg.valor) AS total
         FROM pagamento pg
         JOIN venda v ON v.id = pg.venda_id
         JOIN petshop ps ON ps.id = v.petshop_id
         ${f.where()}
        GROUP BY 1 ORDER BY 3 DESC`,
      f.parametros,
    ),
    db.query(
      `SELECT COALESCE(sum(v.valor_total), 0) AS faturamento,
              count(*)::int AS vendas,
              COALESCE(round(avg(v.valor_total), 2), 0) AS "ticketMedio"
         FROM venda v JOIN petshop ps ON ps.id = v.petshop_id
         ${f.where()}`,
      f.parametros,
    ),
  ])

  return { porDia: porDia.rows, porForma: porForma.rows, totais: totais.rows[0] }
}

/**
 * Despacha para a consulta do tipo pedido.
 * Devolve sempre `{ colunas, linhas }`, a forma que o gerador (CSV/PDF) usa.
 */
export async function dados({ tenantId }, { tipo, de, ate }) {
  return withTransaction({ tenantId }, async (db) => {
    switch (tipo) {
      case 'vendas':
        return {
          titulo: 'Relatório de vendas',
          colunas: [
            { campo: 'id', rotulo: 'Venda', largura: 45 },
            { campo: 'dataHora', rotulo: 'Data/hora', largura: 90 },
            { campo: 'cliente', rotulo: 'Cliente', largura: 100 },
            { campo: 'itens', rotulo: 'Itens', largura: 170 },
            { campo: 'pagamentos', rotulo: 'Pagamento', largura: 100 },
            { campo: 'valorTotal', rotulo: 'Total (R$)', largura: 60, dinheiro: true, alinhamento: 'right' },
            { campo: 'status', rotulo: 'Status', largura: 55 },
            { campo: 'operador', rotulo: 'Operador', largura: 80 },
          ],
          linhas: await dadosVendas(db, tenantId, { de, ate }),
        }

      case 'agendamentos':
        return {
          titulo: 'Relatório de agendamentos',
          colunas: [
            { campo: 'dataHora', rotulo: 'Data/hora', largura: 90 },
            { campo: 'pet', rotulo: 'Pet', largura: 85 },
            { campo: 'tutor', rotulo: 'Tutor', largura: 100 },
            { campo: 'servico', rotulo: 'Serviço', largura: 100 },
            { campo: 'profissional', rotulo: 'Profissional', largura: 100 },
            { campo: 'duracaoMinutos', rotulo: 'Dur. (min)', largura: 50, alinhamento: 'right' },
            { campo: 'valor', rotulo: 'Valor (R$)', largura: 60, dinheiro: true, alinhamento: 'right' },
            { campo: 'status', rotulo: 'Status', largura: 60 },
          ],
          linhas: await dadosAgendamentos(db, tenantId, { de, ate }),
        }

      case 'estoque':
        return {
          titulo: 'Relatório de estoque',
          colunas: [
            { campo: 'nome', rotulo: 'Produto', largura: 150 },
            { campo: 'categoria', rotulo: 'Categoria', largura: 80 },
            { campo: 'quantidadeEstoque', rotulo: 'Saldo', largura: 45, alinhamento: 'right' },
            { campo: 'estoqueMinimo', rotulo: 'Mínimo', largura: 45, alinhamento: 'right' },
            { campo: 'validade', rotulo: 'Validade', largura: 70 },
            { campo: 'preco', rotulo: 'Preço (R$)', largura: 60, dinheiro: true, alinhamento: 'right' },
            { campo: 'valorEmEstoque', rotulo: 'Em estoque (R$)', largura: 75, dinheiro: true, alinhamento: 'right' },
            { campo: 'fornecedor', rotulo: 'Fornecedor', largura: 90 },
          ],
          linhas: await dadosEstoque(db, tenantId),
        }

      case 'financeiro': {
        const dados = await dadosFinanceiro(db, tenantId, { de, ate })
        return {
          titulo: 'Relatório financeiro',
          colunas: [
            { campo: 'dia', rotulo: 'Dia', largura: 80 },
            { campo: 'vendas', rotulo: 'Vendas', largura: 55, alinhamento: 'right' },
            { campo: 'faturamento', rotulo: 'Faturamento (R$)', largura: 90, dinheiro: true, alinhamento: 'right' },
            { campo: 'formaPagamento', rotulo: 'Forma (total do período)', largura: 120 },
            { campo: 'total', rotulo: 'Total (R$)', largura: 80, dinheiro: true, alinhamento: 'right' },
          ],
          linhas: mesclarFinanceiro(dados),
          totais: dados.totais,
          resumoFormas: dados.porForma,
        }
      }

      default:
        throw Object.assign(new Error(`Tipo de relatório desconhecido: ${tipo}`), { status: 422 })
    }
  })
}

/**
 * O financeiro tem duas visões (por dia e por forma de pagamento). Em vez
 * de dois arquivos, o CSV sai com as duas seções na mesma planilha — o dia
 * na primeira coluna e a forma na quarta.
 */
function mesclarFinanceiro({ porDia, porForma }) {
  const tamanho = Math.max(porDia.length, porForma.length)
  const linhas = []
  for (let i = 0; i < tamanho; i++) {
    linhas.push({
      dia: porDia[i]?.dia ?? '',
      vendas: porDia[i]?.vendas ?? '',
      faturamento: porDia[i]?.faturamento ?? '',
      formaPagamento: porForma[i]?.formaPagamento ?? '',
      total: porForma[i]?.total ?? '',
    })
  }
  return linhas
}
