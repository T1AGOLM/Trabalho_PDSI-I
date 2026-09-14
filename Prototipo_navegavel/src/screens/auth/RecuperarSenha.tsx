import React, { useState } from 'react'
import { useNav } from '../../shell'
import { useToast } from '../../ui'

export default function RecuperarSenha() {
  const nav = useNav()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.includes('@')) {
      toast('Informe um e-mail válido.', 'err')
      return
    }
    setEnviado(true)
    toast('Link de redefinição enviado (simulado).', 'ok')
  }

  return (
    <div className="auth-split">
      <div className="auth-left" style={{ display: 'none' }} />
      <div className="auth-right" style={{ flex: 1 }}>
        <div className="auth-card">
          <div className="card card-pad">
            {!enviado ? (
              <>
                <div className="mb-16" style={{ fontSize: 34 }}>🔑</div>
                <h2>Recuperar senha</h2>
                <div className="sub">Informe seu e-mail cadastrado (UC02). Enviaremos um link de redefinição.</div>
                <form onSubmit={submit}>
                  <div className="field mb-16">
                    <label>E-mail <span className="req">*</span></label>
                    <input type="email" placeholder="voce@email.com" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
                  </div>
                  <button className="btn btn-primary btn-lg btn-block" type="submit">Enviar link de redefinição</button>
                </form>
              </>
            ) : (
              <>
                <div className="mb-16" style={{ fontSize: 40 }}>📧</div>
                <h2>Verifique seu e-mail</h2>
                <div className="sub">
                  Enviamos um link de redefinição para <b>{email}</b>. O link expira em 30 minutos.
                </div>
                <div className="alert info">💡 No protótipo, nenhum e-mail é enviado de verdade — clique abaixo para simular o acesso ao link.</div>
                <button className="btn btn-primary btn-block btn-lg" onClick={() => nav('redefinir-senha')}>
                  Abrir link recebido (simulado) →
                </button>
              </>
            )}
            <div className="mt-16 center small">
              <a href="#/login" onClick={() => nav('login')}>← Voltar para o login</a>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
