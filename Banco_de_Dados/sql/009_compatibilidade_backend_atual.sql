-- Compatibiliza a versão 007_backend_operacional/008_modulos_complementares
-- com o backend atual, sem apagar tabelas, contas ou histórico.
-- O runner executa este arquivo inteiro em uma transação.

-- Impede eventos de fidelidade concorrentes durante a cópia do extrato.
LOCK TABLE cliente,venda,agendamento,avaliacao IN SHARE ROW EXCLUSIVE MODE;
DO $$ BEGIN
  IF to_regclass('public.fidelidade_movimento') IS NOT NULL THEN
    LOCK TABLE fidelidade_movimento IN SHARE ROW EXCLUSIVE MODE;
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS refresh_token (
  id BIGSERIAL PRIMARY KEY,
  petshop_id BIGINT NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  usuario_id BIGINT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  token_hash CHAR(64) NOT NULL UNIQUE,
  expira_em TIMESTAMPTZ NOT NULL,
  revogado_em TIMESTAMPTZ,
  substituido_por BIGINT REFERENCES refresh_token(id) ON DELETE SET NULL,
  user_agent VARCHAR(200), ip INET,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  FOREIGN KEY (usuario_id, petshop_id) REFERENCES usuario(id, petshop_id)
);
CREATE INDEX IF NOT EXISTS refresh_token_usuario_idx ON refresh_token(usuario_id, expira_em DESC);
CREATE INDEX IF NOT EXISTS refresh_token_expirados_idx ON refresh_token(expira_em) WHERE revogado_em IS NULL;
ALTER TABLE refresh_token ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_token FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='refresh_token') THEN
    CREATE POLICY compat_tenant_isolamento ON refresh_token
      USING (petshop_id = NULLIF(current_setting('app.petshop_id', true), '')::bigint)
      WITH CHECK (petshop_id = NULLIF(current_setting('app.petshop_id', true), '')::bigint);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION petplus_buscar_refresh_token(p_hash char(64))
RETURNS TABLE(id bigint, petshop_id bigint, usuario_id bigint, expira_em timestamptz, revogado_em timestamptz, substituido_por bigint)
LANGUAGE sql SECURITY DEFINER SET search_path=public STABLE AS $$
  SELECT r.id,r.petshop_id,r.usuario_id,r.expira_em,r.revogado_em,r.substituido_por
  FROM refresh_token r WHERE r.token_hash=p_hash LIMIT 1
$$;
CREATE OR REPLACE FUNCTION petplus_buscar_token_recuperacao(p_hash text)
RETURNS TABLE(id bigint, petshop_id bigint, usuario_id bigint)
LANGUAGE sql SECURITY DEFINER SET search_path=public STABLE AS $$
  SELECT t.id,t.petshop_id,t.usuario_id FROM token_recuperacao t
  WHERE t.token_hash=p_hash AND t.usado_em IS NULL AND t.expira_em>now() LIMIT 1
$$;
CREATE OR REPLACE FUNCTION petplus_petshops_ativos()
RETURNS TABLE(id bigint, timezone varchar, antecedencia_lembrete_h smallint, antecedencia_validade_d smallint)
LANGUAGE sql SECURITY DEFINER SET search_path=public STABLE AS $$
  SELECT p.id,p.timezone,p.antecedencia_lembrete_h,p.antecedencia_validade_d
  FROM petshop p WHERE p.ativo ORDER BY p.id
$$;
REVOKE ALL ON FUNCTION petplus_buscar_refresh_token(char),petplus_buscar_token_recuperacao(text),petplus_petshops_ativos() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION petplus_buscar_refresh_token(char),petplus_buscar_token_recuperacao(text),petplus_petshops_ativos() TO petplus_app;
GRANT SELECT,INSERT,UPDATE,DELETE ON refresh_token TO petplus_app;
GRANT USAGE,SELECT ON SEQUENCE refresh_token_id_seq TO petplus_app;

-- Notificações existentes eram registros já apresentados ao usuário.
-- Não reenviar todo o histórico ao habilitar a nova fila.
ALTER TABLE notificacao ADD COLUMN IF NOT EXISTS agendado_para TIMESTAMPTZ NOT NULL DEFAULT now();
ALTER TABLE notificacao ADD COLUMN IF NOT EXISTS tentativas SMALLINT NOT NULL DEFAULT 0 CHECK(tentativas>=0);
ALTER TABLE notificacao ADD COLUMN IF NOT EXISTS erro_envio TEXT;
ALTER TABLE notificacao ADD COLUMN IF NOT EXISTS registro_saude_id BIGINT;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='notificacao' AND column_name='enviado_em') THEN
    ALTER TABLE notificacao ADD COLUMN enviado_em TIMESTAMPTZ;
    UPDATE notificacao SET enviado_em=data_envio,agendado_para=data_envio;
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='registro_saude'::regclass AND conname='registro_saude_id_petshop_uniq') THEN
    ALTER TABLE registro_saude ADD CONSTRAINT registro_saude_id_petshop_uniq UNIQUE(id,petshop_id);
  END IF;
  IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conrelid='notificacao'::regclass AND conname='notificacao_registro_mesmo_petshop') THEN
    ALTER TABLE notificacao ADD CONSTRAINT notificacao_registro_mesmo_petshop
      FOREIGN KEY(registro_saude_id,petshop_id) REFERENCES registro_saude(id,petshop_id);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS notificacao_outbox_idx ON notificacao(petshop_id,agendado_para) WHERE enviado_em IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notificacao_lembrete_unico ON notificacao(agendamento_id,tipo) WHERE agendamento_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS notificacao_registro_unico ON notificacao(registro_saude_id,tipo) WHERE registro_saude_id IS NOT NULL;

ALTER TABLE petshop ADD COLUMN IF NOT EXISTS pontos_por_real NUMERIC(6,2) NOT NULL DEFAULT 1 CHECK(pontos_por_real>=0);
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public' AND t.typname='tipo_pontos') THEN
    CREATE TYPE tipo_pontos AS ENUM('credito','debito');
  END IF;
  IF to_regclass('public.fidelidade_movimentacao') IS NULL THEN
    CREATE TABLE fidelidade_movimentacao (
      id BIGSERIAL PRIMARY KEY,
      petshop_id BIGINT NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
      cliente_id BIGINT NOT NULL REFERENCES cliente(usuario_id) ON DELETE CASCADE,
      tipo tipo_pontos NOT NULL, pontos INTEGER NOT NULL CHECK(pontos>0),
      descricao VARCHAR(200) NOT NULL DEFAULT '',
      venda_id BIGINT REFERENCES venda(id) ON DELETE SET NULL,
      usuario_id BIGINT REFERENCES usuario(id) ON DELETE SET NULL,
      data_hora TIMESTAMPTZ NOT NULL DEFAULT now(),
      FOREIGN KEY(cliente_id,petshop_id) REFERENCES cliente(usuario_id,petshop_id)
    );
    -- Copia o extrato antes de instalar o gatilho de saldo: importar histórico
    -- não pode creditar novamente os pontos que já estão no cadastro.
    IF to_regclass('public.fidelidade_movimento') IS NOT NULL THEN
      INSERT INTO fidelidade_movimentacao(id,petshop_id,cliente_id,tipo,pontos,descricao,venda_id,data_hora)
      SELECT m.id,m.petshop_id,m.cliente_id,
        CASE WHEN m.pontos>0 THEN 'credito'::tipo_pontos ELSE 'debito'::tipo_pontos END,
        abs(m.pontos),
        CASE WHEN m.chave ~ '^atendimento:[0-9]+$' THEN 'Atendimento concluído #'||split_part(m.chave,':',2)
          ELSE left(m.origem||' ('||m.chave||')',200) END,
        CASE WHEN m.chave ~ '^(venda|estorno):[0-9]+$' THEN
          (SELECT v.id FROM venda v WHERE v.petshop_id=m.petshop_id AND v.id=split_part(m.chave,':',2)::bigint) END,
        m.criado_em
      FROM fidelidade_movimento m ORDER BY m.id;
      PERFORM setval(pg_get_serial_sequence('fidelidade_movimentacao','id'),COALESCE((SELECT max(id) FROM fidelidade_movimentacao),1),EXISTS(SELECT 1 FROM fidelidade_movimentacao));
    END IF;
    -- Preserva também saldos sem extrato completo, sem alterar cliente.
    INSERT INTO fidelidade_movimentacao(petshop_id,cliente_id,tipo,pontos,descricao)
    SELECT c.petshop_id,c.usuario_id,
      CASE WHEN c.pontos_fidelidade-COALESCE(m.saldo,0)>0 THEN 'credito'::tipo_pontos ELSE 'debito'::tipo_pontos END,
      abs(c.pontos_fidelidade-COALESCE(m.saldo,0))::integer,'Saldo anterior à compatibilização'
    FROM cliente c LEFT JOIN (
      SELECT cliente_id,sum(CASE WHEN tipo='credito' THEN pontos ELSE -pontos END) saldo FROM fidelidade_movimentacao GROUP BY cliente_id
    ) m ON m.cliente_id=c.usuario_id WHERE c.pontos_fidelidade<>COALESCE(m.saldo,0);
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS fidelidade_cliente_idx ON fidelidade_movimentacao(cliente_id,data_hora DESC);
CREATE UNIQUE INDEX IF NOT EXISTS fidelidade_credito_por_venda ON fidelidade_movimentacao(venda_id,tipo) WHERE venda_id IS NOT NULL;
ALTER TABLE fidelidade_movimentacao ENABLE ROW LEVEL SECURITY;
ALTER TABLE fidelidade_movimentacao FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='fidelidade_movimentacao') THEN
    CREATE POLICY compat_tenant_isolamento ON fidelidade_movimentacao
      USING(petshop_id=NULLIF(current_setting('app.petshop_id',true),'')::bigint)
      WITH CHECK(petshop_id=NULLIF(current_setting('app.petshop_id',true),'')::bigint);
  END IF;
END $$;
CREATE OR REPLACE FUNCTION fn_movimentar_pontos() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE saldo integer;
BEGIN
  UPDATE cliente SET pontos_fidelidade=pontos_fidelidade+CASE WHEN NEW.tipo='credito' THEN NEW.pontos ELSE -NEW.pontos END,
    atualizado_em=now() WHERE usuario_id=NEW.cliente_id AND petshop_id=NEW.petshop_id RETURNING pontos_fidelidade INTO saldo;
  IF NOT FOUND THEN RAISE EXCEPTION 'Cliente não encontrado.' USING ERRCODE='foreign_key_violation'; END IF;
  IF saldo<0 THEN RAISE EXCEPTION 'Saldo de pontos insuficiente (RN07).' USING ERRCODE='check_violation'; END IF;
  RETURN NEW;
END $$;
DO $$ DECLARE t record; BEGIN
  IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='fidelidade_movimentacao'::regclass AND tgname='trg_movimentar_pontos') THEN
    CREATE TRIGGER trg_movimentar_pontos BEFORE INSERT ON fidelidade_movimentacao FOR EACH ROW EXECUTE FUNCTION fn_movimentar_pontos();
  END IF;
  -- A versão atual credita pontos nos repositórios. Preserva os gatilhos
  -- antigos, mas desabilita os produtores da razão antiga para não duplicar
  -- créditos. A tabela antiga permanece intacta como histórico legado.
  FOR t IN SELECT c.relname,g.tgname FROM pg_trigger g JOIN pg_class c ON c.oid=g.tgrelid
    JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_proc p ON p.oid=g.tgfoid
    WHERE n.nspname='public' AND NOT g.tgisinternal AND p.proname IN('fn_evento_fidelidade','fn_abertura_fidelidade')
  LOOP EXECUTE format('ALTER TABLE public.%I DISABLE TRIGGER %I',t.relname,t.tgname); END LOOP;
END $$;
GRANT SELECT,INSERT,UPDATE,DELETE ON fidelidade_movimentacao TO petplus_app;
GRANT USAGE,SELECT ON SEQUENCE fidelidade_movimentacao_id_seq TO petplus_app;
