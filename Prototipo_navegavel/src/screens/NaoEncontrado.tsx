import React from 'react'
import { useNav } from '../shell'

export default function NaoEncontrado() {
  const nav = useNav()
  return (
    <div className="access-denied">
      <div className="big">🐾</div>
      <h1 style={{ fontSize: 24 }}>Página não encontrada</h1>
      <p style={{ color: 'var(--text-2)' }}>O endereço acessado não existe neste protótipo.</p>
      <div className="flex" style={{ gap: 10, marginTop: 8 }}>
        <button className="btn btn-primary" onClick={() => nav('landing')}>Voltar ao início</button>
      </div>
    </div>
  )
}
