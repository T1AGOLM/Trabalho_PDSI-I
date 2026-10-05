import React, { useState } from 'react'
import { db, sincronizar } from '../../data'
import { api, ApiError } from '../../api'
import { brl, fmtDateTime, getProduto } from '../../utils'
import { Modal, useToast, EmptyState, Field } from '../../ui'
import type { Venda, ItemVenda, Pagamento, FormaPagamento, Produto } from '../../types'

const FORMAS: FormaPagamento[] = ['dinheiro', 'débito', 'crédito', 'PIX']
const HOJE = '2026-09-12'

export default function PDV() {
  const toast = useToast()
  const [itens, setItens] = useState<ItemVenda[]>([])
  const [pagamentos, setPagamentos] = useState<Pagamento[]>([])
  const [novaForma, setNovaForma] = useState<FormaPagamento>('PIX')
  const [valorForma, setValorForma] = useState('')
  const [clienteId, setClienteId] = useState('1')
  const [comprovante, setComprovante] = useState<Venda | null>(null)
  const [prods, setProds] = useState<Produto[]>([...db.produtos])
  const [finalizando, setFinalizando] = useState(false)

  const total = itens.reduce((s, i) => s + i.quantidade * i.precoUnitario, 0)
  const totalPago = pagamentos.reduce((s, p) => s + p.valor, 0)
  const faltaPagar = Math.max(0, total - totalPago)

  // Toda a lógica vive DENTRO do updater funcional.
  //
  // Calcular `existente` fora dele (a partir de `itens`) lê um estado
  // obsoleto: dois cliques rápidos no mesmo produto — ou o duplo
  // processamento do StrictMode em desenvolvimento — fariam os dois
  // caminho entrarem no ramo "não existe" e duplicar a linha do carrinho.
  const addItem = (produto: Produto) => {
    let semSaldo = false

    setItens(is => {
      const existente = is.find(i => i.produtoId === produto.id)
      const novaQtd = (existente?.quantidade ?? 0) + 1

      if (novaQtd > produto.quantidadeEstoque) {
        semSaldo = true
        return is
      }
      if (existente) {
        return is.map(i => (i.produtoId === produto.id ? { ...i, quantidade: novaQtd } : i))
      }
      return [...is, {
        produtoId: produto.id, nome: produto.nome,
        quantidade: 1, precoUnitario: produto.preco,
      }]
    })

    if (semSaldo) {
      toast(`Estoque insuficiente para ${produto.nome} (RN02): apenas ${produto.quantidadeEstoque} un. disponíveis.`, 'err')
    }
  }

  const addServico = () => {
    const s = db.servicos[0]
    setItens(is => [...is, { produtoId: -s.id, nome: `${s.nome} (serviço)`, quantidade: 1, precoUnitario: s.preco }])
  }

  const changeQtd = (pid: number, delta: number) => {
    setItens(is => is.flatMap(i => {
      if (i.produtoId !== pid) return [i]
      const nova = i.quantidade + delta
      if (nova <= 0) return []
      const p = prods.find(x => x.id === pid)
      if (p && nova > p.quantidadeEstoque) {
        toast(`Estoque insuficiente (RN02): apenas ${p.quantidadeEstoque} un. de ${p.nome}.`, 'err')
        return [i]
      }
      return [{ ...i, quantidade: nova }]
    }))
  }

  const addPagamento = () => {
    const valor = valorForma ? Number(valorForma) : faltaPagar
    if (!valor || valor <= 0) { toast('Informe um valor para o pagamento.', 'err'); return }
    if (valor > faltaPagar + 0.001) { toast(`Valor maior que o saldo devedor (${brl(faltaPagar)}).`, 'err'); return }
    setPagamentos(ps => [...ps, { formaPagamento: novaForma, valor }])
    setValorForma('')
  }

  const finalizar = async () => {
    if (itens.length === 0) { toast('Adicione pelo menos um item à venda.', 'err'); return }
    if (faltaPagar > 0.001) { toast('Pagamento incompleto: adicione outra forma de pagamento (RF25 — pagamento combinado).', 'err'); return }

    setFinalizando(true)
    try {
      // Gravação real no banco: venda + itens + pagamentos + baixa de
      // estoque, tudo numa transação. O saldo devolvido é o do PostgreSQL,
      // não um cálculo feito na tela.
      const r = await api.vendas.registrar({
        clienteId: clienteId === '0' ? null : Number(clienteId),
        itens: itens
          .filter(i => i.produtoId > 0)
          .map(i => ({ produtoId: i.produtoId, quantidade: i.quantidade, precoUnitario: i.precoUnitario })),
        pagamentos: pagamentos.map(p => ({ formaPagamento: p.formaPagamento, valor: p.valor })),
      })

      const venda: Venda = {
        id: r.id,
        dataHora: new Date().toISOString().slice(0, 16),
        clienteId: Number(clienteId) || undefined,
        itens, pagamentos,
        valorTotal: r.valor_total,
        status: 'finalizada',
      }
      setComprovante(venda)
      setItens([]); setPagamentos([])

      // Recarrega do banco para que o catálogo e os alertas de estoque
      // mostrem o saldo novo (RF09).
      await sincronizar()
      setProds([...db.produtos])
      toast(`Venda #${r.id} registrada — estoque atualizado (UC09).`, 'ok')
    } catch (err) {
      // As mensagens vêm do banco: RN02 (estoque), RF25 (pagamento).
      toast(err instanceof ApiError ? err.message : 'Não foi possível registrar a venda.', 'err')
    } finally {
      setFinalizando(false)
    }
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>PDV — Ponto de Venda</h1>
          <div className="sub">Registro de vendas com múltiplas formas de pagamento (UC11 · RF10/RF25)</div>
        </div>
      </div>

      <div className="grid-2" style={{ gridTemplateColumns: '1.1fr 1fr', alignItems: 'start' }}>
        {/* Catálogo */}
        <div>
          <div className="card mb-16">
            <div className="card-head"><h3>Catálogo de produtos</h3><span className="hint">clique para adicionar</span></div>
            <div className="card-pad" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 10 }}>
              {prods.map(p => (
                <button key={p.id} className="card" style={{ padding: 12, textAlign: 'left', cursor: p.quantidadeEstoque === 0 ? 'not-allowed' : 'pointer', border: '1px solid var(--border)', background: p.quantidadeEstoque === 0 ? 'var(--bg)' : 'var(--surface)', opacity: p.quantidadeEstoque === 0 ? .55 : 1 }}
                  onClick={() => p.quantidadeEstoque > 0 && addItem(p)}>
                  <div style={{ fontWeight: 700, fontSize: 12.5 }}>{p.nome}</div>
                  <div className="flex-between mt-8">
                    <span className="badge badge-teal">{brl(p.preco)}</span>
                    <span className={`tiny bold ${p.quantidadeEstoque <= p.estoqueMinimo ? '' : ''}`} style={{ color: p.quantidadeEstoque <= p.estoqueMinimo ? 'var(--warn)' : 'var(--text-3)' }}>
                      {p.quantidadeEstoque} un.
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Carrinho */}
        <div>
          <div className="card mb-16">
            <div className="card-head"><h3>Itens da venda</h3><button className="btn btn-ghost btn-sm" onClick={addServico}>+ Adicionar serviço</button></div>
            <div className="card-pad">
              {itens.length === 0 ? <EmptyState icon="🛒" title="Nenhum item" sub="Clique nos produtos ao lado para adicionar." /> : (
                <>
                  {itens.map(i => (
                    <div key={i.produtoId} className="flex-between" style={{ padding: '9px 0', borderBottom: '1px dashed var(--border)' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>{i.nome}</div>
                        <div className="tiny muted">{brl(i.precoUnitario)} / un.</div>
                      </div>
                      <div className="flex" style={{ gap: 6 }}>
                        <button className="btn btn-outline btn-sm" onClick={() => changeQtd(i.produtoId, -1)}>−</button>
                        <b style={{ minWidth: 22, textAlign: 'center' }}>{i.quantidade}</b>
                        <button className="btn btn-outline btn-sm" onClick={() => changeQtd(i.produtoId, 1)}>+</button>
                      </div>
                      <div className="bold num" style={{ width: 90, textAlign: 'right' }}>{brl(i.quantidade * i.precoUnitario)}</div>
                      <button className="btn btn-ghost btn-sm" onClick={() => setItens(is => is.filter(x => x.produtoId !== i.produtoId))}>🗑</button>
                    </div>
                  ))}
                  <div className="flex-between mt-16" style={{ fontSize: 16 }}>
                    <b>Total</b><b style={{ color: 'var(--primary-dark)' }}>{brl(total)}</b>
                  </div>
                </>
              )}
            </div>
          </div>

          <div className="card mb-16">
            <div className="card-head"><h3>Pagamento</h3><span className="hint">RF25 — combinado permitido</span></div>
            <div className="card-pad">
              <div className="field mb-12">
                <label>Cliente (opcional — fidelidade)</label>
                <select value={clienteId} onChange={e => setClienteId(e.target.value)}>
                  <option value="0">Venda avulsa (sem cliente)</option>
                  {db.clientes.filter(c => c.ativo).map(c => <option key={c.id} value={c.id}>{c.nome} — {c.pontosFidelidade} pts</option>)}
                </select>
              </div>
              <div className="flex mb-12" style={{ flexWrap: 'wrap' }}>
                <select className="field" style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', flex: 1, minWidth: 120 }} value={novaForma} onChange={e => setNovaForma(e.target.value as FormaPagamento)}>
                  {FORMAS.map(f => <option key={f} value={f}>{f}</option>)}
                </select>
                <input className="field" style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', width: 130 }} placeholder={`Valor (${brl(faltaPagar)})`} value={valorForma} onChange={e => setValorForma(e.target.value)} />
                <button className="btn btn-outline" onClick={addPagamento} disabled={faltaPagar <= 0}>+ Adicionar</button>
              </div>
              {pagamentos.map((p, idx) => (
                <div key={idx} className="flex-between" style={{ padding: '7px 0', borderBottom: '1px dashed var(--border)' }}>
                  <span className="badge badge-blue">{p.formaPagamento}</span>
                  <div className="flex">
                    <b>{brl(p.valor)}</b>
                    <button className="btn btn-ghost btn-sm" onClick={() => setPagamentos(ps => ps.filter((_, i) => i !== idx))}>🗑</button>
                  </div>
                </div>
              ))}
              <div className="flex-between mt-12">
                <span className="muted">Total pago</span><b>{brl(totalPago)}</b>
              </div>
              <div className="flex-between">
                <span className="muted">Falta</span><b style={{ color: faltaPagar > 0 ? 'var(--danger)' : 'var(--success)' }}>{brl(faltaPagar)}</b>
              </div>
              <button className="btn btn-primary btn-lg btn-block mt-16" onClick={finalizar}
                disabled={itens.length === 0 || finalizando}>
                {finalizando ? 'Registrando no banco…' : '✓ Finalizar venda e gerar comprovante'}
              </button>
              <div className="alert info mt-12" style={{ marginBottom: 0 }}>A baixa no estoque é automática (UC09) e alertas de mínimo/validade são emitidos (UC10/UC21).</div>
            </div>
          </div>
        </div>
      </div>

      {/* Comprovante */}
      {comprovante && (
        <Modal title="Venda finalizada ✓" onClose={() => setComprovante(null)} size="narrow"
          footer={
            <>
              <button className="btn btn-outline no-print" onClick={() => { window.print(); toast('Simulação de impressão/PDF do comprovante.', 'info') }}>🖨 Imprimir / PDF</button>
              <button className="btn btn-primary" onClick={() => setComprovante(null)}>Concluir</button>
            </>
          }>
          <div className="center mb-16">
            <div style={{ fontSize: 40 }}>🧾</div>
            <div className="bold">PetPlus — Comprovante de Venda</div>
            <div className="tiny muted">Venda #{comprovante.id} · {fmtDateTime(comprovante.dataHora)}</div>
          </div>
          <div className="kv"><span className="k">Cliente</span><span className="v">{comprovante.clienteId ? db.clientes.find(c => c.id === comprovante.clienteId)?.nome : 'Avulsa'}</span></div>
          {comprovante.itens.map(i => (
            <div key={i.produtoId} className="kv">
              <span className="k">{i.quantidade}× {i.nome}</span>
              <span className="v">{brl(i.quantidade * i.precoUnitario)}</span>
            </div>
          ))}
          <div className="divider" />
          <div className="flex-between bold" style={{ fontSize: 15 }}><span>TOTAL</span><span>{brl(comprovante.valorTotal)}</span></div>
          <div className="divider" />
          {comprovante.pagamentos.map((p, i) => (
            <div key={i} className="kv"><span className="k">{p.formaPagamento}</span><span className="v">{brl(p.valor)}</span></div>
          ))}
          <div className="alert success mt-16" style={{ marginBottom: 0 }}>✅ Estoque atualizado automaticamente (UC09).</div>
        </Modal>
      )}
    </div>
  )
}
