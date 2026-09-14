import React, { useState } from 'react'
import { db } from '../../data'
import { fmtDate, fmtDateTime, petLabel, servicoLabel, clienteNome } from '../../utils'
import { Modal, useToast, EmptyState } from '../../ui'
import type { Agendamento } from '../../types'

const ID_COLAB = 1 // Juliana (atendente logada no protótipo)
const DIAS = ['2026-09-10', '2026-09-11', '2026-09-12', '2026-09-14', '2026-09-15', '2026-09-16']
const HORAS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00']

export default function ColabAgenda() {
  const toast = useToast()
  const [ags, setAgs] = useState<Agendamento[]>([...db.agendamentos])
  const [selected, setSelected] = useState<Agendamento | null>(null)

  const doDia = (d: string) => ags.filter(a => a.dataHora.startsWith(d) && a.status !== 'cancelado')

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Minha Agenda</h1>
          <div className="sub">Juliana Ferreira · Atendente — consulta e atualização de horários (UC18 · RF17)</div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon bg-teal">📆</div><div><div className="stat-value">{doDia('2026-09-12').length}</div><div className="stat-label">Atendimentos hoje</div></div></div>
        <div className="stat-card"><div className="stat-icon bg-green">✅</div><div><div className="stat-value">{ags.filter(a => a.colaboradorId === ID_COLAB && a.status === 'concluído').length}</div><div className="stat-label">Concluídos (semana)</div></div></div>
        <div className="stat-card"><div className="stat-icon bg-orange">🗓️</div><div><div className="stat-value">{ags.filter(a => a.colaboradorId === ID_COLAB && a.status === 'confirmado').length}</div><div className="stat-label">Confirmados</div></div></div>
      </div>

      <div className="card">
        <div className="card-head"><h3>Próximos dias</h3><span className="hint">clique em um atendimento para ver os detalhes</span></div>
        <div className="card-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          {DIAS.map(d => (
            <div key={d} className="card" style={{ padding: 14, background: d === '2026-09-12' ? '#f4fbfa' : 'var(--surface)', borderColor: d === '2026-09-12' ? 'var(--primary)' : 'var(--border)' }}>
              <div className="flex-between mb-12">
                <b className="small" style={{ textTransform: 'capitalize' }}>{fmtDate(d).slice(0, 5)}</b>
                <span className="badge badge-gray">{doDia(d).length} atend.</span>
              </div>
              {doDia(d).length === 0 ? (
                <div className="tiny muted center" style={{ padding: '14px 0' }}>Livre 🎉</div>
              ) : doDia(d).sort((a, b) => a.dataHora.localeCompare(b.dataHora)).map(a => (
                <div key={a.id} className={`agenda-ev ev-${a.status}`} style={{ marginBottom: 6 }} onClick={() => setSelected(a)}>
                  <b>{a.dataHora.split('T')[1].slice(0, 5)}</b> {petLabel(a.petId).split(' ·')[0]}
                  <div className="tiny">{servicoLabel(a.servicoId)}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>

      {selected && (
        <Modal title={`Atendimento #${selected.id}`} onClose={() => setSelected(null)}
          footer={
            <>
              {selected.status === 'confirmado' && (
                <>
                  <button className="btn btn-outline" onClick={() => {
                    setAgs(as => as.map(a => a.id === selected.id ? { ...a, status: 'concluído' } : a))
                    setSelected({ ...selected, status: 'concluído' })
                    toast('Atendimento marcado como concluído.', 'ok')
                  }}>✓ Marcar como concluído</button>
                  <button className="btn btn-danger" onClick={() => {
                    setAgs(as => as.map(a => a.id === selected.id ? { ...a, status: 'cancelado' } : a))
                    setSelected(null)
                    toast('Atendimento cancelado. Horário liberado (RN04).', 'ok')
                  }}>✕ Cancelar</button>
                </>
              )}
              {selected.status !== 'confirmado' && <button className="btn btn-primary" onClick={() => setSelected(null)}>Fechar</button>}
            </>
          }>
          <div className="kv"><span className="k">Pet</span><span className="v">{petLabel(selected.petId)}</span></div>
          <div className="kv"><span className="k">Tutor</span><span className="v">{clienteNome(selected.clienteId)}</span></div>
          <div className="kv"><span className="k">Serviço</span><span className="v">{servicoLabel(selected.servicoId)}</span></div>
          <div className="kv"><span className="k">Data e hora</span><span className="v">{fmtDateTime(selected.dataHora)}</span></div>
          <div className="kv"><span className="k">Status</span><span className="v"><span className={`badge ${selected.status === 'confirmado' ? 'badge-teal' : selected.status === 'concluído' ? 'badge-green' : 'badge-gray'}`}>{selected.status}</span></span></div>
          <div className="alert info mt-16">🔔 Lembrete enviado ao tutor 24h antes (UC14). Após concluir, registre o histórico do pet na aba “Histórico do Pet”.</div>
        </Modal>
      )}
    </div>
  )
}
