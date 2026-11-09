import React, { useState } from 'react'
import { useNav } from '../../shell'
import { useToast } from '../../ui'
import { api, ApiError } from '../../api'

export default function RecuperarSenha() {
  const nav = useNav()
  const toast = useToast()
  const [email, setEmail] = useState('')
  const [enviado, setEnviado] = useState(false)
  const [enviando, setEnviando] = useState(false)
  const [tokenDemo, setTokenDemo] = useState('')
  const [erro, setErro] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!email.includes('@')) {
      toast('Informe um e-mail válido.', 'err')
      return
    }
    setErro('')
    setEnviando(true)
    try {
      const resposta = await api.auth.recuperarSenha(email)
      setTokenDemo(resposta.token ?? '')
      setEnviado(true)
    } catch (err) {
      setErro(err instanceof ApiError ? err.mensagem : 'Não foi possível solicitar a recuperação. Tente novamente.')
    } finally {
      setEnviando(false)
    }
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
                <div className="sub">Informe seu e-mail cadastrado para solicitar a redefinição.</div>
                {erro && <div className="alert danger" role="alert">{erro}</div>}
                <form onSubmit={submit}>
                  <div className="field mb-16">
                    <label>E-mail <span className="req">*</span></label>
                    <input type="email" placeholder="voce@email.com" value={email} onChange={e => setEmail(e.target.value)} autoFocus />
                  </div>
                  <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={enviando}>{enviando ? 'Solicitando…' : 'Solicitar redefinição'}</button>
                </form>
              </>
            ) : (
              <>
                <div className="mb-16" style={{ fontSize: 40 }}>📧</div>
                <h2>Solicitação registrada</h2>
                <div className="sub">
                  Se o e-mail informado estiver cadastrado, foi gerada uma solicitação. O link de recuperação é válido por 60 minutos.
                </div>
                <div className="alert info">O envio real de e-mail ainda não está configurado neste ambiente.</div>
                {tokenDemo && (
                  <button className="btn btn-primary btn-block btn-lg" onClick={() => nav('redefinir-senha', { token: tokenDemo })}>
                    Continuar redefinição em modo de demonstração →
                  </button>
                )}
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
