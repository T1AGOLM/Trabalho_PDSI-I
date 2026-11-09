# PetPlus — Backend

API em Node.js e Express responsável por autenticação, cadastros, agenda, estoque, vendas e recursos de gestão. Utiliza PostgreSQL, consultas parametrizadas e organização em rotas, serviços e repositórios.

Para o resumo do projeto e as evidências consolidadas, consulte o [README principal](../README.md). O preparo e a atualização do PostgreSQL estão no [guia do banco](../Banco_de_Dados/README.md).

## Execução e configuração

Comandos a partir de `backend/`:

```powershell
npm ci
if (-not (Test-Path -LiteralPath .env)) {
    Copy-Item .env.example .env
}
```

Ajuste o `.env` antes de iniciar. Não sobrescreva um arquivo local já configurado. Após preparar o banco:

```powershell
npm start
```

API: [http://localhost:3333/api](http://localhost:3333/api). Documentação das rotas: [http://localhost:3333/api/docs](http://localhost:3333/api/docs).

```powershell
Invoke-RestMethod 'http://localhost:3333/api/health'
```

O backend declara Node.js 20+; para executar também os testes que usam o Puppeteer do lockfile, utilize Node.js 22.12 ou superior.

| Variável | Finalidade |
|---|---|
| `NODE_ENV` / `PORT` | Ambiente e porta da API. |
| `DB_HOST`, `DB_PORT`, `DB_NAME` | Banco acessado pelo processo. A porta deve coincidir com a publicação do Docker; no ambiente examinado foi 5433. |
| `DB_USER`, `DB_PASSWORD` | Credenciais do papel da aplicação, com políticas de isolamento. |
| `DB_ADMIN_USER`, `DB_ADMIN_PASSWORD` | Credenciais administrativas utilizadas pelos scripts de banco. |
| `JWT_SECRET` | Segredo de assinatura. Substitua os valores de demonstração fora do ambiente local. |
| `JWT_EXPIRES_IN` / `JWT_REFRESH_EXPIRES_IN` | Validade dos tokens. O código usa padrões de 30 minutos e 7 dias; o `.env.example` define 8 horas para o primeiro. O valor configurado prevalece. |
| `CORS_ORIGIN` | Lista de origens permitidas; frontend local em `http://localhost:5173`. |
| `APP_URL` | URL pública do frontend usada na construção do link de recuperação, independente do CORS. |
| `EXPOR_TOKEN_RECUPERACAO` | `false` por padrão. Demonstração explícita fora de produção; produção ignora a flag. |
| `EMAIL_TRANSPORT` | `console` ou `arquivo`, ambos transportes locais sem entrega de e-mail. |
| `LEMBRETES_ENABLED` | Habilita o agendador; pode ser desativado no ambiente isolado de testes. |

A configuração completa e suas validações estão em [src/config/env.js](src/config/env.js). O `.env` real não deve ser versionado.

## Arquitetura em camadas

| Camada | Responsabilidade |
|---|---|
| `routes/` | Rotas HTTP, validação de entrada e seleção de perfis autorizados. |
| `services/` | Fluxos de autenticação, sessões, recuperação e operações que combinam etapas. |
| `repositories/` | Consultas parametrizadas e operações transacionais por domínio. |
| `db/` | Pool e contexto transacional do petshop. |
| `middleware/` | Autenticação, segurança HTTP e tradução de erros. |
| `observability/` | Logs estruturados e métricas. |
| `jobs/` | Agendamento e processamento periódico de notificações. |

O banco participa das garantias de integridade, disponibilidade, conflito de agenda e estoque. As permissões também são verificadas pela API. Políticas RLS utilizam o contexto `app.petshop_id` na transação; elas não dispensam testes de autorização nem configuração correta dos papéis.

Datas de agenda são convertidas entre o instante armazenado em PostgreSQL e a data/hora local do petshop. Valores financeiros são armazenados em NUMERIC; a aplicação converte os valores na fronteira de acesso ao banco.

## Ajustes realizados

| Tema | Problema anterior | Ajuste e efeito |
|---|---|---|
| Sessão ativa | JWT válido não era vinculado à revogação do registro da sessão. | JWT inclui `sid`; o middleware confere sessão ativa e usuário em cada requisição autenticada. |
| Logout | Encerramento e limpeza de cookies tinham caminhos incompletos. | Identificação por refresh e/ou access token assinado; limpeza dos cookies em finally. |
| Concorrência de tokens | Leituras e atualizações permitiam disputa no consumo. | Consumo condicional; rotação e criação do substituto na mesma transação. Reuso revoga as sessões do usuário. |
| Senha | Alteração e revogação não estavam garantidas na mesma transação. | Troca/redefinição revoga todas as sessões atomicamente; novo login é necessário. |
| Recuperação | Link podia circular em notificações e transportes locais. | Notificação sem credencial, redação nos logs e demonstração somente por flag. |
| Consentimento | Conversão de valores aceitava entradas diferentes do booleano esperado. | Cadastro exige `true` literal e retorna código `LGPD_CONSENTIMENTO` quando inválido. |
| Erros HTTP | Mensagem podia ser omitida na serialização da resposta. | Contrato de mensagem consistente, detalhes de campos e resposta genérica para falhas internas não tratadas. |
| Migrações | Banco legado tinha histórico diferente da 007 atual. | Migrador reconhece o par legado 007/008 e usa a ponte 009 sem reaplicar a outra 007. |

JWTs antigos sem `sid` precisam de renovação ou novo login. Limpar dados locais sem rede não garante revogação no servidor; a interface e os testes distinguem esses efeitos.

## Recuperação de senha

O banco guarda SHA-256 do token, com validade de 60 minutos e uso único. A redefinição consome o token e grava a senha na mesma transação da revogação das sessões.

Os transportes `console` e `arquivo` não entregam um e-mail utilizável ao usuário. A implantação de um provedor de entrega continua pendente. Para demonstração local, antes de iniciar a API:

```powershell
$env:EXPOR_TOKEN_RECUPERACAO = 'true'
npm start
```

O botão de continuação da interface só aparece quando a API devolve um token. A resposta padrão não o inclui e a flag não tem efeito em produção. Para encerrar a demonstração, pare o processo, remova a variável do terminal e confirme que o `.env` mantém `false`:

```powershell
Remove-Item Env:EXPOR_TOKEN_RECUPERACAO -ErrorAction SilentlyContinue
```

## Contrato e integração com a interface

A base local é `/api`. A lista completa de rotas e schemas está em `/api/docs`; exemplos relevantes:

| Método | Caminho sem `/api` | Finalidade |
|---|---|---|
| GET | `/health` | Estado do processo e conexão com o banco. |
| POST | `/auth/login`, `/auth/refresh`, `/auth/logout` | Início, renovação e encerramento de sessão. |
| POST | `/auth/cadastro` | Cadastro público de tutor com consentimento. |
| POST | `/auth/recuperar-senha`, `/auth/redefinir-senha` | Solicitação e consumo do token de recuperação. |
| GET | `/auth/eu` | Identificação da sessão autenticada. |
| GET/POST | `/agendamentos` | Consulta com filtros e criação de reserva. |
| PATCH | `/agendamentos/:id/remarcar` | Remarcação da reserva com nova validação de disponibilidade. |
| PATCH | `/agendamentos/:id/cancelar` | Cancelamento da reserva. |
| PATCH | `/agendamentos/:id/concluir` | Conclusão; exige perfil da equipe. |
| GET | `/agenda/horarios-livres` | Array de horários livres para profissional, data e duração. |

As coleções paginadas usam o envelope `{ dados, pagina, limite, total, paginas }`, com limite máximo de 100 por página. Nem todo endpoint é uma coleção paginada: horários livres, por exemplo, retornam array.

O frontend carrega recursos conforme o perfil. A descrição antiga de uma carga única por `/bootstrap` não representa o fluxo atual. O [README da interface](../Prototipo_navegavel/README.md) descreve a organização do cliente HTTP e do cache.

## Migrações

O migrador utiliza `schema_migrations`, aplica arquivos novos em ordem e envolve cada arquivo em transação. O seed é um comando separado. Para atualizar uma base existente, faça backup e siga o [procedimento do banco](../Banco_de_Dados/README.md#atualizar-um-banco-existente).

A migração 009 também preserva a razão antiga de fidelidade e desativa seus produtores de crédito para evitar duplicidade com o backend. Não aplique a outra 007 manualmente por cima do histórico legado.

## Validação

### Testes sem banco real

A partir de `backend/`:

```powershell
node --test --test-concurrency=1 tests/unit/
```

`npm test` executa a mesma pasta sem limitar a concorrência. A opção sequencial foi usada na revisão para reduzir o consumo simultâneo de recursos.

### Integração de segurança com PostgreSQL

Prepare um banco exclusivo com schema e dados de demonstração. A suíte cria contas de teste e os registros permanecem para inspeção. Após configurar a conexão do terminal para essa cópia:

```powershell
$env:DB_NAME = 'petplus_test'
$env:NODE_ENV = 'test'
$env:PETPLUS_BANCO_TESTE = '1'
node --test tests/integration/seguranca-sessoes.test.js
```

O nome deve conter `test`; o opt-in é obrigatório. O exemplo não cria o banco nem define sua porta/credenciais. Sem o opt-in, a suíte é explicitamente ignorada.

### Integração pelo navegador

O teste de agendas cria um BANHISTA exclusivo na cópia e uma reserva pela interface do cliente, confere o mesmo ID no gestor/responsável e verifica conclusão/cancelamento após recarga.

```powershell
node --test tests/integration/agendas-navegador.test.js
```

Exige `DB_NAME` de teste, `PETPLUS_BANCO_TESTE=1`, API em `NODE_ENV=test`, frontend compilado/servido e URLs `API_URL`/`FRONT_URL` corretas. Defina `CHROME_PATH` para o navegador instalado quando necessário.

As variáveis do terminal do teste não reconfiguram a API que já está rodando: confira também a conexão do servidor. Os testes escrevem dados na cópia e não devem apontar para o banco da equipe.

### Outras suítes existentes

| Comando | Escopo e efeito |
|---|---|
| `npm run test:db` | Integridade e regras diretamente no PostgreSQL; utiliza operações de teste. |
| `npm run smoke` | HTTP, regras de negócio e perfis; grava dados de teste na API indicada por `API_URL`. |
| `npm run e2e` | Navegador, API e banco; cria reservas, vendas e movimentações de estoque. |
| `npm run verificar` | Executa unitários, reset e suítes integradas; recria o banco e exige ambiente descartável. |
| `npm run reset` | Recria o esquema e carrega dados de demonstração. Não é comando de inicialização diária. |

Os resultados observados estão no [registro de validação do projeto](../README.md#validação-dos-ajustes). A validação mais recente dos fluxos essenciais inclui testes de aplicação, com resultados e limites registrados nesse guia.

## Limitações

- Envio real de e-mail não implementado; a fila e o agendador existentes não equivalem a entrega por provedor externo.
- A entrega real de e-mail e as operações de privacidade/backup pela interface ainda não estão concluídas.
- A API possui paginação, rate limiting, renovação de sessão, logs estruturados e testes unitários; essas funcionalidades não devem constar como ausentes em uma lista de evolução.
- A revisão completa da interface móvel permanece pendente.
## Ajustes dos fluxos essenciais

- `POST /auth/cadastro` aceita `pet` opcional com nome, espécie, raça, porte, idade e observações de saúde. O tutor é definido pela conta criada, nunca por um identificador enviado dentro de `pet`. Conta, cliente, pet e sessão são gravados na mesma transação.
- `PATCH /agendamentos/:id/concluir` aceita `observacao` opcional (até 2.000 caracteres). Status, registro de saúde e pontos são gravados juntos. O registro utiliza a data local do agendamento e identifica o serviço e o número da reserva. Repetições retornam 404 sem duplicar o registro.
- Não há migração nova nem preenchimento retroativo de históricos. As chamadas antigas de conclusão sem corpo continuam aceitas.
- `tests/unit/fluxos-essenciais.test.js` injeta falhas de pet, sessão, histórico e pontos para verificar rollback; não conecta ao banco. A integração `tests/integration/agendas-navegador.test.js` também verifica cadastro inicial, conclusão pela tela Atendimentos, observação no histórico e persistência após recarga.

### Senha no cadastro administrativo de cliente

A interface de cadastro pelo gestor envia `senha` em `POST /clientes`. Quando informada, a API aplica o mesmo schema de senha do cadastro público (8 a 72 caracteres, letra e número) e armazena somente o hash bcrypt. A confirmação não é enviada nem retornada. Por compatibilidade, consumidores antigos da API ainda podem omitir a senha; essas contas dependem da recuperação para definir uma senha conhecida. O envio real de e-mail continua pendente.

O teste de navegador com PostgreSQL também cobre cadastro pelo gestor, bloqueio de senha ausente/confirmação diferente e login do cliente criado com seu primeiro pet. Contas existentes não tiveram suas senhas alteradas.

## Ajustes de gestão e operações

- Dashboard calcula receitas diretamente pelo `valor_total` líquido das vendas finalizadas, sem descontar novamente o desconto. Usa `TimeZone` local à transação para respeitar o fuso da unidade. Série de sete dias; ocupação da semana de segunda a domingo, excluindo cancelados e dias bloqueados da disponibilidade.
- `POST /pets/:id/reativar` exige gestor e tutor ativo. `DELETE /pets/:id` também exige gestor, conforme RN03. Inativar tutor revoga sessões e inativa pets; reativar tutor preserva os pets inativos até uma reativação individual.
- A interface utiliza `GET/PATCH /petshop`, `GET /relatorios/previa` e `GET /relatorios/exportar`. As prévias não registram exportação; downloads registram metadados. Estoque representa posição atual; PDF e CSV são os formatos expostos pela tela.
- OpenAPI atualizado com a reativação de pets. Sem nova migração ou dependência.

Teste integrado específico, com as mesmas pré-condições das demais integrações de navegador:

```powershell
node --test tests/integration/gestao-navegador.test.js
```

Exige `PETPLUS_BANCO_TESTE=1`, `DB_NAME` identificando uma cópia de testes, API em `NODE_ENV=test`, `FRONT_URL`, `API_URL` e navegador disponível. O cenário cria contas/reserva/venda e exportações na cópia; restaura as configurações, estorna sua venda e cancela sua reserva ao finalizar. Os cadastros e metadados permanecem na base descartável como evidência de teste. Capturas opcionais podem ser direcionadas por `PETPLUS_CAPTURAS` para uma pasta fora do repositório.
