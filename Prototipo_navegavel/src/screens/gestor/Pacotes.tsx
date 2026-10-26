import React, { useState } from 'react'
import { db, sincronizar } from '../../data'
import { api, ApiError } from '../../api'
import { brl, clienteNome, petLabel } from '../../utils'
import { Modal, useToast, Field, EmptyState } from '../../ui'
import type { PacoteServico } from '../../types'

export default function Pacotes() {
  const toast = useToast()
  // `db.pacotes` são as ASSINATURAS (o plano contratado por um tutor):
  // "cancelar pacote" cancela a assinatura, não o plano do catálogo.
  const [pacotes, setPacotes] = useState<PacoteServico[]>([...db.pacotes])
  const [novoOpen, setNovoOpen] = useState(false)
  const [cancelar, setCancelar] = useState<PacoteServico | null>(null)

  const recarregar = async () => {
    await sincronizar('pacotes')
    setPacotes([...db.pacotes])
  }

  /** Uma assinatura cancelada não "volta": contrata-se de novo (RF29). */
  const recontratar = async (p: PacoteServico) => {
    try {
      await api.assinaturas.criar({ pacoteId: p.pacoteId ?? p.id, clienteId: p.clienteId, petId: p.petId })
      await recarregar()
      toast(`Pacote de ${clienteNome(p.clienteId)} contratado novamente.`, 'ok')
    } catch (err) {
      toast(err instanceof ApiError ? err.mensagem : 'Não foi possível contratar novamente.', 'err')
    }
  }

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
                  : <button className="btn btn-primary btn-sm" onClick={() => recontratar(p)}>Contratar novamente</button>}
              </div>
            </div>
          ))}
        </div>
      )}

      {novoOpen && <NovoPacoteModal onClose={() => setNovoOpen(false)} onCriar={async (dados) => {
        try {
          // Duas escritas no domínio: o plano (catálogo) e a adesão do tutor
          // a ele. As duas vão para o banco na sequência, com o id real.
          const plano = await api.pacotes.criar(dados.plano)
          await api.assinaturas.criar({ pacoteId: plano.id, clienteId: dados.clienteId, petId: dados.petId })
          await recarregar()
          setNovoOpen(false)
          toast(`Pacote ${dados.plano.nome} contratado para ${clienteNome(dados.clienteId)} (UC24).`, 'ok')
        } catch (err) {
          toast(err instanceof ApiError ? err.mensagem : 'Não foi possível contratar o pacote.', 'err')
          throw err
        }
      }} />}

      {cancelar && (
        <Modal title="Cancelar pacote?" onClose={() => setCancelar(null)} size="narrow"
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setCancelar(null)}>Voltar</button>
              <button className="btn btn-danger" onClick={async () => {
                try {
                  await api.assinaturas.cancelar(cancelar.id)
                  await recarregar()
                  setCancelar(null); toast('Assinatura cancelada.', 'ok')
                } catch (err) {
                  toast(err instanceof ApiError ? err.mensagem : 'Não foi possível cancelar.', 'err')
                }
              }}>Cancelar pacote</button>
            </>
          }>
          <p>O pacote <b>{cancelar.nome}</b> de {clienteNome(cancelar.clienteId)} deixará de renovar automaticamente.</p>
        </Modal>
      )}
    </div>
  )
}

function NovoPacoteModal({ onClose, onCriar }: {
  onClose: () => void
  onCriar: (dados: {
    plano: { nome: string; periodicidade: string; preco: number; servicoIds: number[] }
    clienteId: number
    petId: number
  }) => Promise<void>
}) {
  const [nome, setNome] = useState('Plano Banho & Tosa Mensal')
  const [clienteId, setClienteId] = useState('2')
  const [petId, setPetId] = useState('3')
  const [sel, setSel] = useState<number[]>([2])
  const [periodicidade, setPeriodicidade] = useState('Mensal')
  const [enviando, setEnviando] = useState(false)

  const servicosSel = db.servicos.filter(s => sel.includes(s.id))
  const preco = servicosSel.reduce((s, x) => s + x.preco, 0) * 0.85 // desconto de pacote

  const toggle = (id: number) => setSel(s => s.includes(id) ? s.filter(x => x !== id) : [...s, id])

  return (
    <Modal title="Novo pacote recorrente (UC24)" onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={sel.length === 0 || enviando} onClick={async () => {
            setEnviando(true)
            try {
              await onCriar({
                plano: { nome, periodicidade, preco, servicoIds: sel },
                clienteId: Number(clienteId),
                petId: Number(petId),
              })
            } finally {
              setEnviando(false)
            }
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
