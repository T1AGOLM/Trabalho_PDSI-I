import { config } from '../config/env.js'
import { logger } from '../observability/logger.js'
import { query } from '../db/pool.js'
import { processarFila } from '../services/email.service.js'
import { gerarAvisosDoTenant } from '../services/notificacao.service.js'
import { limparTokensAntigos } from '../services/sessao.service.js'

/**
 * Agendador de tarefas de background (RF12/RF13, RNF12).
 *
 * Roda no **mesmo processo** da API por simplicidade, mas fora do caminho
 * da requisição: nenhum usuário espera o provedor de e-mail nem a varredura
 * de lembretes. Se um dia o volume justificar, este arquivo é movido para
 * um worker dedicado sem tocar em nenhuma outra camada — ele só chama
 * serviços.
 *
 * Um ciclo faz, nesta ordem:
 *
 *   1. gera os avisos que estão no prazo (lembrete de 24 h, vacina, retorno);
 *   2. entrega a fila de e-mail;
 *   3. limpa sessões antigas (higiene da tabela de refresh tokens).
 */
const INTERVALO_MS = () => config.lembretes.intervaloMin * 60_000

let rodando = false
let temporizador = null

/** Um ciclo completo. Exportado para poder ser chamado por teste ou rota. */
export async function executarCiclo({ comAvisos = true } = {}) {
  // Se o ciclo anterior ainda não terminou (banco lento), não empilha outro.
  if (rodando) return { pulado: true }
  rodando = true
  const inicio = Date.now()
  try {
    let avisos = { lembretes: 0, vacinas: 0, retornos: 0 }

    if (comAvisos) {
      const { rows: tenants } = await query('SELECT id FROM petplus_petshops_ativos()')
      for (const tenant of tenants) {
        const r = await gerarAvisosDoTenant(tenant.id)
        avisos.lembretes += r.lembretes
        avisos.vacinas += r.vacinas
        avisos.retornos += r.retornos
      }
    }

    const fila = await processarFila()
    const sessoes = await limparTokensAntigos()

    logger.info({ ...avisos, ...fila, sessoesRemovidas: sessoes, ms: Date.now() - inicio }, 'ciclo do agendador concluído')
    return { ...avisos, ...fila, sessoesRemovidas: sessoes }
  } catch (err) {
    // Um ciclo com erro não pode derrubar a API nem parar o agendador.
    logger.error({ err }, 'ciclo do agendador falhou')
    return { erro: err.message }
  } finally {
    rodando = false
  }
}

export function iniciarAgendador() {
  if (!config.lembretes.enabled) {
    logger.info('agendador desabilitado (LEMBRETES_ENABLED=false)')
    return null
  }

  logger.info({ intervaloMin: config.lembretes.intervaloMin }, 'agendador iniciado')
  // Primeiro ciclo logo após a subida (não bloqueia o listen), depois no intervalo.
  setTimeout(() => { executarCiclo().catch(() => {}) }, 2_000).unref()

  temporizador = setInterval(() => { executarCiclo().catch(() => {}) }, INTERVALO_MS())
  // Não segura o processo aberto: o servidor HTTP é quem manda no ciclo de vida.
  temporizador.unref()
  return temporizador
}

export function pararAgendador() {
  if (temporizador) clearInterval(temporizador)
  temporizador = null
}
