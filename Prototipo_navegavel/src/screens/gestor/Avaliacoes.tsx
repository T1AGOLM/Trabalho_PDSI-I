import React from 'react'
import { db } from '../../data'
import { clienteNome, fmtDateTime, petLabel, servicoLabel } from '../../utils'
import { EmptyState } from '../../ui'

export default function Avaliacoes() {
  const avs = db.avaliacoes
  const media = avs.length ? avs.reduce((s, a) => s + a.nota, 0) / avs.length : 0

  // Agendamentos concluídos aguardando avaliação
  const pendentes = db.agendamentos.filter(a => a.status === 'concluído' && !avs.some(av => av.agendamentoId === a.id))

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Avaliações de Serviço</h1>
          <div className="sub">Notas e comentários dos clientes (UC23 · RF28)</div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon bg-orange">⭐</div>
          <div>
            <div className="stat-value">{media.toFixed(1)} / 5</div>
            <div className="stat-label">Média geral ({avs.length} avaliações)</div>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-teal">🆕</div>
          <div><div className="stat-value">{pendentes.length}</div><div className="stat-label">Serviços aguardando avaliação</div></div>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head"><h3>Avaliações recebidas</h3></div>
          {avs.length === 0 ? <EmptyState icon="⭐" title="Nenhuma avaliação ainda" /> : (
            <div className="card-pad">
              {avs.map(a => {
                const ag = db.agendamentos.find(x => x.id === a.agendamentoId)
                return (
                  <div key={a.id} className="card card-pad mb-12" style={{ padding: 16 }}>
                    <div className="flex-between mb-8">
                      <div className="flex" style={{ gap: 10 }}>
                        <div className="avatar" style={{ background: 'var(--accent)' }}>{clienteNome(a.clienteId).split(' ').map(x => x[0]).slice(0, 2).join('')}</div>
                        <div>
                          <div className="bold" style={{ fontSize: 13.5 }}>{clienteNome(a.clienteId)}</div>
                          <div className="tiny muted">{ag ? `${servicoLabel(ag.servicoId)} — ${petLabel(ag.petId)}` : ''} · {fmtDateTime(a.data)}</div>
                        </div>
                      </div>
                      <span className="stars">{'★'.repeat(a.nota)}{'☆'.repeat(5 - a.nota)}</span>
                    </div>
                    <div className="small muted">“{a.comentario}”</div>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <div className="card">
          <div className="card-head"><h3>Aguardando avaliação do cliente</h3><span className="hint">link de avaliação enviado por e-mail/push</span></div>
          <table className="tbl">
            <thead><tr><th>Serviço</th><th>Pet</th><th>Tutor</th><th>Data</th><th className="right">Status</th></tr></thead>
            <tbody>
              {pendentes.map(a => (
                <tr key={a.id}>
                  <td>{servicoLabel(a.servicoId)}</td>
                  <td>{petLabel(a.petId)}</td>
                  <td>{clienteNome(a.clienteId)}</td>
                  <td className="small">{fmtDateTime(a.dataHora)}</td>
                  <td className="right"><span className="badge badge-amber">pendente</span></td>
                </tr>
              ))}
              {pendentes.length === 0 && <tr><td colSpan={5}><EmptyState icon="✅" title="Tudo avaliado!" /></td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
