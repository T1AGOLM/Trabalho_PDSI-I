import React, { createContext, useCallback, useContext, useState } from 'react'

// ===== Modal =====
export function Modal({ title, onClose, children, footer, size }: {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  size?: 'narrow' | 'wide'
}) {
  return (
    <div className="modal-overlay" onMouseDown={e => { if (e.target === e.currentTarget) onClose() }}>
      <div className={`modal ${size ?? ''}`}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="modal-x" onClick={onClose} aria-label="Fechar">✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  )
}

export function ConfirmDialog({ title, message, confirmLabel = 'Confirmar', danger, onConfirm, onCancel }: {
  title: string
  message: string
  confirmLabel?: string
  danger?: boolean
  onConfirm: () => void
  onCancel: () => void
}) {
  return (
    <Modal title={title} onClose={onCancel} size="narrow"
      footer={
        <>
          <button className="btn btn-outline" onClick={onCancel}>Voltar</button>
          <button className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`} onClick={onConfirm}>{confirmLabel}</button>
        </>
      }>
      <p style={{ fontSize: 14 }}>{message}</p>
    </Modal>
  )
}

// ===== Toast =====
type Toast = { id: number; msg: string; kind: 'ok' | 'err' | 'warn' | 'info' }
const ToastCtx = createContext<(msg: string, kind?: Toast['kind']) => void>(() => {})
export const useToast = () => useContext(ToastCtx)

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const push = useCallback((msg: string, kind: Toast['kind'] = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts(t => [...t, { id, msg, kind }])
    setTimeout(() => setToasts(t => t.filter(x => x.id !== id)), 3400)
  }, [])
  const kindClass = { ok: 'success', err: 'error', warn: 'warn', info: '' } as const
  const icons = { ok: '✅', err: '⚠️', warn: '🔔', info: 'ℹ️' } as const
  return (
    <ToastCtx.Provider value={push}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div key={t.id} className={`toast ${kindClass[t.kind]}`}>{icons[t.kind]} {t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  )
}

// ===== Empty state =====
export function EmptyState({ icon = '📭', title, sub, action }: {
  icon?: string; title: string; sub?: string; action?: React.ReactNode
}) {
  return (
    <div className="empty">
      <div className="e-ico">{icon}</div>
      <div className="e-t">{title}</div>
      {sub && <div className="e-s">{sub}</div>}
      {action && <div className="mt-16">{action}</div>}
    </div>
  )
}

// ===== Stat card =====
export function StatCard({ icon, bg, value, label, delta, up }: {
  icon: string; bg: string; value: string; label: string; delta?: string; up?: boolean
}) {
  return (
    <div className="stat-card">
      <div className={`stat-icon ${bg}`}>{icon}</div>
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
        {delta && <div className={`stat-delta ${up ? 'up' : 'down'}`}>{delta}</div>}
      </div>
    </div>
  )
}

// ===== Form field =====
export function Field({ label, required, children, error, full }: {
  label: string; required?: boolean; children: React.ReactNode; error?: string; full?: boolean
}) {
  return (
    <div className={`field ${full ? 'full' : ''}`}>
      <label>{label} {required && <span className="req">*</span>}</label>
      {children}
      {error && <div className="err">{error}</div>}
    </div>
  )
}
