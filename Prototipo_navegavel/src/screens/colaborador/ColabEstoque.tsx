import React, { useState } from 'react'
import { db } from '../../data'
import { brl, fmtDate, getFornecedor } from '../../utils'
import { EmptyState } from '../../ui'

export default function ColabEstoque() {
  const [busca, setBusca] = useState('')
  const prods = db.produtos.filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()) || p.categoria.toLowerCase().includes(busca.toLowerCase()))

  const diasAte = (v: string) => v ? Math.ceil((new Date(v + 'T12:00:00').getTime() - new Date('2026-09-12T12:00:00').getTime()) / 86400000) : Infinity

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Estoque</h1>
          <div className="sub">Consulta de produtos, mínimos e validades (UC10/UC21 — visão do colaborador)</div>
        </div>
      </div>

      {(db.produtos.some(p => p.quantidadeEstoque <= p.estoqueMinimo) || db.produtos.some(p => diasAte(p.validade) <= 30)) && (
        <div className="alert warn">🔔 Existem produtos com <b>estoque mínimo atingido</b> ou <b>validade próxima</b>. Acione o gestor para reposição.</div>
      )}

      <div className="filter-bar">
        <div className="search-box">
          <span className="s-ico">🔍</span>
          <input placeholder="Buscar por nome ou categoria..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          {prods.length === 0 ? <EmptyState icon="🔍" title="Nenhum produto encontrado" /> : (
            <table className="tbl">
              <thead><tr><th>Produto</th><th>Categoria</th><th className="num">Estoque</th><th>Validade</th><th className="num">Preço</th></tr></thead>
              <tbody>
                {prods.map(p => {
                  const dias = diasAte(p.validade)
                  return (
                    <tr key={p.id}>
                      <td className="bold" style={{ maxWidth: 260 }}>{p.nome}</td>
                      <td><span className="badge badge-gray">{p.categoria}</span></td>
                      <td className="num"><span className={`badge ${p.quantidadeEstoque === 0 ? 'badge-red' : p.quantidadeEstoque <= p.estoqueMinimo ? 'badge-amber' : 'badge-green'}`}>{p.quantidadeEstoque} un.</span></td>
                      <td>{p.validade ? fmtDate(p.validade) : '—'}{dias <= 30 && <span className="badge badge-red tiny" style={{ marginLeft: 6 }}>vence em {dias}d</span>}</td>
                      <td className="num">{brl(p.preco)}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  )
}
