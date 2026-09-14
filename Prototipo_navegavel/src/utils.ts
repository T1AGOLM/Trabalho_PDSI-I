// ===== Utilidades compartilhadas do protótipo =====

export const brl = (v: number) =>
  v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

export const brlShort = (v: number) =>
  'R$ ' + v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })

export const fmtDate = (iso: string) => {
  if (!iso) return '—'
  const [y, m, d] = iso.split('-')
  return `${d}/${m}/${y}`
}

export const fmtDateTime = (isoLocal: string) => {
  if (!isoLocal) return '—'
  const [date, time] = isoLocal.split('T')
  return `${fmtDate(date)} às ${time?.slice(0, 5)}`
}

export const fmtTime = (isoLocal: string) => isoLocal?.split('T')[1]?.slice(0, 5) ?? '—'

export const initials = (nome: string) =>
  nome.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase()

export const todayISO = () => new Date().toISOString().slice(0, 10)

/** Próximos N dias como ISO (yyyy-mm-dd) a partir de hoje */
export const nextDays = (n: number, from = new Date()): string[] => {
  const out: string[] = []
  const d = new Date(from)
  for (let i = 0; i < n; i++) {
    out.push(d.toISOString().slice(0, 10))
    d.setDate(d.getDate() + 1)
  }
  return out
}

export const weekdayShort = (iso: string) => {
  const names = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
  return names[new Date(iso + 'T12:00:00').getDay()]
}

export const dayNum = (iso: string) => String(Number(iso.slice(8, 10)))

export const cargoLabel: Record<string, string> = {
  ATENDENTE: 'Atendente',
  TOSADOR: 'Tosador',
  BANHISTA: 'Banhista',
  VETERINARIO: 'Veterinário(a)',
}

export const perfilLabel: Record<string, string> = {
  GESTOR: 'Gestor',
  COLABORADOR: 'Colaborador',
  CLIENTE: 'Cliente',
}

// Lookups sobre o "banco" em memória
import { db } from './data'

export const getPet = (id: number) => db.pets.find(p => p.id === id)
export const getCliente = (id: number) => db.clientes.find(c => c.id === id)
export const getColaborador = (id: number) => db.colaboradores.find(c => c.id === id)
export const getServico = (id: number) => db.servicos.find(s => s.id === id)
export const getProduto = (id: number) => db.produtos.find(p => p.id === id)
export const getFornecedor = (id: number) => db.fornecedores.find(f => f.id === id)

export const petLabel = (id: number) => {
  const p = getPet(id)
  return p ? `${p.nome} · ${p.raca}` : `Pet #${id}`
}

export const servicoLabel = (id: number) => getServico(id)?.nome ?? `Serviço #${id}`

export const clienteNome = (id?: number) =>
  id == null ? '—' : (getCliente(id)?.nome ?? `Cliente #${id}`)

export const colaboradorNome = (id: number) =>
  getColaborador(id)?.nome ?? `Colaborador #${id}`
