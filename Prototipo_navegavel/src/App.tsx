import React from 'react'
import { SessionCtx, NavCtx } from './shell'
import { useRoute, go } from './router'
import { ToastProvider } from './ui'
import { api, setToken, ApiError } from './api'
import { carregarDados, lerSessao, gravarSessao, temSessao } from './data'

import Landing from './screens/Landing'
import Login from './screens/auth/Login'
import RecuperarSenha from './screens/auth/RecuperarSenha'
import RedefinirSenha from './screens/auth/RedefinirSenha'
import CadastroCliente from './screens/auth/CadastroCliente'
import AcessoNegado from './screens/AcessoNegado'
import NaoEncontrado from './screens/NaoEncontrado'

import AppShell from './screens/AppShell'

type Sessao = { perfil: 'GESTOR' | 'COLABORADOR' | 'CLIENTE'; nome: string; email: string }

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
  const [session, setSession] = React.useState<Sessao | null>(() => lerSessao())
  // `pronto` só vira true depois que o snapshot do banco chegou (ou falhou
  // de forma recuperável). Antes disso não renderizamos as telas internas,
  // senão elas desenhariam com `db` ainda vazio.
  const [pronto, setPronto] = React.useState(false)
  const [erroLogin, setErroLogin] = React.useState('')

  React.useEffect(() => {
    let cancelado = false
    if (!temSessao()) {
      setPronto(true)
      return
    }
    carregarDados().finally(() => {
      if (!cancelado) setPronto(true)
    })
    return () => { cancelado = true }
  }, [])

  const nav = (name: string, params: Record<string, any> = {}) => {
    if (name === 'login') sair()
    go(name, params)
  }

  const sair = () => {
    gravarSessao(null)
    setSession(null)
  }

  /**
   * Login real (RF18/RNF04): valida a senha contra o hash bcrypt no
   * PostgreSQL e guarda o JWT. Sem token, nenhuma rota protegida responde.
   */
  const doLogin = async (email: string, senha: string) => {
    setErroLogin('')
    try {
      const r = await api.auth.login(email, senha)
      setToken(r.token)
      const sessao: Sessao = {
        perfil: r.usuario.perfil as Sessao['perfil'],
        nome: r.usuario.nome,
        email: r.usuario.email,
      }
      gravarSessao(sessao)
      setSession(sessao)

      // Carrega os dados antes de abrir a área logada, para que a primeira
      // tela já renderize com o conteúdo real do banco.
      await carregarDados()
      setPronto(true)
      go(sessao.perfil === 'GESTOR' ? 'dashboard' : sessao.perfil === 'COLABORADOR' ? 'colab-agenda' : 'cli-inicio')
    } catch (err) {
      if (err instanceof ApiError) {
        setErroLogin(err.status === 0 ? err.message : 'E-mail ou senha inválidos. (UC01 — 3a)')
      } else {
        setErroLogin('Não foi possível entrar. Tente novamente.')
      }
    }
  }

  let content: React.ReactNode

  if (PUBLIC_ROUTES.includes(route.name)) {
    switch (route.name) {
      case 'login': content = <Login onLogin={doLogin} erroExterno={erroLogin} />; break
      case 'recuperar-senha': content = <RecuperarSenha />; break
      case 'redefinir-senha': content = <RedefinirSenha />; break
      case 'cadastro': content = <CadastroCliente />; break
      case 'nao-encontrado': content = <NaoEncontrado />; break
      default: content = <Landing />
    }
  } else if (!session) {
    content = <Login onLogin={doLogin} erroExterno={erroLogin} />
  } else if (!pronto) {
    content = (
      <div className="app-loading">
        <div className="logo">🐾</div>
        <div>Carregando dados do PetPlus…</div>
      </div>
    )
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