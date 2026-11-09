import React, { useEffect, useState } from 'react'
import { api, ApiError } from '../../api'
import { useToast, Field } from '../../ui'

type Unidade = { id: number; nome: string; email: string; telefone: string; endereco: string; cnpj: string; timezone: string; prazoEstornoDias: number; antecedenciaLembreteH: number; antecedenciaValidadeD: number; pontosPorReal: number }
export default function Configuracoes() {
  const toast = useToast()
  const [dados, setDados] = useState<Unidade | null>(null)
  const [erro, setErro] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [versao, setVersao] = useState(0)
  useEffect(() => {
    let atual = true
    setDados(null); setErro('')
    api.petshop.buscar().then(d => { if (atual) setDados(d) })
      .catch(e => { if (atual) setErro(e instanceof ApiError ? e.mensagem : 'Não foi possível consultar as configurações.') })
    return () => { atual = false }
  }, [versao])
  const alterar = (campo: keyof Unidade, valor: string | number) => setDados(d => d ? { ...d, [campo]: valor } : d)
  const salvar = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!dados || salvando) return
    setSalvando(true); setErro('')
    try {
      const { nome, email, telefone, endereco, prazoEstornoDias, antecedenciaLembreteH, antecedenciaValidadeD, pontosPorReal } = dados
      const atualizada = await api.petshop.atualizar({ nome, ...(email ? { email } : {}), telefone: telefone ?? '', endereco: endereco ?? '', prazoEstornoDias, antecedenciaLembreteH, antecedenciaValidadeD, pontosPorReal })
      setDados(atualizada)
      toast('Configurações salvas no banco.', 'ok')
    } catch (err) { setErro(err instanceof ApiError ? err.mensagem : 'Não foi possível salvar as configurações.') }
    finally { setSalvando(false) }
  }
  return <div>
    <div className="page-head"><div><h1>Configurações</h1><div className="sub">Dados e parâmetros da unidade</div></div><button className="btn btn-outline" disabled={salvando} onClick={() => setVersao(v => v + 1)}>Recarregar configurações</button></div>
    {erro && <div role="alert" className="alert danger">{erro}</div>}
    {!dados && !erro && <div role="status" className="alert info">Carregando configurações…</div>}
    {dados && <form onSubmit={salvar} className="card card-pad" style={{ maxWidth: 850 }}><fieldset disabled={salvando} style={{ border: 0, padding: 0 }}>
      <h3 className="mb-12">Dados do petshop</h3><div className="form-grid">
        <Field label="Nome do petshop" required full><input aria-label="Nome do petshop" required minLength={3} maxLength={150} value={dados.nome} onChange={e => alterar('nome', e.target.value)} /></Field>
        <Field label="E-mail de contato" required><input aria-label="E-mail de contato" required type="email" value={dados.email ?? ''} onChange={e => alterar('email', e.target.value)} /></Field>
        <Field label="Telefone"><input aria-label="Telefone do petshop" maxLength={20} value={dados.telefone ?? ''} onChange={e => alterar('telefone', e.target.value)} /></Field>
        <Field label="Endereço" full><input aria-label="Endereço do petshop" maxLength={255} value={dados.endereco ?? ''} onChange={e => alterar('endereco', e.target.value)} /></Field>
      </div><div className="divider" /><h3 className="mb-12">Políticas e notificações</h3><div className="form-grid">
        <Field label="Prazo de estorno (dias)"><input aria-label="Prazo de estorno" required type="number" min={0} max={365} value={dados.prazoEstornoDias} onChange={e => alterar('prazoEstornoDias', e.target.value)} /></Field>
        <Field label="Antecedência do lembrete (horas)"><input aria-label="Antecedência do lembrete" required type="number" min={1} max={168} value={dados.antecedenciaLembreteH} onChange={e => alterar('antecedenciaLembreteH', e.target.value)} /></Field>
        <Field label="Antecedência dos alertas de validade (dias)"><input aria-label="Antecedência da validade" required type="number" min={1} max={365} value={dados.antecedenciaValidadeD} onChange={e => alterar('antecedenciaValidadeD', e.target.value)} /></Field>
        <Field label="Pontos por real"><input aria-label="Pontos por real" required type="number" min={0} max={1000} step="0.01" value={dados.pontosPorReal} onChange={e => alterar('pontosPorReal', e.target.value)} /></Field>
      </div><div className="alert info mt-16">Os parâmetros são utilizados pelas regras do sistema. A entrega real de e-mails ainda depende da configuração de um provedor.</div>
      <div className="form-actions"><button className="btn btn-primary" type="submit" disabled={salvando}>{salvando ? 'Salvando…' : 'Salvar alterações'}</button></div>
    </fieldset></form>}
    {dados && <div className="card card-pad mt-16" style={{ maxWidth: 850 }}><h3>Informações da unidade</h3><p>CNPJ: {dados.cnpj || 'Não informado'} · Fuso horário: {dados.timezone}</p><p className="small muted">A gestão de backups e as ações de privacidade ainda não estão disponíveis nesta tela.</p></div>}
  </div>
}
