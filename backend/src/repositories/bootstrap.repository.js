import { withTransaction } from '../db/pool.js'

/**
 * Repositório do "bootstrap": devolve, em UMA chamada, todo o estado do
 * tenant no formato EXATO que o protótipo usava em memória (`src/data.ts`).
 *
 * É a ponte de transição entre o front navegável e o banco. As 26 telas
 * leem `db.clientes`, `db.agendamentos`, etc. de forma síncrona; fornecer
 * esse snapshot uma vez mantém todas elas intactas enquanto os dados passam
 * a vir do PostgreSQL. O backend robusto vai substituir esta rota por
 * endpoints por recurso — as camadas acima continuam iguais.
 *
 * Tudo roda dentro de UMA transação com `app.petshop_id` definido: assim as
 * políticas de RLS se aplicam e o snapshot é consistente (nenhuma consulta
 * enxerga um estado diferente das outras).
 */

/** Deriva o texto de disponibilidade a partir das linhas normalizadas. */
const DISPONIBILIDADE = `
  SELECT string_agg(d.dia_abrev || ' ' || to_char(d.hora_inicio,'HH24:MI')
                    || '–' || to_char(d.hora_fim,'HH24:MI'), ', ' ORDER BY d.dia_semana)
    FROM (
      SELECT dc.colaborador_id, dc.dia_semana, dc.hora_inicio, dc.hora_fim,
             CASE dc.dia_semana
               WHEN 1 THEN 'Seg' WHEN 2 THEN 'Ter' WHEN 3 THEN 'Qua'
               WHEN 4 THEN 'Qui' WHEN 5 THEN 'Sex' WHEN 6 THEN 'Sáb'
               ELSE 'Dom' END AS dia_abrev
        FROM disponibilidade_colaborador dc
    ) d
   WHERE d.colaborador_id = co.usuario_id
`

export function buscarBootstrap(tenantId) {
  return withTransaction({ tenantId }, async (db) => {
    const [
      clientes, pets, colaboradores, servicos, agendamentos, bloqueios,
      produtos, fornecedores, vendas, registrosSaude, pacotes, avaliacoes,
      notificacoes, relatorios,
    ] = await Promise.all([
      db.query(`
        SELECT u.id, u.nome, u.email::text, u.telefone, u.ativo,
               c.endereco, c.pontos_fidelidade AS "pontosFidelidade"
          FROM cliente c
          JOIN usuario u ON u.id = c.usuario_id
         WHERE c.petshop_id = $1
         ORDER BY u.nome`, [tenantId]),

      db.query(`
        SELECT id, cliente_id AS "clienteId", nome, especie, raca, porte, idade,
               observacoes_saude AS "observacoesSaude", ativo
          FROM pet
         WHERE petshop_id = $1
         ORDER BY nome`, [tenantId]),

      db.query(`
        SELECT co.usuario_id AS id, u.nome, co.cargo::text, u.telefone,
               u.email::text, u.ativo, (${DISPONIBILIDADE}) AS disponibilidade
          FROM colaborador co
          JOIN usuario u ON u.id = co.usuario_id
         WHERE co.petshop_id = $1
         ORDER BY u.nome`, [tenantId]),

      db.query(`
        SELECT id, nome, tipo::text, duracao, preco
          FROM servico
         WHERE petshop_id = $1 AND ativo
         ORDER BY nome`, [tenantId]),

      // data_hora sai no formato local 'YYYY-MM-DD"T"HH24:MI' que o
      // protótipo usava — mesmo contrato, agora vindo do banco.
      // Colunas qualificadas com `a.` porque petshop também tem `id`.
      db.query(`
        SELECT a.id, a.pet_id AS "petId", a.cliente_id AS "clienteId",
               a.colaborador_id AS "colaboradorId", a.servico_id AS "servicoId",
               petplus_data_hora_local(a.data_hora, ps.timezone) AS "dataHora",
               a.status::text
          FROM agendamento a
          JOIN petshop ps ON ps.id = a.petshop_id
         WHERE a.petshop_id = $1
         ORDER BY a.data_hora`, [tenantId]),

      db.query(`
        SELECT id, colaborador_id AS "colaboradorId",
               data_inicio::text AS "dataInicio",
               data_fim::text    AS "dataFim",
               motivo
          FROM bloqueio_agenda
         WHERE petshop_id = $1
         ORDER BY data_inicio`, [tenantId]),

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

      db.query(`
        SELECT id, nome, cnpj, contato
          FROM fornecedor
         WHERE petshop_id = $1 AND ativo
         ORDER BY nome`, [tenantId]),

      // Itens e pagamentos vêm aninhados em JSON — é a única forma de
      // devolver a venda completa sem N+1.
      db.query(`
        SELECT v.id,
               petplus_data_hora_local(v.data_hora, ps.timezone) AS "dataHora",
               v.cliente_id AS "clienteId",
               v.valor_total AS "valorTotal", v.status::text,
               COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                          'produtoId',     iv.produto_id,
                          'nome',          iv.nome,
                          'quantidade',    iv.quantidade,
                          'precoUnitario', iv.preco_unitario
                        ) ORDER BY iv.id)
                   FROM item_venda iv WHERE iv.venda_id = v.id
               ), '[]'::jsonb) AS itens,
               COALESCE((
                 SELECT jsonb_agg(jsonb_build_object(
                          'formaPagamento', pg.forma_pagamento::text,
                          'valor',          pg.valor
                        ) ORDER BY pg.id)
                   FROM pagamento pg WHERE pg.venda_id = v.id
               ), '[]'::jsonb) AS pagamentos
          FROM venda v
          JOIN petshop ps ON ps.id = v.petshop_id
         WHERE v.petshop_id = $1
         ORDER BY v.data_hora DESC`, [tenantId]),

      db.query(`
        SELECT id, pet_id AS "petId", data::text, tipo::text, descricao
          FROM registro_saude
         WHERE petshop_id = $1
         ORDER BY data DESC, id DESC`, [tenantId]),

      // Uma linha por ASSINATURA, com os nomes dos serviços do plano —
      // é a forma que o protótipo exibia.
      db.query(`
        SELECT ap.id,
               ps.nome,
               ps.periodicidade,
               ps.preco,
               COALESCE((
                 SELECT array_agg(s.nome ORDER BY s.nome)
                   FROM pacote_servico_item psi
                   JOIN servico s ON s.id = psi.servico_id
                  WHERE psi.pacote_id = ap.pacote_id
               ), '{}') AS servicos,
               ap.cliente_id AS "clienteId", ap.pet_id AS "petId", ap.status::text
          FROM assinatura_pacote ap
          JOIN pacote_servico ps ON ps.id = ap.pacote_id
         WHERE ap.petshop_id = $1
         ORDER BY ap.id`, [tenantId]),

      db.query(`
        SELECT a.id, a.agendamento_id AS "agendamentoId", a.cliente_id AS "clienteId",
               a.nota, a.comentario,
               petplus_data_hora_local(a.data, tz.timezone) AS data
          FROM avaliacao a
          JOIN petshop tz ON tz.id = a.petshop_id
         WHERE a.petshop_id = $1
         ORDER BY a.data DESC`, [tenantId]),

      db.query(`
        SELECT n.id, n.canal::text, n.destinatario, n.mensagem,
               petplus_data_hora_local(n.data_envio, ps.timezone) AS "dataEnvio",
               n.lida
          FROM notificacao n
          JOIN petshop ps ON ps.id = n.petshop_id
         WHERE n.petshop_id = $1
         ORDER BY n.data_envio DESC`, [tenantId]),

      db.query(`
        SELECT r.id, r.tipo::text, r.formato::text, r.periodo,
               petplus_data_hora_local(r.data_geracao, ps.timezone) AS "dataGeracao",
               u.nome AS usuario
          FROM relatorio r
          JOIN usuario u ON u.id = r.usuario_id
          JOIN petshop ps ON ps.id = r.petshop_id
         WHERE r.petshop_id = $1
         ORDER BY r.data_geracao DESC`, [tenantId]),
    ])

    // Cada coluna já sai com o alias em camelCase — que é o contrato do
    // TypeScript do protótipo (src/types.ts). Nenhuma transformation é
    // feita aqui em JS: o formato nasce no SQL.
    return {
      clientes: clientes.rows,
      pets: pets.rows,
      colaboradores: colaboradores.rows,
      servicos: servicos.rows,
      agendamentos: agendamentos.rows,
      bloqueios: bloqueios.rows,
      produtos: produtos.rows,
      fornecedores: fornecedores.rows,
      vendas: vendas.rows,
      registrosSaude: registrosSaude.rows,
      pacotes: pacotes.rows,
      avaliacoes: avaliacoes.rows,
      notificacoes: notificacoes.rows,
      relatorios: relatorios.rows,
    }
  })
}