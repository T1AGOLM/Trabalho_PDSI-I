import React, { useState } from 'react'
import { db } from '../../data'
import { brl, fmtDate, weekdayShort } from '../../utils'
import { useToast, Field } from '../../ui'
import { useNav } from '../../shell'

const MEU_ID = 1
const HORAS = ['08:00', '09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00', '17:00']
const DIAS = ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18']

export default function CliAgendar() {
  const nav = useNav()
  const toast = useToast()
  const [etapa, setEtapa] = useState(1)
  const [petId, setPetId] = useState('1')
  const [servicoId, setServicoId] = useState('1')
  const [colabId, setColabId] = useState('2')
  const [data, setData] = useState(DIAS[0])
  const [hora, setHora] = useState('')

  const meusPets = db.pets.filter(p => p.clienteId === MEU_ID && p.ativo)
  const servico = db.servicos.find(s => s.id === Number(servicoId))!
  const colab = db.colaboradores.find(c => c.id === Number(colabId))!

  // horários já ocupados para o profissional escolhido
  const ocupados = db.agendamentos
    .filter(a => a.colaboradorId === Number(colabId) && a.status !== 'cancelado' && a.dataHora.startsWith(data))
    .map(a => a.dataHora.split('T')[1].slice(0, 5))

  const bloqueado = db.bloqueios.some(b => b.colaboradorId === Number(colabId) && data >= b.dataInicio && data <= b.dataFim)

  const confirma = () => {
    if (!hora) { toast('Selecione um horário disponível.', 'err'); return }
    toast(`Agendamento confirmado para ${db.pets.find(p => p.id === Number(petId))?.nome} — ${fmtDate(data)} às ${hora}! Lembrete será enviado 24h antes.`, 'ok')
    nav('cli-agendamentos')
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Agendar Serviço Online</h1>
          <div className="sub">Reserve em 3 passos, sem ligação telefônica (UC19 → UC05 · RNF10)</div>
        </div>
      </div>

      <div className="steps">
        <div className={`step ${etapa >= 1 ? 'current' : ''}`}><div className="s-num">1</div><span className="s-lbl">Serviço & pet</span></div>
        <div className={`step-line ${etapa > 1 ? 'done' : ''}`} />
        <div className={`step ${etapa === 2 ? 'current' : ''}`}><div className="s-num">2</div><span className="s-lbl">Profissional & data</span></div>
        <div className={`step-line ${etapa > 2 ? 'done' : ''}`} />
        <div className={`step ${etapa === 3 ? 'current' : ''}`}><div className="s-num">3</div><span className="s-lbl">Horário & confirmação</span></div>
      </div>

      <div className="card card-pad" style={{ maxWidth: 780 }}>
        {etapa === 1 && (
          <>
            <div className="form-grid">
              <Field label="Para qual pet?" required>
                <select value={petId} onChange={e => setPetId(e.target.value)}>
                  {meusPets.map(p => <option key={p.id} value={p.id}>{p.nome} — {p.raca}</option>)}
                </select>
              </Field>
              <Field label="Serviço desejado" required>
                <select value={servicoId} onChange={e => setServicoId(e.target.value)}>
                  {db.servicos.map(s => <option key={s.id} value={s.id}>{s.nome} — {brl(s.preco)} ({s.duracao} min)</option>)}
                </select>
              </Field>
            </div>
            <div className="alert info mt-16">🐾 <span><b>{db.pets.find(p => p.id === Number(petId))?.nome}</b>: {db.pets.find(p => p.id === Number(petId))?.observacoesSaude}</span></div>
            <div className="form-actions">
              <button className="btn btn-outline" onClick={() => nav('cli-inicio')}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => setEtapa(2)}>Continuar →</button>
            </div>
          </>
        )}

        {etapa === 2 && (
          <>
            <Field label="Profissional" required>
              <select value={colabId} onChange={e => setColabId(e.target.value)}>
                {db.colaboradores.filter(c => c.ativo && c.cargo !== 'ATENDENTE').map(c => (
                  <option key={c.id} value={c.id}>{c.nome} — {c.cargo === 'VETERINARIO' ? 'Veterinário(a)' : c.cargo === 'TOSADOR' ? 'Tosador' : 'Banhista'} · {c.disponibilidade}</option>
                ))}
              </select>
            </Field>
            <h3 className="mt-16 mb-12" style={{ fontSize: 14 }}>Escolha o dia</h3>
            <div className="flex" style={{ gap: 9, flexWrap: 'wrap' }}>
              {DIAS.map(d => (
                <button key={d} className={`btn ${data === d ? 'btn-primary' : 'btn-outline'}`} onClick={() => { setData(d); setHora('') }}>
                  {weekdayShort(d)}, {d.slice(8, 10)}/{d.slice(5, 7)}
                </button>
              ))}
            </div>
            {bloqueado && <div className="alert danger mt-16">🚫 Profissional indisponível neste dia (bloqueio de agenda — RF30). Escolha outra data.</div>}
            <div className="form-actions">
              <button className="btn btn-outline" onClick={() => setEtapa(1)}>← Voltar</button>
              <button className="btn btn-primary" disabled={bloqueado} onClick={() => setEtapa(3)}>Ver horários →</button>
            </div>
          </>
        )}

        {etapa === 3 && (
          <>
            <h3 className="mb-12" style={{ fontSize: 14 }}>Horários disponíveis — {weekdayShort(data)}, {fmtDate(data)}</h3>
            {bloqueado ? (
              <div className="alert danger">🚫 Dia bloqueado para este profissional.</div>
            ) : (
              <div className="flex" style={{ gap: 9, flexWrap: 'wrap' }}>
                {HORAS.map(h => {
                  const ocupado = ocupados.includes(h)
                  return (
                    <button key={h} disabled={ocupado}
                      className={`btn ${hora === h ? 'btn-primary' : 'btn-outline'}`}
                      style={ocupado ? { textDecoration: 'line-through', opacity: .45 } : {}}
                      onClick={() => setHora(h)}>
                      {h}{ocupado ? ' · ocupado' : ''}
                    </button>
                  )
                })}
              </div>
            )}
            <div className="alert info mt-16">🤖 Horários ocupados aparecem riscados — o sistema valida o conflito em tempo real (UC06/RN01).</div>

            <div className="divider" />
            <h3 className="mb-12" style={{ fontSize: 14 }}>Resumo da reserva</h3>
            <div className="kv"><span className="k">Pet</span><span className="v">{db.pets.find(p => p.id === Number(petId))?.nome}</span></div>
            <div className="kv"><span className="k">Serviço</span><span className="v">{servico.nome}</span></div>
            <div className="kv"><span className="k">Profissional</span><span className="v">{colab.nome}</span></div>
            <div className="kv"><span className="k">Data e horário</span><span className="v">{fmtDate(data)} {hora ? 'às ' + hora : '(escolha acima)'}</span></div>
            <div className="kv"><span className="k">Valor estimado</span><span className="v">{brl(servico.preco)}</span></div>
            <div className="form-actions">
              <button className="btn btn-outline" onClick={() => setEtapa(2)}>← Voltar</button>
              <button className="btn btn-primary btn-lg" disabled={!hora} onClick={confirma}>✓ Confirmar agendamento</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
