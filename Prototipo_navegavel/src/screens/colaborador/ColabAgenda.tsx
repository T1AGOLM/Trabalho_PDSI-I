import React, { useState } from 'react'
import { api, ApiError } from '../../api'
import { fmtDate, fmtDateTime, petLabel, servicoLabel, clienteNome, dataLocalISO, adicionarDias, diasDaSemana } from '../../utils'
import { Modal, ConfirmDialog, useToast } from '../../ui'
import { useSession } from '../../shell'
import { useAgenda } from '../../useAgenda'
import type { Agendamento } from '../../types'

export default function ColabAgenda() {
  const toast = useToast()
  const sessao = useSession()!
  const [referencia, setReferencia] = useState(dataLocalISO)
  const dias = diasDaSemana(referencia)
  const hoje = dataLocalISO()
  const { agendamentos, carregando, erro, atualizar } = useAgenda(dias[0], dias[6], sessao.id)
  const ags = agendamentos.filter(a => a.colaboradorId === sessao.id)
  const [selected, setSelected] = useState<Agendamento | null>(null)
  const [cancelar, setCancelar] = useState<Agendamento | null>(null)
  const [salvando, setSalvando] = useState(false)
  const doDia = (dia: string) => ags.filter(a => a.dataHora.startsWith(dia) && a.status !== 'cancelado')

  const concluir = async () => {
    if (!selected) return
    setSalvando(true)
    try {
      await api.agendamentos.concluir(selected.id)
      setSelected(null)
      await atualizar()
      toast('Atendimento concluído e salvo no banco.', 'ok')
    } catch (err) {
      toast(err instanceof ApiError ? err.mensagem : 'Não foi possível concluir o atendimento.', 'err')
    } finally { setSalvando(false) }
  }

  return (
    <div>
      <div className="page-head"><div>
        <h1>Minha Agenda</h1>
        <div className="sub">{sessao.nome} · {fmtDate(dias[0])} a {fmtDate(dias[6])}</div>
      </div></div>
      <div className="filter-bar" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-outline" onClick={() => setReferencia(adicionarDias(referencia, -7))}>← Semana anterior</button>
        <label>Data da agenda <input aria-label="Data da agenda" type="date" value={referencia} onChange={e => { if (e.target.value) setReferencia(e.target.value) }} /></label>
        <button className="btn btn-outline" onClick={() => setReferencia(hoje)}>Hoje</button>
        <button className="btn btn-outline" onClick={() => setReferencia(adicionarDias(referencia, 7))}>Próxima semana →</button>
        <button className="btn btn-outline" disabled={carregando} onClick={() => void atualizar()}>Atualizar agenda</button>
      </div>
      {erro && <div className="alert danger" role="alert">{erro}</div>}
      {carregando && <div className="alert info" role="status">Carregando agenda…</div>}
      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon bg-teal">📆</div><div><div className="stat-value">{doDia(referencia).length}</div><div className="stat-label">Atendimentos em {fmtDate(referencia)}</div></div></div>
        <div className="stat-card"><div className="stat-icon bg-green">✅</div><div><div className="stat-value">{ags.filter(a => a.status === 'concluído').length}</div><div className="stat-label">Concluídos (semana)</div></div></div>
        <div className="stat-card"><div className="stat-icon bg-orange">🗓️</div><div><div className="stat-value">{ags.filter(a => a.status === 'confirmado').length}</div><div className="stat-label">Confirmados (semana)</div></div></div>
      </div>
      <div className="card">
        <div className="card-head"><h3>Semana selecionada</h3><span className="hint">clique em um atendimento para ver os detalhes</span></div>
        <div className="card-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 12 }}>
          {dias.map(dia => (
            <div key={dia} className="card" style={{ padding: 14, borderColor: dia === hoje ? 'var(--primary)' : 'var(--border)' }}>
              <div className="flex-between mb-12"><b className="small">{fmtDate(dia)}</b><span className="badge badge-gray">{doDia(dia).length} atend.</span></div>
              {doDia(dia).length === 0 ? (
                <div className="tiny muted center" style={{ padding: '14px 0' }}>{carregando ? 'Carregando…' : erro ? 'Consulta indisponível' : 'Nenhum atendimento neste dia.'}</div>
              ) : doDia(dia).sort((a, b) => a.dataHora.localeCompare(b.dataHora)).map(a => (
                <div key={a.id} data-agendamento-id={a.id} className={`agenda-ev ev-${a.status}`} style={{ marginBottom: 6 }} onClick={() => setSelected(a)}>
                  <b>{a.dataHora.slice(11, 16)}</b> {petLabel(a.petId).split(' ·')[0]}
                  <div className="tiny">{servicoLabel(a.servicoId)}</div>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      {selected && (
        <Modal title={`Atendimento #${selected.id}`} onClose={() => { if (!salvando) setSelected(null) }} footer={<>
          {selected.status === 'confirmado' && <>
            <button className="btn btn-outline" disabled={salvando} onClick={() => void concluir()}>✓ Marcar como concluído</button>
            <button className="btn btn-danger" disabled={salvando} onClick={() => setCancelar(selected)}>✕ Cancelar</button>
          </>}
          <button className="btn btn-primary" disabled={salvando} onClick={() => setSelected(null)}>Fechar</button>
        </>}>
          <div className="kv"><span className="k">Pet</span><span className="v">{petLabel(selected.petId)}</span></div>
          <div className="kv"><span className="k">Tutor</span><span className="v">{clienteNome(selected.clienteId)}</span></div>
          <div className="kv"><span className="k">Serviço</span><span className="v">{servicoLabel(selected.servicoId)}</span></div>
          <div className="kv"><span className="k">Data e hora</span><span className="v">{fmtDateTime(selected.dataHora)}</span></div>
          <div className="kv"><span className="k">Status</span><span className="v">{selected.status}</span></div>
        </Modal>
      )}
      {cancelar && <ConfirmDialog danger title="Cancelar atendimento?" message={`Cancelar o atendimento de ${petLabel(cancelar.petId)} em ${fmtDateTime(cancelar.dataHora)}?`} confirmLabel="Sim, cancelar" onCancel={() => { if (!salvando) setCancelar(null) }} onConfirm={async () => {
        if (salvando) return
        setSalvando(true)
        try {
          await api.agendamentos.cancelar(cancelar.id, 'Cancelado pelo profissional responsável')
          setCancelar(null); setSelected(null)
          await atualizar()
          toast('Atendimento cancelado no banco. Horário liberado.', 'ok')
        } catch (err) {
          toast(err instanceof ApiError ? err.mensagem : 'Não foi possível cancelar o atendimento.', 'err')
        } finally { setSalvando(false) }
      }} />}
    </div>
  )
}