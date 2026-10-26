import React, { useState } from 'react'
import { useNav } from '../../shell'
import { useToast, Field } from '../../ui'
import { api, ApiError } from '../../api'
import type { Sessao } from '../../data'

/**
 * Autoatendimento do tutor (UC03/RF01/RF02).
 *
 * Em duas etapas: os dados da conta (que viram `usuario` + `cliente`) e o
 * primeiro pet. As duas escritas são reais: a segunda usa o id da sessão
 * recém-criada, então o pet fica no nome do tutor que acabou de se cadastrar.
 */
export default function CadastroCliente({ onCadastrar }: {
  onCadastrar: (dados: {
    nome: string; email: string; senha: string
    telefone?: string; endereco?: string; consentimento: boolean
  }) => Promise<Sessao>
}) {
  const nav = useNav()
  const toast = useToast()
  const [etapa, setEtapa] = useState(1)
  const [enviando, setEnviando] = useState(false)
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

  /** Mesma política do backend (RNF02): 8+ caracteres, com letra e número. */
  const senhaValida = senha.length >= 8 && /[A-Za-zÀ-ÿ]/.test(senha) && /\d/.test(senha)

  const proximo = () => {
    if (!nome || !email.includes('@') || !telefone) {
      setErro('Preencha nome, e-mail válido e telefone.')
      return
    }
    if (!senhaValida) {
      setErro('A senha deve ter ao menos 8 caracteres, com uma letra e um número (RNF02).')
      return
    }
    if (!consent) {
      setErro('É necessário aceitar a Política de Privacidade (LGPD — RNF11).')
      return
    }
    setErro('')
    setEtapa(2)
  }

  const concluir = async () => {
    if (!petNome) {
      setErro('Informe o nome do pet (você pode cadastrar outros depois).')
      return
    }
    setErro('')
    setEnviando(true)
    try {
      // Cadastro real: a senha é enviada uma única vez e o backend guarda
      // apenas o hash bcrypt (RNF02). O consentimento LGPD é obrigatório e
      // é gravado com data e hora (RNF11). A resposta já autentica a sessão.
      const sessao = await onCadastrar({
        nome, email, telefone, endereco, senha,
        consentimento: consent,
      })

      // O pet do passo 2 vai para o banco no nome do tutor recém-criado.
      await api.pets.criar({
        clienteId: sessao.id,
        nome: petNome,
        especie: petEspecie,
        raca: petRaca || 'SRD',
        porte: petPorte,
        ...(petIdade ? { idade: Number(petIdade) } : {}),
        ...(petObs ? { observacoesSaude: petObs } : {}),
      })

      toast(`Bem-vindo(a), ${nome.split(' ')[0]}! Seu cadastro e o de ${petNome} já estão no banco.`, 'ok')
      nav('cli-inicio')
    } catch (err) {
      if (err instanceof ApiError) {
        setErro(err.status === 409
          ? 'Este e-mail já está cadastrado. Tente fazer login.'
          : err.message)
      } else {
        setErro('Não foi possível concluir o cadastro. Tente novamente.')
      }
    } finally {
      setEnviando(false)
    }
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
                  <Field label="Senha de acesso" required full
                    error={senha && !senhaValida ? 'Mínimo 8 caracteres, com uma letra e um número.' : undefined}>
                    <input type="password" placeholder="Mínimo 8 caracteres, com letra e número" value={senha} onChange={e => setSenha(e.target.value)} />
                  </Field>
                </div>
                <label className="checkbox-row mt-16" style={{ cursor: 'pointer' }}>
                  <input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} />
                  <span>Li e concordo com a <a href="#" onClick={e => { e.preventDefault(); toast('Política de Privacidade (LGPD) — o consentimento é gravado com data e hora no banco.', 'info') }}>Política de Privacidade</a> e autorizo o uso dos meus dados e dos dados de saúde do meu pet para prestação dos serviços. <span className="req">*</span></span>
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
                  <button className="btn btn-primary" onClick={concluir} disabled={enviando}>
                    {enviando ? 'Gravando no banco…' : 'Concluir cadastro ✓'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
