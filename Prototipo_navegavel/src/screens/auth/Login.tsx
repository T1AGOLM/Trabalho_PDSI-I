import React, { useState } from 'react'
import { useNav } from '../../shell'
import { useToast } from '../../ui'
import { usuarios } from '../../data'

const PERFIL_META: Record<string, { icon: string; nome: string; desc: string }> = {
  GESTOR: { icon: '👑', nome: 'Gestor', desc: 'Painel gerencial, relatórios, PDV e gestão completa' },
  COLABORADOR: { icon: '✂️', nome: 'Colaborador', desc: 'Minha agenda, atendimentos e histórico dos pets' },
  CLIENTE: { icon: '🐶', nome: 'Cliente (tutor)', desc: 'Agendar online, histórico de saúde e fidelidade' },
}

export default function Login({ onLogin }: { onLogin: (email: string) => void }) {
  const nav = useNav()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [senha, senhaState] = [useState(''), useState('')]
  const setSenha = senhaState[1]
  const [erro, setErro] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email || !senhaState[0]) {
      setErro('Informe e-mail e senha para entrar.')
      return
    }
    const u = usuarios.find(x => x.email.toLowerCase() === email.toLowerCase())
    if (!u || u.senha !== senhaState[0]) {
      setErro('Credenciais inválidas. Verifique e tente novamente. (UC01 — 3a)')
      return
    }
    setErro('')
    onLogin(u.email)
  }

  return (
    <div className="auth-split">
      <div className="auth-left">
        <div className="paws">🐾</div>
        <div className="auth-logo">
          <div className="logo">🐾</div>
          <div>
            <div className="t1">PetPlus</div>
            <div className="t2">SISTEMA DE GESTÃO PARA PETSHOP</div>
          </div>
        </div>
        <h1>Bem-vindo de volta!<br />Seu petshop na palma da mão.</h1>
        <p className="lead">
          Agenda sem conflitos, estoque sempre sob controle e clientes informados automaticamente.
        </p>
        {[
          { i: '📅', t: 'Agendamentos com validação de conflito de horário' },
          { i: '📦', t: 'Estoque com alerta de mínimo e validade' },
          { i: '🔔', t: 'Lembretes automáticos por e-mail e push' },
        ].map((f, i) => (
          <div className="auth-feat" key={i}>
            <div className="f-ico">{f.i}</div>
            <span>{f.t}</span>
          </div>
        ))}
        <div className="mt-20 tiny" style={{ color: '#7fa8a3' }}>
          Protótipo navegável — nenhum dado real é armazenado ou enviado.
        </div>
      </div>

      <div className="auth-right">
        <div className="auth-card">
          <div className="card card-pad">
            <h2>Entrar no sistema</h2>
            <div className="sub">Acesse com o seu perfil (UC01)</div>
            {erro && <div className="alert danger">{erro}</div>}
            <form onSubmit={submit}>
              <div className="field mb-16">
                <label>E-mail <span className="req">*</span></label>
                <input type="email" placeholder="voce@email.com" value={email} onChange={e => { setEmail(e.target.value); setErro('') }} />
              </div>
              <div className="field mb-16">
                <label>Senha <span className="req">*</span></label>
                <input type="password" placeholder="••••••" value={senhaState[0]} onChange={e => setSenha(e.target.value)} />
              </div>
              <div className="flex-between mb-16">
                <label className="checkbox-row" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" /> <span>Lembrar-me</span>
                </label>
                <a href="#/recuperar-senha" onClick={() => nav('recuperar-senha')}>Esqueci minha senha</a>
              </div>
              <button type="submit" className="btn btn-primary btn-lg btn-block">Entrar</button>
            </form>

            <div className="demo-accounts">
              <div className="d-t">Acesso rápido do protótipo (senha: 123)</div>
              {usuarios.map(u => {
                const m = PERFIL_META[u.perfil]
                return (
                  <button key={u.email} className="demo-btn" onClick={() => { setEmail(u.email); setSenha('123'); onLogin(u.email) }}>
                    <span className="d-ico">{m.icon}</span>
                    <span style={{ flex: 1 }}>
                      <b>{m.nome}</b>
                      <span className="d-mail">{u.email}</span>
                    </span>
                    <span className="tiny" style={{ color: 'var(--text-3)' }}>{m.desc}</span>
                  </button>
                )
              })}
            </div>

            <div className="mt-16 center small" style={{ color: 'var(--text-2)' }}>
              É novo por aqui? <a href="#/cadastro" onClick={() => nav('cadastro')}>Criar conta de cliente</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
