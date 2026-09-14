import React from 'react'
import { db } from '../../data'
import { fmtDateTime, petLabel, servicoLabel, brl } from '../../utils'
import { EmptyState } from '../../ui'
import { useNav } from '../../shell'

const MEU_ID = 1 // Ana (cliente logada no protótipo)

export default function CliInicio() {
  const nav = useNav()
  const meusPets = db.pets.filter(p => p.clienteId === MEU_ID)
  const proximos = db.agendamentos
    .filter(a => a.clienteId === MEU_ID && a.status === 'confirmado')
    .sort((a, b) => a.dataHora.localeCompare(b.dataHora))
  const avaliacoesPendentes = db.agendamentos.filter(a => a.clienteId === MEU_ID && a.status === 'concluído' && !db.avaliacoes.some(av => av.agendamentoId === a.id))
  const cliente = db.clientes.find(c => c.id === MEU_ID)!

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Olá, {cliente.nome.split(' ')[0]}! 👋</h1>
          <div className="sub">Bem-vinda ao seu espaço PetPlus — cuide do seu pet sem sair de casa.</div>
        </div>
        <button className="btn btn-primary" onClick={() => nav('cli-agendar')}>➕ Agendar serviço</button>
      </div>

      <div className="stats-grid">
        <div className="stat-card"><div className="stat-icon bg-teal">🐶</div><div><div className="stat-value">{meusPets.length}</div><div className="stat-label">Pets cadastrados</div></div></div>
        <div className="stat-card"><div className="stat-icon bg-blue">📅</div><div><div className="stat-value">{proximos.length}</div><div className="stat-label">Agendamentos futuros</div></div></div>
        <div className="stat-card"><div className="stat-icon bg-orange">⭐</div><div><div className="stat-value">{cliente.pontosFidelidade}</div><div className="stat-label">Pontos de fidelidade</div></div></div>
        <div className="stat-card"><div className="stat-icon bg-green">🩺</div><div><div className="stat-value">{avaliacoesPendentes.length}</div><div className="stat-label">Serviços para avaliar</div></div></div>
      </div>

      <div className="grid-2" style={{ alignItems: 'start' }}>
        <div className="card">
          <div className="card-head">
            <h3>Próximos agendamentos</h3>
            <button className="btn btn-ghost btn-sm" onClick={() => nav('cli-agendamentos')}>Ver todos →</button>
          </div>
          <div className="card-pad">
            {proximos.length === 0 ? <EmptyState icon="📭" title="Nenhum agendamento futuro" /> : proximos.map(a => (
              <div key={a.id} className="card card-pad mb-12" style={{ padding: 14, background: '#f9fcfc' }}>
                <div className="flex-between">
                  <div className="flex" style={{ gap: 11 }}>
                    <div className="stat-icon bg-teal" style={{ width: 40, height: 40, fontSize: 18 }}>{db.pets.find(p => p.id === a.petId)?.especie === 'Gato' ? '🐱' : '🐶'}</div>
                    <div>
                      <div className="bold" style={{ fontSize: 13.5 }}>{servicoLabel(a.servicoId)}</div>
                      <div className="tiny muted">{petLabel(a.petId)} · {fmtDateTime(a.dataHora)}</div>
                    </div>
                  </div>
                  <span className="badge badge-teal">{brl(db.servicos.find(s => s.id === a.servicoId)?.preco ?? 0)}</span>
                </div>
              </div>
            ))}
            <div className="alert info mt-8" style={{ marginBottom: 0 }}>🔔 Você recebe um lembrete por e-mail 24h antes de cada serviço confirmado (RF12).</div>
          </div>
        </div>

        <div>
          <div className="card mb-16">
            <div className="card-head">
              <h3>Meus pets</h3>
              <button className="btn btn-ghost btn-sm" onClick={() => nav('cli-pets')}>Gerenciar →</button>
            </div>
            <div className="card-pad" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {meusPets.map(p => (
                <div key={p.id} className="card card-pad" style={{ padding: 13 }}>
                  <div className="bold">{p.especie === 'Gato' ? '🐱' : '🐶'} {p.nome}</div>
                  <div className="tiny muted">{p.raca} · {p.idade} ano(s)</div>
                </div>
              ))}
            </div>
          </div>

          {avaliacoesPendentes.length > 0 && (
            <div className="card" style={{ borderColor: 'var(--accent)', background: '#fffaf4' }}>
              <div className="card-pad">
                <div className="flex-between mb-12">
                  <b>⭐ Avalie seu último serviço</b>
                  <span className="badge badge-amber">{avaliacoesPendentes.length} pendente(s)</span>
                </div>
                <div className="small muted mb-12">Sua opinião ajuda o petshop a melhorar — leva menos de 1 minuto (RF28).</div>
                <button className="btn btn-accent" onClick={() => nav('cli-agendamentos')}>Avaliar agora →</button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
