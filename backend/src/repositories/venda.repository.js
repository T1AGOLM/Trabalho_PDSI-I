import { withTransaction } from '../db/pool.js'

/**
 * Repositório de vendas (PDV).
 *
 * Uma venda mexe em três tabelas — `venda`, `item_venda`, `pagamento` —
 * e baixa o estoque em `movimentacao_estoque`. Tudo numa transação só:
 * ou a venda inteira é registrada com o estoque baixado, ou nada acontece.
 */

export const listar = (tenantId) =>
  withTransaction({ tenantId }, (db) =>
    db.query(`
      SELECT v.id,
             petplus_data_hora_local(v.data_hora, ps.timezone) AS "dataHora",
             v.cliente_id AS "clienteId",
             v.valor_total AS "valorTotal",
             v.status::text,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'produtoId', iv.produto_id, 'nome', iv.nome,
                        'quantidade', iv.quantidade, 'precoUnitario', iv.preco_unitario
                      ) ORDER BY iv.id)
                 FROM item_venda iv WHERE iv.venda_id = v.id
             ), '[]'::jsonb) AS itens,
             COALESCE((
               SELECT jsonb_agg(jsonb_build_object(
                        'formaPagamento', pg.forma_pagamento::text, 'valor', pg.valor
                      ) ORDER BY pg.id)
                 FROM pagamento pg WHERE pg.venda_id = v.id
             ), '[]'::jsonb) AS pagamentos
        FROM venda v
        JOIN petshop ps ON ps.id = v.petshop_id
       WHERE v.petshop_id = $1
       ORDER BY v.data_hora DESC`, [tenantId]),
  )

/**
 * Registra uma venda (RF10) com múltiplas formas de pagamento (RF25).
 *
 * `itens`: [{ produtoId, quantidade, precoUnitario? }]
 *   precoUnitario é opcional — quando ausente, usa o preço de tabela do
 *   produto no momento da venda (o preço praticado fica congelado em
 *   `item_venda.preco_unitario`, como exige o comprovante histórico).
 * `pagamentos`: [{ formaPagamento, valor }]
 */
export function registrar({ tenantId, usuarioId }, { clienteId, itens, pagamentos, desconto = 0 }) {
  return withTransaction({ tenantId, usuarioId }, async (db) => {
    if (!Array.isArray(itens) || itens.length === 0) {
      throw Object.assign(new Error('Adicione pelo menos um item à venda.'), { status: 422 })
    }
    if (!Array.isArray(pagamentos) || pagamentos.length === 0) {
      throw Object.assign(new Error('Informe ao menos uma forma de pagamento.'), { status: 422 })
    }

    // Trava os produtos involved ANTES de ler preço e saldo, para que duas
    // vendas simultâneas não leiam o mesmo saldo (write skew).
    const ids = [...new Set(itens.map((i) => Number(i.produtoId)))]
    const { rows: produtos } = await db.query(
      `SELECT id, nome, preco, quantidade_estoque, ativo
         FROM produto
        WHERE id = ANY($1::bigint[]) AND petshop_id = $2
        ORDER BY id
        FOR UPDATE`,
      [ids, tenantId],
    )
    if (produtos.length !== ids.length) {
      throw Object.assign(new Error('Um ou mais produtos não existem nesta unidade.'), { status: 422 })
    }

    const porId = new Map(produtos.map((p) => [p.id, p]))
    const total = itens.reduce((soma, item) => {
      const produto = porId.get(Number(item.produtoId))
      const preco = item.precoUnitario != null ? Number(item.precoUnitario) : Number(produto.preco)
      return soma + preco * Number(item.quantidade)
    }, 0)
    const liquido = Number((total - Number(desconto)).toFixed(2))

    // O gatilho trg_validar_pagamentos exige que a soma dos pagamentos
    // cubra o total; a checagem aqui devolve a mensagem antes do banco.
    const pago = pagamentos.reduce((s, p) => s + Number(p.valor), 0)
    if (Math.abs(pago - liquido) > 0.01) {
      throw Object.assign(
        new Error(
          `Pagamento incompleto: a soma das formas (R$ ${pago.toFixed(2)}) não cobre o total (R$ ${liquido.toFixed(2)}).`,
        ),
        { status: 422 },
      )
    }

    const { rows: vendaRows } = await db.query(
      `INSERT INTO venda (petshop_id, cliente_id, data_hora, valor_total, desconto, status, usuario_id)
       VALUES ($1, $2, now(), $3, $4, 'finalizada', $5)
       RETURNING id`,
      [tenantId, clienteId ?? null, liquido, Number(desconto), usuarioId],
    )
    const vendaId = vendaRows[0].id

    for (const item of itens) {
      const produto = porId.get(Number(item.produtoId))
      const quantidade = Number(item.quantidade)
      const preco = item.precoUnitario != null ? Number(item.precoUnitario) : Number(produto.preco)

      // RF08: a baixa é sempre via movimentação — o saldo é a projeção
      // da trilha, nunca uma escrita direta na coluna.
      await db.query(
        `INSERT INTO movimentacao_estoque
           (petshop_id, produto_id, tipo, quantidade, venda_id, usuario_id, observacao)
         VALUES ($1, $2, 'saida', $3, $4, $5, 'Venda PDV')`,
        [tenantId, produto.id, quantidade, vendaId, usuarioId],
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

    // Aviso de estoque mínimo (RF09 / RN05) disparado como notificação.
    const emAlerta = produtos.filter((p) => p.quantidade_estoque - itens
      .filter((i) => Number(i.produtoId) === p.id)
      .reduce((s, i) => s + Number(i.quantidade), 0) <= p.estoque_minimo)

    if (emAlerta.length > 0 && usuarioId) {
      await db.query(
        `INSERT INTO notificacao (petshop_id, usuario_id, canal, tipo, destinatario, mensagem)
         SELECT $1, u.id, 'e-mail', 'estoque_minimo', u.email::text, $2
           FROM usuario u
          WHERE u.petshop_id = $1 AND u.perfil = 'GESTOR' AND u.ativo`,
        [tenantId,
         `Alerta de estoque: ${emAlerta.map((p) => p.nome).join(', ')} atingiu o estoque mínimo.`],
      )
    }

    const { rows: completa } = await db.query(
      `SELECT v.id, v.valor_total, v.desconto, v.status::text,
              petplus_data_hora_local(v.data_hora, ps.timezone) AS data_hora
         FROM venda v
         JOIN petshop ps ON ps.id = v.petshop_id
        WHERE v.id = $1`,
      [vendaId],
    )
    return completa[0]
  })
}

/**
 * Estorna uma venda (RF26 / RN11).
 *
 * Reverte a baixa devolvendo o estoque. O banco exige perfil GESTOR e o
 * prazo comercial configurado no petshop — as duas regras são verificadas
 * pelo trigger `trg_validar_estorno`, não aqui.
 */
export const estornar = ({ tenantId, usuarioId }, { id, motivo }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows: venda } = await db.query(
      `SELECT id, status::text, cliente_id FROM venda WHERE id = $1 AND petshop_id = $2 FOR UPDATE`,
      [id, tenantId],
    )
    if (!venda[0]) throw Object.assign(new Error('Venda não encontrada.'), { status: 404 })
    if (venda[0].status === 'estornada') {
      throw Object.assign(new Error('Esta venda já está estornada.'), { status: 422 })
    }

    // Reverte o estoque item a item.
    const { rows: itens } = await db.query(
      `SELECT produto_id, quantidade FROM item_venda WHERE venda_id = $1`,
      [id],
    )
    for (const item of itens) {
      if (!item.produto_id) continue
      await db.query(
        `INSERT INTO movimentacao_estoque
           (petshop_id, produto_id, tipo, quantidade, venda_id, usuario_id, observacao)
         VALUES ($1, $2, 'estorno', $3, $4, $5, 'Estorno de venda')`,
        [tenantId, item.produto_id, item.quantidade, id, usuarioId],
      )
    }

    await db.query(
      `UPDATE venda
          SET status = 'estornada', estornado_em = now(),
              estornado_por = $3, motivo_estorno = $4
        WHERE id = $1 AND petshop_id = $2`,
      [id, tenantId, usuarioId, motivo ?? null],
    )

    return { id, status: 'estornada' }
  })