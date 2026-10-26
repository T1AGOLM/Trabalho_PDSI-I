# PETPLUS — RELATÓRIO TÉCNICO DA IMPLEMENTAÇÃO DO BACKEND

**Projeto:** Trabalho_PDSI-I  
**Natureza:** documentação técnica complementar  
**Objeto:** descrição da implementação do backend do sistema PetPlus  

## Resumo

Este relatório apresenta a implementação do backend do sistema PetPlus, destinado à gestão de petshops. O objetivo é descrever a organização do código, as funcionalidades desenvolvidas e os mecanismos utilizados para autenticação, autorização, persistência e integração com a interface. A análise foi realizada por inspeção estática dos arquivos-fonte, das dependências, das estruturas SQL e dos testes existentes. A aplicação utiliza Node.js, Express e PostgreSQL, com responsabilidades distribuídas entre rotas, middlewares, serviços, repositórios e componentes do banco de dados. Foram identificadas funcionalidades de gerenciamento de usuários, clientes, pets, colaboradores, serviços, fornecedores, agendamentos, estoque, vendas e recursos gerenciais. Também estão presentes geração de relatórios, processamento periódico de notificações, documentação OpenAPI, logs estruturados e métricas. O documento distingue as funcionalidades codificadas das condições que ainda dependem de validação em execução.

**Palavras-chave:** backend; API HTTP; PostgreSQL; gestão de petshops; desenvolvimento de sistemas.

## 1. Introdução

O PetPlus é um sistema de informação voltado à organização das atividades de um petshop. Nesse contexto, o backend é responsável por receber solicitações da interface, validar os dados enviados, controlar o acesso às operações e realizar a comunicação com o banco de dados.

A aplicação de servidor concentra operações relacionadas aos cadastros, aos atendimentos, à movimentação de produtos e aos processos de venda e gestão. Sua implementação também utiliza recursos do PostgreSQL para aplicar regras de integridade e restringir o acesso aos dados de cada unidade.

Este relatório complementa a documentação do projeto, apresentando o que foi desenvolvido e como os componentes participam dos principais fluxos da aplicação.

### 1.1 Objetivo geral

Descrever a implementação do backend do PetPlus com base nos arquivos-fonte disponíveis no projeto.

### 1.2 Objetivos específicos

- Apresentar as tecnologias utilizadas.
- Explicar a organização dos componentes.
- Descrever os módulos funcionais desenvolvidos.
- Identificar as principais rotas e suas condições de acesso.
- Relacionar funcionalidades às referências de requisitos presentes no código.
- Apresentar os mecanismos de persistência, validação e tratamento de erros.
- Registrar os testes existentes e as limitações observadas.

## 2. Procedimentos metodológicos

A elaboração deste relatório utilizou análise documental e inspeção estática do código. Foram examinados o manifesto de dependências, o servidor, as rotas, os middlewares, os serviços, os repositórios, os componentes de persistência, os arquivos SQL e os testes unitários.

Também foram consultados os arquivos de integração do frontend com a API. As descrições dos READMEs foram confrontadas com a implementação, priorizando-se as instruções executáveis quando houve divergência.

Não foram executadas instalações, migrations, inicializações de servidores ou suítes de testes. Portanto, a identificação de uma funcionalidade indica a existência de código correspondente, sem constituir comprovação de funcionamento integrado.

Nenhum arquivo do projeto foi alterado durante a análise.

## 3. Tecnologias utilizadas

**Quadro 1 — Tecnologias identificadas no backend**

| Tecnologia | Finalidade |
| --- | --- |
| Node.js | Execução da aplicação de servidor |
| JavaScript com módulos ES | Organização do código com importação e exportação |
| Express | Definição das rotas e processamento HTTP |
| PostgreSQL | Persistência e aplicação de regras de integridade |
| pg | Comunicação com o banco e gerenciamento de conexões |
| Zod | Validação de entradas e configurações |
| bcryptjs | Geração e comparação de hashes de senha |
| jsonwebtoken | Emissão e verificação dos tokens JWT |
| node:crypto | Geração aleatória e cálculo de hashes |
| Helmet | Configuração de cabeçalhos de segurança |
| cors | Controle de origens nas requisições de navegador |
| express-rate-limit | Limitação da frequência de requisições |
| cookie-parser | Leitura de cookies |
| compression | Compressão das respostas |
| Pino | Registro estruturado de eventos |
| PDFKit | Geração de arquivos PDF |
| swagger-ui-express | Apresentação da documentação OpenAPI |
| node:test | Execução dos testes unitários |
| puppeteer-core | Suporte à automação de navegador |

*Fonte: manifesto de dependências e arquivos-fonte do projeto.*

O acesso aos dados utiliza consultas SQL explícitas, principalmente nos repositórios. Não foi identificado uso de ORM nesse fluxo.

## 4. Arquitetura e organização do código

A organização do backend separa componentes conforme suas responsabilidades.

**Quadro 2 — Estrutura da implementação**

| Componente | Responsabilidade |
| --- | --- |
| src/server.js | Inicializar o servidor, registrar middlewares e iniciar o agendador |
| src/config/env.js | Centralizar e validar configurações de ambiente |
| src/routes/ | Definir endpoints, validações e condições de acesso |
| src/middleware/ | Autenticar, autorizar, proteger entradas e tratar erros |
| src/services/ | Organizar fluxos de autenticação, sessões, mensagens e relatórios |
| src/repositories/ | Executar consultas e operações de persistência |
| src/db/ | Gerenciar conexões, transações, filtros e consultas paginadas |
| src/http/ | Padronizar parâmetros de paginação e ordenação |
| src/jobs/ | Executar tarefas periódicas |
| src/observability/ | Registrar logs e coletar métricas |
| src/docs/ | Descrever o contrato OpenAPI |
| src/utils/ | Disponibilizar funções auxiliares, como serialização CSV |

*Fonte: estrutura do diretório backend/src.*

O fluxo de uma requisição compreende o recebimento pelo Express, a execução dos middlewares, o processamento da rota e a chamada aos componentes necessários para acessar ou modificar os dados.

A separação não corresponde a uma sequência obrigatória de camadas. Algumas rotas chamam serviços, enquanto outras acessam diretamente repositórios ou executam consultas auxiliares de autorização. As regras de negócio estão distribuídas entre aplicação e banco.

## 5. Implementação dos módulos funcionais

### 5.1 Autenticação e gerenciamento de sessões

O módulo implementa login, cadastro público de clientes, consulta da sessão, renovação de tokens, logout, recuperação e troca de senha.

No login, a aplicação localiza o usuário e compara a senha recebida com o hash armazenado utilizando bcrypt. O retorno de credenciais inválidas utiliza a mesma mensagem para e-mail inexistente e senha incorreta.

O cadastro público verifica o consentimento informado e cria os registros de usuário e cliente. A unidade de vinculação é obtida por uma função de petshop padrão no banco.

A autenticação utiliza JWT, recebido por cabeçalho Bearer ou cookie. Em cada requisição autenticada, o middleware consulta novamente o usuário para verificar sua existência e situação ativa.

A renovação utiliza um refresh token aleatório, persistido como hash SHA-256. Ao renovar a sessão, o serviço gera um novo token e revoga o anterior. Também há tratamento para reutilização de token revogado.

A recuperação de senha gera um token com validade de 60 minutos, armazena seu hash e registra uma mensagem na fila de notificações.

**Arquivos principais:** auth.routes.js, auth.service.js, sessao.service.js e middleware/auth.js.

### 5.2 Cadastros e informações de saúde

O módulo reúne operações relacionadas a clientes, pets, colaboradores, serviços e fornecedores.

Foram identificados recursos de consulta, inclusão, atualização e exclusão ou inativação, conforme a entidade. Alguns cadastros possuem reativação.

As informações dos pets incluem histórico e registros de saúde. Há consulta de vacinas próximas do vencimento e verificações de vínculo para restringir o acesso do tutor aos próprios animais.

O cadastro de colaboradores inclui disponibilidade semanal, utilizada nos processos de agendamento.

**Arquivos principais:** cadastros.routes.js e os repositórios de clientes, pets, colaboradores, serviços e registros de saúde.

### 5.3 Agenda e bloqueios

O módulo de agenda oferece criação, consulta, remarcação, cancelamento e conclusão de agendamentos. Também disponibiliza agenda do dia, consulta de profissionais, horários livres e bloqueios.

Quando o cliente cria um agendamento, a aplicação verifica se o pet pertence ao próprio tutor. A conclusão do atendimento exige perfil de gestor ou colaborador.

O PostgreSQL complementa as verificações com regras de sobreposição, disponibilidade e bloqueio. Assim, a consulta de horários livres auxilia a interface, enquanto a gravação permanece sujeita às restrições do banco.

**Arquivos principais:** agenda.routes.js, agenda.repository.js e os arquivos SQL de regras de negócio.

### 5.4 Produtos e estoque

O módulo implementa consulta de produtos, cadastro, atualização, inativação, reativação, entrada de mercadoria e ajuste de estoque.

As mudanças de saldo são registradas como movimentações, permitindo consultar o histórico de entradas e saídas. O banco utiliza gatilho para atualizar a quantidade e verificar a ocorrência de saldo negativo.

Também existem consultas de alertas de estoque mínimo e validade.

**Arquivos principais:** estoque.routes.js, produto.repository.js e os arquivos SQL de regras e consultas de apoio.

### 5.5 Vendas e estornos

O módulo disponibiliza histórico, resumo, consulta individual, registro e estorno de vendas.

O registro utiliza uma transação que reúne venda, itens, pagamentos e movimentações de saída. Antes da gravação, os produtos são selecionados e bloqueados com FOR UPDATE, em ordem de identificador.

O código verifica a existência e a situação dos produtos, calcula valores e confere a composição dos pagamentos. Quando aplicável, conclui o agendamento vinculado e registra créditos de fidelidade.

O estorno exige gestor na rota. O fluxo contempla devolução de estoque e reversão de pontos, enquanto o banco verifica regras de perfil e prazo comercial.

**Arquivos principais:** vendas.routes.js, venda.repository.js e os gatilhos relacionados a estoque, pagamentos e estorno.

### 5.6 Fidelidade e recursos gerenciais

A fidelidade possui consultas e movimentações de pontos, incluindo crédito associado à venda e reversão vinculada ao estorno.

Os recursos gerenciais abrangem pacotes de serviços, assinaturas, avaliações, indicadores do dashboard, notificações e configurações da unidade.

As permissões variam conforme a operação. O cliente possui recursos de autoatendimento, enquanto operações administrativas exigem os perfis definidos em cada rota.

**Arquivos principais:** cadastros.routes.js, gestao.routes.js, repositórios correspondentes e migration de pontos e auditoria.

### 5.7 Relatórios

O serviço de relatórios consulta os dados, gera o conteúdo e registra metadados sobre a solicitação. As rotas admitem relatórios de vendas, agendamentos, estoque e financeiro.

O PDF é gerado com PDFKit. O CSV utiliza separador ponto e vírgula, BOM UTF-8 e tratamento de caracteres especiais.

O arquivo é produzido em memória e enviado pela resposta HTTP. A opção denominada Excel entrega conteúdo CSV com extensão .xls, sem gerar uma pasta de trabalho nativa.

**Arquivos principais:** relatorio.service.js, relatorio.repository.js, gestao.routes.js e utils/csv.js.

### 5.8 Notificações e tarefas periódicas

O módulo possui geração de lembretes de agendamento, avisos de vacina e retorno de banho.

A tabela de notificações funciona como fila persistida. O processamento registra tentativas, falhas e conclusão do envio pelo transporte configurado.

Os transportes existentes são console e arquivo. O agendador executa, no mesmo processo da API, a geração de avisos, o processamento da fila e a remoção de tokens antigos.

**Arquivos principais:** notificacao.service.js, email.service.js e jobs/agendador.js.

## 6. Principais endpoints e condições de acesso

Todas as rotas apresentadas utilizam o prefixo /api. A tabela resume endpoints representativos; o contrato mais amplo está na especificação OpenAPI.

Nas operações com propriedade de dados, a autenticação é acompanhada de verificações adicionais de vínculo.

**Quadro 3 — Principais endpoints**

| Método | Rota | Finalidade | Condição de acesso |
| --- | --- | --- | --- |
| POST | /auth/login | Autenticar usuário | Público |
| POST | /auth/cadastro | Cadastrar cliente | Público, com validação e consentimento |
| POST | /auth/refresh | Renovar sessão | Refresh token aceito pelo serviço |
| POST | /auth/logout | Encerrar a renovação da sessão informada | Token de renovação, quando disponível |
| GET | /auth/eu | Consultar usuário autenticado | Autenticado |
| POST | /auth/recuperar-senha | Solicitar recuperação | Público |
| POST | /auth/redefinir-senha | Redefinir senha | Token de recuperação válido |
| PATCH | /auth/senha | Alterar a própria senha | Autenticado e senha atual |
| GET | /clientes | Listar clientes | Gestor ou colaborador |
| POST | /clientes | Cadastrar cliente pela equipe | Gestor ou colaborador |
| DELETE | /clientes/:id | Inativar cliente | Gestor |
| GET | /pets/meus | Consultar os próprios pets | Cliente |
| GET | /pets/:id/historico | Consultar histórico | Autenticado; cliente limitado ao próprio pet |
| POST | /pets | Cadastrar pet | Autenticado; cliente limitado ao próprio vínculo |
| GET | /agendamentos | Listar agendamentos | Autenticado, com recorte aplicável ao perfil |
| POST | /agendamentos | Criar agendamento | Autenticado; cliente limitado aos próprios pets |
| PATCH | /agendamentos/:id/remarcar | Remarcar atendimento | Autenticado, com verificação de acesso |
| PATCH | /agendamentos/:id/cancelar | Cancelar atendimento | Autenticado, com verificação de acesso |
| PATCH | /agendamentos/:id/concluir | Concluir atendimento | Gestor ou colaborador |
| GET | /produtos | Consultar produtos | Gestor ou colaborador |
| GET | /produtos/alertas | Consultar alertas | Gestor ou colaborador |
| POST | /produtos | Cadastrar produto | Gestor |
| POST | /produtos/:id/entrada | Registrar entrada | Gestor ou colaborador |
| POST | /produtos/:id/ajuste | Ajustar estoque | Gestor |
| GET | /vendas | Consultar vendas | Gestor ou colaborador |
| POST | /vendas | Registrar venda | Gestor ou colaborador |
| POST | /vendas/:id/estornar | Estornar venda | Gestor e regras do banco |
| GET | /dashboard | Consultar indicadores | Gestor |
| GET | /relatorios | Consultar metadados de relatórios | Gestor |
| GET/POST | /relatorios/exportar | Gerar arquivo | Gestor |
| GET | /relatorios/previa | Consultar prévia | Gestor |
| GET | /health | Verificar comunicação com o banco | Público |
| GET | /health/detalhado | Consultar estado detalhado | Gestor |
| GET | /metrics | Consultar métricas | Token específico ou gestor |

*Fonte: definições dos routers do backend.*

## 7. Relação entre requisitos e implementação

O código contém identificadores de requisitos funcionais e regras de negócio em comentários dos módulos.

O quadro a seguir registra essas associações e os mecanismos correspondentes. Ele não representa uma validação integral da especificação acadêmica, pois a correspondência apresentada utiliza os identificadores registrados no código.

**Quadro 4 — Rastreabilidade identificada na implementação**

| Identificador registrado | Funcionalidade associada no código | Evidência de implementação |
| --- | --- | --- |
| RF18 | Autenticação | Login, comparação de senha e emissão de sessão |
| RF24 | Recuperação de senha | Token de recuperação, redefinição e mensagem enfileirada |
| RF04–RF06 | Agenda | Criação, consulta e alteração de agendamentos |
| RF17 | Conclusão de atendimento | Rota de conclusão restrita à equipe |
| RF08 | Movimentação de estoque | Histórico e registro das movimentações |
| RF10 | Venda | Registro transacional e consulta individual |
| RF20 | Fidelidade | Créditos, consultas e movimentações de pontos |
| RF25 | Composição de pagamentos | Verificação na aplicação e validação diferida no banco |
| RF26 | Estorno | Operação de reversão da venda |
| RF27 | Relatórios | Prévia e exportação |
| RF28 | Avaliações | Rotas de consulta e registro |
| RF29 | Pacotes e assinaturas | Manutenção de pacotes e operações de assinatura |
| RF30 | Bloqueios | Consulta, inclusão e remoção de bloqueios |
| RN01 | Conflito de agenda | Restrição de exclusão no PostgreSQL |
| RN02 | Saldo de estoque | Gatilho de movimentação com controle de saldo |
| RN08 | Disponibilidade | Validação da janela de atendimento |
| RN11 | Estorno autorizado | Verificação de perfil e prazo comercial |
| RN12 | Bloqueio de horário | Validação em relação a atendimentos |
| RNF13 | Isolamento entre unidades | Contexto transacional e políticas RLS |
| RNF17 | Observabilidade | Logs estruturados e métricas |
| RNF18 | Documentação da API | Especificação OpenAPI e Swagger UI |

*Fonte: comentários e instruções dos arquivos de rotas, serviços e SQL.*

## 8. Persistência e integridade dos dados

O backend utiliza um pool de conexões PostgreSQL. A função withTransaction inicia uma transação, configura o contexto necessário, executa a operação e confirma ou reverte as alterações.

O contexto utiliza app.petshop_id e app.usuario_id, definidos com alcance local à transação. As políticas de Row-Level Security utilizam a unidade para restringir registros.

O isolamento entre unidades é complementado pela autorização na aplicação. Pertencer ao mesmo petshop não concede automaticamente acesso a todos os dados; operações de clientes também podem verificar propriedade e vínculo.

As consultas utilizam parâmetros posicionais. Os filtros possuem funções reutilizáveis, e a ordenação utiliza mapas de campos permitidos. A paginação possui limite padrão de 25 registros e máximo de 100.

As migrations são registradas em schema_migrations, com aplicação ordenada e uma transação por arquivo. O carregamento dos dados de demonstração é separado do fluxo de migrations.

## 9. Validação, segurança e tratamento de erros

A validação utiliza esquemas Zod para corpo, parâmetros e consultas. O processamento converte tipos e descarta campos não declarados nos objetos utilizados.

A aplicação possui medidas como cabeçalhos de segurança, controle de origens, limitação de requisições, limite do corpo JSON e higienização de entrada.

O tratamento centralizado traduz falhas para respostas HTTP. Entre os casos identificados estão conflitos com status 409, validação com 422, permissão com 403 e timeout de consulta com 504.

As configurações são centralizadas e validadas na inicialização. Existem exigências adicionais para produção, incluindo critérios para segredo JWT e cookies seguros.

## 10. Integração, observabilidade e testes

### 10.1 Integração com a interface

O arquivo api.ts centraliza as chamadas HTTP e a renovação automática de sessão. O arquivo data.ts mantém um cache de dados para as telas e utiliza endpoints por recurso.

A função sincronizar(...recursos) atualiza coleções específicas após alterações. Não foi identificado /bootstrap nos routers atuais examinados.

### 10.2 Observabilidade

O projeto utiliza Pino para logs estruturados e identificação das requisições.

As métricas incluem contadores de requisições e respostas, erros, memória, estado do pool e percentis de latência. A coleta é mantida em memória e reiniciada com o processo.

A documentação da API está disponível em /api/docs, com especificação em /api/openapi.json.

### 10.3 Testes e manutenção

Foram identificados testes unitários para validação, filtros, paginação, CSV, erros e sessão. Existem também scripts de verificação do banco, testes HTTP e automação da interface.

**Quadro 5 — Comandos declarados**

| Comando | Finalidade |
| --- | --- |
| npm test | Testes unitários |
| npm run test:db | Verificações no banco |
| npm run smoke | Verificações da API por HTTP |
| npm run e2e | Automação da interface |
| npm run migrate | Aplicação de migrations |
| npm run seed | Dados de demonstração |
| npm run dicionario | Geração do dicionário de dados |

*Fonte: manifesto de scripts do backend.*

A existência desses testes não comprova sua aprovação. Os resultados não foram revalidados nesta análise.

## 11. Limitações identificadas

As limitações abaixo delimitam a descrição do desenvolvimento:

- Revogação de sessão: a revogação atua sobre refresh tokens. JWTs de acesso já emitidos podem continuar aceitos até expirar, enquanto a conta permanecer ativa.
- Alertas durante a venda: a consulta inicial de produtos em venda.repository.js não inclui estoque_minimo, embora uma comparação posterior utilize essa propriedade. Isso compromete a identificação de produtos em alerta nesse trecho específico.
- E-mail: os transportes implementados registram mensagens em console ou arquivo; não demonstram entrega por provedor externo.
- Agendador: a proteção contra ciclos simultâneos é local ao processo.
- Exportação: a opção Excel contém CSV com extensão .xls.
- Métricas: o armazenamento é temporário, em memória.
- Documentação anterior: partes dos READMEs descrevem uma etapa anterior, apresentando como pendentes recursos já codificados.

Não foram realizadas correções, pois o trabalho solicitado se restringe à documentação.

## 12. Considerações finais

O backend do PetPlus apresenta implementação para os principais processos de cadastro, atendimento, estoque, venda e gestão. Sua estrutura utiliza componentes com responsabilidades distintas, apoiados por validação de entrada, autorização, transações e regras de integridade no PostgreSQL.

A análise demonstra que as decisões de negócio estão distribuídas entre aplicação e banco. Rotas, serviços, repositórios e gatilhos participam de diferentes etapas dos fluxos, sem uma sequência obrigatória de camadas para todas as operações.

Também foram identificados recursos de relatórios, notificações, documentação da API, testes, logs e métricas. Esses componentes ampliam o suporte à operação e à manutenção, respeitadas as limitações descritas.

O relatório oferece uma descrição técnica da implementação disponível. A confirmação do funcionamento integrado e do atendimento completo aos requisitos depende da execução dos testes e da avaliação no ambiente configurado.

## 13. Fontes primárias

As fontes utilizadas pertencem ao repositório Trabalho_PDSI-I. Os caminhos abaixo são relativos à raiz do projeto.

1. Configuração e inicialização: backend/package.json, backend/src/server.js e backend/src/config/env.js.
2. Rotas: arquivos de backend/src/routes/, incluindo autenticação, cadastros, agenda, estoque, vendas e gestão.
3. Middlewares: arquivos auth.js, validar.js, security.js e errors.js, em backend/src/middleware/.
4. Serviços: arquivos de autenticação, sessão, relatórios, notificações e e-mail, em backend/src/services/.
5. Persistência: arquivos de backend/src/repositories/, backend/src/db/ e backend/src/http/paginacao.js.
6. Banco de dados: arquivos SQL em Banco_de_Dados/sql/ e runner backend/scripts/migrate.js.
7. Tarefas periódicas: backend/src/jobs/agendador.js.
8. Observabilidade e documentação: arquivos de backend/src/observability/, backend/src/docs/openapi.js e backend/src/routes/docs.routes.js.
9. Integração com a interface: Prototipo_navegavel/src/api.ts e Prototipo_navegavel/src/data.ts.
10. Testes: arquivos de backend/tests/unit/ e scripts de verificação em backend/scripts/.
11. Comparação documental: README.md e backend/README.md.

