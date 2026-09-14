import React, { useState } from 'react'
import { db } from '../../data'
import { brl, fmtDateTime, petLabel, servicoLabel, colaboradorNome } from '../../utils'
import { Modal, ConfirmDialog, useToast, EmptyState, Field } from '../../ui'
import type { Agendamento } from '../../types'

const MEU_ID = 1

export default function CliAgendamentos() {
  const toast = useToast()
  const [ags, setAgs] = useState<Agendamento[]>([...db.agendamentos])
  const [avaliacoes, setAvaliacoes] = useState([...db.avaliacoes])
  const [cancelar, setCancelar] = useState<Agendamento | null>(null)
  const [avaliar, setAvaliar] = useState<Agendamento | null>(null)
  const [nota, setNota] = useState(5)
  const [comentario, setComentario] = useState('')

  const meus = ags.filter(a => a.clienteId === MEU_ID)
  const futuros = meus.filter(a => a.status === 'confirmado').sort((a, b) => a.dataHora.localeCompare(b.dataHora))
  const historico = meus.filter(a => a.status !== 'confirmado').sort((a, b) => b.dataHora.localeCompare(a.dataHora))

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Meus Agendamentos</h1>
          <div className="sub">Acompanhe, remarque ou cancele (UC07) · avalie serviços concluídos (UC23)</div>
        </div>
        <a className="btn btn-primary" href="#/cli-agendar">➕ Novo agendamento</a>
      </div>

      <h3 className="mb-12" style={{ fontSize: 15 }}>Próximos</h3>
      {futuros.length === 0 ? <div className="card mb-20"><EmptyState icon="📭" title="Nenhum agendamento futuro" sub="Agende um serviço em poucos cliques." /></div> : (
        <div className="grid-2 mb-20">
          {futuros.map(a => (
            <div className="card card-pad" key={a.id}>
              <div className="flex-between mb-12">
                <div className="flex" style={{ gap: 11 }}>
                  <div className="stat-icon bg-teal">{db.pets.find(p => p.id === a.petId)?.especie === 'Gato' ? '🐱' : '🐶'}</div>
                  <div>
                    <div className="bold">{servicoLabel(a.servicoId)}</div>
                    <div className="tiny muted">{petLabel(a.petId)} · {colaboradorNome(a.colaboradorId)}</div>
                  </div>
                </div>
                <span className="badge badge-teal">confirmado</span>
              </div>
              <div className="kv"><span className="k">Quando</span><span className="v">{fmtDateTime(a.dataHora)}</span></div>
              <div className="kv"><span className="k">Valor</span><span className="v">{brl(db.servicos.find(s => s.id === a.servicoId)?.preco ?? 0)}</span></div>
              <div className="flex mt-12" style={{ justifyContent: 'flex-end', gap: 8 }}>
                <button className="btn btn-outline btn-sm" onClick={() => toast('Remarcação: escolha uma nova data no fluxo de agendamento (simulado).', 'info')}>📅 Remarcar</button>
                <button className="btn btn-danger btn-sm" onClick={() => setCancelar(a)}>✕ Cancelar</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <h3 className="mb-12" style={{ fontSize: 15 }}>Histórico</h3>
      <div className="card">
        <div className="table-wrap">
          {historico.length === 0 ? <EmptyState icon="🗂" title="Sem histórico ainda" /> : (
            <table className="tbl">
              <thead><tr><th>Data</th><th>Serviço</th><th>Pet</th><th>Status</th><th>Avaliação</th></tr></thead>
              <tbody>
                {historico.map(a => {
                  const av = avaliacoes.find(x => x.agendamentoId === a.id)
                  return (
                    <tr key={a.id}>
                      <td className="small">{fmtDateTime(a.dataHora)}</td>
                      <td className="bold">{servicoLabel(a.servicoId)}</td>
                      <td>{petLabel(a.petId)}</td>
                      <td><span className={`badge ${a.status === 'concluído' ? 'badge-green' : 'badge-gray'}`}>{a.status}</span></td>
                      <td>
                        {av ? <span className="stars">{'★'.repeat(av.nota)}{'☆'.repeat(5 - av.nota)}</span>
                          : a.status === 'concluído'
                            ? <button className="btn btn-accent btn-sm" onClick={() => { setAvaliar(a); setNota(5); setComentario('') }}>⭐ Avaliar</button>
                            : <span className="tiny muted">—</span>}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {cancelar && (
        <ConfirmDialog danger title="Cancelar agendamento?"
          message={`O ${servicoLabel(cancelar.servicoId)} de ${fmtDateTime(cancelar.dataHora)} será cancelado e o horário do profissional liberado (RN04).`}
          confirmLabel="Sim, cancelar"
          onCancel={() => setCancelar(null)}
          onConfirm={() => {
            setAgs(as => as.map(a => a.id === cancelar.id ? { ...a, status: 'cancelado' } : a))
            setCancelar(null)
            toast('Agendamento cancelado.', 'ok')
          }} />
      )}

      {avaliar && (
        <Modal title={`Avaliar serviço — ${servicoLabel(avaliar.servicoId)}`} onClose={() => setAvaliar(null)} size="narrow"
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setAvaliar(null)}>Agora não</button>
              <button className="btn btn-primary" onClick={() => {
                setAvaliacoes(vs => [...vs, { id: Math.max(...db.avaliacoes.map(v => v.id)) + 1, agendamentoId: avaliar.id, clienteId: MEU_ID, nota, comentario, data: '2026-09-12T18:00' }])
                setAvaliar(null)
                toast('Obrigado! Sua avaliação foi registrada (UC23).', 'ok')
              }}>Enviar avaliação</button>
            </>
          }>
          <div className="center mb-16">
            <div className="stars" style={{ fontSize: 34 }}>
              {[1, 2, 3, 4, 5].map(n => (
                <span key={n} style={{ cursor: 'pointer' }} onClick={() => setNota(n)}>{n <= nota ? '★' : '☆'}</span>
              ))}
            </div>
            <div className="small muted">{['Ruim', 'Regular', 'Bom', 'Muito bom', 'Excelente!'][nota - 1]}</div>
          </div>
          <Field label="Comentário (opcional)" full>
            <textarea placeholder="Conte como foi o atendimento..." value={comentario} onChange={e => setComentario(e.target.value)} />
          </Field>
        </Modal>
      )}
    </div>
  )
}
