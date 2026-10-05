/**
 * Tratamento centralizado de erros.
 *
 * O objetivo é que a camada de aplicação nunca precise conhecer os
 * códigos de erro do PostgreSQL: o repositório lança o erro cru e o
 * tradutor aqui o converte em uma resposta HTTP com mensagem legível.
 * As regras de negócio violadas viram 422, não 500 — o cliente precisa
 * distinguir "você errou os dados" de "a API quebrou".
 */

/** Erro de aplicação com status e detalhes já prontos. */
export class ErroDeNegocio extends Error {
  constructor(mensagem, { status = 422, codigo, detalhe } = {}) {
    super(mensagem)
    this.name = 'ErroDeNegocio'
    this.status = status
    this.codigo = codigo
    this.detalhe = detalhe
  }
}

const sqlstate = (err) => err?.code

/**
 * Converte uma exceção do PostgreSQL em `ErroDeNegocio` com a mensagem
 * que o usuário do PetPlus entende.
 */
export function traduzirErroBanco(err) {
  switch (sqlstate(err)) {
    // Integridade referencial.
    case '23503':
      return new ErroDeNegocio(
        'Referência inválida: um dos registros relacionados não existe (ou pertence a outra unidade).',
        { status: 422, codigo: 'FK_VIOLATION', detalhe: err.detail, causa: 'foreign_key_violation' },
      )
    // Violação de CHECK.
    case '23514':
      return new ErroDeNegocio(
        'Operação bloqueada por uma regra do banco.',
        { status: 422, codigo: 'CHECK_VIOLATION', detalhe: err.detail || err.message, causa: 'check_violation' },
      )
    // Violação de unicidade.
    case '23505':
      return new ErroDeNegocio(
        'Já existe um registro com este valor (e-mail, CNPJ ou nome).',
        { status: 409, codigo: 'UNIQUE_VIOLATION', detalhe: err.detail, causa: 'unique_violation' },
      )
    // CONFLICT: principalmente o EXCLUDE de conflito de agenda (RN01).
    case '23P01': {
      const exclusao = err.constraint ?? ''
      if (exclusao.includes('agendamento_sem_conflito')) {
        return new ErroDeNegocio(
          'Conflito de agenda (RN01): este profissional já possui um atendimento que se sobrepõe a este horário.',
          { status: 409, codigo: 'CONFLITO_AGENDA', detalhe: err.detail, causa: 'conflito_agenda' },
        )
      }
      return new ErroDeNegocio(
        'Operação conflita com uma restrição de não sobreposição do banco.',
        { status: 409, codigo: 'EXCLUDE_VIOLATION', detalhe: err.detail, causa: err.constraint },
      )
    }
    // Permissão insuficiente. Duas causas distintas compartilham o código
    // 42501 no PostgreSQL: regra de negócio disparada por trigger
    // (RN08/RN11/RN12) e violação de política de RLS (tenant).
    case '42501': {
      const rls = /row-level security/i.test(err.message ?? '')
      if (rls) {
        return new ErroDeNegocio(
          'Acesso negado: o registro pertence a outra unidade.',
          { status: 403, codigo: 'TENANT_VIOLATION', causa: 'row_level_security' },
        )
      }
      return new ErroDeNegocio(
        err.message,
        { status: 403, codigo: 'PERMISSAO_NEGADA', detalhe: err.hint, causa: 'insufficient_privilege' },
      )
    }
    // Erro de sintaxe/semântica no próprio SQL (bug, não dado inválido).
    case '42601':
    case '42703':
    case '42702':
      return new ErroDeNegocio(
        'Falha ao montar a consulta no banco.',
        { status: 500, codigo: 'SQL_INVALIDO', detalhe: `${err.message} (posição ${err.position})`, causa: err.code },
      )
    default:
      return null
  }
}

/** 404 de rota. */
export function naoEncontrado(req, res) {
  res.status(404).json({ erro: `Rota não encontrada: ${req.method} ${req.originalUrl}` })
}

/** Handler final de erros. Precisa ter 4 parâmetros para o Express reconhecê-lo. */
export function tratadorDeErros(err, req, res, _next) {
  const traduzido = traduzirErroBanco(err) ?? err

  // Erros que a própria aplicação levantou já trazem status pronto.
  if (traduzido instanceof ErroDeNegocio) {
    if (!traduzido.detalhe && err.hint) traduzido.detalhe = err.hint
    return res.status(traduzido.status).json({
      erro: traduzido.message,
      codigo: traduzido.codigo,
      detalhe: traduzido.detalhe,
    })
  }

  // Qualquer erro lançado com um `status` explícito (inclusive os `Error`
  // simples anotados nos repositórios) respeita esse status.
  if (typeof err.status === 'number' && err.status >= 400 && err.status < 600) {
    return res.status(err.status).json({ erro: err.message })
  }

  // JSON malformado vindo do body.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ erro: 'Corpo da requisição não é um JSON válido.' })
  }

  console.error('[erro não tratado]', {
    mensagem: err.message,
    codigo: err.code,
    posicao: err.position,
    rota: `${req.method} ${req.originalUrl}`,
  })
  res.status(500).json({ erro: 'Erro interno do servidor.' })
}

/** Envolve handlers async para que rejeições cheguem ao tratadorDeErros. */
export const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)