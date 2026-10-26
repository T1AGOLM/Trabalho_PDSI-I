import type {
  Agendamento, Avaliacao, BloqueioAgenda, Cliente, Colaborador, Fornecedor,
  Notificacao, PacoteServico, PerfilUsuario, Pet, Produto, RegistroSaude,
  Relatorio, Servico, Venda,
} from './types'
import { api, ApiError } from './api'

// ===== Estado do PetPlus — servido pelo PostgreSQL =====
//
// `db` é o cache em memória do que o usuário logado PODE ver. Ele nasce
// vazio e é preenchido por `carregarDados()`, que busca cada coleção no
// endpoint do seu recurso (nada de um snapshot monolítico: o backend expõe
// recursos, e o isolamento por perfil é aplicado no servidor).
//
// A forma do objeto não mudou em relação ao protótipo de tela: as telas
// continuam lendo `db.clientes`, `db.agendamentos` e afins de forma
// síncrona. O que mudou é a origem — e o fato de que tudo que aparece aqui
// veio do banco, com as permissões do próprio usuário.
//
// Depois de uma escrita, `sincronizar('produtos')` refaz a carga SOMENTE
// dos recursos afetados: uma venda não precisa recarregar o catálogo de
// serviços.

export type Recurso =
  | 'clientes' | 'pets' | 'colaboradores' | 'servicos' | 'fornecedores' | 'produtos'
  | 'agendamentos' | 'bloqueios' | 'vendas' | 'registrosSaude' | 'pacotes'
  | 'avaliacoes' | 'notificacoes' | 'relatorios' | 'dashboard' | 'fidelidade'

export const db: {
  clientes: Cliente[]
  pets: Pet[]
  colaboradores: Colaborador[]
  servicos: Servico[]
  agendamentos: Agendamento[]
  bloqueios: BloqueioAgenda[]
  produtos: Produto[]
  fornecedores: Fornecedor[]
  vendas: Venda[]
  registrosSaude: RegistroSaude[]
  pacotes: PacoteServico[]
  avaliacoes: Avaliacao[]
  notificacoes: Notificacao[]
  relatorios: Relatorio[]
  /** Resumo do painel gerencial (RF14/RF15) — já calculado pelo banco. */
  dashboard: any | null
  /** Cadastro do próprio tutor logado (nome, contato, pontos). */
  clienteAtual: Cliente | null
  /** Saldo e extrato de pontos do tutor logado (RF20). */
  fidelidade: { clienteId: number; saldo: number; extrato: any[] } | null
} = {
  clientes: [],
  pets: [],
  colaboradores: [],
  servicos: [],
  agendamentos: [],
  bloqueios: [],
  produtos: [],
  fornecedores: [],
  vendas: [],
  registrosSaude: [],
  pacotes: [],
  avaliacoes: [],
  notificacoes: [],
  relatorios: [],
  dashboard: null,
  clienteAtual: null,
  fidelidade: null,
}

/**
 * Contas de demonstração mostradas na tela de login (UC01).
 * São as mesmas cargas do seed (`npm run seed`), com a senha de demonstração
 * `123` — que existe só para a apresentação; o cadastro real exige a
 * política de senha do RNF02 (8+ caracteres, com letra e número).
 */
export const usuarios = [
  { email: 'gestor@petplus.com', senha: '123', perfil: 'GESTOR', nome: 'Marcos Ruan' },
  { email: 'colab@petplus.com', senha: '123', perfil: 'COLABORADOR', nome: 'Juliana Ferreira' },
  { email: 'cliente@petplus.com', senha: '123', perfil: 'CLIENTE', nome: 'Ana Beatriz Souza' },
]

// =====================================================================
// Sessão
// =====================================================================

export type Sessao = { id: number; perfil: PerfilUsuario; nome: string; email: string }

/**
 * Sessão atual, segundo o SERVIDOR.
 *
 * Não há sessão guardada no navegador: o cookie `httpOnly` é a única
 * credencial, e quem diz quem está logado é `GET /auth/eu`. Se o cookie
 * expirou, o cliente tenta renovar antes de desistir — e o usuário só volta
 * à tela de login quando o refresh token também acabou.
 */
export async function restaurarSessao(): Promise<Sessao | null> {
  try {
    const usuario = await api.auth.sessao()
    return { id: usuario.id, perfil: usuario.perfil, nome: usuario.nome, email: usuario.email }
  } catch {
    return null
  }
}

/** Login (RF18). O servidor grava os cookies de sessão na resposta. */
export async function entrar(email: string, senha: string): Promise<Sessao> {
  const { usuario } = await api.auth.login(email, senha)
  return { id: usuario.id, perfil: usuario.perfil, nome: usuario.nome, email: usuario.email }
}

/** Cadastro do tutor (RF01/RF02/RNF11), já autenticado na sequência. */
export async function cadastrar(dados: {
  nome: string
  email: string
  senha: string
  telefone?: string
  endereco?: string
  consentimento: boolean
}): Promise<Sessao> {
  const { usuario } = await api.auth.cadastro(dados)
  return { id: usuario.id, perfil: usuario.perfil, nome: usuario.nome, email: usuario.email }
}

/** Encerra a sessão no servidor e descarta o cache local. */
export async function sair(): Promise<void> {
  try {
    await api.auth.logout()
  } finally {
    limparDados()
  }
}

function limparDados() {
  for (const chave of Object.keys(db) as (keyof typeof db)[]) {
    const valor = db[chave]
    if (Array.isArray(valor)) (valor as unknown[]).length = 0
    else (db as any)[chave] = null
  }
}

// =====================================================================
// Carga por recurso
// =====================================================================

/**
 * Recursos que cada perfil pode (e precisa) carregar.
 *
 * A lista espelha as regras do backend: gestor e colaborador leem os
 * cadastros da unidade; o tutor lê o que é dele. Pedir um recurso proibido
 * não "vaza" nada — o servidor responde 403 e o recurso fica vazio —, mas
 * não pedir é mais rápido e mantém o console limpo.
 */
const RECURSOS_POR_PERFIL: Record<PerfilUsuario, Recurso[]> = {
  GESTOR: [
    'clientes', 'pets', 'colaboradores', 'servicos', 'fornecedores', 'produtos',
    'agendamentos', 'bloqueios', 'vendas', 'registrosSaude', 'pacotes',
    'avaliacoes', 'notificacoes', 'relatorios', 'dashboard',
  ],
  COLABORADOR: [
    'clientes', 'pets', 'colaboradores', 'servicos', 'produtos', 'agendamentos',
    'bloqueios', 'vendas', 'registrosSaude', 'avaliacoes', 'notificacoes',
  ],
  CLIENTE: [
    'pets', 'servicos', 'agendamentos', 'registrosSaude', 'avaliacoes',
    'notificacoes', 'fidelidade', 'pacotes', 'colaboradores',
  ],
}

/** Como buscar cada coleção. Uma função por recurso, sem estado global. */
const CARREGADORES: Record<Recurso, () => Promise<void>> = {
  clientes: async () => { db.clientes = await api.clientes.listar() },
  pets: async () => { db.pets = await api.pets.listar() },
  colaboradores: async () => { db.colaboradores = await api.colaboradores.listar() },
  servicos: async () => { db.servicos = await api.servicos.listar() },
  fornecedores: async () => { db.fornecedores = await api.fornecedores.listar() },
  produtos: async () => { db.produtos = await api.produtos.listar() },
  agendamentos: async () => { db.agendamentos = await api.agendamentos.listar() },
  bloqueios: async () => { db.bloqueios = await api.bloqueios.listar() },
  vendas: async () => { db.vendas = await api.vendas.listar() },
  registrosSaude: async () => { db.registrosSaude = await api.registrosSaude.listar() },
  pacotes: async () => { db.pacotes = await api.assinaturas.listar() },
  avaliacoes: async () => { db.avaliacoes = await api.avaliacoes.listar() },
  notificacoes: async () => { db.notificacoes = await api.notificacoes.listar() },
  relatorios: async () => { db.relatorios = await api.relatorios.listar() },
  dashboard: async () => { db.dashboard = await api.dashboard.resumo() },
  fidelidade: async () => {
    db.fidelidade = await api.clientes.minhaFidelidade()
    db.clienteAtual = await api.clientes.buscar(db.fidelidade.clienteId)
  },
}

/** Recursos que já foram carregados nesta sessão (evita refazer a busca). */
const carregados = new Set<Recurso>()
let perfilCorrente: PerfilUsuario | null = null

/** Aplica o recorte de perfil: o tutor usa a carga "dele". */
function recursosDe(perfil: PerfilUsuario): Recurso[] {
  return RECURSOS_POR_PERFIL[perfil]
}

/**
 * Carrega o estado inicial do usuário logado.
 *
 * As coleções vão em paralelo (cada uma é uma requisição independente) e
 * uma falha isolada não derruba as outras: se o dashboard estiver fora, a
 * agenda ainda abre. O erro fica no console e o recurso permanece vazio.
 */
export async function carregarDados(sessao: Sessao): Promise<boolean> {
  if (perfilCorrente && perfilCorrente !== sessao.perfil) {
    limparDados()
    carregados.clear()
  }
  perfilCorrente = sessao.perfil

  const resultados = await Promise.allSettled(
    recursosDe(sessao.perfil)
      .filter((recurso) => !carregados.has(recurso))
      .map(async (recurso) => {
        await carregarRecurso(recurso, sessao.perfil)
        carregados.add(recurso)
      }),
  )

  if (!resultados.length) return true

  const falhas = resultados.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
  for (const f of falhas) console.warn('Não foi possível carregar:', f.reason?.message ?? f.reason)
  return falhas.length < resultados.length
}

async function carregarRecurso(recurso: Recurso, perfil: PerfilUsuario) {
  if (perfil === 'CLIENTE') {
    // O tutor não usa os endpoints administrativos: as coleções dele saem
    // das rotas próprias (/pets/meus, /fidelidade…).
    switch (recurso) {
      case 'pets': db.pets = await api.pets.meus(); return
      // O tutor recebe só a vitrine da equipe: nome, cargo e grade. Nada de
      // telefone/e-mail de colega (RNF11 — minimização de dados pessoais).
      case 'colaboradores': {
        const profissionais = await api.agendamentos.profissionais()
        db.colaboradores = profissionais.map((p) => ({
          ...p, ativo: true, telefone: '', email: '',
        })) as Colaborador[]
        return
      }
      case 'pacotes': db.pacotes = await api.assinaturas.listar(); return
      case 'fidelidade': return CARREGADORES.fidelidade()
      default: return CARREGADORES[recurso]()
    }
  }
  return CARREGADORES[recurso]()
}

/**
 * Recarrega recursos depois de uma escrita.
 *
 * Sem argumentos recarrega tudo que o perfil enxerga (é o que a carga
 * inicial e o botão "atualizar" usam). Com argumentos, só o que mudou: uma
 * entrada de estoque atualiza `produtos` e pronto.
 */
export async function sincronizar(...recursos: Recurso[]): Promise<boolean> {
  if (!perfilCorrente) return false
  const alvos = recursos.length ? recursos : recursosDe(perfilCorrente)

  const resultados = await Promise.allSettled(
    alvos.map((r) => carregarRecurso(r, perfilCorrente as PerfilUsuario)),
  )
  const falhas = resultados.filter((r) => r.status === 'rejected') as PromiseRejectedResult[]
  for (const f of falhas) console.warn('Falha ao sincronizar:', f.reason?.message ?? f.reason)
  return falhas.length === 0
}

/**
 * Detecta sessão expirada em qualquer escrita e avisa a interface para
 * voltar ao login. Fica aqui para as telas não repetirem o mesmo `catch`.
 */
export const sessaoExpirou = (err: unknown) => err instanceof ApiError && err.status === 401
