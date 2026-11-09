import { useCallback, useEffect, useRef, useState } from 'react'
import { api, ApiError } from './api'
import type { Agendamento } from './types'

/** Carrega a semana escolhida; respostas de consultas antigas são descartadas. */
export function useAgenda(de: string, ate: string, colaboradorId?: number) {
  const [agendamentos, setAgendamentos] = useState<Agendamento[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const consulta = useRef(0)
  const atualizar = useCallback(async () => {
    const versao = ++consulta.current
    setCarregando(true)
    setErro('')
    setAgendamentos([])
    try {
      const dados = await api.agendamentos.listar({ de, ate, ...(colaboradorId !== undefined ? { colaboradorId } : {}) })
      if (versao === consulta.current) setAgendamentos(dados)
    } catch (err) {
      if (versao === consulta.current) setErro(err instanceof ApiError ? err.mensagem : 'Não foi possível carregar a agenda.')
    } finally {
      if (versao === consulta.current) setCarregando(false)
    }
  }, [de, ate, colaboradorId])
  useEffect(() => {
    void atualizar()
    return () => { consulta.current++ }
  }, [atualizar])
  return { agendamentos, carregando, erro, atualizar }
}