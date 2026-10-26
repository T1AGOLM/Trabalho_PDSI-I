import { withTransaction } from '../db/pool.js'

/**
 * Indicadores do painel gerencial (RF14 / RF15 / RF23 / RNF01).
 *
 * Tudo é calculado em **uma transação e poucas consultas** que usam as
 * views e os índices criados para isso (`vw_faturamento`,
 * `vw_servicos_mais_vendidos`, `vw_ocupacao_agenda`, `vw_alerta_*`). O
 * painel é a tela mais pesada do sistema: fazer isso em laços, no
 * JavaScript, seria a diferença entre 60 ms e 2 segundos (RNF01).
 */
export function resumo({ tenantId }, { de, ate } = {}) {
  return withTransaction({ tenantId }, async (db) => {
    const [faturamento, serie, servicos, ocupacao, alertas, hoje, avaliacoes] = await Promise.all([
      // Faturamento de hoje, da semana e do mês — sempre em relação a agora.
      db.query(
        `SELECT
           COALESCE(sum(faturamento) FILTER (WHERE dia = CURRENT_DATE), 0) AS "hoje",
           COALESCE(sum(faturamento) FILTER (WHERE semana = date_trunc('week', CURRENT_DATE)::date), 0) AS "semana",
           COALESCE(sum(faturamento) FILTER (WHERE mes = date_trunc('month', CURRENT_DATE)::date), 0) AS "mes",
           COALESCE(sum(qtd_vendas) FILTER (WHERE dia = CURRENT_DATE), 0)::int AS "vendasHoje",
           COALESCE(sum(qtd_vendas), 0)::int AS "vendasMes",
           COALESCE(round(avg(faturamento_qtd), 2), 0) AS "ticketMedio"
         FROM (
           SELECT dia, semana, mes, qtd_vendas, faturamento, (faturamento / NULLIF(qtd_vendas,0)) AS faturamento_qtd
             FROM vw_faturamento WHERE petshop_id = $1
         ) t`,
        [tenantId],
      ),

      // Série dos últimos 30 dias para o gráfico.
      db.query(
        `SELECT to_char(d.dia, 'YYYY-MM-DD') AS dia,
                COALESCE(f.faturamento, 0) AS faturamento,
                COALESCE(f.qtd_vendas, 0)::int AS "qtdVendas"
           FROM generate_series(CURRENT_DATE - interval '29 days', CURRENT_DATE, interval '1 day') AS d(dia)
           LEFT JOIN vw_faturamento f ON f.dia = d.dia::date AND f.petshop_id = $1
          ORDER BY d.dia`,
        [tenantId],
      ),

      // Serviços mais vendidos (RF15).
      db.query(
        `SELECT nome, tipo::text, qtd_atendimentos AS "qtdAtendimentos", receita
           FROM vw_servicos_mais_vendidos
          WHERE petshop_id = $1
          ORDER BY qtd_atendimentos DESC, receita DESC
          LIMIT 10`,
        [tenantId],
      ),

      // Ocupação da agenda: minutos agendados contra minutos disponíveis
      // cadastrados na semana (RF15).
      db.query(
        `WITH disp AS (
           SELECT COALESCE(sum(
                    EXTRACT(EPOCH FROM (dc.hora_fim - dc.hora_inicio)) / 60
                  * (SELECT count(*) FROM generate_series(CURRENT_DATE - interval '29 days', CURRENT_DATE, interval '1 day') AS g(d)
                      WHERE EXTRACT(DOW FROM g.d)::smallint = dc.dia_semana)
                  ), 0)::bigint AS minutos_disponiveis
             FROM disponibilidade_colaborador dc
             JOIN usuario u ON u.id = dc.colaborador_id AND u.ativo
            WHERE dc.petshop_id = $1
         ),
         ocup AS (
           SELECT COALESCE(sum(minutos_ocupados), 0)::bigint AS minutos_ocupados,
                  COALESCE(sum(qtd_agendamentos), 0)::int  AS qtd
             FROM vw_ocupacao_agenda
            WHERE petshop_id = $1 AND dia >= CURRENT_DATE - 29
         )
         SELECT ocup.qtd AS "qtdAgendamentos",
                ocup.minutos_ocupados AS "minutosOcupados",
                disp.minutos_disponiveis AS "minutosDisponiveis",
                CASE WHEN disp.minutos_disponiveis > 0
                     THEN round((ocup.minutos_ocupados::numeric / disp.minutos_disponiveis) * 100, 1)
                     ELSE 0 END AS "taxaOcupacao"
           FROM ocup, disp`,
        [tenantId],
      ),

      // Alertas que a operação precisa ver primeiro (RF09/RF23).
      db.query(
        `SELECT (SELECT count(*)::int FROM vw_alerta_estoque_minimo WHERE petshop_id = $1) AS "estoqueMinimo",
                (SELECT count(*)::int FROM vw_alerta_validade     WHERE petshop_id = $1) AS validade,
                (SELECT count(*)::int FROM registro_saude r
                   JOIN petshop ps ON ps.id = r.petshop_id
                  WHERE r.petshop_id = $1 AND r.tipo = 'vacina'
                    AND r.proximo_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + ps.antecedencia_validade_d) AS "vacinas"`,
        [tenantId],
      ),

      // Agenda do dia, já achatada para a lista do painel.
      db.query(
        `SELECT a.id, petplus_data_hora_local(a.data_hora, ps.timezone) AS "dataHora",
                p.nome AS "petNome", u.nome AS "clienteNome", s.nome AS "servicoNome",
                uco.nome AS "colaboradorNome", a.status::text, a.valor
           FROM agendamento a
           JOIN petshop ps ON ps.id = a.petshop_id
           JOIN pet p      ON p.id = a.pet_id
           JOIN usuario u  ON u.id = a.cliente_id
           JOIN servico s  ON s.id = a.servico_id
           JOIN usuario uco ON uco.id = a.colaborador_id
          WHERE a.petshop_id = $1
            AND (a.data_hora AT TIME ZONE ps.timezone)::date = CURRENT_DATE
          ORDER BY a.data_hora`,
        [tenantId],
      ),

      db.query(
        `SELECT COALESCE(round(avg(nota)::numeric, 2), 0) AS media, count(*)::int AS total
           FROM avaliacao WHERE petshop_id = $1`,
        [tenantId],
      ),
    ])

    // `de`/`ate` restringem os indicadores de venda quando informados
    // (o painel padrão usa hoje/semana/mês).
    let periodo = null
    if (de || ate) {
      const filtro = []
      const params = [tenantId]
      if (de) { params.push(de); filtro.push(`(v.data_hora AT TIME ZONE ps.timezone)::date >= $${params.length}::date`) }
      if (ate) { params.push(ate); filtro.push(`(v.data_hora AT TIME ZONE ps.timezone)::date <= $${params.length}::date`) }
      const { rows } = await db.query(
        `SELECT count(*)::int AS "quantidade",
                COALESCE(sum(v.valor_total), 0) AS "faturamento",
                COALESCE(round(avg(v.valor_total), 2), 0) AS "ticketMedio"
           FROM venda v JOIN petshop ps ON ps.id = v.petshop_id
          WHERE v.petshop_id = $1 AND v.status = 'finalizada' AND ${filtro.join(' AND ')}`,
        params,
      )
      periodo = rows[0]
    }

    return {
      faturamento: faturamento.rows[0],
      serie: serie.rows,
      servicosMaisVendidos: servicos.rows,
      ocupacao: ocupacao.rows[0],
      alertas: alertas.rows[0],
      agendaHoje: hoje.rows,
      avaliacoes: avaliacoes.rows[0],
      periodo,
    }
  })
}
