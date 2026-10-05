import React, { useState } from 'react'
import { db, sincronizar } from '../../data'
import { api, ApiError } from '../../api'
import { brl, fmtDateTime, clienteNome } from '../../utils'
import { Modal, ConfirmDialog, useToast, EmptyState } from '../../ui'
import type { Venda } from '../../types'

export default function Vendas() {
  const toast = useToast()
  const [vendas, setVendas] = useState<Venda[]>([...db.vendas])
  const [detalhe, setDetalhe] = useState<Venda | null>(null)
  const [estornar, setEstornar] = useState<Venda | null>(null)
  const [filtro, setFiltro] = useState<'todas' | 'finalizada' | 'estornada'>('todas')
  const [estornando, setEstornando] = useState(false)

  const lista = vendas.filter(v => filtro === 'todas' || v.status === (filtro as Venda['status']))

  /** Recarrega do banco e refleta na tabela local. */
  const recarregar = async () => {
    await sincronizar()
    setVendas([...db.vendas])
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Histórico de Vendas</h1>
          <div className="sub">Vendas do PDV, comprovantes e estornos (UC11/UC12 · RF10/RF25/RF26)</div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-icon bg-teal">🧾</div>
          <div><div className="stat-value">{vendas.length}</div><div className="stat-label">Vendas registradas</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-green">💰</div>
          <div><div className="stat-value">{brl(vendas.filter(v => v.status === 'finalizada').reduce((s, v) => s + v.valorTotal, 0))}</div><div className="stat-label">Total faturado (ativas)</div></div>
        </div>
        <div className="stat-card">
          <div className="stat-icon bg-red">↩️</div>
          <div><div className="stat-value">{vendas.filter(v => v.status === 'estornada').length}</div><div className="stat-label">Vendas estornadas</div></div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="tabs" style={{ marginBottom: 0, border: 'none' }}>
          {(['todas', 'finalizada', 'estornada'] as const).map(f => (
            <button key={f} className={`tab ${filtro === f ? 'active' : ''}`} onClick={() => setFiltro(f)} style={{ textTransform: 'capitalize' }}>{f}</button>
          ))}
        </div>
      </div>

      <div className="card">
        <div className="table-wrap">
          {lista.length === 0 ? <EmptyState icon="🧾" title="Nenhuma venda neste filtro" /> : (
            <table className="tbl">
              <thead><tr><th>Venda</th><th>Data/hora</th><th>Cliente</th><th>Itens</th><th>Pagamentos</th><th className="num">Total</th><th>Status</th><th className="right">Ações</th></tr></thead>
              <tbody>
                {lista.map(v => (
                  <tr key={v.id} style={{ opacity: v.status === 'estornada' ? .6 : 1 }}>
                    <td className="bold">#{v.id}</td>
                    <td>{fmtDateTime(v.dataHora)}</td>
                    <td>{clienteNome(v.clienteId)}</td>
                    <td className="small">{v.itens.map(i => `${i.quantidade}× ${i.nome}`).join(', ')}</td>
                    <td>{v.pagamentos.map((p, i) => <div key={i}><span className="badge badge-blue tiny">{p.formaPagamento}</span> {brl(p.valor)}</div>)}</td>
                    <td className="num bold">{brl(v.valorTotal)}</td>
                    <td><span className={`badge ${v.status === 'finalizada' ? 'badge-green' : 'badge-red'}`}>{v.status}</span></td>
                    <td>
                      <div className="actions">
                        <button className="btn btn-ghost btn-sm" onClick={() => setDetalhe(v)}>Comprovante</button>
                        {v.status === 'finalizada' && (
                          <button className="btn btn-danger btn-sm" onClick={() => setEstornar(v)}>Estornar</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {detalhe && (
        <Modal title={`Comprovante — Venda #${detalhe.id}`} onClose={() => setDetalhe(null)} size="narrow"
          footer={<button className="btn btn-primary" onClick={() => setDetalhe(null)}>Fechar</button>}>
          <div className="center mb-16">
            <div style={{ fontSize: 38 }}>🧾</div>
            <div className="bold">PetPlus — Comprovante de Venda</div>
            <div className="tiny muted">{fmtDateTime(detalhe.dataHora)}</div>
          </div>
          <div className="kv"><span className="k">Cliente</span><span className="v">{clienteNome(detalhe.clienteId)}</span></div>
          {detalhe.itens.map(i => (
            <div key={i.produtoId} className="kv"><span className="k">{i.quantidade}× {i.nome}</span><span className="v">{brl(i.quantidade * i.precoUnitario)}</span></div>
          ))}
          <div className="divider" />
          <div className="flex-between bold" style={{ fontSize: 15 }}><span>TOTAL</span><span>{brl(detalhe.valorTotal)}</span></div>
          <div className="divider" />
          {detalhe.pagamentos.map((p, i) => (
            <div key={i} className="kv"><span className="k">{p.formaPagamento}</span><span className="v">{brl(p.valor)}</span></div>
          ))}
          {detalhe.status === 'estornada' && <div className="alert danger mt-16">↩️ Esta venda foi estornada e o estoque dos produtos foi restaurado (UC12).</div>}
        </Modal>
      )}

      {estornar && (
        <ConfirmDialog danger title="Estornar venda?"
          message={`A venda #${estornar.id} de ${brl(estornar.valorTotal)} será estornada. Os pagamentos serão revertidos e o estoque dos produtos envolvidos será restaurado automaticamente (RF26/RN11 — somente Gestor, dentro do prazo comercial).`}
          confirmLabel="Confirmar estorno"
          onCancel={() => setEstornar(null)}
          onConfirm={async () => {
            // Estorno real: a rota exige perfil GESTOR e o banco valida o
            // prazo comercial do petshop (RN11). O estoque volta pela
            // trilha de movimentações, não por ajuste na tela (RF26).
            setEstornando(true)
            try {
              await api.vendas.estornar(estornar.id, 'Estorno pela tela de histórico')
              await recarregar()
              setDetalhe(null)
              setEstornar(null)
              toast('Venda estornada. Estoque restaurado automaticamente (UC12).', 'ok')
            } catch (err) {
              toast(err instanceof ApiError ? err.message : 'Não foi possível estornar a venda.', 'err')
            } finally {
              setEstornando(false)
            }
          }} />
      )}
    </div>
  )
}
