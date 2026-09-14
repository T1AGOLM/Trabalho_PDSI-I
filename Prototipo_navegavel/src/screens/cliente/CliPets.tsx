import React, { useState } from 'react'
import { db } from '../../data'
import { Modal, useToast, Field, EmptyState } from '../../ui'
import type { Pet } from '../../types'

const MEU_ID = 1

export default function CliPets() {
  const toast = useToast()
  const [pets, setPets] = useState<Pet[]>(db.pets.filter(p => p.clienteId === MEU_ID))
  const [novoOpen, setNovoOpen] = useState(false)
  const [edit, setEdit] = useState<Pet | null>(null)

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Meus Pets</h1>
          <div className="sub">Gerencie os companheiros da sua família (RF02)</div>
        </div>
        <button className="btn btn-primary" onClick={() => setNovoOpen(true)}>➕ Cadastrar pet</button>
      </div>

      {pets.length === 0 ? <div className="card"><EmptyState icon="🐾" title="Nenhum pet cadastrado" /></div> : (
        <div className="grid-2">
          {pets.map(p => (
            <div className="card card-pad" key={p.id}>
              <div className="flex-between mb-12">
                <div className="flex" style={{ gap: 13 }}>
                  <div className="stat-icon bg-teal" style={{ width: 52, height: 52, fontSize: 25 }}>{p.especie === 'Gato' ? '🐱' : '🐶'}</div>
                  <div>
                    <div className="bold" style={{ fontSize: 16 }}>{p.nome}</div>
                    <div className="small muted">{p.especie} · {p.raca}</div>
                    <div className="tiny muted">{p.porte} · {p.idade} ano(s)</div>
                  </div>
                </div>
                <span className="badge badge-green">ativo</span>
              </div>
              <div className="kv"><span className="k">Observações de saúde</span></div>
              <div className="small muted mb-12">{p.observacoesSaude || '—'}</div>
              <div className="flex" style={{ justifyContent: 'flex-end' }}>
                <button className="btn btn-outline btn-sm" onClick={() => setEdit(p)}>✏️ Editar dados</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {edit && (
        <Modal title={`Editar — ${edit.nome}`} onClose={() => setEdit(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setEdit(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => {
                setPets(ps => ps.map(x => x.id === edit.id ? edit : x))
                setEdit(null); toast('Dados do pet atualizados.', 'ok')
              }}>Salvar</button>
            </>
          }>
          <div className="form-grid">
            <Field label="Nome" required><input value={edit.nome} onChange={e => setEdit({ ...edit, nome: e.target.value })} /></Field>
            <Field label="Espécie">
              <select value={edit.especie} onChange={e => setEdit({ ...edit, especie: e.target.value })}>
                {['Cachorro', 'Gato', 'Ave', 'Coelho', 'Roedor', 'Réptil', 'Outra'].map(x => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Raça"><input value={edit.raca} onChange={e => setEdit({ ...edit, raca: e.target.value })} /></Field>
            <Field label="Porte">
              <select value={edit.porte} onChange={e => setEdit({ ...edit, porte: e.target.value })}>
                {['Pequeno', 'Médio', 'Grande'].map(x => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Idade (anos)"><input type="number" value={edit.idade} onChange={e => setEdit({ ...edit, idade: Number(e.target.value) })} /></Field>
            <Field label="Observações de saúde" full><textarea value={edit.observacoesSaude} onChange={e => setEdit({ ...edit, observacoesSaude: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {novoOpen && <NovoPetModal onClose={() => setNovoOpen(false)} onCriar={(p) => {
        setPets(ps => [...ps, p]); setNovoOpen(false)
        toast(`${p.nome} cadastrado com sucesso!`, 'ok')
      }} />}
    </div>
  )
}

function NovoPetModal({ onClose, onCriar }: { onClose: () => void; onCriar: (p: Pet) => void }) {
  const [nome, setNome] = useState(''); const [especie, setEspecie] = useState('Cachorro'); const [raca, setRaca] = useState('')
  const [porte, setPorte] = useState('Pequeno'); const [idade, setIdade] = useState('1'); const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')
  return (
    <Modal title="Cadastrar pet" onClose={onClose}
      footer={
        <>
          <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
          <button className="btn btn-primary" onClick={() => {
            if (!nome) { setErro('Informe o nome do pet.'); return }
            onCriar({ id: Math.max(...db.pets.map(p => p.id)) + 1, clienteId: MEU_ID, nome, especie, raca: raca || 'SRD', porte, idade: Number(idade), observacoesSaude: obs, ativo: true })
          }}>✓ Cadastrar</button>
        </>
      }>
      {erro && <div className="alert danger">{erro}</div>}
      <div className="form-grid">
        <Field label="Nome" required><input value={nome} onChange={e => setNome(e.target.value)} /></Field>
        <Field label="Espécie">
          <select value={especie} onChange={e => setEspecie(e.target.value)}>
            {['Cachorro', 'Gato', 'Ave', 'Coelho', 'Roedor', 'Réptil', 'Outra'].map(x => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Raça"><input value={raca} onChange={e => setRaca(e.target.value)} /></Field>
        <Field label="Porte">
          <select value={porte} onChange={e => setPorte(e.target.value)}>
            {['Pequeno', 'Médio', 'Grande'].map(x => <option key={x}>{x}</option>)}
          </select>
        </Field>
        <Field label="Idade (anos)"><input type="number" value={idade} onChange={e => setIdade(e.target.value)} /></Field>
        <Field label="Observações de saúde" full><textarea value={obs} onChange={e => setObs(e.target.value)} placeholder="Alergias, medicações, cuidados..." /></Field>
      </div>
    </Modal>
  )
}
