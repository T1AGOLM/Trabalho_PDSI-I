-- =====================================================================
-- PetPlus — Modelo Físico de Dados
-- 003_tabelas_estoque_vendas.sql
-- ---------------------------------------------------------------------
-- Estoque (Produto/Fornecedor), PDV (Venda/ItemVenda/Pagamento),
-- auditoria e notificações.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 5. ESTOQUE E COMPRAS
-- ---------------------------------------------------------------------

-- Dependência funcional direta: Fornecedor -> Produto. Mantida aqui
-- porque, no escopo atual, um produto é subordinado a um único fornecedor.
CREATE TABLE fornecedor (
  id          BIGSERIAL PRIMARY KEY,
  petshop_id  BIGINT      NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  nome        VARCHAR(150) NOT NULL CHECK (btrim(nome) <> ''),
  cnpj        CHAR(14)     NOT NULL,
  contato     VARCHAR(60),
  email       CITEXT,
  telefone    VARCHAR(20),
  endereco    VARCHAR(255),
  ativo       BOOLEAN     NOT NULL DEFAULT true,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT fornecedor_cnpj_unico UNIQUE (petshop_id, cnpj)
);

CREATE TABLE produto (
  id                 BIGSERIAL PRIMARY KEY,
  petshop_id         BIGINT        NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  fornecedor_id      BIGINT        REFERENCES fornecedor(id) ON DELETE SET NULL,
  nome               VARCHAR(180)  NOT NULL CHECK (btrim(nome) <> ''),
  categoria          VARCHAR(60)   NOT NULL,
  sku                VARCHAR(60),
  -- RN02: nunca permitir estoque negativo (CHECK de domínio).
  quantidade_estoque INTEGER       NOT NULL DEFAULT 0 CHECK (quantidade_estoque >= 0),
  estoque_minimo     INTEGER       NOT NULL DEFAULT 0 CHECK (estoque_minimo >= 0),
  validade           DATE,                      -- RN09: pode ser nulo (acessórios)
  preco              NUMERIC(10,2) NOT NULL CHECK (preco >= 0),
  ativo              BOOLEAN       NOT NULL DEFAULT true,
  criado_em          TIMESTAMPTZ   NOT NULL DEFAULT now(),
  atualizado_em      TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT produto_nome_unico UNIQUE (petshop_id, nome),
  -- Chave candidata usada pelas FKs compostas que impedem atravessar tenants.
  CONSTRAINT produto_id_petshop_uniq UNIQUE (id, petshop_id)
  -- RN05: o alerta de estoque mínimo dispara via view/trigger quando
  -- quantidade_estoque <= estoque_minimo (regra consulta, não CHECK,
  -- pois o alerta é um evento e não uma restrição de valores).
);

-- Lote: rastreia validade e custo de cada entrada de mercadoria.
CREATE TABLE lote (
  id          BIGSERIAL PRIMARY KEY,
  petshop_id  BIGINT        NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  produto_id  BIGINT        NOT NULL REFERENCES produto(id) ON DELETE CASCADE,
  fornecedor_id BIGINT      REFERENCES fornecedor(id) ON DELETE SET NULL,
  quantidade   INTEGER      NOT NULL CHECK (quantidade > 0),
  custo_unitario NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (custo_unitario >= 0),
  validade    DATE,
  criado_em   TIMESTAMPTZ   NOT NULL DEFAULT now(),
  CONSTRAINT lote_produto_mesmo_petshop
    FOREIGN KEY (produto_id, petshop_id) REFERENCES produto(id, petshop_id)
);

-- ---------------------------------------------------------------------
-- 6. PDV — Venda, ItemVenda, Pagamento
-- ---------------------------------------------------------------------

CREATE TABLE venda (
  id           BIGSERIAL PRIMARY KEY,
  petshop_id   BIGINT        NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  -- Venda avulsa: cliente_id NULL (PDV aceita venda sem tutor identificado).
  cliente_id   BIGINT        REFERENCES cliente(usuario_id) ON DELETE SET NULL,
  -- Agendamento de origem quando o atendimento foi pago no PDV.
  agendamento_id BIGINT      REFERENCES agendamento(id) ON DELETE SET NULL,
  data_hora    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  valor_total  NUMERIC(12,2) NOT NULL CHECK (valor_total >= 0),
  desconto     NUMERIC(12,2) NOT NULL DEFAULT 0 CHECK (desconto >= 0),
  status       status_venda  NOT NULL DEFAULT 'finalizada',
  usuario_id   BIGINT        NOT NULL REFERENCES usuario(id) ON DELETE RESTRICT, -- operador do PDV
  estornado_em TIMESTAMPTZ,
  estornado_por BIGINT       REFERENCES usuario(id) ON DELETE SET NULL,
  motivo_estorno TEXT,
  criado_em    TIMESTAMPTZ   NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT venda_id_petshop_uniq UNIQUE (id, petshop_id),
  CONSTRAINT venda_cliente_mesmo_petshop
    FOREIGN KEY (cliente_id, petshop_id) REFERENCES cliente(usuario_id, petshop_id),
  CONSTRAINT venda_estorno
    CHECK (status <> 'estornada' OR (estornado_em IS NOT NULL AND estornado_por IS NOT NULL))
);
CREATE INDEX venda_data_idx ON venda (data_hora DESC);
CREATE INDEX venda_cliente_idx ON venda (cliente_id);

-- ItemVenda: produtos vendidos (RN02/RN08 — estoque baixado aqui).
CREATE TABLE item_venda (
  id             BIGSERIAL PRIMARY KEY,
  petshop_id     BIGINT        NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  venda_id       BIGINT        NOT NULL REFERENCES venda(id) ON DELETE CASCADE,
  produto_id     BIGINT        REFERENCES produto(id) ON DELETE SET NULL,
  -- Nome congelado: o comprovante histórico não depende do cadastro atual.
  nome           VARCHAR(180)  NOT NULL,
  quantidade     INTEGER       NOT NULL CHECK (quantidade > 0),
  preco_unitario NUMERIC(10,2) NOT NULL CHECK (preco_unitario >= 0),
  subtotal       NUMERIC(12,2) NOT NULL CHECK (subtotal >= 0),
  CONSTRAINT item_venda_venda_mesmo_petshop
    FOREIGN KEY (venda_id, petshop_id) REFERENCES venda(id, petshop_id)
);

-- Pagamento: N por venda (RF25 — pagamento combinado).
CREATE TABLE pagamento (
  id             BIGSERIAL PRIMARY KEY,
  petshop_id     BIGINT         NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  venda_id       BIGINT         NOT NULL REFERENCES venda(id) ON DELETE CASCADE,
  forma_pagamento forma_pagamento NOT NULL,
  valor          NUMERIC(12,2)  NOT NULL CHECK (valor > 0),
  data_hora      TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT pagamento_venda_mesmo_petshop
    FOREIGN KEY (venda_id, petshop_id) REFERENCES venda(id, petshop_id)
);
CREATE INDEX pagamento_venda_idx ON pagamento (venda_id);

-- ---------------------------------------------------------------------
-- 7. AUDITORIA E NOTIFICAÇÕES
-- ---------------------------------------------------------------------

-- RNF09: log das operações críticas (vendas, alterações de estoque, exclusões).
CREATE TABLE auditoria (
  id          BIGSERIAL PRIMARY KEY,
  petshop_id  BIGINT      NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  usuario_id  BIGINT      REFERENCES usuario(id) ON DELETE SET NULL,
  acao        VARCHAR(40) NOT NULL,   -- criar/alterar/excluir/vender/estornar
  tabela      VARCHAR(60) NOT NULL,
  registro_id BIGINT,
  dados_antes JSONB,
  dados_depois JSONB,
  data_hora   TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX auditoria_data_idx ON auditoria (petshop_id, data_hora DESC);

-- Notificacao (RF12/RF13/RF22).
CREATE TABLE notificacao (
  id             BIGSERIAL PRIMARY KEY,
  petshop_id     BIGINT           NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  usuario_id     BIGINT           NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  canal          canal_notificacao NOT NULL,       -- e-mail / push
  tipo           VARCHAR(40)      NOT NULL,        -- lembrete_agendamento/vacina/estoque
  destinatario   VARCHAR(180)     NOT NULL,        -- e-mail ou nome (push)
  mensagem       TEXT             NOT NULL,
  -- Referência opcional para não duplicar envio do mesmo aviso.
  agendamento_id BIGINT           REFERENCES agendamento(id) ON DELETE CASCADE,
  data_envio     TIMESTAMPTZ      NOT NULL DEFAULT now(),
  lida           BOOLEAN          NOT NULL DEFAULT false,
  CONSTRAINT notificacao_usuario_mesmo_petshop
    FOREIGN KEY (usuario_id, petshop_id) REFERENCES usuario(id, petshop_id)
);
CREATE INDEX notificacao_usuario_idx ON notificacao (usuario_id, lida);

-- Relatorio (RF27): metadados das exportações geradas pelo gestor.
CREATE TABLE relatorio (
  id            BIGSERIAL PRIMARY KEY,
  petshop_id    BIGINT         NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  tipo          tipo_relatorio NOT NULL,
  formato       formato_arquivo NOT NULL,
  periodo       VARCHAR(120)   NOT NULL,
  usuario_id    BIGINT         NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  caminho_arquivo VARCHAR(255),
  data_geracao  TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT relatorio_usuario_mesmo_petshop
    FOREIGN KEY (usuario_id, petshop_id) REFERENCES usuario(id, petshop_id)
);