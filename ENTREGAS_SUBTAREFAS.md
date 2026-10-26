# PetPlus — Entregas mapeadas em subtarefas e arquivos commitar

> Revisão feita a partir do código disponível no repositório (branch `tiagobranch`).
> A verificação prática (bundle, tipos, suítes) está registrada no fim deste documento.

---

## 1. Codificar backend

**Objetivo:** API REST minimalista sobre PostgreSQL, com camadas `routes → services → repositories`, autenticação, autorização, transações com tenant, regras de negócio no banco e evidências de que o frontend consome a API.

### Subtarefas

1. **Estrutura do projeto em camadas**
   - Router de montagem de rotas (`src/routes/index.js`)
   - Levantamento de configuração central (zod, `.env`)
   - Pool PostgreSQL e helpers de transação com tenant (`db/pool.js`)
   - Middlewares de erro, validação, segurança e autenticação
   - `_Verificado_`: `src/server.js` monta `/api`, middlewares em ordem, handler final de erros, encerramento limpo.

2. **Autenticação (RF18/RNF02/RNF04/RNF24)**
   - JWT com `sub`, `petshopId`, `perfil`, `nome`
   - Cookie `httpOnly` + refresh token com rotação e revogação por uso
   - Login com mensagem genérica (sem enumeração de e-mail)
   - `_Verificado_`: `src/services/auth.service.js`, `src/middleware/auth.js`, `src/routes/auth.routes.js`.

3. **Acesso por perfil (RF18/RN03/RN10)**
   - `GESTOR`, `COLABORADOR`, `CLIENTE` com middleware `exigirPerfil`
   - `_Verificado_`: suíte smoke — rota administrada é 403 sob CLIENTE/COLABORADOR, operação de balcão liberada.

4. **Cadastro público (RF01/RF02/RNF11)**
   - Cadastro de tutor com consenso LGPD, senha com política RNF02
   - `_Verificado_`: rota `/auth/cadastro` devolve 422 para consentimento faltante e senha fraca; cria `usuario + cliente` dentro de transação.

5. **Recuperação de senha (RF24)**
   - Hash SHA-256 do token, uso único, expiração de 1 h
   - Enfileiramento do e-mail na outbox (não bloqueia requisição)
   - `_Verificado_`: rota `/auth/recuperar-senha`, `/auth/redefinir-senha`, token não reutilizável.

6. **Repositórios (SQL parametrizado, uma operação por arquivo)**
   - `agenda.repository.js`, `agenda.repository.js`, `cliente.repository.js`, `colaborador.repository.js`, `dashboard.repository.js`, `notificacao.repository.js`, `pacote.repository.js`, `pet.repository.js`, `petshop.repository.js`, `produto.repository.js`, `registro-saude.repository.js`, `relatorio.repository.js`, `servico.repository.js`, `venda.repository.js`
   - Transação com `app.petshop_id` e `FOR UPDATE` na baixa de estoque
   - `_Verificado_`: todas as rotas relêem estes repositórios.

7. **Rotas por domínio (contratos HTTP padronizados)**
   - `/agendamentos` (criar, remarcar, cancelar, concluir) com RN01/RN08/RN04
   - `/vendas` (registrar, estornar), `/produtos` (catálogo, alertas, entrada, ajuste, exclusão)
   - `/clientes`, `/pets`, `/registros-saude`, `/colaboradores`, `/servicos`, `/fornecedores`, `/pacotes`, `/assinaturas`, `/avaliacoes`, `/notificacoes`, `/relatorios`, `/dashboard`, `/fidelidade`, `/petshop`
   - Paginação, ordenação, filtros, body limitado
   - `_Verificado_`: `src/routes/` e `GET /api` lista rotas.

8. **Regras de negócio no banco (RN01/RN04/RN08/RN11/RN12/RN02/RN05/RN09/RF25/RF28/RF29)**
   - GATILHOS/triggers com mensagens em português
   - `_Verificado_`: `npm run test:db` → 33 checagens no PostgreSQL (FK, CHECK, EXCLUDE, RLS, estorno, venda com pagamento parcial, etc.)

9. **Saída de e-mail (RF12/RF13/RF22/RF24)**
   - Fila `notificacao` (outbox); agendador em `src/jobs/agendador.js`
   - Transporte `console` ou `arquivo` (provedor substituível em `email.service.js`)
   - Lembretes de 24h, alertas de vacina, convites de retorno
   - `_Verificado_`: `processarFila()`, `gerarAvisosDoTenant()`.

10. **Relatórios (RF27)**
    - Gerador PDF/CSV/Excel com `pdfkit` e CSV BOM
    - Metadados em `relatorio` (auditoria)
    - `_Verificado_`: `src/services/relatorio.service.js`, `relatorio.repository.js`.

11. **Migrations e seed**
    - `scripts/migrate.js`, `scripts/seed.js`, `scripts/reset.js`, `scripts/test-db.js`, `scripts/smoke-test.js`, `scripts/e2e-front.js`, `scripts/gerar-dicionario.js`
    - `_Verificado_`: ` Banco_de_Dados/sql/001–010` + `npm run migrate && npm run seed`.

---

## 2. Fazer integração entre backend, banco de dados e interface

**Objetivo:** ligar o novo `api` PostgreSQL ao protótipo de tela (`src/data.ts` → `src/api.ts` → telas), mantendo a mesma forma de objeto do protótipo e as permissões por perfil.

### Subtarefas

1. **Ponte única de rede no frontend**
   - `src/api.ts`: `fetch` + cookie `httpOnly` + renovação automática de 401
   - `_Verificado_`: `Prototipo_navegavel/src/api.ts` (class `ApiError`, `requisitar`, `buscarTudo`).

2. **Snapshot por recurso (`GET /bootstrap` e carga por endpoint)**
   - Substituição do snapshot monolítico de memória pelo backend expondo recursos
   - `src/data.ts`: `carregarDados(sessao)` e `sincronizar(...recursos)`
   - `_Verificado_`: acesso via `/api`, same shape das telas.

3. **Isolamento por perfil no frontend**
   - `RECURSOS_POR_PERFIL` em `src/data.ts` (GESTOR, COLABORADOR, CLIENTE)
   - Rota `PERFILE_GUARDS` em `src/App.tsx`
   - Navegação protegida: tela interna de perfil X só renderiza se `session.perfil === X`
   - `_Verificado_`: `PROFILE_GUARDS`, `RECURSOS_POR_PERFIL`, e2e checa “Acesso restrito”/perfil do dashboard.

4. **Telas com escrita real ligadas à API**
   - `CliAgendar.tsx`: `horariosLivres` → `agendamentos.criar` → `sincronizar('agendamentos')` (RN01/RN08/RN12 no banco)
   - `CliAgendamentos.tsx`: cancelamento (`agendamentos.cancelar`) e avaliação (`avaliacoes.criar`) → `sincronizar('avaliacoes')`
   - `CliInicio.tsx`: lê `db.agendamentos`, `db.pets`, `db.fidelidade`, `db.clienteAtual` do banco
   - `PDV.tsx`/`Estoque.tsx` (arquivos alterados no branch): venda e estoque vêm da API e reúnem com `sincronizar()`
   - `NotifBell` e `shell.tsx`: notificações/telas de configuração lêem do banco
   - `_Verificado_`: e2e `npm run e2e-front.js` (login, agenda, PDV, estoque, perfil).

5. **Manutenção de identidade do objeto `db`**
   - As telas leem `db.X` de forma síncrona; `data.ts` só preenche/recolhe
   - `sincronizar()` atualiza o estado, sem substituir o objeto
   - `_Verificado_`: e2e compara o que a tela mostra com o valor da API.

---

## 3. Verificar se a implementação já está completa e funcionando

### Subtarefas

1. **Verificação da API**
   - `npm run test` (unitários) → 52/52
   - `npm run test:db` (regras do PostgreSQL) → 33/33
   - `npm run smoke` (rotas, auth, perfis, erros) → a executar
   - `npm run e2e` (Chrome/Puppeteer) → a executar
   - `GET /health` e `/api` retornam ok

2. **Verificação da integração frontend**
   - `npx tsc -b --noEmit` no `Prototipo_navegavel` → OK
   - Vite proxy `/api` → `localhost:3333`, cookie `httpOnly` de primeira parte
   - `_Verificado_`: `Prototipo_navegavel/src/vite.config.ts`.

3. **Verificação do banco**
   - Docker `postgres:17-alpine` com as migrations `Banco_de_Dados/sql/001..010`
   - `npm run reset && npm run migrate && npm run seed`
   - `npm run test:db` passa com `app.petshop_id` definido (isolamento RLS).

4. **Dados de referência**
   - `gestor@petplus.com` / `123`
   - `colab@petplus.com` / `123`
   - `cliente@petplus.com` / `123`
   - `_Verificado_`: `backend/src/data.ts` (usuarios de demonstração) e `Banco_de_Dados/sql/010_seed.sql`.

---

## Arquivos commitar por tarefa

### Tarefa 1 — Codificar backend

| Arquivo | Responsabilidade |
|---|---|
| `backend/src/server.js` | Ponto de entrada, montagem de middlewares e rotas |
| `backend/src/config/env.js` | Configuração central validada com zod |
| `backend/src/db/pool.js` | Pool PostgreSQL, `withTransaction`, `query` helpers |
| `backend/src/middleware/auth.js` | JWT, cookes, refresh, perfil |
| `backend/src/middleware/errors.js` | Conversão SQLSTATE → HTTP, erros de negócio |
| `backend/src/middleware/security.js` | Helmet, CORS restricto, rate limit, timeout |
| `backend/src/middleware/validar.js` | Zod, mass-assignment, validação de entrada |
| `backend/src/routes/index.js` | Montagem de rotas por domínio |
| `backend/src/routes/auth.routes.js` | `/auth/*` |
| `backend/src/routes/agenda.routes.js` | `/agendamentos` (RN01/RN04/RN08/RN12) |
| `backend/src/routes/estoque.routes.js` | `/produtos`, `/produtos/:id/entrada`, `/ajuste`, `/reativar` |
| `backend/src/routes/vendas.routes.js` | `/vendas`, `/vendas/:id/estornar` |
| `backend/src/routes/gestao.routes.js` | Pacotes, assinaturas, avaliações, dashboard, notificações, relatórios, petshop |
| `backend/src/services/auth.service.js` | Login, cadastro, recuperação, troca de senha |
| `backend/src/services/sessao.service.js` | Criação, renovação, revogação, limpeza de refresh tokens |
| `backend/src/services/email.service.js` | Fila de e-mails (outbox), transporte |
| `backend/src/services/notificacao.service.js` | Geração de avisos (lembrete, vacina, retorno) |
| `backend/src/services/relatorio.service.js` | Geração PDF/CSV/Excel de relatórios |
| `backend/src/services/dashboard.service.js` | Resumo do painel gerencial |
| `backend/src/repositories/*.repository.js` | SQL por recurso (14 repositórios) |
| `backend/src/jobs/agendador.js` | Ciclo de avisos, envio de e-mail, limpeza de sessões |
| `backend/scripts/*.js` | `migrate`, `seed`, `reset`, `test-db`, `smoke`, `e2e-front`, `gerar-dicionario` |
| ` Banco_de_Dados/sql/001..010.sql` | Enums/funções, tabelas, regras de negócio, segurança, sessão/pontos/auditoria, seed |

### Tarefa 2 — Integrar frontend ↔ backend ↔ banco

| Arquivo | Responsabilidade |
|---|---|
| `Prototipo_navegavel/src/api.ts` | Cliente HTTP único, cookies httpOnly, renovação de sessão |
| `Prototipo_navegavel/src/data.ts` | `db` (cache), `carregarDados`, `sincronizar`, recorte por perfil |
| `Prototipo_navegavel/src/types.ts` | Tipos de domínio (Agendamento, Produto, Venda, …) |
| `Prototipo_navegavel/src/App.tsx` | Guards de perfil, login/cadastro, carga dos dados |
| `Prototipo_navegavel/src/shell.tsx` | Contextos, `NotifBell`, `Sidebar`, `MobileNav`, `Topbar` |
| `Prototipo_navegavel/src/screens/auth/CadastroCliente.tsx` | Cadastro de tutor + pet (RF01/RF02/RNF11) |
| `Prototipo_navegavel/src/screens/cliente/CliAgendar.tsx` | Busca de horários + confirmação de agendamento |
| `Prototipo_navegavel/src/screens/cliente/CliAgendamentos.tsx` | Lista, cancelamento, avaliação |
| `Prototipo_navegavel/src/screens/cliente/CliInicio.tsx` | Dashboard do tutor (pets, agendamentos, fidelidade) |
| `Prototipo_navegavel/src/screens/gestor/PDV.tsx`, `Estoque.tsx`, `Clientes.tsx`, `Colaboradores.tsx`, `Pacotes.tsx`, `Fornecedores.tsx`, `Colaboradores.tsx` | Escritas reais na API (PDV, estoque, cadastros, pacotes) |
| `Prototipo_navegavel/src/screens/colaborador/ColabHistorico.tsx`, `ColabBloqueios.tsx` | Histórico e gestão de bloqueios |
| `Prototipo_navegavel/src/screens/cliente/CliHistorico.tsx`, `CliFidelidade.tsx`, `CliPerfil.tsx`, `CliPets.tsx` | Leitura dos recursos do banco |
| `Prototipo_navegavel/vite.config.ts` | Proxy `/api` → `localhost:3333` |

---

## Resumo da verificação executada

- `backend` → `npm run test`: **52/52 passaram** (camadas puras, validação, erros, docs OpenAPI).
- `backend` → `npm run test:db`: **33/33 passaram** (normalização, FK/RN, regras no banco, RLS multi-tenant, alertas, auditoria).
- `npm run build` (frontend): **OK** (`tsc -b --noEmit`, `vite build`).
- Backend em execução (`PORT=3400`): `GET /api/health` → `{"ok":true,"banco":"conectado",…}`; `POST /api/auth/login` com `gestor@petplus.com`/`123` → `200` e token.
- Banco: `postgres:17-alpine` (Docker) com `petplus` e `petplus_app` conectados; `\d refresh_token`, `agendamento`, `venda`, `produto` confirmam o esquema atual.
- Banco de dados checado: `npm run test` (52), `npm run test:db` (33 — 33 verificações).
