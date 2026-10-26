import { withTransaction } from '../db/pool.js'
import { modelos } from './email.service.js'
import { logger } from '../observability/logger.js'

/**
 * Geração de avisos (RF12 / RF13 / RN06).
 *
 * Todas as funções daqui **enfileiram** linhas em `notificacao` com o
 * momento em que o aviso deve sair (`agendado_para`). Quem entrega é o
 * agendador (`jobs/agendador.js`), via `email.service.processarFila`.
 *
 * A deduplicação não depende de estado em memória: os índices únicos
 * parciais de `notificacao` (007) garantem **um** lembrete por
 * agendamento e **um** alerta por registro de saúde, mesmo que o
 * agendador rode duas vezes no mesmo minuto ou que dois processos subam
 * em paralelo.
 */

/**
 * RF12 / RN06 — lembrete por e-mail de agendamentos confirmados,
 * respeitando a antecedência configurada no petshop (padrão 24 h).
 */
export async function gerarLembretesDeAgendamento(tenantId) {
  return withTransaction({ tenantId }, async (db) => {
    const { rows } = await db.query(
      `SELECT a.id AS agendamento_id,
              a.petshop_id,
              a.data_hora,
              a.data_hora - make_interval(hours => ps.antecedencia_lembrete_h) AS agendado_para,
              s.nome AS servico,
              p.nome AS pet,
              u.id   AS usuario_id,
              u.nome AS tutor,
              u.email::text AS destinatario,
              uco.nome AS profissional,
              to_char(a.data_hora AT TIME ZONE ps.timezone, 'DD/MM/YYYY "às" HH24:MI') AS quando
         FROM agendamento a
         JOIN petshop ps   ON ps.id  = a.petshop_id
         JOIN pet p        ON p.id   = a.pet_id
         JOIN servico s    ON s.id   = a.servico_id
         JOIN cliente c    ON c.usuario_id = a.cliente_id
         JOIN usuario u    ON u.id   = c.usuario_id
         JOIN colaborador co ON co.usuario_id = a.colaborador_id
         JOIN usuario uco  ON uco.id = co.usuario_id
        WHERE a.petshop_id = $1
          AND a.status = 'confirmado'
          AND a.data_hora > now()
          AND a.data_hora - make_interval(hours => ps.antecedencia_lembrete_h) <= now()
          AND NOT EXISTS (
                SELECT 1 FROM notificacao n
                 WHERE n.agendamento_id = a.id AND n.tipo = 'lembrete_agendamento')`,
      [tenantId],
    )

    let criados = 0
    for (const linha of rows) {
      const { texto } = modelos.lembreteAgendamento({
        tutor: linha.tutor,
        pet: linha.pet,
        servico: linha.servico,
        profissional: linha.profissional,
        quando: linha.quando,
      })
      // O índice único parcial é a última palavra: se dois processos
      // gerarem o mesmo lembrete, o segundo insert não entra.
      const { rowCount } = await db.query(
        `INSERT INTO notificacao
           (petshop_id, usuario_id, canal, tipo, destinatario, mensagem, agendamento_id, agendado_para)
         VALUES ($1, $2, 'e-mail', 'lembrete_agendamento', $3, $4, $5, $6)
         ON CONFLICT (agendamento_id, tipo) WHERE agendamento_id IS NOT NULL DO NOTHING`,
        [tenantId, linha.usuario_id, linha.destinatario, texto, linha.agendamento_id, linha.agendado_para],
      )
      criados += rowCount
    }
    return criados
  })
}

/**
 * RF13 — vacinas que vencem dentro da janela configurada pelo petshop
 * (padrão 30 dias). O `proximo_vencimento` vem do registro de saúde.
 */
export async function gerarAlertasDeVacina(tenantId) {
  return withTransaction({ tenantId }, async (db) => {
    const { rows } = await db.query(
      `SELECT r.id AS registro_saude_id,
              r.descricao,
              r.proximo_vencimento,
              (r.proximo_vencimento - CURRENT_DATE) AS dias,
              p.nome AS pet,
              u.id   AS usuario_id,
              u.nome AS tutor,
              u.email::text AS destinatario,
              to_char(r.proximo_vencimento, 'DD/MM/YYYY') AS vencimento
         FROM registro_saude r
         JOIN petshop ps ON ps.id = r.petshop_id
         JOIN pet p      ON p.id  = r.pet_id
         JOIN cliente c  ON c.usuario_id = p.cliente_id
         JOIN usuario u  ON u.id  = c.usuario_id
        WHERE r.petshop_id = $1
          AND r.tipo = 'vacina'
          AND r.proximo_vencimento IS NOT NULL
          AND r.proximo_vencimento >= CURRENT_DATE
          AND r.proximo_vencimento <= CURRENT_DATE + ps.antecedencia_validade_d
          AND NOT EXISTS (
                SELECT 1 FROM notificacao n
                 WHERE n.registro_saude_id = r.id AND n.tipo = 'vacina')`,
      [tenantId],
    )

    let criados = 0
    for (const linha of rows) {
      const { texto } = modelos.vacinaAVencer({
        tutor: linha.tutor,
        pet: linha.pet,
        vacina: linha.descricao,
        vencimento: linha.vencimento,
        dias: linha.dias,
      })
      const { rowCount } = await db.query(
        `INSERT INTO notificacao
           (petshop_id, usuario_id, canal, tipo, destinatario, mensagem, registro_saude_id, agendado_para)
         VALUES ($1, $2, 'e-mail', 'vacina', $3, $4, $5, now())
         ON CONFLICT (registro_saude_id, tipo) WHERE registro_saude_id IS NOT NULL DO NOTHING`,
        [tenantId, linha.usuario_id, linha.destinatario, texto, linha.registro_saude_id],
      )
      criados += rowCount
    }
    return criados
  })
}

/**
 * RF13 — convite de retorno de banho/tosa: pets cujo último banho
 * registrado foi há mais de `dias` (e que não receberam o convite no
 * mesmo intervalo). Como `notificacao` não tem `pet_id`, a deduplicação
 * usa o destinatário + a janela de tempo.
 */
export async function gerarRetornosDeBanho(tenantId, { dias = 25 } = {}) {
  return withTransaction({ tenantId }, async (db) => {
    const { rows } = await db.query(
      `SELECT p.id AS pet_id,
              p.nome AS pet,
              u.id   AS usuario_id,
              u.nome AS tutor,
              u.email::text AS destinatario,
              to_char(ultimo.data, 'DD/MM/YYYY') AS quando
         FROM pet p
         JOIN cliente c ON c.usuario_id = p.cliente_id
         JOIN usuario u ON u.id = c.usuario_id
         JOIN LATERAL (
              SELECT r.data
                FROM registro_saude r
               WHERE r.pet_id = p.id AND r.tipo = 'banho'
               ORDER BY r.data DESC
               LIMIT 1
         ) ultimo ON true
        WHERE p.petshop_id = $1
          AND p.ativo
          AND ultimo.data <= CURRENT_DATE - $2::int
          AND NOT EXISTS (
                SELECT 1 FROM notificacao n
                 WHERE n.tipo = 'retorno_banho'
                   AND n.usuario_id = u.id
                   AND n.mensagem LIKE '%' || p.nome || '%'
                   AND n.data_envio > now() - make_interval(days => $2::int))`,
      [tenantId, dias],
    )

    let criados = 0
    for (const linha of rows) {
      const { texto } = modelos.retornoBanhoTosa({ tutor: linha.tutor, pet: linha.pet, quando: linha.quando })
      const { rowCount } = await db.query(
        `INSERT INTO notificacao (petshop_id, usuario_id, canal, tipo, destinatario, mensagem)
         VALUES ($1, $2, 'e-mail', 'retorno_banho', $3, $4)`,
        [tenantId, linha.usuario_id, linha.destinatario, texto],
      )
      criados += rowCount
    }
    return criados
  })
}

/**
 * Executa toda a geração de avisos de um tenant.
 * Chamado pelo agendador a cada ciclo (e sob demanda pelo gestor).
 */
export async function gerarAvisosDoTenant(tenantId) {
  const lembretes = await gerarLembretesDeAgendamento(tenantId)
  const vacinas = await gerarAlertasDeVacina(tenantId)
  const retornos = await gerarRetornosDeBanho(tenantId)
  if (lembretes || vacinas || retornos) {
    logger.info({ tenantId, lembretes, vacinas, retornos }, 'avisos enfileirados')
  }
  return { lembretes, vacinas, retornos }
}
