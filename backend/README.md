# 🐾 PetPlus — Backend

API mínima sobre o banco normalizado do PetPlus. Existe para **servir o
banco** e deixar provado que o frontend conversa com ele — não para ser o
backend final.

## Arquitetura em camadas

### Recuperação de senha — segurança (Etapa 1)

- `APP_URL` define a URL pública do frontend usada no link, independente de CORS.
- `EXPOR_TOKEN_RECUPERACAO=false` é o padrão. Somente com `true` em ambiente
  local/teste a resposta inclui token/link; produção ignora a flag.
- A fila de notificações guarda apenas um aviso sem credencial. Logs redigem
  `texto`/`mensagem`, e o transporte em arquivo mascara links de recuperação,
  inclusive de mensagens antigas. Nenhuma migração existente foi alterada.
- Limitação atual: os transportes `console` e `arquivo` não entregam um link
  utilizável ao usuário. A entrega real depende do provedor de e-mail da
  próxima etapa; não se deve anunciar este transporte local como entrega real.
- Teste direcionado: `node --test tests/unit/recuperacao-seguranca.test.js`.
  Usa o logger e os transportes reais, mas substitui o banco por um dublê;
  não substitui o teste de integração com PostgreSQL.

### Decisões de sessão — Etapa 1

O JWT contém `sid`, identificador do registro já existente em `refresh_token`.
Cada requisição confere se esse registro está ativo, sem criar outra tabela.
Revogar o registro invalida o access token na próxima requisição autenticada.

- Logout aceita refresh ou access token assinado e limpa cookies mesmo se o banco falhar.
- Troca e redefinição de senha encerram **todas** as sessões, inclusive a atual,
  na mesma transação da alteração. É necessário entrar novamente.
- Renovação consome o refresh antigo com UPDATE condicional. Reuso revoga todas
  as sessões do usuário. A redefinição também consome seu token atomicamente.
- JWTs emitidos antes desta mudança, sem `sid`, exigem novo login (ou renovação).
- Consentimento público aceita somente o booleano `true`; demais valores retornam
  HTTP 422 com `LGPD_CONSENTIMENTO`.
- O `sid` usa o esquema de sessões já previsto na versão atual. Bancos com o
  histórico legado `007_backend_operacional.sql` + `008_modulos_complementares.sql`
  precisam da nova `009_compatibilidade_backend_atual.sql`. O runner reconhece
  esse histórico e não tenta reaplicar a outra 007 por cima dele.

### Compatibilidade com o banco legado

A migração 009 adiciona sessões e campos da fila, preserva os registros anteriores
e importa o extrato de fidelidade sem recalcular os saldos dos clientes.
A tabela antiga de fidelidade permanece preservada; seus gatilhos produtores
são desabilitados porque o backend atual já registra os créditos. Isso evita
concessão em duplicidade. A migração é transacional e pode ser repetida sem
duplicar a importação. Faça backup antes de atualizar outro ambiente legado.

A tela Recuperar senha agora solicita o token à API. Ela nunca anuncia um e-mail
como entregue pelo transporte local. O botão de continuação só aparece quando
a API devolve um token de demonstração; a validade continua sendo 60 minutos.

Para testar essa continuação localmente no PowerShell, antes de iniciar a API:

```powershell
$env:EXPOR_TOKEN_RECUPERACAO="true"
npm start
```

Sem a flag, a solicitação é registrada, mas o token não aparece na interface.
Em produção, a flag é ignorada. O provedor real de e-mail continua pendente.

### Agendas — período e profissional

A Agenda do gestor e Minha Agenda consultam a semana escolhida na API. Use
“Data da agenda”, “Semana anterior”, “Próxima semana” e “Atualizar agenda”.
A agenda pessoal usa o ID da sessão; o gestor visualiza todos os profissionais.
A grade do gestor também mostra reservas de meia hora, como 09:30.
Concluir/cancelar em Minha Agenda agora chama a API e persiste no banco.

O teste `tests/integration/agendas-navegador.test.js` cria um profissional
BANHISTA exclusivo na cópia de testes e uma reserva pela interface do cliente;
confere o mesmo ID no gestor e no responsável e testa conclusão/cancelamento.
Os registros de teste permanecem nessa cópia para inspeção. Ele exige:

- API e frontend já rodando e apontando para um banco exclusivo de testes;
- API em `NODE_ENV=test` (o teste confere `/health`);
- `DB_NAME` contendo `test` e `PETPLUS_BANCO_TESTE=1` no terminal do teste;
- `FRONT_URL`, `API_URL` e `CHROME_PATH` correspondentes ao ambiente isolado.

Execute: `node --test tests/integration/agendas-navegador.test.js`.
As variáveis do terminal do teste não reconfiguram uma API que já está rodando.
Não use este teste contra o banco da equipe. Sem opt-in, ele é ignorado.
### Validação da Etapa 1

Em `backend`: `npm test`. Para a suíte real, configure primeiro um **banco exclusivo
de testes**, com schema e seed existentes. Seu `DB_NAME` deve conter `test`;
defina `NODE_ENV=test` e `PETPLUS_BANCO_TESTE=1`, e execute:

```text
node --test tests/integration/seguranca-sessoes.test.js
```

A suíte real cria contas de teste identificadas por UUID e altera apenas essas
contas. Os registros permanecem no banco de teste para inspeção. Ela não reseta
o banco automaticamente. Sem opt-in, a suíte é explicitamente não executada.
`npm run verificar` é diferente: **recria o banco** e só deve usar ambiente descartável.

No frontend, `node --test tests/sessao.test.mjs` verifica os módulos reais com rede
simulada; após o build, `node --test tests/sessao.e2e.mjs` exercita o navegador com
API simulada. Esse E2E não substitui o E2E integrado existente do backend.
Os Puppeteer dos lockfiles exigem Node 22.12+; use essa versão para validá-los.

O frontend limpa sessão/cache imediatamente ao sair, cancela requisições antigas
e descarta suas respostas. Sem rede, a limpeza local continua funcionando,
mas a revogação no servidor não pode ser garantida. Um login novo aguarda o
logout pendente para evitar que uma resposta antiga limpe cookies novos.

```
src/
├── config/env.js           configuração central (tudo por variável de ambiente)
├── db/pool.js              pool de conexões + helper de transação com tenant
├── middleware/
│   ├── auth.js             JWT, perfis e injeção do tenant na sessão
│   └── errors.js           traduz códigos do PostgreSQL em respostas HTTP
├── repositories/           SQL puro, uma função por operação
├── services/               regras que combinam mais de um repositório
└── routes/index.js         HTTP: valida entrada, chama serviço, devolve
```

A separação importa porque é ela que permite **substituir qualquer camada
sem quebrar as outras**. Hoje a regra de conflito de agenda mora no banco;
quando o backend robusto precisar de uma mensagem de erro mais rica ou de
uma regra que dependa de dado externo, ela entra em `services/` — sem
mover uma linha de SQL.

### Onde cada coisa mora

| Camada | Responsabilidade | Prova |
|---|---|---|
| **Banco** | Integridade, regras estruturais (RN01, RN02, RN08, RN11, RN12), isolamento por tenant | `npm run test:db` |
| **Repository** | SQL parametrizado, transação com `app.petshop_id` | `npm run smoke` |
| **Service** | Regras que cruzam repositórios (hash de senha, fluxo de venda) | `npm run smoke` |
| **Route** | Validação de entrada, perfil exigido, status HTTP | `npm run e2e` |
| **Frontend** | Renderização; as regras vêm do banco | `npm run e2e` |

Duplicar regra de negócio entre aplicação e banco seria criar duas fontes
de verdade. A escolha aqui foi: **o banco é o arbrite**, e a aplicação
traduz a mensagem dele.

## O banco é o guardião — três exemplos observados

```bash
npm run smoke
```

```
RN01 — Conflito de agenda: este profissional já possui um atendimento que
       se sobrepõe a este horário.              → 409 CONFLITO_AGENDA

Fora da disponibilidade cadastrada (RN08): colaborador 8 não atende em …
                                          → 422 (gatilho do banco)

Operação bloqueada por uma regra do banco.  → 422 (constraint do banco)

Somente gestores podem estornar vendas (RN11)  → 403 (gatilho do banco)
```

A checagem de conflito no front (`Agenda.tsx`) existe só para dar retorno
instantâneo. A decisão é sempre do banco: o front sempre chama a API.

## Multi-tenant (RNF13)

A cada transação a aplicação declara o tenant:

```js
await withTransaction({ tenantId, usuarioId }, async (client) => {
  await client.query("SELECT set_config('app.petshop_id', $1, true)", [String(tenantId)])
  // ... todas as consultas daqui herdam o filtro das políticas RLS
})
```

`SET LOCAL` faz o valor sumir no fim da transação, então uma conexão
devolvida ao pool nunca "vaza" o tenant anterior.

**A exceção**, e ela é explícita: o login precisa encontrar a conta pelo
e-mail **antes** de existir um tenant. Isso é feito por
`petplus_buscar_usuario_por_email()`, uma função `SECURITY DEFINER` que
devolve só `id`, `petshop_id`, `perfil` e o hash — nada mais, e não concede
escrita alguma. As duas únicas funções desse tipo no banco são as de login
e de "petshop padrão" (`006_funcoes_de_autorizacao.sql`).

O teste prova que a exceção não vaza nada: `npm run test:db` cria um segundo
tenant e confirma que o primeiro não enxerga nenhum registro dele.

## Autenticação (RF18 / RNF02 / RNF04 / RNF24)

- Senha guardada como **hash bcrypt** (10 rounds); nunca em texto puro, nunca
  devolvida pela API.
- **JWT** com `sub`, `petshopId`, `perfil` e `nome`.
- A cada requisição o middleware **reconsulta** o usuário: conta desativada
  ou removida não continua operando com um token ainda válido.
- E-mail inexistente e senha errada devolvem a **mesma** mensagem, para não
  permitir enumerar contas.
- Recuperação de senha guarda apenas o **SHA-256** do token, com validade
  de 1 h e uso único. O token em claro volta na resposta só para permitir
  demonstrar o fluxo sem um provedor de e-mail.

## Contrato da API

Base: `http://localhost:3333/api`

| Método | Rota | Perfil | Descrição |
|---|---|---|---|
| `GET` | `/health` | público | Estado da API e do banco |
| `POST` | `/auth/login` | público | Devolve `{ token, usuario }` |
| `POST` | `/auth/cadastro` | público | Cadastro de tutor + consentimento LGPD |
| `POST` | `/auth/recuperar-senha` | público | Gera o token de redefinição |
| `POST` | `/auth/redefinir-senha` | público | Consome o token e troca a senha |
| `GET` | `/auth/eu` | qualquer | Sessão atual |
| `GET` | `/bootstrap` | qualquer | Snapshot do tenant (§ abaixo) |
| `GET` | `/agendamentos` | qualquer | Lista do tenant |
| `POST` | `/agendamentos` | qualquer | Cria — banco valida RN01/RN08 |
| `PATCH` | `/agendamentos/:id/remarcar` | qualquer | Move — revalida conflito |
| `PATCH` | `/agendamentos/:id/cancelar` | qualquer | Cancela e libera o horário (RN04) |
| `PATCH` | `/agendamentos/:id/concluir` | qualquer | Conclui o atendimento |
| `GET` | `/vendas` | qualquer | Histórico com itens e pagamentos |
| `POST` | `/vendas` | qualquer | Registra venda — baixa estoque (RF08) |
| `POST` | `/vendas/:id/estornar` | **GESTOR** | Estorna e devolve estoque (RN11) |
| `GET` | `/produtos` | qualquer | Catálogo com saldo |
| `GET` | `/produtos/alertas` | qualquer | Alertas de mínimo e validade |
| `POST` | `/produtos` | **GESTOR** | Cadastra com entrada inicial |
| `PATCH` | `/produtos/:id` | **GESTOR** | Edita metadados |
| `POST` | `/produtos/:id/entrada` | **GESTOR** | Entrada de mercadoria |
| `DELETE` | `/produtos/:id` | **GESTOR** | Inativa (RF03) |
| `GET` | `/clientes/:id/pets` | qualquer | Pets de um tutor |
| `POST` | `/clientes` | **GESTOR** | Cadastra tutor e primeiro pet |

### `GET /bootstrap`

Uma chamada devolve todo o tenant no **formato exato** do antigo `db` em
memória do protótipo (`src/data.ts`): mesmas chaves, mesmos tipos,
`dataHora` em `'YYYY-MM-DDTHH:MM'`. É o que permitiu ligar o banco às 26
telas sem reescrever nenhuma delas.

**Substitua esta rota por endpoints por recurso** quando construir o
backend robusto. As camadas acima dela não mudam: é só um novo
`repositories/` consumindo as mesmas telas, agora com cache e paginação.

## Como isso se liga ao frontend

```
src/api.ts          único ponto de contato com a rede (fetch + token + erros)
src/data.ts         busca o bootstrap e preenche `db` — MESMO objeto de antes
src/App.tsx         espera a carga antes de renderizar as telas internas
```

`db` mantém a identidade do objeto durante toda a sessão: nunca é
substituído, é preenchido. Por isso as telas que fazem
`useState([...db.agendamentos])` continuam funcionando sem alteração.

As três telas com **escrita real** no banco — `Agenda.tsx` (criar, remarcar,
cancelar), `PDV.tsx` (registrar venda) e `Estoque.tsx` (criar, editar,
entrada, excluir) — chamam a API e depois `sincronizar()`, que relê o
snapshot. Por isso uma venda registrada no PDV aparece imediatamente na
tela de Estoque com o saldo novo: o dado deixou de viver na memória da tela.

As demais telas seguem lendo `db` em modo leitura, como no protótipo.

## Verificação

```bash
npm run test:db    # 32 checagens no BANCO: normalização, FKs, RN, RLS
npm run smoke      # 30 checagens na API por HTTP: auth, regras, perfis
npm run e2e        # 31 checagens no Chrome: login, agenda, PDV, estoque
npm run verificar  # recria o banco e roda os três em sequência
```

| Suíte | O que prova que nenhuma outra prova |
|---|---|
| `test:db` | As regras sobrevivem à aplicação: recusa direto no PostgreSQL |
| `smoke` | As rotas, o JWT e a tradução de erros estão ligados ponta a ponta |
| `e2e` | O app **consegue** usar a API — CORS, token, ordem de carga |

`e2e` é a que pega o que as outras duas não veem: um `Origin` não
liberado, um token não lido ou um `db` carregando tarde demais só apareceriam
navegando de verdade. Ele digita a senha, cria um agendamento, vende no PDV
e dá entrada de estoque — e depois **confere os saldos pela API**, para não
confiar no que a tela diz.

## Caminho para o backend robusto

O que já está pronto e o que falta, em ordem de prioridade:

| # | Item | Estado |
|---|---|---|
| 1 | **Envio de e-mail** (RF12/RF13) | Tabela e gatilho prontos; falta provedor + agendador |
| 2 | **Exportação PDF/CSV** (RF27) | Tabela `relatorio` pronta; falta gerar o arquivo |
| 3 | **Paginação e filtros** | Hoje `bootstrap` traz tudo; suplemente endpoints por recurso |
| 4 | **Rate limiting e refresh de token** | Ausente |
| 5 | **Testes unitários da camada de serviço** | Hoje a cobertura é de integração |
| 6 | **Observabilidade** (RNF17) | Só `console.error`; falta log estruturado e métricas |
| 7 | **Gestão de migrations versionada** | O runner já registra estado; falta uma ferramenta de rollback |
| 8 | **Cache e filas** | Vendas e notificações são candidatas naturais a fila |

Nenhuma dessas tarefas exige mexer no banco: elas são todas da camada de
aplicação. A separação em camadas é o que garante isso.

## Configuração

Copie `backend/.env.example` para `backend/.env` e ajuste. Tudo que muda
entre ambientes passa por variável de ambiente.

| Variável | Padrão | Observação |
|---|---|---|
| `PORT` | `3333` | Porta da API |
| `DB_HOST` / `DB_PORT` / `DB_NAME` | `localhost` / `5432` / `petplus` | |
| `DB_USER` / `DB_PASSWORD` | `petplus_app` / `petplus_app` | Papel com RLS ativa |
| `DB_ADMIN_USER` / `DB_ADMIN_PASSWORD` | `petplus` / `petplus` | Só migrations e seed |
| `JWT_SECRET` | — | **Troque em produção.** `JWT_EXPIRES_IN` padrão: 8 h |
| `CORS_ORIGIN` | `http://localhost:5173` | Origen do frontend |
| `BCRYPT_ROUNDS` | `10` | |

## Notas de implementação

**Erros do banco viram mensagens legíveis.** `middleware/errors.js` traduz
o código SQLSTATE para HTTP e para português: `23P01` → 409 com a mensagem
de conflito de agenda; `42501` → 403; `23514` → 422. A aplicação nunca
precisa conhecer esses códigos.

**Dinheiro é `NUMERIC`, nunca `float`.** O pool converte na fronteira com
segurança (`NUMERIC` → `Number`), porque no domínio do PetPlus tudo tem
duas casas. Se um dia precisar de precisão arbitrária, troque por `decimal.js`
no mesmo lugar — só um arquivo muda.

**Fuso horário é explícito.** `petplus_para_ts()` e
`petplus_data_hora_local()` recebem o fuso do petshop como parâmetro, em vez
de depender do `TimeZone` da sessão — assim o dado não muda se o servidor
mudar de configuração.

**Débito de estoque é transacional.** `venda.repository.registrar()` trava as
linhas dos produtos com `SELECT … FOR UPDATE` **antes** de ler o saldo, o
que impede duas vendas simultâneas de venderem o mesmo estoque
(*write skew*). A venda, os itens, os pagamentos e a baixa de estoque saem
todos na mesma transação.
