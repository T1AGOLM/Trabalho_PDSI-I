import { test } from 'node:test'
import assert from 'node:assert/strict'
import { pool } from '../../src/db/pool.js'
import { cadastrarCliente } from '../../src/services/auth.service.js'
import { concluir } from '../../src/repositories/agenda.repository.js'

// Falhas injetadas: verifica a fronteira transacional sem conectar ao banco.
for (const falha of ['pet', 'refresh_token', null]) {
  test(`cadastro de tutor e pet: ${falha ? 'rollback ao falhar '+falha : 'uma transação para conta, pet e sessão'}`, async t => {
    const sqls = []
    let conexoes = 0
    t.mock.method(pool, 'query', async () => ({ rows: [{ id: 1 }] }))
    t.mock.method(pool, 'connect', async () => {
      conexoes++
      return { release() {}, async query(sql, params) {
        sqls.push(sql)
        if (falha && sql.includes('INSERT INTO '+falha+' ')) throw new Error('Falha injetada')
        if (sql.includes('INSERT INTO usuario')) return { rows: [{ id: 99, petshop_id: 1, perfil: 'CLIENTE', nome: 'Tutor Teste', email: 'tutor@example.com' }] }
        if (sql.includes('INSERT INTO pet ')) assert.equal(params[1], 99, 'O tutor vem da conta criada, não do payload do pet.')
        if (sql.includes('INSERT INTO refresh_token')) return { rows: [{ id: 42 }] }
        return { rows: [], rowCount: 1 }
      } }
    })
    const promessa = cadastrarCliente({ nome: 'Tutor Teste', email: 'tutor@example.com', senha: 'SenhaTeste123', consentimento: true,
      pet: { nome: 'Bolinha', especie: 'Cachorro', idade: 3 } })
    if (falha) { await assert.rejects(promessa, /Falha injetada/); assert.equal(sqls.at(-1), 'ROLLBACK'); assert.ok(!sqls.includes('COMMIT')) }
    else { assert.equal((await promessa).usuario.id, 99); assert.equal(sqls.at(-1), 'COMMIT') }
    assert.equal(conexoes, 1)
  })
}
for (const falha of ['historico', 'pontos', null, 'ja_concluido']) {
  test(`conclusão e histórico: ${falha ?? 'sucesso'}`, async t => {
    const sqls = []
    t.mock.method(pool, 'connect', async () => ({ release() {}, async query(sql, params) {
      sqls.push(sql)
      if (sql.startsWith('UPDATE agendamento')) return { rows: falha === 'ja_concluido' ? [] : [{ id: 7, cliente_id: 99, valor: 20 }] }
      if (sql.includes('INSERT INTO registro_saude')) {
        assert.equal(params[2], 'Observação do atendimento')
        if (falha === 'historico') throw new Error('Falha injetada')
      }
      if (sql.includes('SELECT pontos_por_real')) return { rows: [{ pontos_por_real: 1 }] }
      if (sql.includes('SELECT 1 FROM fidelidade')) return { rows: [], rowCount: 0 }
      if (sql.includes('INSERT INTO fidelidade') && falha === 'pontos') throw new Error('Falha injetada')
      if (sql.includes('WHERE a.id = $1 AND a.petshop_id = $2')) return { rows: [{ id: 7, status: 'concluído' }] }
      return { rows: [], rowCount: 1 }
    } }))
    const promessa = concluir({ tenantId: 1, usuarioId: 5 }, 7, 'Observação do atendimento')
    if (falha === 'historico' || falha === 'pontos') { await assert.rejects(promessa, /Falha injetada/); assert.equal(sqls.at(-1), 'ROLLBACK'); assert.ok(!sqls.includes('COMMIT')) }
    else {
      const resultado = await promessa
      if (falha === 'ja_concluido') { assert.equal(resultado, null); assert.ok(!sqls.some(s => s.includes('INSERT INTO registro_saude'))) }
      else assert.equal(resultado.status, 'concluído')
      assert.equal(sqls.at(-1), 'COMMIT')
    }
  })
}
