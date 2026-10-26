import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { config } from '../config/env.js'
import { logger } from '../observability/logger.js'
import { query, withTransaction } from '../db/pool.js'

/**
 * E-mail e fila de envio (RF12 / RF13 / RF22 / RF24).
 *
 * Dois princípios:
 *
 *  1. **Nenhuma requisição espera um provedor de e-mail.** O fluxo HTTP só
 *     grava a linha em `notificacao` (a fila). Quem envia é o agendador.
 *     Assim o cadastro responde em milissegundos e um provedor fora do ar
 *     não derruba a venda de ninguém.
 *  2. **O transporte é um detalhe substituível.** Hoje `console` (log) ou
 *     `arquivo` (caixa de saída inspecionável em `var/emails`). Trocar por
 *     SendGrid/SES/Resend é implementar `enviar` abaixo — nada mais muda,
 *     nem as chamadas, nem o banco.
 */

// ---------------------------------------------------------------------
// Modelos de mensagem
// ---------------------------------------------------------------------

const ASSINATURA = '\n\n—\nPetPlus · Gestão para Petshop\nEste é um aviso automático; não responda esta mensagem.'

export const modelos = {
  lembreteAgendamento: ({ tutor, pet, servico, profissional, quando }) => ({
    assunto: `Lembrete: ${pet} tem ${servico} em 24h`,
    texto:
      `Olá, ${tutor}!\n\n` +
      `Passando para lembrar do atendimento de ${pet}:\n\n` +
      `  Serviço:      ${servico}\n` +
      `  Profissional: ${profissional}\n` +
      `  Quando:       ${quando}\n\n` +
      `Se precisar remarcar, faça pelo aplicativo ou entre em contato com a unidade.` +
      ASSINATURA,
  }),

  retornoBanhoTosa: ({ tutor, pet, quando }) => ({
    assunto: `Está na hora do banho de ${pet}!`,
    texto:
      `Olá, ${tutor}!\n\n` +
      `Já se passaram alguns dias desde o último banho e tosa de ${pet} (${quando}). ` +
      `Que tal agendar a manutenção?` +
      ASSINATURA,
  }),

  vacinaAVencer: ({ tutor, pet, vacina, vencimento, dias }) => ({
    assunto: `Vacina de ${pet} vence em ${dias} dia(s)`,
    texto:
      `Olá, ${tutor}!\n\n` +
      `A vacina de ${pet} está próxima do vencimento:\n\n` +
      `  Vacina:     ${vacina}\n` +
      `  Vencimento: ${vencimento}\n\n` +
      `Agende a dose de reforço para manter a proteção em dia.` +
      ASSINATURA,
  }),

  estoqueMinimo: ({ produtos }) => ({
    assunto: `Alerta de estoque mínimo (${produtos.length} produto(s))`,
    texto:
      `Os produtos abaixo atingiram o estoque mínimo cadastrado (RN05):\n\n` +
      produtos.map((p) => `  • ${p.nome} — ${p.quantidade ?? p.quantidade_estoque} un.`).join('\n') +
      '\n\nRecomenda-se programar a reposição.' +
      ASSINATURA,
  }),

  recuperacaoSenha: ({ nome, link, validadeMinutos }) => ({
    assunto: 'Redefinição de senha — PetPlus',
    texto:
      `Olá, ${nome}!\n\n` +
      `Recebemos um pedido de redefinição de senha da sua conta PetPlus.\n` +
      `Abra o link abaixo para definir uma nova senha (válido por ${validadeMinutos} minutos):\n\n` +
      `${link}\n\n` +
      `Se não foi você quem pediu, ignore este e-mail: nada muda na sua conta.` +
      ASSINATURA,
  }),
}

// ---------------------------------------------------------------------
// Transporte
// ---------------------------------------------------------------------

/** Caixa de saída local, útil para demonstrar o fluxo sem provedor. */
async function gravarEmArquivo({ para, assunto, texto, enviadoEm }) {
  const dir = path.resolve(process.cwd(), config.email.outboxDir)
  await mkdir(dir, { recursive: true })
  const arquivo = path.join(
    dir,
    `${enviadoEm.replace(/[:.]/g, '-')}-${para.replace(/[^\w.@-]/g, '_')}.txt`,
  )
  await writeFile(arquivo, `Para: ${para}\nDe: ${config.email.from}\nAssunto: ${assunto}\nData: ${enviadoEm}\n\n${texto}\n`, 'utf8')
  return arquivo
}

/**
 * Entrega uma mensagem. Devolve `{ destino }` quando deu certo.
 * Lançar aqui é o que faz a fila registrar a falha e tentar de novo.
 */
export async function enviar({ para, assunto, texto }) {
  const enviadoEm = new Date().toISOString()

  if (config.email.transport === 'arquivo') {
    const arquivo = await gravarEmArquivo({ para, assunto, texto, enviadoEm })
    logger.info({ para, assunto, arquivo }, 'e-mail gravado na caixa de saída local')
    return { destino: arquivo }
  }

  // Transporte `console`: o e-mail inteiro fica no log (útil em
  // desenvolvimento). Em produção o nível `info` já está restrito e o
  // corpo não contém dado sensível além do que já foi pedido pelo próprio
  // usuário (o link de redefinição).
  logger.info({ para, assunto, texto }, '📧 e-mail (transporte local, sem provedor)')
  return { destino: 'console' }
}

// ---------------------------------------------------------------------
// Fila (outbox)
// ---------------------------------------------------------------------

const MAX_TENTATIVAS = 5

/**
 * Processa a fila de UM tenant.
 *
 * Lê e grava em transações curtas: a entrega (que é I/O de rede e pode
 * demorar) acontece **fora** de qualquer transação, para não segurar uma
 * conexão do pool durante um provedor lento.
 */
export async function processarFilaDoTenant(tenantId, { limite = 50 } = {}) {
  const pendentes = await withTransaction({ tenantId }, async (db) => {
    const { rows } = await db.query(
      `SELECT id, canal::text AS canal, destinatario, mensagem, tipo, tentativas
         FROM notificacao
        WHERE petshop_id = $1
          AND enviado_em IS NULL
          AND canal = 'e-mail'
          AND agendado_para <= now()
          AND tentativas < $2
        ORDER BY agendado_para
        LIMIT $3`,
      [tenantId, MAX_TENTATIVAS, limite],
    )
    return rows
  })

  let enviados = 0
  let falhas = 0

  for (const aviso of pendentes) {
    try {
      await enviar({ para: aviso.destinatario, assunto: `PetPlus · ${aviso.tipo.replace(/_/g, ' ')}`, texto: aviso.mensagem })
      await withTransaction({ tenantId }, (db) =>
        db.query(
          `UPDATE notificacao
              SET enviado_em = now(), tentativas = tentativas + 1, erro_envio = NULL
            WHERE id = $1`,
          [aviso.id],
        ))
      enviados++
    } catch (err) {
      falhas++
      // A falha fica registrada na própria linha: a fila é auditável sem log.
      await withTransaction({ tenantId }, (db) =>
        db.query(
          `UPDATE notificacao
              SET tentativas = tentativas + 1, erro_envio = $2
            WHERE id = $1`,
          [aviso.id, String(err.message).slice(0, 500)],
        )).catch(() => {})
      logger.error({ err, notificacaoId: aviso.id }, 'falha ao enviar notificação')
    }
  }

  return { pendentes: pendentes.length, enviados, falhas }
}

/**
 * Processa a fila de todos os tenants ativos.
 * Roda no agendador (jobs/agendador.js), nunca no caminho da requisição.
 */
export async function processarFila() {
  const { rows: tenants } = await query('SELECT id FROM petplus_petshops_ativos()')
  const totais = { pendentes: 0, enviados: 0, falhas: 0 }
  for (const tenant of tenants) {
    const r = await processarFilaDoTenant(tenant.id)
    totais.pendentes += r.pendentes
    totais.enviados += r.enviados
    totais.falhas += r.falhas
  }
  return totais
}

/** Quantos avisos estão pendentes (usado no health/metrics). */
export const contarPendentes = (tenantId) =>
  withTransaction({ tenantId }, async (db) => {
    const { rows } = await db.query(
      'SELECT count(*)::int AS total FROM notificacao WHERE enviado_em IS NULL AND tentativas < $2',
      [tenantId, MAX_TENTATIVAS],
    )
    return rows[0].total
  })
