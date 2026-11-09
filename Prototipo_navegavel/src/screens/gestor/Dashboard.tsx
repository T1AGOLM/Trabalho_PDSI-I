import React, { useEffect, useState } from 'react'
import { api, ApiError } from '../../api'
import { brl, brlShort, fmtTime, fmtDate } from '../../utils'
import { StatCard, EmptyState } from '../../ui'
import { useNav } from '../../shell'

export default function Dashboard() {
  const nav = useNav()
  const [dados, setDados] = useState<any>(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(true)
  const [versao, setVersao] = useState(0)
  useEffect(() => {
    let atual = true
    setCarregando(true); setErro(''); setDados(null)
    api.dashboard.resumo().then(d => { if (atual) setDados(d) })
      .catch(e => { if (atual) setErro(e instanceof ApiError ? e.mensagem : 'Não foi possível carregar o painel.') })
      .finally(() => { if (atual) setCarregando(false) })
    return () => { atual = false }
  }, [versao])
  const serie = dados?.serie?.slice(-7) ?? []
  const servicos = dados?.servicosMaisVendidos ?? []
  const agenda = dados?.agendaHoje ?? []
  const maxFat = Math.max(1, ...serie.map((d: any) => Number(d.faturamento)))
  const maxQtd = Math.max(1, ...servicos.map((s: any) => Number(s.qtdAtendimentos)))
  return <div>
    <div className="page-head"><div><h1>Painel Gerencial</h1><div className="sub">{dados?.unidade?.nome ?? 'PetPlus'}{dados?.dataReferencia ? ` · ${fmtDate(dados.dataReferencia)}` : ''}</div></div>
      <div className="flex"><button className="btn btn-outline" disabled={carregando} onClick={() => setVersao(v => v + 1)}>Atualizar painel</button><button className="btn btn-outline" onClick={() => nav('relatorios')}>Relatórios</button><button className="btn btn-primary" onClick={() => nav('pdv')}>Novo PDV</button></div></div>
    {erro && <div role="alert" className="alert danger">{erro}</div>}
    {carregando && <div role="status" className="alert info">Carregando indicadores…</div>}
    {dados && <>
      <div className="stats-grid">
        <StatCard icon="💰" bg="bg-teal" value={brl(dados.faturamento?.hoje ?? 0)} label="Faturamento do dia" />
        <StatCard icon="📈" bg="bg-green" value={brl(dados.faturamento?.semana ?? 0)} label="Faturamento da semana" />
        <StatCard icon="🗓️" bg="bg-blue" value={brl(dados.faturamento?.mes ?? 0)} label="Faturamento do mês" />
        <StatCard icon="📅" bg="bg-orange" value={`${Number(dados.ocupacao?.taxaOcupacao ?? 0).toLocaleString('pt-BR')}%`} label="Ocupação da semana" />
      </div>
      <p className="small muted mb-16">Ocupação: {dados.ocupacao?.minutosOcupados ?? 0} minutos agendados / {dados.ocupacao?.minutosDisponiveis ?? 0} minutos disponíveis na semana, de segunda a domingo.</p>
      <div className="grid-2 mb-20"><div className="card"><div className="card-head"><h3>Faturamento — últimos 7 dias</h3></div><div className="card-pad">
        <div className="bars">{serie.map((d: any) => <div className="bar-col" key={d.dia}><span className="bar-val">{brlShort(d.faturamento)}</span><div className="bar accent" style={{ height: `${Number(d.faturamento) / maxFat * 100}%` }} /><span className="bar-lbl">{fmtDate(d.dia).slice(0, 5)}</span></div>)}</div>
      </div></div><div className="card"><div className="card-head"><h3>Serviços mais realizados</h3><span className="hint">atendimentos concluídos · todo o histórico</span></div><div className="card-pad">
        {!servicos.length ? <EmptyState icon="📋" title="Nenhum serviço concluído" /> : servicos.map((s: any) => <div className="hbar-row" key={s.nome}><div className="hbar-label">{s.nome}</div><div className="hbar-track"><div className="hbar-fill accent" style={{ width: `${s.qtdAtendimentos / maxQtd * 100}%` }} /></div><div className="hbar-val">{s.qtdAtendimentos}x</div></div>)}
      </div></div></div>
      <div className="grid-2"><div className="card"><div className="card-head"><h3>Agenda de hoje</h3><button className="btn btn-ghost btn-sm" onClick={() => nav('agenda')}>Ver agenda completa →</button></div>
        {!agenda.length ? <EmptyState icon="📭" title="Nenhum agendamento hoje" /> : <div className="table-wrap"><table className="tbl"><thead><tr><th>Horário</th><th>Pet / Serviço</th><th>Profissional</th><th>Status</th></tr></thead><tbody>{agenda.map((a: any) => <tr key={a.id}><td>{fmtTime(a.dataHora)}</td><td>{a.petNome}<div className="tiny muted">{a.servicoNome}</div></td><td>{a.colaboradorNome}</td><td>{a.status}</td></tr>)}</tbody></table></div>}
      </div><div className="card"><div className="card-head"><h3>Alertas e avaliações</h3></div><div className="card-pad">
        <div className="alert warn mb-12">Produtos no estoque mínimo: {dados.alertas?.estoqueMinimo ?? 0}</div>
        <div className="alert warn mb-12">Produtos vencidos ou próximos da validade: {dados.alertas?.validade ?? 0}</div>
        <div className="alert info mb-12">Vacinas próximas do vencimento: {dados.alertas?.vacinas ?? 0}</div>
        <div className="small">Avaliações registradas: {dados.avaliacoes?.total ?? 0} · Média: {Number(dados.avaliacoes?.media ?? 0).toLocaleString('pt-BR')}/5</div>
      </div></div></div>
    </>}
  </div>
}
