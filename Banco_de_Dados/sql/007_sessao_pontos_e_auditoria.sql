-- =====================================================================
-- PetPlus — Modelo Físico de Dados
-- 007_sessao_pontos_e_auditoria.sql
-- ---------------------------------------------------------------------
-- O que o backend completo precisa além do esquema original:
--
--   1. Sessão com refresh token revogável (RNF04/RNF06) — o JWT de
--      acesso é curto e o de renovação vive no banco, com rotação.
--   2. Outbox de notificações (RF12/RF13/RF22): a fila de envio é uma
--      tabela, não uma chamada de rede dentro da requisição.
--   3. Razão de pontos de fidelidade (RF20/RN07) com saldo não negativo
--      garantido pelo banco, como manda a filosofia do projeto.
--   4. Auditoria genérica (RNF09) para venda, agenda, cadastros e estoque.
--   5. Índices para as consultas que o backend passou a fazer: busca por
--      nome (trigram), filtro por tenant/status/período.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. SESSÃO — refresh token com rotação
-- ---------------------------------------------------------------------
-- Guardamos apenas o SHA-256 do token, como já é feito em
-- token_recuperacao: um dump do banco não entrega sessão viva a ninguém.
-- `substituido_por` forma a "família" da sessão: reapresentar um token já
-- rotacionado é sinal de vazamento e revoga a família inteira.
CREATE TABLE refresh_token (
  id             BIGSERIAL PRIMARY KEY,
  petshop_id     BIGINT      NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  usuario_id     BIGINT      NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  token_hash     CHAR(64)    NOT NULL UNIQUE,
  expira_em      TIMESTAMPTZ NOT NULL,
  revogado_em    TIMESTAMPTZ,
  substituido_por BIGINT     REFERENCES refresh_token(id) ON DELETE SET NULL,
  user_agent     VARCHAR(200),
  ip             INET,
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT refresh_token_usuario_mesmo_petshop
    FOREIGN KEY (usuario_id, petshop_id) REFERENCES usuario(id, petshop_id)
);
CREATE INDEX refresh_token_usuario_idx ON refresh_token (usuario_id, expira_em DESC);
-- A limpeza periódica varre só o que já venceu/foi revogado.
CREATE INDEX refresh_token_expirados_idx ON refresh_token (expira_em) WHERE revogado_em IS NULL;

ALTER TABLE refresh_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_token FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento_select ON refresh_token
  FOR SELECT USING (petshop_id = current_setting('app.petshop_id', true)::bigint);
CREATE POLICY tenant_isolamento_insert ON refresh_token
  FOR INSERT WITH CHECK (petshop_id = current_setting('app.petshop_id', true)::bigint);
CREATE POLICY tenant_isolamento_update ON refresh_token
  FOR UPDATE USING (petshop_id = current_setting('app.petshop_id', true)::bigint)
  WITH CHECK (petshop_id = current_setting('app.petshop_id', true)::bigint);
CREATE POLICY tenant_isolamento_delete ON refresh_token
  FOR DELETE USING (petshop_id = current_setting('app.petshop_id', true)::bigint);

-- A renovação acontece, por definição, quando o access token já venceu:
-- o tenant ainda não está na sessão. Mesma solução do login — uma função
-- SECURITY DEFINER mínima, somente leitura, que devolve só o necessário
-- para identificar a sessão e o seu dono.
CREATE OR REPLACE FUNCTION petplus_buscar_refresh_token(p_hash char(64))
RETURNS TABLE (
  id          bigint,
  petshop_id  bigint,
  usuario_id  bigint,
  expira_em   timestamptz,
  revogado_em timestamptz,
  substituido_por bigint
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT rt.id, rt.petshop_id, rt.usuario_id, rt.expira_em, rt.revogado_em, rt.substituido_por
    FROM refresh_token rt
   WHERE rt.token_hash = p_hash
   LIMIT 1
$$;

-- Mesmo caso da renovação: redefinir a senha acontece ANTES de existir
-- sessão (é justamente para quem perdeu a senha). A função devolve só o
-- necessário para achar o dono do token e não aceita token expirado/usado.
CREATE OR REPLACE FUNCTION petplus_buscar_token_recuperacao(p_hash text)
RETURNS TABLE (id bigint, petshop_id bigint, usuario_id bigint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT t.id, t.petshop_id, t.usuario_id
    FROM token_recuperacao t
   WHERE t.token_hash = p_hash
     AND t.usado_em IS NULL
     AND t.expira_em > now()
   LIMIT 1
$$;

COMMENT ON FUNCTION petplus_buscar_token_recuperacao(text) IS
  'Escape hatch de RLS para a redefinição de senha: só devolve token ainda válido e não usado.';

REVOKE ALL ON FUNCTION petplus_buscar_token_recuperacao(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION petplus_buscar_token_recuperacao(text) TO petplus_app;

COMMENT ON FUNCTION petplus_buscar_refresh_token(char) IS
  'Escape hatch de RLS para a renovação de sessão (token já vencido ⇒ sem tenant na sessão).';

REVOKE ALL ON FUNCTION petplus_buscar_refresh_token(char) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION petplus_buscar_refresh_token(char) TO petplus_app;

-- ---------------------------------------------------------------------
-- 2. NOTIFICAÇÕES — de "registro do que foi enviado" para fila (outbox)
-- ---------------------------------------------------------------------
-- `data_envio` continua sendo o instante em que o aviso foi gerado (é o
-- que a interface exibe). O envio em si passa a ter estado próprio:
-- `agendado_para` (quando deve sair), `enviado_em`, `tentativas` e
-- `erro_envio`. Sem isso, o lembrete de 24h (RF12) só existiria se
-- alguém estivesse com a tela aberta no momento exato.
-- Chave candidata que permite à notificação referenciar um registro de
-- saúde do MESMO tenant por FK composta (mesmo padrão das demais tabelas).
ALTER TABLE registro_saude
  ADD CONSTRAINT registro_saude_id_petshop_uniq UNIQUE (id, petshop_id);

ALTER TABLE notificacao
  ADD COLUMN agendado_para TIMESTAMPTZ NOT NULL DEFAULT now(),
  ADD COLUMN enviado_em    TIMESTAMPTZ,
  ADD COLUMN tentativas    SMALLINT    NOT NULL DEFAULT 0 CHECK (tentativas >= 0),
  ADD COLUMN erro_envio    TEXT,
  ADD COLUMN registro_saude_id BIGINT REFERENCES registro_saude(id) ON DELETE CASCADE,
  ADD CONSTRAINT notificacao_registro_mesmo_petshop
    FOREIGN KEY (registro_saude_id, petshop_id) REFERENCES registro_saude(id, petshop_id);

COMMENT ON COLUMN notificacao.agendado_para IS
  'RF12: instante a partir do qual o aviso pode ser enviado (agendamento − antecedência configurada).';
COMMENT ON COLUMN notificacao.enviado_em IS
  'Preenchido pelo processador da fila (src/services/email.service.js). NULL = pendente.';

-- Fila: o processador busca só o que está pendente, por tenant e por prazo.
CREATE INDEX notificacao_outbox_idx ON notificacao (petshop_id, agendado_para)
  WHERE enviado_em IS NULL;

-- Deduplicação determinística: um lembrete por agendamento e um alerta por
-- registro de saúde, mesmo que o processador rode duas vezes na mesma hora.
CREATE UNIQUE INDEX notificacao_lembrete_unico
  ON notificacao (agendamento_id, tipo) WHERE agendamento_id IS NOT NULL;
CREATE UNIQUE INDEX notificacao_registro_unico
  ON notificacao (registro_saude_id, tipo) WHERE registro_saude_id IS NOT NULL;
CREATE INDEX notificacao_listagem_idx ON notificacao (petshop_id, data_envio DESC);

-- ---------------------------------------------------------------------
-- 3. FIDELIDADE (RF20/RN07) — razão de pontos
-- ---------------------------------------------------------------------
-- Mesmo desenho do estoque: o saldo (`cliente.pontos_fidelidade`) é a
-- projeção de uma trilha append-only, e a regra de negócio é imposta por
-- gatilho — resgatar mais do que existe é recusado pelo banco, não por um
-- `if` na aplicação.
CREATE TYPE tipo_pontos AS ENUM ('credito', 'debito');

-- Taxa de acúmulo por tenant: pontos concedidos por real gasto.
ALTER TABLE petshop
  ADD COLUMN pontos_por_real NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK (pontos_por_real >= 0);

CREATE TABLE fidelidade_movimentacao (
  id          BIGSERIAL PRIMARY KEY,
  petshop_id  BIGINT      NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  cliente_id  BIGINT      NOT NULL REFERENCES cliente(usuario_id) ON DELETE CASCADE,
  tipo        tipo_pontos NOT NULL,
  pontos      INTEGER     NOT NULL CHECK (pontos > 0),
  descricao   VARCHAR(200) NOT NULL DEFAULT '',
  venda_id    BIGINT      REFERENCES venda(id) ON DELETE SET NULL,
  usuario_id  BIGINT      REFERENCES usuario(id) ON DELETE SET NULL,
  data_hora   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fidelidade_cliente_mesmo_petshop
    FOREIGN KEY (cliente_id, petshop_id) REFERENCES cliente(usuario_id, petshop_id)
);
CREATE INDEX fidelidade_cliente_idx ON fidelidade_movimentacao (cliente_id, data_hora DESC);
-- Um crédito por venda (o estorno debita o mesmo tanto).
CREATE UNIQUE INDEX fidelidade_credito_por_venda
  ON fidelidade_movimentacao (venda_id, tipo) WHERE venda_id IS NOT NULL;

ALTER TABLE fidelidade_movimentacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE fidelidade_movimentacao FORCE  ROW LEVEL SECURITY;
CREATE POLICY tenant_isolamento_select ON fidelidade_movimentacao
  FOR SELECT USING (petshop_id = current_setting('app.petshop_id', true)::bigint);
CREATE POLICY tenant_isolamento_insert ON fidelidade_movimentacao
  FOR INSERT WITH CHECK (petshop_id = current_setting('app.petshop_id', true)::bigint);
CREATE POLICY tenant_isolamento_update ON fidelidade_movimentacao
  FOR UPDATE USING (petshop_id = current_setting('app.petshop_id', true)::bigint)
  WITH CHECK (petshop_id = current_setting('app.petshop_id', true)::bigint);
CREATE POLICY tenant_isolamento_delete ON fidelidade_movimentacao
  FOR DELETE USING (petshop_id = current_setting('app.petshop_id', true)::bigint);

CREATE OR REPLACE FUNCTION fn_movimentar_pontos()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_delta integer := CASE WHEN NEW.tipo = 'credito' THEN NEW.pontos ELSE -NEW.pontos END;
  v_saldo integer;
BEGIN
  UPDATE cliente
     SET pontos_fidelidade = pontos_fidelidade + v_delta,
         atualizado_em     = now()
   WHERE usuario_id = NEW.cliente_id AND petshop_id = NEW.petshop_id
  RETURNING pontos_fidelidade INTO v_saldo;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Cliente % não encontrado no petshop %', NEW.cliente_id, NEW.petshop_id
      USING ERRCODE = 'foreign_key_violation';
  END IF;

  -- RN07: não existe resgate sem saldo.
  IF v_saldo < 0 THEN
    RAISE EXCEPTION 'Saldo de pontos insuficiente (RN07): o cliente ficaria com % pontos', v_saldo
      USING ERRCODE = 'check_violation',
            HINT = 'O resgate exige saldo igual ou superior ao valor do benefício.';
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_movimentar_pontos
  BEFORE INSERT ON fidelidade_movimentacao
  FOR EACH ROW EXECUTE FUNCTION fn_movimentar_pontos();

-- ---------------------------------------------------------------------
-- 4. AUDITORIA GENÉRICA (RNF09)
-- ---------------------------------------------------------------------
-- Uma função serve a todas as tabelas: o nome da coluna de identidade vem
-- no argumento do gatilho e o id é extraído via `to_jsonb`, o que evita
-- depender de a tabela ter (ou não) uma coluna `id`.
CREATE OR REPLACE FUNCTION fn_auditar()
RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  v_acao     text := CASE TG_OP WHEN 'INSERT' THEN 'criar'
                               WHEN 'UPDATE' THEN 'alterar'
                               ELSE 'excluir' END;
  v_coluna   text := COALESCE(TG_ARGV[0], 'id');
  v_antes    jsonb;
  v_depois   jsonb;
  v_tenant   bigint;
  v_registro bigint;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN v_antes  := to_jsonb(OLD); END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN v_depois := to_jsonb(NEW); END IF;

  v_tenant   := COALESCE((v_depois ->> 'petshop_id')::bigint, (v_antes ->> 'petshop_id')::bigint);
  v_registro := COALESCE((v_depois ->> v_coluna)::bigint, (v_antes ->> v_coluna)::bigint);

  INSERT INTO auditoria (petshop_id, usuario_id, acao, tabela, registro_id, dados_antes, dados_depois)
  VALUES (
    v_tenant,
    NULLIF(current_setting('app.usuario_id', true), '')::bigint,
    v_acao,
    TG_TABLE_NAME,
    v_registro,
    v_antes,
    v_depois
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Tabelas cuja mudança é operação crítica. `produto` já tinha o gatilho
-- original (004); as demais passam a registrar criar/alterar/excluir.
CREATE TRIGGER trg_auditar_venda
  AFTER INSERT OR UPDATE OR DELETE ON venda
  FOR EACH ROW EXECUTE FUNCTION fn_auditar();
CREATE TRIGGER trg_auditar_agendamento
  AFTER INSERT OR UPDATE OR DELETE ON agendamento
  FOR EACH ROW EXECUTE FUNCTION fn_auditar();
CREATE TRIGGER trg_auditar_cliente
  AFTER INSERT OR UPDATE OR DELETE ON cliente
  FOR EACH ROW EXECUTE FUNCTION fn_auditar('usuario_id');
CREATE TRIGGER trg_auditar_pet
  AFTER INSERT OR UPDATE OR DELETE ON pet
  FOR EACH ROW EXECUTE FUNCTION fn_auditar();
CREATE TRIGGER trg_auditar_fornecedor
  AFTER INSERT OR UPDATE OR DELETE ON fornecedor
  FOR EACH ROW EXECUTE FUNCTION fn_auditar();
CREATE TRIGGER trg_auditar_servico
  AFTER INSERT OR UPDATE OR DELETE ON servico
  FOR EACH ROW EXECUTE FUNCTION fn_auditar();
CREATE TRIGGER trg_auditar_pacote
  AFTER INSERT OR UPDATE OR DELETE ON pacote_servico
  FOR EACH ROW EXECUTE FUNCTION fn_auditar();
CREATE TRIGGER trg_auditar_bloqueio
  AFTER INSERT OR UPDATE OR DELETE ON bloqueio_agenda
  FOR EACH ROW EXECUTE FUNCTION fn_auditar();

-- Para `usuario` só interessa o que muda acesso: criação, desativação e
-- troca de perfil/senha. Sem o `UPDATE OF`, cada login (que atualiza
-- ultimo_acesso) geraria uma linha de auditoria inútil.
CREATE TRIGGER trg_auditar_usuario_criado
  AFTER INSERT OR DELETE ON usuario
  FOR EACH ROW EXECUTE FUNCTION fn_auditar();
CREATE TRIGGER trg_auditar_usuario_acesso
  AFTER UPDATE OF ativo, perfil, senha_hash ON usuario
  FOR EACH ROW EXECUTE FUNCTION fn_auditar();

CREATE INDEX auditoria_tabela_idx ON auditoria (petshop_id, tabela, data_hora DESC);

-- ---------------------------------------------------------------------
-- 5. ÍNDICES DE CONSULTA
-- ---------------------------------------------------------------------
-- Busca por nome é `ILIKE '%…%'` — um índice B-tree não atende. O
-- `pg_trgm` indexa trigramas e faz a busca conter resolver por índice.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX usuario_petshop_perfil_idx   ON usuario (petshop_id, perfil, ativo);
CREATE INDEX usuario_nome_trgm_idx        ON usuario USING gin (nome gin_trgm_ops);

CREATE INDEX cliente_petshop_idx          ON cliente (petshop_id, pontos_fidelidade DESC);

CREATE INDEX pet_petshop_cliente_idx      ON pet (petshop_id, cliente_id, ativo);
CREATE INDEX pet_petshop_nome_idx         ON pet (petshop_id, nome);
CREATE INDEX pet_nome_trgm_idx            ON pet USING gin (nome gin_trgm_ops);

CREATE INDEX colaborador_petshop_cargo_idx ON colaborador (petshop_id, cargo);

CREATE INDEX agendamento_petshop_data_idx  ON agendamento (petshop_id, data_hora);
CREATE INDEX agendamento_petshop_status_idx ON agendamento (petshop_id, status, data_hora);
CREATE INDEX agendamento_cliente_data_idx  ON agendamento (cliente_id, data_hora DESC);

CREATE INDEX bloqueio_colaborador_periodo_idx ON bloqueio_agenda (colaborador_id, data_inicio, data_fim);

CREATE INDEX registro_saude_pet_data_idx  ON registro_saude (petshop_id, pet_id, data DESC);
CREATE INDEX registro_saude_vencimento_idx ON registro_saude (petshop_id, proximo_vencimento)
  WHERE proximo_vencimento IS NOT NULL;

CREATE INDEX produto_petshop_ativo_idx    ON produto (petshop_id, ativo, nome);
CREATE INDEX produto_petshop_categoria_idx ON produto (petshop_id, categoria);
CREATE INDEX produto_validade_idx         ON produto (petshop_id, validade)
  WHERE ativo AND validade IS NOT NULL;
CREATE INDEX produto_nome_trgm_idx        ON produto USING gin (nome gin_trgm_ops);
CREATE INDEX produto_abaixo_minimo_idx    ON produto (petshop_id, quantidade_estoque);

CREATE INDEX fornecedor_petshop_idx       ON fornecedor (petshop_id, ativo);
CREATE INDEX lote_produto_idx             ON lote (produto_id, validade);

CREATE INDEX venda_petshop_data_idx       ON venda (petshop_id, data_hora DESC);
CREATE INDEX venda_petshop_status_idx     ON venda (petshop_id, status, data_hora DESC);
CREATE INDEX item_venda_venda_idx         ON item_venda (venda_id);
CREATE INDEX item_venda_produto_idx       ON item_venda (produto_id);

CREATE INDEX avaliacao_petshop_data_idx   ON avaliacao (petshop_id, data DESC);
CREATE INDEX assinatura_petshop_idx       ON assinatura_pacote (petshop_id, status, cliente_id);
CREATE INDEX relatorio_petshop_idx        ON relatorio (petshop_id, data_geracao DESC);
CREATE INDEX pacote_servico_petshop_idx   ON pacote_servico (petshop_id, ativo);

-- ---------------------------------------------------------------------
-- 6. PRIVILÉGIOS DOS OBJETOS NOVOS
-- ---------------------------------------------------------------------
-- O `ALTER DEFAULT PRIVILEGES` de 005 cobriu tabelas, mas não sequências:
-- sem o GRANT abaixo, o papel da aplicação não conseguiria nem inserir
-- (o `nextval` do BIGSERIAL seria negado).
-- ---------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE, DELETE ON refresh_token, fidelidade_movimentacao TO petplus_app;
GRANT USAGE, SELECT ON SEQUENCE refresh_token_id_seq, fidelidade_movimentacao_id_seq TO petplus_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO petplus_app;

-- O agendador de lembretes (RF12/RF13) precisa varrer TODOS os tenants,
-- mas a política de `petshop` deixa o papel da aplicação enxergar apenas o
-- tenant da sessão. Em vez de desligar RLS, abrimos um escape hatch
-- nomeado, somente leitura e sem dado pessoal: apenas o catálogo de
-- unidades ativas e seus parâmetros de operação.
CREATE OR REPLACE FUNCTION petplus_petshops_ativos()
RETURNS TABLE (id bigint, timezone varchar, antecedencia_lembrete_h smallint, antecedencia_validade_d smallint)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
STABLE
AS $$
  SELECT ps.id, ps.timezone, ps.antecedencia_lembrete_h, ps.antecedencia_validade_d
    FROM petshop ps
   WHERE ps.ativo
   ORDER BY ps.id
$$;

COMMENT ON FUNCTION petplus_petshops_ativos() IS
  'Catálogo de tenants para o agendador de lembretes; não devolve dado pessoal nem permite escrita.';

REVOKE ALL ON FUNCTION petplus_petshops_ativos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION petplus_petshops_ativos() TO petplus_app;

COMMENT ON TABLE refresh_token IS 'RNF04/RNF06: sessões renováveis com rotação; guarda apenas o SHA-256 do token.';
COMMENT ON TABLE fidelidade_movimentacao IS 'RF20/RN07: razão de pontos; cliente.pontos_fidelidade é a projeção desta trilha.';
