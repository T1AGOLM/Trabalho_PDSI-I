import { withTransaction } from '../db/pool.js'
import { criarFiltro } from '../db/filtros.js'
import { listarPaginado } from '../db/consultas.js'
import { montarOrdenacao } from '../http/paginacao.js'

/**
 * Repositório de vendas — PDV (RF10 / RF25 / RF26 / RN02 / RN11 / RF20).
 *
 * Uma venda mexe em `venda`, `item_venda`, `pagamento`, `movimentacao_estoque`
 * e `fidelidade_movimentacao`. Tudo na MESMA transação: ou a venda inteira
 * existe com o estoque baixado e os pontos creditados, ou nada acontece.
 */

const ITENS_JSON = `
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
             'produtoId', iv.produto_id, 'nome', iv.nome,
             'quantidade', iv.quantidade, 'precoUnitario', iv.preco_unitario,
             'subtotal', iv.subtotal) ORDER BY iv.id)
            FROM item_venda iv WHERE iv.venda_id = v.id), '[]'::jsonb)`

const PAGAMENTOS_JSON = `
  COALESCE((SELECT jsonb_agg(jsonb_build_object(
             'formaPagamento', pg.forma_pagamento::text, 'valor', pg.valor) ORDER BY pg.id)
            FROM pagamento pg WHERE pg.venda_id = v.id), '[]'::jsonb)`

const CAMPOS = `
  v.id,
  petplus_data_hora_local(v.data_hora, ps.timezone) AS "dataHora",
  v.cliente_id AS "clienteId", u.nome AS "clienteNome",
  v.agendamento_id AS "agendamentoId",
  v.valor_total AS "valorTotal", v.desconto, (v.valor_total) AS "totalLiquido",
  v.status::text, v.usuario_id AS "usuarioId", uop.nome AS "operadorNome",
  v.motivo_estorno AS "motivoEstorno",
  petplus_data_hora_local(v.estornado_em, ps.timezone) AS "estornadoEm",
  uest.nome AS "estornadoPorNome",
  ${ITENS_JSON} AS itens, ${PAGAMENTOS_JSON} AS pagamentos`

const FROM = `
  FROM venda v
  JOIN petshop ps ON ps.id = v.petshop_id
  JOIN usuario uop ON uop.id = v.usuario_id
  LEFT JOIN usuario u ON u.id = v.cliente_id
  LEFT JOIN usuario uest ON uest.id = v.estornado_por`

const ORDENACAO = { data: 'v.data_hora', valor: 'v.valor_total', cliente: 'u.nome', status: 'v.status' }

export function listar({ tenantId }, { pagina, limite, offset, de, ate, clienteId, status,
  formaPagamento, busca, ordenar, direcao }) {
  return withTransaction({ tenantId }, async (db) => {
    const f = criarFiltro()
    f.igual('v.petshop_id', tenantId)
      .igual('v.cliente_id', clienteId)
      .igual('v.status', status)
      .contemAlgum(['u.nome', 'uop.nome'], busca)
    if (de) f.sql('(v.data_hora AT TIME ZONE ps.timezone)::date >= ?::date', de)
    if (ate) f.sql('(v.data_hora AT TIME ZONE ps.timezone)::date <= ?::date', ate)
    if (formaPagamento) {
      f.sql('EXISTS (SELECT 1 FROM pagamento pg WHERE pg.venda_id = v.id AND pg.forma_pagamento = ?::forma_pagamento)', formaPagamento)
    }

    const ord = montarOrdenacao({ ordenar, direcao }, ORDENACAO, 'data')
    const direcaoFinal = ordenar ? ord.direcao : 'DESC'

    return listarPaginado(db, {
      totalSql: `SELECT count(*)::int AS total ${FROM} ${f.where()}`,
      dadosSql: `SELECT ${CAMPOS} ${FROM} ${f.where()} ORDER BY ${ord.sql} ${direcaoFinal}`,
      params: f.parametros,
      pagina, limite, offset,
    })
  })
}

/** Aceita uma conexão já em transação (ver comentário em cliente.repository). */
export const buscarPorId = ({ tenantId }, id, db) => {
  const executar = async (conn) => {
    const { rows } = await conn.query(`SELECT ${CAMPOS} ${FROM} WHERE v.id = $1 AND v.petshop_id = $2`, [id, tenantId])
    return rows[0] ?? null
  }
  return db ? executar(db) : withTransaction({ tenantId }, executar)
}

/**
 * Registra uma venda (RF10) com múltiplas formas de pagamento (RF25).
 *
 * `itens`: [{ produtoId, quantidade, precoUnitario? }] — preço ausente usa
 * o preço de tabela atual; o praticado fica congelado em
 * `item_venda.preco_unitario` (o comprovante histórico não muda depois).
 * `pagamentos`: [{ formaPagamento, valor }]
 */
export function registrar({ tenantId, usuarioId }, { clienteId, agendamentoId, itens, pagamentos, desconto = 0, observacoes }) {
  return withTransaction({ tenantId, usuarioId }, async (db) => {
    if (!Array.isArray(itens) || itens.length === 0) {
      throw Object.assign(new Error('Adicione pelo menos um item à venda.'), { status: 422 })
    }
    if (!Array.isArray(pagamentos) || pagamentos.length === 0) {
      throw Object.assign(new Error('Informe ao menos uma forma de pagamento.'), { status: 422 })
    }

    // Trava os produtos ANTES de ler preço e saldo: duas vendas simultâneas
    // do mesmo item entram em fila em vez de lerem o mesmo saldo (write skew).
    const ids = [...new Set(itens.map((i) => Number(i.produtoId)))].filter((n) => Number.isFinite(n) && n > 0)
    const { rows: produtos } = await db.query(
      `SELECT id, nome, preco, quantidade_estoque, ativo
         FROM produto
        WHERE id = ANY($1::bigint[]) AND petshop_id = $2
        ORDER BY id
        FOR UPDATE`,
      [ids.length > 0 ? ids : [0], tenantId],
    )
    const porId = new Map(produtos.map((p) => [p.id, p]))

    for (const item of itens) {
      const produto = porId.get(Number(item.produtoId))
      if (!produto) {
        throw Object.assign(new Error(`Produto ${item.produtoId} não existe nesta unidade.`), { status: 422 })
      }
      if (!produto.ativo) {
        throw Object.assign(new Error(`Produto ${produto.nome} está inativo e não pode ser vendido.`), { status: 422 })
      }
    }

    const total = itens.reduce((soma, item) => {
      const produto = porId.get(Number(item.produtoId))
      const preco = item.precoUnitario != null ? Number(item.precoUnitario) : Number(produto.preco)
      return soma + preco * Number(item.quantidade)
    }, 0)
    const liquido = Number((total - Number(desconto)).toFixed(2))

    // O gatilho deferido `trg_validar_pagamentos` fecha a conta no COMMIT;
    // esta checagem antecipada devolve a mensagem sem ida e volta perdida.
    const pago = pagamentos.reduce((s, p) => s + Number(p.valor), 0)
    if (Math.abs(pago - liquido) > 0.01) {
      throw Object.assign(
        new Error(`Pagamento incompleto: a soma das formas (R$ ${pago.toFixed(2)}) não cobre o total (R$ ${liquido.toFixed(2)}).`),
        { status: 422 },
      )
    }

    const { rows: vendaRows } = await db.query(
      `INSERT INTO venda (petshop_id, cliente_id, agendamento_id, data_hora, valor_total, desconto, status, usuario_id)
       VALUES ($1, $2, $3, now(), $4, $5, 'finalizada', $6)
       RETURNING id`,
      [tenantId, clienteId ?? null, agendamentoId ?? null, liquido, Number(desconto), usuarioId],
    )
    const vendaId = vendaRows[0].id

    for (const item of itens) {
      const produto = porId.get(Number(item.produtoId))
      const quantidade = Number(item.quantidade)
      const preco = item.precoUnitario != null ? Number(item.precoUnitario) : Number(produto.preco)

      // RF08: a baixa é sempre via movimentação — o saldo é a projeção da
      // trilha, nunca uma escrita direta na coluna.
      await db.query(
        `INSERT INTO movimentacao_estoque
           (petshop_id, produto_id, tipo, quantidade, venda_id, usuario_id, observacao)
         VALUES ($1, $2, 'saida', $3, $4, $5, $6)`,
        [tenantId, produto.id, quantidade, vendaId, usuarioId, `Venda PDV #${vendaId}`],
      )

      await db.query(
        `INSERT INTO item_venda (petshop_id, venda_id, produto_id, nome, quantidade, preco_unitario, subtotal)
         VALUES ($1, $2, $3, $4, $5, $6, $7)`,
        [tenantId, vendaId, produto.id, produto.nome, quantidade, preco,
         Number((preco * quantidade).toFixed(2))],
      )
    }

    for (const pagamento of pagamentos) {
      await db.query(
        `INSERT INTO pagamento (petshop_id, venda_id, forma_pagamento, valor)
         VALUES ($1, $2, $3, $4)`,
        [tenantId, vendaId, pagamento.formaPagamento, Number(pagamento.valor)],
      )
    }

    // Atendimento pago no PDV vira concluído (RF10 + RF17) e credita pontos.
    let clienteParaPontos = clienteId ?? null
    if (agendamentoId) {
      const agendamento = await db.query(
        `UPDATE agendamento SET status = 'concluído'
          WHERE id = $1 AND petshop_id = $2 AND status = 'confirmado'
          RETURNING cliente_id`,
        [agendamentoId, tenantId],
      )
      if (agendamento.rows[0]) clienteParaPontos = agendamento.rows[0].cliente_id
    }

    // RF20: pontos de fidelidade pela venda vinculada a um tutor.
    if (clienteParaPontos) {
      const taxa = await db.query('SELECT pontos_por_real FROM petshop WHERE id = $1', [tenantId])
      const pontos = Math.floor(liquido * Number(taxa.rows[0]?.pontos_por_real ?? 0))
      if (pontos > 0) {
        await db.query(
          `INSERT INTO fidelidade_movimentacao (petshop_id, cliente_id, tipo, pontos, descricao, venda_id, usuario_id)
           VALUES ($1, $2, 'credito', $3, $4, $5, $6)`,
          [tenantId, clienteParaPontos, pontos, `Compra no PDV #${vendaId}`, vendaId, usuarioId],
        )
      }
    }

    // Aviso de estoque mínimo (RF09/RN05) vira linha na fila de notificação.
    const emAlerta = produtos.filter((p) => p.quantidade_estoque - itens
      .filter((i) => Number(i.produtoId) === p.id)
      .reduce((s, i) => s + Number(i.quantidade), 0) <= p.estoque_minimo)

    if (emAlerta.length > 0) {
      await db.query(
        `INSERT INTO notificacao (petshop_id, usuario_id, canal, tipo, destinatario, mensagem, agendado_para)
         SELECT $1, u.id, 'e-mail', 'estoque_minimo', u.email::text, $2, now()
           FROM usuario u
          WHERE u.petshop_id = $1 AND u.perfil = 'GESTOR' AND u.ativo`,
        [tenantId,
         `Alerta de estoque (RN05): ${emAlerta.map((p) => p.nome).join(', ')} atingiu o estoque mínimo.`],
      )
    }

    return buscarPorId({ tenantId }, vendaId, db)
  })
}

/**
 * Estorna uma venda (RF26 / RN11).
 *
 * Reverte a baixa devolvendo o estoque, debita os pontos creditados e
 * marca a venda. O banco exige perfil GESTOR e o prazo comercial do
 * petshop (`trg_validar_estorno`) — a regra não é reimplementada aqui.
 */
export const estornar = ({ tenantId, usuarioId }, { id, motivo }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows: venda } = await db.query(
      'SELECT id, status::text, cliente_id FROM venda WHERE id = $1 AND petshop_id = $2 FOR UPDATE',
      [id, tenantId],
    )
    if (!venda[0]) throw Object.assign(new Error('Venda não encontrada.'), { status: 404 })
    if (venda[0].status === 'estornada') {
      throw Object.assign(new Error('Esta venda já está estornada.'), { status: 422 })
    }

    const { rows: itens } = await db.query(
      'SELECT produto_id, quantidade FROM item_venda WHERE venda_id = $1 AND petshop_id = $2',
      [id, tenantId],
    )
    for (const item of itens) {
      if (!item.produto_id) continue
      await db.query(
        `INSERT INTO movimentacao_estoque
           (petshop_id, produto_id, tipo, quantidade, venda_id, usuario_id, observacao)
         VALUES ($1, $2, 'estorno', $3, $4, $5, $6)`,
        [tenantId, item.produto_id, item.quantidade, id, usuarioId, `Estorno da venda #${id}`],
      )
    }

    // RF20: estornar a compra também estorna os pontos ganhos com ela.
    const { rows: creditos } = await db.query(
      `SELECT id, cliente_id, pontos FROM fidelidade_movimentacao
        WHERE venda_id = $1 AND petshop_id = $2 AND tipo = 'credito'`,
      [id, tenantId],
    )
    for (const credito of creditos) {
      const jaDebitado = await db.query(
        `SELECT 1 FROM fidelidade_movimentacao
          WHERE venda_id = $1 AND petshop_id = $2 AND tipo = 'debito'`,
        [id, tenantId],
      )
      if (jaDebitado.rowCount > 0) continue
      // Se o cliente já gastou os pontos, o débito estoura RN07 e o estorno
      // inteiro é revertido — o gestor decide como resolver (ajuste manual).
      await db.query(
        `INSERT INTO fidelidade_movimentacao (petshop_id, cliente_id, tipo, pontos, descricao, venda_id, usuario_id)
         VALUES ($1, $2, 'debito', $3, $4, $5, $6)`,
        [tenantId, credito.cliente_id, credito.pontos, `Estorno da compra no PDV #${id}`, id, usuarioId],
      )
    }

    await db.query(
      `UPDATE venda
          SET status = 'estornada', estornado_em = now(), estornado_por = $3, motivo_estorno = $4
        WHERE id = $1 AND petshop_id = $2`,
      [id, tenantId, usuarioId, motivo ?? null],
    )

    return buscarPorId({ tenantId }, id, db)
  })

/** Totais do período (RF14) — usados pelo Dashboard e pelo histórico. */
export const resumo = ({ tenantId }, { de, ate }) =>
  withTransaction({ tenantId }, async (db) => {
    const f = criarFiltro()
    f.igual('v.petshop_id', tenantId)
    if (de) f.sql('(v.data_hora AT TIME ZONE ps.timezone)::date >= ?::date', de)
    if (ate) f.sql('(v.data_hora AT TIME ZONE ps.timezone)::date <= ?::date', ate)

    const { rows } = await db.query(
      `SELECT count(*)::int AS "quantidade",
              COALESCE(sum(v.valor_total) FILTER (WHERE v.status = 'finalizada'), 0) AS "faturamento",
              COALESCE(sum(v.valor_total) FILTER (WHERE v.status = 'estornada'), 0) AS "estornado",
              COALESCE(avg(v.valor_total) FILTER (WHERE v.status = 'finalizada'), 0) AS "ticketMedio"
         FROM venda v
         JOIN petshop ps ON ps.id = v.petshop_id
         ${f.where()}`,
      f.parametros,
    )
    return rows[0]
  })
