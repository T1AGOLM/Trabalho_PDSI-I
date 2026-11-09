import React, { useState } from 'react'
import { useNav } from '../../shell'
import { useToast } from '../../ui'
import { api, ApiError } from '../../api'
import { useRoute } from '../../router'

export default function RedefinirSenha() {
  const nav = useNav()
  const toast = useToast()
  const [senha, setSenha] = useState('')
  const [conf, setConf] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  const route = useRoute()
  const token = String(route.params?.token ?? '')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!token) return setErro('Link inválido. Solicite um novo link de recuperação.')
    if (senha.length < 8 || senha.length > 72 || !/[A-Za-zÀ-ÿ]/.test(senha) || !/\d/.test(senha)) {
      return setErro('A senha deve ter de 8 a 72 caracteres, com letra e número.')
    }
    if (senha !== conf) return setErro('As senhas não coincidem.')
    setErro('')
    setEnviando(true)
    try {
      await api.auth.redefinirSenha(token, senha)
      toast('Senha redefinida com sucesso! Faça login com a nova senha.', 'ok')
      nav('login')
    } catch (err) {
      setErro(err instanceof ApiError ? err.mensagem : 'Não foi possível redefinir a senha. Tente novamente.')
    } finally {
      setEnviando(false)
    }
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
                <input type="password" placeholder="Mínimo 8 caracteres, com letra e número" value={senha} onChange={e => setSenha(e.target.value)} />
              </div>
              <div className="field mb-16">
                <label>Confirmar nova senha <span className="req">*</span></label>
                <input type="password" placeholder="Repita a senha" value={conf} onChange={e => setConf(e.target.value)} />
              </div>
              <button className="btn btn-primary btn-lg btn-block" type="submit" disabled={enviando}>{enviando ? 'Redefinindo…' : 'Redefinir senha'}</button>
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
