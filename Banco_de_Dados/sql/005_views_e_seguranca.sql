-- =====================================================================
-- PetPlus — Modelo Físico de Dados
-- 005_views_e_seguranca.sql
-- ---------------------------------------------------------------------
-- Views de leitura (alertas RF09/RN05/RN09, indicadores RF14/RF15) e
-- isolamento multi-tenant via Row-Level Security (RNF13).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. ALERTAS DE ESTOQUE E VALIDADE
-- ---------------------------------------------------------------------

-- RF09 / RN05: produtos que atingiram ou ficaram abaixo do estoque mínimo.
CREATE OR REPLACE VIEW vw_alerta_estoque_minimo AS
SELECT p.id, p.petshop_id, p.nome, p.categoria,
       p.quantidade_estoque, p.estoque_minimo,
       (p.estoque_minimo - p.quantidade_estoque) AS deficit
  FROM produto p
 WHERE p.ativo
   AND p.quantidade_estoque <= p.estoque_minimo;

-- RF23 / RN09: produtos vencendo em 30 dias ou menos (prazo por tenant).
CREATE OR REPLACE VIEW vw_alerta_validade AS
SELECT p.id, p.petshop_id, p.nome, p.categoria, p.validade,
       p.quantidade_estoque,
       (p.validade - CURRENT_DATE) AS dias_para_vencer
  FROM produto p
  JOIN petshop ps ON ps.id = p.petshop_id
 WHERE p.ativo
   AND p.validade IS NOT NULL
   AND p.validade <= CURRENT_DATE + ps.antecedencia_validade_d;

-- ---------------------------------------------------------------------
-- 2. INDICADORES DO PAINEL GERENCIAL (RF14 / RF15)
-- ---------------------------------------------------------------------

-- Faturamento por dia / semana / mês — base do Dashboard.
CREATE OR REPLACE VIEW vw_faturamento AS
SELECT v.petshop_id,
       v.data_hora::date                                    AS dia,
       date_trunc('week',  v.data_hora)::date                AS semana,
       date_trunc('month', v.data_hora)::date                AS mes,
       count(*)                                             AS qtd_vendas,
       COALESCE(sum(v.valor_total - v.desconto), 0)          AS faturamento
  FROM venda v
 WHERE v.status = 'finalizada'
 GROUP BY 1, 2, 3, 4;

-- Serviços mais vendidos (RF15).
CREATE OR REPLACE VIEW vw_servicos_mais_vendidos AS
SELECT a.petshop_id, s.id AS servico_id, s.nome, s.tipo,
       count(*)                     AS qtd_atendimentos,
       COALESCE(sum(a.valor), 0)    AS receita
  FROM agendamento a
  JOIN servico s ON s.id = a.servico_id
 WHERE a.status = 'concluído'
 GROUP BY 1, 2, 3, 4;

-- Taxa de ocupação da agenda (RF15): minutos agendados / minutos disponíveis.
CREATE OR REPLACE VIEW vw_ocupacao_agenda AS
SELECT a.petshop_id,
       (a.data_hora AT TIME ZONE 'America/Sao_Paulo')::date AS dia,
       count(*)                                     AS qtd_agendamentos,
       COALESCE(sum(EXTRACT(EPOCH FROM (a.data_hora_fim - a.data_hora)) / 60), 0)::bigint
                                                  AS minutos_ocupados
  FROM agendamento a
 WHERE a.status <> 'cancelado'
 GROUP BY 1, 2;

-- ---------------------------------------------------------------------
-- 3. VIEWS DE APOIO AO FRONTEND
-- ---------------------------------------------------------------------

-- Agenda expandida: uma linha já vem pronta para renderização.
CREATE OR REPLACE VIEW vw_agenda AS
SELECT a.id, a.petshop_id, a.pet_id, a.cliente_id, a.colaborador_id, a.servico_id,
       a.data_hora, a.status, a.valor, a.observacoes,
       petplus_data_hora_local(a.data_hora) AS data_hora_local,
       p.nome  AS pet_nome, p.raca AS pet_raca, p.especie AS pet_especie,
       ucl.nome AS cliente_nome, ucl.email AS cliente_email,
       ucol.nome AS colaborador_nome, col.cargo AS colaborador_cargo,
       s.nome  AS servico_nome, s.tipo AS servico_tipo,
       s.duracao AS servico_duracao
  FROM agendamento a
  JOIN pet         p    ON p.id   = a.pet_id
  -- nome/e-mail moram na tabela base `usuario` (herança de Usuario).
  JOIN cliente     cl   ON cl.usuario_id = a.cliente_id
  JOIN usuario     ucl  ON ucl.id = cl.usuario_id
  JOIN colaborador col  ON col.usuario_id = a.colaborador_id
  JOIN usuario     ucol ON ucol.id = col.usuario_id
  JOIN servico     s    ON s.id   = a.servico_id;

-- Comprovante de venda (RF10): cabeçalho + itens + pagamentos.
CREATE OR REPLACE VIEW vw_comprovante_venda AS
SELECT v.id AS venda_id, v.petshop_id, v.data_hora, v.valor_total, v.desconto,
       v.status,
       (v.valor_total - v.desconto) AS total_liquido,
       iv.id AS item_id, iv.nome AS item_nome, iv.quantidade,
       iv.preco_unitario, iv.subtotal,
       pg.forma_pagamento, pg.valor AS valor_pago
  FROM venda v
  LEFT JOIN item_venda iv ON iv.venda_id = v.id
  LEFT JOIN pagamento  pg ON pg.venda_id = v.id;

-- ---------------------------------------------------------------------
-- 4. MULTI-TENANT — ROW LEVEL SECURITY (RNF13)
-- ---------------------------------------------------------------------
-- A aplicação, no início de CADA transação, executa:
--     SET LOCAL app.petshop_id = '<id do tenant logado>';
-- A partir daí o banco só enxerga as linhas do tenant corrente. Mesmo que
-- a camada de aplicação cometa um erro e esqueça um WHERE, o vazamento
-- entre petshops é bloqueado aqui.
-- ---------------------------------------------------------------------

DO $$
DECLARE
  t text;
  tabelas_tenant text[] := ARRAY[
    'usuario','cliente','colaborador','gestor','token_recuperacao',
    'disponibilidade_colaborador','pet','registro_saude','servico',
    'agendamento','bloqueio_agenda','avaliacao','pacote_servico',
    'pacote_servico_item','assinatura_pacote','fornecedor','produto',
    'lote','venda','item_venda','pagamento','auditoria',
    'notificacao','relatorio','movimentacao_estoque'
  ];
BEGIN
  FOREACH t IN ARRAY tabelas_tenant LOOP
    EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY', t);

    -- Leitura e escrita só dentro do tenant da sessão.
    EXECUTE format($f$
      CREATE POLICY tenant_isolamento_select ON %I
        FOR SELECT USING (petshop_id = current_setting('app.petshop_id', true)::bigint)
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY tenant_isolamento_insert ON %I
        FOR INSERT WITH CHECK (petshop_id = current_setting('app.petshop_id', true)::bigint)
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY tenant_isolamento_update ON %I
        FOR UPDATE USING (petshop_id = current_setting('app.petshop_id', true)::bigint)
        WITH CHECK (petshop_id = current_setting('app.petshop_id', true)::bigint)
    $f$, t);

    EXECUTE format($f$
      CREATE POLICY tenant_isolamento_delete ON %I
        FOR DELETE USING (petshop_id = current_setting('app.petshop_id', true)::bigint)
    $f$, t);
  END LOOP;
END;
$$;

-- `petshop` não tem petshop_id: o tenant só enxerga a si mesmo.
ALTER TABLE petshop ENABLE ROW LEVEL SECURITY;
ALTER TABLE petshop FORCE  ROW LEVEL SECURITY;
CREATE POLICY petshop_own ON petshop
  FOR ALL USING (id = current_setting('app.petshop_id', true)::bigint)
  WITH CHECK (id = current_setting('app.petshop_id', true)::bigint);

-- ---------------------------------------------------------------------
-- 5. PAPEL DE APLICAÇÃO
-- ---------------------------------------------------------------------
-- O backend conecta com `petplus_app`, que NÃO é dono das tabelas — por isso
-- as políticas RLS acima se aplicam a ele de fato (o dono sempre ignoraria).
-- ---------------------------------------------------------------------
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'petplus_app') THEN
    CREATE ROLE petplus_app LOGIN PASSWORD 'petplus_app';
  END IF;
END;
$$;

GRANT USAGE ON SCHEMA public TO petplus_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO petplus_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO petplus_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO petplus_app;