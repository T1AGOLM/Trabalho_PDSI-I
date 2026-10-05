import { withTransaction } from '../db/pool.js'

/**
 * Repositório de produtos/estoque.
 *
 * `quantidade_estoque` nunca é escrita diretamente: todo saldo novo vem de
 * uma linha em `movimentacao_estoque` (RF08). Isso mantém o histórico
 * auditável e faz o gatilho de estoque mínimo (RN05) funcionar para
 * qualquer origem de baixa — venda, uso em serviço ou ajuste manual.
 */

export const listar = (tenantId) =>
  withTransaction({ tenantId }, (db) =>
    db.query(`
      SELECT id, nome, categoria,
             quantidade_estoque AS "quantidadeEstoque",
             estoque_minimo     AS "estoqueMinimo",
             validade::text     AS validade,
             preco,
             fornecedor_id      AS "fornecedorId"
        FROM produto
       WHERE petshop_id = $1 AND ativo
       ORDER BY nome`, [tenantId]),
  )

/** Alertas de estoque mínimo (RN05) e validade (RN09). */
export const alertas = (tenantId) =>
  withTransaction({ tenantId }, async (db) => {
    const [estoque, validade] = await Promise.all([
      db.query('SELECT id, nome, quantidade_estoque, estoque_minimo FROM vw_alerta_estoque_minimo'),
      db.query('SELECT id, nome, validade, dias_para_vencer FROM vw_alerta_validade'),
    ])
    return { estoque: estoque.rows, validade: validade.rows }
  })

export const criar = ({ tenantId, usuarioId }, dados) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO produto
         (petshop_id, fornecedor_id, nome, categoria, sku, estoque_minimo, validade, preco)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       RETURNING id, nome, categoria,
                 quantidade_estoque AS "quantidadeEstoque",
                 estoque_minimo     AS "estoqueMinimo",
                 validade::text     AS validade,
                 preco,
                 fornecedor_id      AS "fornecedorId"`,
      [tenantId, dados.fornecedorId ?? null, dados.nome, dados.categoria,
       dados.sku ?? null, dados.estoqueMinimo ?? 0, dados.validade || null, dados.preco],
    )

    // Estoque inicial também passa pela trilha de movimentações.
    if (Number(dados.quantidadeInicial) > 0) {
      await db.query(
        `INSERT INTO movimentacao_estoque
           (petshop_id, produto_id, tipo, quantidade, usuario_id, observacao)
         VALUES ($1,$2,'entrada',$3,$4,'Cadastro do produto')`,
        [tenantId, rows[0].id, Number(dados.quantidadeInicial), usuarioId],
      )
      const { rows: atualizado } = await db.query(
        'SELECT id, quantidade_estoque AS "quantidadeEstoque" FROM produto WHERE id = $1',
        [rows[0].id],
      )
      rows[0].quantidadeEstoque = atualizado[0].quantidadeEstoque
    }
    return rows[0]
  })

export const atualizar = ({ tenantId, usuarioId }, { id, ...dados }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE produto
          SET nome = COALESCE($3, nome),
              categoria = COALESCE($4, categoria),
              estoque_minimo = COALESCE($5, estoque_minimo),
              validade = COALESCE($6, validade),
              preco = COALESCE($7, preco),
              fornecedor_id = $8
        WHERE id = $1 AND petshop_id = $2
        RETURNING id, nome, categoria,
                  quantidade_estoque AS "quantidadeEstoque",
                  estoque_minimo     AS "estoqueMinimo",
                  validade::text     AS validade,
                  preco,
                  fornecedor_id      AS "fornecedorId"`,
      [id, tenantId, dados.nome ?? null, dados.categoria ?? null,
       dados.estoqueMinimo ?? null, dados.validade || null, dados.preco ?? null,
       dados.fornecedorId ?? null],
    )
    if (!rows[0]) throw Object.assign(new Error('Produto não encontrado.'), { status: 404 })
    return rows[0]
  })

/** Entrada de mercadoria: soma na trilha, o gatilho atualiza o saldo. */
export const registrarEntrada = ({ tenantId, usuarioId }, { id, quantidade, observacao }) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO movimentacao_estoque
         (petshop_id, produto_id, tipo, quantidade, usuario_id, observacao)
       SELECT petshop_id, id, 'entrada', $3, $2, $4
         FROM produto WHERE id = $1 AND petshop_id = $5
       RETURNING produto_id`,
      [id, usuarioId, Number(quantidade), observacao ?? 'Entrada de estoque', tenantId],
    )
    if (!rows[0]) throw Object.assign(new Error('Produto não encontrado.'), { status: 404 })

    const { rows: produto } = await db.query(
      'SELECT id, quantidade_estoque AS "quantidadeEstoque" FROM produto WHERE id = $1',
      [id],
    )
    return produto[0]
  })

/** Exclusão lógica (RF03): o produto sai das listagens, o histórico fica. */
export const inativar = ({ tenantId, usuarioId }, id) =>
  withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query(
      `UPDATE produto SET ativo = false WHERE id = $1 AND petshop_id = $2 RETURNING id`,
      [id, tenantId],
    )
    if (!rows[0]) throw Object.assign(new Error('Produto não encontrado.'), { status: 404 })
    return rows[0]
  })