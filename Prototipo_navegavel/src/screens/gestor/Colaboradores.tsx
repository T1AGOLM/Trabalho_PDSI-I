import React, { useState } from 'react'
import { db, sincronizar } from '../../data'
import { api, ApiError } from '../../api'
import { cargoLabel, fmtDate } from '../../utils'
import { Modal, ConfirmDialog, useToast, EmptyState, Field } from '../../ui'
import type { Colaborador, JanelaDisponibilidade } from '../../types'

const DIAS_SEMANA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']

/**
 * Grade padrão de quem está sendo cadastrado: segunda a sexta, 08h–18h.
 * Sem grade o profissional não recebe agendamento nenhum — o gatilho
 * `fn_validar_disponibilidade` recusa (RN08) —, então é melhor nascer com
 * uma grade previsível e ajustá-la depois.
 */
const GRADE_PADRAO: JanelaDisponibilidade[] = [1, 2, 3, 4, 5].map(diaSemana => ({
  diaSemana, horaInicio: '08:00', horaFim: '18:00',
}))

function GradeModal({ colaborador, onClose, onSalvar }: {
  colaborador: Colaborador
  onClose: () => void
  onSalvar: (janelas: JanelaDisponibilidade[]) => Promise<void>
}) {
  const [janelas, setJanelas] = useState<JanelaDisponibilidade[]>(colaborador.disponibilidades ?? [])
  const [enviando, setEnviando] = useState(false)

  const janelaDe = (dia: number) => janelas.find(j => j.diaSemana === dia)
  const alternar = (dia: number) => setJanelas(prev =>
    janelaDe(dia)
      ? prev.filter(j => j.diaSemana !== dia)
      : [...prev, { diaSemana: dia, horaInicio: '08:00', horaFim: '18:00' }].sort((a, b) => a.diaSemana - b.diaSemana),
  )
  const ajustar = (dia: number, campo: 'horaInicio' | 'horaFim', valor: string) =>
    setJanelas(prev => prev.map(j => (j.diaSemana === dia ? { ...j, [campo]: valor } : j)))

  const invalida = janelas.some(j => j.horaInicio >= j.horaFim)

  return (
    <Modal title={`Grade de horários — ${colaborador.nome}`} onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={enviando || invalida} onClick={async () => {
            setEnviando(true)
            try {
              await onSalvar(janelas)
            } finally {
              setEnviando(false)
            }
          }}>Salvar grade</button>
        </>
      }>
      <div className="alert info">Só é possível agendar dentro desta grade — quem decide é o banco (RN08).</div>
      {invalida && <div className="alert danger">O horário final precisa ser depois do inicial.</div>}
      {DIAS_SEMANA.map((nomeDia, dia) => {
        const j = janelaDe(dia)
        return (
          <div key={dia} className="flex-between" style={{ padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
            <label className="checkbox-row" style={{ cursor: 'pointer', minWidth: 150 }}>
              <input type="checkbox" checked={Boolean(j)} onChange={() => alternar(dia)} /> <span>{nomeDia}</span>
            </label>
            {j ? (
              <div className="flex" style={{ gap: 8 }}>
                <input type="time" value={j.horaInicio} onChange={e => ajustar(dia, 'horaInicio', e.target.value)} />
                <span className="muted">até</span>
                <input type="time" value={j.horaFim} onChange={e => ajustar(dia, 'horaFim', e.target.value)} />
              </div>
            ) : (
              <span className="tiny muted">Não atende</span>
            )}
          </div>
        )
      })}
    </Modal>
  )
}

export default function Colaboradores() {
  const toast = useToast()
  const [cols, setCols] = useState<Colaborador[]>([...db.colaboradores])
  const [novoOpen, setNovoOpen] = useState(false)
  const [edit, setEdit] = useState<Colaborador | null>(null)
  const [grade, setGrade] = useState<Colaborador | null>(null)
  const [inativar, setInativar] = useState<Colaborador | null>(null)

  /** Relê a equipe do banco — a tela nunca "acha" que a escrita funcionou. */
  const recarregar = async () => {
    await sincronizar('colaboradores')
    setCols([...db.colaboradores])
  }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Colaboradores</h1>
          <div className="sub">Equipe operacional, cargos e disponibilidade (UC17 · RF16)</div>
        </div>
        <button className="btn btn-primary" onClick={() => setNovoOpen(true)}>➕ Novo colaborador</button>
      </div>

      <div className="stats-grid">
        {(['ATENDENTE', 'TOSADOR', 'BANHISTA', 'VETERINARIO'] as const).map(cargo => (
          <div className="stat-card" key={cargo}>
            <div className="stat-icon bg-teal">{cargo === 'ATENDENTE' ? '🛎️' : cargo === 'TOSADOR' ? '✂️' : cargo === 'BANHISTA' ? '🛁' : '🩺'}</div>
            <div>
              <div className="stat-value">{cols.filter(c => c.cargo === cargo && c.ativo).length}</div>
              <div className="stat-label">{cargoLabel[cargo]}(s) ativo(s)</div>
            </div>
          </div>
        ))}
      </div>

      <div className="card">
        <div className="table-wrap">
          <table className="tbl">
            <thead><tr><th>Colaborador</th><th>Cargo</th><th>Contato</th><th>Disponibilidade</th><th>Bloqueios</th><th>Status</th><th className="right">Ações</th></tr></thead>
            <tbody>
              {cols.map(c => {
                const blq = db.bloqueios.filter(b => b.colaboradorId === c.id)
                return (
                  <tr key={c.id} className={c.ativo ? '' : 'row-inactive'}>
                    <td className="bold">{c.nome}</td>
                    <td><span className="badge badge-blue">{cargoLabel[c.cargo]}</span></td>
                    <td>{c.telefone}<div className="tiny muted">{c.email}</div></td>
                    <td>{c.disponibilidade}</td>
                    <td>
                      {blq.length === 0 ? <span className="tiny muted">—</span> : blq.map(b => (
                        <div key={b.id} className="tiny"><span className="badge badge-amber">{fmtDate(b.dataInicio)} → {fmtDate(b.dataFim)}</span></div>
                      ))}
                    </td>
                    <td><span className={`badge ${c.ativo ? 'badge-green' : 'badge-gray'}`}>{c.ativo ? 'Ativo' : 'Inativo'}</span></td>
                    <td>
                      <div className="actions">
                        <button className="btn btn-outline btn-sm" onClick={() => setEdit(c)}>Editar</button>
                        <button className="btn btn-outline btn-sm" onClick={() => setGrade(c)}>Grade</button>
                        <button className="btn btn-danger btn-sm" onClick={() => setInativar(c)}>Inativar</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>

      {novoOpen && <NovoColabModal onClose={() => setNovoOpen(false)} onCriar={async (dados) => {
        try {
          await api.colaboradores.criar({ ...dados, disponibilidade: GRADE_PADRAO })
          await recarregar()
          setNovoOpen(false)
          toast(`Colaborador ${dados.nome} cadastrado com grade Seg–Sex, 08h–18h. Ajuste em “Grade”.`, 'ok')
        } catch (err) {
          toast(err instanceof ApiError ? err.mensagem : 'Não foi possível cadastrar o colaborador.', 'err')
          throw err
        }
      }} />}

      {edit && (
        <Modal title={`Editar — ${edit.nome}`} onClose={() => setEdit(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={async () => {
                try {
                  await api.colaboradores.atualizar(edit.id, {
                    nome: edit.nome, email: edit.email, telefone: edit.telefone, cargo: edit.cargo,
                  })
                  await recarregar()
                  setEdit(null); toast('Colaborador atualizado no banco.', 'ok')
                } catch (err) {
                  toast(err instanceof ApiError ? err.mensagem : 'Não foi possível salvar.', 'err')
                }
              }}>Salvar</button>
            </>
          }>
          <div className="form-grid">
            <Field label="Nome" required><input value={edit.nome} onChange={e => setEdit({ ...edit, nome: e.target.value })} /></Field>
            <Field label="Cargo">
              <select value={edit.cargo} onChange={e => setEdit({ ...edit, cargo: e.target.value as Colaborador['cargo'] })}>
                {Object.entries(cargoLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </Field>
            <Field label="Telefone"><input value={edit.telefone} onChange={e => setEdit({ ...edit, telefone: e.target.value })} /></Field>
            <Field label="E-mail"><input value={edit.email} onChange={e => setEdit({ ...edit, email: e.target.value })} /></Field>
            <div className="alert info mt-12" style={{ gridColumn: '1 / -1' }}>
              A grade de horários ({edit.disponibilidade || 'não definida'}) é editada em <b>Grade</b> e é o que o banco
              consulta para aceitar agendamentos (RN08).
            </div>
          </div>
        </Modal>
      )}

      {grade && <GradeModal colaborador={grade} onClose={() => setGrade(null)} onSalvar={async (janelas) => {
        try {
          await api.colaboradores.definirDisponibilidade(grade.id, janelas)
          await recarregar()
          setGrade(null)
          toast('Grade de horários atualizada.', 'ok')
        } catch (err) {
          toast(err instanceof ApiError ? err.mensagem : 'Não foi possível salvar a grade.', 'err')
          throw err
        }
      }} />}

      {inativar && (
        <ConfirmDialog danger title="Inativar colaborador?"
          message={`${inativar.nome} deixará de ser vinculado a novos agendamentos, mas o histórico será mantido (exclusão lógica).`}
          confirmLabel="Inativar"
          onCancel={() => setInativar(null)}
          onConfirm={async () => {
            try {
              await api.colaboradores.inativar(inativar.id)
              await recarregar()
              setInativar(null); toast('Colaborador inativado.', 'ok')
            } catch (err) {
              toast(err instanceof ApiError ? err.mensagem : 'Não foi possível inativar.', 'err')
            }
          }} />
      )}
    </div>
  )
}

function NovoColabModal({ onClose, onCriar }: {
  onClose: () => void
  onCriar: (dados: { nome: string; cargo: Colaborador['cargo']; telefone: string; email: string; senha?: string }) => Promise<void>
}) {
  const [nome, setNome] = useState(''); const [cargo, setCargo] = useState<Colaborador['cargo']>('ATENDENTE')
  const [telefone, setTelefone] = useState(''); const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [enviando, setEnviando] = useState(false)
  return (
    <Modal title="Novo colaborador (UC17)" onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" disabled={enviando} onClick={async () => {
            if (!nome || !telefone) { setErro('Preencha nome e telefone.'); return }
            if (!email.includes('@')) { setErro('Informe o e-mail de acesso do colaborador.'); return }
            if (senha && senha.length < 8) { setErro('A senha deve ter ao menos 8 caracteres, com letra e número (RNF02).'); return }
            setErro('')
            setEnviando(true)
            try {
              await onCriar({ nome, cargo, telefone, email, ...(senha ? { senha } : {}) })
            } finally {
              setEnviando(false)
            }
          }}>✓ Cadastrar</button>
        </>
      }>
      {erro && <div className="alert danger">{erro}</div>}
      <div className="form-grid">
        <Field label="Nome completo" required><input value={nome} onChange={e => setNome(e.target.value)} /></Field>
        <Field label="Cargo" required>
          <select value={cargo} onChange={e => setCargo(e.target.value as Colaborador['cargo'])}>
            {Object.entries(cargoLabel).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Telefone" required><input value={telefone} onChange={e => setTelefone(e.target.value)} /></Field>
        <Field label="E-mail de acesso" required><input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="nome@petplus.com" /></Field>
        <Field label="Senha inicial" full>
          <input type="password" value={senha} onChange={e => setSenha(e.target.value)} placeholder="Em branco = o colaborador define pela recuperação de senha" />
        </Field>
      </div>
      <div className="alert info mt-12">A disponibilidade cadastrada limita os horários em que o colaborador pode ser vinculado a agendamentos (RN08).</div>
    </Modal>
  )
}
