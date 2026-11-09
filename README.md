# PetPlus — Sistema de Gestão para Petshop

Projeto acadêmico de um sistema para apoiar o cadastro de tutores e pets, o agendamento de serviços, os atendimentos, as vendas e o controle de estoque de um petshop.

A implementação utiliza React e TypeScript na interface, Node.js e Express na API e PostgreSQL no armazenamento. O projeto combina funcionalidades integradas ao banco com telas e operações ainda em desenvolvimento.

## Organização da documentação

Este README apresenta a visão geral. Os outros três documentam a operação de cada módulo, evitando repetir instruções completas em todos os arquivos.

| Documento | Responsabilidade |
|---|---|
| [Banco de dados](Banco_de_Dados/README.md) | Modelo, migrações, configuração do PostgreSQL e compatibilidade com o histórico legado. |
| [Backend](backend/README.md) | Arquitetura da API, configuração, autenticação, segurança e testes de integração. |
| [Frontend](Prototipo_navegavel/README.md) | Execução da interface, perfis, telas ajustadas e limitações de uso. |

## Estrutura do projeto

| Pasta | Conteúdo |
|---|---|
| `Banco_de_Dados/` | Modelo de dados, diagramas, dicionário e arquivos SQL. |
| `backend/` | API, serviços, repositórios, scripts e testes. |
| `Prototipo_navegavel/` | Interface, cliente HTTP e testes do navegador. |
| `Diagramas/` e `Documentação/` | Materiais de especificação e modelagem da equipe. |

## Execução em ambiente local

Os comandos abaixo são para PowerShell, a partir da raiz do repositório. Utilize Node.js 22.12 ou superior para compatibilidade com o Puppeteer declarado nos testes, PostgreSQL e, quando utilizado para hospedar o banco, Docker.

### Preparação inicial

1. Configure o banco conforme o [guia do PostgreSQL](Banco_de_Dados/README.md). Se ele já existir, preserve os dados e confira as migrações aplicadas.
2. Instale as dependências registradas nos lockfiles:

```powershell
cd .\backend
npm ci
cd ..\Prototipo_navegavel
npm ci
cd ..
```

3. Crie `backend/.env` a partir de [backend/.env.example](backend/.env.example) somente se o arquivo local ainda não existir. Ajuste conexão, porta do banco e segredo JWT conforme o ambiente.
4. Para atualizar o esquema, siga o procedimento de migração e backup do [guia do banco](Banco_de_Dados/README.md). Iniciar a API não aplica migrações automaticamente.

### Iniciar um ambiente já configurado

Confira o contêiner existente com `docker ps -a`. Se o banco estiver em um contêiner parado chamado `petplus-db`, inicie-o com `docker start petplus-db`.

Terminal 1 — API:

```powershell
cd .\backend
npm start
```

Terminal 2 — interface, também a partir da raiz:

```powershell
cd .\Prototipo_navegavel
npm run dev
```

Abra [a interface local](http://localhost:5173). Para conferir a conexão da API:

```powershell
Invoke-RestMethod 'http://localhost:3333/api/health'
```

A porta publicada do Docker deve coincidir com `DB_PORT`. No ambiente examinado, o PostgreSQL do projeto usa `localhost:5433`; o valor de exemplo no `.env.example` é `5432` e deve ser ajustado quando necessário.

## Ajustes realizados

Referência da comparação: versão anterior `c08b209` e conjunto final `b0b06ab`, reorganizado em três commits em 09/11/2026.

| Área | Problema anterior | Ajuste realizado | Evidência registrada |
|---|---|---|---|
| Banco | Histórico legado incompatível com estruturas e funções exigidas pelo backend. | Migração 009 e reconhecimento desse histórico pelo migrador. | Comparação dos dados anteriores e teste de reaplicação em cópia isolada. |
| Autenticação | Botões acessavam contas de demonstração automaticamente. | Login manual para Gestor, Colaborador e Cliente; o perfil efetivo vem da conta autenticada. | Teste de navegador com API simulada. |
| Sessões | Respostas antigas podiam repovoar dados após logout/troca de conta. | Limpeza de cache, descarte de respostas antigas e JWT vinculado a sessão ativa. | Testes de módulos, HTTP e PostgreSQL. |
| Recuperação de senha | Formulários simulados e exposição do link em transportes locais. | Integração à API, uso único do token, revogação das sessões e demonstração mediante flag. | Testes unitários, de integração e navegador. |
| Agendas | Datas fixas, profissional fixo e omissão de reservas com minutos. | Consulta por semana, profissional da sessão e exibição de horários como 09:30. | Reserva criada pelo cliente e conferida no gestor e no responsável. |
| Minha Agenda | Concluir/cancelar alterava apenas o estado visual. | Ações integradas à API, com persistência após recarga. | Teste integrado de navegador e PostgreSQL. |
| Atendimentos | Consulta fixa em 12/09/2026. | Data local atual, escolha de outro dia e atualização pela API. | Teste de navegador com API simulada. |
| Clientes e formulários | Campos opcionais causavam tela em branco; erros podiam aparecer sem explicação. | Tratamento de valores nulos e mensagens com detalhes de validação. | Testes de regressão do backend e da interface. |

### Rastreabilidade no Git

| Commit | Escopo |
|---|---|
| `e9a321f` | Banco: migração de compatibilidade. |
| `8e9b99e` | Backend: sessões, recuperação, erros, scripts, testes e documentação. |
| `b0b06ab` | Frontend: login, cache, agendas, campos opcionais e testes. |

Esses ajustes possuem dependências entre os módulos; a revisão funcional deve considerar o conjunto completo.

## Validação dos ajustes

Resultados registrados durante a revisão de 09/11/2026. Não representam uma execução automática a cada abertura deste documento.

| Verificação | Resultado registrado | Ambiente e limite |
|---|---|---|
| Unitários do backend | 94 aprovados | Incluem validação HTTP e 7 casos de transação dos fluxos essenciais com falhas injetadas. |
| Módulos do frontend | 8 aprovados | Código real com rede simulada. |
| Navegador com API simulada | 1 suíte aprovada | Inclui login manual, troca de conta, campos nulos e consulta por data. |
| Segurança com PostgreSQL | 6 casos aprovados | Cópia exclusiva de testes; inclui reaplicação da migração. |
| Regras do banco | 33 verificações aprovadas | Cópia exclusiva de testes. |
| API — smoke | 87 verificações aprovadas | Servidor real conectado à cópia de testes. |
| Navegador integrado geral | 31 verificações aprovadas | Fluxos de login, agenda, PDV, estoque e sessão na cópia. |
| Navegador integrado das agendas | 1 caso aprovado | Reserva pelo cliente, visibilidade e persistência das ações. |
| TypeScript e compilação | Aprovados na revisão | TypeScript e Vite programático executados separadamente devido a restrição de caminhos do ambiente de revisão. |

As verificações com dublês não substituem as integrações com PostgreSQL. Consulte os comandos e pré-condições nos READMEs dos módulos. `npm run reset` e `npm run verificar`, no backend, recriam o banco e não devem ser usados como rotina de validação de uma base compartilhada.

## Artefatos acadêmicos

- [Modelo Entidade-Relacionamento e decisões de modelagem](Banco_de_Dados/MER.md).
- [Diagrama editável](Banco_de_Dados/diagramas/mer.mmd) e [imagem do diagrama](Banco_de_Dados/diagramas/mer.png).
- [Dicionário de dados](Banco_de_Dados/dicionario-de-dados.md).
- [Migrações SQL](Banco_de_Dados/sql/).

Os artefatos de modelagem devem ser conferidos contra as migrações posteriores; quantidades históricas de tabelas não são apresentadas aqui como inventário atual certificado.

## Ajustes dos fluxos essenciais

- **Atendimentos:** o botão de conclusão chama a API e salva status, registro do histórico e pontos em uma única transação. A observação é opcional, limitada a 2.000 caracteres, e fica no registro do pet. Uma conclusão repetida é recusada sem duplicar histórico ou crédito.
- **Histórico:** as telas de cliente e colaborador consultam os registros ao abrir, incluindo conclusões realizadas em outra sessão.
- **Cadastro pelo gestor:** Novo cliente + pet exige senha de acesso e confirmação na interface. A senha enviada é validada no backend e armazenada como hash bcrypt. O cliente entra com o e-mail cadastrado e essa senha. Contas antigas não são alteradas; a definição de senha dessas contas continua pelo fluxo de recuperação.
- **Cadastro inicial:** conta, primeiro pet e sessão são gravados juntos por `POST /api/auth/cadastro`. A área do cliente só é carregada depois da resposta; uma falha na gravação reverte a transação. O campo `pet` continua opcional para outros consumidores da API.
- **Compatibilidade:** nenhuma migração ou dependência nova. A atualização do frontend deve acompanhar a do backend para o novo envio do primeiro pet.
- **Validação em 09/11/2026:** 94 unitários do backend, 8 do frontend, 1 cenário de navegador com API simulada (incluindo falha de conclusão), 6 integrações de sessões e 1 cenário de navegador com API/PostgreSQL real aprovados. Este último verificou cadastro inicial, conclusão, observação nos históricos do colaborador e tutor e persistência após recarga. TypeScript e compilação Vite programática também aprovados. As integrações utilizaram a cópia exclusiva de testes; a reversão por falhas injetadas foi verificada com banco simulado.

## Ajustes de gestão e operações

| Área | Comportamento implementado |
|---|---|
| Dashboard (RF14/RF15) | Consulta a API ao abrir/atualizar. Faturamento líquido de vendas finalizadas no dia, semana até hoje e mês até hoje, no fuso da unidade; série de 7 dias, serviços concluídos, avaliações e alertas reais. |
| Ocupação | Minutos não cancelados na semana de segunda a domingo divididos pela disponibilidade de profissionais ativos, descontando dias bloqueados. Sem capacidade fixa ou porcentagens ilustrativas. |
| Configurações | Consulta e grava dados da unidade, prazo de estorno, antecedência de lembretes/validade e pontos por real. Falhas mantêm o formulário e apresentam erro. |
| Relatórios (RF27) | Prévia real e download PDF/CSV com registro no histórico. Vendas, agendamentos e financeiro respeitam o período; estoque representa a posição atual. CSV abre em planilhas, sem prometer um arquivo XLSX. |
| Atendimentos | Lista de confirmados sem alegação de presença. Observações de saúde dos pets da data substituem as recomendações fixas. |
| Inativação (RF03/RN03) | Gestor inativa e reativa clientes/pets; API bloqueia outros perfis. Inativar tutor inativa pets e revoga suas sessões. Reativar tutor não reativa pets automaticamente; cada pet é reativado individualmente após o tutor. Histórico preservado. |

A nova integração `backend/tests/integration/gestao-navegador.test.js` usa API, navegador e banco exclusivo de testes. Não exige nova migração ou pacote. A proteção das rotas foi conferida contra a RN03 do documento de requisitos; a exclusão definitiva não faz parte desse fluxo.

Validação deste conjunto em 09/11/2026: 94 unitários do backend, 11 do frontend, 1 cenário de navegador com API simulada, 6 integrações de sessões e os 2 cenários de navegador/API/PostgreSQL (agendas/cadastros e gestão) aprovados. TypeScript e compilação Vite programática aprovados. Configurações, venda com desconto, prévias, bytes PDF/CSV, permissões e reativação individual foram exercitados na cópia exclusiva de testes. As cinco telas alteradas tiveram inspeção visual no Chrome desktop; validação móvel e nos demais navegadores permanece pendente.

## Limitações e pendências

- O envio real de e-mail não está configurado; os transportes locais não entregam o link de recuperação.
- O sistema lista agendamentos confirmados, mas não possui controle de chegada/check-in.
- Ações de privacidade e gestão de backups pela interface ainda precisam ser implementadas e verificadas.
- A navegação e a responsividade no celular precisam de revisão adicional.
- Atendimentos concluídos antes deste ajuste não recebem registros de saúde retroativos automaticamente.

## Cuidados com dados e versionamento

Mantenha o `.env` real, dumps, bancos locais, logs, `node_modules` e builds fora do commit. O `.env.example` é um modelo versionado. Faça backup antes de migrar um ambiente com dados existentes e execute testes que gravam dados somente em banco exclusivo.