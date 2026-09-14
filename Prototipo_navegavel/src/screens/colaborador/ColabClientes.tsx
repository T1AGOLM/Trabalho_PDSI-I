import React, { useState } from 'react'
import { db } from '../../data'
import { EmptyState } from '../../ui'
import { Modal } from '../../ui'

export default function ColabClientes() {
  const [busca, setBusca] = useState('')
  const [detalhe, setDetalhe] = useState<typeof db.clientes[0] | null>(null)

  const filtra = (t: string) => t.toLowerCase().includes(busca.toLowerCase())
  const clientes = db.clientes.filter(c => filtra(c.nome) || filtra(c.email) || filtra(c.telefone))

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Clientes & Pets</h1>
          <div className="sub">Consulta de tutores e animais cadastrados (UC03/UC04 — visão do colaborador)</div>
        </div>
      </div>

      <div className="filter-bar">
        <div className="search-box">
          <span className="s-ico">🔍</span>
          <input placeholder="Buscar por nome, e-mail ou telefone..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head"><h3>Tutores ({clientes.length})</h3></div>
          <div className="table-wrap">
            {clientes.length === 0 ? <EmptyState icon="🔍" title="Nenhum resultado" /> : (
              <table className="tbl">
                <thead><tr><th>Cliente</th><th>Contato</th><th>Pets</th></tr></thead>
                <tbody>
                  {clientes.map(c => (
                    <tr key={c.id} className={c.ativo ? '' : 'row-inactive'} style={{ cursor: 'pointer' }} onClick={() => setDetalhe(c)}>
                      <td><div className="bold">{c.nome}</div><div className="tiny muted">{c.email}</div></td>
                      <td>{c.telefone}</td>
                      <td>{db.pets.filter(p => p.clienteId === c.id).map(p => p.nome).join(', ') || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        <div className="card">
          <div className="card-head"><h3>Últimos atendimentos</h3></div>
          <table className="tbl">
            <thead><tr><th>Data</th><th>Pet</th><th>Serviço</th><th>Status</th></tr></thead>
            <tbody>
              {[...db.agendamentos].sort((a, b) => b.dataHora.localeCompare(a.dataHora)).slice(0, 8).map(a => (
                <tr key={a.id}>
                  <td className="small">{a.dataHora.split('T')[0].split('-').reverse().join('/')} {a.dataHora.split('T')[1].slice(0, 5)}</td>
                  <td className="bold">{db.pets.find(p => p.id === a.petId)?.nome}</td>
                  <td>{db.servicos.find(s => s.id === a.servicoId)?.nome}</td>
                  <td><span className={`badge ${a.status === 'confirmado' ? 'badge-teal' : a.status === 'concluído' ? 'badge-green' : 'badge-gray'}`}>{a.status}</span></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {detalhe && (
        <Modal title={`Ficha — ${detalhe.nome}`} onClose={() => setDetalhe(null)}
          footer={<button className="btn btn-primary" onClick={() => setDetalhe(null)}>Fechar</button>}>
          <div className="kv"><span className="k">E-mail</span><span className="v">{detalhe.email}</span></div>
          <div className="kv"><span className="k">Telefone</span><span className="v">{detalhe.telefone}</span></div>
          <div className="kv"><span className="k">Endereço</span><span className="v">{detalhe.endereco}</span></div>
          <h3 className="mt-16 mb-12" style={{ fontSize: 14 }}>Pets</h3>
          {db.pets.filter(p => p.clienteId === detalhe.id).map(p => (
            <div key={p.id} className="card card-pad mb-12" style={{ padding: 14 }}>
              <div className="flex-between"><b>🐶 {p.nome}</b><span className="badge badge-teal">{p.especie}</span></div>
              <div className="tiny muted mt-8">{p.raca} · {p.porte} · {p.idade} ano(s) — {p.observacoesSaude}</div>
            </div>
          ))}
        </Modal>
      )}
    </div>
  )
}
