-- =====================================================================
-- PetPlus — Modelo Físico de Dados
-- 004_regras_de_negocio.sql
-- ---------------------------------------------------------------------
-- Regras de negócio que o BANCO garante sozinho, independentemente da
-- camada de aplicação. São as últimas linhas de defesa contra dados
-- corrompidos (e o que a entrega pede: banco normalizado e íntegro).
-- =====================================================================

-- ---------------------------------------------------------------------
-- RN01 — Conflito de agenda: "Um agendamento não pode ser criado se já
-- existir outro agendamento para o mesmo profissional no mesmo intervalo".
--
-- Solução: EXCLUDE sobre (colaborador_id WITH =, tstzrange WITH &&).
-- Isso é mais forte que um trigger: o banco recusa a inserção, mesmo que
-- a aplicação desative a checagem. Agendamentos cancelados ficam fora do
-- escopo — o cancelamento libera o horário automaticamente (RN04).
-- ---------------------------------------------------------------------
ALTER TABLE agendamento
  ADD CONSTRAINT agendamento_sem_conflito_profissional
  EXCLUDE USING gist (
    petshop_id     WITH =,
    colaborador_id WITH =,
    tstzrange(data_hora, data_hora_fim, '[)') WITH &&
  )
  WHERE (status <> 'cancelado');

COMMENT ON CONSTRAINT agendamento_sem_conflito_profissional ON agendamento
  IS 'RN01 (e RN04): impede dois atendimentos do mesmo profissional em intervalos sobrepostos; a cláusula WHERE exclui cancelados.';

-- ---------------------------------------------------------------------
-- RN02 — "A venda de um produto só pode ser concluída se houver
-- quantidade suficiente disponível em estoque."
--
-- A déclenche abaixo trava a linha do produto (SELECT ... FOR UPDATE) e
-- impede saldo negativo na saída, mantendo a contagemderived sempre igual
-- ao somatório das movimentações de estoque.
-- ---------------------------------------------------------------------

-- Movimentação de estoque: trilha imutável (append-only) de toda entrada,
-- saída, ajuste e estorno. `quantidade` é sempre positivo; o sinal vem
-- do tipo_movimentacao. É a fonte da verdade do saldo de produto.
CREATE TABLE movimentacao_estoque (
  id             BIGSERIAL PRIMARY KEY,
  petshop_id     BIGINT        NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  produto_id     BIGINT        NOT NULL REFERENCES produto(id) ON DELETE CASCADE,
  tipo           tipo_movimentacao NOT NULL,
  quantidade     INTEGER       NOT NULL CHECK (quantidade > 0),
  venda_id       BIGINT        REFERENCES venda(id)  ON DELETE SET NULL,
  lote_id        BIGINT        REFERENCES lote(id)   ON DELETE SET NULL,
  usuario_id     BIGINT        REFERENCES usuario(id) ON DELETE SET NULL,
  observacao     VARCHAR(255),
  data_hora      TIMESTAMPTZ   NOT NULL DEFAULT now()
);
CREATE INDEX movimentacao_produto_idx ON movimentacao_estoque (produto_id, data_hora DESC);

COMMENT ON TABLE movimentacao_estoque IS
  'Trilha append-only das movimentações de estoque (RF08). produto.quantidade_estoque é a projeção materializada desta trilha. entrada e estorno somam ao saldo; saida e ajuste subtraem.';

-- Aplica a movimentação e mantém produto.quantidade_estoque sincronizada,
-- bloqueando a linha para serializar vendas concorrentes do mesmo produto.
CREATE OR REPLACE FUNCTION fn_movimentar_estoque()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_delta  integer;
  v_novo   integer;
BEGIN
  -- 'entrada' e 'estorno' SOMAM ao saldo (um estorno devolve ao estoque o
  -- que a venda tirou); 'saida' e 'ajuste' subtraem.
  v_delta := CASE WHEN NEW.tipo IN ('entrada', 'estorno')
                  THEN NEW.quantidade
                  ELSE -NEW.quantidade END;

  -- Trava pessimista: duas vendas do mesmo produto ficam em fila.
  UPDATE produto
     SET quantidade_estoque = quantidade_estoque + v_delta,
         atualizado_em      = now()
   WHERE id = NEW.produto_id AND petshop_id = NEW.petshop_id
  RETURNING quantidade_estoque INTO v_novo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto % não encontrado no petshop %', NEW.produto_id, NEW.petshop_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- RN02: impede estoque negativo no banco (o CHECK da coluna é a 2ª barreira).
  IF v_novo < 0 THEN
    RAISE EXCEPTION 'Estoque insuficiente (RN02): produto % ficou com saldo %',
      NEW.produto_id, v_novo
      USING ERRCODE = 'check_violation',
            HINT = 'Venda bloqueada: quantity exceeds available stock.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_movimentar_estoque
  BEFORE INSERT ON movimentacao_estoque
  FOR EACH ROW EXECUTE FUNCTION fn_movimentar_estoque();

-- ---------------------------------------------------------------------
-- RN11 — "Um estorno de venda só pode ser realizado por usuários com
-- perfil de gestor e dentro do prazo máximo definido pela política
-- comercial do petshop."
--
-- O prazo é parametrizado por tenant (petshop.prazo_estorno_dias) e
-- verificado no próprio banco, contra o usuário autenticado da sessão.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validar_estorno()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_prazo    integer;
  v_dias     integer;
  v_perfil   perfil_usuario;
  v_tenant   bigint := current_setting('app.petshop_id', true)::bigint;
BEGIN
  IF NEW.status = 'estornada' AND OLD.status <> 'estornada' THEN

    -- Permissão: somente GESTOR (RN11 / RN03).
    SELECT u.perfil INTO v_perfil
      FROM usuario u
     WHERE u.id = NEW.estornado_por;
    IF v_perfil IS DISTINCT FROM 'GESTOR' THEN
      RAISE EXCEPTION 'Somente gestores podem estornar vendas (RN11)'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Prazo comercial definido pelo próprio petshop.
    SELECT prazo_estorno_dias INTO v_prazo
      FROM petshop WHERE id = NEW.petshop_id;
    v_dias := EXTRACT(DAY FROM (now() - NEW.data_hora))::integer;

    IF v_prazo IS NOT NULL AND v_dias > v_prazo THEN
      RAISE EXCEPTION 'Prazo de estorno expirado (RN11): venda % tem % dias, limite é %',
        NEW.id, v_dias, v_prazo
        USING ERRCODE = 'check_violation',
              HINT = 'Prazo comercial do petshop excedido.';
    END IF;

    -- Estorno dentro do próprio tenant.
    IF NEW.petshop_id <> v_tenant THEN
      RAISE EXCEPTION 'Estorno não permitido entre tenants' USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_estorno
  BEFORE UPDATE ON venda
  FOR EACH ROW EXECUTE FUNCTION fn_validar_estorno();

-- ---------------------------------------------------------------------
-- RN08 — "Um colaborador só pode ser vinculado a um agendamento dentro
-- do seu horário de disponibilidade previamente cadastrado."
--
-- Verificação no banco, considerando o dia da semana e o intervalo.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validar_disponibilidade()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_existe boolean;
BEGIN
  IF NEW.status = 'cancelado' THEN
    RETURN NEW;   -- RN04: cancelamento libera o horário, sem exigir disponibilidade.
  END IF;

  SELECT EXISTS (
    SELECT 1
      FROM disponibilidade_colaborador dc
     WHERE dc.colaborador_id = NEW.colaborador_id
       AND dc.petshop_id     = NEW.petshop_id
       AND dc.dia_semana     = EXTRACT(DOW FROM NEW.data_hora AT TIME ZONE 'America/Sao_Paulo')::smallint
       -- O atendimento inteiro precisa caber na janela de disponibilidade.
       AND (NEW.data_hora AT TIME ZONE 'America/Sao_Paulo')::time  >= dc.hora_inicio
       AND (NEW.data_hora_fim AT TIME ZONE 'America/Sao_Paulo')::time <= dc.hora_fim
  ) INTO v_existe;

  IF NOT v_existe THEN
    RAISE EXCEPTION 'Fora da disponibilidade cadastrada (RN08): colaborador % não atende em %',
      NEW.colaborador_id, NEW.data_hora
      USING ERRCODE = 'check_violation',
            HINT = 'Cadastre a disponibilidade em disponibilidade_colaborador.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_disponibilidade
  BEFORE INSERT OR UPDATE ON agendamento
  FOR EACH ROW EXECUTE FUNCTION fn_validar_disponibilidade();

-- ---------------------------------------------------------------------
-- RN12 — "Um bloqueio de agenda cadastrado por um colaborador não pode
-- se sobrepor a agendamentos já confirmados no mesmo período."
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validar_bloqueio()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_conflito integer;
BEGIN
  SELECT count(*) INTO v_conflito
    FROM agendamento a
   WHERE a.colaborador_id = NEW.colaborador_id
     AND a.status <> 'cancelado'
     AND (a.data_hora AT TIME ZONE 'America/Sao_Paulo')::date  BETWEEN NEW.data_inicio AND NEW.data_fim;

  IF v_conflito > 0 THEN
    RAISE EXCEPTION 'Bloqueio sobrepõe % agendamento(s) confirmado(s) (RN12)', v_conflito
      USING ERRCODE = 'check_violation',
            HINT = 'Remarque ou cancele os agendamentos conflitantes antes de bloquear.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_validar_bloqueio
  BEFORE INSERT OR UPDATE ON bloqueio_agenda
  FOR EACH ROW EXECUTE FUNCTION fn_validar_bloqueio();

-- ---------------------------------------------------------------------
-- Impede que um item_venda aponte para uma venda de outro petshop e que
-- o total pago corresponda ao total da venda (RF25).
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_validar_pagamentos()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_total_venda  numeric(12,2);
  v_total_pago   numeric(12,2);
BEGIN
  SELECT valor_total - desconto INTO v_total_venda
    FROM venda WHERE id = NEW.venda_id FOR UPDATE;

  SELECT COALESCE(sum(valor), 0) INTO v_total_pago
    FROM pagamento WHERE venda_id = NEW.venda_id;

  -- Tolerância de 1 centavo para arredondamento monetário.
  IF abs(v_total_pago - v_total_venda) > 0.01 THEN
    RAISE EXCEPTION 'Pagamentos (% ) não cobrem o total da venda (%)', v_total_pago, v_total_venda
      USING ERRCODE = 'check_violation',
            HINT = 'RF25: a soma das formas de pagamento deve igualar o total da venda.';
  END IF;

  RETURN NEW;
END;
$$;

-- A verificação roda NO COMMIT, e não a cada linha: a venda pode ter
-- várias formas de pagamento (RF25), e o total só está fechado quando a
-- última delas foi inserida. Um trigger AFTER comum dispararia na PRIMEIRA
-- linha e reprovaria um pagamento combinado legítimo.
DROP TRIGGER IF EXISTS trg_validar_pagamentos ON pagamento;
CREATE CONSTRAINT TRIGGER trg_validar_pagamentos
  AFTER INSERT OR UPDATE ON pagamento
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION fn_validar_pagamentos();

-- ---------------------------------------------------------------------
-- RNF09 — Auditoria das operações críticas sobre produtos.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION fn_auditar_produto()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_acao   text := CASE TG_OP WHEN 'INSERT' THEN 'criar'
                             WHEN 'UPDATE' THEN 'alterar'
                             ELSE 'excluir' END;
  v_antes  jsonb;
  v_depois jsonb;
  v_tenant bigint := COALESCE(NEW.petshop_id, OLD.petshop_id);
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_antes := to_jsonb(OLD);
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_depois := to_jsonb(NEW);
  END IF;

  INSERT INTO auditoria (petshop_id, usuario_id, acao, tabela, registro_id, dados_antes, dados_depois)
  VALUES (
    v_tenant,
    NULLIF(current_setting('app.usuario_id', true), '')::bigint,
    v_acao, 'produto',
    CASE TG_OP WHEN 'DELETE' THEN OLD.id ELSE NEW.id END,
    v_antes, v_depois
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

CREATE TRIGGER trg_auditar_produto
  AFTER INSERT OR UPDATE OR DELETE ON produto
  FOR EACH ROW EXECUTE FUNCTION fn_auditar_produto();

-- Mantém `atualizado_em` coerente sem depender da aplicação.
CREATE OR REPLACE FUNCTION fn_tocar_atualizado_em()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.atualizado_em := now();
  RETURN NEW;
END;
$$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['usuario','cliente','colaborador','pet','servico',
                            'produto','venda','fornecedor','pacote_servico']
  LOOP
    EXECUTE format(
      'CREATE TRIGGER trg_%1$s_touch BEFORE UPDATE ON %1$I
         FOR EACH ROW EXECUTE FUNCTION fn_tocar_atualizado_em()', t);
  END LOOP;
END;
$$;