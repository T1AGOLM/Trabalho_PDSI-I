import React from 'react'
import { SessionCtx, NavCtx, SairCtx } from './shell'
import { useRoute, go } from './router'
import { ToastProvider } from './ui'
import { ApiError } from './api'
import {
  carregarDados, cadastrar as cadastrarTutor, entrar, restaurarSessao, sair as sairDaConta,
  type Sessao,
} from './data'

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

const HOME_POR_PERFIL: Record<string, string> = {
  GESTOR: 'dashboard',
  COLABORADOR: 'colab-agenda',
  CLIENTE: 'cli-inicio',
}

export default function App() {
  const route = useRoute()
  // A sessão NÃO é lida do navegador: quem responde "quem está logado" é o
  // servidor (GET /auth/eu, autenticado pelo cookie httpOnly). Nada aqui
  // pode ser forjado pelo usuário.
  const [session, setSession] = React.useState<Sessao | null>(null)
  const [verificando, setVerificando] = React.useState(true)
  const [erroLogin, setErroLogin] = React.useState('')

  // Retoma a sessão existente ao abrir/recarregar a página.
  React.useEffect(() => {
    let cancelado = false
    ;(async () => {
      const atual = await restaurarSessao()
      if (cancelado) return
      if (atual) {
        setSession(atual)
        await carregarDados(atual)
      }
      if (!cancelado) setVerificando(false)
    })()
    return () => { cancelado = true }
  }, [])

  const nav = (name: string, params: Record<string, any> = {}) => {
    if (name === 'login') void encerrar()
    go(name, params)
  }

  /** Encerra a sessão no servidor (invalida o refresh token) e limpa o cache. */
  const encerrar = async () => {
    await sairDaConta()
    setSession(null)
  }

  /**
   * Login real (RF18): a senha é conferida contra o hash bcrypt no
   * PostgreSQL e o servidor grava os cookies de sessão. Nenhum token passa
   * pelo JavaScript da página.
   */
  const doLogin = async (email: string, senha: string) => {
    setErroLogin('')
    try {
      const sessao = await entrar(email, senha)
      setSession(sessao)

      // Carrega os dados antes de abrir a área logada, para que a primeira
      // tela já renderize com o conteúdo real do banco.
      await carregarDados(sessao)
      go(HOME_POR_PERFIL[sessao.perfil] ?? 'landing')
    } catch (err) {
      if (err instanceof ApiError) {
        setErroLogin(
          err.status === 0
            ? err.message
            : err.status === 429
              ? 'Muitas tentativas de login. Aguarde um instante e tente de novo.'
              : 'E-mail ou senha inválidos. (UC01 — 3a)',
        )
      } else {
        setErroLogin('Não foi possível entrar. Tente novamente.')
      }
    }
  }

  const doCadastro = async (dados: Parameters<typeof cadastrarTutor>[0]): Promise<Sessao> => {
    const sessao = await cadastrarTutor(dados)
    setSession(sessao)
    await carregarDados(sessao)
    go('cli-inicio')
    return sessao
  }

  let content: React.ReactNode

  if (verificando) {
    content = (
      <div className="app-loading">
        <div className="logo">🐾</div>
        <div>Conectando ao PetPlus…</div>
      </div>
    )
  } else if (PUBLIC_ROUTES.includes(route.name)) {
    switch (route.name) {
      case 'login': content = <Login onLogin={doLogin} erroExterno={erroLogin} />; break
      case 'recuperar-senha': content = <RecuperarSenha />; break
      case 'redefinir-senha': content = <RedefinirSenha />; break
      case 'cadastro': content = <CadastroCliente onCadastrar={doCadastro} />; break
      case 'nao-encontrado': content = <NaoEncontrado />; break
      default: content = <Landing />
    }
  } else if (!session) {
    content = <Login onLogin={doLogin} erroExterno={erroLogin} />
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
          <SairCtx.Provider value={encerrar}>
            {content}
          </SairCtx.Provider>
        </NavCtx.Provider>
      </SessionCtx.Provider>
    </ToastProvider>
  )
}
