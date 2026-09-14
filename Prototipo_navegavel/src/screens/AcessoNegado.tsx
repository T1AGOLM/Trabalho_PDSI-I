import React from 'react'
import { useNav, useSession } from '../shell'
import { perfilLabel } from '../utils'

export default function AcessoNegado({ perfil }: { perfil?: string }) {
  const nav = useNav()
  const session = useSession()
  const atual = perfilLabel[session?.perfil ?? perfil ?? ''] ?? 'usuário'

  return (
    <div className="access-denied">
      <div className="big">🔒</div>
      <h1 style={{ fontSize: 24 }}>Acesso restrito</h1>
      <p style={{ color: 'var(--text-2)', maxWidth: 460 }}>
        Esta área é exclusiva de outro perfil de usuário. Você está autenticado como <b>{atual}</b> e,
        conforme as regras de acesso (RF18/RN03/RN10), não possui permissão para visualizá-la.
      </p>
      <div className="flex" style={{ gap: 10, marginTop: 8 }}>
        <button className="btn btn-outline" onClick={() => nav('landing')}>Ir para a página inicial</button>
        <button className="btn btn-primary" onClick={() => nav('login')}>Entrar com outro perfil</button>
      </div>
    </div>
  )
}
