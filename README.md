# 🐾 PetPlus — Sistema de Gestão para Petshop

Quarta entrega: **modelo de dados, banco de dados e integração com o
protótipo navegável**.

O que existe aqui é a fundação sobre a qual o backend robusto será
construído: um banco PostgreSQL normalizado que **impõe sozinho** as regras de
negócio, e uma interface que já conversa com ele.

## Estrutura

| Pasta | O que é |
|---|---|
| [`Banco_de_Dados/`](Banco_de_Dados/) | **MER, DDL comentado e dicionário de dados** |
| [`backend/`](backend/) | API mínima em Node/Express sobre o banco (JWT + bcrypt + RLS) |
| [`Prototipo_navegavel/`](Prototipo_navegavel/) | Interface React + TypeScript, ligada à API |
| `Diagramas/`, `Documentação/` | Especificação, requisitos e diagramas originais da equipe |

## Subir o projeto

Pré-requisitos: **Docker** e **Node.js 20+**.

```bash
# 1. Banco
docker run -d --name petplus-db -e POSTGRES_USER=petplus \
  -e POSTGRES_PASSWORD=petplus -e POSTGRES_DB=petplus \
  -p 5432:5432 postgres:17-alpine

cd backend && npm install && npm run reset     # schema + dados de demonstração
```

```bash
# 2. API
cd backend && npm start                                  # :3333

# 3. Interface
cd Prototipo_navegavel && npm install && npm run dev      # :5173
```

Entrar com `gestor@petplus.com`, `colab@petplus.com` ou
`cliente@petplus.com` — senha `123` para os três.

## Os entregáveis

### 1. Diagrama Entidade-Relacionamento

![MER](Banco_de_Dados/diagramas/mer.png)

- Editável: [`Banco_de_Dados/diagramas/mer.mmd`](Banco_de_Dados/diagramas/mer.mmd)
- Com decisões de modelagem e normalização: [`Banco_de_Dados/MER.md`](Banco_de_Dados/MER.md)

**26 tabelas em 3FN**, com multi-tenant (RNF13) por `petshop_id` +
Row-Level Security.

### 2. Esquema de tabela

- **DDL comentado**: [`Banco_de_Dados/sql/`](Banco_de_Dados/sql/) — 6 migrations + seed
- **Dicionário de dados**: [`Banco_de_Dados/dicionario-de-dados.md`](Banco_de_Dados/dicionario-de-dados.md)
  — 26 tabelas, 232 colunas, 84 FKs, 54 índices, gerado do banco real

### 3. Banco codificado e integrado

O banco garante sozinho o que os requisitos pedem:

| Requisito | Garantia no banco |
|---|---|
| RN01 | `EXCLUDE USING gist` sobre o intervalo — impede sobreposição de atendimentos |
| RN02 | Trigger de movimentação impede saldo negativo |
| RN04 | Cancelamento sai do conflito por cláusula `WHERE` |
| RN08 | Trigger confere dia e janela de disponibilidade |
| RN11 | Trigger exige perfil GESTOR e o prazo comercial do petshop |
| RN12 | Trigger recusa bloqueio sobre agendamento confirmado |
| RF25 | Constraint trigger `DEFERRABLE` roda no `COMMIT` |
| RNF02 | Senhas como hash bcrypt |
| RNF09 | Triggers de auditoria gravam antes/depois em JSONB |
| RNF13 | RLS por `app.petshop_id` + FKs compostas |

O frontend lê tudo por `GET /api/bootstrap` — que devolve **exatamente o
formato** do antigo `db` em memória, e por isso nenhuma das 26 telas foi
reescrita. Agenda, PDV e estoque gravam de verdade.

## Verificação

```bash
cd backend
npm run verificar    # recria o banco e roda as três suítes
```

| Suíte | Checagens | O que prova |
|---|---|---|
| `npm run test:db` | 32 | As regras sobrevivem à aplicação: o banco recusa a operação sozinho |
| `npm run smoke` | 30 | Rotas, JWT, perfis e tradução de erros ligados ponta a ponta |
| `npm run e2e` | 31 | A interface realmente usa a API, no Chrome de verdade |

Estado atual: **93 verificações, todas passando.**

## Escala

O backend é pequeno de propósito, mas não é ingênuo:

- **camadas separadas** (routes → services → repositories → banco): substituir
  qualquer uma não quebra as outras;
- **configuração por ambiente**, sem valor fixo em lugar nenhum;
- **migrations versionadas**, cada uma em sua transação;
- **consultas parametrizadas** em toda parte e **tradução centralizada** de
  erros do banco para HTTP;
- **RLS no banco**, então um bug na aplicação não vira vazamento entre
  petshops.

O caminho de evolução e o que já está pronto está em
[`backend/README.md`](backend/README.md).