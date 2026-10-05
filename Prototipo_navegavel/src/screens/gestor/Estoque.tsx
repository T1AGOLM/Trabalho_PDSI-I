import React, { useState } from 'react'
import { db, sincronizar } from '../../data'
import { api, ApiError } from '../../api'
import { brl, fmtDate, getFornecedor } from '../../utils'
import { Modal, ConfirmDialog, useToast, EmptyState, Field } from '../../ui'
import type { Produto } from '../../types'

export default function Estoque() {
  const toast = useToast()
  const [prods, setProds] = useState<Produto[]>([...db.produtos])
  const [busca, setBusca] = useState('')
  const [novoOpen, setNovoOpen] = useState(false)
  const [edit, setEdit] = useState<Produto | null>(null)
  const [entrada, setEntrada] = useState<Produto | null>(null)
  const [qtdEntrada, setQtdEntrada] = useState('10')
  const [excluir, setExcluir] = useState<Produto | null>(null)

  /** Recarrega do banco e refleta na tabela local. */
  const recarregar = async () => {
    await sincronizar()
    setProds([...db.produtos])
  }

  const diasAte = (validade: string) => {
    if (!validade) return Infinity
    return Math.ceil((new Date(validade + 'T12:00:00').getTime() - new Date('2026-09-12T12:00:00').getTime()) / 86400000)
  }

  const baixoEstoque = (p: Produto) => p.quantidadeEstoque <= p.estoqueMinimo
  const validadeProxima = (p: Produto) => diasAte(p.validade) <= 30

  const filtrados = prods.filter(p => p.nome.toLowerCase().includes(busca.toLowerCase()) || p.categoria.toLowerCase().includes(busca.toLowerCase()))

  const alertasMin = prods.filter(baixoEstoque).length
  const alertasVal = prods.filter(validadeProxima).length

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Estoque</h1>
          <div className="sub">Produtos, mínimos e validade (UC08/UC10/UC21 · RF07/RF09/RF23)</div>
        </div>
        <button className="btn btn-primary" onClick={() => setNovoOpen(true)}>➕ Novo produto</button>
      </div>

      {(alertasMin > 0 || alertasVal > 0) && (
        <div className="alert warn">🔔 <span><b>{alertasMin} produto(s) no estoque mínimo</b> e <b>{alertasVal} com validade a vencer (≤ 30 dias)</b>. Ações recomendadas: reposição e promoção de saída.</span></div>
      )}

      <div className="filter-bar">
        <div className="search-box">
          <span className="s-ico">🔍</span>
          <input placeholder="Buscar por nome ou categoria..." value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
        <select className="field" style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)' }}>
          <option>Todas as categorias</option>
          {[...new Set(prods.map(p => p.categoria))].map(c => <option key={c}>{c}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="table-wrap">
          {filtrados.length === 0 ? <EmptyState icon="🔍" title="Nenhum produto encontrado" /> : (
            <table className="tbl">
              <thead><tr><th>Produto</th><th>Categoria</th><th className="num">Estoque</th><th className="num">Mínimo</th><th>Validade</th><th>Fornecedor</th><th className="num">Preço</th><th className="right">Ações</th></tr></thead>
              <tbody>
                {filtrados.map(p => {
                  const dias = diasAte(p.validade)
                  return (
                    <tr key={p.id}>
                      <td className="bold" style={{ maxWidth: 240 }}>{p.nome}</td>
                      <td><span className="badge badge-gray">{p.categoria}</span></td>
                      <td className="num">
                        <span className={`badge ${p.quantidadeEstoque === 0 ? 'badge-red' : baixoEstoque(p) ? 'badge-amber' : 'badge-green'}`}>
                          {p.quantidadeEstoque} un.
                        </span>
                      </td>
                      <td className="num muted">{p.estoqueMinimo}</td>
                      <td>
                        {p.validade ? (
                          <>
                            {fmtDate(p.validade)}
                            {dias <= 30 && <div><span className="badge badge-red tiny">vence em {dias}d</span></div>}
                          </>
                        ) : <span className="muted tiny">N/A</span>}
                      </td>
                      <td className="small">{getFornecedor(p.fornecedorId)?.nome ?? '—'}</td>
                      <td className="num">{brl(p.preco)}</td>
                      <td>
                        <div className="actions">
                          <button className="btn btn-ghost btn-sm" onClick={() => { setEntrada(p); setQtdEntrada('10') }}>⬆ Entrada</button>
                          <button className="btn btn-outline btn-sm" onClick={() => setEdit(p)}>Editar</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setExcluir(p)}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* Entrada de estoque */}
      {entrada && (
        <Modal title={`Entrada de estoque — ${entrada.nome}`} onClose={() => setEntrada(null)} size="narrow"
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setEntrada(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={async () => {
                const q = Number(qtdEntrada)
                if (!q || q <= 0) { toast('Informe uma quantidade válida.', 'err'); return }
                try {
                  // A entrada vira uma MOVIMENTAÇÃO de estoque no banco; o
                  // saldo é recalculado pelo gatilho, não somado na tela.
                  await api.produtos.entrada(entrada.id, q, 'Entrada pela tela de Estoque')
                  await recarregar()
                  setEntrada(null)
                  toast(`+${q} un. adicionadas ao estoque de ${entrada.nome}.`, 'ok')
                } catch (err) {
                  toast(err instanceof ApiError ? err.message : 'Não foi possível registrar a entrada.', 'err')
                }
              }}>Confirmar entrada</button>
            </>
          }>
          <div className="kv"><span className="k">Estoque atual</span><span className="v">{entrada.quantidadeEstoque} un.</span></div>
          <div className="kv"><span className="k">Estoque mínimo</span><span className="v">{entrada.estoqueMinimo} un.</span></div>
          <Field label="Quantidade de entrada" required>
            <input type="number" min={1} value={qtdEntrada} onChange={e => setQtdEntrada(e.target.value)} />
          </Field>
        </Modal>
      )}

      {edit && (
        <Modal title={`Editar produto — ${edit.nome}`} onClose={() => setEdit(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={async () => {
                try {
                  await api.produtos.atualizar(edit.id, {
                    nome: edit.nome,
                    categoria: edit.categoria,
                    preco: edit.preco,
                    estoqueMinimo: edit.estoqueMinimo,
                    validade: edit.validade,
                  })
                  await recarregar()
                  setEdit(null); toast('Produto atualizado no banco.', 'ok')
                } catch (err) {
                  toast(err instanceof ApiError ? err.message : 'Não foi possível salvar.', 'err')
                }
              }}>Salvar</button>
            </>
          }>
          <div className="form-grid">
            <Field label="Nome" required full><input value={edit.nome} onChange={e => setEdit({ ...edit, nome: e.target.value })} /></Field>
            <Field label="Categoria"><input value={edit.categoria} onChange={e => setEdit({ ...edit, categoria: e.target.value })} /></Field>
            <Field label="Preço (R$)"><input type="number" step="0.01" value={edit.preco} onChange={e => setEdit({ ...edit, preco: Number(e.target.value) })} /></Field>
            <Field label="Quantidade em estoque"><input type="number" value={edit.quantidadeEstoque} onChange={e => setEdit({ ...edit, quantidadeEstoque: Number(e.target.value) })} /></Field>
            <Field label="Estoque mínimo"><input type="number" value={edit.estoqueMinimo} onChange={e => setEdit({ ...edit, estoqueMinimo: Number(e.target.value) })} /></Field>
            <div className="alert info mt-12" style={{ gridColumn: '1 / -1' }}>
              O saldo atual ({edit.quantidadeEstoque} un.) é controlado pelo histórico de movimentações e não é editável aqui — use <b>Entrada</b> para alterar o estoque.
            </div>
            <Field label="Validade"><input type="date" value={edit.validade} onChange={e => setEdit({ ...edit, validade: e.target.value })} /></Field>
            <Field label="Fornecedor">
              <select value={edit.fornecedorId} onChange={e => setEdit({ ...edit, fornecedorId: Number(e.target.value) })}>
                {db.fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
              </select>
            </Field>
          </div>
        </Modal>
      )}

      {excluir && (
        <ConfirmDialog danger title="Excluir produto?"
          message={`O produto ${excluir.nome} será removido do catálogo. O histórico de vendas anteriores é preservado (RN03 — somente Gestor).`}
          confirmLabel="Excluir"
          onCancel={() => setExcluir(null)}
          onConfirm={async () => {
            try {
              await api.produtos.remover(excluir.id)
              await recarregar()
              setExcluir(null); toast('Produto excluído (inativação lógica — histórico preservado).', 'ok')
            } catch (err) {
              toast(err instanceof ApiError ? err.message : 'Não foi possível excluir.', 'err')
            }
          }} />
      )}

      {novoOpen && <NovoProdutoModal onClose={() => setNovoOpen(false)} onCriar={async (p) => {
        try {
          await api.produtos.criar({
            nome: p.nome,
            categoria: p.categoria,
            preco: p.preco,
            estoqueMinimo: p.estoqueMinimo,
            quantidadeInicial: p.quantidadeEstoque,
            validade: p.validade || undefined,
            fornecedorId: p.fornecedorId,
          })
          await recarregar()
          setNovoOpen(false)
          toast(`Produto ${p.nome} cadastrado no banco (UC08).`, 'ok')
        } catch (err) {
          toast(err instanceof ApiError ? err.message : 'Não foi possível cadastrar o produto.', 'err')
          throw err
        }
      }} />}
    </div>
  )
}

function NovoProdutoModal({ onClose, onCriar }: { onClose: () => void; onCriar: (p: Produto) => Promise<void> }) {
  const [nome, setNome] = useState(''); const [categoria, setCategoria] = useState('Alimentos'); const [qtd, setQtd] = useState('10')
  const [min, setMin] = useState('5'); const [validade, setValidade] = useState(''); const [preco, setPreco] = useState(''); const [forn, setForn] = useState('1')
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  return (
    <Modal title="Novo produto (UC08)" onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={salvando} onClick={async () => {
            if (!nome || !preco) { setErro('Preencha nome e preço do produto.'); return }
            setSalvando(true)
            setErro('')
            try {
              // `id` é gerado pelo banco; o formulário manda só os atributos.
              await onCriar({
                id: 0,
                nome, categoria,
                quantidadeEstoque: Number(qtd), estoqueMinimo: Number(min),
                validade, preco: Number(preco), fornecedorId: Number(forn),
              })
            } catch {
              setSalvando(false)
            }
          }}>{salvando ? 'Salvando…' : '✓ Cadastrar produto'}</button>
        </>
      }>
      {erro && <div className="alert danger">{erro}</div>}
      <div className="form-grid">
        <Field label="Nome do produto" required full><input value={nome} onChange={e => setNome(e.target.value)} placeholder="Ex.: Ração Super Premium 15kg" /></Field>
        <Field label="Categoria">
          <select value={categoria} onChange={e => setCategoria(e.target.value)}>
            {['Alimentos', 'Higiene', 'Farmácia', 'Acessórios', 'Brinquedos'].map(c => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Preço de venda (R$)" required><input type="number" step="0.01" value={preco} onChange={e => setPreco(e.target.value)} /></Field>
        <Field label="Quantidade inicial"><input type="number" value={qtd} onChange={e => setQtd(e.target.value)} /></Field>
        <Field label="Estoque mínimo"><input type="number" value={min} onChange={e => setMin(e.target.value)} /></Field>
        <Field label="Data de validade"><input type="date" value={validade} onChange={e => setValidade(e.target.value)} /></Field>
        <Field label="Fornecedor">
          <select value={forn} onChange={e => setForn(e.target.value)}>
            {db.fornecedores.map(f => <option key={f.id} value={f.id}>{f.nome}</option>)}
          </select>
        </Field>
      </div>
      <div className="alert info mt-12">O sistema emitirá alerta automático quando o estoque atingir o mínimo (RN05) ou faltarem 30 dias para a validade (RN09).</div>
    </Modal>
  )
}
