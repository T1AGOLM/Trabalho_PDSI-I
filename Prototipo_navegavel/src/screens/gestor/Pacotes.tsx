import React, { useState } from 'react'
import { db } from '../../data'
import { brl, clienteNome, petLabel } from '../../utils'
import { Modal, useToast, Field, EmptyState } from '../../ui'
import type { PacoteServico } from '../../types'

export default function Pacotes() {
  const toast = useToast()
  const [pacotes, setPacotes] = useState<PacoteServico[]>([...db.pacotes])
  const [novoOpen, setNovoOpen] = useState(false)
  const [cancelar, setCancelar] = useState<PacoteServico | null>(null)

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Pacotes Recorrentes</h1>
          <div className="sub">Planos/assinaturas de serviços (UC24 · RF29)</div>
        </div>
        <button className="btn btn-primary" onClick={() => setNovoOpen(true)}>➕ Novo pacote</button>
      </div>

      {pacotes.length === 0 ? <div className="card"><EmptyState icon="🎫" title="Nenhum pacote cadastrado" /></div> : (
        <div className="grid-2">
          {pacotes.map(p => (
            <div className="card card-pad" key={p.id} style={{ opacity: p.status === 'cancelado' ? .6 : 1 }}>
              <div className="flex-between mb-12">
                <div className="flex" style={{ gap: 12 }}>
                  <div className="stat-icon bg-orange">🎫</div>
                  <div>
                    <div className="bold">{p.nome}</div>
                    <div className="tiny muted">{clienteNome(p.clienteId)} · pet {petLabel(p.petId).split(' ·')[0]}</div>
                  </div>
                </div>
                <span className={`badge ${p.status === 'ativo' ? 'badge-green' : 'badge-gray'}`}>{p.status}</span>
              </div>
              <div className="kv"><span className="k">Periodicidade</span><span className="v">{p.periodicidade}</span></div>
              <div className="kv"><span className="k">Valor</span><span className="v">{brl(p.preco)}/mês</span></div>
              <div className="kv"><span className="k">Serviços incluídos</span><span className="v">{p.servicos.join(' + ')}</span></div>
              <div className="flex mt-12" style={{ justifyContent: 'flex-end' }}>
                {p.status === 'ativo'
                  ? <button className="btn btn-outline btn-sm" onClick={() => setCancelar(p)}>Cancelar pacote</button>
                  : <button className="btn btn-primary btn-sm" onClick={() => { setPacotes(ps => ps.map(x => x.id === p.id ? { ...x, status: 'ativo' } : x)); toast('Pacote reativado.', 'ok') }}>Reativar</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {novoOpen && <NovoPacoteModal onClose={() => setNovoOpen(false)} onCriar={(p) => {
        setPacotes(ps => [...ps, p]); setNovoOpen(false)
        toast(`Pacote contratado para ${clienteNome(p.clienteId)} (UC24).`, 'ok')
      }} />}

      {cancelar && (
        <Modal title="Cancelar pacote?" onClose={() => setCancelar(null)} size="narrow"
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setCancelar(null)}>Voltar</button>
              <button className="btn btn-danger" onClick={() => {
                setPacotes(ps => ps.map(x => x.id === cancelar.id ? { ...x, status: 'cancelado' } : x))
                setCancelar(null); toast('Pacote cancelado.', 'ok')
              }}>Cancelar pacote</button>
            </>
          }>
          <p>O pacote <b>{cancelar.nome}</b> de {clienteNome(cancelar.clienteId)} deixará de renovar automaticamente.</p>
        </Modal>
      )}
    </div>
  )
}

function NovoPacoteModal({ onClose, onCriar }: { onClose: () => void; onCriar: (p: PacoteServico) => void }) {
  const [nome, setNome] = useState('Plano Banho & Tosa Mensal')
  const [clienteId, setClienteId] = useState('2')
  const [petId, setPetId] = useState('3')
  const [sel, setSel] = useState<number[]>([2])
  const [periodicidade, setPeriodicidade] = useState('Mensal')

  const servicosSel = db.servicos.filter(s => sel.includes(s.id))
  const preco = servicosSel.reduce((s, x) => s + x.preco, 0) * 0.85 // desconto de pacote

  const toggle = (id: number) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  return (
    <Modal title="Novo pacote recorrente (UC24)" onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={sel.length === 0} onClick={() => {
            onCriar({
              id: Math.max(...db.pacotes.map(p => p.id)) + 1,
              nome, periodicidade, preco,
              servicos: servicosSel.map(s => s.nome),
              clienteId: Number(clienteId), petId: Number(petId), status: 'ativo',
            })
          }}>✓ Contratar pacote</button>
        </>
      }>
      <div className="form-grid">
        <Field label="Nome do plano" required full><input value={nome} onChange={e => setNome(e.target.value)} /></Field>
        <Field label="Cliente" required>
          <select value={clienteId} onChange={e => { setClienteId(e.target.value); setPetId('1') }}>
            {db.clientes.filter(c => c.ativo).map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </select>
        </Field>
        <Field label="Pet" required>
          <select value={petId} onChange={e => setPetId(e.target.value)}>
            {db.pets.filter(p => p.clienteId === Number(clienteId)).map(p => <option key={p.id} value={p.id}>{p.nome}</option>)}
          </select>
        </Field>
        <Field label="Periodicidade">
          <select value={periodicidade} onChange={e => setPeriodicidade(e.target.value)}>
            {['Semanal', 'Quinzenal', 'Mensal', 'Trimestral'].map(x => <option key={x}>{x}</option>)}
          </select>
        </Field>
      </div>
      <h3 className="mt-16 mb-12" style={{ fontSize: 14 }}>Serviços incluídos (15% de desconto)</h3>
      <div className="flex" style={{ flexWrap: 'wrap', gap: 8 }}>
        {db.servicos.map(s => (
          <button key={s.id} className={`btn ${sel.includes(s.id) ? 'btn-primary' : 'btn-outline'} btn-sm`} onClick={() => toggle(s.id)}>
            {sel.includes(s.id) ? '✓ ' : ''}{s.nome} — {brl(s.preco)}
          </button>
        ))}
      </div>
      <div className="flex-between mt-16" style={{ fontSize: 15 }}>
        <b>Valor do plano</b><b style={{ color: 'var(--primary-dark)' }}>{brl(preco)}/mês</b>
      </div>
    </Modal>
  )
}
