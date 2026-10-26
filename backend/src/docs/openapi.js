import { config } from '../config/env.js'

/**
 * Especificação OpenAPI 3.0 da API (RNF18).
 *
 * Serve dois propósitos: é a documentação navegável em `/api/docs` e o
 * contrato que um gerador de clientes (ou uma suíte de testes de contrato)
 * pode consumir. Mantida à mão, junto do código, para não virar ficção.
 */

const ref = (nome) => ({ $ref: `#/components/schemas/${nome}` })
const envelope = (itemRef) => ({
  type: 'object',
  properties: {
    dados: { type: 'array', items: itemRef },
    pagina: { type: 'integer', example: 1 },
    limite: { type: 'integer', example: 25 },
    total: { type: 'integer', example: 42 },
    paginas: { type: 'integer', example: 2 },
  },
})

const paginacaoParams = [
  { name: 'pagina', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
  { name: 'limite', in: 'query', schema: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
]

const idParam = (nome = 'id') => ({
  name: nome,
  in: 'path',
  required: true,
  schema: { type: 'integer' },
})

const corpo = (schema) => ({ required: true, content: { 'application/json': { schema } } })

const respostas = (ok, descricao = 'Sucesso') => ({
  [ok]: { description: descricao },
  401: { description: 'Não autenticado (SEM_TOKEN / TOKEN_EXPIRADO)' },
  403: { description: 'Acesso negado (PERFIL_INSUFICIENTE / TENANT_VIOLATION / regra de negócio)' },
  422: { description: 'Dados inválidos (VALIDACAO) ou regra do banco violada' },
  429: { description: 'Limite de requisições excedido' },
})

// Autenticação: cookie httpOnly (navegador) OU Bearer (cliente de API).
const seguranca = [{ bearerAuth: [] }, { cookieAuth: [] }]

export const openapi = {
  openapi: '3.0.3',
  info: {
    title: 'PetPlus — API',
    version: '2.0.0',
    description: [
      'API REST do sistema de gestão de petshop PetPlus.',
      '',
      '**Autenticação.** Faça `POST /api/auth/login` e use o `token` devolvido como `Bearer`,',
      'ou deixe o navegador usar o cookie httpOnly gravado no login. O token de acesso é curto',
      '(30 min por padrão) e se renova em `POST /api/auth/refresh`, que rotaciona o refresh token.',
      '',
      '**Multi-tenant.** Cada requisição roda no tenant do usuário autenticado; o `petshop_id`',
      'nunca vem do cliente. O isolamento é imposto por Row-Level Security no PostgreSQL.',
      '',
      '**Paginação.** Toda listagem responde `{ dados, pagina, limite, total, paginas }`.',
      '',
      '**Erros.** Sempre `{ erro, codigo?, detalhe?, campos? }`, com status coerente:',
      '4xx é erro do cliente (dados, permissão, conflito), 5xx é falha do servidor.',
      '',
      '**Regras de negócio.** As regras críticas (RN01 conflito de agenda, RN02 estoque,',
      'RN07 pontos, RN08 disponibilidade, RN11 estorno, RN12 bloqueio) são impostas pelo banco;',
      'a mensagem devolvida é a do banco, já traduzida.',
    ].join('\n'),
  },
  servers: [{ url: '/api', description: 'API PetPlus' }],
  tags: [
    { name: 'Auth', description: 'Login, sessão, recuperação de senha (RF18/RF24)' },
    { name: 'Clientes', description: 'Tutores (RF01–RF03)' },
    { name: 'Pets', description: 'Pets e histórico de saúde (RF02/RF11/RF21)' },
    { name: 'Colaboradores', description: 'Equipe e disponibilidade (RF16)' },
    { name: 'Serviços', description: 'Catálogo de serviços (RF04/RF07)' },
    { name: 'Fornecedores', description: 'Fornecedores (RF07)' },
    { name: 'Estoque', description: 'Produtos, entradas e alertas (RF07–RF09/RF23)' },
    { name: 'Agenda', description: 'Agendamentos e bloqueios (RF04–RF06/RF30)' },
    { name: 'PDV', description: 'Vendas e estornos (RF10/RF25/RF26)' },
    { name: 'Pacotes', description: 'Planos recorrentes (RF29)' },
    { name: 'Avaliações', description: 'Avaliação de atendimento (RF28)' },
    { name: 'Painel', description: 'Indicadores gerenciais (RF14/RF15)' },
    { name: 'Notificações', description: 'Lembretes e alertas (RF12/RF13/RF22)' },
    { name: 'Relatórios', description: 'Exportação PDF/CSV/Excel (RF27)' },
    { name: 'Configurações', description: 'Dados e parâmetros da unidade' },
    { name: 'Sistema', description: 'Saúde e métricas (RNF17)' },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      cookieAuth: { type: 'apiKey', in: 'cookie', name: config.http.cookie.name },
    },
    schemas: {
      Erro: {
        type: 'object',
        properties: {
          erro: { type: 'string' },
          codigo: { type: 'string', nullable: true },
          detalhe: { type: 'string', nullable: true },
          campos: { type: 'array', items: { type: 'object', properties: { campo: { type: 'string' }, mensagem: { type: 'string' } } } },
        },
      },
      Sessao: {
        type: 'object',
        properties: {
          token: { type: 'string' },
          refreshToken: { type: 'string' },
          expiraEmSegundos: { type: 'integer', example: 1800 },
          refreshExpiraEm: { type: 'string', format: 'date-time' },
          usuario: ref('Usuario'),
        },
      },
      Usuario: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nome: { type: 'string' },
          email: { type: 'string' },
          perfil: { type: 'string', enum: ['GESTOR', 'COLABORADOR', 'CLIENTE'] },
          telefone: { type: 'string', nullable: true },
          petshopId: { type: 'integer' },
        },
      },
      Cliente: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nome: { type: 'string' },
          email: { type: 'string' },
          telefone: { type: 'string', nullable: true },
          cpf: { type: 'string', nullable: true },
          endereco: { type: 'string', nullable: true },
          pontosFidelidade: { type: 'integer' },
          ativo: { type: 'boolean' },
          consentLgpd: { type: 'boolean' },
          pets: { type: 'array', items: ref('Pet') },
        },
      },
      Pet: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          clienteId: { type: 'integer' },
          clienteNome: { type: 'string' },
          nome: { type: 'string' },
          especie: { type: 'string' },
          raca: { type: 'string', nullable: true },
          porte: { type: 'string', nullable: true },
          idade: { type: 'integer', nullable: true },
          observacoesSaude: { type: 'string', nullable: true },
          ativo: { type: 'boolean' },
        },
      },
      Agendamento: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          petId: { type: 'integer' },
          petNome: { type: 'string' },
          clienteId: { type: 'integer' },
          clienteNome: { type: 'string' },
          colaboradorId: { type: 'integer' },
          colaboradorNome: { type: 'string' },
          servicoId: { type: 'integer' },
          servicoNome: { type: 'string' },
          dataHora: { type: 'string', example: '2026-09-12T09:00' },
          dataHoraFim: { type: 'string', example: '2026-09-12T10:00' },
          status: { type: 'string', enum: ['confirmado', 'cancelado', 'concluído'] },
          valor: { type: 'number', format: 'float' },
        },
      },
      Produto: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          nome: { type: 'string' },
          categoria: { type: 'string' },
          quantidadeEstoque: { type: 'integer' },
          estoqueMinimo: { type: 'integer' },
          validade: { type: 'string', nullable: true },
          preco: { type: 'number', format: 'float' },
          fornecedorNome: { type: 'string', nullable: true },
          abaixoMinimo: { type: 'boolean' },
          validadeProxima: { type: 'boolean' },
        },
      },
      Venda: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          dataHora: { type: 'string' },
          clienteId: { type: 'integer', nullable: true },
          clienteNome: { type: 'string', nullable: true },
          valorTotal: { type: 'number', format: 'float' },
          desconto: { type: 'number', format: 'float' },
          status: { type: 'string', enum: ['finalizada', 'estornada'] },
          itens: { type: 'array', items: ref('ItemVenda') },
          pagamentos: { type: 'array', items: ref('Pagamento') },
        },
      },
      ItemVenda: {
        type: 'object',
        properties: {
          produtoId: { type: 'integer' },
          nome: { type: 'string' },
          quantidade: { type: 'integer' },
          precoUnitario: { type: 'number' },
          subtotal: { type: 'number' },
        },
      },
      Pagamento: {
        type: 'object',
        properties: {
          formaPagamento: { type: 'string', enum: ['dinheiro', 'débito', 'crédito', 'PIX'] },
          valor: { type: 'number' },
        },
      },
      Notificacao: {
        type: 'object',
        properties: {
          id: { type: 'integer' },
          canal: { type: 'string', enum: ['e-mail', 'push'] },
          tipo: { type: 'string', example: 'lembrete_agendamento' },
          destinatario: { type: 'string' },
          mensagem: { type: 'string' },
          dataEnvio: { type: 'string' },
          enviadoEm: { type: 'string', nullable: true },
          tentativas: { type: 'integer' },
          lida: { type: 'boolean' },
        },
      },
    },
  },
  security: seguranca,
  paths: {
    // --- Auth ---------------------------------------------------------
    '/health': {
      get: { tags: ['Sistema'], summary: 'Estado da API e do banco', security: [], responses: respostas(200) },
    },
    '/auth/login': {
      post: {
        tags: ['Auth'], summary: 'Login (RF18)', security: [],
        requestBody: corpo({ type: 'object', required: ['email', 'senha'], properties: { email: { type: 'string' }, senha: { type: 'string' } } }),
        responses: { ...respostas(200), 200: { description: 'Sessão criada', content: { 'application/json': { schema: ref('Sessao') } } } },
      },
    },
    '/auth/refresh': {
      post: { tags: ['Auth'], summary: 'Renova a sessão (refresh token com rotação)', security: [], responses: respostas(200) },
    },
    '/auth/logout': {
      post: { tags: ['Auth'], summary: 'Encerra a sessão e limpa os cookies', responses: respostas(200) },
    },
    '/auth/cadastro': {
      post: {
        tags: ['Auth'], summary: 'Cadastro de tutor com consentimento LGPD (RF01/RNF11)', security: [],
        requestBody: corpo({ type: 'object', required: ['nome', 'email', 'senha', 'consentimento'], properties: { nome: { type: 'string' }, email: { type: 'string' }, senha: { type: 'string', minLength: 8 }, telefone: { type: 'string' }, endereco: { type: 'string' }, consentimento: { type: 'boolean' } } }),
        responses: respostas(201, 'Tutor cadastrado'),
      },
    },
    '/auth/recuperar-senha': {
      post: { tags: ['Auth'], summary: 'Solicita o link de redefinição (RF24)', security: [], requestBody: corpo({ type: 'object', required: ['email'], properties: { email: { type: 'string' } } }), responses: respostas(200) },
    },
    '/auth/redefinir-senha': {
      post: { tags: ['Auth'], summary: 'Consome o token e troca a senha (RF24)', security: [], requestBody: corpo({ type: 'object', required: ['token', 'senha'], properties: { token: { type: 'string' }, senha: { type: 'string' } } }), responses: respostas(200) },
    },
    '/auth/eu': { get: { tags: ['Auth'], summary: 'Sessão atual', responses: respostas(200) } },
    '/auth/senha': {
      patch: { tags: ['Auth'], summary: 'Troca a própria senha e revoga as outras sessões', requestBody: corpo({ type: 'object', required: ['senhaAtual', 'novaSenha'], properties: { senhaAtual: { type: 'string' }, novaSenha: { type: 'string' } } }), responses: respostas(200) },
    },

    // --- Clientes ------------------------------------------------------
    '/clientes': {
      get: {
        tags: ['Clientes'], summary: 'Lista tutores (paginado)',
        parameters: [...paginacaoParams, { name: 'busca', in: 'query', schema: { type: 'string' } }, { name: 'ativo', in: 'query', schema: { type: 'boolean' } }, { name: 'ordenar', in: 'query', schema: { type: 'string', enum: ['nome', 'email', 'pontos', 'criado'] } }],
        responses: { ...respostas(200), 200: { description: 'Lista paginada', content: { 'application/json': { schema: envelope(ref('Cliente')) } } } },
      },
      post: {
        tags: ['Clientes'], summary: 'Cadastra tutor (e opcionalmente o primeiro pet) (RF01/RF02)',
        requestBody: corpo({ type: 'object', required: ['nome', 'email'], properties: { nome: { type: 'string' }, email: { type: 'string' }, telefone: { type: 'string' }, endereco: { type: 'string' }, cpf: { type: 'string' }, senha: { type: 'string' }, consentimento: { type: 'boolean' }, pet: ref('Pet') } }),
        responses: respostas(201, 'Criado'),
      },
    },
    '/clientes/{id}': {
      get: { tags: ['Clientes'], summary: 'Ficha do tutor com pets', parameters: [idParam()], responses: respostas(200) },
      patch: { tags: ['Clientes'], summary: 'Atualiza dados do tutor (RF01)', parameters: [idParam()], responses: respostas(200) },
      delete: { tags: ['Clientes'], summary: 'Exclusão lógica — só GESTOR (RF03/RN03)', parameters: [idParam()], responses: respostas(200) },
    },
    '/clientes/{id}/reativar': {
      post: { tags: ['Clientes'], summary: 'Reativa tutor excluído — só GESTOR (RF03)', parameters: [idParam()], responses: respostas(200) },
    },
    '/clientes/{id}/fidelidade': {
      get: { tags: ['Clientes'], summary: 'Saldo e extrato de pontos (RF20)', parameters: [idParam()], responses: respostas(200) },
      post: { tags: ['Clientes'], summary: 'Credita/debita pontos — RN07 imposta pelo banco', parameters: [idParam()], requestBody: corpo({ type: 'object', required: ['tipo', 'pontos'], properties: { tipo: { type: 'string', enum: ['credito', 'debito'] }, pontos: { type: 'integer' }, descricao: { type: 'string' } } }), responses: respostas(201) },
    },
    '/fidelidade': { get: { tags: ['Clientes'], summary: 'Saldo do próprio tutor (CLIENTE)', responses: respostas(200) } },

    // --- Pets ----------------------------------------------------------
    '/pets': {
      get: { tags: ['Pets'], summary: 'Lista pets (paginado)', parameters: [...paginacaoParams, { name: 'clienteId', in: 'query', schema: { type: 'integer' } }, { name: 'busca', in: 'query', schema: { type: 'string' } }], responses: respostas(200) },
      post: { tags: ['Pets'], summary: 'Cadastra pet (RF02)', requestBody: corpo(ref('Pet')), responses: respostas(201) },
    },
    '/pets/meus': { get: { tags: ['Pets'], summary: 'Pets do próprio tutor (CLIENTE)', parameters: paginacaoParams, responses: respostas(200) } },
    '/pets/{id}': {
      get: { tags: ['Pets'], summary: 'Detalhe do pet', parameters: [idParam()], responses: respostas(200) },
      patch: { tags: ['Pets'], summary: 'Atualiza pet (RF03)', parameters: [idParam()], responses: respostas(200) },
      delete: { tags: ['Pets'], summary: 'Exclusão lógica — só GESTOR', parameters: [idParam()], responses: respostas(200) },
    },
    '/pets/{id}/historico': {
      get: { tags: ['Pets'], summary: 'Linha do tempo de saúde (RF11/RF21)', parameters: [idParam()], responses: respostas(200) },
    },
    '/registros-saude': {
      get: { tags: ['Pets'], summary: 'Registros de saúde (paginado)', parameters: [...paginacaoParams, { name: 'petId', in: 'query', schema: { type: 'integer' } }, { name: 'tipo', in: 'query', schema: { type: 'string', enum: ['vacina', 'atendimento', 'banho', 'observação'] } }], responses: respostas(200) },
      post: { tags: ['Pets'], summary: 'Registra vacina/atendimento/banho/observação (RF11)', responses: respostas(201) },
    },
    '/registros-saude/vacinas-a-vencer': { get: { tags: ['Pets'], summary: 'Vacinas vencendo na janela configurada (RF13)', responses: respostas(200) } },
    '/registros-saude/{id}': {
      patch: { tags: ['Pets'], summary: 'Atualiza registro', parameters: [idParam()], responses: respostas(200) },
      delete: { tags: ['Pets'], summary: 'Remove registro — só GESTOR', parameters: [idParam()], responses: respostas(200) },
    },

    // --- Colaboradores --------------------------------------------------
    '/colaboradores': {
      get: { tags: ['Colaboradores'], summary: 'Lista a equipe com disponibilidade (RF16)', parameters: [...paginacaoParams, { name: 'cargo', in: 'query', schema: { type: 'string', enum: ['ATENDENTE', 'TOSADOR', 'BANHISTA', 'VETERINARIO'] } }], responses: respostas(200) },
      post: { tags: ['Colaboradores'], summary: 'Cadastra colaborador — só GESTOR', responses: respostas(201) },
    },
    '/colaboradores/{id}': {
      get: { tags: ['Colaboradores'], summary: 'Detalhe do colaborador', parameters: [idParam()], responses: respostas(200) },
      patch: { tags: ['Colaboradores'], summary: 'Atualiza colaborador — só GESTOR', parameters: [idParam()], responses: respostas(200) },
      delete: { tags: ['Colaboradores'], summary: 'Inativa colaborador — só GESTOR', parameters: [idParam()], responses: respostas(200) },
    },
    '/colaboradores/{id}/disponibilidade': {
      get: { tags: ['Colaboradores'], summary: 'Grade semanal de horários', parameters: [idParam()], responses: respostas(200) },
      put: { tags: ['Colaboradores'], summary: 'Substitui a grade semanal (RN08) — só GESTOR', parameters: [idParam()], responses: respostas(200) },
    },

    // --- Serviços e fornecedores ----------------------------------------
    '/servicos': {
      get: { tags: ['Serviços'], summary: 'Lista serviços', parameters: paginacaoParams, responses: respostas(200) },
      post: { tags: ['Serviços'], summary: 'Cadastra serviço — só GESTOR', responses: respostas(201) },
    },
    '/servicos/{id}': {
      patch: { tags: ['Serviços'], summary: 'Atualiza serviço — só GESTOR', parameters: [idParam()], responses: respostas(200) },
      delete: { tags: ['Serviços'], summary: 'Inativa serviço — só GESTOR', parameters: [idParam()], responses: respostas(200) },
    },
    '/fornecedores': {
      get: { tags: ['Fornecedores'], summary: 'Lista fornecedores', parameters: paginacaoParams, responses: respostas(200) },
      post: { tags: ['Fornecedores'], summary: 'Cadastra fornecedor — só GESTOR', responses: respostas(201) },
    },
    '/fornecedores/{id}': {
      patch: { tags: ['Fornecedores'], summary: 'Atualiza fornecedor — só GESTOR', parameters: [idParam()], responses: respostas(200) },
      delete: { tags: ['Fornecedores'], summary: 'Inativa fornecedor — só GESTOR', parameters: [idParam()], responses: respostas(200) },
    },

    // --- Estoque ---------------------------------------------------------
    '/produtos': {
      get: {
        tags: ['Estoque'], summary: 'Lista produtos com saldo, alertas e fornecedor (RF07/RF09/RF23)',
        parameters: [...paginacaoParams, { name: 'busca', in: 'query', schema: { type: 'string' } }, { name: 'categoria', in: 'query', schema: { type: 'string' } }, { name: 'abaixoMinimo', in: 'query', schema: { type: 'boolean' } }, { name: 'vencendoEm', in: 'query', schema: { type: 'integer', example: 30 } }],
        responses: { ...respostas(200), 200: { description: 'Lista paginada', content: { 'application/json': { schema: envelope(ref('Produto')) } } } },
      },
      post: { tags: ['Estoque'], summary: 'Cadastra produto com entrada inicial — só GESTOR (RF07)', responses: respostas(201) },
    },
    '/produtos/alertas': { get: { tags: ['Estoque'], summary: 'Alertas de estoque mínimo (RN05) e validade (RN09)', responses: respostas(200) } },
    '/produtos/{id}': {
      get: { tags: ['Estoque'], summary: 'Detalhe do produto', parameters: [idParam()], responses: respostas(200) },
      patch: { tags: ['Estoque'], summary: 'Edita metadados — só GESTOR', parameters: [idParam()], responses: respostas(200) },
      delete: { tags: ['Estoque'], summary: 'Inativa produto — só GESTOR (RF03)', parameters: [idParam()], responses: respostas(200) },
    },
    '/produtos/{id}/entrada': {
      post: { tags: ['Estoque'], summary: 'Entrada de mercadoria (gera lote e movimentação)', parameters: [idParam()], requestBody: corpo({ type: 'object', required: ['quantidade'], properties: { quantidade: { type: 'integer' }, validade: { type: 'string' }, custoUnitario: { type: 'number' }, observacao: { type: 'string' } } }), responses: respostas(200) },
    },
    '/produtos/{id}/ajuste': {
      post: { tags: ['Estoque'], summary: 'Ajuste de inventário — só GESTOR (RNF09)', parameters: [idParam()], responses: respostas(200) },
    },
    '/produtos/{id}/reativar': {
      post: { tags: ['Estoque'], summary: 'Reativa produto inativado — só GESTOR (RF03)', parameters: [idParam()], responses: respostas(200) },
    },
    '/produtos/{id}/movimentacoes': {
      get: { tags: ['Estoque'], summary: 'Histórico de movimentações (RF08/RNF09)', parameters: [idParam(), ...paginacaoParams], responses: respostas(200) },
    },

    // --- Agenda ----------------------------------------------------------
    '/agendamentos': {
      get: {
        tags: ['Agenda'], summary: 'Lista agendamentos com pet, tutor, serviço e profissional',
        parameters: [...paginacaoParams, { name: 'de', in: 'query', schema: { type: 'string', format: 'date' } }, { name: 'ate', in: 'query', schema: { type: 'string', format: 'date' } }, { name: 'status', in: 'query', schema: { type: 'string', enum: ['confirmado', 'cancelado', 'concluído'] } }, { name: 'colaboradorId', in: 'query', schema: { type: 'integer' } }, { name: 'clienteId', in: 'query', schema: { type: 'integer' } }],
        responses: { ...respostas(200), 200: { description: 'Lista paginada', content: { 'application/json': { schema: envelope(ref('Agendamento')) } } } },
      },
      post: {
        tags: ['Agenda'], summary: 'Cria agendamento — o banco recusa conflito (RN01) e indisponibilidade (RN08)',
        requestBody: corpo({ type: 'object', required: ['petId', 'servicoId', 'colaboradorId', 'dataHora'], properties: { petId: { type: 'integer' }, servicoId: { type: 'integer' }, colaboradorId: { type: 'integer' }, dataHora: { type: 'string', example: '2026-09-12T09:00' }, observacoes: { type: 'string' } } }),
        responses: { ...respostas(201), 409: { description: 'CONFLITO_AGENDA (RN01)' } },
      },
    },
    '/agendamentos/{id}': { get: { tags: ['Agenda'], summary: 'Detalhe do agendamento', parameters: [idParam()], responses: respostas(200) } },
    '/agendamentos/{id}/remarcar': {
      patch: { tags: ['Agenda'], summary: 'Remarca e revalida o conflito (RF06)', parameters: [idParam()], requestBody: corpo({ type: 'object', required: ['dataHora'], properties: { dataHora: { type: 'string' } } }), responses: respostas(200) },
    },
    '/agendamentos/{id}/cancelar': {
      patch: { tags: ['Agenda'], summary: 'Cancela e libera o horário (RN04)', parameters: [idParam()], responses: respostas(200) },
    },
    '/agendamentos/{id}/concluir': {
      patch: { tags: ['Agenda'], summary: 'Conclui o atendimento e credita fidelidade (RF17/RF20)', parameters: [idParam()], responses: respostas(200) },
    },
    '/agenda/dia': { get: { tags: ['Agenda'], summary: 'Agenda de um dia', parameters: [{ name: 'data', in: 'query', required: true, schema: { type: 'string', format: 'date' } }], responses: respostas(200) } },
    '/agenda/horarios-livres': {
      get: { tags: ['Agenda'], summary: 'Horários livres do profissional (RF04/RF05)', parameters: [{ name: 'colaboradorId', in: 'query', required: true, schema: { type: 'integer' } }, { name: 'data', in: 'query', required: true, schema: { type: 'string', format: 'date' } }, { name: 'duracao', in: 'query', schema: { type: 'integer' } }], responses: respostas(200) },
    },
    '/bloqueios': {
      get: { tags: ['Agenda'], summary: 'Lista bloqueios de agenda (RF30)', parameters: paginacaoParams, responses: respostas(200) },
      post: { tags: ['Agenda'], summary: 'Cria bloqueio — recusado se houver atendimento confirmado (RN12)', responses: respostas(201) },
    },
    '/bloqueios/{id}': { delete: { tags: ['Agenda'], summary: 'Remove bloqueio', parameters: [idParam()], responses: respostas(200) } },

    // --- Autoatendimento do tutor (RF01/RF02/RF20/RF21) ------------------
    '/profissionais': {
      get: { tags: ['Autoatendimento'], summary: 'Vitrine da equipe para escolher quem atende (sem contato) — RNF11', responses: respostas(200) },
    },
    '/clientes/{id}/fidelidade': {
      get: { tags: ['Clientes'], summary: 'Saldo e extrato de pontos do tutor (RF20)', parameters: [idParam()], responses: respostas(200) },
      post: { tags: ['Clientes'], summary: 'Credita/debita pontos — RN07 imposta pelo banco', parameters: [idParam()], requestBody: corpo({ type: 'object', required: ['tipo', 'pontos'], properties: { tipo: { type: 'string', enum: ['credito', 'debito'] }, pontos: { type: 'integer' }, descricao: { type: 'string' } } }), responses: respostas(201) },
    },
    '/fidelidade': {
      get: { tags: ['Cliente'], summary: 'Saldo e extrato do próprio tutor (CLIENTE)', responses: respostas(200) },
    },
    '/fidelidade/resgate': {
      post: { tags: ['Cliente'], summary: 'Troca pontos do próprio tutor por benefício (RN07)', requestBody: corpo({ type: 'object', required: ['pontos', 'descricao'], properties: { pontos: { type: 'integer' }, descricao: { type: 'string' } } }), responses: respostas(201) },
    },

    // --- PDV --------------------------------------------------------------
    '/vendas': {
      get: { tags: ['PDV'], summary: 'Histórico de vendas com itens e pagamentos', parameters: [...paginacaoParams, { name: 'de', in: 'query', schema: { type: 'string', format: 'date' } }, { name: 'ate', in: 'query', schema: { type: 'string', format: 'date' } }, { name: 'status', in: 'query', schema: { type: 'string', enum: ['finalizada', 'estornada'] } }], responses: { ...respostas(200), 200: { description: 'Lista paginada', content: { 'application/json': { schema: envelope(ref('Venda')) } } } } },
      post: {
        tags: ['PDV'], summary: 'Registra venda com pagamento combinado (RF10/RF25) — baixa estoque (RN02)',
        requestBody: corpo({ type: 'object', required: ['itens', 'pagamentos'], properties: { clienteId: { type: 'integer', nullable: true }, agendamentoId: { type: 'integer', nullable: true }, desconto: { type: 'number' }, itens: { type: 'array', items: ref('ItemVenda') }, pagamentos: { type: 'array', items: ref('Pagamento') } } }),
        responses: { ...respostas(201), 201: { description: 'Venda registrada', content: { 'application/json': { schema: ref('Venda') } } } },
      },
    },
    '/vendas/{id}': { get: { tags: ['PDV'], summary: 'Comprovante da venda (RF10)', parameters: [idParam()], responses: respostas(200) } },
    '/vendas/resumo': { get: { tags: ['PDV'], summary: 'Totais do período (RF14)', responses: respostas(200) } },
    '/vendas/{id}/estornar': {
      post: { tags: ['PDV'], summary: 'Estorna e devolve o estoque — só GESTOR, dentro do prazo (RN11/RF26)', parameters: [idParam()], responses: { ...respostas(200), 403: { description: 'PERMISSAO_NEGADA (RN11) ou prazo expirado' } } },
    },

    // --- Pacotes / avaliações ---------------------------------------------
    '/pacotes': {
      get: { tags: ['Pacotes'], summary: 'Lista planos (RF29)', parameters: paginacaoParams, responses: respostas(200) },
      post: { tags: ['Pacotes'], summary: 'Cria plano — só GESTOR', responses: respostas(201) },
    },
    '/pacotes/{id}': {
      patch: { tags: ['Pacotes'], summary: 'Atualiza plano — só GESTOR', parameters: [idParam()], responses: respostas(200) },
      delete: { tags: ['Pacotes'], summary: 'Inativa plano — só GESTOR', parameters: [idParam()], responses: respostas(200) },
    },
    '/assinaturas': {
      get: { tags: ['Pacotes'], summary: 'Lista assinaturas (o CLIENTE vê as próprias)', parameters: paginacaoParams, responses: respostas(200) },
      post: { tags: ['Pacotes'], summary: 'Assina plano para um pet do tutor', responses: respostas(201) },
    },
    '/assinaturas/{id}/cancelar': { post: { tags: ['Pacotes'], summary: 'Cancela a assinatura — só GESTOR', parameters: [idParam()], responses: respostas(200) } },
    '/avaliacoes': {
      get: { tags: ['Avaliações'], summary: 'Lista avaliações com pet, serviço e nota', parameters: paginacaoParams, responses: respostas(200) },
      post: {
        tags: ['Avaliações'], summary: 'Avalia um atendimento concluído (RF28) — só o próprio tutor',
        requestBody: corpo({ type: 'object', required: ['agendamentoId', 'nota'], properties: { agendamentoId: { type: 'integer' }, nota: { type: 'integer', minimum: 1, maximum: 5 }, comentario: { type: 'string' } } }),
        responses: respostas(201),
      },
    },
    '/avaliacoes/resumo': { get: { tags: ['Avaliações'], summary: 'Média e distribuição das notas', responses: respostas(200) } },
    '/avaliacoes/{id}': { delete: { tags: ['Avaliações'], summary: 'Remove avaliação — só GESTOR', parameters: [idParam()], responses: respostas(200) } },

    // --- Painel / notificações / relatórios --------------------------------
    '/dashboard': {
      get: {
        tags: ['Painel'], summary: 'Faturamento (dia/semana/mês), série de 30 dias, serviços mais vendidos, ocupação e alertas (RF14/RF15)',
        parameters: [{ name: 'de', in: 'query', schema: { type: 'string', format: 'date' } }, { name: 'ate', in: 'query', schema: { type: 'string', format: 'date' } }],
        responses: respostas(200),
      },
    },
    '/notificacoes': {
      get: { tags: ['Notificações'], summary: 'Fila e histórico de avisos (RF12/RF13)', parameters: [...paginacaoParams, { name: 'lida', in: 'query', schema: { type: 'boolean' } }, { name: 'pendentes', in: 'query', schema: { type: 'boolean' } }], responses: { ...respostas(200), 200: { description: 'Lista paginada', content: { 'application/json': { schema: envelope(ref('Notificacao')) } } } } },
    },
    '/notificacoes/contadores': { get: { tags: ['Notificações'], summary: 'Não lidas, pendentes e falhas', responses: respostas(200) } },
    '/notificacoes/{id}/lida': { patch: { tags: ['Notificações'], summary: 'Marca como lida', parameters: [idParam()], responses: respostas(200) } },
    '/notificacoes/marcar-todas-lidas': { post: { tags: ['Notificações'], summary: 'Marca todas como lidas', responses: respostas(200) } },
    '/notificacoes/gerar': { post: { tags: ['Notificações'], summary: 'Força um ciclo de geração e entrega dos avisos — só GESTOR', responses: respostas(200) } },
    '/relatorios': { get: { tags: ['Relatórios'], summary: 'Histórico de exportações geradas (RF27)', parameters: paginacaoParams, responses: respostas(200) } },
    '/relatorios/exportar': {
      get: {
        tags: ['Relatórios'], summary: 'Baixa o relatório em PDF, CSV ou Excel (RF27)',
        parameters: [
          { name: 'tipo', in: 'query', required: true, schema: { type: 'string', enum: ['vendas', 'agendamentos', 'estoque', 'financeiro'] } },
          { name: 'formato', in: 'query', schema: { type: 'string', enum: ['PDF', 'CSV', 'Excel'], default: 'CSV' } },
          { name: 'de', in: 'query', schema: { type: 'string', format: 'date' } },
          { name: 'ate', in: 'query', schema: { type: 'string', format: 'date' } },
        ],
        responses: { ...respostas(200, 'Arquivo no formato pedido'), 200: { description: 'Arquivo', content: { 'application/pdf': {}, 'text/csv': {} } } },
      },
    },
    '/relatorios/previa': { get: { tags: ['Relatórios'], summary: 'Prévia em JSON do relatório (sem baixar arquivo)', responses: respostas(200) } },
    '/petshop': {
      get: { tags: ['Configurações'], summary: 'Dados e parâmetros da unidade', responses: respostas(200) },
      patch: { tags: ['Configurações'], summary: 'Atualiza parâmetros (prazo de estorno, antecedências, pontos) — só GESTOR', responses: respostas(200) },
    },
    '/petshop/usuarios': { get: { tags: ['Configurações'], summary: 'Usuários da unidade e último acesso — só GESTOR', responses: respostas(200) } },
    '/metrics': { get: { tags: ['Sistema'], summary: 'Métricas de processo e requisição (token ou GESTOR) — RNF17', responses: respostas(200) } },
    '/health/detalhado': { get: { tags: ['Sistema'], summary: 'Saúde com latência do banco, pool e fila — só GESTOR', responses: respostas(200) } },
  },
}
