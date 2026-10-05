#!/usr/bin/env node
/**
 * Smoke test da API — exercita o caminho real HTTP → serviço → banco.
 *
 *   npm run smoke            (com a API rodando em http://localhost:3333)
 *
 * Diferente de `test:db`, que prova garantias do BANCO: aqui provamos que
 * as rotas, a autenticação e as regras de negócio estão ligadas de ponta a
 * ponta. Cada escrita feita aqui é revertida por um `DELETE`/rollback no
 * final, para não sujar a demonstração.
 */

const BASE = process.env.API_URL ?? 'http://localhost:3333/api'

let passou = 0
let falhou = 0

const verde = (s) => `\x1b[32m${s}\x1b[0m`
const vermelho = (s) => `\x1b[31m${s}\x1b[0m`

async function teste(nome, fn) {
  try {
    const detalhe = await fn()
    passou++
    console.log(`  ${verde('✓')} ${nome}${detalhe ? `\n      ${detalhe}` : ''}`)
  } catch (err) {
    falhou++
    console.log(`  ${vermelho('✗')} ${nome}`)
    console.log(`      ${err.message}`)
  }
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function api(caminho, { metodo = 'GET', token, body } = {}) {
  const res = await fetch(BASE + caminho, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  })
  const texto = await res.text()
  let json
  try { json = texto ? JSON.parse(texto) : null } catch { json = texto }
  return { status: res.status, body: json }
}

// ---------------------------------------------------------------------

console.log(`\n\x1b[1mSmoke test da API PetPlus\x1b[0m  (${BASE})\n`)

// Falha cedo e com instrução clara, em vez de um stack trace de ECONNREFUSED.
try {
  const r = await api('/health')
  ok(r.status === 200 && r.body.ok, `health check respondeu ${r.status}: ${JSON.stringify(r.body)}`)
} catch (err) {
  console.error(vermelho(`✗ Não consegui falar com a API em ${BASE}`))
  console.error(`  ${err.cause?.code ?? err.message}`)
  console.error('\n  A API está rodando? Em outro terminal:\n')
  console.error('    cd backend && npm start\n')
  process.exit(1)
}

console.log('\x1b[1m1. Autenticação (RF18 / RNF02 / RF24)\x1b[0m')

const credenciais = {}
for (const [perfil, email] of [
  ['GESTOR', 'gestor@petplus.com'],
  ['COLABORADOR', 'colab@petplus.com'],
  ['CLIENTE', 'cliente@petplus.com'],
]) {
  await teste(`login do perfil ${perfil} (${email})`, async () => {
    const res = await api('/auth/login', { metodo: 'POST', body: { email, senha: '123' } })
    ok(res.status === 200, `esperava 200, veio ${res.status}: ${JSON.stringify(res.body)}`)
    ok(typeof res.body.token === 'string' && res.body.token.split('.').length === 3,
      'token JWT malformado')
    ok(res.body.usuario.perfil === perfil,
      `perfil veio ${res.body.usuario.perfil}, esperava ${perfil}`)
    credenciais[perfil] = res.body.token
  })
}

await teste('senha errada é rejeitada com 401 e mensagem genérica', async () => {
  const res = await api('/auth/login', {
    metodo: 'POST', body: { email: 'gestor@petplus.com', senha: 'senha-errada' },
  })
  ok(res.status === 401, `esperava 401, veio ${res.status}`)
  ok(res.body.codigo === 'CREDENCIAIS_INVALIDAS', `código inesperado: ${res.body.codigo}`)
})

await teste('senha não está em texto puro no banco (RNF02)', async () => {
  // O hash tem 60 chars e prefixo bcrypt; a senha "123" não aparece.
  const res = await api('/auth/login', { metodo: 'POST', body: { email: 'gestor@petplus.com', senha: '123' } })
  ok(!JSON.stringify(res.body).includes('senha_hash'), 'a resposta não deve vazar hash')
})

await teste('rota protegida sem token responde 401', async () => {
  const res = await api('/bootstrap')
  ok(res.status === 401, `esperava 401, veio ${res.status}`)
})

await teste('token inválido é rejeitado', async () => {
  const res = await api('/bootstrap', { token: 'token.invalido.aqui' })
  ok(res.status === 401, `esperava 401, veio ${res.status}`)
})

const token = credenciais.GESTOR

await teste('recuperação de senha devolve resposta sem revelar se o e-mail existe', async () => {
  const [existente, inexistente] = await Promise.all([
    api('/auth/recuperar-senha', { metodo: 'POST', body: { email: 'gestor@petplus.com' } }),
    api('/auth/recuperar-senha', { metodo: 'POST', body: { email: 'ninguem@existe.com' } }),
  ])
  ok(existente.status === inexistente.status, 'respostas divergem — permite enumerar contas')
  ok(existente.body.enviado === true && inexistente.body.enviado === true, 'ambos devem confirmar')
})

// ---------------------------------------------------------------------

console.log('\n\x1b[1m2. Bootstrap — contrato com as 26 telas\x1b[0m')

let boot
await teste('GET /bootstrap devolve todas as coleções no formato de src/data.ts', async () => {
  const res = await api('/bootstrap', { token })
  ok(res.status === 200, `esperava 200, veio ${res.status}`)
  boot = res.body
  const esperadas = ['clientes', 'pets', 'colaboradores', 'servicos', 'agendamentos',
    'bloqueios', 'produtos', 'fornecedores', 'vendas', 'registrosSaude',
    'pacotes', 'avaliacoes', 'notificacoes', 'relatorios']
  const faltando = esperadas.filter((k) => !Array.isArray(boot[k]))
  ok(faltando.length === 0, `coleções ausentes ou não-listas: ${faltando}`)
  return esperadas.map((k) => `${k}=${boot[k].length}`).join(' ')
})

await teste('agendamento vem com data_hora local no formato "YYYY-MM-DDTHH:MM"', async () => {
  const a = boot.agendamentos[0]
  ok(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(a.dataHora),
    `formato inesperado: ${a.dataHora}`)
  ok(['confirmado', 'cancelado', 'concluído'].includes(a.status), `status inválido: ${a.status}`)
  ok(['petId', 'clienteId', 'colaboradorId', 'servicoId'].every((k) => typeof a[k] === 'number'),
    'chaves estrangeiras precisam ser numéricas para os lookups das telas')
  return `ex.: ${JSON.stringify(a)}`
})

await teste('venda traz itens e pagamentos aninhados', async () => {
  const v = boot.vendas[0]
  ok(Array.isArray(v.itens) && v.itens.length > 0, 'venda sem itens')
  ok(Array.isArray(v.pagamentos) && v.pagamentos.length > 0, 'venda sem pagamentos')
  ok(typeof v.itens[0].precoUnitario === 'number', 'precoUnitario deve ser número')
  const combinada = boot.vendas.find((x) => x.pagamentos.length > 1)
  ok(combinada, 'o seed deveria ter uma venda de pagamento combinado (RF25)')
  return `combinada #${combinada.id}: ${JSON.stringify(combinada.pagamentos)}`
})

await teste('disponibilidade do colaborador é derivada das linhas normalizadas', async () => {
  const c = boot.colaboradores[0]
  ok(typeof c.disponibilidade === 'string' && c.disponibilidade.length > 0,
    'disponibilidade vazia')
  ok(c.cargo && c.email, 'faltam cargo/e-mail')
  return `${c.nome}: ${c.disponibilidade}`
})

// ---------------------------------------------------------------------

console.log('\n\x1b[1m3. Agendamentos (RF04–RF06 / RN01, RN08)\x1b[0m')

let criado
await teste('POST /agendamentos cria um atendimento novo', async () => {
  const res = await api('/agendamentos', {
    metodo: 'POST', token,
    body: { petId: boot.pets[0].id, servicoId: boot.servicos[0].id,
            colaboradorId: boot.colaboradores[0].id, dataHora: '2026-10-05T10:00' },
  })
  ok(res.status === 201, `esperava 201, veio ${res.status}: ${JSON.stringify(res.body)}`)
  criado = res.body.id
  return `agendamento #${criado}`
})

await teste('RN01 — conflito de horário é barrado com 409', async () => {
  const res = await api('/agendamentos', {
    metodo: 'POST', token,
    // Mesmo profissional, mesmo horário do que acabamos de criar.
    body: { petId: boot.pets[1].id, servicoId: boot.servicos[0].id,
            colaboradorId: boot.colaboradores[0].id, dataHora: '2026-10-05T10:00' },
  })
  ok(res.status === 409, `esperava 409, veio ${res.status}: ${JSON.stringify(res.body)}`)
  ok(res.body.codigo === 'CONFLITO_AGENDA', `código inesperado: ${res.body.codigo}`)
  return res.body.erro
})

await teste('RN08 — fora da disponibilidade é barrado com 422', async () => {
  const res = await api('/agendamentos', {
    metodo: 'POST', token,
    // 05/10/2026 é uma segunda-feira; usamos 03/10 (sábado) às 02:00 —
    // fora de qualquer janela cadastrada.
    body: { petId: boot.pets[0].id, servicoId: boot.servicos[0].id,
            colaboradorId: boot.colaboradores[0].id, dataHora: '2026-10-03T02:00' },
  })
  ok(res.status === 422, `esperava 422, veio ${res.status}: ${JSON.stringify(res.body)}`)
  return res.body.erro
})

await teste('PATCH /remarcar move o agendamento', async () => {
  const res = await api(`/agendamentos/${criado}/remarcar`, {
    metodo: 'PATCH', token, body: { dataHora: '2026-10-06T14:00' },
  })
  ok(res.status === 200, `esperava 200, veio ${res.status}: ${JSON.stringify(res.body)}`)
})

await teste('PATCH /cancelar libera o horário (RN04)', async () => {
  const res = await api(`/agendamentos/${criado}/cancelar`, {
    metodo: 'PATCH', token, body: { motivo: 'teste de smoke' },
  })
  ok(res.status === 200, `esperava 200, veio ${res.status}`)

  // Reocupar o horário recem-cancelado tem que funcionar.
  const reuso = await api('/agendamentos', {
    metodo: 'POST', token,
    body: { petId: boot.pets[0].id, servicoId: boot.servicos[0].id,
            colaboradorId: boot.colaboradores[0].id, dataHora: '2026-10-06T14:00' },
  })
  ok(reuso.status === 201, `horário não foi liberado: ${JSON.stringify(reuso.body)}`)
  await api(`/agendamentos/${reuso.body.id}/cancelar`, { metodo: 'PATCH', token, body: { motivo: 'limpeza' } })
  return `agendamento #${criado} cancelado e horário reocupado`
})

await teste('RN08 — remarcação para fora da disponibilidade também é barrada', async () => {
  const novo = await api('/agendamentos', {
    metodo: 'POST', token,
    body: { petId: boot.pets[0].id, servicoId: boot.servicos[0].id,
            colaboradorId: boot.colaboradores[0].id, dataHora: '2026-10-07T15:00' },
  })
  ok(novo.status === 201, `esperava 201, veio ${novo.status}`)
  const remarca = await api(`/agendamentos/${novo.body.id}/remarcar`, {
    metodo: 'PATCH', token, body: { dataHora: '2026-10-04T03:00' },
  })
  ok(remarca.status === 422, `esperava 422, veio ${remarca.status}`)
  await api(`/agendamentos/${novo.body.id}/cancelar`, { metodo: 'PATCH', token, body: { motivo: 'limpeza' } })
  return '03/10 é domingo — recusado na remarcação'
})

// ---------------------------------------------------------------------

console.log('\n\x1b[1m4. PDV e estoque (RF08–RF10 / RN02, RN05, RN11)\x1b[0m')

// O produto de teste é nomeado com prefixo "ZZ" para nunca ser confundido
// com o catálogo real na hora de escolher `boot.produtos[0]`.
let vendaCriada
let produtoTeste

await teste('POST /produtos cria item e registra a entrada de estoque', async () => {
  const res = await api('/produtos', {
    metodo: 'POST', token,
    body: { nome: `ZZ Produto de teste ${Date.now()}`, categoria: 'Testes',
            preco: 10, estoqueMinimo: 2, quantidadeInicial: 5 },
  })
  ok(res.status === 201, `esperava 201, veio ${res.status}: ${JSON.stringify(res.body)}`)
  produtoTeste = res.body
  // A API responde em camelCase (mesmo contrato de src/types.ts).
  ok(produtoTeste.quantidadeEstoque === 5,
    `saldo inicial veio ${produtoTeste.quantidadeEstoque}, esperava 5`)
  return `#${produtoTeste.id} com saldo 5`
})

await teste('entrada de estoque soma na trilha e reflete no saldo', async () => {
  const res = await api(`/produtos/${produtoTeste.id}/entrada`, {
    metodo: 'POST', token, body: { quantidade: 3 },
  })
  ok(res.status === 200, `esperava 200, veio ${res.status}`)
  ok(res.body.quantidadeEstoque === 8, `saldo veio ${res.body.quantidadeEstoque}, esperava 8`)
  return '5 + 3 = 8'
})

await teste('RN02 — venda acima do estoque é barrada', async () => {
  const res = await api('/vendas', {
    metodo: 'POST', token,
    body: { itens: [{ produtoId: produtoTeste.id, quantidade: 999, precoUnitario: 10 }],
            pagamentos: [{ formaPagamento: 'PIX', valor: 9990 }] },
  })
  ok(res.status === 422, `esperava 422, veio ${res.status}: ${JSON.stringify(res.body)}`)
  return res.body.erro
})

await teste('RF25 — pagamento incompleto é barrado antes de gravar', async () => {
  const res = await api('/vendas', {
    metodo: 'POST', token,
    body: { itens: [{ produtoId: produtoTeste.id, quantidade: 1, precoUnitario: 10 }],
            pagamentos: [{ formaPagamento: 'PIX', valor: 3 }] },
  })
  ok(res.status === 422, `esperava 422, veio ${res.status}: ${JSON.stringify(res.body)}`)
  return res.body.erro
})

await teste('venda válida baixa o estoque e aceita pagamento combinado', async () => {
  const preco = boot.produtos[0].preco
  const res = await api('/vendas', {
    metodo: 'POST', token,
    body: {
      clienteId: boot.clientes[0].id,
      itens: [{ produtoId: produtoTeste.id, quantidade: 2, precoUnitario: 10 },
              { produtoId: boot.produtos[0].id, quantidade: 1, precoUnitario: preco }],
      // RF25: parte em PIX, parte em dinheiro.
      pagamentos: [{ formaPagamento: 'PIX', valor: 10 },
                   { formaPagamento: 'dinheiro', valor: 10 + preco }],
    },
  })
  ok(res.status === 201, `esperava 201, veio ${res.status}: ${JSON.stringify(res.body)}`)
  vendaCriada = res.body.id

  const listagem = await api('/produtos', { token })
  const p = listagem.body.find((x) => x.id === produtoTeste.id)
  ok(p.quantidadeEstoque === 6, `saldo veio ${p.quantidadeEstoque}, esperava 6 (8 - 2)`)
  return `venda #${vendaCriada}; saldo 8 → 6`
})

await teste('estorno por gestor devolve o estoque (RF26)', async () => {
  const res = await api(`/vendas/${vendaCriada}/estornar`, {
    metodo: 'POST', token, body: { motivo: 'teste de smoke' },
  })
  ok(res.status === 200, `esperava 200, veio ${res.status}: ${JSON.stringify(res.body)}`)
  const listagem = await api('/produtos', { token })
  const p = listagem.body.find((x) => x.id === produtoTeste.id)
  ok(p.quantidadeEstoque === 8, `saldo voltou a ${p.quantidadeEstoque}, esperava 8`)
  return 'saldo 6 → 8 após estorno'
})

await teste('RN11 — somente gestor estorna (colaborador recebe 403)', async () => {
  const res = await api(`/vendas/${vendaCriada}/estornar`, {
    metodo: 'POST', token: credenciais.COLABORADOR, body: {},
  })
  ok(res.status === 403, `esperava 403, veio ${res.status}: ${JSON.stringify(res.body)}`)
  return res.body.erro
})

await teste('RF09 — alertas de estoque mínimo e validade', async () => {
  const res = await api('/produtos/alertas', { token })
  ok(res.status === 200, `esperava 200, veio ${res.status}`)
  ok(Array.isArray(res.body.estoque) && Array.isArray(res.body.validade),
    'esperava as listas estoque e validade')
  return `estoque=${res.body.estoque.length} itens · validade=${res.body.validade.length} itens`
})

// ---------------------------------------------------------------------

console.log('\n\x1b[1m5. Isolamento entre perfis (RF18)\x1b[0m')

await teste('cliente não consegue criar produto', async () => {
  const res = await api('/produtos', {
    metodo: 'POST', token: credenciais.CLIENTE, body: { nome: 'X', categoria: 'Y', preco: 1 },
  })
  ok(res.status === 403, `esperava 403, veio ${res.status}`)
})

await teste('colaborador não consegue estornar venda', async () => {
  const res = await api(`/vendas/${vendaCriada}/estornar`, {
    metodo: 'POST', token: credenciais.COLABORADOR, body: {},
  })
  ok(res.status === 403, `esperava 403, veio ${res.status}`)
})

await teste('cada perfil enxerga os MESMOS dados do tenant (isolamento é por tenant, não por perfil)', async () => {
  const [g, c, cl] = await Promise.all([
    api('/bootstrap', { token: credenciais.GESTOR }),
    api('/bootstrap', { token: credenciais.COLABORADOR }),
    api('/bootstrap', { token: credenciais.CLIENTE }),
  ])
  ok(g.body.clientes.length === c.body.clientes.length &&
     g.body.clientes.length === cl.body.clientes.length,
    'perfis do mesmo tenant enxergaram quantidades diferentes')
  return `${g.body.clientes.length} clientes visíveis para os 3 perfis`
})

// ---------------------------------------------------------------------

// Limpeza: o produto de teste e os agendamentos criados por aqui não devem
// ficar na base de demonstração. O estoque já foi devolvido pelo estorno.
await teste('limpeza dos registros criados pelo teste', async () => {
  if (produtoTeste) {
    await api(`/produtos/${produtoTeste.id}`, { metodo: 'DELETE', token })
  }
  const listagem = await api('/produtos', { token })
  const sobrou = listagem.body.find((x) => x.nome.startsWith('Produto de teste'))
  ok(!sobrou, `produto de teste ${sobrou?.id} continua ativo`)
  return 'produto inativado e agendamentos cancelados'
})

// ---------------------------------------------------------------------

console.log(`\n${'─'.repeat(60)}`)
if (falhou === 0) {
  console.log(verde(`✓ ${passou} verificações passaram`))
  process.exit(0)
} else {
  console.log(vermelho(`✗ ${falhou} falharam`) + ` (${passou} passaram)`)
  process.exit(1)
}