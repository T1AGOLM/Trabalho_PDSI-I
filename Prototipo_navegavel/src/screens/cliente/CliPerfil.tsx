import React, { useState } from 'react'
import { db } from '../../data'
import { useToast, Field } from '../../ui'

const MEU_ID = 1

export default function CliPerfil() {
  const toast = useToast()
  const cliente = db.clientes.find(c => c.id === MEU_ID)!
  const [nome, setNome] = useState(cliente.nome)
  const [email, setEmail] = useState(cliente.email)
  const [telefone, setTelefone] = useState(cliente.telefone)
  const [endereco, setEndereco] = useState(cliente.endereco)
  const [emailNotif, setEmailNotif] = useState(true)
  const [pushNotif, setPushNotif] = useState(true)

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Meu Perfil</h1>
          <div className="sub">Seus dados de acesso e preferências (RNF10/RNF11)</div>
        </div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card card-pad">
          <h3 className="mb-16" style={{ fontSize: 15 }}>Dados pessoais</h3>
          <div className="form-grid">
            <Field label="Nome completo" required full><input value={nome} onChange={e => setNome(e.target.value)} /></Field>
            <Field label="E-mail" required><input value={email} onChange={e => setEmail(e.target.value)} /></Field>
            <Field label="Telefone"><input value={telefone} onChange={e => setTelefone(e.target.value)} /></Field>
            <Field label="Endereço" full><input value={endereco} onChange={e => setEndereco(e.target.value)} /></Field>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={() => toast('Perfil atualizado (simulado).', 'ok')}>Salvar alterações</button>
          </div>
        </div>

        <div>
          <div className="card card-pad mb-16">
            <h3 className="mb-12" style={{ fontSize: 15 }}>Preferências de notificação</h3>
            <label className="checkbox-row mb-12" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={emailNotif} onChange={e => setEmailNotif(e.target.checked)} />
              <span>Receber <b>lembretes por e-mail</b> 24h antes dos agendamentos (RF12).</span>
            </label>
            <label className="checkbox-row" style={{ cursor: 'pointer' }}>
              <input type="checkbox" checked={pushNotif} onChange={e => setPushNotif(e.target.checked)} />
              <span>Receber <b>notificações push</b> no aplicativo (RF22).</span>
            </label>
          </div>

          <div className="card card-pad">
            <h3 className="mb-12" style={{ fontSize: 15 }}>Privacidade (LGPD)</h3>
            <div className="kv"><span className="k">Consentimento de uso de dados</span><span className="v"><span className="badge badge-green">concedido</span></span></div>
            <div className="flex mt-12" style={{ flexWrap: 'wrap' }}>
              <button className="btn btn-outline btn-sm" onClick={() => toast('Política de Privacidade (simulada).', 'info')}>Ver política</button>
              <button className="btn btn-outline btn-sm" onClick={() => toast('Exportação dos seus dados solicitada (simulada).', 'info')}>Baixar meus dados</button>
              <button className="btn btn-danger btn-sm" onClick={() => toast('Solicitação registrada — a equipe confirmará por e-mail.', 'warn')}>Excluir minha conta</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
