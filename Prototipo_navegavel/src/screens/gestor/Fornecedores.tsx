import React, { useState } from 'react'
import { db } from '../../data'
import { Modal, useToast, EmptyState, Field } from '../../ui'
import type { Fornecedor } from '../../types'

export default function Fornecedores() {
  const toast = useToast()
  const [forns, setForns] = useState<Fornecedor[]>([...db.fornecedores])
  const [novoOpen, setNovoOpen] = useState(false)
  const [detalhe, setDetalhe] = useState<Fornecedor | null>(null)

  const produtosDe = (fid: number) => db.produtos.filter(p => p.fornecedorId === fid)

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Fornecedores</h1>
          <div className="sub">Empresas parceiras de abastecimento (UC26)</div>
        </div>
        <button className="btn btn-primary" onClick={() => setNovoOpen(true)}>➕ Novo fornecedor</button>
      </div>

      <div className="grid-2">
        {forns.map(f => {
          const prods = produtosDe(f.id)
          return (
            <div className="card card-pad" key={f.id}>
              <div className="flex-between mb-12">
                <div className="flex" style={{ gap: 12 }}>
                  <div className="stat-icon bg-blue">🚚</div>
                  <div>
                    <div className="bold" style={{ fontSize: 15 }}>{f.nome}</div>
                    <div className="tiny muted">CNPJ {f.cnpj}</div>
                  </div>
                </div>
                <span className="badge badge-green">{prods.length} produto(s)</span>
              </div>
              <div className="kv"><span className="k">Contato</span><span className="v">{f.contato}</span></div>
              <div className="kv"><span className="k">Produtos fornecidos</span>
                <span className="v" style={{ textAlign: 'right' }}>
                  {prods.length ? prods.map(p => p.nome).join(', ') : '—'}
                </span>
              </div>
              <div className="flex mt-12" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-outline btn-sm" onClick={() => setDetalhe(f)}>Ver detalhes</button>
              </div>
            </div>
          )
        })}
      </div>

      {forns.length === 0 && <div className="card"><EmptyState icon="🚚" title="Nenhum fornecedor cadastrado" /></div>}

      {detalhe && (
        <Modal title={`Fornecedor — ${detalhe.nome}`} onClose={() => setDetalhe(null)}
          footer={<button className="btn btn-primary" onClick={() => setDetalhe(null)}>Fechar</button>}>
          <div className="kv"><span className="k">Razão social</span><span className="v">{detalhe.nome}</span></div>
          <div className="kv"><span className="k">CNPJ</span><span className="v">{detalhe.cnpj}</span></div>
          <div className="kv"><span className="k">Contato</span><span className="v">{detalhe.contato}</span></div>
          <h3 className="mt-16 mb-12" style={{ fontSize: 14 }}>Produtos vinculados</h3>
          <table className="tbl">
            <thead><tr><th>Produto</th><th className="num">Estoque</th><th className="num">Preço</th></tr></thead>
            <tbody>
              {produtosDe(detalhe.id).map(p => (
                <tr key={p.id}><td>{p.nome}</td><td className="num">{p.quantidadeEstoque} un.</td><td className="num">R$ {p.preco.toFixed(2).replace('.', ',')}</td></tr>
              ))}
              {produtosDe(detalhe.id).length === 0 && <tr><td colSpan={3} className="center muted">Nenhum produto vinculado.</td></tr>}
            </tbody>
          </table>
        </Modal>
      )}

      {novoOpen && <NovoFornModal onClose={() => setNovoOpen(false)} onCriar={(f) => {
        setForns(fs => [...fs, f]); setNovoOpen(false)
        toast(`Fornecedor ${f.nome} cadastrado (UC26).`, 'ok')
      }} />}
    </div>
  )
}

function NovoFornModal({ onClose, onCriar }: { onClose: () => void; onCriar: (f: Fornecedor) => void }) {
  const [nome, setNome] = useState(''); const [cnpj, setCnpj] = useState(''); const [contato, setContato] = useState('')
  const [erro, setErro] = useState('')
  return (
    <Modal title="Novo fornecedor (UC26)" onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => {
            if (!nome || cnpj.replace(/\D/g, '').length < 14) { setErro('Preencha o nome e um CNPJ válido (14 dígitos).'); return }
            onCriar({ id: Math.max(...db.fornecedores.map(f => f.id)) + 1, nome, cnpj, contato })
          }}>✓ Cadastrar fornecedor</button>
        </>
      }>
      {erro && <div className="alert danger">{erro}</div>}
      <div className="form-grid">
        <Field label="Razão social" required full><input value={nome} onChange={e => setNome(e.target.value)} /></Field>
        <Field label="CNPJ" required><input value={cnpj} onChange={e => setCnpj(e.target.value)} placeholder="00.000.000/0001-00" /></Field>
        <Field label="Telefone / contato"><input value={contato} onChange={e => setContato(e.target.value)} /></Field>
      </div>
    </Modal>
  )
}
