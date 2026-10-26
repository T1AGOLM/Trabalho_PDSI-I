/**
 * Tratamento centralizado de erros.
 *
 * Objetivo: a camada de aplicação nunca precisa conhecer os códigos de
 * erro do PostgreSQL. O repositório lança o erro cru e o tradutor aqui o
 * converte em uma resposta HTTP com mensagem legível. Regra de negócio
 * violada vira 4xx (o cliente errou), nunca 5xx (a API quebrou).
 */
import { ZodError } from 'zod'
import { logger } from '../observability/logger.js'

/** Erro de aplicação com status e detalhes já prontos. */
export class ErroDeNegocio extends Error {
  constructor(mensagem, { status = 422, codigo, detalhe, campos } = {}) {
    super(mensagem)
    this.name = 'ErroDeNegocio'
    this.status = status
    this.codigo = codigo
    this.detalhe = detalhe
    this.campos = campos
  }
}

/** 404 padronizado. */
export class ErroNaoEncontrado extends ErroDeNegocio {
  constructor(recurso = 'Registro') {
    super(`${recurso} não encontrado.`, { status: 404, codigo: 'NAO_ENCONTRADO' })
  }
}

/** 403 padronizado, com o perfil exigido na mensagem. */
export class ErroDePermissao extends ErroDeNegocio {
  constructor(detalhe, codigo = 'ACESSO_NEGADO') {
    super('Acesso negado.', { status: 403, codigo, detalhe })
  }
}

/** 422 de validação de entrada, com a lista de campos reprovados. */
export class ErroDeValidacao extends ErroDeNegocio {
  constructor(campos) {
    super('Dados inválidos na requisição.', {
      status: 422,
      codigo: 'VALIDACAO',
      detalhe: campos.map((c) => `${c.campo}: ${c.mensagem}`).join('; '),
      campos,
    })
  }
}

const sqlstate = (err) => err?.code

/**
 * Converte uma exceção do PostgreSQL em `ErroDeNegocio` com a mensagem
 * que o usuário do PetPlus entende. Devolve `null` quando não conhece o
 * código — o chamador decide (e normalmente vira 500).
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
    // NOT NULL sem valor (bug de repositório, mas o cliente merece um 422 claro).
    case '23502':
      return new ErroDeNegocio(
        'Campo obrigatório ausente no registro.',
        { status: 422, codigo: 'NOT_NULL_VIOLATION', detalhe: err.detail, causa: 'not_null_violation' },
      )
    // Valor maior que a coluna comporta.
    case '22001':
      return new ErroDeNegocio(
        'Um dos campos excede o tamanho máximo permitido.',
        { status: 422, codigo: 'VALOR_LONGO', detalhe: err.message, causa: 'string_data_right_truncation' },
      )
    // Texto inválido para um tipo (data, número, enum).
    case '22P02':
    case '22007':
    case '22008':
      return new ErroDeNegocio(
        'Um dos campos tem formato inválido (data, número ou opção inexistente).',
        { status: 422, codigo: 'VALOR_INVALIDO', detalhe: err.message, causa: err.code },
      )
    // CONFLICT por EXCLUDE — principalmente o conflito de agenda (RN01).
    case '23P01': {
      const restricao = err.constraint ?? ''
      if (restricao.includes('agendamento_sem_conflito')) {
        return new ErroDeNegocio(
          'Conflito de agenda (RN01): este profissional já possui um atendimento que se sobrepõe a este horário.',
          { status: 409, codigo: 'CONFLITO_AGENDA', detalhe: err.detail, causa: 'conflito_agenda' },
        )
      }
      return new ErroDeNegocio(
        'Operação conflita com uma restrição de não sobreposição do banco.',
        { status: 409, codigo: 'EXCLUDE_VIOLATION', detalhe: err.detail, causa: restricao },
      )
    }
    /**
     * Permissão insuficiente. Duas causas dividem o 42501: regra de negócio
     * disparada por trigger (RN08/RN11/RN12) e violação de política de RLS.
     * A mensagem do gatilho já está em português e é segura de expor.
     */
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
    // Consulta interrompida pelo statement_timeout.
    case '57014':
      return new ErroDeNegocio(
        'A consulta excedeu o tempo máximo de execução.',
        { status: 504, codigo: 'CONSULTA_LENTA', causa: 'statement_timeout' },
      )
    // Deadlock: o cliente pode repetir a operação.
    case '40P01':
      return new ErroDeNegocio(
        'A operação conflitou com outra transação. Tente novamente.',
        { status: 409, codigo: 'DEADLOCK', causa: 'deadlock_detected' },
      )
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

/** Corpo de erro único: `{ erro, codigo?, detalhe?, campos? }`. */
const corpoDoErro = ({ mensagem, codigo, detalhe, campos }) => ({
  erro: mensagem,
  ...(codigo ? { codigo } : {}),
  ...(detalhe ? { detalhe } : {}),
  ...(campos ? { campos } : {}),
})

/** 404 de rota. */
export function naoEncontrado(req, res) {
  res.status(404).json({ erro: `Rota não encontrada: ${req.method} ${req.originalUrl}`, codigo: 'ROTA_NAO_ENCONTRADA' })
}

/** Handler final de erros. Precisa ter 4 parâmetros para o Express reconhecê-lo. */
export function tratadorDeErros(err, req, res, _next) {
  // Entrada inválida: o zod já diz exatamente qual campo e por quê.
  if (err instanceof ZodError) {
    const campos = err.issues.map((i) => ({
      campo: i.path.join('.') || '(corpo)',
      mensagem: i.message,
    }))
    return res.status(422).json(corpoDoErro(new ErroDeValidacao(campos)))
  }

  // Erro que a própria aplicação levantou (ou traduzido do banco) já traz status.
  const traduzido = err instanceof ErroDeNegocio ? err : traduzirErroBanco(err)
  if (traduzido instanceof ErroDeNegocio) {
    if (!traduzido.detalhe && err.hint) traduzido.detalhe = err.hint
    // 5xx é falha nossa: entra no log com stack; 4xx é do cliente, fica em debug.
    if (traduzido.status >= 500) {
      logger.error({ err, reqId: req.id, rota: `${req.method} ${req.originalUrl}` }, traduzido.message)
    }
    return res.status(traduzido.status).json(corpoDoErro(traduzido))
  }

  // Corpo JSON malformado.
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json(corpoDoErro({ mensagem: 'Corpo da requisição não é um JSON válido.', codigo: 'JSON_INVALIDO' }))
  }
  // Corpo/entidade grande demais.
  if (err.type === 'entity.too.large') {
    return res.status(413).json(corpoDoErro({ mensagem: 'Requisição maior que o limite permitido.', codigo: 'PAYLOAD_GRANDE' }))
  }
  // Origem bloqueada pelo CORS: é negação de acesso, não falha interna.
  if (/CORS/i.test(err.message ?? '')) {
    return res.status(403).json(corpoDoErro({ mensagem: 'Origem não permitida.', codigo: 'CORS_BLOQUEADO' }))
  }

  // Erro lançado com status explícito (inclusive os `Error` anotados nos repositórios).
  if (typeof err.status === 'number' && err.status >= 400 && err.status < 600) {
    return res.status(err.status).json(corpoDoErro({ mensagem: err.message, codigo: err.codigo }))
  }

  logger.error(
    { err, reqId: req.id, rota: `${req.method} ${req.originalUrl}`, usuarioId: req.usuario?.id },
    'erro não tratado',
  )
  // Nada de vazar stack/detalhe de infraestrutura na resposta.
  res.status(500).json(corpoDoErro({ mensagem: 'Erro interno do servidor.', codigo: 'ERRO_INTERNO' }))
}

/** Envolve handlers async para que rejeições cheguem ao tratadorDeErros. */
export const rota = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next)
