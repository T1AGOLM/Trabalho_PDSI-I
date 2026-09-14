import React, { useState } from 'react'
import { useToast, Field } from '../../ui'

export default function Configuracoes() {
  const toast = useToast()
  const [tab, setTab] = useState<'petshop' | 'notificacoes' | 'seguranca' | 'sistema'>('petshop')

  const [nomePet, setNomePet] = useState('PetPlus — Unidade Vila Mariana')
  const [emailPet, setEmailPet] = useState('contato@petplus.com.br')
  const [lembrete24h, setLembrete24h] = useState(true)
  const [push, setPush] = useState(true)
  const [retorno, setRetorno] = useState(true)
  const [prazoEstorno, setPrazoEstorno] = useState('7')

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Configurações</h1>
          <div className="sub">Preferências do sistema e conformidade (RNF11–RNF14)</div>
        </div>
      </div>

      <div className="tabs">
        {([['petshop', '🐾 Petshop'], ['notificacoes', '🔔 Notificações'], ['seguranca', '🔒 Segurança & LGPD'], ['sistema', '🖥 Sistema']] as const).map(([k, l]) => (
          <button key={k} className={`tab ${tab === k ? 'active' : ''}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === 'petshop' && (
        <div className="card card-pad" style={{ maxWidth: 720 }}>
          <div className="form-grid">
            <Field label="Nome do petshop" required full><input value={nomePet} onChange={e => setNomePet(e.target.value)} /></Field>
            <Field label="E-mail de contato"><input value={emailPet} onChange={e => setEmailPet(e.target.value)} /></Field>
            <Field label="Telefone"><input defaultValue="(11) 3555-0000" /></Field>
            <Field label="Endereço" full><input defaultValue="Rua das Flores, 123 — Vila Mariana, São Paulo/SP" /></Field>
            <Field label="CNPJ"><input defaultValue="12.345.678/0001-55" /></Field>
            <Field label="Horário de funcionamento"><input defaultValue="Seg–Sáb, 08h–18h" /></Field>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={() => toast('Dados do petshop salvos (simulado).', 'ok')}>Salvar alterações</button>
          </div>
        </div>
      )}

      {tab === 'notificacoes' && (
        <div className="card card-pad" style={{ maxWidth: 720 }}>
          <label className="checkbox-row mb-12" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={lembrete24h} onChange={e => setLembrete24h(e.target.checked)} />
            <span><b>Lembrete de agendamento 24h antes</b> — enviado por e-mail para agendamentos “confirmados” (RF12/RN06).</span>
          </label>
          <label className="checkbox-row mb-12" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={push} onChange={e => setPush(e.target.checked)} />
            <span><b>Notificações push (aplicativo)</b> — lembretes e avisos de vacina (RF22).</span>
          </label>
          <label className="checkbox-row mb-20" style={{ cursor: 'pointer' }}>
            <input type="checkbox" checked={retorno} onChange={e => setRetorno(e.target.checked)} />
            <span><b>Aviso de retorno de banho/tosa</b> — sugere agendamento após o intervalo configurado (RF13).</span>
          </label>
          <div className="form-grid">
            <Field label="Intervalo de retorno banho/tosa (dias)"><input type="number" defaultValue={30} /></Field>
            <Field label="Antecedência do aviso de vacina (dias)"><input type="number" defaultValue={15} /></Field>
          </div>
          <div className="form-actions">
            <button className="btn btn-primary" onClick={() => toast('Preferências de notificação salvas (simulado).', 'ok')}>Salvar</button>
          </div>
        </div>
      )}

      {tab === 'seguranca' && (
        <div style={{ maxWidth: 720 }}>
          <div className="card card-pad mb-16">
            <h3 className="mb-12" style={{ fontSize: 15 }}>Políticas comerciais</h3>
            <Field label="Prazo máximo para estorno de vendas (dias) — RN11">
              <input type="number" value={prazoEstorno} onChange={e => setPrazoEstorno(e.target.value)} />
            </Field>
            <div className="form-actions" style={{ marginTop: 12 }}>
              <button className="btn btn-primary" onClick={() => toast('Política salva (simulado).', 'ok')}>Salvar</button>
            </div>
          </div>
          <div className="card card-pad mb-16">
            <h3 className="mb-12" style={{ fontSize: 15 }}>LGPD (RNF11)</h3>
            <div className="kv"><span className="k">Consentimento exigido no cadastro</span><span className="v"><span className="badge badge-green">ativo</span></span></div>
            <div className="kv"><span className="k">Política de privacidade publicada</span><span className="v"><span className="badge badge-green">sim</span></span></div>
            <div className="kv"><span className="k">Dados sensíveis restritos por perfil</span><span className="v"><span className="badge badge-green">RN10</span></span></div>
            <div className="flex mt-12">
              <button className="btn btn-outline" onClick={() => toast('Política de Privacidade (simulada).', 'info')}>Ver política de privacidade</button>
              <button className="btn btn-outline" onClick={() => toast('Relatório de tratamento de dados (simulado).', 'info')}>Exportar dados de um titular</button>
            </div>
          </div>
          <div className="card card-pad">
            <h3 className="mb-12" style={{ fontSize: 15 }}>Backup (RNF12)</h3>
            <div className="kv"><span className="k">Último backup</span><span className="v">12/09/2026 às 03:00</span></div>
            <div className="kv"><span className="k">Frequência</span><span className="v">Diária · retenção 30 dias</span></div>
            <div className="flex mt-12">
              <button className="btn btn-primary" onClick={() => toast('Backup manual disparado (simulado).', 'ok')}>Fazer backup agora</button>
              <button className="btn btn-outline" onClick={() => toast('Histórico de backups (simulado).', 'info')}>Ver histórico</button>
            </div>
          </div>
        </div>
      )}

      {tab === 'sistema' && (
        <div style={{ maxWidth: 720 }}>
          <div className="card card-pad mb-16">
            <h3 className="mb-12" style={{ fontSize: 15 }}>Multi-tenant (RNF13)</h3>
            <table className="tbl">
              <thead><tr><th>Unidade</th><th>Domínio</th><th>Status</th></tr></thead>
              <tbody>
                <tr><td>PetPlus — Vila Mariana</td><td>vilamariana.petplus.com.br</td><td><span className="badge badge-green">ativa</span></td></tr>
                <tr><td>PetPlus — Pinheiros</td><td>pinheiros.petplus.com.br</td><td><span className="badge badge-green">ativa</span></td></tr>
                <tr><td>PetPlus — Santos</td><td>santos.petplus.com.br</td><td><span className="badge badge-amber">implantação</span></td></tr>
              </tbody>
            </table>
          </div>
          <div className="card card-pad">
            <h3 className="mb-12" style={{ fontSize: 15 }}>Preferências regionais (RNF14/RNF15)</h3>
            <div className="form-grid">
              <Field label="Idioma">
                <select defaultValue="pt-BR"><option value="pt-BR">Português (Brasil)</option><option>English (em breve)</option><option>Español (em breve)</option></select>
              </Field>
              <Field label="Fuso horário"><select defaultValue="america-sao-paulo"><option value="america-sao-paulo">América/São_Paulo (GMT-3)</option></select></Field>
              <Field label="Moeda"><select defaultValue="BRL"><option value="BRL">Real (R$)</option></select></Field>
            </div>
            <div className="alert info mt-16" style={{ marginBottom: 0 }}>
              Compatibilidade garantida com as duas versões mais recentes de Chrome, Firefox, Edge e Safari (RNF15).
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
