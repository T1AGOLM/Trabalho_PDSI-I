import React, { useState } from 'react'
import { useNav } from '../../shell'
import { useToast, Field } from '../../ui'

export default function CadastroCliente() {
  const nav = useNav()
  const toast = useToast()
  const [etapa, setEtapa] = useState(1)
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [telefone, setTelefone] = useState('')
  const [endereco, setEndereco] = useState('')
  const [senha, setSenha] = useState('')
  const [consent, setConsent] = useState(false)
  const [erro, setErro] = useState('')

  const [petNome, setPetNome] = useState('')
  const [petEspecie, setPetEspecie] = useState('Cachorro')
  const [petRaca, setPetRaca] = useState('')
  const [petPorte, setPetPorte] = useState('Pequeno')
  const [petIdade, setPetIdade] = useState('')
  const [petObs, setPetObs] = useState('')

  const proximo = () => {
    if (!nome || !email.includes('@') || !telefone || senha.length < 6) {
      setErro('Preencha nome, e-mail válido, telefone e uma senha com 6+ caracteres.')
      return
    }
    if (!consent) {
      setErro('É necessário aceitar a Política de Privacidade (LGPD — RNF11).')
      return
    }
    setErro('')
    setEtapa(2)
  }

  const concluir = () => {
    if (!petNome) {
      setErro('Informe o nome do pet (você pode cadastrar outros depois).')
      return
    }
    toast('Cadastro realizado com sucesso! Faça login para continuar.', 'ok')
    nav('login')
  }

  return (
    <div className="auth-split">
      <div className="auth-right" style={{ flex: 1, display: 'block', overflowY: 'auto' }}>
        <div className="auth-card" style={{ maxWidth: 620, margin: '40px auto' }}>
          <div className="card card-pad">
            <div className="flex-between mb-16">
              <div>
                <h2 style={{ marginBottom: 4 }}>Criar conta de cliente</h2>
                <div className="sub" style={{ marginBottom: 0 }}>Autoatendimento do tutor (UC03)</div>
              </div>
              <span className="badge badge-teal">Etapa {etapa} de 2</span>
            </div>

            <div className="steps">
              <div className={`step ${etapa >= 1 ? 'current' : ''}`}>
                <div className="s-num">1</div><span className="s-lbl">Seus dados</span>
              </div>
              <div className={`step-line ${etapa > 1 ? 'done' : ''}`} />
              <div className={`step ${etapa === 2 ? 'current' : ''}`}>
                <div className="s-num">2</div><span className="s-lbl">Seu pet</span>
              </div>
            </div>

            {erro && <div className="alert danger">{erro}</div>}

            {etapa === 1 && (
              <>
                <div className="form-grid">
                  <Field label="Nome completo" required>
                    <input placeholder="Ex.: Ana Beatriz Souza" value={nome} onChange={e => setNome(e.target.value)} />
                  </Field>
                  <Field label="E-mail" required>
                    <input type="email" placeholder="voce@email.com" value={email} onChange={e => setEmail(e.target.value)} />
                  </Field>
                  <Field label="Telefone / WhatsApp" required>
                    <input placeholder="(11) 90000-0000" value={telefone} onChange={e => setTelefone(e.target.value)} />
                  </Field>
                  <Field label="Endereço">
                    <input placeholder="Rua, número, bairro, cidade" value={endereco} onChange={e => setEndereco(e.target.value)} />
                  </Field>
                  <Field label="Senha de acesso" required full>
                    <input type="password" placeholder="Mínimo 6 caracteres" value={senha} onChange={e => setSenha(e.target.value)} />
                  </Field>
                </div>
                <label className="checkbox-row mt-16" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
                  <span>Li e concordo com a <a href="#" onClick={e => { e.preventDefault(); toast('Política de Privacidade (LGPD) — simulada no protótipo.', 'info') }}>Política de Privacidade</a> e autorizo o uso dos meus dados e dos dados de saúde do meu pet para prestação dos serviços. <span className="req">*</span></span>
                </label>
                <div className="form-actions">
                  <button className="btn btn-outline" onClick={() => nav('login')}>Cancelar</button>
                  <button className="btn btn-primary" onClick={proximo}>Continuar →</button>
                </div>
              </>
            )}

            {etapa === 2 && (
              <>
                <div className="alert info">Você poderá cadastrar mais pets depois, em “Meus Pets”.</div>
                <div className="form-grid">
                  <Field label="Nome do pet" required>
                    <input placeholder="Ex.: Bolinha" value={petNome} onChange={e => setPetNome(e.target.value)} />
                  </Field>
                  <Field label="Espécie">
                    <select value={petEspecie} onChange={e => setPetEspecie(e.target.value)}>
                      {['Cachorro', 'Gato', 'Ave', 'Coelho', 'Roedor', 'Réptil', 'Outra'].map(e => <option key={e}>{e}</option>)}
                    </select>
                  </Field>
                  <Field label="Raça">
                    <input placeholder="Ex.: Poodle" value={petRaca} onChange={e => setPetRaca(e.target.value)} />
                  </Field>
                  <Field label="Porte">
                    <select value={petPorte} onChange={e => setPetPorte(e.target.value)}>
                      {['Pequeno', 'Médio', 'Grande'].map(p => <option key={p}>{p}</option>)}
                    </select>
                  </Field>
                  <Field label="Idade (anos)">
                    <input type="number" min={0} max={30} placeholder="Ex.: 3" value={petIdade} onChange={e => setPetIdade(e.target.value)} />
                  </Field>
                  <Field label="Observações de saúde" full>
                    <textarea placeholder="Alergias, medicações, cuidados especiais..." value={petObs} onChange={e => setPetObs(e.target.value)} />
                  </Field>
                </div>
                <div className="form-actions">
                  <button className="btn btn-outline" onClick={() => setEtapa(1)}>← Voltar</button>
                  <button className="btn btn-primary" onClick={concluir}>Concluir cadastro ✓</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
