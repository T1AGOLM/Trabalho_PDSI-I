# 🐾 PetPlus — Banco de Dados

Banco **PostgreSQL 17** normalizado (3FN), multi-tenant, construído a partir
do Diagrama de Classes e dos Requisitos RF01–RF30 / RN01–RN12.

## O que tem aqui

| Arquivo | Conteúdo |
|---|---|
| [`MER.md`](MER.md) | Modelo Entidade-Relacionamento, decisões de modelagem e normalização |
| [`diagramas/mer.mmd`](diagramas/mer.mmd) | Diagrama em sintaxe Mermaid (editável) |
| [`diagramas/mer.png`](diagramas/mer.png) | Diagrama renderizado |
| [`dicionario-de-dados.md`](dicionario-de-dados.md) | Todas as 26 tabelas, 232 colunas, constraints, gatilhos e índices — **gerado do banco real** |
| [`sql/`](sql/) | DDL comentado, em ordem de aplicação |

## Como subir (do zero)

Pré-requisitos: **Docker** e **Node.js 20+**.

```bash
# 1. Banco (PostgreSQL 17)
docker run -d --name petplus-db \
  -e POSTGRES_USER=petplus \
  -e POSTGRES_PASSWORD=petplus \
  -e POSTGRES_DB=petplus \
  -p 5432:5432 \
  postgres:17-alpine

# 2. Schema + dados de demonstração
cd backend
npm install
npm run reset     # derruba o schema, aplica as migrations e popula o seed
```

Pronto. O banco sobe em `localhost:5432`, usuário e senha `petplus`.

| Papel | Usuário | Senha | Usa para |
|---|---|---|---|
| Dono do schema | `petplus` | `petplus` | migrations e seed |
| Aplicação | `petplus_app` | `petplus_app` | a API (é o papel com RLS ativa) |

> **Por que dois usuários?** `petplus_app` **não é dono** das tabelas, e é
> justamente por isso que as políticas de Row-Level Security se aplicam a
> ele. O dono sempre ignoraria RLS — usar o mesmo usuário para tudo
> desligaria o isolamento multi-tenant sem ninguém perceber.

### Comandos do dia a dia

```bash
npm run migrate     # aplica só as migrations novas (registra em schema_migrations)
npm run seed        # recarrega os dados de demonstração
npm run reset       # recria tudo do zero
npm run dicionario  # regera o dicionário de dados a partir do schema
npm run test:db     # 32 verificações de integridade e regras de negócio
```

## Rodar a aplicação

```bash
# terminal 1 — API
cd backend && npm start          # http://localhost:3333

# terminal 2 — interface
cd Prototipo_navegavel && npm install && npm run dev   # http://localhost:5173
```

Acessos (senha `123` para todos):

| Perfil | E-mail | Senha |
|---|---|---|
| 👑 Gestor | `gestor@petplus.com` | `123` |
| ✂️ Colaborador | `colab@petplus.com` | `123` |
| 🐶 Cliente | `cliente@petplus.com` | `123` |

## Estrutura do DDL

| Arquivo | O que faz |
|---|---|
| `001_enums_e_funcoes.sql` | Extensões, 13 `ENUM`s do diagrama de classes e funções de fuso horário |
| `002_tabelas.sql` | Tabelas de tenant, usuários (herança), pets, agenda e pacotes |
| `003_tabelas_estoque_vendas.sql` | Estoque, PDV, auditoria e notificações |
| `004_regras_de_negocio.sql` | Constraints e gatilhos que **impõem** as regras de negócio |
| `005_views_e_seguranca.sql` | Views de alerta/indicador e Row-Level Security |
| `006_funcoes_de_autorizacao.sql` | Escape hatches `SECURITY DEFINER` do login |
| `010_seed.sql` | Dados de demonstração |

Cada migration roda dentro da sua própria transação: ou entra inteira, ou
não entra nada — e o que já rodou é registrado em `schema_migrations`.

## O banco como guardião das regras

O ponto central deste banco é que **as regras são impostas pelo banco**, e
não apenas pela aplicação. Três exemplos:

```sql
-- RN01: dois atendimentos do mesmo profissional não podem se sobrepor.
-- Não é trigger — é constraint. Vale mesmo que a aplicação desative
-- todos os gatilhos e escreva direto via psql.
EXCLUDE USING gist (
  petshop_id     WITH =,
  colaborador_id WITH =,
  tstzrange(data_hora, data_hora_fim, '[)') WITH &&
) WHERE (status <> 'cancelado')
```

```sql
-- RN11: só gestor, e só dentro do prazo comercial do próprio petshop.
-- O perfil vem do usuário autenticado da sessão.
SELECT u.perfil INTO v_perfil FROM usuario u WHERE u.id = NEW.estornado_por;
IF v_perfil IS DISTINCT FROM 'GESTOR' THEN
  RAISE EXCEPTION 'Somente gestores podem estornar vendas (RN11)';
END IF;
```

```sql
-- RNF13: a aplicação declara o tenant no início da transação e, a partir
-- daí, o banco só devolve as linhas daquele petshop.
CREATE POLICY tenant_isolamento_select ON pet
  FOR SELECT USING (petshop_id = current_setting('app.petshop_id', true)::bigint);
```

Ver como isso se comporta na prática está em [`../backend/README.md`](../backend/README.md).

## Inspeção rápida

```bash
# Tabelas
docker exec -it petplus-db psql -U petplus -d petplus -c "\dt"

# Estrutura de uma tabela
docker exec -it petplus-db psql -U petplus -d petplus -c "\d agendamento"

# Alertas que a interface exibe (RF09 / RF23)
docker exec -it petplus-db psql -U petplus -d petplus \
  -c "SELECT nome, quantidade_estoque, estoque_minimo FROM vw_alerta_estoque_minimo;"

# Histórico de estoque de um produto (RF08 / RNF09)
docker exec -it petplus-db psql -U petplus -d petplus \
  -c "SELECT tipo, quantidade, data_hora FROM movimentacao_estoque WHERE produto_id = 1 ORDER BY data_hora;"

# Faturamento do dia, da semana e do mês (RF14)
docker exec -it petplus-db psql -U petplus -d petplus \
  -c "SELECT * FROM vw_faturamento ORDER BY dia DESC LIMIT 7;"
```

## Observação sobre o fuso horário

`data_hora` é `TIMESTAMPTZ` (instante absoluto) — armazena o momento real,
independente de onde o servidor roda. A conversão para a hora local do
petshop acontece na leitura, via `petplus_data_hora_local(data_hora, ps.timezone)`.
O mesmo vale para o caminho inverso, `petplus_para_ts('2026-09-12T09:00')`.

Isso importa porque o frontend exibe `'2026-09-12T09:00'` sem fuso: se o
servidor mudasse de `TimeZone`, a hora exibida Saltaria. Com a conversão
explícita, ela não muda.