import React, { createContext, useContext, useEffect, useRef, useState } from 'react'
import { db } from './data'
import { initials, perfilLabel } from './utils'

export type Perfil = 'GESTOR' | 'COLABORADOR' | 'CLIENTE'
export type Route = { name: string; params: Record<string, any> }
export type Nav = (name: string, params?: Record<string, any>) => void

// ===== "Sessão" do protótipo (sem persistência) =====
export interface Session {
  perfil: Perfil
  nome: string
  email: string
}

export const SessionCtx = React.createContext<Session | null>(null)
export const useSession = () => useContext(SessionCtx)

export const NavCtx = React.createContext<Nav>(() => {})
export const useNav = () => useContext(NavCtx)

export function makeRoute(name: string, params: Record<string, any> = {}): Route {
  return { name, params }
}

export function routeKey(r: Route) {
  return r.name + (r.params && Object.keys(r.params).length ? ':' + JSON.stringify(r.params) : '')
}

// ===== Sino de notificações =====
export function NotifBell() {
  const [open, setOpen] = useState(false)
  const [items, setItems] = useState([...db.notificacoes])
  const ref = useRef<HTMLDivElement>(null)
  const unread = items.filter(i => !i.lida).length

  useEffect(() => {
    const h = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', h)
    return () => document.removeEventListener('mousedown', h)
  }, [])

  const canalIcon = (c: string) => (c === 'push' ? '📱' : '✉️')

  return (
    <div style={{ position: 'relative' }} ref={ref}>
      <button className="icon-btn" onClick={() => setOpen(o => !o)} aria-label="Notificações">
        🔔
        {unread > 0 && <span className="dot">{unread}</span>}
      </button>
      {open && (
        <div className="notif-panel">
          <div className="notif-head">
            <span>Notificações</span>
            <button className="btn btn-ghost btn-sm" onClick={() => setItems(items.map(i => ({ ...i, lida: true })))}>
              Marcar todas como lidas
            </button>
          </div>
          <div style={{ maxHeight: 380, overflowY: 'auto' }}>
            {items.map(n => (
              <div key={n.id} className={`notif-item ${n.lida ? '' : 'unread'}`}>
                <div className="n-ico">{canalIcon(n.canal)}</div>
                <div>
                  <div className="n-msg">{n.mensagem}</div>
                  <div className="n-time">{n.canal === 'push' ? 'Push' : 'E-mail'} · {n.destinatario}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

// ===== Topbar =====
export function Topbar({ title, subtitle }: { title: string; subtitle?: string }) {
  const session = useSession()
  const nav = useNav()
  const [menuOpen, setMenuOpen] = useState(false)
  return (
    <div className="topbar">
      <div className="topbar-left">
        <div>
          <div className="topbar-title">{title}</div>
          {subtitle && <div className="topbar-sub">{subtitle}</div>}
        </div>
      </div>
      <div className="topbar-right">
        <NotifBell />
        <div style={{ position: 'relative' }}>
          <div className="user-chip" onClick={() => setMenuOpen(o => !o)}>
            <div className="avatar">{initials(session?.nome ?? 'U')}</div>
            <div>
              <div className="name">{session?.nome}</div>
              <div className="role">{perfilLabel[session?.perfil ?? ''] ?? ''}</div>
            </div>
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>▾</span>
          </div>
          {menuOpen && (
            <div className="notif-panel" style={{ width: 230, top: 46 }}>
              <div style={{ padding: '6px 0' }}>
                <button className="nav-item" style={{ color: 'var(--text)' }} onClick={() => { setMenuOpen(false); nav('configuracoes') }}>
                  ⚙️ Configurações
                </button>
                <button className="nav-item" style={{ color: 'var(--text)' }} onClick={() => { setMenuOpen(false); nav('login') }}>
                  🚪 Sair (voltar ao login)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

// ===== Sidebar =====
export interface NavItem {
  key: string
  icon: string
  label: string
  badge?: number
}

export const GESTOR_NAV: NavItem[] = [
  { key: 'dashboard', icon: '📊', label: 'Dashboard' },
  { key: 'agenda', icon: '📅', label: 'Agenda', badge: 4 },
  { key: 'clientes', icon: '👥', label: 'Clientes' },
  { key: 'colaboradores', icon: '🧑‍⚕️', label: 'Colaboradores' },
  { key: 'estoque', icon: '📦', label: 'Estoque', badge: 3 },
  { key: 'fornecedores', icon: '🚚', label: 'Fornecedores' },
  { key: 'pdv', icon: '🧾', label: 'PDV — Vendas' },
  { key: 'vendas', icon: '💳', label: 'Histórico de Vendas' },
  { key: 'relatorios', icon: '📑', label: 'Relatórios' },
  { key: 'pacotes', icon: '🎫', label: 'Pacotes' },
  { key: 'avaliacoes', icon: '⭐', label: 'Avaliações' },
  { key: 'configuracoes', icon: '⚙️', label: 'Configurações' },
]

export const COLAB_NAV: NavItem[] = [
  { key: 'colab-agenda', icon: '📅', label: 'Minha Agenda' },
  { key: 'colab-atendimentos', icon: '🐾', label: 'Atendimentos' },
  { key: 'colab-historico', icon: '📋', label: 'Histórico do Pet' },
  { key: 'colab-clientes', icon: '👥', label: 'Clientes & Pets' },
  { key: 'colab-estoque', icon: '📦', label: 'Estoque' },
  { key: 'colab-bloqueios', icon: '🚫', label: 'Bloqueios de Agenda' },
]

export const CLIENTE_NAV: NavItem[] = [
  { key: 'cli-inicio', icon: '🏠', label: 'Início' },
  { key: 'cli-agendar', icon: '➕', label: 'Agendar Serviço' },
  { key: 'cli-agendamentos', icon: '📅', label: 'Meus Agendamentos' },
  { key: 'cli-pets', icon: '🐶', label: 'Meus Pets' },
  { key: 'cli-historico', icon: '🩺', label: 'Histórico de Saúde' },
  { key: 'cli-fidelidade', icon: '⭐', label: 'Fidelidade' },
  { key: 'cli-perfil', icon: '👤', label: 'Meu Perfil' },
]

export function Sidebar({ items }: { items: NavItem[] }) {
  const route = useRoute()
  const nav = useNav()
  return (
    <aside className="sidebar">
      <div className="sidebar-brand" onClick={() => nav(items[0].key)}>
        <div className="logo">🐾</div>
        <div>
          <div className="t1">PetPlus</div>
          <div className="t2">Gestão para Petshop</div>
        </div>
      </div>
      {items.map(it => (
        <button key={it.key} className={`nav-item ${route.name === it.key ? 'active' : ''}`} onClick={() => nav(it.key)}>
          <span className="ico">{it.icon}</span>
          <span>{it.label}</span>
          {it.badge != null && it.badge > 0 && <span className="badge-count">{it.badge}</span>}
        </button>
      ))}
      <div className="sidebar-foot">
        <span className="proto-tag">PROTÓTIPO</span>
        <div>Sem dados reais · sem rede</div>
      </div>
    </aside>
  )
}

// Mobile bottom nav
import { useRoute } from './router'
export function MobileNav({ items }: { items: NavItem[] }) {
  const route = useRoute()
  const nav = useNav()
  return (
    <nav className="mobile-nav">
      {items.slice(0, 5).map(it => (
        <button key={it.key} className={route.name === it.key ? 'active' : ''} onClick={() => nav(it.key)}>
          <span className="mi">{it.icon}</span>
          {it.label.split(' ')[0]}
        </button>
      ))}
    </nav>
  )
}
