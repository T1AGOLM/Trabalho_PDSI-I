// ===== Tipos de domínio — PetPlus (espelham o Diagrama de Classes) =====

export type PerfilUsuario = 'GESTOR' | 'COLABORADOR' | 'CLIENTE'
export type TipoCargo = 'ATENDENTE' | 'TOSADOR' | 'BANHISTA' | 'VETERINARIO'
export type TipoRegistro = 'vacina' | 'atendimento' | 'banho' | 'observação'
export type StatusAgendamento = 'confirmado' | 'cancelado' | 'concluído'
export type TipoServico = 'banho' | 'tosa' | 'consulta'
export type FormaPagamento = 'dinheiro' | 'débito' | 'crédito' | 'PIX'
export type StatusVenda = 'finalizada' | 'estornada'
export type CanalNotificacao = 'e-mail' | 'push'
export type TipoRelatorio = 'vendas' | 'agendamentos' | 'estoque' | 'financeiro'
export type FormatoArquivo = 'PDF' | 'Excel' | 'CSV'

export interface Usuario {
  id: number
  nome: string
  email: string
  telefone: string
  perfil: PerfilUsuario
}

export interface Cliente {
  id: number
  nome: string
  email: string
  telefone: string
  endereco: string
  pontosFidelidade: number
  ativo: boolean
}

export interface Pet {
  id: number
  clienteId: number
  nome: string
  especie: string
  raca: string
  porte: string
  idade: number
  observacoesSaude: string
  ativo: boolean
}

export interface Colaborador {
  id: number
  nome: string
  cargo: TipoCargo
  telefone: string
  email: string
  disponibilidade: string // ex.: "Seg–Sex, 08h–18h"
  ativo: boolean
}

export interface RegistroSaude {
  id: number
  petId: number
  data: string
  tipo: TipoRegistro
  descricao: string
}

export interface Servico {
  id: number
  nome: string
  tipo: TipoServico
  duracao: number // minutos
  preco: number
}

export interface Agendamento {
  id: number
  petId: number
  clienteId: number
  colaboradorId: number
  servicoId: number
  dataHora: string // ISO local
  status: StatusAgendamento
}

export interface BloqueioAgenda {
  id: number
  colaboradorId: number
  dataInicio: string
  dataFim: string
  motivo: string
}

export interface Produto {
  id: number
  nome: string
  categoria: string
  quantidadeEstoque: number
  estoqueMinimo: number
  validade: string
  preco: number
  fornecedorId: number
}

export interface Fornecedor {
  id: number
  nome: string
  cnpj: string
  contato: string
}

export interface ItemVenda {
  produtoId: number
  nome: string
  quantidade: number
  precoUnitario: number
}

export interface Pagamento {
  formaPagamento: FormaPagamento
  valor: number
}

export interface Venda {
  id: number
  dataHora: string
  itens: ItemVenda[]
  pagamentos: Pagamento[]
  valorTotal: number
  status: StatusVenda
  clienteId?: number
}

export interface PacoteServico {
  id: number
  nome: string
  periodicidade: string
  preco: number
  servicos: string[]
  clienteId: number
  petId: number
  status: 'ativo' | 'cancelado'
}

export interface Avaliacao {
  id: number
  agendamentoId: number
  clienteId: number
  nota: number
  comentario: string
  data: string
}

export interface Notificacao {
  id: number
  canal: CanalNotificacao
  destinatario: string
  mensagem: string
  dataEnvio: string
  lida: boolean
}

export interface Relatorio {
  id: number
  tipo: TipoRelatorio
  formato: FormatoArquivo
  periodo: string
  dataGeracao: string
  usuario: string
}

export interface AgendaView {
  data: string
  agendamentos: Agendamento[]
}
