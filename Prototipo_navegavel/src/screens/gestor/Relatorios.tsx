import React, { useEffect, useRef, useState } from 'react'
import { api, ApiError } from '../../api'
import { brl, dataLocalISO, fmtDate, fmtDateTime } from '../../utils'
import { Field, EmptyState, useToast } from '../../ui'
import type { TipoRelatorio, FormatoArquivo } from '../../types'

const TIPOS = ['vendas', 'agendamentos', 'estoque', 'financeiro'] as const
type Previa = Awaited<ReturnType<typeof api.relatorios.previa>>
export default function Relatorios() {
  const toast = useToast()
  const [tipo, setTipo] = useState<TipoRelatorio>('vendas')
  const hoje = dataLocalISO()
  const [de, setDe] = useState(hoje.slice(0, 8) + '01')
  const [ate, setAte] = useState(hoje)
  const [previa, setPrevia] = useState<Previa | null>(null)
  const [recentes, setRecentes] = useState<any[]>([])
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const [erroHistorico, setErroHistorico] = useState('')
  const consulta = useRef(0)
  const emOperacao = useRef(false)
  const carregarHistorico = async () => {
    try { setRecentes(await api.relatorios.listar()); setErroHistorico('') }
    catch { setErroHistorico('Não foi possível consultar o histórico de exportações.') }
  }
  useEffect(() => { void carregarHistorico(); return () => { consulta.current++ } }, [])
  const filtros = () => tipo === 'estoque' ? { tipo } : { tipo, de, ate }
  const validar = () => {
    if (tipo !== 'estoque' && (!de || !ate || de > ate)) { setErro('Informe um período válido: a data inicial deve ser anterior ou igual à final.'); return false }
    return true
  }
  const gerar = async (formato?: FormatoArquivo) => {
    if (emOperacao.current || !validar()) return
    const atual = ++consulta.current
    const params = filtros()
    emOperacao.current = true; setOcupado(true); setErro('')
    try {
      if (formato) {
        const blob = await api.relatorios.exportar({ ...params, formato })
        if (atual !== consulta.current) return
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url; link.download = `${params.tipo}-${dataLocalISO()}.${formato === 'PDF' ? 'pdf' : 'csv'}`
        document.body.appendChild(link); link.click(); link.remove()
        setTimeout(() => URL.revokeObjectURL(url), 1000)
        toast('Arquivo gerado. Download solicitado ao navegador.', 'ok')
        await carregarHistorico()
      } else {
        const resultado = await api.relatorios.previa(params)
        if (atual === consulta.current) setPrevia(resultado)
      }
    } catch (e) { if (atual === consulta.current) setErro(e instanceof ApiError ? e.mensagem : 'Não foi possível gerar o relatório.') }
    finally { emOperacao.current = false; setOcupado(false) }
  }
  const alterar = (acao: () => void) => { consulta.current++; setPrevia(null); setErro(''); acao() }
  return <div>
    <div className="page-head"><div><h1>Relatórios</h1><div className="sub">Consulta e exportação de dados em PDF e CSV</div></div></div>
    {erro && <div role="alert" className="alert danger">{erro}</div>}
    <div className="card card-pad mb-16"><fieldset disabled={ocupado} style={{ border: 0, padding: 0 }}><div className="form-grid">
      <Field label="Tipo de relatório"><select aria-label="Tipo de relatório" value={tipo} onChange={e => alterar(() => setTipo(e.target.value as TipoRelatorio))}>{TIPOS.map(t => <option key={t} value={t}>{t[0].toUpperCase() + t.slice(1)}</option>)}</select></Field>
      {tipo !== 'estoque' && <><Field label="Data inicial"><input aria-label="Data inicial do relatório" type="date" value={de} onChange={e => alterar(() => setDe(e.target.value))} /></Field><Field label="Data final"><input aria-label="Data final do relatório" type="date" value={ate} onChange={e => alterar(() => setAte(e.target.value))} /></Field></>}
    </div>{tipo === 'estoque' && <p className="small muted">Posição atual do estoque; não representa uma posição histórica por período.</p>}
    <div className="flex mt-16"><button className="btn btn-primary" onClick={() => void gerar()}>Consultar prévia</button><button className="btn btn-outline" onClick={() => void gerar('PDF')}>Baixar PDF</button><button className="btn btn-outline" onClick={() => void gerar('CSV')}>Baixar CSV</button></div></fieldset></div>
    {ocupado && <div role="status" className="alert info">Consultando dados e preparando o relatório…</div>}
    <div className="card mb-16"><div className="card-head"><h3>Pré-visualização</h3>{tipo !== 'estoque' && previa && <span className="hint">{fmtDate(de)} a {fmtDate(ate)}</span>}</div>
      {!previa ? <EmptyState icon="📑" title="Consulte uma prévia para visualizar os dados" /> : !previa.linhas.length ? <EmptyState icon="📋" title="Nenhum registro encontrado" /> : <div className="table-wrap"><table className="tbl"><thead><tr>{previa.colunas.map(c => <th key={c.campo}>{c.rotulo}</th>)}</tr></thead><tbody>{previa.linhas.map((l, i) => <tr key={i}>{previa.colunas.map(c => <td key={c.campo}>{l[c.campo] == null || l[c.campo] === '' ? '—' : c.dinheiro ? brl(l[c.campo]) : c.campo === 'dataHora' ? fmtDateTime(l[c.campo]) : String(l[c.campo])}</td>)}</tr>)}</tbody></table></div>}
    </div>
    <div className="card"><div className="card-head"><h3>Histórico de exportações</h3><button className="btn btn-outline btn-sm" disabled={ocupado} onClick={() => void carregarHistorico()}>Atualizar histórico</button></div>
      {erroHistorico && <div role="alert" className="alert danger">{erroHistorico}</div>}
      {!recentes.length ? <EmptyState icon="📋" title="Nenhuma exportação registrada" /> : <div className="table-wrap"><table className="tbl"><thead><tr><th>Tipo</th><th>Período</th><th>Formato</th><th>Gerado em</th></tr></thead><tbody>{recentes.map(r => <tr key={r.id}><td>{r.tipo}</td><td>{r.periodo}</td><td>{r.formato}</td><td>{fmtDateTime(r.dataGeracao)}</td></tr>)}</tbody></table></div>}
    </div>
  </div>
}
