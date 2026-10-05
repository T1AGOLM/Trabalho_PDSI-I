import { withTransaction } from '../db/pool.js'

/**
 * Repositório de clientes (tutores) e seus pets.
 *
 * `cliente` é uma especialização de `usuario`: criar um tutor grava as
 * duas tabelas na mesma transação, porque a FK composta
 * `cliente_petshop_dono` exige que as duas linhas pertençam ao mesmo tenant.
 */

export const listarPets = ({ tenantId }, clienteId) =>
  withTransaction({ tenantId }, (db) =>
    db.query(`
      SELECT id, cliente_id AS "clienteId", nome, especie, raca, porte, idade,
             observacoes_saude AS "observacoesSaude", ativo
        FROM pet
       WHERE petshop_id = $1 AND cliente_id = $2 AND ativo
       ORDER BY nome`, [tenantId, clienteId]),
  )

/**
 * Cadastra um tutor e, opcionalmente, o primeiro pet junto (RF01/RF02).
 * É o fluxo da tela "Criar conta de cliente" do protótipo.
 */
export const criar = ({ tenantId }, { nome, email, telefone, endereco, senhaHash, pet }) =>
  withTransaction({ tenantId }, async (db) => {
    const { rows } = await db.query(
      `INSERT INTO usuario (petshop_id, perfil, nome, email, telefone, senha_hash, consent_lgpd, consent_em)
       VALUES ($1, 'CLIENTE', $2, $3, $4, $5, true, now())
       RETURNING id, nome, email::text AS email, telefone`,
      [tenantId, nome, email, telefone ?? null, senhaHash],
    )
    const cliente = rows[0]

    await db.query(
      `INSERT INTO cliente (usuario_id, petshop_id, endereco, pontos_fidelidade)
       VALUES ($1, $2, $3, 0)`,
      [cliente.id, tenantId, endereco ?? null],
    )

    if (pet?.nome) {
      await db.query(
        `INSERT INTO pet (petshop_id, cliente_id, nome, especie, raca, porte, idade, observacoes_saude)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [tenantId, cliente.id, pet.nome, pet.especie ?? 'Cachorro', pet.raca ?? null,
         pet.porte ?? null, pet.idade ?? null, pet.observacoesSaude ?? null],
      )
    }

    return cliente
  })