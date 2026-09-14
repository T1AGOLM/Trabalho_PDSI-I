import React from 'react'
import { Topbar, Sidebar, MobileNav, GESTOR_NAV, COLAB_NAV, CLIENTE_NAV } from '../shell'
import { Route } from '../router'

import Dashboard from './gestor/Dashboard'
import Agenda from './gestor/Agenda'
import Clientes from './gestor/Clientes'
import Colaboradores from './gestor/Colaboradores'
import Estoque from './gestor/Estoque'
import Fornecedores from './gestor/Fornecedores'
import PDV from './gestor/PDV'
import Vendas from './gestor/Vendas'
import Relatorios from './gestor/Relatorios'
import Pacotes from './gestor/Pacotes'
import Avaliacoes from './gestor/Avaliacoes'
import Configuracoes from './gestor/Configuracoes'

import ColabAgenda from './colaborador/ColabAgenda'
import ColabAtendimentos from './colaborador/ColabAtendimentos'
import ColabHistorico from './colaborador/ColabHistorico'
import ColabClientes from './colaborador/ColabClientes'
import ColabEstoque from './colaborador/ColabEstoque'
import ColabBloqueios from './colaborador/ColabBloqueios'

import CliInicio from './cliente/CliInicio'
import CliAgendar from './cliente/CliAgendar'
import CliAgendamentos from './cliente/CliAgendamentos'
import CliPets from './cliente/CliPets'
import CliHistorico from './cliente/CliHistorico'
import CliFidelidade from './cliente/CliFidelidade'
import CliPerfil from './cliente/CliPerfil'

const TITLES: Record<string, { t: string; s?: string }> = {
  dashboard: { t: 'Painel Gerencial', s: 'Visão geral do negócio' },
  agenda: { t: 'Agenda', s: 'Agendamentos da semana' },
  clientes: { t: 'Clientes & Pets', s: 'Tutores e animais cadastrados' },
  colaboradores: { t: 'Colaboradores', s: 'Equipe operacional e disponibilidade' },
  estoque: { t: 'Estoque', s: 'Produtos, mínimos e validade' },
  fornecedores: { t: 'Fornecedores', s: 'Empresas parceiras de abastecimento' },
  pdv: { t: 'PDV — Ponto de Venda', s: 'Registro de vendas e comprovantes' },
  vendas: { t: 'Histórico de Vendas', s: 'Vendas registradas e estornos' },
  relatorios: { t: 'Relatórios', s: 'Exportação financeira e operacional' },
  pacotes: { t: 'Pacotes Recorrentes', s: 'Planos de serviços contratados' },
  avaliacoes: { t: 'Avaliações de Serviço', s: 'Notas e comentários dos clientes' },
  configuracoes: { t: 'Configurações', s: 'Preferências do sistema' },
  'colab-agenda': { t: 'Minha Agenda', s: 'Seus atendimentos da semana' },
  'colab-atendimentos': { t: 'Atendimentos', s: 'Concluir e registrar atendimentos' },
  'colab-historico': { t: 'Histórico do Pet', s: 'Linha do tempo de saúde' },
  'colab-clientes': { t: 'Clientes & Pets', s: 'Consulta de cadastros' },
  'colab-estoque': { t: 'Estoque', s: 'Consulta de produtos' },
  'colab-bloqueios': { t: 'Bloqueios de Agenda', s: 'Férias, folgas e ausências' },
  'cli-inicio': { t: 'Olá!', s: 'Bem-vindo de volta' },
  'cli-agendar': { t: 'Agendar Serviço', s: 'Reserve online em 3 passos' },
  'cli-agendamentos': { t: 'Meus Agendamentos', s: 'Próximos e anteriores' },
  'cli-pets': { t: 'Meus Pets', s: 'Companheiros cadastrados' },
  'cli-historico': { t: 'Histórico de Saúde', s: 'Acompanhe online os cuidados' },
  'cli-fidelidade': { t: 'Programa de Fidelidade', s: 'Acumule e resgate pontos' },
  'cli-perfil': { t: 'Meu Perfil', s: 'Seus dados de acesso' },
}

export default function AppShell({ route }: { route: Route }) {
  const isGestor = ['dashboard', 'agenda', 'clientes', 'colaboradores', 'estoque', 'fornecedores', 'pdv', 'vendas', 'relatorios', 'pacotes', 'avaliacoes', 'configuracoes'].includes(route.name)
  const isColab = route.name.startsWith('colab-')
  const items = isGestor ? GESTOR_NAV : isColab ? COLAB_NAV : CLIENTE_NAV

  const page = (() => {
    switch (route.name) {
      case 'dashboard': return <Dashboard />
      case 'agenda': return <Agenda />
      case 'clientes': return <Clientes />
      case 'colaboradores': return <Colaboradores />
      case 'estoque': return <Estoque />
      case 'fornecedores': return <Fornecedores />
      case 'pdv': return <PDV />
      case 'vendas': return <Vendas />
      case 'relatorios': return <Relatorios />
      case 'pacotes': return <Pacotes />
      case 'avaliacoes': return <Avaliacoes />
      case 'configuracoes': return <Configuracoes />
      case 'colab-agenda': return <ColabAgenda />
      case 'colab-atendimentos': return <ColabAtendimentos />
      case 'colab-historico': return <ColabHistorico />
      case 'colab-clientes': return <ColabClientes />
      case 'colab-estoque': return <ColabEstoque />
      case 'colab-bloqueios': return <ColabBloqueios />
      case 'cli-inicio': return <CliInicio />
      case 'cli-agendar': return <CliAgendar />
      case 'cli-agendamentos': return <CliAgendamentos />
      case 'cli-pets': return <CliPets />
      case 'cli-historico': return <CliHistorico />
      case 'cli-fidelidade': return <CliFidelidade />
      case 'cli-perfil': return <CliPerfil />
      default: return <Dashboard />
    }
  })()

  const meta = TITLES[route.name] ?? { t: 'PetPlus' }

  return (
    <div className="shell">
      <Sidebar items={items} />
      <div className="main-area">
        <Topbar title={meta.t} subtitle={meta.s} />
        <main className="page" style={{ paddingBottom: 90 }}>
          {page}
        </main>
      </div>
      <MobileNav items={items} />
    </div>
  )
}
