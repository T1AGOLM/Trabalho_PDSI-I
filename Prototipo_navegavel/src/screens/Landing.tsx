import React from 'react'
import { useNav } from '../shell'
import { useToast } from '../ui'

export default function Landing() {
  const nav = useNav()
  const toast = useToast()

  const goLogin = () => nav('login')

  return (
    <div style={{ background: 'var(--bg)' }}>
      <nav className="landing-nav">
        <div className="flex" style={{ gap: 10 }}>
          <div className="avatar" style={{ background: 'var(--primary)', borderRadius: 11 }}>🐾</div>
          <div>
            <div className="bold" style={{ fontSize: 17 }}>PetPlus</div>
            <div className="tiny" style={{ color: 'var(--text-3)' }}>Sistema de Gestão para Petshop</div>
          </div>
        </div>
        <div className="flex">
          <button className="btn btn-ghost" onClick={goLogin}>Entrar</button>
          <button className="btn btn-primary" onClick={goLogin}>Acessar o sistema</button>
        </div>
      </nav>

      <header className="landing-hero">
        <div className="paws-bg">🐾</div>
        <div className="landing-hero-inner">
          <div style={{ flex: 1.1 }}>
            <div className="mb-16" style={{ display: 'inline-block', background: 'rgba(127,214,203,.14)', border: '1px solid rgba(127,214,203,.4)', color: '#7fd6cb', padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, letterSpacing: '.05em' }}>
              MVP · VERSÃO WEB RESPONSIVA
            </div>
            <h1>Gerencie seu petshop <span className="hl">sem planilhas</span>, no lugar certo.</h1>
            <p className="lead">
              Clientes, pets, agenda de banho e tosa, veterinária, estoque, PDV e notificações automáticas
              em um só sistema — pensado para petshops de pequeno e médio porte.
            </p>
            <div className="hero-cta">
              <button className="btn btn-lg" style={{ background: '#7fd6cb', color: '#0d3a35' }} onClick={goLogin}>
                🐾 Entrar no sistema
              </button>
              <button className="btn btn-lg btn-outline" style={{ background: 'transparent', color: '#fff', borderColor: 'rgba(255,255,255,.35)' }} onClick={goLogin}>
                Ver demonstração
              </button>
            </div>
            <div className="hero-stats">
              <div className="hero-stat"><div className="v">R$ 68 bi</div><div className="l">mercado pet BR (2023)</div></div>
              <div className="hero-stat"><div className="v">45%</div><div className="l">dos petshops ainda usam caderno</div></div>
              <div className="hero-stat"><div className="v">3 passos</div><div className="l">para agendar um serviço</div></div>
            </div>
          </div>

          <div style={{ flex: 0.9 }}>
            <div className="card card-pad" style={{ borderRadius: 18, boxShadow: 'var(--shadow-lg)' }}>
              <div className="flex-between mb-16">
                <b>Hoje no PetPlus</b>
                <span className="badge badge-teal">12/09/2026</span>
              </div>
              {[
                { i: '🛁', t: 'Banho e Tosa — Bolinha', s: '09:00 · com Marcos (tosador)', b: 'Confirmado', c: 'badge-green' },
                { i: '🩺', t: 'Consulta — Rex', s: '14:00 · Dr. Roberto', b: 'Confirmado', c: 'badge-green' },
                { i: '🧾', t: 'Venda PDV #1001', s: 'R$ 64,90 · PIX', b: 'Finalizada', c: 'badge-blue' },
                { i: '📦', t: 'Estoque mínimo: Shampoo Neutro', s: '3 un. (mín. 6)', b: 'Alerta', c: 'badge-amber' },
              ].map((r, i) => (
                <div key={i} className="flex-between" style={{ padding: '10px 0', borderBottom: '1px dashed var(--border)' }}>
                  <div className="flex" style={{ gap: 10 }}>
                    <div className={`stat-icon ${i === 3 ? 'bg-orange' : 'bg-teal'}`} style={{ width: 38, height: 38, fontSize: 17 }}>{r.i}</div>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{r.t}</div>
                      <div className="tiny" style={{ color: 'var(--text-3)' }}>{r.s}</div>
                    </div>
                  </div>
                  <span className={`badge ${r.c}`}>{r.b}</span>
                </div>
              ))}
              <button className="btn btn-outline btn-block mt-16" onClick={goLogin}>Explorar o protótipo →</button>
            </div>
          </div>
        </div>
      </header>

      <section className="landing-section">
        <h2>Tudo o que o seu petshop precisa</h2>
        <p className="sec-sub">Módulos integrados que eliminam retrabalho, evitam conflito de horários e dão visão gerencial do negócio.</p>
        <div className="landing-cards">
          {[
            { i: '📅', t: 'Agenda inteligente', d: 'Agendamentos com validação automática de conflito de horário por profissional.' },
            { i: '📦', t: 'Estoque integrado', d: 'Baixa automática por venda ou uso em serviço, alertas de mínimo e de validade.' },
            { i: '🧾', t: 'PDV completo', d: 'Dinheiro, débito, crédito, PIX — inclusive pagamento combinado e estorno pelo gestor.' },
            { i: '🩺', t: 'Histórico do pet', d: 'Linha do tempo com vacinas, atendimentos, banhos e observações veterinárias.' },
            { i: '🔔', t: 'Notificações', d: 'Lembrete por e-mail 24h antes, avisos de retorno e de vacina; push no app.' },
            { i: '📊', t: 'Painel gerencial', d: 'Faturamento dia/semana/mês, serviços mais vendidos e ocupação da agenda.' },
          ].map((c, i) => (
            <div className="l-card" key={i}>
              <div className="ic">{c.i}</div>
              <h3>{c.t}</h3>
              <p>{c.d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="landing-section" style={{ paddingTop: 0 }}>
        <h2>Quem usa o PetPlus?</h2>
        <p className="sec-sub">Três perfis de acesso, permissões diferentes — escolha um para explorar o protótipo navegável.</p>
        <div className="landing-profiles">
          <button className="p-card p-gestor" onClick={goLogin}>
            <h3>👑 Gestor</h3>
            <p>Dashboard, relatórios exportáveis, estorno de vendas, fornecedores e gestão da equipe.</p>
            <span className="p-cta">Entrar como Gestor →</span>
          </button>
          <button className="p-card p-colab" onClick={goLogin}>
            <h3>✂️ Colaborador</h3>
            <p>Minha agenda, atendimentos do dia, histórico de saúde dos pets e bloqueios de agenda.</p>
            <span className="p-cta">Entrar como Colaborador →</span>
          </button>
          <button className="p-card p-cliente" onClick={goLogin}>
            <h3>🐶 Cliente (tutor)</h3>
            <p>Agendar online, acompanhar histórico de saúde, fidelidade e avaliar os serviços.</p>
            <span className="p-cta">Entrar como Cliente →</span>
          </button>
        </div>
      </section>

      <footer className="landing-foot">
        <div className="mb-8 bold">🐾 PetPlus — Sistema de Gestão para Petshop</div>
        <div>Protótipo navegável · Projeto acadêmico — Projeto e Desenvolvimento de Sistema de Informação I</div>
        <div className="mt-12">Jordann · Marcos Ruan · Tiago · Vinicius — Setembro/2026</div>
      </footer>
    </div>
  )
}
