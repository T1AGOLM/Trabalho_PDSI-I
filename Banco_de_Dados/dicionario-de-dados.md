# Dicionário de Dados — PetPlus

> Documento **gerado automaticamente** a partir do banco em execução.
> Para regerar após mexer no schema: `cd backend && npm run dicionario`.

- **PostgreSQL:** 17
- **Tabelas:** 26
- **Colunas:** 232
- **Chaves estrangeiras:** 84
- **Índices:** 54

## Convenções

| Convenção | Significado |
|---|---|
| `id BIGSERIAL` | Chave primária surrogate, atribuída pelo banco |
| `petshop_id` | Tenant dono da linha — base do isolamento multi-tenant (RNF13) |
| `enum` | Domínio fechado vindo do diagrama de classes (tipo de serviço, status…) |
| `citext` | Texto sem distinção de caixa (e-mail) |
| `char(14)` / `char(11)` | CNPJ e CPF **normalizados, só dígitos** |
| `numeric(10,2)` / `numeric(12,2)` | Dinheiro — nunca ponto flutuante |
| `timestamptz` | Instante absoluto; convertemos para o fuso do petshop na apresentação |
| `ativo BOOLEAN` | Exclusão lógica (RF03): o registro sai da listagem, o histórico permanece |
| `*_em` | Momento do fato |

## Regras de negócio garantidas pelo BANCO

Estas regras não dependem da aplicação: o PostgreSQL recusa a operação.
Por isso o `npm run test:db` consegue prová-las.

### `agendamento_cancelamento` — agendamento · CHECK

```sql
CHECK (((status <> 'cancelado'::status_agendamento) OR (cancelado_em IS NOT NULL)));
```

### `agendamento_intervalo_valido` — agendamento · CHECK

```sql
CHECK ((data_hora_fim > data_hora));
```

### `agendamento_sem_conflito_profissional` — agendamento · EXCLUDE

RN01 (e RN04): impede dois atendimentos do mesmo profissional em intervalos sobrepostos; a cláusula WHERE exclui cancelados.

```sql
EXCLUDE USING gist (petshop_id WITH =, colaborador_id WITH =, tstzrange(data_hora, data_hora_fim, '[)'::text) WITH &&) WHERE ((status <> 'cancelado'::status_agendamento));
```

### `agendamento_valor_check` — agendamento · CHECK

```sql
CHECK ((valor >= (0)::numeric));
```

### `avaliacao_nota_check` — avaliacao · CHECK

```sql
CHECK (((nota >= 1) AND (nota <= 5)));
```

### `bloqueio_agenda_motivo_check` — bloqueio_agenda · CHECK

```sql
CHECK ((btrim((motivo)::text) <> ''::text));
```

### `bloqueio_periodo_valido` — bloqueio_agenda · CHECK

```sql
CHECK ((data_fim >= data_inicio));
```

### `cliente_pontos_fidelidade_check` — cliente · CHECK

```sql
CHECK ((pontos_fidelidade >= 0));
```

### `disponibilidade_colaborador_dia_semana_check` — disponibilidade_colaborador · CHECK

```sql
CHECK (((dia_semana >= 0) AND (dia_semana <= 6)));
```

### `disponibilidade_horario_valido` — disponibilidade_colaborador · CHECK

```sql
CHECK ((hora_fim > hora_inicio));
```

### `fornecedor_nome_check` — fornecedor · CHECK

```sql
CHECK ((btrim((nome)::text) <> ''::text));
```

### `item_venda_preco_unitario_check` — item_venda · CHECK

```sql
CHECK ((preco_unitario >= (0)::numeric));
```

### `item_venda_quantidade_check` — item_venda · CHECK

```sql
CHECK ((quantidade > 0));
```

### `item_venda_subtotal_check` — item_venda · CHECK

```sql
CHECK ((subtotal >= (0)::numeric));
```

### `lote_custo_unitario_check` — lote · CHECK

```sql
CHECK ((custo_unitario >= (0)::numeric));
```

### `lote_quantidade_check` — lote · CHECK

```sql
CHECK ((quantidade > 0));
```

### `movimentacao_estoque_quantidade_check` — movimentacao_estoque · CHECK

```sql
CHECK ((quantidade > 0));
```

### `pacote_servico_nome_check` — pacote_servico · CHECK

```sql
CHECK ((btrim((nome)::text) <> ''::text));
```

### `pacote_servico_preco_check` — pacote_servico · CHECK

```sql
CHECK ((preco >= (0)::numeric));
```

### `pagamento_valor_check` — pagamento · CHECK

```sql
CHECK ((valor > (0)::numeric));
```

### `pet_data_nascimento_check` — pet · CHECK

```sql
CHECK ((data_nascimento <= CURRENT_DATE));
```

### `pet_idade_check` — pet · CHECK

```sql
CHECK (((idade >= 0) AND (idade <= 40)));
```

### `pet_nome_check` — pet · CHECK

```sql
CHECK ((btrim((nome)::text) <> ''::text));
```

### `petshop_antecedencia_lembrete_h_check` — petshop · CHECK

```sql
CHECK (((antecedencia_lembrete_h >= 1) AND (antecedencia_lembrete_h <= 168)));
```

### `petshop_antecedencia_validade_d_check` — petshop · CHECK

```sql
CHECK (((antecedencia_validade_d >= 1) AND (antecedencia_validade_d <= 365)));
```

### `petshop_prazo_estorno_dias_check` — petshop · CHECK

```sql
CHECK (((prazo_estorno_dias >= 0) AND (prazo_estorno_dias <= 365)));
```

### `produto_estoque_minimo_check` — produto · CHECK

```sql
CHECK ((estoque_minimo >= 0));
```

### `produto_nome_check` — produto · CHECK

```sql
CHECK ((btrim((nome)::text) <> ''::text));
```

### `produto_preco_check` — produto · CHECK

```sql
CHECK ((preco >= (0)::numeric));
```

### `produto_quantidade_estoque_check` — produto · CHECK

```sql
CHECK ((quantidade_estoque >= 0));
```

### `registro_saude_descricao_check` — registro_saude · CHECK

```sql
CHECK ((btrim(descricao) <> ''::text));
```

### `servico_duracao_check` — servico · CHECK

```sql
CHECK ((duracao > 0));
```

### `servico_nome_check` — servico · CHECK

```sql
CHECK ((btrim((nome)::text) <> ''::text));
```

### `servico_preco_check` — servico · CHECK

```sql
CHECK ((preco >= (0)::numeric));
```

### `usuario_nome_check` — usuario · CHECK

```sql
CHECK ((btrim((nome)::text) <> ''::text));
```

### `venda_desconto_check` — venda · CHECK

```sql
CHECK ((desconto >= (0)::numeric));
```

### `venda_estorno` — venda · CHECK

```sql
CHECK (((status <> 'estornada'::status_venda) OR ((estornado_em IS NOT NULL) AND (estornado_por IS NOT NULL))));
```

### `venda_valor_total_check` — venda · CHECK

```sql
CHECK ((valor_total >= (0)::numeric));
```

### Gatilhos

| Tabela | Gatilho | O que faz |
|---|---|---|
| `agendamento` | `trg_validar_disponibilidade` | Recusa agendamento fora da disponibilidade do colaborador (RN08) |
| `bloqueio_agenda` | `trg_validar_bloqueio` | Recusa bloqueio que sobreponha agendamento confirmado (RN12) |
| `cliente` | `trg_cliente_touch` | — |
| `colaborador` | `trg_colaborador_touch` | — |
| `fornecedor` | `trg_fornecedor_touch` | — |
| `movimentacao_estoque` | `trg_movimentar_estoque` | Atualiza `produto.quantidade_estoque` e impede saldo negativo (RN02) |
| `pacote_servico` | `trg_pacote_servico_touch` | — |
| `pagamento` | `trg_validar_pagamentos` | Confere que a soma dos pagamentos cobre o total (RF25) — roda no COMMIT |
| `pet` | `trg_pet_touch` | — |
| `produto` | `trg_auditar_produto` | Grava o antes/depois em `auditoria` (RNF09) |
| `produto` | `trg_produto_touch` | — |
| `servico` | `trg_servico_touch` | — |
| `usuario` | `trg_usuario_touch` | — |
| `venda` | `trg_validar_estorno` | Exige perfil GESTOR e prazo comercial no estorno (RN11) |
| `venda` | `trg_venda_touch` | — |

## Tabelas

### Multi-tenant e segurança

#### `petshop`

Tenant da arquitetura multi-tenant (RNF13). Todo dado de negócio se apoia nesta tabela.

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK |
| `nome` | `character varying(150)` | não | — |
| `cnpj` | `character(14)` | não | UNIQUE |
| `email` | `citext` | não | UNIQUE |
| `telefone` | `character varying(20)` | sim | — |
| `endereco` | `character varying(255)` | sim | — |
| `timezone` | `character varying(64)` | não | — |
| `prazo_estorno_dias` | `integer` | não | RN11: prazo máximo para estorno de venda. |
| `antecedencia_lembrete_h` | `smallint` | não | — |
| `antecedencia_validade_d` | `smallint` | não | — |
| `ativo` | `boolean` | não | — |
| `criado_em` | `timestamp with time zone` | não | — |
| `atualizado_em` | `timestamp with time zone` | não | — |

### Usuários e perfis

#### `usuario`

Classe abstrata Usuario do diagrama de classes. Cliente, Colaborador e Gestor são especializações por `perfil` (1:0..1).

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK · UNIQUE |
| `petshop_id` | `bigint` | não | FK → petshop(id) · UNIQUE |
| `perfil` | `perfil_usuario` | não | — |
| `nome` | `character varying(150)` | não | — |
| `email` | `citext` | não | UNIQUE |
| `telefone` | `character varying(20)` | sim | — |
| `senha_hash` | `text` | não | — |
| `ativo` | `boolean` | não | — |
| `consent_lgpd` | `boolean` | não | — |
| `consent_em` | `timestamp with time zone` | sim | — |
| `ultimo_acesso` | `timestamp with time zone` | sim | — |
| `criado_em` | `timestamp with time zone` | não | — |
| `atualizado_em` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `petshop_id` → `petshop(id)`

#### `token_recuperacao`

Tokens de recuperação de senha (RF24). Guarda-se apenas o SHA-256 do token.

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK |
| `petshop_id` | `bigint` | não | FK → petshop(id) · FK → usuario(id, petshop_id) 🔒 |
| `usuario_id` | `bigint` | não | FK → usuario(id) · FK → usuario(id, petshop_id) 🔒 |
| `token_hash` | `text` | não | UNIQUE |
| `expira_em` | `timestamp with time zone` | não | — |
| `usado_em` | `timestamp with time zone` | sim | — |
| `criado_em` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `petshop_id` → `petshop(id)`
- `usuario_id` → `usuario(id)`
- `usuario_id, petshop_id` → `usuario(id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants

#### `cliente`

Especialização: tutor do pet. Participação parcial (endereco, pontos de fidelidade) promovida a coluna.

**PK:** `usuario_id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `usuario_id` | `bigint` | não | PK · FK → usuario(id, petshop_id) 🔒 · FK → usuario(id) · UNIQUE |
| `petshop_id` | `bigint` | não | FK → usuario(id, petshop_id) 🔒 · FK → petshop(id) · UNIQUE |
| `cpf` | `character(11)` | sim | UNIQUE |
| `endereco` | `character varying(255)` | sim | — |
| `pontos_fidelidade` | `integer` | não | — |
| `criado_em` | `timestamp with time zone` | não | — |
| `atualizado_em` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `usuario_id, petshop_id` → `usuario(id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants
- `petshop_id` → `petshop(id)`
- `usuario_id` → `usuario(id)`

#### `gestor`

Especialização: dono/gerente do petshop. Sem atributos próprios além do cargo.

**PK:** `usuario_id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `usuario_id` | `bigint` | não | PK · FK → usuario(id, petshop_id) 🔒 · FK → usuario(id) |
| `petshop_id` | `bigint` | não | FK → usuario(id, petshop_id) 🔒 · FK → petshop(id) |
| `cargo` | `character varying(80)` | não | — |
| `criado_em` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `usuario_id, petshop_id` → `usuario(id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants
- `petshop_id` → `petshop(id)`
- `usuario_id` → `usuario(id)`

#### `colaborador`

Especialização: funcionário operacional (RF16).

**PK:** `usuario_id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `usuario_id` | `bigint` | não | PK · FK → usuario(id, petshop_id) 🔒 · FK → usuario(id) · UNIQUE |
| `petshop_id` | `bigint` | não | FK → usuario(id, petshop_id) 🔒 · FK → petshop(id) · UNIQUE |
| `cargo` | `tipo_cargo` | não | — |
| `matricula` | `character varying(30)` | sim | — |
| `criado_em` | `timestamp with time zone` | não | — |
| `atualizado_em` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `usuario_id, petshop_id` → `usuario(id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants
- `petshop_id` → `petshop(id)`
- `usuario_id` → `usuario(id)`

#### `disponibilidade_colaborador`

Disponibilidade semanal (RN08). É a entidade fraca (colaborador, dia_semana) que o texto "Seg–Sex 08h–18h" do protótipo representava.

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK |
| `petshop_id` | `bigint` | não | FK → petshop(id) |
| `colaborador_id` | `bigint` | não | FK → colaborador(usuario_id) · UNIQUE |
| `dia_semana` | `smallint` | não | UNIQUE |
| `hora_inicio` | `time without time zone` | não | — |
| `hora_fim` | `time without time zone` | não | — |

**Chaves estrangeiras:**

- `colaborador_id` → `colaborador(usuario_id)`
- `petshop_id` → `petshop(id)`

### Pets e histórico de saúde

#### `pet`

Animal de estimação vinculado a um tutor (RF02).

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK · UNIQUE |
| `petshop_id` | `bigint` | não | FK → cliente(usuario_id, petshop_id) 🔒 · FK → petshop(id) · UNIQUE |
| `cliente_id` | `bigint` | não | FK → cliente(usuario_id) · FK → cliente(usuario_id, petshop_id) 🔒 · UNIQUE |
| `nome` | `character varying(100)` | não | — |
| `especie` | `character varying(40)` | não | — |
| `raca` | `character varying(60)` | sim | — |
| `porte` | `character varying(20)` | sim | — |
| `idade` | `smallint` | sim | — |
| `data_nascimento` | `date` | sim | — |
| `observacoes_saude` | `text` | sim | — |
| `ativo` | `boolean` | não | — |
| `criado_em` | `timestamp with time zone` | não | — |
| `atualizado_em` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `cliente_id` → `cliente(usuario_id)`
- `cliente_id, petshop_id` → `cliente(usuario_id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants
- `petshop_id` → `petshop(id)`

#### `registro_saude`

Item da linha do tempo de saúde do pet (RF11). Sempre pertence a um pet.

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK |
| `petshop_id` | `bigint` | não | FK → pet(id, petshop_id) 🔒 · FK → petshop(id) |
| `pet_id` | `bigint` | não | FK → pet(id, petshop_id) 🔒 · FK → pet(id) |
| `tipo` | `tipo_registro` | não | — |
| `data` | `date` | não | — |
| `descricao` | `text` | não | — |
| `proximo_vencimento` | `date` | sim | — |
| `criado_em` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `pet_id, petshop_id` → `pet(id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants
- `pet_id` → `pet(id)`
- `petshop_id` → `petshop(id)`

### Serviços, agenda e pacotes

#### `servico`

Serviço oferecido (banho, tosa, consulta), usado em agendamentos e pacotes.

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK |
| `petshop_id` | `bigint` | não | FK → petshop(id) · UNIQUE |
| `nome` | `character varying(120)` | não | UNIQUE |
| `tipo` | `tipo_servico` | não | — |
| `duracao` | `integer` | não | — |
| `preco` | `numeric(10,2)` | não | — |
| `ativo` | `boolean` | não | — |
| `criado_em` | `timestamp with time zone` | não | — |
| `atualizado_em` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `petshop_id` → `petshop(id)`

#### `agendamento`

Marcação de serviço (RF04). `data_hora_fim` existe para que o conflito de agenda possa ser comparado por INTERVALO (RN01), e não por igualdade de minuto.

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK · UNIQUE |
| `petshop_id` | `bigint` | não | FK → cliente(usuario_id, petshop_id) 🔒 · FK → colaborador(usuario_id, petshop_id) 🔒 · FK → pet(id, petshop_id) 🔒 · FK → petshop(id) · UNIQUE |
| `pet_id` | `bigint` | não | FK → pet(id, cliente_id) · FK → pet(id) · FK → pet(id, petshop_id) 🔒 |
| `cliente_id` | `bigint` | não | FK → cliente(usuario_id) · FK → cliente(usuario_id, petshop_id) 🔒 · FK → pet(id, cliente_id) |
| `colaborador_id` | `bigint` | não | FK → colaborador(usuario_id) · FK → colaborador(usuario_id, petshop_id) 🔒 |
| `servico_id` | `bigint` | não | FK → servico(id) |
| `data_hora` | `timestamp with time zone` | não | — |
| `data_hora_fim` | `timestamp with time zone` | não | — |
| `status` | `status_agendamento` | não | — |
| `valor` | `numeric(10,2)` | não | — |
| `observacoes` | `text` | sim | — |
| `cancelado_em` | `timestamp with time zone` | sim | — |
| `motivo_cancelamento` | `text` | sim | — |
| `criado_por` | `bigint` | sim | FK → usuario(id) |
| `criado_em` | `timestamp with time zone` | não | — |
| `atualizado_em` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `cliente_id` → `cliente(usuario_id)`
- `cliente_id, petshop_id` → `cliente(usuario_id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants
- `colaborador_id` → `colaborador(usuario_id)`
- `colaborador_id, petshop_id` → `colaborador(usuario_id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants
- `criado_por` → `usuario(id)`
- `pet_id, cliente_id` → `pet(id, cliente_id)`
- `pet_id` → `pet(id)`
- `pet_id, petshop_id` → `pet(id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants
- `petshop_id` → `petshop(id)`
- `servico_id` → `servico(id)`

#### `bloqueio_agenda`

Período de indisponibilidade do colaborador (RF30 / RN12).

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK |
| `petshop_id` | `bigint` | não | FK → petshop(id) · FK → colaborador(usuario_id, petshop_id) 🔒 |
| `colaborador_id` | `bigint` | não | FK → colaborador(usuario_id) · FK → colaborador(usuario_id, petshop_id) 🔒 |
| `data_inicio` | `date` | não | — |
| `data_fim` | `date` | não | — |
| `motivo` | `character varying(200)` | não | — |
| `criado_em` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `colaborador_id` → `colaborador(usuario_id)`
- `petshop_id` → `petshop(id)`
- `colaborador_id, petshop_id` → `colaborador(usuario_id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants

#### `avaliacao`

Avaliação do serviço pelo cliente (RF28). Um agendamento recebe no máximo uma (UNIQUE em agendamento_id).

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK |
| `petshop_id` | `bigint` | não | FK → agendamento(id, petshop_id) 🔒 · FK → cliente(usuario_id, petshop_id) 🔒 · FK → petshop(id) |
| `agendamento_id` | `bigint` | não | FK → agendamento(id) · FK → agendamento(id, petshop_id) 🔒 · UNIQUE |
| `cliente_id` | `bigint` | não | FK → cliente(usuario_id) · FK → cliente(usuario_id, petshop_id) 🔒 |
| `nota` | `smallint` | não | — |
| `comentario` | `text` | sim | — |
| `data` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `agendamento_id` → `agendamento(id)`
- `agendamento_id, petshop_id` → `agendamento(id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants
- `cliente_id` → `cliente(usuario_id)`
- `cliente_id, petshop_id` → `cliente(usuario_id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants
- `petshop_id` → `petshop(id)`

#### `pacote_servico`

Catálogo de planos recorrentes (RF29).

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK |
| `petshop_id` | `bigint` | não | FK → petshop(id) · UNIQUE |
| `nome` | `character varying(120)` | não | UNIQUE |
| `periodicidade` | `character varying(40)` | não | — |
| `preco` | `numeric(10,2)` | não | — |
| `ativo` | `boolean` | não | — |
| `criado_em` | `timestamp with time zone` | não | — |
| `atualizado_em` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `petshop_id` → `petshop(id)`

#### `pacote_servico_item`

N:N entre plano e serviço — resolve o relacionamento "inclui" do diagrama de classes.

**PK:** `pacote_id, servico_id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `pacote_id` | `bigint` | não | PK · FK → pacote_servico(id) |
| `servico_id` | `bigint` | não | PK · FK → servico(id) |
| `petshop_id` | `bigint` | não | FK → petshop(id) |

**Chaves estrangeiras:**

- `pacote_id` → `pacote_servico(id)`
- `petshop_id` → `petshop(id)`
- `servico_id` → `servico(id)`

#### `assinatura_pacote`

Contratação de um plano por um cliente para um pet.

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK |
| `petshop_id` | `bigint` | não | FK → cliente(usuario_id, petshop_id) 🔒 · FK → petshop(id) · FK → pet(id, petshop_id) 🔒 |
| `pacote_id` | `bigint` | não | FK → pacote_servico(id) |
| `cliente_id` | `bigint` | não | FK → cliente(usuario_id) · FK → cliente(usuario_id, petshop_id) 🔒 |
| `pet_id` | `bigint` | não | FK → pet(id) · FK → pet(id, petshop_id) 🔒 |
| `status` | `status_assinatura` | não | — |
| `iniciada_em` | `timestamp with time zone` | não | — |
| `encerrada_em` | `timestamp with time zone` | sim | — |

**Chaves estrangeiras:**

- `cliente_id` → `cliente(usuario_id)`
- `cliente_id, petshop_id` → `cliente(usuario_id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants
- `pacote_id` → `pacote_servico(id)`
- `pet_id` → `pet(id)`
- `petshop_id` → `petshop(id)`
- `pet_id, petshop_id` → `pet(id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants

### Estoque e fornecedores

#### `fornecedor`

Empresa fornecedora (Rastreabilidade de estoque).

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK |
| `petshop_id` | `bigint` | não | FK → petshop(id) · UNIQUE |
| `nome` | `character varying(150)` | não | — |
| `cnpj` | `character(14)` | não | UNIQUE |
| `contato` | `character varying(60)` | sim | — |
| `email` | `citext` | sim | — |
| `telefone` | `character varying(20)` | sim | — |
| `endereco` | `character varying(255)` | sim | — |
| `ativo` | `boolean` | não | — |
| `criado_em` | `timestamp with time zone` | não | — |
| `atualizado_em` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `petshop_id` → `petshop(id)`

#### `produto`

Item de estoque (RF07). `quantidade_estoque` é a PROJEÇÃO de `movimentacao_estoque` — nunca editada à mão.

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK · UNIQUE |
| `petshop_id` | `bigint` | não | FK → petshop(id) · UNIQUE |
| `fornecedor_id` | `bigint` | sim | FK → fornecedor(id) |
| `nome` | `character varying(180)` | não | UNIQUE |
| `categoria` | `character varying(60)` | não | — |
| `sku` | `character varying(60)` | sim | — |
| `quantidade_estoque` | `integer` | não | — |
| `estoque_minimo` | `integer` | não | — |
| `validade` | `date` | sim | — |
| `preco` | `numeric(10,2)` | não | — |
| `ativo` | `boolean` | não | — |
| `criado_em` | `timestamp with time zone` | não | — |
| `atualizado_em` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `fornecedor_id` → `fornecedor(id)`
- `petshop_id` → `petshop(id)`

#### `lote`

Entrada de mercadoria com custo e validade.

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK |
| `petshop_id` | `bigint` | não | FK → petshop(id) · FK → produto(id, petshop_id) 🔒 |
| `produto_id` | `bigint` | não | FK → produto(id) · FK → produto(id, petshop_id) 🔒 |
| `fornecedor_id` | `bigint` | sim | FK → fornecedor(id) |
| `quantidade` | `integer` | não | — |
| `custo_unitario` | `numeric(10,2)` | não | — |
| `validade` | `date` | sim | — |
| `criado_em` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `fornecedor_id` → `fornecedor(id)`
- `petshop_id` → `petshop(id)`
- `produto_id` → `produto(id)`
- `produto_id, petshop_id` → `produto(id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants

#### `movimentacao_estoque`

Trilha append-only de toda entrada, saída, ajuste e estorno. É a fonte da verdade do saldo.

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK |
| `petshop_id` | `bigint` | não | FK → petshop(id) |
| `produto_id` | `bigint` | não | FK → produto(id) |
| `tipo` | `tipo_movimentacao` | não | — |
| `quantidade` | `integer` | não | — |
| `venda_id` | `bigint` | sim | FK → venda(id) |
| `lote_id` | `bigint` | sim | FK → lote(id) |
| `usuario_id` | `bigint` | sim | FK → usuario(id) |
| `observacao` | `character varying(255)` | sim | — |
| `data_hora` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `lote_id` → `lote(id)`
- `petshop_id` → `petshop(id)`
- `produto_id` → `produto(id)`
- `usuario_id` → `usuario(id)`
- `venda_id` → `venda(id)`

### PDV — vendas

#### `venda`

Transação do PDV (RF10). `cliente_id` é nulo em venda avulsa.

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK · UNIQUE |
| `petshop_id` | `bigint` | não | FK → cliente(usuario_id, petshop_id) 🔒 · FK → petshop(id) · UNIQUE |
| `cliente_id` | `bigint` | sim | FK → cliente(usuario_id) · FK → cliente(usuario_id, petshop_id) 🔒 |
| `agendamento_id` | `bigint` | sim | FK → agendamento(id) |
| `data_hora` | `timestamp with time zone` | não | — |
| `valor_total` | `numeric(12,2)` | não | — |
| `desconto` | `numeric(12,2)` | não | — |
| `status` | `status_venda` | não | — |
| `usuario_id` | `bigint` | não | FK → usuario(id) |
| `estornado_em` | `timestamp with time zone` | sim | — |
| `estornado_por` | `bigint` | sim | FK → usuario(id) |
| `motivo_estorno` | `text` | sim | — |
| `criado_em` | `timestamp with time zone` | não | — |
| `atualizado_em` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `agendamento_id` → `agendamento(id)`
- `cliente_id` → `cliente(usuario_id)`
- `cliente_id, petshop_id` → `cliente(usuario_id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants
- `estornado_por` → `usuario(id)`
- `petshop_id` → `petshop(id)`
- `usuario_id` → `usuario(id)`

#### `item_venda`

Produto vendido. `nome` e `preco_unitario` ficam congelados para o comprovante não depender do cadastro atual.

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK |
| `petshop_id` | `bigint` | não | FK → petshop(id) · FK → venda(id, petshop_id) 🔒 |
| `venda_id` | `bigint` | não | FK → venda(id) · FK → venda(id, petshop_id) 🔒 |
| `produto_id` | `bigint` | sim | FK → produto(id) |
| `nome` | `character varying(180)` | não | — |
| `quantidade` | `integer` | não | — |
| `preco_unitario` | `numeric(10,2)` | não | — |
| `subtotal` | `numeric(12,2)` | não | — |

**Chaves estrangeiras:**

- `petshop_id` → `petshop(id)`
- `produto_id` → `produto(id)`
- `venda_id` → `venda(id)`
- `venda_id, petshop_id` → `venda(id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants

#### `pagamento`

Forma de pagamento de uma venda. Uma venda pode ter várias linhas (RF25 — pagamento combinado).

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK |
| `petshop_id` | `bigint` | não | FK → petshop(id) · FK → venda(id, petshop_id) 🔒 |
| `venda_id` | `bigint` | não | FK → venda(id) · FK → venda(id, petshop_id) 🔒 |
| `forma_pagamento` | `forma_pagamento` | não | — |
| `valor` | `numeric(12,2)` | não | — |
| `data_hora` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `petshop_id` → `petshop(id)`
- `venda_id` → `venda(id)`
- `venda_id, petshop_id` → `venda(id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants

### Comunicação, auditoria e relatórios

#### `notificacao`

Mensagem automática enviada ao usuário (RF12/RF13/RF22).

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK |
| `petshop_id` | `bigint` | não | FK → petshop(id) · FK → usuario(id, petshop_id) 🔒 |
| `usuario_id` | `bigint` | não | FK → usuario(id) · FK → usuario(id, petshop_id) 🔒 |
| `canal` | `canal_notificacao` | não | — |
| `tipo` | `character varying(40)` | não | — |
| `destinatario` | `character varying(180)` | não | — |
| `mensagem` | `text` | não | — |
| `agendamento_id` | `bigint` | sim | FK → agendamento(id) |
| `data_envio` | `timestamp with time zone` | não | — |
| `lida` | `boolean` | não | — |

**Chaves estrangeiras:**

- `agendamento_id` → `agendamento(id)`
- `petshop_id` → `petshop(id)`
- `usuario_id` → `usuario(id)`
- `usuario_id, petshop_id` → `usuario(id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants

#### `relatorio`

Metadados das exportações geradas pelo gestor (RF27).

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK |
| `petshop_id` | `bigint` | não | FK → petshop(id) · FK → usuario(id, petshop_id) 🔒 |
| `tipo` | `tipo_relatorio` | não | — |
| `formato` | `formato_arquivo` | não | — |
| `periodo` | `character varying(120)` | não | — |
| `usuario_id` | `bigint` | não | FK → usuario(id) · FK → usuario(id, petshop_id) 🔒 |
| `caminho_arquivo` | `character varying(255)` | sim | — |
| `data_geracao` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `petshop_id` → `petshop(id)`
- `usuario_id` → `usuario(id)`
- `usuario_id, petshop_id` → `usuario(id, petshop_id)` 🔒 composta com `petshop_id` — impede atravessar tenants

#### `auditoria`

Log das operações críticas (RNF09). `dados_antes`/`dados_depois` guardam o antes e o depois em JSONB.

**PK:** `id`

| Coluna | Tipo | Nulo | Descrição |
|---|---|---|---|
| `id` | `bigint` | não | PK |
| `petshop_id` | `bigint` | não | FK → petshop(id) |
| `usuario_id` | `bigint` | sim | FK → usuario(id) |
| `acao` | `character varying(40)` | não | — |
| `tabela` | `character varying(60)` | não | — |
| `registro_id` | `bigint` | sim | — |
| `dados_antes` | `jsonb` | sim | — |
| `dados_depois` | `jsonb` | sim | — |
| `data_hora` | `timestamp with time zone` | não | — |

**Chaves estrangeiras:**

- `petshop_id` → `petshop(id)`
- `usuario_id` → `usuario(id)`

## Views

Consultas prontas que a aplicação e os relatórios usam em vez de recalcular a lógica.

| View | Para que serve |
|---|---|
| `vw_agenda` | Agenda já expandida com nomes de pet, tutor, profissional e serviço |
| `vw_alerta_estoque_minimo` | Produtos no ou abaixo do estoque mínimo (RF09 / RN05) |
| `vw_alerta_validade` | Produtos vencendo dentro da janela configurada (RF23 / RN09) |
| `vw_comprovante_venda` | Comprovante de venda com itens e pagamentos na mesma linha |
| `vw_faturamento` | Faturamento por dia, semana e mês, só de vendas finalizadas (RF14) |
| `vw_ocupacao_agenda` | Minutos de agenda ocupada por dia (RF15) |
| `vw_servicos_mais_vendidos` | Serviços mais vendidos por quantidade e receita (RF15) |

## Índices

| Tabela | Índice | Objetivo |
|---|---|---|
| Índice | Tabela | Objetivo |
|---|---|---|
| `agendamento_colaborador_data_idx` | `agendamento` | carrega a agenda de um profissional por período |
| `agendamento_id_petshop_uniq` | `agendamento` | apoio às consultas do dia a dia |
| `agendamento_sem_conflito_profissional` | `agendamento` | RN01 — impede sobreposição de intervalos por profissional |
| `auditoria_data_idx` | `auditoria` | consulta cronológica do log de auditoria (RNF09) |
| `avaliacao_agendamento_id_key` | `avaliacao` | garante 1 avaliação por agendamento (1:0..1) |
| `cliente_cpf_key` | `cliente` | apoio às consultas do dia a dia |
| `cliente_id_petshop_uniq` | `cliente` | apoio às consultas do dia a dia |
| `colaborador_id_petshop_uniq` | `colaborador` | apoio às consultas do dia a dia |
| `disponibilidade_unica` | `disponibilidade_colaborador` | impede duas janelas para o mesmo dia (entidade fraca) |
| `fornecedor_cnpj_unico` | `fornecedor` | apoio às consultas do dia a dia |
| `movimentacao_produto_idx` | `movimentacao_estoque` | extrato de estoque por produto |
| `notificacao_usuario_idx` | `notificacao` | sino de notificações não lidas |
| `pacote_nome_unico` | `pacote_servico` | apoio às consultas do dia a dia |
| `pagamento_venda_idx` | `pagamento` | apoio às consultas do dia a dia |
| `pet_id_cliente_uniq` | `pet` | apoio às consultas do dia a dia |
| `pet_id_petshop_uniq` | `pet` | apoio às consultas do dia a dia |
| `petshop_cnpj_key` | `petshop` | apoio às consultas do dia a dia |
| `petshop_email_key` | `petshop` | apoio às consultas do dia a dia |
| `produto_id_petshop_uniq` | `produto` | apoio às consultas do dia a dia |
| `produto_nome_unico` | `produto` | apoio às consultas do dia a dia |
| `servico_nome_unico` | `servico` | apoio às consultas do dia a dia |
| `token_recuperacao_token_hash_key` | `token_recuperacao` | apoio às consultas do dia a dia |
| `usuario_email_key` | `usuario` | login — o e-mail identifica a conta em todo o sistema |
| `usuario_id_petshop_uniq` | `usuario` | apoio às consultas do dia a dia |
| `venda_cliente_idx` | `venda` | histórico de compras do tutor |
| `venda_data_idx` | `venda` | faturamento por período (RF14) |
| `venda_id_petshop_uniq` | `venda` | apoio às consultas do dia a dia |

As chaves primárias (`*_pkey`) foram omitidas desta lista: são criadas
automaticamente para toda PK e UNIQUE.
