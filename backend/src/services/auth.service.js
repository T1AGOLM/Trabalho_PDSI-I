import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { config } from '../config/env.js'
import { query, withTransaction } from '../db/pool.js'
import { ErroDeNegocio } from '../middleware/errors.js'
import { criarSessao, revogarSessoesDoUsuario } from './sessao.service.js'
import { modelos } from './email.service.js'

/**
 * Autenticação (RF18 / RF24 / RNF02 / RNF11).
 *
 * A busca de usuário usa `petplus_buscar_usuario_por_email()`, uma função
 * SECURITY DEFINER criada em 006: é a única porta que roda antes de o
 * tenant ser conhecido — sem ela, as políticas de RLS filtrariam a busca
 * e o login seria impossível.
 */

const SELECT_USUARIO = 'SELECT * FROM petplus_buscar_usuario_por_email($1)'
const MINUTOS_VALIDADE_RESET = 60

/** Login (RF18). Compara bcrypt e emite o par de tokens. */
export async function login({ email, senha, ip, userAgent }) {
  const { rows } = await query(SELECT_USUARIO, [email])
  const usuario = rows[0]

  // Mesma mensagem para e-mail inexistente e senha errada: não revelamos
  // quais e-mails estão cadastrados (evita enumeração de contas).
  const credenciaisInvalidas = new ErroDeNegocio('E-mail ou senha inválidos.', {
    status: 401, codigo: 'CREDENCIAIS_INVALIDAS',
  })

  if (!usuario) {
    // Compara contra um hash descartável para que o tempo de resposta seja
    // o mesmo de uma senha errada — sem isso, a diferença de tempo revelaria
    // que o e-mail não existe.
    await bcrypt.compare(String(senha), '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinva')
    throw credenciaisInvalidas
  }

  const senhaConfere = await bcrypt.compare(String(senha), usuario.senha_hash)
  if (!senhaConfere) throw credenciaisInvalidas
  if (!usuario.ativo) {
    throw new ErroDeNegocio('Conta inativa. Procure o gestor da unidade.', { status: 403, codigo: 'CONTA_INATIVA' })
  }

  // Registro de acesso dentro da transação do tenant (passa pelo RLS).
  await withTransaction(
    { tenantId: usuario.petshop_id, usuarioId: usuario.id },
    (db) => db.query('UPDATE usuario SET ultimo_acesso = now() WHERE id = $1', [usuario.id]),
  )

  const sessao = await criarSessao({ usuario, ip, userAgent })
  return { ...sessao, usuario: usuarioResumo(usuario) }
}

/** Dados de sessão que a interface usa (nunca inclui hash nem consentimento). */
const usuarioResumo = (u) => ({
  id: u.id,
  nome: u.nome,
  email: u.email,
  perfil: u.perfil,
  telefone: u.telefone ?? null,
  petshopId: u.petshop_id,
})

/**
 * Cadastro público de tutor (RF01/RF02 — tela "Criar conta de cliente").
 * Exige consentimento LGPD explícito (RNF11).
 */
export async function cadastrarCliente({ nome, email, telefone, senha, endereco, consentimento, ip, userAgent }) {
  if (!consentimento) {
    throw new ErroDeNegocio(
      'É necessário autorizar o uso dos seus dados e dos dados de saúde do pet (LGPD).',
      { status: 422, codigo: 'LGPD_CONSENTIMENTO' },
    )
  }

  const hash = await bcrypt.hash(senha, config.auth.bcryptRounds)

  // O novo cliente entra no petshop padrão — em produção esse id vem do
  // subdomínio/convite da unidade (ver 006_funcoes_de_autorizacao.sql).
  const { rows: petshops } = await query('SELECT petplus_petshop_padrao() AS id')
  const petshopId = petshops[0]?.id
  if (!petshopId) {
    throw new ErroDeNegocio('Nenhuma unidade cadastrada.', { status: 503, codigo: 'SEM_UNIDADE' })
  }

  const usuario = await withTransaction({ tenantId: petshopId }, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO usuario (petshop_id, perfil, nome, email, telefone, senha_hash, consent_lgpd, consent_em)
       VALUES ($1, 'CLIENTE', $2, $3, $4, $5, true, now())
       RETURNING id, nome, email::text AS email, perfil, petshop_id, telefone`,
      [petshopId, nome, email, telefone ?? null, hash],
    )
    await db.query(
      `INSERT INTO cliente (usuario_id, petshop_id, endereco, pontos_fidelidade)
       VALUES ($1, $2, $3, 0)`,
      [rows[0].id, petshopId, endereco ?? null],
    )
    return rows[0]
  })

  const sessao = await criarSessao({ usuario, ip, userAgent })
  return { ...sessao, usuario: usuarioResumo(usuario) }
}

/**
 * Recuperação de senha (RF24).
 *
 * Grava o SHA-256 do token (nunca o token em claro), invalida os pedidos
 * anteriores ainda não usados e **enfileira o e-mail** na outbox — a
 * requisição não espera provedor nenhum. O token em claro só volta no
 * corpo da resposta fora de produção, para permitir demonstrar o fluxo.
 */
export async function solicitarRecuperacao({ email }) {
  const { rows } = await query(SELECT_USUARIO, [email])
  const usuario = rows[0]

  // Resposta idêntica exista ou não o e-mail: não enumera contas.
  if (!usuario) return { enviado: true }

  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const link = `${config.http.corsOrigins[0]}/#/redefinir-senha?token=${token}`

  await withTransaction({ tenantId: usuario.petshop_id, usuarioId: usuario.id }, async (db) => {
    // Um pedido novo cancela os anteriores: menos links vivos, menos risco.
    await db.query(
      'UPDATE token_recuperacao SET usado_em = now() WHERE usuario_id = $1 AND usado_em IS NULL',
      [usuario.id],
    )
    await db.query(
      `INSERT INTO token_recuperacao (petshop_id, usuario_id, token_hash, expira_em)
       VALUES ($1, $2, $3, now() + make_interval(mins => $4))`,
      [usuario.petshop_id, usuario.id, tokenHash, MINUTOS_VALIDADE_RESET],
    )

    const { texto } = modelos.recuperacaoSenha({
      nome: usuario.nome,
      link,
      validadeMinutos: MINUTOS_VALIDADE_RESET,
    })
    await db.query(
      `INSERT INTO notificacao (petshop_id, usuario_id, canal, tipo, destinatario, mensagem, agendado_para)
       VALUES ($1, $2, 'e-mail', 'recuperacao_senha', $3, $4, now())`,
      [usuario.petshop_id, usuario.id, usuario.email, texto],
    )
  })

  return {
    enviado: true,
    expiraEmMinutos: MINUTOS_VALIDADE_RESET,
    // Fora de produção devolvemos o token para a demonstração funcionar sem
    // provedor de e-mail. Em produção ele só existe dentro da mensagem.
    ...(config.isProd ? {} : { token, link }),
  }
}

/** Redefine a senha a partir do token (RF24) e derruba as sessões antigas. */
export async function redefinirSenha({ token, senha }) {
  const tokenHash = crypto.createHash('sha256').update(String(token)).digest('hex')

  // Também aqui não existe tenant na sessão (quem redefine a senha está
  // deslogado), então a busca passa pela função SECURITY DEFINER — ela já
  // devolve apenas token existente, não usado e não expirado.
  const { rows } = await query('SELECT * FROM petplus_buscar_token_recuperacao($1)', [tokenHash])
  const pedido = rows[0]
  if (!pedido) {
    throw new ErroDeNegocio('Link inválido ou expirado. Solicite um novo.', { status: 400, codigo: 'TOKEN_INVALIDO' })
  }

  const hash = await bcrypt.hash(senha, config.auth.bcryptRounds)

  await withTransaction(
    { tenantId: pedido.petshop_id, usuarioId: pedido.usuario_id },
    async (db) => {
      await db.query('UPDATE usuario SET senha_hash = $1 WHERE id = $2', [hash, pedido.usuario_id])
      await db.query('UPDATE token_recuperacao SET usado_em = now() WHERE id = $1', [pedido.id])
    },
  )

  // Trocar a senha encerra todas as sessões: se o token vazou, o invasor
  // perde o acesso no mesmo instante.
  await revogarSessoesDoUsuario({ tenantId: pedido.petshop_id, usuarioId: pedido.usuario_id })

  return { redefinida: true }
}

/** Troca de senha do próprio usuário autenticado (exige a senha atual). */
export async function trocarSenha({ usuarioId, tenantId, senhaAtual, novaSenha }) {
  const senhaHash = await withTransaction({ tenantId, usuarioId }, async (db) => {
    const { rows } = await db.query('SELECT senha_hash FROM usuario WHERE id = $1', [usuarioId])
    return rows[0]?.senha_hash
  })

  const confere = senhaHash ? await bcrypt.compare(String(senhaAtual), senhaHash) : false
  if (!confere) {
    throw new ErroDeNegocio('Senha atual incorreta.', { status: 422, codigo: 'SENHA_ATUAL_INVALIDA' })
  }

  const novoHash = await bcrypt.hash(novaSenha, config.auth.bcryptRounds)
  await withTransaction({ tenantId, usuarioId }, (db) =>
    db.query('UPDATE usuario SET senha_hash = $1 WHERE id = $2', [novoHash, usuarioId]))

  // Mantém a sessão atual e derruba as demais: rotina de segurança.
  await revogarSessoesDoUsuario({ tenantId, usuarioId })
  return { alterada: true }
}

/** Sessão atual (GET /auth/eu). */
export const sessaoAtual = (usuario) => ({
  id: usuario.id,
  nome: usuario.nome,
  email: usuario.email,
  perfil: usuario.perfil,
  petshopId: usuario.petshop_id,
})
