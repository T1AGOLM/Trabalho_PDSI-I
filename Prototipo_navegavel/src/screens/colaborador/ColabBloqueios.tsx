import React, { useState } from 'react'
import { db, sincronizar } from '../../data'
import { api, ApiError } from '../../api'
import { fmtDate, todayISO } from '../../utils'
import { Modal, ConfirmDialog, useToast, EmptyState, Field } from '../../ui'
import { useMeuId } from '../../shell'
import type { BloqueioAgenda } from '../../types'

export default function ColabBloqueios() {
  const toast = useToast()
  const colaboradorId = useMeuId()
  const [bloqueios, setBloqueios] = useState<BloqueioAgenda[]>([...db.bloqueios])
  const [novoOpen, setNovoOpen] = useState(false)
  const [cancelar, setCancelar] = useState<BloqueioAgenda | null>(null)

  const [inicio, setInicio] = useState(todayISO())
  const [fim, setFim] = useState(todayISO())
  const [motivo, setMotivo] = useState('Folga')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)

  const recarregar = async () => {
    await sincronizar('bloqueios')
    setBloqueios([...db.bloqueios])
  }

  const meus = bloqueios.filter(b => b.colaboradorId === colaboradorId)

  const criar = async () => {
    if (fim < inicio) { setErro('A data final deve ser igual ou posterior à inicial.'); return }
    if (motivo.trim().length < 3) { setErro('Descreva o motivo (mínimo 3 caracteres).'); return }

    // Conferência local para dar a mensagem antes do round-trip; a regra de
    // verdade (RN12) é do banco, que recusa a sobreposição de qualquer forma.
    const conflitos = db.agendamentos.filter(a =>
      a.colaboradorId === colaboradorId &&
      a.status === 'confirmado' &&
      a.dataHora.slice(0, 10) >= inicio && a.dataHora.slice(0, 10) <= fim
    )
    if (conflitos.length > 0) {
      setErro(`RN12: você possui ${conflitos.length} agendamento(s) confirmado(s) neste período. Remarque ou cancele antes de bloquear.`)
      return
    }

    setErro('')
    setEnviando(true)
    try {
      await api.bloqueios.criar({ colaboradorId, dataInicio: inicio, dataFim: fim, motivo })
      await recarregar()
      setNovoOpen(false)
      toast('Bloqueio registrado no banco. Novos agendamentos ficam impedidos no período (RF30).', 'ok')
    } catch (err) {
      setErro(err instanceof ApiError ? err.mensagem : 'Não foi possível registrar o bloqueio.')
    } finally {
      setEnviando(false)
    }
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
                const futuro = b.dataFim >= todayISO()
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
              <button className="btn btn-primary" disabled={enviando} onClick={criar}>✓ Registrar bloqueio</button>
            </>
          }>
          {erro && <div className="alert danger">{erro}</div>}
          <div className="form-grid">
            <Field label="Início" required><input type="date" value={inicio} onChange={e => setInicio(e.target.value)} /></Field>
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
          onConfirm={async () => {
            try {
              await api.bloqueios.remover(cancelar.id)
              await recarregar()
              setCancelar(null); toast('Bloqueio removido.', 'ok')
            } catch (err) {
              toast(err instanceof ApiError ? err.mensagem : 'Não foi possível remover.', 'err')
            }
          }} />
      )}
    </div>
  )
}
