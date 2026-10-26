// ===== Cliente da API PetPlus =====
//
// Ponte única entre a interface e o backend. Nada mais no front fala com a
// rede: as telas leem o estado de `src/data.ts`, e é `data.ts` que chama
// estes módulos.
//
// Decisões de segurança que valem a pena registrar:
//
//  * **Nenhum token em JavaScript.** A sessão vive em cookies `httpOnly`
//    gravados pelo servidor no login. Sem token no `localStorage`, um XSS
//    não consegue roubar a sessão — o script da página não enxerga o cookie.
//  * **`credentials: 'include'`** para o cookie viajar junto, e a base é
//    relativa (`/api`) para que front e API fiquem na mesma origem: cookie
//    de primeira parte, sem CORS e sem `SameSite=None`.
//  * **Renovação automática.** Um 401 dispara `POST /auth/refresh` uma única
//    vez (as chamadas concorrentes compartilham a mesma promise) e a
//    requisição original é repetida. O refresh token gira a cada uso, então
//    uma sessão expirada não derruba o usuário no meio do trabalho.

const API_URL = (import.meta.env.VITE_API_URL as string | undefined) ?? '/api'

/** Erro da API já traduzido, com o status HTTP e o código de negócio. */
export class ApiError extends Error {
  status: number
  codigo?: string
  detalhe?: string
  /** Campos reprovados, quando o erro é de validação (422). */
  campos?: { campo: string; mensagem: string }[]

  constructor(mensagem: string, status: number, codigo?: string, detalhe?: string, campos?: any) {
    super(mensagem)
    this.name = 'ApiError'
    this.status = status
    this.codigo = codigo
    this.detalhe = detalhe
    this.campos = campos
  }

  /** Mensagem pronta para o usuário: o detalhe do servidor é mais útil. */
  get mensagem() {
    return this.detalhe ? `${this.message} ${this.detalhe}` : this.message
  }
}

type Metodo = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

type Opcoes = {
  metodo?: Metodo
  corpo?: unknown
  /** Sem renovação de sessão e sem repetir em 401 — login, cadastro, refresh. */
  anonimo?: boolean
  sinal?: AbortSignal
}

/** Serializa a query string omitindo vazios (`?busca=` não é filtro). */
export function qs(params: Record<string, unknown> = {}) {
  const partes = Object.entries(params)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
  return partes.length ? `?${partes.join('&')}` : ''
}

// ---------------------------------------------------------------------
// Renovação de sessão (uma por vez)
// ---------------------------------------------------------------------

let renovacao: Promise<boolean> | null = null

/**
 * Troca o refresh token por um access token novo.
 *
 * Se duas telas receberem 401 ao mesmo tempo, as duas esperam a MESMA
 * renovação: sem isso, a segunda usaria um refresh token já rotacionado e o
 * servidor derrubaria a sessão inteira (proteção contra reuso).
 */
function renovarSessao(): Promise<boolean> {
  renovacao ??= (async () => {
    try {
      await chamar('/auth/refresh', { metodo: 'POST', anonimo: true })
      return true
    } catch {
      return false
    } finally {
      renovacao = null
    }
  })()
  return renovacao
}

// ---------------------------------------------------------------------
// Núcleo HTTP
// ---------------------------------------------------------------------

async function chamar<T>(caminho: string, { metodo = 'GET', corpo, sinal }: Opcoes): Promise<T> {
  let resposta: Response
  try {
    resposta = await fetch(API_URL + caminho, {
      method: metodo,
      credentials: 'include',
      headers: corpo !== undefined ? { 'Content-Type': 'application/json' } : undefined,
      body: corpo !== undefined ? JSON.stringify(corpo) : undefined,
      signal: sinal,
    })
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err
    throw new ApiError(
      'Não foi possível falar com o servidor. A API está no ar em ' + API_URL + '?',
      0,
      'SEM_CONEXAO',
    )
  }

  if (resposta.status === 204) return undefined as T

  const texto = await resposta.text()
  let dados: any = null
  if (texto) {
    try {
      dados = JSON.parse(texto)
    } catch {
      dados = texto
    }
  }

  if (!resposta.ok) {
    throw new ApiError(
      dados?.erro ?? `Erro ${resposta.status}`,
      resposta.status,
      dados?.codigo,
      dados?.detalhe,
      dados?.campos,
    )
  }

  return dados as T
}

async function requisitar<T>(caminho: string, opcoes: Opcoes = {}): Promise<T> {
  try {
    return await chamar<T>(caminho, opcoes)
  } catch (err) {
    // Token expirado (30 min): renova e repete a MESMA chamada, uma vez.
    // O usuário não vê nada acontecer.
    if (err instanceof ApiError && err.status === 401 && !opcoes.anonimo) {
      if (await renovarSessao()) return chamar<T>(caminho, opcoes)
    }
    throw err
  }
}

/** Paginação do backend: `limite` máximo aceito por página. */
const LIMITE_MAX = 100
/** Teto de páginas por coleção — evita laço infinito se o total mudar. */
const PAGINAS_MAX = 25

/**
 * Busca a coleção inteira, página a página.
 *
 * O backend sempre pagina (nada de "devolve a tabela toda"), então a tela
 * que precisa do conjunto completo pede as páginas em sequência. As
 * requisições de uma página são paralelas à medida que o total é
 * descoberto, e o laço para quando o servidor diz que acabou.
 */
export async function buscarTudo<T>(
  caminho: string,
  params: Record<string, unknown> = {},
  sinal?: AbortSignal,
): Promise<T[]> {
  const primeira = await requisitar<{ dados: T[]; pagina: number; paginas: number }>(
    caminho + qs({ ...params, pagina: 1, limite: LIMITE_MAX }),
    { sinal },
  )
  const linhas = [...(primeira.dados ?? [])]
  const paginas = Math.min(Number(primeira.paginas ?? 1), PAGINAS_MAX)

  for (let pagina = 2; pagina <= paginas; pagina += 1) {
    const proxima = await requisitar<{ dados: T[] }>(
      caminho + qs({ ...params, pagina, limite: LIMITE_MAX }),
      { sinal },
    )
    linhas.push(...(proxima.dados ?? []))
  }
  return linhas
}

// =====================================================================
// AUTENTICAÇÃO
// =====================================================================

export type UsuarioLogado = {
  id: number
  nome: string
  email: string
  perfil: 'GESTOR' | 'COLABORADOR' | 'CLIENTE'
  petshopId: number
}

export const auth = {
  /** Sessão atual — 401 quando não há cookie válido (o client já tenta renovar). */
  sessao: () => requisitar<UsuarioLogado>('/auth/eu'),

  login: (email: string, senha: string) =>
    requisitar<{ usuario: UsuarioLogado }>('/auth/login', {
      metodo: 'POST',
      anonimo: true,
      corpo: { email, senha },
    }),

  cadastro: (dados: {
    nome: string
    email: string
    senha: string
    telefone?: string
    endereco?: string
    consentimento: boolean
  }) =>
    requisitar<{ usuario: UsuarioLogado }>('/auth/cadastro', {
      metodo: 'POST',
      anonimo: true,
      corpo: dados,
    }),

  logout: () => requisitar<{ encerrada: boolean }>('/auth/logout', { metodo: 'POST' }),

  recuperarSenha: (email: string) =>
    requisitar<{ enviado: boolean; token?: string }>('/auth/recuperar-senha', {
      metodo: 'POST',
      anonimo: true,
      corpo: { email },
    }),

  redefinirSenha: (token: string, senha: string) =>
    requisitar<{ redefinida: boolean }>('/auth/redefinir-senha', {
      metodo: 'POST',
      anonimo: true,
      corpo: { token, senha },
    }),

  trocarSenha: (senhaAtual: string, novaSenha: string) =>
    requisitar<{ trocada: boolean }>('/auth/senha', {
      metodo: 'PATCH',
      corpo: { senhaAtual, novaSenha },
    }),
}

// =====================================================================
// CADASTROS
// =====================================================================

export type Listagem<K> = { dados: K[]; pagina: number; limite: number; total: number; paginas: number }

export const clientes = {
  listar: (params: Record<string, unknown> = {}) => buscarTudo<any>('/clientes', params),
  buscar: (id: number) => requisitar<any>(`/clientes/${id}`),
  criar: (dados: {
    nome: string
    email: string
    telefone?: string
    cpf?: string
    endereco?: string
    senha?: string
    consentimento?: boolean
    pet?: { nome: string; especie?: string; raca?: string; porte?: string; idade?: number; observacoesSaude?: string }
  }) => requisitar<any>('/clientes', { metodo: 'POST', corpo: dados }),

  atualizar: (id: number, dados: Record<string, unknown>) =>
    requisitar<any>(`/clientes/${id}`, { metodo: 'PATCH', corpo: dados }),

  inativar: (id: number) => requisitar<any>(`/clientes/${id}`, { metodo: 'DELETE' }),
  reativar: (id: number) => requisitar<any>(`/clientes/${id}/reativar`, { metodo: 'POST' }),

  fidelidade: (id: number) =>
    requisitar<{ clienteId: number; saldo: number; extrato: any[] }>(`/clientes/${id}/fidelidade`),

  movimentarPontos: (id: number, dados: { tipo: 'credito' | 'debito'; pontos: number; descricao?: string }) =>
    requisitar<{ id: number; saldo: number }>(`/clientes/${id}/fidelidade`, { metodo: 'POST', corpo: dados }),

  /** Saldo do próprio tutor (perfil CLIENTE). */
  minhaFidelidade: () =>
    requisitar<{ clienteId: number; saldo: number; extrato: any[] }>('/fidelidade'),

  /** O tutor troca os próprios pontos por um benefício (RF20/RN07). */
  resgatarPontos: (pontos: number, descricao: string) =>
    requisitar<{ id: number; saldo: number }>('/fidelidade/resgate', {
      metodo: 'POST',
      corpo: { pontos, descricao },
    }),
}

export const pets = {
  listar: (params: Record<string, unknown> = {}) => buscarTudo<any>('/pets', params),
  meus: () => buscarTudo<any>('/pets/meus'),
  buscar: (id: number) => requisitar<any>(`/pets/${id}`),
  historico: (id: number) =>
    requisitar<{ pet: any; registros: any[]; agendamentos: any[] }>(`/pets/${id}/historico`),

  criar: (dados: {
    clienteId: number
    nome: string
    especie?: string
    raca?: string
    porte?: string
    idade?: number
    dataNascimento?: string
    observacoesSaude?: string
  }) => requisitar<any>('/pets', { metodo: 'POST', corpo: dados }),

  atualizar: (id: number, dados: Record<string, unknown>) =>
    requisitar<any>(`/pets/${id}`, { metodo: 'PATCH', corpo: dados }),

  inativar: (id: number) => requisitar<any>(`/pets/${id}`, { metodo: 'DELETE' }),
}

export const registrosSaude = {
  listar: (params: Record<string, unknown> = {}) => buscarTudo<any>('/registros-saude', params),
  vacinasAVencer: () => requisitar<any[]>('/registros-saude/vacinas-a-vencer'),

  criar: (dados: {
    petId: number
    tipo: 'vacina' | 'atendimento' | 'banho' | 'observação'
    data?: string
    descricao: string
    proximoVencimento?: string
  }) => requisitar<any>('/registros-saude', { metodo: 'POST', corpo: dados }),

  atualizar: (id: number, dados: Record<string, unknown>) =>
    requisitar<any>(`/registros-saude/${id}`, { metodo: 'PATCH', corpo: dados }),

  remover: (id: number) => requisitar<any>(`/registros-saude/${id}`, { metodo: 'DELETE' }),
}

export const colaboradores = {
  listar: (params: Record<string, unknown> = {}) => buscarTudo<any>('/colaboradores', params),
  buscar: (id: number) => requisitar<any>(`/colaboradores/${id}`),
  disponibilidade: (id: number) => requisitar<any[]>(`/colaboradores/${id}/disponibilidade`),

  criar: (dados: {
    nome: string
    email: string
    telefone?: string
    senha?: string
    cargo: 'ATENDENTE' | 'TOSADOR' | 'BANHISTA' | 'VETERINARIO'
    matricula?: string
    disponibilidade?: { diaSemana: number; horaInicio: string; horaFim: string }[]
  }) => requisitar<any>('/colaboradores', { metodo: 'POST', corpo: dados }),

  atualizar: (id: number, dados: Record<string, unknown>) =>
    requisitar<any>(`/colaboradores/${id}`, { metodo: 'PATCH', corpo: dados }),

  inativar: (id: number) => requisitar<any>(`/colaboradores/${id}`, { metodo: 'DELETE' }),

  definirDisponibilidade: (
    id: number,
    janelas: { diaSemana: number; horaInicio: string; horaFim: string }[],
  ) => requisitar<any>(`/colaboradores/${id}/disponibilidade`, { metodo: 'PUT', corpo: { janelas } }),
}

export const servicos = {
  listar: (params: Record<string, unknown> = {}) => buscarTudo<any>('/servicos', params),
  criar: (dados: { nome: string; tipo: 'banho' | 'tosa' | 'consulta'; duracao: number; preco: number }) =>
    requisitar<any>('/servicos', { metodo: 'POST', corpo: dados }),

  atualizar: (id: number, dados: Record<string, unknown>) =>
    requisitar<any>(`/servicos/${id}`, { metodo: 'PATCH', corpo: dados }),

  remover: (id: number) => requisitar<any>(`/servicos/${id}`, { metodo: 'DELETE' }),
}

export const fornecedores = {
  listar: (params: Record<string, unknown> = {}) => buscarTudo<any>('/fornecedores', params),

  criar: (dados: { nome: string; cnpj: string; contato?: string; email?: string; telefone?: string; endereco?: string }) =>
    requisitar<any>('/fornecedores', { metodo: 'POST', corpo: dados }),

  atualizar: (id: number, dados: Record<string, unknown>) =>
    requisitar<any>(`/fornecedores/${id}`, { metodo: 'PATCH', corpo: dados }),

  inativar: (id: number) => requisitar<any>(`/fornecedores/${id}`, { metodo: 'DELETE' }),
}

// =====================================================================
// ESTOQUE
// =====================================================================

export const produtos = {
  listar: (params: Record<string, unknown> = {}) => buscarTudo<any>('/produtos', params),
  buscar: (id: number) => requisitar<any>(`/produtos/${id}`),
  movimentacoes: (id: number, params: Record<string, unknown> = {}) =>
    buscarTudo<any>(`/produtos/${id}/movimentacoes`, params),

  alertas: () =>
    requisitar<{ estoqueMinimo: any[]; validade: any[]; contadores: any }>('/produtos/alertas'),

  criar: (dados: {
    nome: string
    categoria: string
    sku?: string
    preco: number
    estoqueMinimo?: number
    quantidadeInicial?: number
    custoUnitario?: number
    validade?: string
    fornecedorId?: number
  }) => requisitar<any>('/produtos', { metodo: 'POST', corpo: dados }),

  atualizar: (id: number, dados: Record<string, unknown>) =>
    requisitar<any>(`/produtos/${id}`, { metodo: 'PATCH', corpo: dados }),

  entrada: (id: number, dados: { quantidade: number; validade?: string; custoUnitario?: number; observacao?: string }) =>
    requisitar<any>(`/produtos/${id}/entrada`, { metodo: 'POST', corpo: dados }),

  ajuste: (id: number, dados: { quantidade: number; motivo: string }) =>
    requisitar<any>(`/produtos/${id}/ajuste`, { metodo: 'POST', corpo: dados }),

  inativar: (id: number) => requisitar<any>(`/produtos/${id}`, { metodo: 'DELETE' }),
  reativar: (id: number) => requisitar<any>(`/produtos/${id}/reativar`, { metodo: 'POST' }),
}

// =====================================================================
// AGENDA
// =====================================================================

export const agendamentos = {
  listar: (params: Record<string, unknown> = {}) => buscarTudo<any>('/agendamentos', params),
  agendaDoDia: (data: string) => requisitar<any[]>(`/agenda/dia${qs({ data })}`),

  /** Horários livres do profissional no dia (RF04/RF05), já sem conflito nem bloqueio. */
  horariosLivres: (params: { colaboradorId: number; data: string; duracao?: number }) =>
    requisitar<{ data: string; colaboradorId: number; duracao: number; horarios: string[] }>(
      `/agenda/horarios-livres${qs(params)}`,
    ),

  /** Vitrine da equipe para o tutor escolher quem atende (sem dados de contato). */
  profissionais: () =>
    requisitar<{ id: number; nome: string; cargo: string; disponibilidade: string }[]>('/profissionais'),

  buscar: (id: number) => requisitar<any>(`/agendamentos/${id}`),

  criar: (dados: {
    petId: number
    servicoId: number
    colaboradorId: number
    dataHora: string
    valor?: number
    observacoes?: string
  }) => requisitar<any>('/agendamentos', { metodo: 'POST', corpo: dados }),

  remarcar: (id: number, dataHora: string) =>
    requisitar<any>(`/agendamentos/${id}/remarcar`, { metodo: 'PATCH', corpo: { dataHora } }),

  cancelar: (id: number, motivo?: string) =>
    requisitar<any>(`/agendamentos/${id}/cancelar`, { metodo: 'PATCH', corpo: { motivo } }),

  concluir: (id: number) => requisitar<any>(`/agendamentos/${id}/concluir`, { metodo: 'PATCH' }),
}

export const bloqueios = {
  listar: (params: Record<string, unknown> = {}) => buscarTudo<any>('/bloqueios', params),

  criar: (dados: { colaboradorId: number; dataInicio: string; dataFim: string; motivo: string }) =>
    requisitar<any>('/bloqueios', { metodo: 'POST', corpo: dados }),

  remover: (id: number) => requisitar<any>(`/bloqueios/${id}`, { metodo: 'DELETE' }),
}

// =====================================================================
// VENDAS (PDV)
// =====================================================================

export const vendas = {
  listar: (params: Record<string, unknown> = {}) => buscarTudo<any>('/vendas', params),
  buscar: (id: number) => requisitar<any>(`/vendas/${id}`),

  resumo: (params: Record<string, unknown> = {}) =>
    requisitar<{ quantidade: number; faturamento: number; estornado: number; ticketMedio: number }>(
      `/vendas/resumo${qs(params)}`,
    ),

  registrar: (dados: {
    clienteId?: number | null
    agendamentoId?: number | null
    desconto?: number
    itens: { produtoId: number; quantidade: number; precoUnitario?: number }[]
    pagamentos: { formaPagamento: 'dinheiro' | 'débito' | 'crédito' | 'PIX'; valor: number }[]
  }) => requisitar<{ id: number; valorTotal: number; status: string; itens: any[] }>('/vendas', {
    metodo: 'POST',
    corpo: dados,
  }),

  estornar: (id: number, motivo?: string) =>
    requisitar<any>(`/vendas/${id}/estornar`, { metodo: 'POST', corpo: { motivo } }),
}

// =====================================================================
// PACOTES, AVALIAÇÕES, PAINEL, NOTIFICAÇÕES E RELATÓRIOS
// =====================================================================

export const pacotes = {
  listar: (params: Record<string, unknown> = {}) => buscarTudo<any>('/pacotes', params),

  criar: (dados: { nome: string; periodicidade: string; preco: number; servicoIds?: number[] }) =>
    requisitar<any>('/pacotes', { metodo: 'POST', corpo: dados }),

  atualizar: (id: number, dados: Record<string, unknown>) =>
    requisitar<any>(`/pacotes/${id}`, { metodo: 'PATCH', corpo: dados }),

  inativar: (id: number) => requisitar<any>(`/pacotes/${id}`, { metodo: 'DELETE' }),
}

export const assinaturas = {
  listar: (params: Record<string, unknown> = {}) => buscarTudo<any>('/assinaturas', params),

  criar: (dados: { pacoteId: number; clienteId: number; petId: number }) =>
    requisitar<any>('/assinaturas', { metodo: 'POST', corpo: dados }),

  cancelar: (id: number) => requisitar<any>(`/assinaturas/${id}/cancelar`, { metodo: 'POST' }),
}

export const avaliacoes = {
  listar: (params: Record<string, unknown> = {}) => buscarTudo<any>('/avaliacoes', params),

  resumo: () =>
    requisitar<{ media: number; total: number; distribuicao: Record<string, number> }>('/avaliacoes/resumo'),

  criar: (dados: { agendamentoId: number; nota: number; comentario?: string }) =>
    requisitar<any>('/avaliacoes', { metodo: 'POST', corpo: dados }),

  remover: (id: number) => requisitar<any>(`/avaliacoes/${id}`, { metodo: 'DELETE' }),
}

export const dashboard = {
  resumo: () => requisitar<any>('/dashboard'),
}

export const notificacoes = {
  listar: (params: Record<string, unknown> = {}) => buscarTudo<any>('/notificacoes', params),
  contadores: () => requisitar<{ naoLidas: number; total: number }>('/notificacoes/contadores'),
  marcarLida: (id: number) => requisitar<any>(`/notificacoes/${id}/lida`, { metodo: 'PATCH' }),
  marcarTodasLidas: () =>
    requisitar<{ atualizadas: number }>('/notificacoes/marcar-todas-lidas', { metodo: 'POST' }),
  gerar: () => requisitar<{ geradas: number }>('/notificacoes/gerar', { metodo: 'POST' }),
}

export const relatorios = {
  listar: (params: Record<string, unknown> = {}) => buscarTudo<any>('/relatorios', params),

  previa: (params: { tipo: string; de?: string; ate?: string }) =>
    requisitar<{ colunas: any[]; linhas: any[]; totais: any; geradoEm: string; periodo: string }>(
      `/relatorios/previa${qs(params)}`,
    ),

  /** URL do arquivo exportado — o navegador baixa usando o mesmo cookie de sessão. */
  urlExportacao: (params: { tipo: string; formato: string; de?: string; ate?: string }) =>
    `${API_URL}/relatorios/exportar${qs(params)}`,
}

export const petshop = {
  buscar: () => requisitar<any>('/petshop'),
  atualizar: (dados: Record<string, unknown>) => requisitar<any>('/petshop', { metodo: 'PATCH', corpo: dados }),
  usuarios: (params: Record<string, unknown> = {}) => buscarTudo<any>('/petshop/usuarios', params),
}

export const sistema = {
  health: () => requisitar<any>('/health'),
  healthDetalhado: () => requisitar<any>('/health/detalhado'),
  metricas: () => chamar<any>('/metrics', { metodo: 'GET' }),
}

/** Ponto de entrada único: `api.vendas.registrar(...)`, `api.pets.listar()`… */
export const api = {
  auth, clientes, pets, registrosSaude, colaboradores, servicos, fornecedores,
  produtos, agendamentos, bloqueios, vendas, pacotes, assinaturas, avaliacoes,
  dashboard, notificacoes, relatorios, petshop, sistema,
}
