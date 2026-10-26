import React, { useEffect, useState } from 'react'
import { db, sincronizar } from '../../data'
import { api, ApiError } from '../../api'
import { brl, fmtDate, nextDays, weekdayShort } from '../../utils'
import { useToast, Field } from '../../ui'
import { useNav, useMeuId } from '../../shell'

/** Janela de busca de horários livres: os próximos 14 dias. */
const DIAS = nextDays(14)

export default function CliAgendar() {
  const nav = useNav()
  const toast = useToast()
  const meuId = useMeuId()
  const [etapa, setEtapa] = useState(1)
  const [enviando, setEnviando] = useState(false)
  const meusPets = db.pets.filter(p => p.clienteId === meuId && p.ativo)
  const [petId, setPetId] = useState(String(meusPets[0]?.id ?? ''))
  const [servicoId, setServicoId] = useState(String(db.servicos[0]?.id ?? ''))
  const [colabId, setColabId] = useState(String(db.colaboradores[0]?.id ?? ''))
  const [data, setData] = useState(DIAS[0])
  const [hora, setHora] = useState('')
  // Horários vêm do banco: GET /agenda/horarios-livres já desconta a grade
  // do profissional, os agendamentos existentes e os bloqueios (RN01/RN08/RN12).
  const [livres, setLivres] = useState<string[]>([])
  const [carregandoHorarios, setCarregandoHorarios] = useState(false)

  const servico = db.servicos.find(s => s.id === Number(servicoId))
  const colab = db.colaboradores.find(c => c.id === Number(colabId))
  const petEscolhido = db.pets.find(p => p.id === Number(petId))

  // Bloqueio do dia inteiro: o backend também recusa, mas avisar antes evita
  // o tutor escolher um horário que não existe.
  const bloqueado = db.bloqueios.some(
    b => b.colaboradorId === Number(colabId) && data >= b.dataInicio && data <= b.dataFim,
  )

  useEffect(() => {
    if (etapa !== 3 || !colabId || !data || bloqueado) { setLivres([]); return }
    let cancelado = false
    setCarregandoHorarios(true)
    api.agendamentos
      .horariosLivres({ colaboradorId: Number(colabId), data, duracao: servico?.duracao ?? 60 })
      .then(r => { if (!cancelado) setLivres(r.horarios ?? []) })
      .catch(() => { if (!cancelado) setLivres([]) })
      .finally(() => { if (!cancelado) setCarregandoHorarios(false) })
    return () => { cancelado = true }
  }, [etapa, colabId, data, bloqueado, servico?.duracao])

  const confirma = async () => {
    if (!hora || !servico || !colab) { toast('Selecione um horário disponível.', 'err'); return }
    setEnviando(true)
    try {
     // Escrita real: o banco valida conflito (RN01) e disponibilidade (RN08)
      // e recusa com a mensagem de negócio se algo mudou nesse meio-tempo.
      const criado = await api.agendamentos.criar({
        petId: Number(petId),
        servicoId: Number(servicoId),
        colaboradorId: Number(colabId),
        dataHora: `${data}T${hora}`,
        valor: servico.preco,
      })
      await sincronizar('agendamentos')
      toast(`Agendamento #${criado.id} confirmado para ${petEscolhido?.nome} — ${fmtDate(data)} às ${hora}! Lembrete será enviado 24h antes.`, 'ok')
      nav('cli-agendamentos')
    } catch (err) {
      toast(err instanceof ApiError ? err.mensagem : 'Não foi possível confirmar o agendamento.', 'err')
    } finally {
      setEnviando(false)
    }
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
                <select value={servicoId} onChange={e => { setServicoId(e.target.value); setHora('') }}>
                  {db.servicos.map(s => <option key={s.id} value={s.id}>{s.nome} — {brl(s.preco)} ({s.duracao} min)</option>)}
                </select>
              </Field>
            </div>
            <div className="alert info mt-16">🐾 <span><b>{petEscolhido?.nome}</b>: {petEscolhido?.observacoesSaude || 'sem observações de saúde'}</span></div>
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
                {db.colaboradores.filter(c => c.ativo).map(c => (
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
              carregandoHorarios ? (
                <div className="small muted">Consultando a agenda do profissional…</div>
              ) : livres.length === 0 ? (
                <div className="alert warn">Nenhum horário livre para este profissional neste dia. Tente outra data (RN08).</div>
              ) : (
                <div className="flex" style={{ gap: 9, flexWrap: 'wrap' }}>
                  {livres.map(h => (
                    <button key={h}
                      className={`btn ${hora === h ? 'btn-primary' : 'btn-outline'}`}
                      onClick={() => setHora(h)}>
                      {h}
                    </button>
                  ))}
                </div>
              )
            )}
            <div className="alert info mt-16">🤖 A lista já vem do banco sem os horários ocupados, bloqueados ou fora da grade (UC06 · RN01/RN08/RN12).</div>

            <div className="divider" />
            <h3 className="mb-12" style={{ fontSize: 14 }}>Resumo da reserva</h3>
            <div className="kv"><span className="k">Pet</span><span className="v">{petEscolhido?.nome}</span></div>
            <div className="kv"><span className="k">Serviço</span><span className="v">{servico?.nome}</span></div>
            <div className="kv"><span className="k">Profissional</span><span className="v">{colab?.nome}</span></div>
            <div className="kv"><span className="k">Data e horário</span><span className="v">{fmtDate(data)} {hora ? 'às ' + hora : '(escolha acima)'}</span></div>
            <div className="kv"><span className="k">Valor estimado</span><span className="v">{brl(servico?.preco ?? 0)}</span></div>
            <div className="form-actions">
              <button className="btn btn-outline" onClick={() => setEtapa(2)}>← Voltar</button>
              <button className="btn btn-primary btn-lg" disabled={!hora || enviando} onClick={confirma}>
                {enviando ? 'Confirmando…' : '✓ Confirmar agendamento'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
