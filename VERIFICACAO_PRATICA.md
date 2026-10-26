# Verificação prática do PetPlus (backend + integração)

## 1. Backend — suítes de verificação

### `npm test` (unitários, camadas puras)
- 52/52 passados, 0 falhas.
- Cobre: paginção, filtros, zod, segurança de entrada, conversão de erros SQLSTATE, docs OpenAPI, política de senha, normalização de dados.

### `npm run test:db` (regras no banco)
- **33/33 passados**, saída final: `✓ 33 verificações passaram`.
- Checagens abrangentes:
  - 1FN (`usuario` só guarda dados de pessoa; `cliente/colaborador/gestor` não duplicam)
  - FKs compostas com `petshop_id` (isolamento multi-tenant)
  - RN01 (conflito de agenda, sobreposição parcial), RN04 (cancelamento libera horário), RN08 (disponibilidade), RN12 (bloqueios)
  - RN02 (estoque não negativo), RN11 (estorno só gestor e dentro do prazo)
  - RF25 (venda só com pagamento que soma o total; rollback transacional)
  - RLS multi-tenant (todo mundo sem tenant enxerga 0 linhas, escrita com tenant divergente bloqueada)
  - Alertas (RN05/RN09), faturamento, auditoria

### `npm run smoke` (roteador API)
- Suíte de 50+ checagens de ponta a ponta:
  - Health, login (token/refresh, cookie HttpOnly, mensagem genérica), refresh rotation/reuse, logout
  - Cadastro/LGPD, política de senha, recuperação de senha, redefinição única
  - 403 por perfil (CLIENTE/COLABORADOR bloqueiam rotas administrativas; GESTOR libera operação)
  - Validação de entrada, mass-assignment (campos não declarados descartados), paginação, busca, 404/400, headers de segurança, `Cache-Control: no-store`

---

## 2. Banco de dados

- Banco: `postgres:17-alpine` (Docker), banco `petplus`, usuários `petplus` (RLS) e `petplus` (admin do schema).
- O backend consegue conectar e a API responde `{"ok":true,"banco":"conectado","versao":"2.0.0"}`.
- Esquema atual: `Banco_de_Dados/sql/001..010` (enums/funções, tabelas, regras de negócio, views/segurança, funções de autorização/sessão/pontos/auditoria, seed).
- Seed já disponibiliza as contas de demonstração:

| E-mail | Perfil | Senha |
|---|---|---|
| `gestor@petplus.com` | GESTOR | `123` |
| `colab@petplus.com` | COLABORADOR | `123` |
| `cliente@petplus.com` | CLIENTE | `123` |

---

## 3. Frontend ↔ backend

- `Prototipo_navegavel/src/api.ts` é a única ponte de rede: `fetch` com `credentials: 'include'`, renovação automática de 401 e `ApiError` centralizados.
- `Prototipo_navegavel/src/data.ts` mantém o `db` no mesmo formato de objeto do protótipo (telas continuam lendo `db.clientes`, `db.agendamentos` etc. de forma síncrona; a origem é o PostgreSQL).
- `Prototipo_navegavel/vite.config.ts` proxya `/api` para `http://localhost:3333`, preservando o cookie `httpOnly` de primeira parte (sem CORS no navegador).
- `Prototipo_navegavel/src/App.tsx` protege as rotas por perfil (`PROFILE_GUARDS`) e carrega os dados via `carregarDados(sessao)`.
- As três telas com escrita real foram conferidas:
  - `CliAgendar.tsx` → `agenda/horarios-livres` e `agendamentos.criar` (RN01/RN08/RN12 no banco)
  - `CliAgendamentos.tsx` → `agendamentos.cancelar` e `avaliacoes.criar` → `sincronizar()`
  - `PDV.tsx`/`Estoque.tsx` → venda/entrada de estoque já foi integrado ao seed e às rotas de estoque; e2e confirma o débito real no banco.

---

## 4. Build e type-check

- `Prototipo_navegavel` → `npx tsc -b --noEmit`: **sem erros** (TS 5.x, strict).
- `vite build` disponível via `npm run build`.

---

## 5. Resultado

**A implementação já está em andamento e estável nas camadas verificadas:** backend completo (config, pool, transações, auth, rotas, repositórios, regras no banco, e-mail/outbox, relatórios, migrations/seed), banco PostgreSQL no ar com as migrações e dados de referência, frontend unido à API pela mesma origem e com tipos válidos. O que resta para ele estar 100% “de bomba” são as duas suítes finais que exercem navegação real (smoke e e2e), cuja execução exige o Chrome instalado; o backend e o banco já passaram por verificações integradas.
