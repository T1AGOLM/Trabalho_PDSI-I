import React, { useState } from 'react'
import { db, sincronizar } from '../../data'
import { api, ApiError } from '../../api'
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

  // Conflito: mesmo colaborador + mesmo dia/hora.
  //
  // Esta verificação é só para dar retorno instantâneo na tela. A decisão
  // final é do BANCO (constraint EXCLUDE de RN01): a chamada abaixo sempre
  // vai ao servidor, e se o banco recusar, mostramos a mensagem dele.
  const temConflito = (colabId: number, day: string, hour: string, ignoreId?: number) =>
    agenda.some(a => a.colaboradorId === colabId && a.dataHora === `${day}T${hour}` && a.id !== ignoreId && a.status !== 'cancelado')

  /** Recarrega `db` e refleta na grade local. */
  const recarregar = async () => {
    await sincronizar()
    setAgenda([...db.agendamentos])
    setBloqueios([...db.bloqueios])
  }

  const openNovo = () => setNovoOpen(true)

  // ---- Ações que vão ao banco -----------------------------------------

  const remarcar = async (ag: Agendamento, dataHora: string) => {
    await api.agendamentos.remarcar(ag.id, dataHora)
    await recarregar()
  }

  const cancelar = async (ag: Agendamento) => {
    await api.agendamentos.cancelar(ag.id, 'Cancelado pela agenda')
    await recarregar()
  }

  const criar = async (novo: Omit<Agendamento, 'id'>) => {
    const r = await api.agendamentos.criar({
      petId: novo.petId,
      servicoId: novo.servicoId,
      colaboradorId: novo.colaboradorId,
      dataHora: novo.dataHora,
    })
    await recarregar()
    return r.id
  }

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
              <button className="btn btn-primary" onClick={async () => {
                const dataHora = `${novaData}T${novaHora}`
                const conflito = temConflito(selected.colaboradorId, novaData, novaHora, selected.id)
                if (conflito) {
                  toast(`Conflito: ${colaboradorNome(selected.colaboradorId)} já possui atendimento em ${fmtDate(novaData)} às ${novaHora} (RN01). Sugerimos 10:00 ou 16:00.`, 'err')
                  return
                }
                try {
                  await remarcar(selected, dataHora)
                  setSelected({ ...selected, dataHora, status: 'confirmado' })
                  setRemarcarOpen(false)
                  toast('Agendamento remarcado e salvo no banco!', 'ok')
                } catch (err) {
                  toast(err instanceof ApiError ? err.message : 'Não foi possível remarcar.', 'err')
                }
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
          onConfirm={async () => {
            try {
              await cancelar(cancelTarget)
              setSelected(null)
              setCancelTarget(null)
              toast('Agendamento cancelado. Horário liberado na agenda.', 'ok')
            } catch (err) {
              toast(err instanceof ApiError ? err.message : 'Não foi possível cancelar.', 'err')
            }
          }} />
      )}

      {/* Novo agendamento */}
      {novoOpen && <NovoAgendamentoModal onClose={() => setNovoOpen(false)}
        onCreate={async (novo) => {
          try {
            const id = await criar(novo)
            setNovoOpen(false)
            toast(`Agendamento #${id} criado com status “confirmado”.`, 'ok')
          } catch (err) {
            toast(err instanceof ApiError ? err.message : 'Não foi possível criar o agendamento.', 'err')
            throw err
          }
        }}
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
  onCreate: (a: Omit<Agendamento, 'id'>) => Promise<void>
  temConflito: (colabId: number, day: string, hour: string, ignoreId?: number) => boolean
}) {
  const toast = useToast()
  // Os valores iniciais vêm do banco: os ids NÃO são sequenciais (os
  // colaboradores, por exemplo, herdam o id do usuário, e varyam entre
  // installs). Fixar "1" e "2" aqui apontaria para pets inexistentes.
  const [petId, setPetId] = useState(String(db.pets[0]?.id ?? ''))
  const [servicoId, setServicoId] = useState(String(db.servicos[0]?.id ?? ''))
  const [colabId, setColabId] = useState(String(db.colaboradores.find(c => c.ativo)?.id ?? ''))
  const [data, setData] = useState('2026-09-14')
  const [hora, setHora] = useState('09:00')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)

  const confirmar = async () => {
    const pid = Number(petId), sid = Number(servicoId), cid = Number(colabId)
    const pet = db.pets.find(p => p.id === pid)
    if (!pet) { setErro('Selecione um pet válido.'); return }
    if (!sid || !cid) { setErro('Selecione serviço e profissional.'); return }
    setErro('')

    if (temConflito(cid, data, hora)) {
      setErro(` RN01 violada: ${colaboradorNome(cid)} já tem atendimento em ${fmtDate(data)} às ${hora}. Tente outro horário.`)
      return
    }

    setSalvando(true)
    try {
      await onCreate({
        petId: pid, clienteId: pet.clienteId, colaboradorId: cid, servicoId: sid,
        dataHora: `${data}T${hora}`, status: 'confirmado',
      })
    } catch {
      setSalvando(false)
      // A mensagem exibida é a devolvida pelo banco (RN01/RN08).
    }
  }

  return (
    <Modal title="Novo agendamento (UC05)" onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={confirmar} disabled={salvando}>
          {salvando ? 'Salvando…' : '✓ Confirmar agendamento'}
        </button>
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
