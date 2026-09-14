import React, { useState } from 'react'
import { db } from '../../data'
import { brl, fmtDateTime } from '../../utils'
import { Modal, useToast, Field, EmptyState } from '../../ui'
import type { TipoRelatorio, FormatoArquivo } from '../../types'

const TIPOS: { id: TipoRelatorio; nome: string; desc: string; icon: string }[] = [
  { id: 'vendas', nome: 'Relatório de Vendas', desc: 'Vendas do PDV por período, formas de pagamento e ticket médio.', icon: '🧾' },
  { id: 'agendamentos', nome: 'Relatório de Agendamentos', desc: 'Serviços agendados, cancelamentos e taxa de ocupação.', icon: '📅' },
  { id: 'estoque', nome: 'Relatório de Estoque', desc: 'Posição de estoque, mínimos, validades e reposição sugerida.', icon: '📦' },
  { id: 'financeiro', nome: 'Relatório Financeiro', desc: 'Faturamento consolidado por dia, semana e mês.', icon: '💰' },
]

export default function Relatorios() {
  const toast = useToast()
  const [tipo, setTipo] = useState<TipoRelatorio>('vendas')
  const [de, setDe] = useState('2026-09-01')
  const [ate, setAte] = useState('2026-09-12')
  const [gerado, setGerado] = useState<{ tipo: string; formato: FormatoArquivo; linhas: { k: string; v: string }[] } | null>(null)

  const gerar = (formato: FormatoArquivo) => {
    // Mock de conteúdo conforme o tipo
    const conteudo: Record<TipoRelatorio, { k: string; v: string }[]> = {
      vendas: [
        { k: 'Total de vendas', v: '5' },
        { k: 'Faturamento bruto', v: brl(641.8) },
        { k: 'Ticket médio', v: brl(128.36) },
        { k: 'Forma mais usada', v: 'PIX (2 de 5)' },
        { k: 'Vendas estornadas', v: '1' },
      ],
      agendamentos: [
        { k: 'Agendamentos criados', v: '10' },
        { k: 'Confirmados', v: '6' },
        { k: 'Concluídos', v: '3' },
        { k: 'Cancelados', v: '1' },
        { k: 'Taxa de ocupação', v: '72%' },
      ],
      estoque: [
        { k: 'Produtos cadastrados', v: '8' },
        { k: 'Abaixo do mínimo', v: '2' },
        { k: 'Validade ≤ 30 dias', v: '2' },
        { k: 'Valor em estoque', v: brl(2830.2) },
        { k: 'Reposição sugerida', v: 'Shampoo Neutro, Areia Higiênica' },
      ],
      financeiro: [
        { k: 'Faturamento do dia', v: brl(487.6) },
        { k: 'Faturamento da semana', v: brl(3210.4) },
        { k: 'Faturamento do mês', v: brl(12480.9) },
        { k: 'Serviços (estimado)', v: brl(8630.0) },
        { k: 'Produtos (estimado)', v: brl(3850.9) },
      ],
    }
    setGerado({ tipo, formato, linhas: conteudo[tipo] })
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Relatórios</h1>
          <div className="sub">Geração e exportação em PDF e planilha (UC22 · RF27)</div>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card card-pad">
          <h3 className="mb-16" style={{ fontSize: 15 }}>Nova geração</h3>
          <Field label="Tipo de relatório" required>
            <select value={tipo} onChange={e => setTipo(e.target.value as TipoRelatorio)}>
              {TIPOS.map(t => <option key={t.id} value={t.id}>{t.nome}</option>)}
            </select>
          </Field>
          <div className="form-grid mt-16">
            <Field label="Período — de" required><input type="date" value={de} onChange={e => setDe(e.target.value)} /></Field>
            <Field label="Período — até" required><input type="date" value={ate} onChange={e => setAte(e.target.value)} /></Field>
          </div>
          <div className="flex mt-16" style={{ gap: 10 }}>
            <button className="btn btn-primary" onClick={() => gerar('PDF')}>📄 Gerar PDF</button>
            <button className="btn btn-outline" onClick={() => gerar('Excel')}>📊 Gerar Excel</button>
            <button className="btn btn-outline" onClick={() => gerar('CSV')}>🗒 CSV</button>
          </div>
          <div className="alert info mt-16" style={{ marginBottom: 0 }}>Se não houver dados no período, o sistema informa a ausência de registros (UC22 — 1a).</div>
        </div>

        <div>
          <div className="card mb-16">
            <div className="card-head"><h3>Pré-visualização</h3>{gerado && <span className="badge badge-teal">{gerado.formato}</span>}</div>
            <div className="card-pad">
              {!gerado ? <EmptyState icon="📑" title="Nenhum relatório gerado" sub="Escolha o tipo e o período e clique em gerar." /> : (
                <>
                  <div className="bold mb-12">{TIPOS.find(t => t.id === gerado.tipo)?.nome}</div>
                  <div className="tiny muted mb-16">Período: {de.split('-').reverse().join('/')} a {ate.split('-').reverse().join('/')}</div>
                  {gerado.linhas.map(l => <div className="kv" key={l.k}><span className="k">{l.k}</span><span className="v">{l.v}</span></div>)}
                  <button className="btn btn-primary btn-block mt-16" onClick={() => { window.print(); toast(`Download do ${gerado.formato} simulado (protótipo).`, 'info') }}>
                    ⬇ Baixar arquivo ({gerado.formato})
                  </button>
                </>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-head"><h3>Relatórios gerados recentemente</h3></div>
            <table className="tbl">
              <thead><tr><th>Tipo</th><th>Período</th><th>Formato</th><th>Gerado em</th></tr></thead>
              <tbody>
                {db.relatorios.map(r => (
                  <tr key={r.id}>
                    <td className="bold" style={{ textTransform: 'capitalize' }}>{r.tipo}</td>
                    <td>{r.periodo}</td>
                    <td><span className="badge badge-gray">{r.formato}</span></td>
                    <td className="small">{fmtDateTime(r.dataGeracao)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  )
}
