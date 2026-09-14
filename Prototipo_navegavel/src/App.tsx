import React from 'react'
import { SessionCtx, NavCtx, Session } from './shell'
import { useRoute, go } from './router'
import { ToastProvider } from './ui'
import { usuarios } from './data'

import Landing from './screens/Landing'
import Login from './screens/auth/Login'
import RecuperarSenha from './screens/auth/RecuperarSenha'
import RedefinirSenha from './screens/auth/RedefinirSenha'
import CadastroCliente from './screens/auth/CadastroCliente'
import AcessoNegado from './screens/AcessoNegado'
import NaoEncontrado from './screens/NaoEncontrado'

import AppShell from './screens/AppShell'

// Rotas que exigem um perfil específico
const PROFILE_GUARDS: Record<string, string> = {
  dashboard: 'GESTOR', agenda: 'GESTOR', clientes: 'GESTOR', colaboradores: 'GESTOR',
  estoque: 'GESTOR', fornecedores: 'GESTOR', pdv: 'GESTOR', vendas: 'GESTOR',
  relatorios: 'GESTOR', pacotes: 'GESTOR', avaliacoes: 'GESTOR', configuracoes: 'GESTOR',
  'colab-agenda': 'COLABORADOR', 'colab-atendimentos': 'COLABORADOR', 'colab-historico': 'COLABORADOR',
  'colab-clientes': 'COLABORADOR', 'colab-estoque': 'COLABORADOR', 'colab-bloqueios': 'COLABORADOR',
  'cli-inicio': 'CLIENTE', 'cli-agendar': 'CLIENTE', 'cli-agendamentos': 'CLIENTE',
  'cli-pets': 'CLIENTE', 'cli-historico': 'CLIENTE', 'cli-fidelidade': 'CLIENTE', 'cli-perfil': 'CLIENTE',
}

const PUBLIC_ROUTES = ['landing', 'login', 'recuperar-senha', 'redefinir-senha', 'cadastro', 'nao-encontrado']

export default function App() {
  const route = useRoute()
  const [session, setSession] = React.useState<Session | null>(null)

  const nav = (name: string, params: Record<string, any> = {}) => {
    if (name === 'login') setSession(null)
    go(name, params)
  }

  const doLogin = (email: string) => {
    const u = usuarios.find(x => x.email === email)
    if (u) {
      setSession({ perfil: u.perfil as Session['perfil'], nome: u.nome, email: u.email })
      go(u.perfil === 'GESTOR' ? 'dashboard' : u.perfil === 'COLABORADOR' ? 'colab-agenda' : 'cli-inicio')
    }
  }

  let content: React.ReactNode

  if (PUBLIC_ROUTES.includes(route.name)) {
    switch (route.name) {
      case 'login': content = <Login onLogin={doLogin} />; break
      case 'recuperar-senha': content = <RecuperarSenha />; break
      case 'redefinir-senha': content = <RedefinirSenha />; break
      case 'cadastro': content = <CadastroCliente />; break
      case 'nao-encontrado': content = <NaoEncontrado />; break
      default: content = <Landing />
    }
  } else if (!session) {
    content = <Login onLogin={doLogin} />
  } else {
    const guard = PROFILE_GUARDS[route.name]
    if (guard && guard !== session.perfil) {
      content = <AcessoNegado perfil={session.perfil} />
    } else if (!guard) {
      content = <NaoEncontrado />
    } else {
      content = <AppShell route={route} />
    }
  }

  return (
    <ToastProvider>
      <SessionCtx.Provider value={session}>
        <NavCtx.Provider value={nav}>
          {content}
        </NavCtx.Provider>
      </SessionCtx.Provider>
    </ToastProvider>
  )
}
