import React from 'react'
import { db } from '../../data'
import { brl, brlShort, fmtTime, petLabel, servicoLabel, clienteNome, colaboradorNome, getServico } from '../../utils'
import { StatCard, EmptyState } from '../../ui'
import { useNav, Topbar, Sidebar, MobileNav, GESTOR_NAV } from '../../shell'

// Data de referência do painel. O protótipo inteiro é ambientado em
// setembro/2026 (mesma constante usada no PDV), então os períodos do
// faturamento são calculados a partir dela.
const HOJE = '2026-09-12'

export default function Dashboard() {
  const nav = useNav()

  // ===== Faturamento calculado a partir das vendas do banco (RF14) =====
  // Só vendas finalizadas contam; estornadas são excluídas, assim como na
  // view `vw_faturamento` do PostgreSQL.
  const vendasFinalizadas = db.vendas.filter(v => v.status === 'finalizada')
  const soma = (lista: { valorTotal: number }[]) =>
    lista.reduce((s, v) => s + Number(v.valorTotal ?? 0), 0)

  const noDia = vendasFinalizadas.filter(v => v.dataHora.startsWith(HOJE))
  const inicioSemana = '2026-09-07'
  const inicioMes = '2026-09-01'
  const naSemana = vendasFinalizadas.filter(v => v.dataHora >= inicioSemana && v.dataHora < HOJE.slice(0, 8) + '13')
  const noMes = vendasFinalizadas.filter(v => v.dataHora.slice(0, 7) === HOJE.slice(0, 7))

  const fatDia = soma(noDia)
  const fatSemana = soma(naSemana)
  const fatMes = soma(noMes)

  const agsHoje = db.agendamentos.filter(a => a.dataHora.startsWith(HOJE))
  const ocupacao = Math.round((agsHoje.filter(a => a.status !== 'cancelado').length / 16) * 100)

  // Serviços mais vendidos (RF15), contados sobre os agendamentos do banco.
  const servCounts: Record<string, number> = {}
  db.agendamentos.forEach(a => {
    const n = servicoLabel(a.servicoId)
    servCounts[n] = (servCounts[n] ?? 0) + 1
  })
  const topServicos = Object.entries(servCounts).sort((a, b) => b[1] - a[1]).slice(0, 5)
  const maxCount = topServicos[0]?.[1] ?? 1

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Painel Gerencial</h1>
          <div className="sub">PetPlus · Unidade Vila Mariana — sábado, 12/09/2026</div>
        </div>
        <div className="flex">
          <button className="btn btn-outline" onClick={() => nav('relatorios')}>📑 Relatórios</button>
          <button className="btn btn-primary" onClick={() => nav('pdv')}>🧾 Novo PDV</button>
        </div>
      </div>

      <div className="stats-grid">
        <StatCard icon="💰" bg="bg-teal" value={brl(fatDia)} label="Faturamento do dia" delta="+12% vs. ontem" up />
        <StatCard icon="📈" bg="bg-green" value={brl(fatSemana)} label="Faturamento da semana" delta="+8% vs. semana passada" up />
        <StatCard icon="🗓️" bg="bg-blue" value={brl(fatMes)} label="Faturamento do mês" delta="+15% vs. mês anterior" up />
        <StatCard icon="📅" bg="bg-orange" value={`${ocupacao}%`} label="Ocupação da agenda (hoje)" delta={`${agsHoje.length} atendimentos`} />
      </div>

      <div className="grid-2 mb-20">
        <div className="card">
          <div className="card-head">
            <h3>Faturamento — últimos 7 dias</h3>
            <span className="hint">RF14</span>
          </div>
          <div className="card-pad">
            <div className="bars">
              {[
                { l: '06/09', v: 380 }, { l: '07/09', v: 290 }, { l: '08/09', v: 460 },
                { l: '09/09', v: 410 }, { l: '10/09', v: 520 }, { l: '11/09', v: 610 }, { l: '12/09', v: 488, accent: true },
              ].map(d => (
                <div className="bar-col" key={d.l}>
                  <span className="bar-val">{brlShort(d.v)}</span>
                  <div className={`bar ${d.accent ? 'accent' : ''}`} style={{ height: `${(d.v / 650) * 100}%` }} />
                  <span className="bar-lbl">{d.l}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-head">
            <h3>Serviços mais vendidos</h3>
            <span className="hint">RF15</span>
          </div>
          <div className="card-pad">
            {topServicos.map(([nome, qtd]) => (
              <div className="hbar-row" key={nome}>
                <div className="hbar-label">{nome}</div>
                <div className="hbar-track"><div className="hbar-fill accent" style={{ width: `${(qtd / maxCount) * 100}%` }} /></div>
                <div className="hbar-val">{qtd}x</div>
              </div>
            ))}
            <div className="divider" />
            <div className="flex-between">
              <span className="small muted">Taxa de ocupação da semana</span>
              <div className="hbar-row" style={{ marginBottom: 0, flex: 1, maxWidth: 220 }}>
                <div className="hbar-track"><div className="hbar-fill" style={{ width: '72%' }} /></div>
                <div className="hbar-val">72%</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head">
            <h3>Agenda de hoje</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => nav('agenda')}>Ver agenda completa →</button>
          </div>
          <div className="table-wrap">
            {agsHoje.length === 0 ? <EmptyState icon="📭" title="Nenhum agendamento hoje" /> : (
              <table className="tbl">
                <thead><tr><th>Horário</th><th>Pet / Serviço</th><th>Profissional</th><th>Status</th></tr></thead>
                <tbody>
                  {agsHoje.map(a => (
                    <tr key={a.id}>
                      <td className="bold">{fmtTime(a.dataHora)}</td>
                      <td>{petLabel(a.petId)}<div className="tiny muted">{servicoLabel(a.servicoId)}</div></td>
                      <td>{colaboradorNome(a.colaboradorId)}</td>
                      <td><span className={`badge ${a.status === 'confirmado' ? 'badge-teal' : a.status === 'concluído' ? 'badge-green' : 'badge-gray'}`}>{a.status}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Alertas</h3><span className="hint">RF09 · RF23</span></div>
          <div className="card-pad">
            <div className="alert warn mb-12">📦 <span><b>2 produtos no estoque mínimo:</b> Shampoo Higienizador (3/6), Areia Higiênica (2/8).</span></div>
            <div className="alert danger mb-12">⏳ <span><b>2 produtos próximos da validade:</b> Vermífugo Vermivet (25/09), Antipulgas Simparic (05/10).</span></div>
            <div className="alert info mb-12">📱 <span><b>Vacina do Mimi vence em 15 dias</b> — notificação de retorno já enviada ao tutor.</span></div>
            <div className="alert success">⭐ <span><b>2 novas avaliações</b> nesta semana — média 4,5 de 5.</span></div>
          </div>
        </div>
      </div>
    </div>
  )
}
