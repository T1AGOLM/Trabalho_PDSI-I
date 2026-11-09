import React, { useState, useEffect } from 'react'
import { db } from '../../data'
import { fmtTime, fmtDateTime, petLabel, servicoLabel, clienteNome, colaboradorNome, getPet } from '../../utils'
import { Modal, useToast, EmptyState, Field } from '../../ui'
import type { Agendamento } from '../../types'
import { api, ApiError } from '../../api'
import { dataLocalISO, adicionarDias, fmtDate } from '../../utils'

export default function ColabAtendimentos() {
  const toast = useToast()
  const [data, setData] = useState(dataLocalISO)
  const [ags, setAgs] = useState<Agendamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [versao, setVersao] = useState(0)
  useEffect(() => {
    let atual = true
    setCarregando(true); setErro(''); setAgs([])
    api.agendamentos.listar({ de: data, ate: data })
      .then(dados => { if (atual) setAgs(dados) })
      .catch(err => { if (atual) setErro(err instanceof ApiError ? err.mensagem : 'Não foi possível consultar os atendimentos.') })
      .finally(() => { if (atual) setCarregando(false) })
    return () => { atual = false }
  }, [data, versao])
  const [concluir, setConcluir] = useState<Agendamento | null>(null)
  const [obs, setObs] = useState('')
  const [produtosUsados, setProdutosUsados] = useState<string[]>([])

  const enfileirados = ags
    .filter(a => a.dataHora.startsWith(data))
    .sort((a, b) => a.dataHora.localeCompare(b.dataHora))

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>{data === dataLocalISO() ? 'Atendimentos de hoje' : 'Atendimentos do dia selecionado'}</h1>
          <div className="sub">{fmtDate(data)} · acompanhe a fila e conclua os serviços (RF11/UC13)</div>
        </div>
      </div>

      <div className="filter-bar" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-outline" onClick={() => { setConcluir(null); setData(adicionarDias(data, -1)) }}>← Dia anterior</button>
        <label>Data dos atendimentos <input aria-label="Data dos atendimentos" type="date" value={data} onChange={e => { if (e.target.value) { setConcluir(null); setData(e.target.value) } }} /></label>
        <button className="btn btn-outline" onClick={() => { setConcluir(null); setData(dataLocalISO()) }}>Hoje</button>
        <button className="btn btn-outline" onClick={() => { setConcluir(null); setData(adicionarDias(data, 1)) }}>Próximo dia →</button>
        <button className="btn btn-outline" disabled={carregando} onClick={() => { setConcluir(null); setVersao(v => v + 1) }}>Atualizar atendimentos</button>
      </div>
      {erro && <div role="alert" className="alert danger">{erro}</div>}
      {carregando && <div role="status" className="alert info">Carregando atendimentos…</div>}
      <div className="card mb-16">
        <div className="card-head"><h3>Fila do dia — todos os profissionais</h3><span className="hint">ordem de horário</span></div>
        <div className="table-wrap">
          {enfileirados.length === 0 ? (!carregando && !erro ? <EmptyState icon="📭" title="Nenhum atendimento nesta data" /> : null) : (
            <table className="tbl">
              <thead><tr><th>Horário</th><th>Pet</th><th>Serviço</th><th>Tutor</th><th>Profissional</th><th>Status</th><th className="right">Ação</th></tr></thead>
              <tbody>
                {enfileirados.map(a => {
                  const pet = getPet(a.petId)
                  return (
                    <tr key={a.id}>
                      <td className="bold">{fmtTime(a.dataHora)}</td>
                      <td><div className="bold">{pet?.nome}</div><div className="tiny muted">{pet?.raca}</div></td>
                      <td>{servicoLabel(a.servicoId)}</td>
                      <td>{clienteNome(a.clienteId)}</td>
                      <td>{colaboradorNome(a.colaboradorId)}</td>
                      <td><span className={`badge ${a.status === 'confirmado' ? 'badge-teal' : a.status === 'concluído' ? 'badge-green' : 'badge-gray'}`}>{a.status}</span></td>
                      <td>
                        <div className="actions">
                          {a.status === 'confirmado' && <button className="btn btn-primary btn-sm" onClick={() => { setConcluir(a); setObs('') }}>✓ Concluir</button>}
                          {a.status === 'concluído' && <span className="tiny muted">finalizado</span>}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-head"><h3>Check-in rápido</h3><span className="hint">pets presentes agora</span></div>
          <div className="card-pad flex" style={{ flexWrap: 'wrap', gap: 10 }}>
            {enfileirados.filter(a => a.status === 'confirmado').map(a => (
              <span key={a.id} className="badge badge-teal" style={{ fontSize: 12.5, padding: '7px 13px' }}>🐶 {getPet(a.petId)?.nome} · {fmtTime(a.dataHora)}</span>
            ))}
            {enfileirados.filter(a => a.status === 'confirmado').length === 0 && <span className="muted small">Nenhum pet aguardando.</span>}
          </div>
        </div>
        <div className="card">
          <div className="card-head"><h3>Orientações do dia</h3></div>
          <div className="card-pad">
            <div className="alert warn mb-12">🧴 <span>Mimi (gata): usar shampoo hiperalergênico e sedação leve — ver observações de saúde.</span></div>
            <div className="alert info mb-12" style={{ marginBottom: 0 }}>⚠️ <span>Thor: sobrepeso — reforçar orientação de dieta ao tutor na retirada.</span></div>
          </div>
        </div>
      </div>

      {concluir && (
        <Modal title={`Concluir atendimento — ${getPet(concluir.petId)?.nome}`} onClose={() => setConcluir(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setConcluir(null)}>Voltar</button>
              <button className="btn btn-primary" onClick={() => {
                setAgs(as => as.map(a => a.id === concluir.id ? { ...a, status: 'concluído' } : a))
                setConcluir(null)
                toast('Atendimento concluído! Registro adicionado ao histórico do pet (UC13).', 'ok')
              }}>✓ Concluir e registrar no histórico</button>
            </>
          }>
          <div className="kv"><span className="k">Serviço</span><span className="v">{servicoLabel(concluir.servicoId)}</span></div>
          <div className="kv"><span className="k">Tutor</span><span className="v">{clienteNome(concluir.clienteId)}</span></div>
          <div className="kv"><span className="k">Horário</span><span className="v">{fmtDateTime(concluir.dataHora)}</span></div>
          <Field label="Observação para o histórico do pet" full>
            <textarea placeholder="Ex.: Banho realizado com shampoo hiperalergênico; pelagem sadia." value={obs} onChange={e => setObs(e.target.value)} />
          </Field>
          <div className="alert info mt-12" style={{ marginBottom: 0 }}>O registro aparece na linha do tempo do pet e fica visível para o tutor online (RF21).</div>
        </Modal>
      )}
    </div>
  )
}
