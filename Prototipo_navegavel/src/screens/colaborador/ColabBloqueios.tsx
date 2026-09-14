import React, { useState } from 'react'
import { db } from '../../data'
import { fmtDate } from '../../utils'
import { Modal, ConfirmDialog, useToast, EmptyState, Field } from '../../ui'
import type { BloqueioAgenda } from '../../types'

const ID_COLAB = 1

export default function ColabBloqueios() {
  const toast = useToast()
  const [bloqueios, setBloqueios] = useState<BloqueioAgenda[]>([...db.bloqueios])
  const [novoOpen, setNovoOpen] = useState(false)
  const [cancelar, setCancelar] = useState<BloqueioAgenda | null>(null)

  const inicio = useState('2026-09-18')[0]
  const [fim, setFim] = useState('2026-09-18')
  const [motivo, setMotivo] = useState('Folga')
  const [erro, setErro] = useState('')

  const meus = bloqueios.filter(b => b.colaboradorId === ID_COLAB)

  const criar = () => {
    // RN12: bloqueio não pode sobrepor agendamentos confirmados
    const conflitos = db.agendamentos.filter(a =>
      a.colaboradorId === ID_COLAB &&
      a.status === 'confirmado' &&
      a.dataHora.slice(0, 10) >= inicio && a.dataHora.slice(0, 10) <= fim
    )
    if (conflitos.length > 0) {
      setErro(`RN12 violada: você possui ${conflitos.length} agendamento(s) confirmado(s) neste período. Remarque ou cancele antes de bloquear.`)
      return
    }
    setBloqueios(bs => [...bs, { id: Math.max(...bloqueios.map(b => b.id)) + 1, colaboradorId: ID_COLAB, dataInicio: inicio, dataFim: fim, motivo }])
    setNovoOpen(false)
    toast('Bloqueio registrado. Novos agendamentos ficam impedidos no período (RF30).', 'ok')
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Bloqueios de Agenda</h1>
          <div className="sub">Férias, folgas e ausências (UC25 · RF30/RN12)</div>
        </div>
        <button className="btn btn-primary" onClick={() => setNovoOpen(true)}>➕ Novo bloqueio</button>
      </div>

      {meus.length === 0 ? <div className="card"><EmptyState icon="🚫" title="Nenhum bloqueio cadastrado" sub="Bloqueie períodos em que você não poderá receber agendamentos." /></div> : (
        <div className="card">
          <table className="tbl">
            <thead><tr><th>Período</th><th>Motivo</th><th>Status</th><th className="right">Ações</th></tr></thead>
            <tbody>
              {meus.map(b => {
                const futuro = b.dataFim >= '2026-09-12'
                return (
                  <tr key={b.id}>
                    <td className="bold">{fmtDate(b.dataInicio)} → {fmtDate(b.dataFim)}</td>
                    <td>{b.motivo}</td>
                    <td><span className={`badge ${futuro ? 'badge-amber' : 'badge-gray'}`}>{futuro ? 'programado' : 'encerrado'}</span></td>
                    <td>
                      <div className="actions">
                        {futuro && <button className="btn btn-danger btn-sm" onClick={() => setCancelar(b)}>Remover</button>}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      <div className="alert info mt-16">🧠 Enquanto houver bloqueio ativo, o sistema impede automaticamente novos agendamentos para você no período informado (RF30).</div>

      {novoOpen && (
        <Modal title="Novo bloqueio de agenda (UC25)" onClose={() => setNovoOpen(false)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setNovoOpen(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={criar}>✓ Registrar bloqueio</button>
            </>
          }>
          {erro && <div className="alert danger">{erro}</div>}
          <div className="form-grid">
            <Field label="Início" required><input type="date" value={inicio} readOnly /></Field>
            <Field label="Fim" required><input type="date" value={fim} onChange={e => setFim(e.target.value)} /></Field>
            <Field label="Motivo" required full>
              <select value={motivo} onChange={e => setMotivo(e.target.value)}>
                {['Folga', 'Férias', 'Atendimento externo', 'Compromisso pessoal', 'Capacitação'].map(m => <option key={m}>{m}</option>)}
              </select>
            </Field>
          </div>
          <div className="alert info mt-12" style={{ marginBottom: 0 }}>O sistema valida sobreposição com agendamentos já confirmados (UC06/RN12) antes de registrar.</div>
        </Modal>
      )}

      {cancelar && (
        <ConfirmDialog danger title="Remover bloqueio?"
          message={`O bloqueio de ${fmtDate(cancelar.dataInicio)} a ${fmtDate(cancelar.dataFim)} será removido e o período voltará a aceitar agendamentos.`}
          confirmLabel="Remover"
          onCancel={() => setCancelar(null)}
          onConfirm={() => {
            setBloqueios(bs => bs.filter(b => b.id !== cancelar.id))
            setCancelar(null); toast('Bloqueio removido.', 'ok')
          }} />
      )}
    </div>
  )
}
