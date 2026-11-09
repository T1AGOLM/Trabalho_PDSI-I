# PetPlus — Frontend

Interface desenvolvida com React, TypeScript e Vite. O frontend acessa a API do PetPlus; não se conecta diretamente ao PostgreSQL.

Para visão geral e resultados consolidados, consulte o [README principal](../README.md). A configuração da API e do banco está nos guias de [backend](../backend/README.md) e [banco de dados](../Banco_de_Dados/README.md).

## Execução

Os comandos abaixo partem desta pasta, `Prototipo_navegavel/`. Configure e inicie a API antes de utilizar as funcionalidades integradas.

```powershell
npm ci
npm run dev
```

Abra [http://localhost:5173](http://localhost:5173). `npm ci` é necessário na instalação ou quando o lockfile mudar, não a cada inicialização.

Para compilar e visualizar o build:

```powershell
npm run build
npm run preview
```

A prévia de produção não herda automaticamente o proxy de desenvolvimento; configure o atendimento de `/api` no ambiente em que o build for publicado.

## Comunicação com a API

| Arquivo | Responsabilidade |
|---|---|
| [src/api.ts](src/api.ts) | Requisições HTTP, paginação, renovação de sessão e erros. |
| [src/data.ts](src/data.ts) | Carregamento por recurso/perfil e limpeza dos dados da conta anterior. |
| [src/App.tsx](src/App.tsx) | Restauração da sessão, autenticação e seleção da área do usuário. |
| [src/useAgenda.ts](src/useAgenda.ts) | Consulta de período, carregamento e descarte de respostas de consultas antigas. |
| [vite.config.ts](vite.config.ts) | Encaminhamento de `/api` durante o desenvolvimento. |

A carga inicial usa endpoints por recurso, como `/clientes`, `/pets` e `/agendamentos`, conforme o perfil. O objeto `db` é um cache local da interface, não uma substituição do banco.

| Variável | Padrão e finalidade |
|---|---|
| `VITE_API_URL` | `/api`, base relativa usada pelo cliente HTTP. |
| `VITE_API_PROXY` | `http://localhost:3333`, destino do proxy do Vite em desenvolvimento. |

Os cookies de sessão são enviados com as requisições. O frontend não persiste os tokens no localStorage. Cookies HttpOnly reduzem a exposição direta do segredo; não eliminam todos os riscos de XSS.

## Perfis e navegação

| Perfil | Áreas principais |
|---|---|
| Gestor | Dashboard, agenda, clientes, colaboradores, estoque, fornecedores, vendas, pacotes, avaliações, relatórios e configurações. |
| Colaborador | Minha Agenda, Atendimentos, histórico do pet, clientes/pets, estoque e bloqueios. |
| Cliente | Início, agendamento, reservas próprias, pets, histórico, fidelidade e perfil. |

Todos os perfis exigem e-mail e senha. Os botões de perfil direcionam o foco ao formulário, sem preencher credenciais nem autenticar automaticamente. O perfil autorizado é determinado pela API.

As contas de demonstração existem somente quando o seed foi aplicado e não representam autenticação automática. As credenciais de demonstração estão documentadas no [guia do banco](../Banco_de_Dados/README.md#dados-de-demonstração).

## Ajustes realizados

| Tela ou componente | Situação anterior | Comportamento após o ajuste |
|---|---|---|
| Login | Acesso automático a contas de demonstração. | Entrada manual nos três perfis. |
| Sessão/cache | Dados e respostas da conta anterior podiam permanecer após logout. | Limpeza imediata e descarte de respostas de sessões anteriores. |
| Recuperar/Redefinir senha | Fluxo visual simulado. | Solicitação e alteração pela API, com carregamento, validação e mensagens de erro. |
| Agenda do gestor | Semana fixa e filtros sem efeito na exibição. | Escolha de data/semana, atualização e filtros de profissional, status e busca. |
| Grade de horários | Comparação exata podia omitir reservas como 09:30. | Reservas agrupadas na hora correspondente, com seus minutos reais visíveis. |
| Minha Agenda | Datas, nome e identificação de colaborador fixos; ações locais. | Dados do profissional logado, consulta semanal e conclusão/cancelamento pela API. |
| Atendimentos | Consulta fixa em 12/09/2026. | Dia atual, escolha de data, navegação diária e nova consulta à API. |
| Clientes do gestor | Campos nulos podiam causar tela em branco. | Busca, apresentação e edição tratam campos opcionais. |
| Cadastro, Agenda, Estoque, PDV e Vendas | Algumas mensagens omitiam o detalhe da validação. | Apresentação da explicação recebida da API. |

### Como conferir uma reserva

1. No gestor, abra Agenda e selecione a data reservada, com os filtros apropriados.
2. Em Minha Agenda, entre com a conta do profissional atribuído à reserva e consulte a mesma semana.
3. Atendimentos mantém uma fila compartilhada de todos os profissionais para o dia selecionado.
4. Ao cadastrar em outra aba, use Atualizar agenda ou Atualizar atendimentos. Não foi implementada atualização automática em tempo real entre abas.

### Recuperação de senha em demonstração local

A API deve estar configurada conforme o [guia de recuperação do backend](../backend/README.md#recuperação-de-senha). O botão de continuação local aparece somente quando a API devolve um token autorizado para demonstração. Em produção, a flag é ignorada.

O token é de uso único, válido por 60 minutos. A tela não deve ser interpretada como comprovação de entrega de e-mail.

## Validação

Teste dos módulos com rede simulada:

```powershell
node --test tests/sessao.test.mjs
```

Navegador real com API simulada, após compilar a interface:

```powershell
npm run build
# Defina CHROME_PATH se o executável não for encontrado automaticamente.
node --test tests/sessao.e2e.mjs
```

O Puppeteer declarado no lockfile exige Node.js 22.12 ou superior. Os testes usam navegador instalado; não adicionam uma dependência de banco à suíte simulada.

Durante a revisão, passaram oito testes de módulos e uma suíte de navegador com API simulada. As evidências integradas e os limites da compilação no ambiente de revisão estão no [registro geral](../README.md#validação-dos-ajustes).

## Limitações conhecidas

- Conclusões antigas não recebem histórico retroativo automaticamente.
- Check-in rápido e orientações de Atendimentos não devem ser tratados como confirmação real de presença nem orientação clínica individual: há conteúdo fixo de demonstração nessa tela.
- O Dashboard ainda usa datas e alguns conteúdos ilustrativos fixos.
- As interfaces de Relatórios e Configurações possuem operações simuladas, mesmo existindo recursos correspondentes no backend.
- O envio real de e-mail, algumas ações de privacidade, a navegação completa no celular e ajustes de largura permanecem pendentes.
- A atualização deste frontend deve acompanhar a do backend: o cadastro inicial envia o primeiro pet dentro de `/auth/cadastro`.

## Documentação relacionada

- [Visão geral e ajustes consolidados](../README.md).
- [API, autenticação e testes integrados](../backend/README.md).
- [Modelo e migrações do banco](../Banco_de_Dados/README.md).
## Ajustes dos fluxos essenciais

Atendimentos grava conclusão e observação pela API, bloqueia cliques repetidos e mantém o modal e o texto quando a gravação falha. As telas de histórico atualizam os registros ao abrir. O cadastro envia conta e primeiro pet juntos; a primeira carga ocorre depois da gravação no backend.

Validação manual sugerida:

1. Crie um cliente com um pet e confirme que ele aparece em Meus Pets sem precisar sair e entrar novamente. Recarregue a página e confira a persistência.
2. Em Atendimentos, escolha a data da reserva, clique em Concluir, escreva uma observação e confirme.
3. Recarregue e confira o status finalizado. Abra Histórico do Pet, selecione o mesmo pet e procure a observação. Confira também no login do tutor.
4. Para simular falha de rede, abra o modal, interrompa a API e tente concluir: o texto deve permanecer e nenhum sucesso deve ser apresentado. Reinicie a API e atualize a lista antes de tentar novamente.

Os testes com API simulada exercitam falha de gravação sem alterar dados reais. Os testes integrados exigem cópia exclusiva do banco.

### Acesso do cliente cadastrado pelo gestor

Em Clientes & Pets → Novo cliente + pet, informe a senha de acesso e sua confirmação antes de avançar para o pet. A senha exige de 8 a 72 caracteres, com ao menos uma letra e um número. A confirmação é verificada apenas na interface; a senha é enviada à API para gerar o hash bcrypt, sem persistência no navegador.

Para conferir: cadastre pelo gestor, saia da conta, abra o login de Cliente e entre com o e-mail e a senha definidos. Confira o primeiro pet e recarregue. Senha ausente/inválida ou confirmação diferente devem impedir o avanço. O ajuste não define senhas para clientes cadastrados anteriormente.
