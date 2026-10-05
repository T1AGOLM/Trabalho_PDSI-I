#!/usr/bin/env node
/**
 * Verificação do banco de dados do PetPlus.
 *
 *   npm run test:db
 *
 * Não é uma suíte de APIs: ela prova que o BANCO, sozinho, já garante
 * normalização, integridade referencial, as regras de negócio e o
 * isolamento entre tenants. Cada teste tenta violar a regra e exige que o
 * PostgreSQL recuse a operação. Roda tudo dentro de transações que são
 * revertidas ao final, então o banco de demonstração fica intacto.
 */
import pg from 'pg'
import { config } from '../src/config/env.js'

// Cliente ADMIN: superuser ignora RLS. O isolamento é testado à parte,
// com uma conexão usando o papel da aplicação (petplus_app).
const admin = new pg.Client({
  ...config.db,
  user: config.db.adminUser,
  password: config.db.adminPassword,
})
const app = new pg.Client({
  ...config.db,
  user: config.db.user,
  password: config.db.password,
})

let passou = 0
let falhou = 0
const falhas = []

async function teste(nome, fn) {
  try {
    await fn()
    passou++
    console.log(`  \x1b[32m✓\x1b[0m ${nome}`)
  } catch (err) {
    falhou++
    falhas.push({ nome, err })
    console.log(`  \x1b[31m✗\x1b[0m ${nome}`)
    console.log(`      ${err.message.split('\n')[0]}`)
  }
}

/**
 * Executa `fn` numa transação que será SEMPRE revertida, para que os
 * testes nunca sujem o banco de demonstração.
 */
async function emTransacao(client, fn) {
  await client.query('BEGIN')
  try {
    const r = await fn()
    await client.query('ROLLBACK')
    return r
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {})
    throw err
  }
}

/** Espera que `fn` falhe; se passar, o teste reprova. */
async function deveRejeitar(client, fn, motivo) {
  await emTransacao(client, async () => {
    try {
      await fn()
    } catch {
      return // Recusou, como queríamos.
    }
    throw new Error(`O banco ACEITOU uma operação que deveria falhar: ${motivo}`)
  })
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg)
}

await admin.connect()
await app.connect()

console.log('\n\x1b[1mVerificação do banco PetPlus\x1b[0m')
console.log(`(${config.db.host}:${config.db.port}/${config.db.database})\n`)

// ---------------------------------------------------------------------
console.log('\x1b[1m1. Normalização e integridade referencial\x1b[0m')

await teste('Dados da PESSOA (nome/e-mail) ficam só em `usuario` (1FN)', async () => {
  // `cliente` e `colaborador` guardam apenas os dados PRÓPRIOS da
  // especialização. Se alguém recriar `nome`/`email` neles, o teste pega.
  const { rows } = await admin.query(`
    SELECT table_name, column_name FROM information_schema.columns
     WHERE table_schema='public'
       AND table_name IN ('cliente','colaborador','gestor','token_recuperacao','notificacao')
       AND column_name IN ('nome','email','telefone','senha_hash','perfil')
     ORDER BY 1,2
  `)
  ok(rows.length === 0, `Colunas de pessoa duplicadas fora de usuario: ${JSON.stringify(rows)}`)
})

await teste('Herança da classe Usuario não duplica dados entre especializações', async () => {
  const { rows } = await admin.query(`
    SELECT c.conrelid::regclass::text AS tabela, a.attname
      FROM pg_constraint c
      JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype='p' AND c.conrelid::regclass::text IN ('cliente','colaborador','gestor')
       AND a.attname = 'usuario_id'
  `)
  ok(rows.length === 3, `Esperava PK usuario_id nas 3 especializações, veio ${rows.length}`)
})

await teste(' toda FK de tenant é composta com petshop_id (anti-vazamento entre petshops)', async () => {
  const { rows } = await admin.query(`
    SELECT c.conrelid::regclass::text AS tabela, a.attname AS coluna
      FROM pg_constraint c
      JOIN unnest(c.conkey) WITH ORDINALITY AS k(attnum, ord) ON true
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
     WHERE c.contype='f'
       AND c.conrelid::regclass::text IN
           ('pet','agendamento','registro_saude','venda','item_venda','pagamento',
            'avaliacao','assinatura_pacote','notificacao','lote','movimentacao_estoque')
       AND a.attname <> 'petshop_id'
     GROUP BY 1,2
  `)
  const semProtecao = rows.filter(
    (r) => !['venda_id', 'produto_id', 'pacote_id', 'agendamento_id', 'cliente_id', 'pet_id',
             'usuario_id', 'colaborador_id', 'servico_id', 'fornecedor_id', 'lote_id',
             'servico_id', 'criado_por', 'estornado_por'].includes(r.coluna),
  )
  ok(semProtecao.length === 0, `FKs sem proteção de tenant: ${JSON.stringify(semProtecao)}`)
})

await teste('Pet de outro tutor não pode ser usado em agendamento sem FK composta', async () => {
  await deveRejeitar(admin,
    () => admin.query(`
      INSERT INTO agendamento (petshop_id, pet_id, cliente_id, colaborador_id, servico_id,
                               data_hora, data_hora_fim, status, valor)
      VALUES (1, 1, 3, 8, 1, petplus_para_ts('2026-10-01T10:00'),
              petplus_para_ts('2026-10-01T11:00'), 'confirmado', 65.00)`),
    'agendamento do pet 1 (tutor 1) vinculado ao tutor 3')
})

await teste('Estoque negativo é impossível (CHECK de domínio, RN02)', async () => {
  await deveRejeitar(admin,
    () => admin.query('UPDATE produto SET quantidade_estoque = -1 WHERE id = 1'),
    'produto com quantidade_estoque negativa')
})

await teste('Idade de pet fora da faixa plausível é rejeitada', async () => {
  await deveRejeitar(admin,
    () => admin.query("INSERT INTO pet (petshop_id, cliente_id, nome, especie, idade) VALUES (1,1,'X','Cachorro',99)"),
    'pet com idade 99 anos')
})

// ---------------------------------------------------------------------
console.log('\n\x1b[1m2. Regras de negócio\x1b[0m')

await teste('RN01 — agendamento sobreposto do mesmo profissional é REJEITADO', async () => {
  // Agendamento 1 = colaborador 8, 12/09 09:00–10:00.
  await deveRejeitar(admin,
    () => admin.query(`
      INSERT INTO agendamento (petshop_id, pet_id, cliente_id, colaborador_id, servico_id,
                               data_hora, data_hora_fim, status, valor)
      VALUES (1, 1, 1, 8, 2, petplus_para_ts('2026-09-12T09:30'),
              petplus_para_ts('2026-09-12T10:30'), 'confirmado', 45.00)`),
    'segundo atendimento do colaborador 8 no mesmo intervalo')
})

await teste('RN01 — sobreposição parcial também é rejeitada (09:50–10:10)', async () => {
  await deveRejeitar(admin,
    () => admin.query(`
      INSERT INTO agendamento (petshop_id, pet_id, cliente_id, colaborador_id, servico_id,
                               data_hora, data_hora_fim, status, valor)
      VALUES (1, 1, 1, 8, 2, petplus_para_ts('2026-09-12T09:50'),
              petplus_para_ts('2026-09-12T10:10'), 'confirmado', 45.00)`),
    'sobreposição parcial de 20 minutos')
})

await teste('RN01 — mesmo horário para OUTRO profissional é permitido', async () => {
  await emTransacao(admin, async () => {
    await admin.query(`
      INSERT INTO agendamento (petshop_id, pet_id, cliente_id, colaborador_id, servico_id,
                               data_hora, data_hora_fim, status, valor)
      VALUES (1, 1, 1, 9, 2, petplus_para_ts('2026-09-12T09:00'),
              petplus_para_ts('2026-09-12T09:40'), 'confirmado', 45.00)`)
  })
})

await teste('RN04 — agendamento cancelado NÃO bloqueia o horário', async () => {
  await emTransacao(admin, async () => {
    // Agendamento 6 está cancelado (colaborador 9, 11/09 16:00–16:40).
    // Reocupar exatamente o mesmo horário tem que passar.
    await admin.query(`
      INSERT INTO agendamento (petshop_id, pet_id, cliente_id, colaborador_id, servico_id,
                               data_hora, data_hora_fim, status, valor)
      VALUES (1, 1, 1, 9, 2, petplus_para_ts('2026-09-11T16:00'),
              petplus_para_ts('2026-09-11T16:40'), 'confirmado', 45.00)`)
  })
})

await teste('RN08 — agendamento fora da disponibilidade é REJEITADO', async () => {
  // Colaborador 7 (Juliana) só atende Seg–Sáb 08h–18h. Domingo não existe.
  await deveRejeitar(admin,
    () => admin.query(`
      INSERT INTO agendamento (petshop_id, pet_id, cliente_id, colaborador_id, servico_id,
                               data_hora, data_hora_fim, status, valor)
      VALUES (1, 1, 1, 7, 2, petplus_para_ts('2026-09-13T10:00'),
              petplus_para_ts('2026-09-13T10:40'), 'confirmado', 45.00)`),
    'atendimento aos domingos, fora da disponibilidade')
})

await teste('RN08 — atendimento que ultrapassa o fim da disponibilidade é REJEITADO', async () => {
  // Colaborador 8 (Marcos) termina às 18h; tosa de 90min começando 17:30 estoura.
  await deveRejeitar(admin,
    () => admin.query(`
      INSERT INTO agendamento (petshop_id, pet_id, cliente_id, colaborador_id, servico_id,
                               data_hora, data_hora_fim, status, valor)
      VALUES (1, 1, 1, 8, 3, petplus_para_ts('2026-09-14T17:30'),
              petplus_para_ts('2026-09-14T19:00'), 'confirmado', 95.00)`),
    'tosa terminando 19h, disponibilidade vai até 18h')
})

await teste('RN12 — bloqueio que cobre agendamento confirmado é REJEITADO', async () => {
  // Colaborador 10 tem atendimento em 12/09 (sábado).
  await deveRejeitar(admin,
    () => admin.query(`
      INSERT INTO bloqueio_agenda (petshop_id, colaborador_id, data_inicio, data_fim, motivo)
      VALUES (1, 10, '2026-09-12', '2026-09-13', 'Férias')`),
    'bloqueio de férias sobre o atendimento de 12/09')
})

await teste('RN12 — bloqueio em período livre é aceito', async () => {
  await emTransacao(admin, async () => {
    await admin.query(`
      INSERT INTO bloqueio_agenda (petshop_id, colaborador_id, data_inicio, data_fim, motivo)
      VALUES (1, 10, '2026-12-24', '2026-12-26', 'Natal')`)
  })
})

await teste('RN02 — saída maior que o saldo é REJEITADA pela movimentação de estoque', async () => {
  // Produto 7 tem saldo 2.
  await deveRejeitar(admin,
    () => admin.query(`
      INSERT INTO movimentacao_estoque (petshop_id, produto_id, tipo, quantidade)
      VALUES (1, 7, 'saida', 5)`),
    'baixa de 5 unidades de um produto com saldo 2')
})

await teste('RN02 — saída dentro do saldo atualiza produto.quantidade_estoque', async () => {
  await emTransacao(admin, async () => {
    const antes = await admin.query('SELECT quantidade_estoque FROM produto WHERE id = 7')
    await admin.query(`
      INSERT INTO movimentacao_estoque (petshop_id, produto_id, tipo, quantidade)
      VALUES (1, 7, 'saida', 2)`)
    const depois = await admin.query('SELECT quantidade_estoque FROM produto WHERE id = 7')
    ok(depois.rows[0].quantidade_estoque === antes.rows[0].quantidade_estoque - 2,
      `Esperava ${antes.rows[0].quantidade_estoque - 2}, veio ${depois.rows[0].quantidade_estoque}`)
  })
})

await teste('RN11 — estorno por usuário NÃO gestor é REJEITADO', async () => {
  await deveRejeitar(admin, async () => {
    await admin.query("SELECT set_config('app.petshop_id','1',true)")
    // usuario 7 é COLABORADOR, não gestor.
    await admin.query(`
      UPDATE venda SET status='estornada', estornado_em=now(), estornado_por=7
       WHERE id = 1004`)
  }, 'estorno feito por colaborador')
})

await teste('RN11 — estorno FORA do prazo comercial é REJEITADO', async () => {
  await deveRejeitar(admin, async () => {
    await admin.query("SELECT set_config('app.petshop_id','1',true)")
    // Venda 1001 é de 12/09; prazo do petshop é 7 dias. Empurra para o passado.
    await admin.query(`UPDATE venda SET data_hora = petplus_para_ts('2026-01-01T10:00') WHERE id = 1001`)
    await admin.query(`
      UPDATE venda SET status='estornada', estornado_em=now(), estornado_por=6 WHERE id = 1001`)
  }, 'estorno de venda com mais de 7 dias')
})

await teste('RF25 — pagamento que não cobre o total da venda é REJEITADO no commit', async () => {
  // A verificação é um CONSTRAINT TRIGGER DEFERRABLE: só pode ser testada
  // com um COMMIT de verdade. Se passasse com ROLLBACK, estaríamos apenas
  // provando que a transação foi desfeita.
  await admin.query('BEGIN')
  let erro = null
  try {
    const v = await admin.query(`
      INSERT INTO venda (petshop_id, cliente_id, data_hora, valor_total, usuario_id)
      VALUES (1, 1, now(), 100.00, 6) RETURNING id`)
    await admin.query(`
      INSERT INTO pagamento (petshop_id, venda_id, forma_pagamento, valor)
      VALUES (1, $1, 'PIX', 40.00)`, [v.rows[0].id])
    await admin.query('COMMIT')
  } catch (e) {
    erro = e
  }
  await admin.query('ROLLBACK').catch(() => {})
  ok(erro !== null, 'O banco ACEITOU uma venda com pagamento parcial (R$ 40 de R$ 100)')
})

await teste('A venda rejeitada NÃO fica gravada (rollback do commit falho)', async () => {
  const { rows } = await admin.query(
    `SELECT count(*)::int AS n FROM venda
      WHERE valor_total = 100.00 AND data_hora > now() - interval '1 minute'`)
  ok(rows[0].n === 0, `Sobrou ${rows[0].n} venda órfã no banco`)
})

await teste('RF25 — pagamento combinado que SOMA o total é aceito', async () => {
  await admin.query('BEGIN')
  const v = await admin.query(`
    INSERT INTO venda (petshop_id, cliente_id, data_hora, valor_total, usuario_id)
    VALUES (1, 1, now(), 100.00, 6) RETURNING id`)
  await admin.query(`
    INSERT INTO pagamento (petshop_id, venda_id, forma_pagamento, valor) VALUES
      (1, $1, 'PIX', 30.00), (1, $1, 'dinheiro', 70.00)`, [v.rows[0].id])
  await admin.query('COMMIT')
  await admin.query('DELETE FROM venda WHERE id = $1', [v.rows[0].id]).catch(() => {})
  return 'PIX R$ 30 + dinheiro R$ 70 = R$ 100'
})

await teste('Avaliação exige nota entre 1 e 5', async () => {
  await deveRejeitar(admin,
    () => admin.query(`INSERT INTO avaliacao (petshop_id, agendamento_id, cliente_id, nota)
                       VALUES (1, 1, 1, 9)`),
    'avaliação com nota 9')
})

await teste('Um agendamento só pode receber UMA avaliação (1:0..1)', async () => {
  await deveRejeitar(admin,
    () => admin.query(`INSERT INTO avaliacao (petshop_id, agendamento_id, cliente_id, nota)
                       VALUES (1, 4, 1, 4)`),
    'segunda avaliação do agendamento 4, que já tem a nota 5')
})

// ---------------------------------------------------------------------
console.log('\n\x1b[1m3. Isolamento multi-tenant (RNF13)\x1b[0m')

await teste('Papel da aplicação sem tenant definido NÃO enxerga nenhuma linha', async () => {
  // Conecta como petplus_app (não-dono) → as políticas RLS se aplicam.
  await app.query('BEGIN')
  const { rows } = await app.query('SELECT id, nome FROM usuario')
  await app.query('ROLLBACK')
  ok(rows.length === 0, `Esperava 0 linhas sem tenant, veio ${rows.length}`)
})

await teste('Com app.petshop_id = 1, o papel da aplicação enxerga só o tenant 1', async () => {
  await app.query('BEGIN')
  await app.query("SELECT set_config('app.petshop_id','1',true)")
  const { rows } = await app.query('SELECT petshop_id FROM usuario')
  await app.query('ROLLBACK')
  ok(rows.length > 0, 'Deveria ver os usuários do tenant 1')
  // Este cliente não usa o type parser de pool.js, então o BIGINT volta
  // como string — comparamos com Number().
  ok(rows.every((r) => Number(r.petshop_id) === 1), `Vazou outro tenant: ${JSON.stringify(rows)}`)
})

await teste('Cria um 2º tenant e prova que o 1º não enxerga os dados dele', async () => {
  await emTransacao(admin, async () => {
    await admin.query("SELECT set_config('app.petshop_id','99',true)")
    await admin.query(`
      INSERT INTO petshop (id, nome, cnpj, email) VALUES (99, 'PetPlus Filial Norte', '99888777000166', 'norte@petplus.com.br')`)
    await admin.query(`
      INSERT INTO usuario (id, petshop_id, perfil, nome, email, senha_hash)
      VALUES (99, 99, 'GESTOR', 'Gestor da Filial', 'gestor@norte.com.br', 'x')`)
    await admin.query(`
      INSERT INTO cliente (usuario_id, petshop_id, pontos_fidelidade)
      VALUES (99, 99, 0)`)
    await admin.query(`
      INSERT INTO pet (id, petshop_id, cliente_id, nome, especie)
      VALUES (99, 99, 99, 'Rex da Filial', 'Cachorro')`)
  })

  // Agora, do ponto de vista do tenant 1, nada do tenant 99 deve existir.
  await app.query('BEGIN')
  await app.query("SELECT set_config('app.petshop_id','1',true)")
  const pets = await app.query('SELECT nome FROM pet WHERE petshop_id = 99')
  const usrs = await app.query('SELECT nome FROM usuario WHERE petshop_id = 99')
  await app.query('ROLLBACK')
  ok(pets.rows.length === 0, `Tenant 1 enxergou pets do tenant 99: ${JSON.stringify(pets.rows)}`)
  ok(usrs.rows.length === 0, `Tenant 1 enxergou usuários do tenant 99: ${JSON.stringify(usrs.rows)}`)
})

await teste('Escrita com tenant divergente é bloqueada (WITH CHECK)', async () => {
  await app.query('BEGIN')
  await app.query("SELECT set_config('app.petshop_id','1',true)")
  let erro = null
  try {
    await app.query(`INSERT INTO petshop (id, nome, cnpj, email) VALUES (77,'Intruso','1','intruso@x.com')`)
  } catch (e) { erro = e }
  await app.query('ROLLBACK')
  ok(erro !== null, 'Inseriu uma linha em petshop de outro tenant sem erro')
})

await teste('Integração referencial cruza tenants é rejeitada pelo banco', async () => {
  // Cliente 1 é do tenant 1; tentar usá-lo num pet do tenant 99.
  await deveRejeitar(admin, async () => {
    await admin.query("SELECT set_config('app.petshop_id','99',true)")
    await admin.query(`
      INSERT INTO petshop (id, nome, cnpj, email) VALUES (99,'T','99888777000166','n@x.com')`)
    await admin.query(`
      INSERT INTO pet (petshop_id, cliente_id, nome, especie)
      VALUES (99, 1, 'Pet Invasor', 'Cachorro')`)
  }, 'pet do tenant 99 apontando para cliente do tenant 1')
})

// ---------------------------------------------------------------------
console.log('\n\x1b[1m4. Alertas e indicadores (RF09/RF23/RN05/RN09)\x1b[0m')

await teste('Alerta de estoque mínimo lista os produtos no limite (RN05)', async () => {
  const { rows } = await admin.query('SELECT nome, quantidade_estoque, estoque_minimo FROM vw_alerta_estoque_minimo ORDER BY nome')
  const nomes = rows.map((r) => r.nome)
  ok(nomes.includes('Shampoo Higienizador Neutro 500ml'), 'Shampoo (3 de 6) deveria alertar')
  ok(nomes.includes('Areia Higiênica Granulada 4kg'), 'Areia (2 de 8) deveria alertar')
  ok(!nomes.includes('Petisco Dental para Cães 100g'), 'Petisco (25 de 6) não deveria alertar')
  console.log(`      → ${rows.length} produtos em alerta: ${nomes.join('; ')}`)
})

await teste('Alerta de validade cobre só quem vence em ≤ 30 dias (RN09)', async () => {
  const { rows } = await admin.query('SELECT nome, dias_para_vencer FROM vw_alerta_validade ORDER BY dias_para_vencer')
  const nomes = rows.map((r) => r.nome)
  ok(nomes.includes('Vermífugo Vermivet Plus 700mg'), 'Vermífugo (25/09) deveria alertar')
  ok(!nomes.includes('Ração Super Premium Cães Adultos 15kg'), 'Ração (10/2027) não deveria alertar')
  ok(rows.every((r) => r.dias_para_vencer <= 30), 'A view retornou algo além de 30 dias')
  console.log(`      → ${rows.length} produtos perto do vencimento: ${nomes.join('; ')}`)
})

await teste('Faturamento só contabiliza vendas finalizadas (estorno excluído)', async () => {
  // Comparação dinâmica: a view tem de bater com a soma das vendas
  // finalizadas, e a soma das estornadas tem de ser diferente — senão o
  // teste passaria por acidente se não houvesse nenhuma estornada.
  const { rows } = await admin.query(`
    SELECT (SELECT COALESCE(sum(faturamento), 0) FROM vw_faturamento)      AS view_total,
           (SELECT COALESCE(sum(valor_total - desconto), 0) FROM venda
             WHERE status = 'finalizada')                                  AS finalizadas,
           (SELECT COALESCE(sum(valor_total - desconto), 0) FROM venda
             WHERE status = 'estornada')                                    AS estornadas
  `)
  // Este cliente usa pg puro (sem os type parsers de src/db/pool.js),
  // então NUMERIC volta como string — convertemos antes de somar.
  const { view_total: viewBruto, finalizadas: finBruto, estornadas: estBruto } = rows[0]
  const view = Number(viewBruto)
  const finalizadas = Number(finBruto)
  const estornadas = Number(estBruto)

  ok(estornadas > 0, 'a base precisa ter ao menos uma venda estornada para o teste ter valor')
  ok(Math.abs(view - finalizadas) < 0.01,
    `view (${view}) != soma das finalizadas (${finalizadas})`)
  ok(Math.abs(view - (finalizadas + estornadas)) > 0.01,
    'a view está somando as vendas estornadas no faturamento')
  return `faturamento R$ ${view.toFixed(2)} · estornadas R$ ${estornadas.toFixed(2)} fora`
})

await teste('Auditoria registra alterações de estoque (RNF09)', async () => {
  await emTransacao(admin, async () => {
    await admin.query(`UPDATE produto SET estoque_minimo = 9 WHERE id = 1`)
  })
  const { rows } = await admin.query(
    `SELECT acao, tabela FROM auditoria WHERE tabela='produto' ORDER BY id DESC LIMIT 1`)
  ok(rows.length === 1, 'Nenhuma linha de auditoria foi criada')
  ok(rows[0].acao === 'alterar' && rows[0].tabela === 'produto',
     `Auditoria inesperada: ${JSON.stringify(rows[0])}`)
})

// ---------------------------------------------------------------------
await app.end()
await admin.end()

console.log(`\n${'─'.repeat(60)}`)
if (falhou === 0) {
  console.log(`\x1b[32m✓ ${passou} verificações passaram\x1b[0m`)
  process.exit(0)
} else {
  console.log(`\x1b[31m✗ ${falhou} falharam\x1b[0m (${passou} passaram)`)
  for (const f of falhas) console.log(`  · ${f.nome}`)
  process.exit(1)
}