import type {
  Agendamento, Avaliacao, BloqueioAgenda, Cliente, Colaborador, Fornecedor,
  Notificacao, PacoteServico, PerfilUsuario, Pet, Produto, RegistroSaude,
  Relatorio, Servico, Venda,
} from './types'
import { api, setToken, getToken, ApiError } from './api'

// ===== Dados do PetPlus — servidos pelo PostgreSQL =====
//
// O protótipo mantinha este objeto como uma constante em memória. A FORMA
// dele não mudou: as 26 telas continuam lendo `db.clientes`, `db.agendamentos`
// e afins de forma síncrona, e nenhuma delas precisou ser reescrita.
//
// A diferença é a origem. `db` nasce vazio e é preenchido por
// `carregarDados()`, que busca o snapshot do tenant em GET /api/bootstrap.
// O objeto mantém a mesma identidade durante toda a sessão — nunca é
// substituído —, então qualquer módulo que guardou a referência continua
// enxergando os dados atualizados após um `sincronizar()`.

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
}

/** Contas de acesso rápido mostradas na tela de login (UC01). */
export const usuarios = [
  { email: 'gestor@petplus.com', senha: '123', perfil: 'GESTOR', nome: 'Marcos Ruan' },
  { email: 'colab@petplus.com', senha: '123', perfil: 'COLABORADOR', nome: 'Juliana Ferreira' },
  { email: 'cliente@petplus.com', senha: '123', perfil: 'CLIENTE', nome: 'Ana Beatriz Souza' },
]

// =====================================================================
// Sessão
// =====================================================================

const SESSAO_KEY = 'petplus_sessao'

export type Sessao = { perfil: PerfilUsuario; nome: string; email: string }

/** Lê a sessão salva (o token JWT fica em localStorage, em `api.ts`). */
export function lerSessao(): Sessao | null {
  try {
    const bruto = localStorage.getItem(SESSAO_KEY)
    return bruto ? (JSON.parse(bruto) as Sessao) : null
  } catch {
    return null
  }
}

export function gravarSessao(sessao: Sessao | null) {
  if (sessao) localStorage.setItem(SESSAO_KEY, JSON.stringify(sessao))
  else localStorage.removeItem(SESSAO_KEY)
  if (!sessao) setToken(null)
}

// =====================================================================
// Carga e sincronização
// =====================================================================

let carregando: Promise<boolean> | null = null

/**
 * Busca o snapshot do tenant e preenche `db`.
 *
 * Chamado uma vez na montagem do App. Chamadas concorrentes compartilham a
 * mesma promise, para duas telas não dispararem duas requisições.
 */
export function carregarDados(): Promise<boolean> {
  if (carregando) return carregando

  carregando = (async () => {
    try {
      aplicar(await api.bootstrap())
      return true
    } catch (err) {
      // Sem token (ainda não logado) ou API fora: seguimos com o vazio e
      // deixamos a tela de login aparecer normalmente.
      if (err instanceof ApiError && (err.status === 401 || err.status === 0)) {
        return false
      }
      console.error('Falha ao carregar dados do servidor:', err)
      return false
    } finally {
      carregando = null
    }
  })()

  return carregando
}

/**
 * Recarrega o snapshot após uma escrita.
 *
 * É isto que faz uma venda registrada no PDV aparecer imediatamente na
 * tela de Estoque com o saldo novo, e um agendamento criado aparecer na
 * Agenda — o dado deixa de viver só na memória da tela.
 */
export async function sincronizar(): Promise<boolean> {
  try {
    aplicar(await api.bootstrap())
    return true
  } catch (err) {
    console.error('Falha ao sincronizar com o servidor:', err)
    return false
  }
}

/** Preenche `db` preservando a identidade do objeto. */
function aplicar(snapshot: any) {
  db.clientes = snapshot.clientes ?? []
  db.pets = snapshot.pets ?? []
  db.colaboradores = snapshot.colaboradores ?? []
  db.servicos = snapshot.servicos ?? []
  db.agendamentos = snapshot.agendamentos ?? []
  db.bloqueios = snapshot.bloqueios ?? []
  db.produtos = snapshot.produtos ?? []
  db.fornecedores = snapshot.fornecedores ?? []
  db.vendas = snapshot.vendas ?? []
  db.registrosSaude = snapshot.registrosSaude ?? []
  db.pacotes = snapshot.pacotes ?? []
  db.avaliacoes = snapshot.avaliacoes ?? []
  db.notificacoes = snapshot.notificacoes ?? []
  db.relatorios = snapshot.relatorios ?? []
}

/** Há sessão salva com token válido no navegador? */
export const temSessao = () => Boolean(getToken() && lerSessao())