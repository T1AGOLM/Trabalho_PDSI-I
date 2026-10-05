-- =====================================================================
-- PetPlus — Modelo Físico de Dados
-- 002_tabelas.sql
-- ---------------------------------------------------------------------
-- Todas as tabelas em 3FN, chaves primárias surrogate BIGSERIAL e
-- participação total dos dependentes parciais resolvida por junções
-- externas (LEFT JOIN).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. MULTI-TENANT (RNF13) — isolamento lógico por petshop
-- ---------------------------------------------------------------------

CREATE TABLE petshop (
  id              BIGSERIAL PRIMARY KEY,
  nome            VARCHAR(150) NOT NULL,
  cnpj            CHAR(14)     NOT NULL UNIQUE,
  email           CITEXT       NOT NULL UNIQUE,
  telefone        VARCHAR(20),
  endereco        VARCHAR(255),
  timezone        VARCHAR(64)  NOT NULL DEFAULT 'America/Sao_Paulo',
  -- Política comercial usada para validar o prazo de estorno (RN11).
  prazo_estorno_dias INT       NOT NULL DEFAULT 7
                    CHECK (prazo_estorno_dias BETWEEN 0 AND 365),
  -- Janela de antecedência do lembrete de agendamento (RN06 / RF12).
  antecedencia_lembrete_h SMALLINT NOT NULL DEFAULT 24
                    CHECK (antecedencia_lembrete_h BETWEEN 1 AND 168),
  -- Antecedência do alerta de validade de produto (RN09).
  antecedencia_validade_d SMALLINT NOT NULL DEFAULT 30
                    CHECK (antecedencia_validade_d BETWEEN 1 AND 365),
  ativo           BOOLEAN      NOT NULL DEFAULT true,
  criado_em       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em   TIMESTAMPTZ  NOT NULL DEFAULT now()
);
COMMENT ON TABLE petshop IS 'Tenant da arquitetura multi-tenant (RNF13).';
COMMENT ON COLUMN petshop.prazo_estorno_dias IS 'RN11: prazo máximo para estorno de venda.';

-- ---------------------------------------------------------------------
-- 2. AUTENTICAÇÃO E PERFIS
--    A classe abstrata Usuario do diagrama vira a tabela `usuario`;
--    Cliente, Colaborador e Gestor são especializações por perfil (1:0..1),
--    evitando a herança de tabela com dados duplicados.
-- ---------------------------------------------------------------------

CREATE TABLE usuario (
  id             BIGSERIAL PRIMARY KEY,
  petshop_id     BIGINT       NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  perfil         perfil_usuario NOT NULL,
  nome           VARCHAR(150) NOT NULL CHECK (btrim(nome) <> ''),
  email          CITEXT       NOT NULL UNIQUE,           -- RF01 / RF18
  telefone       VARCHAR(20),                          -- RF01
  senha_hash     TEXT         NOT NULL,                 -- RNF02: bcrypt + salt
  ativo          BOOLEAN      NOT NULL DEFAULT true,    -- RF03: exclusão lógica
  consent_lgpd   BOOLEAN      NOT NULL DEFAULT false,   -- RNF11
  consent_em     TIMESTAMPTZ,
  ultimo_acesso  TIMESTAMPTZ,
  criado_em      TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- Chave candidata usada pelas FKs compostas que impedem atravessar tenants.
  CONSTRAINT usuario_id_petshop_uniq UNIQUE (id, petshop_id)
);

-- Token de recuperação de senha (RF24) e de revogação de sessão.
CREATE TABLE token_recuperacao (
  id          BIGSERIAL PRIMARY KEY,
  petshop_id  BIGINT      NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  usuario_id  BIGINT      NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
  token_hash  TEXT        NOT NULL UNIQUE,   -- nunca armazenamos o token em claro
  expira_em   TIMESTAMPTZ NOT NULL,
  usado_em    TIMESTAMPTZ,
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT token_recuperacao_usuario_mesmo_petshop
    FOREIGN KEY (usuario_id, petshop_id) REFERENCES usuario(id, petshop_id)
);

-- Cliente = tutor. Dependências parciais (endereco, pontos_fidelidade)
-- promoted a colunas: destino final 1FN.
CREATE TABLE cliente (
  usuario_id        BIGINT PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
  petshop_id        BIGINT       NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  cpf               CHAR(11)     UNIQUE,
  endereco          VARCHAR(255),                    -- RF01
  pontos_fidelidade INTEGER      NOT NULL DEFAULT 0 CHECK (pontos_fidelidade >= 0), -- RF20
  criado_em         TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em     TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- O tutor só pode ser cliente do petshop em que está cadastrado.
  CONSTRAINT cliente_petshop_dono
    FOREIGN KEY (usuario_id, petshop_id) REFERENCES usuario(id, petshop_id),
  CONSTRAINT cliente_id_petshop_uniq UNIQUE (usuario_id, petshop_id)
);

-- Colaborador = funcionário operacional (RF16).
CREATE TABLE colaborador (
  usuario_id          BIGINT PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
  petshop_id          BIGINT       NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  cargo               tipo_cargo   NOT NULL,        -- ATENDENTE/TOSADOR/BANHISTA/VETERINARIO
  matricula           VARCHAR(30),
  -- RN08: um colaborador só é agendado dentro da disponibilidade cadastrada.
  --       A regra é materializada pela view vw_colaborador_disponivel + regra
  --       de negócio no serviço de agenda.
  criado_em           TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em       TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT colaborador_petshop_dono
    FOREIGN KEY (usuario_id, petshop_id) REFERENCES usuario(id, petshop_id),
  CONSTRAINT colaborador_id_petshop_uniq UNIQUE (usuario_id, petshop_id)
);

-- Gestor herda tudo de Usuario; aqui ficam apenas os dados próprios do gestor.
CREATE TABLE gestor (
  usuario_id  BIGINT PRIMARY KEY REFERENCES usuario(id) ON DELETE CASCADE,
  petshop_id  BIGINT      NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  cargo       VARCHAR(80) NOT NULL DEFAULT 'Proprietário',
  criado_em   TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT gestor_petshop_dono
    FOREIGN KEY (usuario_id, petshop_id) REFERENCES usuario(id, petshop_id)
);

-- Disponibilidade semanal do colaborador (Lista<Horario> do diagrama).
-- A linha completa a entidade fraca: (colaborador, dia_semana).
CREATE TABLE disponibilidade_colaborador (
  id             BIGSERIAL PRIMARY KEY,
  petshop_id     BIGINT      NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  colaborador_id BIGINT      NOT NULL REFERENCES colaborador(usuario_id) ON DELETE CASCADE,
  dia_semana     SMALLINT    NOT NULL CHECK (dia_semana BETWEEN 0 AND 6), -- 0=domingo
  hora_inicio    TIME        NOT NULL,
  hora_fim       TIME        NOT NULL,
  CONSTRAINT disponibilidade_horario_valido CHECK (hora_fim > hora_inicio),
  -- 3FN: a chave natural (colaborador, dia) é única; a hora não é chave.
  CONSTRAINT disponibilidade_unica UNIQUE (colaborador_id, dia_semana)
);

-- ---------------------------------------------------------------------
-- 3. PETS E LINHA DO TEMPO DE SAÚDE
-- ---------------------------------------------------------------------

CREATE TABLE pet (
  id               BIGSERIAL PRIMARY KEY,
  petshop_id       BIGINT       NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  cliente_id       BIGINT       NOT NULL REFERENCES cliente(usuario_id) ON DELETE RESTRICT, -- RF02
  nome             VARCHAR(100) NOT NULL CHECK (btrim(nome) <> ''),
  especie          VARCHAR(40)  NOT NULL,
  raca             VARCHAR(60),
  porte            VARCHAR(20),
  -- Idade em anos (atributo derivado da data de nascimento quando conhecida).
  idade            SMALLINT    CHECK (idade BETWEEN 0 AND 40),
  data_nascimento  DATE         CHECK (data_nascimento <= CURRENT_DATE),
  observacoes_saude TEXT,                              -- RF02
  ativo            BOOLEAN      NOT NULL DEFAULT true, -- RF03: exclusão lógica
  criado_em        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  atualizado_em    TIMESTAMPTZ  NOT NULL DEFAULT now(),
  -- O pet precisa pertencer ao mesmo petshop do tutor (isolamento do tenant).
  CONSTRAINT pet_cliente_mesmo_petshop
    FOREIGN KEY (cliente_id, petshop_id) REFERENCES cliente(usuario_id, petshop_id),
  CONSTRAINT pet_id_petshop_uniq UNIQUE (id, petshop_id),
  -- O par (id, cliente_id) é único e é o que permite ao agendamento
  -- garantir que o tutor informado é MESMO o dono do pet.
  CONSTRAINT pet_id_cliente_uniq UNIQUE (id, cliente_id)
);

-- RegistroSaude: item da linha do tempo (RF11). Sempre 1 pet (0..*).
-- Quando o registro vem de um atendimento, opcionalmente referencia o
-- agendamento que o originou (agendamento_id nullable).
CREATE TABLE registro_saude (
  id               BIGSERIAL PRIMARY KEY,
  petshop_id       BIGINT       NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  pet_id           BIGINT       NOT NULL REFERENCES pet(id) ON DELETE CASCADE,
  tipo             tipo_registro NOT NULL,            -- vacina/atendimento/banho/observação
  data             DATE         NOT NULL DEFAULT CURRENT_DATE,
  descricao        TEXT         NOT NULL CHECK (btrim(descricao) <> ''),
  proximo_vencimento DATE,      -- RF13: alerta de vacina próxima do vencimento
  criado_em        TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT registro_pet_mesmo_petshop
    FOREIGN KEY (pet_id, petshop_id) REFERENCES pet(id, petshop_id)
);

-- ---------------------------------------------------------------------
-- 4. SERVIÇOS, AGENDA E PACOTES
-- ---------------------------------------------------------------------

CREATE TABLE servico (
  id          BIGSERIAL PRIMARY KEY,
  petshop_id  BIGINT         NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  nome        VARCHAR(120)   NOT NULL CHECK (btrim(nome) <> ''),
  tipo        tipo_servico   NOT NULL,
  duracao     INTEGER        NOT NULL CHECK (duracao > 0),   -- minutos
  preco       NUMERIC(10,2)  NOT NULL CHECK (preco >= 0),
  ativo       BOOLEAN        NOT NULL DEFAULT true,
  criado_em   TIMESTAMPTZ    NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ  NOT NULL DEFAULT now(),
  CONSTRAINT servico_nome_unico UNIQUE (petshop_id, nome)
);

-- Agendamento (RF04). Guarda o instante de início/fim para viabilizar a
-- validação de conflito por intervalo (RN01) via constraint EXCLUDE.
CREATE TABLE agendamento (
  id             BIGSERIAL PRIMARY KEY,
  petshop_id     BIGINT          NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  pet_id         BIGINT          NOT NULL REFERENCES pet(id)      ON DELETE RESTRICT,
  cliente_id     BIGINT          NOT NULL REFERENCES cliente(usuario_id) ON DELETE RESTRICT,
  colaborador_id BIGINT          NOT NULL REFERENCES colaborador(usuario_id) ON DELETE RESTRICT,
  servico_id     BIGINT          NOT NULL REFERENCES servico(id)    ON DELETE RESTRICT,
  data_hora      TIMESTAMPTZ     NOT NULL,                        -- início (instante absoluto)
  data_hora_fim  TIMESTAMPTZ     NOT NULL,                        -- início + duracao do serviço
  status         status_agendamento NOT NULL DEFAULT 'confirmado',
  valor          NUMERIC(10,2)   NOT NULL CHECK (valor >= 0),     -- preço congelado na venda
  observacoes    TEXT,
  cancelado_em   TIMESTAMPTZ,
  motivo_cancelamento TEXT,
  criado_por     BIGINT          REFERENCES usuario(id),
  criado_em      TIMESTAMPTZ     NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ     NOT NULL DEFAULT now(),
  -- 3FN: o tutor do agendamento é DETERMINADO pelo pet. A FK composta
  -- (pet_id, cliente_id) impede o bug "agendamento do pet do cliente A
  -- vinculado ao cliente B" só com o banco, sem depender da aplicação.
  CONSTRAINT agendamento_pet_e_cliente_coerentes
    FOREIGN KEY (pet_id, cliente_id) REFERENCES pet(id, cliente_id),
  CONSTRAINT agendamento_pet_mesmo_petshop
    FOREIGN KEY (pet_id, petshop_id) REFERENCES pet(id, petshop_id),
  CONSTRAINT agendamento_cliente_mesmo_petshop
    FOREIGN KEY (cliente_id, petshop_id) REFERENCES cliente(usuario_id, petshop_id),
  CONSTRAINT agendamento_colaborador_mesmo_petshop
    FOREIGN KEY (colaborador_id, petshop_id) REFERENCES colaborador(usuario_id, petshop_id),
  CONSTRAINT agendamento_intervalo_valido CHECK (data_hora_fim > data_hora),
  CONSTRAINT agendamento_cancelamento
    CHECK (status <> 'cancelado' OR cancelado_em IS NOT NULL),
  CONSTRAINT agendamento_id_petshop_uniq UNIQUE (id, petshop_id)
);
CREATE INDEX agendamento_colaborador_data_idx ON agendamento (colaborador_id, data_hora);

-- BloqueioAgenda (RF30/RN12): férias, folgas e ausências.
CREATE TABLE bloqueio_agenda (
  id             BIGSERIAL PRIMARY KEY,
  petshop_id     BIGINT      NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  colaborador_id BIGINT      NOT NULL REFERENCES colaborador(usuario_id) ON DELETE CASCADE,
  data_inicio    DATE        NOT NULL,
  data_fim       DATE        NOT NULL,
  motivo         VARCHAR(200) NOT NULL CHECK (btrim(motivo) <> ''),
  criado_em      TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT bloqueio_periodo_valido CHECK (data_fim >= data_inicio),
  CONSTRAINT bloqueio_colaborador_mesmo_petshop
    FOREIGN KEY (colaborador_id, petshop_id) REFERENCES colaborador(usuario_id, petshop_id)
);

-- Avaliacao (RF28): nota + comentário opcional após o atendimento.
-- 1:0..1 com agendamento (UNIQUE em agendamento_id).
CREATE TABLE avaliacao (
  id              BIGSERIAL PRIMARY KEY,
  petshop_id      BIGINT      NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  agendamento_id  BIGINT      NOT NULL UNIQUE REFERENCES agendamento(id) ON DELETE CASCADE,
  cliente_id      BIGINT      NOT NULL REFERENCES cliente(usuario_id) ON DELETE CASCADE,
  nota            SMALLINT    NOT NULL CHECK (nota BETWEEN 1 AND 5),
  comentario      TEXT,
  data            TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT avaliacao_agendamento_mesmo_petshop
    FOREIGN KEY (agendamento_id, petshop_id) REFERENCES agendamento(id, petshop_id),
  CONSTRAINT avaliacao_cliente_mesmo_petshop
    FOREIGN KEY (cliente_id, petshop_id) REFERENCES cliente(usuario_id, petshop_id)
);

-- PacoteServico (RF29): assinatura recorrente de um conjunto de serviços.
CREATE TABLE pacote_servico (
  id             BIGSERIAL PRIMARY KEY,
  petshop_id     BIGINT         NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  nome           VARCHAR(120)   NOT NULL CHECK (btrim(nome) <> ''),
  periodicidade  VARCHAR(40)    NOT NULL,             -- ex.: 'Mensal'
  preco          NUMERIC(10,2)  NOT NULL CHECK (preco >= 0),
  ativo          BOOLEAN        NOT NULL DEFAULT true,
  criado_em      TIMESTAMPTZ    NOT NULL DEFAULT now(),
  atualizado_em  TIMESTAMPTZ    NOT NULL DEFAULT now(),
  CONSTRAINT pacote_nome_unico UNIQUE (petshop_id, nome)
);

-- N:N entre PacoteServico e Servico (relacionamento "inclui" 1..*).
CREATE TABLE pacote_servico_item (
  pacote_id   BIGINT NOT NULL REFERENCES pacote_servico(id) ON DELETE CASCADE,
  servico_id  BIGINT NOT NULL REFERENCES servico(id)       ON DELETE RESTRICT,
  petshop_id  BIGINT NOT NULL REFERENCES petshop(id)        ON DELETE CASCADE,
  PRIMARY KEY (pacote_id, servico_id)
);

-- Assinatura ativa de um pacote para um cliente e seu pet (RF29).
CREATE TABLE assinatura_pacote (
  id           BIGSERIAL PRIMARY KEY,
  petshop_id   BIGINT      NOT NULL REFERENCES petshop(id) ON DELETE CASCADE,
  pacote_id    BIGINT      NOT NULL REFERENCES pacote_servico(id) ON DELETE RESTRICT,
  cliente_id   BIGINT      NOT NULL REFERENCES cliente(usuario_id) ON DELETE CASCADE,
  pet_id       BIGINT      NOT NULL REFERENCES pet(id) ON DELETE CASCADE,
  status       status_assinatura NOT NULL DEFAULT 'ativo',
  iniciada_em  TIMESTAMPTZ NOT NULL DEFAULT now(),
  encerrada_em TIMESTAMPTZ,
  CONSTRAINT assinatura_pacote_mesmo_petshop
    FOREIGN KEY (cliente_id, petshop_id) REFERENCES cliente(usuario_id, petshop_id),
  CONSTRAINT assinatura_pet_mesmo_petshop
    FOREIGN KEY (pet_id, petshop_id) REFERENCES pet(id, petshop_id)
);