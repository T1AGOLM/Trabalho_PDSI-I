import React, { useState } from 'react'
import { db } from '../../data'
import { fmtDate, petLabel } from '../../utils'
import { Modal, useToast, Field, EmptyState } from '../../ui'
import type { RegistroSaude } from '../../types'

const TIPO_META: Record<string, { icon: string; label: string }> = {
  'vacina': { icon: '💉', label: 'Vacina' },
  'atendimento': { icon: '🩺', label: 'Atendimento' },
  'banho': { icon: '🛁', label: 'Banho/Tosa' },
  'observação': { icon: '📝', label: 'Observação' },
}

export default function ColabHistorico() {
  const toast = useToast()
  const [petId, setPetId] = useState(1)
  const [regs, setRegs] = useState<RegistroSaude[]>([...db.registrosSaude])
  const [novoOpen, setNovoOpen] = useState(false)
  const [tipo, setTipo] = useState<RegistroSaude['tipo']>('vacina')
  const [data, setData] = useState('2026-09-12')
  const [desc, setDesc] = useState('')

  const doPet = regs
    .filter(r => r.petId === petId)
    .sort((a, b) => b.data.localeCompare(a.data))

  const pet = db.pets.find(p => p.id === petId)

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Histórico do Pet</h1>
          <div className="sub">Linha do tempo de saúde e cuidados (UC13 · RF11)</div>
        </div>
        <button className="btn btn-primary" onClick={() => setNovoOpen(true)}>➕ Novo registro</button>
      </div>

      <div className="filter-bar">
        <div className="field" style={{ minWidth: 280 }}>
          <select value={petId} onChange={e => setPetId(Number(e.target.value))} style={{ width: '100%', border: '1px solid var(--border)', borderRadius: 9, padding: '9px 12px' }}>
            {db.pets.map(p => <option key={p.id} value={p.id}>{p.nome} — {p.raca} (tutor: {db.clientes.find(c => c.id === p.clienteId)?.nome})</option>)}
          </select>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card card-pad">
          <div className="flex mb-16" style={{ gap: 14 }}>
            <div className="stat-icon bg-teal" style={{ width: 54, height: 54, fontSize: 26 }}>🐶</div>
            <div>
              <div className="bold" style={{ fontSize: 16 }}>{pet?.nome}</div>
              <div className="small muted">{pet?.especie} · {pet?.raca} · {pet?.porte} · {pet?.idade} ano(s)</div>
              <div className="tiny muted">Tutor: {db.clientes.find(c => c.id === pet?.clienteId)?.nome}</div>
            </div>
          </div>
          <div className="alert warn" style={{ marginBottom: 0 }}>
            ⚠️ <span><b>Observações de saúde:</b> {pet?.observacoesSaude || 'Nenhuma.'}</span>
          </div>
          <div className="divider" />
          <div className="tiny muted">Total de registros: <b>{doPet.length}</b></div>
        </div>

        <div className="card card-pad">
          {doPet.length === 0 ? <EmptyState icon="📋" title="Nenhum registro para este pet" /> : (
            <div className="timeline">
              {doPet.map(r => (
                <div className="tl-item" key={r.id}>
                  <div className={`tl-dot ${r.tipo}`} />
                  <div className="tl-date">{fmtDate(r.data)} · {TIPO_META[r.tipo].label}</div>
                  <div className="tl-title">{TIPO_META[r.tipo].icon} {TIPO_META[r.tipo].label}</div>
                  <div className="tl-desc">{r.descricao}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {novoOpen && (
        <Modal title={`Novo registro — ${pet?.nome}`} onClose={() => setNovoOpen(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setNovoOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => {
                if (!desc.trim()) { toast('Descreva o registro.', 'err'); return }
                setRegs(rs => [{ id: Math.max(...regs.map(r => r.id)) + 1, petId, data, tipo, descricao: desc }, ...rs])
                setNovoOpen(false); setDesc('')
                toast('Registro adicionado à linha do tempo do pet (UC13).', 'ok')
              }}>✓ Adicionar registro</button>
            </>
          }>
          <div className="form-grid">
            <Field label="Tipo de registro" required>
              <select value={tipo} onChange={e => setTipo(e.target.value as RegistroSaude['tipo'])}>
                <option value="vacina">💉 Vacina</option>
                <option value="atendimento">🩺 Atendimento veterinário</option>
                <option value="banho">🛁 Banho/Tosa</option>
                <option value="observação">📝 Observação</option>
              </select>
            </Field>
            <Field label="Data" required><input type="date" value={data} onChange={e => setData(e.target.value)} /></Field>
            <Field label="Descrição" required full><textarea placeholder="Ex.: V4 aplicada — próxima dose em 09/2027" value={desc} onChange={e => setDesc(e.target.value)} /></Field>
          </div>
          <div className="alert info mt-12" style={{ marginBottom: 0 }}>Vacinas próximas do vencimento geram notificação automática ao tutor (UC15).</div>
        </Modal>
      )}
    </div>
  )
}
