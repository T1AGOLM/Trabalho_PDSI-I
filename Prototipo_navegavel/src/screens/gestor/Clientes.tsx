import React, { useState } from 'react'
import { db } from '../../data'
import { fmtDate, getPet, petLabel } from '../../utils'
import { Modal, ConfirmDialog, useToast, EmptyState, Field } from '../../ui'
import type { Cliente, Pet } from '../../types'

type Tab = 'tutores' | 'pets'

export default function Clientes() {
  const toast = useToast()
  const [tab, setTab] = useState<Tab>('tutores')
  const [busca, setBusca] = useState('')
  const [clientes, setClientes] = useState<Cliente[]>([...db.clientes])
  const [pets, setPets] = useState<Pet[]>([...db.pets])
  const [novoOpen, setNovoOpen] = useState(false)
  const [editCli, setEditCli] = useState<Cliente | null>(null)
  const [editPet, setEditPet] = useState<Pet | null>(null)
  const [inativar, setInativar] = useState<{ tipo: 'cli' | 'pet'; item: Cliente | Pet } | null>(null)
  const [detalhe, setDetalhe] = useState<Cliente | null>(null)

  const filtra = (texto: string) => texto.toLowerCase().includes(busca.toLowerCase())

  const clientesFiltrados = clientes.filter(c => filtra(c.nome) || filtra(c.email) || filtra(c.telefone))
  const petsFiltrados = pets.filter(p => filtra(p.nome) || filtra(p.raca) || filtra(clienteNomeSafe(p.clienteId)))

  function clienteNomeSafe(id: number) {
    return clientes.find(c => c.id === id)?.nome ?? ''
  }

  const petsDoCliente = (cid: number) => pets.filter(p => p.clienteId === cid)

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Clientes & Pets</h1>
          <div className="sub">Cadastro de tutores e animais (UC03/UC04 · RF01–RF03)</div>
        </div>
        <button className="btn btn-primary" onClick={() => setNovoOpen(true)}>➕ Novo cliente + pet</button>
      </div>

      <div className="tabs">
        <button className={`tab ${tab === 'tutores' ? 'active' : ''}`} onClick={() => setTab('tutores')}>👥 Tutores ({clientes.length})</button>
        <button className={`tab ${tab === 'pets' ? 'active' : ''}`} onClick={() => setTab('pets')}>🐶 Pets ({pets.length})</button>
      </div>

      <div className="filter-bar">
        <div className="search-box">
          <span className="s-ico">🔍</span>
          <input placeholder={tab === 'tutores' ? 'Buscar por nome, e-mail ou telefone...' : 'Buscar por pet, raça ou tutor...'} value={busca} onChange={e => setBusca(e.target.value)} />
        </div>
      </div>

      {tab === 'tutores' && (
        <div className="card">
          <div className="table-wrap">
            {clientesFiltrados.length === 0 ? <EmptyState icon="🔍" title="Nenhum cliente encontrado" /> : (
              <table className="tbl">
                <thead><tr><th>Cliente</th><th>Contato</th><th>Pets</th><th>Fidelidade</th><th>Status</th><th className="right">Ações</th></tr></thead>
                <tbody>
                  {clientesFiltrados.map(c => (
                    <tr key={c.id} className={c.ativo ? '' : 'row-inactive'}>
                      <td>
                        <div className="bold">{c.nome}</div>
                        <div className="tiny muted">{c.email}</div>
                      </td>
                      <td>{c.telefone}<div className="tiny muted">{c.endereco.split('—')[1] ?? c.endereco}</div></td>
                      <td>{petsDoCliente(c.id).map(p => p.nome).join(', ') || '—'}</td>
                      <td><span className="badge badge-teal">{c.pontosFidelidade} pts</span></td>
                      <td><span className={`badge ${c.ativo ? 'badge-green' : 'badge-gray'}`}>{c.ativo ? 'Ativo' : 'Inativo'}</span></td>
                      <td>
                        <div className="actions">
                          <button className="btn btn-ghost btn-sm" onClick={() => setDetalhe(c)}>Ver</button>
                          <button className="btn btn-outline btn-sm" onClick={() => setEditCli(c)}>Editar</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setInativar({ tipo: 'cli', item: c })}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {tab === 'pets' && (
        <div className="card">
          <div className="table-wrap">
            {petsFiltrados.length === 0 ? <EmptyState icon="🔍" title="Nenhum pet encontrado" /> : (
              <table className="tbl">
                <thead><tr><th>Pet</th><th>Espécie / Raça</th><th>Porte / Idade</th><th>Tutor</th><th>Saúde</th><th className="right">Ações</th></tr></thead>
                <tbody>
                  {petsFiltrados.map(p => (
                    <tr key={p.id} className={p.ativo ? '' : 'row-inactive'}>
                      <td className="bold">{p.nome}</td>
                      <td>{p.especie}<div className="tiny muted">{p.raca}</div></td>
                      <td>{p.porte}<div className="tiny muted">{p.idade} ano(s)</div></td>
                      <td>{clienteNomeSafe(p.clienteId)}</td>
                      <td style={{ maxWidth: 220 }}><span className="tiny muted">{p.observacoesSaude || '—'}</span></td>
                      <td>
                        <div className="actions">
                          <button className="btn btn-outline btn-sm" onClick={() => setEditPet(p)}>Editar</button>
                          <button className="btn btn-danger btn-sm" onClick={() => setInativar({ tipo: 'pet', item: p })}>Excluir</button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Novo cliente + pet */}
      {novoOpen && <NovoClienteModal onClose={() => setNovoOpen(false)} onCriar={(c, p) => {
        setClientes(cs => [...cs, c])
        setPets(ps => [...ps, p])
        setNovoOpen(false)
        toast(`Cliente ${c.nome} e pet ${p.nome} cadastrados com sucesso!`, 'ok')
      }} />}

      {/* Editar cliente */}
      {editCli && (
        <Modal title={`Editar — ${editCli.nome}`} onClose={() => setEditCli(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setEditCli(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => {
                setClientes(cs => cs.map(c => c.id === editCli.id ? editCli : c))
                setEditCli(null)
                toast('Dados do cliente atualizados.', 'ok')
              }}>Salvar</button>
            </>
          }>
          <div className="form-grid">
            <Field label="Nome" required><input value={editCli.nome} onChange={e => setEditCli({ ...editCli, nome: e.target.value })} /></Field>
            <Field label="E-mail" required><input value={editCli.email} onChange={e => setEditCli({ ...editCli, email: e.target.value })} /></Field>
            <Field label="Telefone"><input value={editCli.telefone} onChange={e => setEditCli({ ...editCli, telefone: e.target.value })} /></Field>
            <Field label="Pontos de fidelidade"><input type="number" value={editCli.pontosFidelidade} onChange={e => setEditCli({ ...editCli, pontosFidelidade: Number(e.target.value) })} /></Field>
            <Field label="Endereço" full><input value={editCli.endereco} onChange={e => setEditCli({ ...editCli, endereco: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {/* Editar pet */}
      {editPet && (
        <Modal title={`Editar pet — ${editPet.nome}`} onClose={() => setEditPet(null)}
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setEditPet(null)}>Cancelar</button>
              <button className="btn btn-primary" onClick={() => {
                setPets(ps => ps.map(p => p.id === editPet.id ? editPet : p))
                setEditPet(null)
                toast('Dados do pet atualizados.', 'ok')
              }}>Salvar</button>
            </>
          }>
          <div className="form-grid">
            <Field label="Nome" required><input value={editPet.nome} onChange={e => setEditPet({ ...editPet, nome: e.target.value })} /></Field>
            <Field label="Espécie">
              <select value={editPet.especie} onChange={e => setEditPet({ ...editPet, especie: e.target.value })}>
                {['Cachorro', 'Gato', 'Ave', 'Coelho', 'Roedor', 'Réptil', 'Outra'].map(x => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Raça"><input value={editPet.raca} onChange={e => setEditPet({ ...editPet, raca: e.target.value })} /></Field>
            <Field label="Porte">
              <select value={editPet.porte} onChange={e => setEditPet({ ...editPet, porte: e.target.value })}>
                {['Pequeno', 'Médio', 'Grande'].map(x => <option key={x}>{x}</option>)}
              </select>
            </Field>
            <Field label="Idade (anos)"><input type="number" value={editPet.idade} onChange={e => setEditPet({ ...editPet, idade: Number(e.target.value) })} /></Field>
            <Field label="Observações de saúde" full><textarea value={editPet.observacoesSaude} onChange={e => setEditPet({ ...editPet, observacoesSaude: e.target.value })} /></Field>
          </div>
        </Modal>
      )}

      {/* Detalhe cliente */}
      {detalhe && (
        <Modal title={`Ficha do cliente — ${detalhe.nome}`} onClose={() => setDetalhe(null)} size="wide"
          footer={<button className="btn btn-primary" onClick={() => setDetalhe(null)}>Fechar</button>}>
          <div className="grid-2">
            <div>
              <h3 className="mb-12" style={{ fontSize: 14 }}>Dados cadastrais</h3>
              <div className="kv"><span className="k">Nome</span><span className="v">{detalhe.nome}</span></div>
              <div className="kv"><span className="k">E-mail</span><span className="v">{detalhe.email}</span></div>
              <div className="kv"><span className="k">Telefone</span><span className="v">{detalhe.telefone}</span></div>
              <div className="kv"><span className="k">Endereço</span><span className="v">{detalhe.endereco}</span></div>
              <div className="kv"><span className="k">Fidelidade</span><span className="v">{detalhe.pontosFidelidade} pts</span></div>
              <div className="kv"><span className="k">Status</span><span className="v">{detalhe.ativo ? 'Ativo' : 'Inativo'}</span></div>
            </div>
            <div>
              <h3 className="mb-12" style={{ fontSize: 14 }}>Pets vinculados</h3>
              {petsDoCliente(detalhe.id).map(p => (
                <div key={p.id} className="card card-pad mb-12" style={{ padding: 14 }}>
                  <div className="flex-between">
                    <b>🐶 {p.nome}</b><span className="badge badge-teal">{p.especie}</span>
                  </div>
                  <div className="tiny muted mt-8">{p.raca} · {p.porte} · {p.idade} ano(s)</div>
                  <div className="tiny muted">Saúde: {p.observacoesSaude || '—'}</div>
                </div>
              ))}
              {petsDoCliente(detalhe.id).length === 0 && <div className="small muted">Nenhum pet vinculado.</div>}
            </div>
          </div>
        </Modal>
      )}

      {/* Inativação (exclusão lógica) */}
      {inativar && (
        <ConfirmDialog danger title="Inativar cadastro?"
          message={`Esta é uma exclusão lógica (RF03): o registro de ${inativar.item.nome} será marcado como inativo, e não removido. Somente o Gestor pode excluir cadastros (RN03).`}
          confirmLabel="Inativar"
          onCancel={() => setInativar(null)}
          onConfirm={() => {
            if (inativar.tipo === 'cli') setClientes(cs => cs.map(c => c.id === inativar.item.id ? { ...c, ativo: false } : c))
            else setPets(ps => ps.map(p => p.id === inativar.item.id ? { ...p, ativo: false } : p))
            setInativar(null)
            toast('Cadastro inativado com sucesso.', 'ok')
          }} />
      )}
    </div>
  )
}

function NovoClienteModal({ onClose, onCriar }: {
  onClose: () => void
  onCriar: (c: Cliente, p: Pet) => void
}) {
  const [etapa, setEtapa] = useState(1)
  const [nome, setNome] = useState(''); const [email, setEmail] = useState(''); const [telefone, setTelefone] = useState(''); const [endereco, setEndereco] = useState('')
  const [petNome, setPetNome] = useState(''); const [especie, setEspecie] = useState('Cachorro'); const [raca, setRaca] = useState(''); const [porte, setPorte] = useState('Pequeno'); const [idade, setIdade] = useState('1'); const [obs, setObs] = useState('')
  const [erro, setErro] = useState('')

  return (
    <Modal title="Novo cliente + pet (UC03)" onClose={onClose} size="wide"
      footer={
        etapa === 1
          ? <>
            <button className="btn btn-outline" onClick={onClose}>Cancelar</button>
            <button className="btn btn-primary" onClick={() => {
              if (!nome || !email.includes('@') || !telefone) { setErro('Preencha nome, e-mail e telefone.'); return }
              setErro(''); setEtapa(2)
            }}>Continuar para o pet →</button>
          </>
          : <>
            <button className="btn btn-outline" onClick={() => setEtapa(1)}>← Voltar</button>
            <button className="btn btn-primary" onClick={() => {
              if (!petNome) { setErro('Informe o nome do pet.'); return }
              onCriar(
                { id: Math.max(...db.clientes.map(c => c.id)) + 1, nome, email, telefone, endereco, pontosFidelidade: 0, ativo: true },
                { id: Math.max(...db.pets.map(p => p.id)) + 1, clienteId: Math.max(...db.clientes.map(c => c.id)) + 1, nome: petNome, especie, raca: raca || 'SRD', porte, idade: Number(idade), observacoesSaude: obs, ativo: true },
              )
            }}>✓ Cadastrar cliente e pet</button>
          </>
      }>
      {erro && <div className="alert danger">{erro}</div>}
      {etapa === 1 ? (
        <>
          <h3 className="mb-12" style={{ fontSize: 14 }}>Dados do tutor</h3>
          <div className="form-grid">
            <Field label="Nome completo" required><input value={nome} onChange={e => setNome(e.target.value)} /></Field>
            <Field label="E-mail" required><input value={email} onChange={e => setEmail(e.target.value)} /></Field>
            <Field label="Telefone" required><input value={telefone} onChange={e => setTelefone(e.target.value)} /></Field>
            <Field label="Endereço"><input value={endereco} onChange={e => setEndereco(e.target.value)} /></Field>
          </div>
        </>
      ) : (
        <>
          <h3 className="mb-12" style={{ fontSize: 14 }}>Primeiro pet de {nome}</h3>
          <div className="form-grid">
            <Field label="Nome do pet" required><input value={petNome} onChange={e => setPetNome(e.target.value)} /></Field>
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
            <Field label="Observações de saúde" full><textarea value={obs} onChange={e => setObs(e.target.value)} /></Field>
          </div>
        </>
      )}
    </Modal>
  )
}
