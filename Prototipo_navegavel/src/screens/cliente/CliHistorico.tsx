import React, { useState } from 'react'
import { db } from '../../data'
import { fmtDate } from '../../utils'
import { EmptyState } from '../../ui'
import { useNav } from '../../shell'

const MEU_ID = 1

const TIPO_META: Record<string, { icon: string; label: string }> = {
  'vacina': { icon: '💉', label: 'Vacina' },
  'atendimento': { icon: '🩺', label: 'Atendimento' },
  'banho': { icon: '🛁', label: 'Banho/Tosa' },
  'observação': { icon: '📝', label: 'Observação' },
}

export default function CliHistorico() {
  const nav = useNav()
  const [petId, setPetId] = useState(1)
  const meusPets = db.pets.filter(p => p.clienteId === MEU_ID)
  const pet = meusPets.find(p => p.id === petId)!

  const regs = db.registrosSaude.filter(r => r.petId === petId).sort((a, b) => b.data.localeCompare(a.data))

  const proximaVacina = regs.find(r => r.tipo === 'vacina')

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Histórico de Saúde</h1>
          <div className="sub">Acompanhe online a linha do tempo de cuidados (UC20 · RF21)</div>
        </div>
      </div>

      <div className="filter-bar">
        {meusPets.map(p => (
          <button key={p.id} className={`btn ${petId === p.id ? 'btn-primary' : 'btn-outline'}`} onClick={() => setPetId(p.id)}>
            {p.especie === 'Gato' ? '🐱' : '🐶'} {p.nome}
          </button>
        ))}
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card card-pad">
          <div className="flex mb-16" style={{ gap: 14 }}>
            <div className="stat-icon bg-teal" style={{ width: 54, height: 54, fontSize: 26 }}>{pet.especie === 'Gato' ? '🐱' : '🐶'}</div>
            <div>
              <div className="bold" style={{ fontSize: 16 }}>{pet.nome}</div>
              <div className="small muted">{pet.especie} · {pet.raca} · {pet.porte} · {pet.idade} ano(s)</div>
            </div>
          </div>
          <div className="alert info" style={{ marginBottom: 0 }}>
            💉 <span>Última vacina registrada: {proximaVacina ? `${fmtDate(proximaVacina.data)} — ${proximaVacina.descricao}` : 'nenhuma'}</span>
          </div>
          <div className="divider" />
          <div className="alert warn" style={{ marginBottom: 0 }}>
            ⚠️ <span><b>Observações:</b> {pet.observacoesSaude || 'Nenhuma.'}</span>
          </div>
        </div>

        <div className="card card-pad">
          {regs.length === 0 ? <EmptyState icon="📋" title="Nenhum registro" /> : (
            <div className="timeline">
              {regs.map(r => (
                <div className="tl-item" key={r.id}>
                  <div className={`tl-dot ${r.tipo}`} />
                  <div className="tl-date">{fmtDate(r.data)} · {TIPO_META[r.tipo].label}</div>
                  <div className="tl-title">{TIPO_META[r.tipo].icon} {TIPO_META[r.tipo].label}</div>
                  <div className="tl-desc">{r.descricao}</div>
                </div>
              ))}
            </div>
          )}
          <div className="alert info mt-16" style={{ marginBottom: 0 }}>💬 Dúvidas sobre algum registro? Fale com a equipe pelo petshop ou agende uma consulta.</div>
          <button className="btn btn-outline btn-block mt-12" onClick={() => nav('cli-agendar')}>📅 Agendar consulta</button>
        </div>
      </div>
    </div>
  )
}
