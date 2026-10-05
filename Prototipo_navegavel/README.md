# 🐾 PetPlus — Protótipo Navegável (integrado ao banco)

Interface do sistema de gestão para petshops **PetPlus**. React 18 +
TypeScript + Vite, sem bibliotecas de UI.

> **Esta interface agora lê e escreve no PostgreSQL.** Os dados não vivem
> mais em memória: vêm de `GET /api/bootstrap` e as telas de escrita
> (agenda, PDV, estoque e vendas) gravam de verdade. As regras de negócio
> são impostas pelo banco, não pela tela.

## Subir tudo

Pré-requisitos: **Node 20+** e **Docker**.

```bash
# 1. Banco (PostgreSQL 17) + schema + dados de demonstração
docker run -d --name petplus-db -e POSTGRES_USER=petplus \
  -e POSTGRES_PASSWORD=petplus -e POSTGRES_DB=petplus \
  -p 5432:5432 postgres:17-alpine
cd backend && npm install && npm run reset

# 2. API
cd backend && npm start                    # http://localhost:3333

# 3. Esta interface
cd Prototipo_navegavel && npm install && npm run dev   # http://localhost:5173
```

Guia detalhado: [`../Banco_de_Dados/README.md`](../Banco_de_Dados/README.md)
e [`../backend/README.md`](../backend/README.md).

## 🔑 Acessos (senha `123`)

A senha é conferida contra o **hash bcrypt** no banco — não existe atalho no
front.

| Perfil | E-mail | O que vê |
|---|---|---|
| 👑 Gestor | `gestor@petplus.com` | Dashboard, agenda, clientes, colaboradores, estoque, fornecedores, PDV, vendas, relatórios, pacotes, avaliações, configurações |
| ✂️ Colaborador | `colab@petplus.com` | Minha agenda, atendimentos, histórico do pet, clientes & pets, estoque, bloqueios |
| 🐶 Cliente | `cliente@petplus.com` | Início, agendar online, meus agendamentos, meus pets, histórico de saúde, fidelidade, perfil |

Há botões de **acesso rápido** na própria tela de login.

## Como o dado chega aqui

```
src/api.ts    único ponto de contato com a rede — fetch, token, erros
src/data.ts   busca o snapshot e preenche `db`
src/App.tsx   espera a carga antes de renderizar as telas internas
```

`db` é o **mesmo objeto** que o protótipo original usava, com as mesmas
chaves. Por isso nenhuma das 26 telas precisou ser reescrita: a forma não
mudou, só a origem. As colunas saem do SQL já em `camelCase`, no contrato de
`src/types.ts`.

### Telas com escrita real no banco

| Tela | O que grava |
|---|---|
| **Agenda** (gestor) | Criar, remarcar e cancelar — o banco valida conflito (RN01) e disponibilidade (RN08) |
| **PDV** (gestor) | Registrar venda — baixa o estoque (RF08) e aceita pagamento combinado (RF25) |
| **Estoque** (gestor) | Cadastrar, editar, dar entrada e inativar produto |
| **Vendas** (gestor) | Estornar — devolve o estoque pela trilha (RF26/RN11) |
| **Cadastro de cliente** | Cria tutor com consentimento LGPD gravado (RNF11) |

Depois de gravar, a tela chama `sincronizar()` e relê o snapshot. É por isso
que uma venda no PDV aparece imediatamente na tela de Estoque com o saldo
novo: o dado deixou de viver na memória da tela.

As demais telas seguem em modo leitura, como no protótipo.

## Regras de negócio — onde cada uma é garantida

| Regra | Onde é garantida |
|---|---|
| RN01 — sem conflito de horário | **Banco**: `EXCLUDE` sobre o intervalo do profissional |
| RN02 — venda só com estoque | **Banco**: trigger da movimentação de estoque |
| RN04 — cancelar libera o horário | **Banco**: a cláusula `WHERE` do `EXCLUDE` |
| RN08 — só dentro da disponibilidade | **Banco**: trigger de disponibilidade |
| RN09/RN05 — alerta de validade e de mínimo | **Banco**: views `vw_alerta_validade` e `vw_alerta_estoque_minimo` |
| RN11 — estorno só por gestor e no prazo | **Banco**: trigger de estorno + rota restrita |
| RN12 — bloqueio não cobre agendamento | **Banco**: trigger de bloqueio |
| RN03/RN10 — acesso por perfil | **Front**: guarda de rota + `exigirPerfil` na API |
| RF25 — pagamento combinado | **Banco**: constraint trigger no `COMMIT` |

A checagem de conflito na tela é só ergonomia — a decisão é sempre do banco.

## Variáveis de ambiente

| Variável | Padrão |
|---|---|
| `VITE_API_URL` | `http://localhost:3333/api` |

## Verificação

```bash
cd backend
npm run test:db   # 32 checagens no banco
npm run smoke     # 30 checagens na API por HTTP
npm run e2e       # 31 checagens neste app, no Chrome de verdade
npm run verificar # recria o banco e roda as três
```

`npm run e2e` é a que prova que este front realmente usa a API: ele faz
login, cria um agendamento, vende no PDV, dá entrada de estoque e depois
confere os saldos pela API.

## Mapa de telas (26 telas)

**Públicas (6):** Landing · Login · Recuperar senha · Redefinir senha · Cadastro de cliente (2 etapas) · 404

**Gestor (12):** Dashboard (RF14/15) · Agenda semanal (UC05–07) · Clientes & Pets (UC03/04) · Colaboradores (UC17) · Estoque (UC08/10/21) · Fornecedores (UC26) · PDV (UC11/RF25) · Histórico de Vendas + estorno (UC12) · Relatórios (UC22) · Pacotes (UC24) · Avaliações (UC23) · Configurações (LGPD/backup/multi-tenant)

**Colaborador (6):** Minha Agenda (UC18) · Atendimentos de hoje · Histórico do Pet (UC13) · Clientes & Pets · Estoque · Bloqueios de Agenda (UC25)

**Cliente (7):** Início · Agendar Online (UC19, 3 passos) · Meus Agendamentos (UC07/UC23) · Meus Pets · Histórico de Saúde (UC20) · Fidelidade (RF20) · Meu Perfil

Mais: comprovante de venda, modais de detalhe/edição, alertas de
estoque/validade, **acesso negado** (troca de perfil) e **404**.

## Limitações conhecidas

- **Gráfico de faturamento dos últimos 7 dias** segue com dados fixos do
  protótipo — é ilustrativo e está marcado como tal no código. Os cartões do
  topo do painel já são calculados a partir das vendas do banco.
- **Datas são de setembro/2026** em todo o protótipo (mesma constante `HOJE`),
  não a data real do sistema.
- **Notificações e relatórios** são registrados no banco, mas ainda não são
  enviados/gerados — os pontos de entrada estão listados em
  [`../backend/README.md`](../backend/README.md).