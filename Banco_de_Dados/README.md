# PetPlus — Banco de Dados

Banco PostgreSQL utilizado pelo PetPlus para armazenar usuários, tutores, pets, profissionais, agenda, estoque, vendas, notificações e demais registros. O modelo acadêmico utiliza normalização, chaves estrangeiras, restrições, gatilhos e isolamento por petshop.

Consulte o [README principal](../README.md) para a visão geral, o [backend](../backend/README.md) para configuração da API e o [frontend](../Prototipo_navegavel/README.md) para execução das telas.

## Artefatos de modelagem

| Artefato | Finalidade |
|---|---|
| [MER.md](MER.md) | Modelo Entidade-Relacionamento e decisões de normalização. |
| [diagramas/mer.mmd](diagramas/mer.mmd) | Diagrama editável em Mermaid. |
| [diagramas/mer.png](diagramas/mer.png) | Representação visual do modelo. |
| [dicionario-de-dados.md](dicionario-de-dados.md) | Inventário gerado para a versão do esquema documentada. |
| [sql/](sql/) | Migrações e seed de demonstração. |

Diagrama e dicionário podem refletir uma entrega anterior. Antes da apresentação acadêmica, confira sua correspondência com as migrações posteriores; a contagem antiga de tabelas não certifica o banco atual.

## Conexão e papéis

| Papel | Uso |
|---|---|
| Administrativo | Criação/atualização do esquema e carga de demonstração pelos scripts. |
| Aplicação | Requisições da API com permissões limitadas e políticas RLS por petshop. |

As variáveis ficam no `.env` local de `backend/`; o arquivo não deve ser versionado. Os exemplos `petplus` e `petplus_app` pertencem ao ambiente de desenvolvimento e não devem ser reutilizados como credenciais de implantação.

A porta da API é independente da porta do PostgreSQL. Um contêiner pode publicar `5433` no computador e continuar usando `5432` internamente.

## Iniciar um banco existente

```powershell
docker ps -a
# Se o contêiner do projeto estiver parado:
docker start petplus-db
```

Confira a publicação de portas. Para `127.0.0.1:5433->5432/tcp`, use `DB_HOST=localhost` e `DB_PORT=5433` na API. No ambiente examinado, há outro PostgreSQL local na porta 5432; iniciar esse serviço não seleciona automaticamente o banco do projeto.

## Preparar um banco novo de demonstração

Procedimento destinado a um banco novo. Não recrie um contêiner existente para tentar corrigir uma conexão.

Exemplo em PowerShell com PostgreSQL 17, acesso local e porta externa 5433:

```powershell
docker run -d --name petplus-db -e POSTGRES_USER=petplus -e POSTGRES_PASSWORD=petplus -e POSTGRES_DB=petplus -p 127.0.0.1:5433:5432 postgres:17-alpine
```

Esse exemplo não configura volume nomeado; preserve o contêiner e faça backup dos dados. Para persistência entre substituições do contêiner, planeje um volume antes de criar o ambiente definitivo.

Após configurar o `.env` da API, com as credenciais administrativas correspondentes, execute a partir de `backend/`:

```powershell
npm ci
npm run migrate
# Apenas para carregar as contas e os registros de demonstração:
npm run seed
```

A instalação de dependências e a configuração do arquivo local estão descritas no [guia principal](../README.md#execução-em-ambiente-local). O seed modifica dados; não faz parte da inicialização diária.

## Atualizar um banco existente

1. Faça backup antes da migração e confirme a possibilidade de restauração em ambiente separado.
2. Confira host, porta, nome do banco e papel administrativo no `.env` local.
3. Inspecione o histórico, por exemplo no contêiner local de demonstração:

```powershell
docker exec petplus-db psql -U petplus -d petplus -c "SELECT nome FROM schema_migrations ORDER BY nome;"
```

4. A partir de `backend/`, execute `npm run migrate`. O migrador aplica somente arquivos novos, reconhece o histórico legado descrito abaixo e não carrega o seed automaticamente.
5. Reinicie a API, consulte `/api/health` e valide login, sessões e uma reserva conhecida.

`npm run reset` recria o esquema; `npm run verificar` também inclui reset. Não os execute sobre dados compartilhados para apenas atualizar ou conferir o sistema.

## Ajustes realizados

### Migração 009 e histórico legado

O ambiente examinado registrava `007_backend_operacional.sql` e `008_modulos_complementares.sql`. A versão atual do repositório possui `007_sessao_pontos_e_auditoria.sql`, com outro conteúdo.

O [migrador](../backend/scripts/migrate.js) reconhece o par legado, preserva os nomes já registrados, não aplica a outra 007 por cima desse histórico e utiliza [009_compatibilidade_backend_atual.sql](sql/009_compatibilidade_backend_atual.sql) como ponte.

| Situação anterior | Alteração da 009 | Resultado esperado |
|---|---|---|
| Estruturas/funções de sessão ausentes no legado. | Tabela de refresh, políticas/grants e funções de consulta exigidas pelo backend. | Login, renovação e revogação com o esquema esperado. |
| Função de unidades ativas ausente. | Função utilizada pelo agendador. | Remoção da incompatibilidade de esquema observada naquele ambiente. |
| Fila de notificação com campos antigos. | Campos e índices necessários ao processamento atual. | Compatibilidade sem reenviar todo o histórico apenas por migrar. |
| Razão de fidelidade com outro formato. | Importação do histórico e preservação dos saldos; manutenção da tabela antiga. | Continuidade do extrato sem novo crédito dos pontos importados. |
| Produtores antigos e backend atual concedendo créditos. | Desativação dos produtores antigos identificados pela migração. | Evitar duplicação de pontos. |

A migração não altera arquivos SQL anteriores. Cada arquivo aplicado pelo migrador é executado em uma transação, com registro em `schema_migrations`.

### Estrutura dos arquivos SQL

| Arquivo | Conteúdo principal |
|---|---|
| `001_enums_e_funcoes.sql` | Extensões, tipos e funções auxiliares. |
| `002_tabelas.sql` | Cadastros, petshop, agenda e demais entidades iniciais. |
| `003_tabelas_estoque_vendas.sql` | Estoque, vendas e estruturas relacionadas. |
| `004_regras_de_negocio.sql` | Restrições e gatilhos das regras de negócio. |
| `005_views_e_seguranca.sql` | Views e políticas de isolamento. |
| `006_funcoes_de_autorizacao.sql` | Funções de autenticação/autorização anteriores à seleção do tenant. |
| `007_sessao_pontos_e_auditoria.sql` | Estruturas de sessão, pontos e auditoria da sequência atual. |
| `009_compatibilidade_backend_atual.sql` | Ponte de compatibilidade com o histórico legado examinado. |
| `010_seed.sql` | Registros de demonstração, carregados pelo comando separado de seed. |

## Garantias e limites

O banco possui mecanismos para conflito de agenda, disponibilidade, estoque, pagamentos e isolamento por petshop. A API fornece o contexto transacional e verifica permissões. Isso não significa que todas as regras do sistema ou todos os cenários tenham sido certificados.

Datas de agenda são armazenadas como TIMESTAMPTZ e convertidas para o calendário local do petshop por funções SQL. O contexto de tenant é definido na transação e não deve permanecer indevidamente na conexão reutilizada pelo pool.

## Validação e inspeção

Na revisão de 09/11/2026, uma cópia restaurada de backup foi utilizada antes da atualização local. A comparação das 32 tabelas anteriores preservou as linhas e os valores das colunas existentes. O teste de reaplicação da 009 também passou. Essa evidência se refere ao histórico examinado, não a todos os esquemas possíveis.

Consultas de inspeção, sem atualização de dados:

```powershell
docker exec petplus-db psql -U petplus -d petplus -c '\dt'
docker exec petplus-db psql -U petplus -d petplus -c '\d refresh_token'
docker exec petplus-db psql -U petplus -d petplus -c "SELECT nome FROM schema_migrations ORDER BY nome;"
```

Para testes que gravam dados, utilize cópia exclusiva. Comandos, pré-condições e evidências estão na [validação do backend](../backend/README.md#validação) e no [registro geral](../README.md#validação-dos-ajustes). Não é necessário recriar o banco para inspecionar o esquema.

## Dados de demonstração

As contas abaixo existem somente quando o seed correspondente foi carregado e as senhas não foram alteradas. O login deve ser digitado manualmente.

| Perfil | E-mail de demonstração | Senha local |
|---|---|---|
| Gestor | `gestor@petplus.com` | `123` |
| Colaborador | `colab@petplus.com` | `123` |
| Cliente | `cliente@petplus.com` | `123` |

A senha curta do seed é uma exceção histórica de demonstração. Novos cadastros de tutor e redefinições seguem a política implementada de senha com ao menos oito caracteres, letra e número. Não confunda dados de demonstração com credenciais apropriadas para publicação.