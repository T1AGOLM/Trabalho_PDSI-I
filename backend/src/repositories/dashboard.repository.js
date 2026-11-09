import { withTransaction } from '../db/pool.js'

/** Indicadores RF14/RF15 calculados no fuso da unidade, sem datas de demonstração. */
export function resumo({ tenantId }, { de, ate } = {}) {
  return withTransaction({ tenantId }, async (db) => {
    const unidade = (await db.query('SELECT id, nome, timezone FROM petshop WHERE id = $1', [tenantId])).rows[0]
    // CURRENT_DATE e as views passam a respeitar o fuso do petshop nesta transação.
    await db.query("SELECT set_config('TimeZone', $1, true)", [unidade.timezone])
    const dataReferencia = (await db.query("SELECT to_char(CURRENT_DATE, 'YYYY-MM-DD') AS dia")).rows[0].dia
    // valor_total já é líquido do desconto no PDV; não descontar novamente.
    const faturamento = await db.query(`
      WITH vendas AS (
        SELECT (data_hora AT TIME ZONE $2)::date AS dia, valor_total
          FROM venda WHERE petshop_id = $1 AND status = 'finalizada'
      )
      SELECT COALESCE(sum(valor_total) FILTER (WHERE dia = CURRENT_DATE), 0) AS hoje,
             COALESCE(sum(valor_total) FILTER (WHERE dia BETWEEN date_trunc('week', CURRENT_DATE)::date AND CURRENT_DATE), 0) AS semana,
             COALESCE(sum(valor_total) FILTER (WHERE dia BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE), 0) AS mes,
             count(*) FILTER (WHERE dia = CURRENT_DATE)::int AS "vendasHoje",
             count(*) FILTER (WHERE dia BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE)::int AS "vendasMes",
             COALESCE(round(avg(valor_total) FILTER (WHERE dia BETWEEN date_trunc('month', CURRENT_DATE)::date AND CURRENT_DATE), 2), 0) AS "ticketMedio"
        FROM vendas`, [tenantId, unidade.timezone])
    const serie = await db.query(`
      WITH vendas AS (
        SELECT (data_hora AT TIME ZONE $2)::date AS dia, sum(valor_total) AS faturamento, count(*)::int AS qtd
          FROM venda WHERE petshop_id = $1 AND status = 'finalizada' GROUP BY 1
      )
      SELECT to_char(d.dia, 'YYYY-MM-DD') AS dia, COALESCE(v.faturamento, 0) AS faturamento,
             COALESCE(v.qtd, 0)::int AS "qtdVendas"
        FROM generate_series(CURRENT_DATE - 6, CURRENT_DATE, interval '1 day') d(dia)
        LEFT JOIN vendas v ON v.dia = d.dia::date ORDER BY d.dia`, [tenantId, unidade.timezone])
    const servicos = await db.query(`SELECT nome, tipo::text, qtd_atendimentos AS "qtdAtendimentos", receita
      FROM vw_servicos_mais_vendidos WHERE petshop_id = $1 ORDER BY qtd_atendimentos DESC, receita DESC LIMIT 10`, [tenantId])
    const ocupacao = await db.query(`
      WITH dias AS (
        SELECT d::date AS dia FROM generate_series(date_trunc('week', CURRENT_DATE), date_trunc('week', CURRENT_DATE) + interval '6 days', interval '1 day') g(d)
      ), disp AS (
        SELECT COALESCE(sum(EXTRACT(EPOCH FROM (dc.hora_fim - dc.hora_inicio)) / 60), 0) AS minutos
          FROM dias JOIN disponibilidade_colaborador dc ON dc.dia_semana = EXTRACT(DOW FROM dias.dia)::smallint
          JOIN usuario u ON u.id = dc.colaborador_id AND u.ativo
         WHERE dc.petshop_id = $1 AND NOT EXISTS (
           SELECT 1 FROM bloqueio_agenda b WHERE b.petshop_id = $1 AND b.colaborador_id = dc.colaborador_id AND dias.dia BETWEEN b.data_inicio AND b.data_fim)
      ), ocup AS (
        SELECT COALESCE(sum(EXTRACT(EPOCH FROM (a.data_hora_fim - a.data_hora)) / 60), 0) AS minutos, count(*)::int AS qtd
          FROM agendamento a WHERE a.petshop_id = $1 AND a.status <> 'cancelado'
           AND (a.data_hora AT TIME ZONE $2)::date BETWEEN date_trunc('week', CURRENT_DATE)::date AND date_trunc('week', CURRENT_DATE)::date + 6
      )
      SELECT ocup.qtd AS "qtdAgendamentos", ocup.minutos AS "minutosOcupados", disp.minutos AS "minutosDisponiveis",
        CASE WHEN disp.minutos > 0 THEN round(ocup.minutos / disp.minutos * 100, 1) ELSE 0 END AS "taxaOcupacao" FROM disp, ocup`, [tenantId, unidade.timezone])
    const alertas = await db.query(`SELECT
      (SELECT count(*)::int FROM vw_alerta_estoque_minimo WHERE petshop_id = $1) AS "estoqueMinimo",
      (SELECT count(*)::int FROM vw_alerta_validade WHERE petshop_id = $1) AS validade,
      (SELECT count(*)::int FROM registro_saude r JOIN petshop ps ON ps.id = r.petshop_id
       WHERE r.petshop_id = $1 AND r.tipo = 'vacina' AND r.proximo_vencimento BETWEEN CURRENT_DATE AND CURRENT_DATE + ps.antecedencia_validade_d) AS vacinas`, [tenantId])
    const hoje = await db.query(`SELECT a.id, petplus_data_hora_local(a.data_hora, ps.timezone) AS "dataHora",
      p.nome AS "petNome", s.nome AS "servicoNome", uco.nome AS "colaboradorNome", a.status::text, a.valor
      FROM agendamento a JOIN petshop ps ON ps.id = a.petshop_id JOIN pet p ON p.id = a.pet_id
      JOIN servico s ON s.id = a.servico_id JOIN usuario uco ON uco.id = a.colaborador_id
      WHERE a.petshop_id = $1 AND (a.data_hora AT TIME ZONE ps.timezone)::date = CURRENT_DATE ORDER BY a.data_hora`, [tenantId])
    const avaliacoes = await db.query('SELECT COALESCE(round(avg(nota)::numeric, 2), 0) AS media, count(*)::int AS total FROM avaliacao WHERE petshop_id = $1', [tenantId])
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

    return { unidade, dataReferencia, faturamento: faturamento.rows[0], serie: serie.rows,
      servicosMaisVendidos: servicos.rows, ocupacao: ocupacao.rows[0], alertas: alertas.rows[0],
      agendaHoje: hoje.rows, avaliacoes: avaliacoes.rows[0], periodo }
  })
}
