import React, { useState } from 'react'
import { useNav } from '../../shell'
import { useToast } from '../../ui'

export default function RedefinirSenha() {
  const nav = useNav()
  const toast = useToast()
  const [senha, setSenha] = useState('')
  const [conf, setConf] = useState('')
  const [erro, setErro] = useState('')

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (senha.length < 6) return setErro('A senha deve ter pelo menos 6 caracteres.')
    if (senha !== conf) return setErro('As senhas não coincidem.')
    toast('Senha redefinida com sucesso! Faça login com a nova senha.', 'ok')
    nav('login')
  }

  return (
    <div className="auth-split">
      <div className="auth-right" style={{ flex: 1 }}>
        <div className="auth-card">
          <div className="card card-pad">
            <div className="mb-16" style={{ fontSize: 34 }}>🔒</div>
            <h2>Definir nova senha</h2>
            <div className="sub">Crie uma nova senha de acesso. Ela será armazenada com hash + salt (RNF02).</div>
            {erro && <div className="alert danger">{erro}</div>}
            <form onSubmit={submit}>
              <div className="field mb-16">
                <label>Nova senha <span className="req">*</span></label>
                <input type="password" placeholder="Mínimo 6 caracteres" value={senha} onChange={e => setSenha(e.target.value)} />
              </div>
              <div className="field mb-16">
                <label>Confirmar nova senha <span className="req">*</span></label>
                <input type="password" placeholder="Repita a senha" value={conf} onChange={e => setConf(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-lg btn-block" type="submit">Redefinir senha</button>
            </form>
            <div className="mt-16 center small">
              <a href="#/login" onClick={() => nav('login')}>← Voltar para o login</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
