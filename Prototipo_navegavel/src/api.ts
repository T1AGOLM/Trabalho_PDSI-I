// ===== Cliente da API PetPlus =====
// Ponte única entre o protótipo e o backend. Nada mais no front fala com
// a rede: todas as telas continuam importando `db` de `src/data.ts`, e é
// aqui que a origem dos dados passa a ser o PostgreSQL.

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3333/api'

/** Chave do token no localStorage. */
const TOKEN_KEY = 'petplus_token'

/** Erro da API já traduzido, com o status HTTP e o código de negócio. */
export class ApiError extends Error {
  status: number
  codigo?: string
  detalhe?: string
  constructor(mensagem: string, status: number, codigo?: string, detalhe?: string) {
    super(mensagem)
    this.name = 'ApiError'
    this.status = status
    this.codigo = codigo
    this.detalhe = detalhe
  }
}

export const getToken = () => localStorage.getItem(TOKEN_KEY)
export const setToken = (t: string | null) =>
  t ? localStorage.setItem(TOKEN_KEY, t) : localStorage.removeItem(TOKEN_KEY)

type Opcoes = {
  metodo?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'
  body?: unknown
  /** Sem token — usado no login e no cadastro. */
  anonimo?: boolean
}

async function request<T>(caminho: string, opts: Opcoes = {}): Promise<T> {
  const { metodo = 'GET', body, anonimo } = opts
  const token = anonimo ? null : getToken()

  let resposta: Response
  try {
    resposta = await fetch(API_URL + caminho, {
      method: metodo,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    })
  } catch {
    throw new ApiError(
      'Não foi possível falar com o servidor. A API está rodando em ' + API_URL + '?',
      0,
      'SEM_CONEXAO',
    )
  }

  if (resposta.status === 204) return undefined as T

  const texto = await resposta.text()
  let dados: any = null
  if (texto) {
    try { dados = JSON.parse(texto) } catch { dados = texto }
  }

  if (!resposta.ok) {
    // Token expirado ou inválido: limpa a sessão para voltar ao login em
    // vez de deixar a interface num estado quebrado.
    if (resposta.status === 401 && !anonimo) setToken(null)
    throw new ApiError(
      dados?.erro ?? `Erro ${resposta.status}`,
      resposta.status,
      dados?.codigo,
      dados?.detalhe,
    )
  }

  return dados as T
}

// =====================================================================
// AUTENTICAÇÃO
// =====================================================================

export type Sessao = {
  token: string
  usuario: { id: number; nome: string; email: string; perfil: string; telefone?: string }
}

export const auth = {
  login: (email: string, senha: string) =>
    request<Sessao>('/auth/login', { metodo: 'POST', anonimo: true, body: { email, senha } }),

  cadastro: (dados: {
    nome: string; email: string; senha: string
    telefone?: string; endereco?: string; consentimento: boolean
  }) => request<Sessao>('/auth/cadastro', { metodo: 'POST', anonimo: true, body: dados }),

  recuperarSenha: (email: string) =>
    request<{ enviado: boolean; token?: string }>('/auth/recuperar-senha', {
      metodo: 'POST', anonimo: true, body: { email },
    }),

  redefinirSenha: (token: string, senha: string) =>
    request<{ redefinida: boolean }>('/auth/redefinir-senha', {
      metodo: 'POST', anonimo: true, body: { token, senha },
    }),
}

// =====================================================================
// DADOS
// =====================================================================

/** Snapshot completo do tenant — o mesmo formato do antigo `db` em memória. */
export const bootstrap = () => request<any>('/bootstrap')

export const agendamentos = {
  listar: () => request<any[]>('/agendamentos'),
  criar: (dados: { petId: number; servicoId: number; colaboradorId: number; dataHora: string }) =>
    request<{ id: number; status: string }>('/agendamentos', { metodo: 'POST', body: dados }),
  remarcar: (id: number, dataHora: string) =>
    request<{ id: number }>(`/agendamentos/${id}/remarcar`, { metodo: 'PATCH', body: { dataHora } }),
  cancelar: (id: number, motivo?: string) =>
    request<{ id: number }>(`/agendamentos/${id}/cancelar`, { metodo: 'PATCH', body: { motivo } }),
}

export const vendas = {
  registrar: (dados: {
    clienteId?: number | null
    itens: { produtoId: number; quantidade: number; precoUnitario?: number }[]
    pagamentos: { formaPagamento: string; valor: number }[]
  }) => request<{ id: number; valor_total: number; status: string }>('/vendas', {
    metodo: 'POST', body: dados,
  }),
  estornar: (id: number, motivo?: string) =>
    request<{ id: number; status: string }>(`/vendas/${id}/estornar`, {
      metodo: 'POST', body: { motivo },
    }),
}

export const produtos = {
  listar: () => request<any[]>('/produtos'),
  criar: (dados: {
    nome: string; categoria: string; preco: number
    estoqueMinimo?: number; quantidadeInicial?: number; validade?: string; fornecedorId?: number | null
  }) => request<any>('/produtos', { metodo: 'POST', body: dados }),
  atualizar: (id: number, dados: Partial<{
    nome: string; categoria: string; preco: number; estoqueMinimo: number; validade: string
  }>) => request<any>(`/produtos/${id}`, { metodo: 'PATCH', body: dados }),
  entrada: (id: number, quantidade: number, observacao?: string) =>
    request<any>(`/produtos/${id}/entrada`, { metodo: 'POST', body: { quantidade, observacao } }),
  remover: (id: number) => request<any>(`/produtos/${id}`, { metodo: 'DELETE' }),
  alertas: () => request<{ estoque: any[]; validade: any[] }>('/produtos/alertas'),
}

export const clientes = {
  criar: (dados: {
    nome: string; email: string; telefone?: string; endereco?: string
  }) => request<any>('/clientes', { metodo: 'POST', body: dados }),
}

/** Ponto de entrada único: `api.login(...)`, `api.vendas.registrar(...)`… */
export const api = { auth, bootstrap, agendamentos, vendas, produtos, clientes }