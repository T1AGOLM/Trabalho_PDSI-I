import React, { useState } from 'react'
import { db } from '../../data'
import { brl } from '../../utils'
import { Modal, useToast } from '../../ui'

const MEU_ID = 1

const BENEFICIOS = [
  { id: 1, nome: 'Banho grátis (pet pequeno)', custo: 200, icon: '🛁' },
  { id: 2, nome: 'Petisco dental de brinde', custo: 80, icon: '🦴' },
  { id: 3, nome: 'Desconto de R$ 30 em serviço', custo: 300, icon: '🎫' },
  { id: 4, nome: 'Tosa higiênica grátis', custo: 350, icon: '✂️' },
]

export default function CliFidelidade() {
  const toast = useToast()
  const cliente = db.clientes.find(c => c.id === MEU_ID)!
  const [pontos, setPontos] = useState(cliente.pontosFidelidade)
  const [resgatar, setResgatar] = useState<typeof BENEFICIOS[0] | null>(null)

  const nivel = pontos >= 500 ? { nome: 'Ouro', prox: null, icone: '🥇' }
    : pontos >= 250 ? { nome: 'Prata', prox: 500, icone: '🥈' }
    : { nome: 'Bronze', prox: 250, icone: '🥉' }

  return (
    <div>
      <div className="page-head">
        <div>
          <h1>Programa de Fidelidade</h1>
          <div className="sub">Acumule pontos a cada serviço e produto (RF20)</div>
        </div>
      </div>

      <div className="grid-2 mb-20" style={{ alignItems: 'start' }}>
        <div className="card card-pad" style={{ background: 'linear-gradient(140deg, #10333b, #1f7a70)', color: '#fff', borderRadius: 16 }}>
          <div className="tiny" style={{ color: '#9ec7c2', textTransform: 'uppercase', letterSpacing: '.1em', fontWeight: 700 }}>Saldo de pontos</div>
          <div style={{ fontSize: 42, fontWeight: 800, margin: '6px 0' }}>{pontos} pts</div>
          <div className="flex" style={{ gap: 8 }}>
            <span className="badge" style={{ background: 'rgba(255,255,255,.15)', color: '#fff' }}>{nivel.icone} Nível {nivel.nome}</span>
            {nivel.prox && <span className="tiny" style={{ color: '#b7d6d2' }}>faltam {nivel.prox - pontos} pts para o próximo nível</span>}
          </div>
          <div style={{ background: 'rgba(255,255,255,.2)', borderRadius: 6, height: 8, marginTop: 16 }}>
            <div style={{ background: '#7fd6cb', borderRadius: 6, height: 8, width: nivel.prox ? `${Math.min(100, (pontos / nivel.prox) * 100)}%` : '100%' }} />
          </div>
          <div className="tiny mt-12" style={{ color: '#9ec7c2' }}>Você acumula 1 ponto a cada R$ 1,00 em serviços e produtos.</div>
        </div>

        <div className="card card-pad">
          <h3 className="mb-12" style={{ fontSize: 15 }}>Como funciona</h3>
          <div className="kv"><span className="k">🛁 Serviços concluídos</span><span className="v">+1 pt / R$ 1</span></div>
          <div className="kv"><span className="k">🧾 Produtos comprados no PDV</span><span className="v">+1 pt / R$ 1</span></div>
          <div className="kv"><span className="k">⭐ Avaliação com comentário</span><span className="v">+10 pts</span></div>
          <div className="kv"><span className="k">🎂 Aniversário do pet</span><span className="v">+50 pts</span></div>
          <div className="alert info mt-16" style={{ marginBottom: 0 }}>RN07: o resgate exige saldo igual ou superior ao custo do benefício.</div>
        </div>
      </div>

      <h3 className="mb-12" style={{ fontSize: 15 }}>Resgatar benefícios</h3>
      <div className="grid-2">
        {BENEFICIOS.map(b => {
          const pode = pontos >= b.custo
          return (
            <div className="card card-pad" key={b.id} style={{ opacity: pode ? 1 : .55 }}>
              <div className="flex-between mb-12">
                <div className="flex" style={{ gap: 12 }}>
                  <div className="stat-icon bg-orange">{b.icon}</div>
                  <div>
                    <div className="bold">{b.nome}</div>
                    <div className="tiny muted">custo: {b.custo} pts</div>
                  </div>
                </div>
                {pode
                  ? <button className="btn btn-primary btn-sm" onClick={() => setResgatar(b)}>Resgatar</button>
                  : <span className="badge badge-gray">saldo insuficiente</span>}
              </div>
            </div>
          )
        })}
      </div>

      {resgatar && (
        <Modal title="Confirmar resgate?" onClose={() => setResgatar(null)} size="narrow"
          footer={
            <>
              <button className="btn btn-outline" onClick={() => setResgatar(null)}>Voltar</button>
              <button className="btn btn-primary" onClick={() => {
                setPontos(p => p - resgatar.custo)
                setResgatar(null)
                toast(`Benefício “${resgatar.nome}” resgatado! Apresente o código no petshop.`, 'ok')
              }}>Confirmar resgate</button>
            </>
          }>
          <div className="kv"><span className="k">Benefício</span><span className="v">{resgatar.nome}</span></div>
          <div className="kv"><span className="k">Custo</span><span className="v">{resgatar.custo} pts</span></div>
          <div className="kv"><span className="k">Saldo atual</span><span className="v">{pontos} pts</span></div>
          <div className="kv"><span className="k">Saldo após resgate</span><span className="v">{pontos - resgatar.custo} pts</span></div>
        </Modal>
      )}
    </div>
  )
}
