import bcrypt from 'bcryptjs'
import crypto from 'node:crypto'
import { config } from '../config/env.js'
import { query, withTransaction } from '../db/pool.js'
import { assinarToken } from '../middleware/auth.js'
import { ErroDeNegocio } from '../middleware/errors.js'

/**
 * Serviço de autenticação (RF18 / RNF02 / RF24).
 *
 * A busca de usuário usa `petplus_buscar_usuario_por_email()`, uma função
 * SECURITY DEFINER criada em 006_funcoes_de_autorizacao.sql. Ela é a
 * única porta de entrada que roda antes de o tenant ser conhecido — sem
 * ela, as políticas de RLS filtrariam a busca e o login seria impossível.
 * Compare com `query()`: só o login pode usá-la.
 */

const SELECT_USUARIO = 'SELECT * FROM petplus_buscar_usuario_por_email($1)'

/** Login (RF18). Compara bcrypt e emite o JWT. */
export async function login({ email, senha }) {
  const { rows } = await query(SELECT_USUARIO, [email])
  const usuario = rows[0]

  // Mesma mensagem para e-mail inexistente e senha errada: não revelamos
  // quais e-mails estão cadastrados.
  const credenciaisInvalidas = new ErroDeNegocio('E-mail ou senha inválidos.', {
    status: 401, codigo: 'CREDENCIAIS_INVALIDAS',
  })
  if (!usuario) throw credenciaisInvalidas

  const senhaConfere = await bcrypt.compare(senha, usuario.senha_hash)
  if (!senhaConfere) throw credenciaisInvalidas
  if (!usuario.ativo) {
    throw new ErroDeNegocio('Conta inativa. Procure o gestor da unidade.', { status: 403 })
  }

  // Registro de acesso: dentro da transação do tenant, para passar pelas
  // políticas de RLS.
  await withTransaction(
    { tenantId: usuario.petshop_id, usuarioId: usuario.id },
    (db) => db.query('UPDATE usuario SET ultimo_acesso = now() WHERE id = $1', [usuario.id]),
  )

  return {
    token: assinarToken(usuario),
    usuario: {
      id: usuario.id,
      nome: usuario.nome,
      email: usuario.email,
      perfil: usuario.perfil,
      telefone: usuario.telefone,
    },
  }
}

/** Cadastro público de tutor (RF01/RF02 — tela "Criar conta de cliente"). */
export async function cadastrarCliente({ nome, email, telefone, senha, endereco, consentimento }) {
  const hash = await bcrypt.hash(senha, config.auth.bcryptRounds)

  // O novo cliente entra no petshop padrão — em produção esse id vem do
  // subdomínio/convite da unidade (ver 006_funcoes_de_autorizacao.sql).
  const { rows: petshops } = await query('SELECT petplus_petshop_padrao() AS id')
  const petshopId = petshops[0]?.id
  if (!petshopId) {
    throw new ErroDeNegocio('Nenhuma unidade cadastrada.', { status: 503 })
  }

  return withTransaction({ tenantId: petshopId }, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO usuario (petshop_id, perfil, nome, email, telefone, senha_hash, consent_lgpd, consent_em)
       VALUES ($1, 'CLIENTE', $2, $3, $4, $5, $6, CASE WHEN $6 THEN now() END)
       RETURNING id, nome, email::text, perfil, petshop_id`,
      [petshopId, nome, email, telefone ?? null, hash, Boolean(consentimento)],
    )
    const usuario = rows[0]

    await db.query(
      `INSERT INTO cliente (usuario_id, petshop_id, endereco, pontos_fidelidade)
       VALUES ($1, $2, $3, 0)`,
      [usuario.id, petshopId, endereco ?? null],
    )

    return {
      token: assinarToken(usuario),
      usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, perfil: usuario.perfil },
    }
  })
}

/**
 * Recuperação de senha (RF24).
 *
 * Gera um token aleatório, guarda apenas o SHA-256 (nunca o token em
 * claro) e devolve o link. A API de produção envia isso por e-mail; aqui
 * devolvemos no corpo para que o protótipo consiga demonstrar o fluxo.
 */
export async function solicitarRecuperacao({ email }) {
  const { rows } = await query(SELECT_USUARIO, [email])
  const usuario = rows[0]
  // Resposta idêntica exista ou não o e-mail: não enumera contas.
  if (!usuario) return { enviado: true }

  const token = crypto.randomBytes(32).toString('hex')
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')

  await withTransaction(
    { tenantId: usuario.petshop_id, usuarioId: usuario.id },
    (db) => db.query(
      `INSERT INTO token_recuperacao (petshop_id, usuario_id, token_hash, expira_em)
       VALUES ($1, $2, $3, now() + interval '1 hour')`,
      [usuario.petshop_id, usuario.id, tokenHash],
    ),
  )

  return { enviado: true, token, expiraEmMinutos: 60 }
}

/** Redefine a senha a partir do token (RF24). */
export async function redefinirSenha({ token, senha }) {
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex')
  const { rows } = await query(
    `SELECT id, petshop_id FROM token_recuperacao
      WHERE token_hash = $1 AND usado_em IS NULL AND expira_em > now()`,
    [tokenHash],
  )
  if (!rows[0]) {
    throw new ErroDeNegocio('Link inválido ou expirado. Solicite um novo.', { status: 400 })
  }

  const { petshop_id, id } = rows[0]
  const hash = await bcrypt.hash(senha, config.auth.bcryptRounds)

  await withTransaction({ tenantId: petshop_id, usuarioId: id }, async (db) => {
    await db.query('UPDATE usuario SET senha_hash = $1 WHERE id = $2', [hash, id])
    await db.query('UPDATE token_recuperacao SET usado_em = now() WHERE id = $1', [rows[0].id])
  })

  return { redefinida: true }
}