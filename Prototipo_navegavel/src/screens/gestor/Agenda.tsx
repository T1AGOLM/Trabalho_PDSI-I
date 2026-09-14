import React, { useState } from 'react'
import { db } from '../../data'
import { fmtDate, weekdayShort, dayNum, petLabel, servicoLabel, colaboradorNome, clienteNome, fmtDateTime } from '../../utils'
import { Modal, ConfirmDialog, useToast, EmptyState, Field } from '../../ui'
import type { Agendamento } from '../../types'

const HOURS = ['08:00', '09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00']
const COLORS = ['#2a9d8f', '#b06f1d', '#2b7fc9', '#7c5cbf', '#c94f7c']

export default function Agenda() {
  const toast = useToast()
  const [agenda, setAgenda] = useState<Agendamento[]>([...db.agendamentos])
  const [bloqueios, setBloqueios] = useState([...db.bloqueios])
  const [selected, setSelected] = useState<Agendamento | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Agendamento | null>(null)
  const [novoOpen, setNovoOpen] = useState(false)
  const [remarcarOpen, setRemarcarOpen] = useState(false)
  const [novaData, setNovaData] = useState('2026-09-14')
  const [novaHora, setNovaHora] = useState('09:00')

  const dias = ['2026-09-07', '2026-09-08', '2026-09-09', '2026-09-10', '2026-09-11', '2026-09-12', '2026-09-13']

  const evColor = (colabId: number) => COLORS[colabId % COLORS.length]

  const eventsAt = (day: string, hour: string) =>
    agenda.filter(a => a.dataHora === `${day}T${hour}`)

  const bloqueioAt = (day: string) =>
    bloqueios.find(b => day >= b.dataInicio && day <= b.dataFim)

  // conflito: mesmo colaborador + mesmo dia/hora
  const temConflito = (colabId: number, day: string, hour: string, ignoreId?: number) =>
    agenda.some(a => a.colaboradorId === colabId && a.dataHora === `${day}T${hour}` && a.id !== ignoreId && a.status !== 'cancelado')

  const openNovo = () => setNovoOpen(true)

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Agenda da semana</h1>
          <div className="sub">07/09 a 13/09/2026 · clique em um agendamento para detalhes (UC05–UC07)</div>
        </div>
        <button className="btn btn-primary" onClick={openNovo}>➕ Novo agendamento</button>
      </div>

      <div className="filter-bar">
        <div className="search-box">
          <span className="s-ico">🔍</span>
          <input placeholder="Filtrar por pet, cliente ou profissional..." />
        </div>
        <select className="field" style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)' }}>
          <option>Todos os profissionais</option>
          {db.colaboradores.filter(c => c.ativo).map(c => <option key={c.id}>{c.nome}</option>)}
        </select>
        <select className="field" style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)' }}>
          <option>Todos os status</option>
          <option>Confirmado</option><option>Concluído</option><option>Cancelado</option>
        </select>
        <div className="flex" style={{ marginLeft: 'auto', gap: 12 }}>
          <span className="flex tiny muted"><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--primary)' }} /> Confirmado</span>
          <span className="flex tiny muted"><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--success)' }} /> Concluído</span>
          <span className="flex tiny muted"><span style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--warn)' }} /> Bloqueio</span>
        </div>
      </div>

      <div className="agenda-grid">
        <div className="agenda-cell head" />
        {dias.map(d => (
          <div key={d} className={`agenda-cell head ${d === '2026-09-12' ? 'today' : ''}`}>
            {weekdayShort(d)} {dayNum(d)}
          </div>
        ))}

        {HOURS.map(h => (
          <React.Fragment key={h}>
            <div className="agenda-cell time">{h}</div>
            {dias.map(d => {
              const blq = bloqueioAt(d)
              const evs = eventsAt(d, h)
              return (
                <div key={d + h} className={`agenda-cell ${d === '2026-09-12' ? 'today' : ''} ${h > '16:00' ? 'hide-sm' : ''}`}>
                  {evs.map(a => (
                    <div key={a.id}
                      className={`agenda-ev ev-${a.status}`}
                      style={{ borderLeftColor: evColor(a.colaboradorId) }}
                      onClick={() => setSelected(a)}>
                      <b>{fmtTimeShort(a.dataHora)}</b> {petLabel(a.petId).split(' ·')[0]}
                      <div className="tiny">{servicoLabel(a.servicoId)}</div>
                    </div>
                  ))}
                  {blq && evs.length === 0 && <div className="agenda-ev ev-bloqueio">🚫 Bloqueado</div>}
                </div>
              )
            })}
          </React.Fragment>
        ))}
      </div>

      {/* Detalhes do agendamento */}
      {selected && (
        <Modal title={`Agendamento #${selected.id}`} onClose={() => setSelected(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => { setRemarcarOpen(true) }}>📅 Remarcar</button>
              <button className="btn btn-danger" onClick={() => setCancelTarget(selected)} disabled={selected.status === 'cancelado'}>✕ Cancelar agendamento</button>
              <button className="btn btn-primary" onClick={() => setSelected(null)}>Fechar</button>
            </>
          }>
          <div className="kv"><span className="k">Pet</span><span className="v">{petLabel(selected.petId)}</span></div>
          <div className="kv"><span className="k">Tutor</span><span className="v">{clienteNome(selected.clienteId)}</span></div>
          <div className="kv"><span className="k">Serviço</span><span className="v">{servicoLabel(selected.servicoId)}</span></div>
          <div className="kv"><span className="k">Profissional</span><span className="v">{colaboradorNome(selected.colaboradorId)}</span></div>
          <div className="kv"><span className="k">Data e hora</span><span className="v">{fmtDateTime(selected.dataHora)}</span></div>
          <div className="kv"><span className="k">Status</span><span className="v"><span className={`badge ${selected.status === 'confirmado' ? 'badge-teal' : selected.status === 'concluído' ? 'badge-green' : 'badge-gray'}`}>{selected.status}</span></span></div>
          <div className="kv"><span className="k">Valor</span><span className="v">R$ {getServicoPreco(selected.servicoId)},00</span></div>
          <div className="alert info mt-16">🔔 Lembrete por e-mail enviado 24h antes (UC14) · status “{selected.status}”.</div>
        </Modal>
      )}

      {/* Remarcar */}
      {remarcarOpen && selected && (
        <Modal title="Remarcar agendamento" onClose={() => setRemarcarOpen(false)} size="narrow"
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setRemarcarOpen(false)}>Voltar</button>
              <button className="btn btn-primary" onClick={() => {
                const conflito = temConflito(selected.colaboradorId, novaData, novaHora, selected.id)
                if (conflito) {
                  toast(`Conflito: ${colaboradorNome(selected.colaboradorId)} já possui atendimento em ${fmtDate(novaData)} às ${novaHora} (RN01). Sugerimos 10:00 ou 16:00.`, 'err')
                  return
                }
                setAgenda(ag => ag.map(a => a.id === selected.id ? { ...a, dataHora: `${novaData}T${novaHora}`, status: 'confirmado' } : a))
                setSelected({ ...selected, dataHora: `${novaData}T${novaHora}`, status: 'confirmado' })
                setRemarcarOpen(false)
                toast('Agendamento remarcado com sucesso!', 'ok')
              }}>Confirmar remarcação</button>
            </>
          }>
          <div className="form-grid">
            <Field label="Nova data">
              <input type="date" value={novaData} onChange={e => setNovaData(e.target.value)} />
            </Field>
            <Field label="Novo horário">
              <select value={novaHora} onChange={e => setNovaHora(e.target.value)}>
                {HOURS.map(h => <option key={h}>{h}</option>)}
              </select>
            </Field>
          </div>
          <div className="alert info mt-12">O sistema valida conflito de horário do profissional antes de confirmar (UC06).</div>
        </Modal>
      )}

      {/* Cancelar */}
      {cancelTarget && (
        <ConfirmDialog danger title="Cancelar agendamento?"
          message={`O atendimento de ${petLabel(cancelTarget.petId)} em ${fmtDateTime(cancelTarget.dataHora)} será cancelado e o horário do profissional será liberado (RN04).`}
          confirmLabel="Sim, cancelar"
          onCancel={() => setCancelTarget(null)}
          onConfirm={() => {
            setAgenda(ag => ag.map(a => a.id === cancelTarget.id ? { ...a, status: 'cancelado' } : a))
            setSelected(null)
            setCancelTarget(null)
            toast('Agendamento cancelado. Horário liberado na agenda.', 'ok')
          }} />
      )}

      {/* Novo agendamento */}
      {novoOpen && <NovoAgendamentoModal onClose={() => setNovoOpen(false)}
        onCreate={(novo) => { setAgenda(ag => [...ag, novo]); setNovoOpen(false); toast('Agendamento criado com status “confirmado”.', 'ok') }}
        temConflito={temConflito} />}
    </div>
  )
}

function fmtTimeShort(iso: string) { return iso.split('T')[1].slice(0, 5) }

function getServicoPreco(id: number) {
  const s = db.servicos.find(x => x.id === id)
  return s ? s.preco.toFixed(2).replace('.', ',') : '—'
}

function NovoAgendamentoModal({ onClose, onCreate, temConflito }: {
  onClose: () => void
  onCreate: (a: Agendamento) => void
  temConflito: (colabId: number, day: string, hour: string, ignoreId?: number) => boolean
}) {
  const toast = useToast()
  const [petId, setPetId] = useState('1')
  const [servicoId, setServicoId] = useState('1')
  const [colabId, setColabId] = useState('2')
  const [data, setData] = useState('2026-09-14')
  const [hora, setHora] = useState('09:00')
  const [erro, setErro] = useState('')

  const criar = () => {
    const pid = Number(petId), sid = Number(servicoId), cid = Number(colabId)
    const pet = db.pets.find(p => p.id === pid)!
    if (temConflito(cid, data, hora)) {
      setErro(` RN01 violada: ${colaboradorNome(cid)} já tem atendimento em ${fmtDate(data)} às ${hora}. Tente outro horário.`)
      return
    }
    onCreate({
      id: Math.max(...db.agendamentos.map(a => a.id)) + 1,
      petId: pid, clienteId: pet.clienteId, colaboradorId: cid, servicoId: sid,
      dataHora: `${data}T${hora}`, status: 'confirmado',
    })
  }

  return (
    <Modal title="Novo agendamento (UC05)" onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={criar}>✓ Confirmar agendamento</button>
        </>
      }>
      {erro && <div className="alert danger">{erro}</div>}
      <div className="form-grid">
        <Field label="Pet" required>
          <select value={petId} onChange={e => setPetId(e.target.value)}>
            {db.pets.map(p => <option key={p.id} value={p.id}>{p.nome} — {clienteNome(p.clienteId)}</option>)}
          </select>
        </Field>
        <Field label="Serviço" required>
          <select value={servicoId} onChange={e => setServicoId(e.target.value)}>
            {db.servicos.map(s => <option key={s.id} value={s.id}>{s.nome} ({s.duracao} min · R$ {s.preco.toFixed(2).replace('.', ',')})</option>)}
          </select>
        </Field>
        <Field label="Profissional" required>
          <select value={colabId} onChange={e => setColabId(e.target.value)}>
            {db.colaboradores.filter(c => c.ativo).map(c => <option key={c.id} value={c.id}>{c.nome} — {c.cargo}</option>)}
          </select>
        </Field>
        <Field label="Data" required>
          <input type="date" value={data} onChange={e => setData(e.target.value)} />
        </Field>
        <Field label="Horário" required>
          <select value={hora} onChange={e => setHora(e.target.value)}>
            {HOURS.map(h => <option key={h}>{h}</option>)}
          </select>
        </Field>
      </div>
      <div className="alert info mt-12">Validação automática: o sistema impede dois serviços para o mesmo profissional no mesmo intervalo (RF05/RN01).</div>
    </Modal>
  )
}
