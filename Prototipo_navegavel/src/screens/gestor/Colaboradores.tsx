import React, { useState } from 'react'
import { db } from '../../data'
import { cargoLabel, fmtDate } from '../../utils'
import { Modal, ConfirmDialog, useToast, EmptyState, Field } from '../../ui'
import type { Colaborador } from '../../types'

export default function Colaboradores() {
  const toast = useToast()
  const [cols, setCols] = useState<Colaborador[]>([...db.colaboradores])
  const [novoOpen, setNovoOpen] = useState(false)
  const [edit, setEdit] = useState<Colaborador | null>(null)
  const [inativar, setInativar] = useState<Colaborador | null>(null)

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

      {novoOpen && <NovoColabModal onClose={() => setNovoOpen(false)} onCriar={(c) => {
        setCols(cs => [...cs, c])
        setNovoOpen(false)
        toast(`Colaborador ${c.nome} cadastrado. Defina a disponibilidade para permitir agendamentos (RN08).`, 'ok')
      }} />}

      {edit && (
        <Modal title={`Editar — ${edit.nome}`} onClose={() => setEdit(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => {
                setCols(cs => cs.map(c => c.id === edit.id ? edit : c))
                setEdit(null); toast('Colaborador atualizado.', 'ok')
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
            <Field label="Disponibilidade" full><input value={edit.disponibilidade} onChange={e => setEdit({ ...edit, disponibilidade: e.target.value })} placeholder="Ex.: Seg–Sex, 09h–18h" /></Field>
          </div>
        </Modal>
      )}

      {inativar && (
        <ConfirmDialog danger title="Inativar colaborador?"
          message={`${inativar.nome} deixará de ser vinculado a novos agendamentos, mas o histórico será mantido (exclusão lógica).`}
          confirmLabel="Inativar"
          onCancel={() => setInativar(null)}
          onConfirm={() => {
            setCols(cs => cs.map(c => c.id === inativar.id ? { ...c, ativo: false } : c))
            setInativar(null); toast('Colaborador inativado.', 'ok')
          }} />
      )}
    </div>
  )
}

function NovoColabModal({ onClose, onCriar }: { onClose: () => void; onCriar: (c: Colaborador) => void }) {
  const [nome, setNome] = useState(''); const [cargo, setCargo] = useState<Colaborador['cargo']>('ATENDENTE')
  const [telefone, setTelefone] = useState(''); const [email, setEmail] = useState(''); const [dispon, setDispon] = useState('Seg–Sáb, 08h–18h')
  const [erro, setErro] = useState('')
  return (
    <Modal title="Novo colaborador (UC17)" onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => {
            if (!nome || !telefone) { setErro('Preencha nome e telefone.'); return }
            onCriar({ id: Math.max(...db.colaboradores.map(c => c.id)) + 1, nome, cargo, telefone, email: email || `${nome.split(' ')[0].toLowerCase()}@petplus.com.br`, disponibilidade: dispon, ativo: true })
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
        <Field label="E-mail"><input value={email} onChange={e => setEmail(e.target.value)} /></Field>
        <Field label="Disponibilidade de horários" full>
          <input value={dispon} onChange={e => setDispon(e.target.value)} placeholder="Ex.: Seg–Sex, 09h–18h" />
        </Field>
      </div>
      <div className="alert info mt-12">A disponibilidade cadastrada limita os horários em que o colaborador pode ser vinculado a agendamentos (RN08).</div>
    </Modal>
  )
}
