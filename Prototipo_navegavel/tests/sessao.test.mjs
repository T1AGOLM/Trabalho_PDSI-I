import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'

// Executa os módulos TS reais, com transpiler já existente no projeto.
// Não exige framework de testes novo; só a rede é simulada.
async function modulos() {
  const converter = texto => ts.transpileModule(texto, {
    compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.ESNext },
  }).outputText
  const url = texto => 'data:text/javascript;base64,' + Buffer.from(texto).toString('base64')
  const apiUrl = url(converter(await readFile(new URL('../src/api.ts', import.meta.url), 'utf8')) + '\n// ' + Math.random())
  const dados = converter(await readFile(new URL('../src/data.ts', import.meta.url), 'utf8')).replace("from './api'", 'from ' + JSON.stringify(apiUrl))
  const dadosUrl = url(dados)
  const utilitarios = converter(await readFile(new URL('../src/utils.ts', import.meta.url), 'utf8')).replace("from './data'", 'from ' + JSON.stringify(dadosUrl))
  return { dados: await import(dadosUrl), api: await import(apiUrl), utils: await import(url(utilitarios)) }
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status })
function respostaDe(caminho, id) {
  if (caminho.includes('/fidelidade')) return json({ clienteId: id, saldo: 0, extrato: [] })
  if (/\/clientes\/\d+$/.test(caminho)) return json({ id, nome: `Tutor ${id}`, email: `tutor${id}@example.com`, telefone: '', endereco: '' })
  if (caminho.includes('/pets/meus')) return json({ dados: [{ id, clienteId: id, nome: `Pet ${id}` }], pagina: 1, paginas: 1 })
  if (caminho.includes('/profissionais')) return json([])
  return json({ dados: [], pagina: 1, paginas: 1 })
}
const sessao = id => ({ id, perfil: 'CLIENTE', nome: `Tutor ${id}`, email: `tutor${id}@example.com` })

test('logout com falha de rede limpa todas as coleções e permite recarregar outro usuário do mesmo perfil', async t => {
  const { dados } = await modulos()
  let id = 1
  t.mock.method(globalThis, 'fetch', async caminho => {
    if (String(caminho).includes('/auth/logout')) throw new TypeError('rede indisponível')
    return respostaDe(String(caminho), id)
  })
  await dados.carregarDados(sessao(1))
  assert.equal(dados.db.clienteAtual.id, 1)
  await assert.doesNotReject(dados.sair())
  for (const valor of Object.values(dados.db)) assert.ok(valor === null || (Array.isArray(valor) && valor.length === 0))
  id = 2
  await dados.carregarDados(sessao(2))
  assert.equal(dados.db.clienteAtual.id, 2)
  assert.equal(dados.db.pets[0].nome, 'Pet 2')
})

test('resposta anterior ao logout não repovoa cache do novo usuário, mesmo ignorando abort', async t => {
  const { dados } = await modulos()
  let liberar
  const pendente = new Promise(resolve => { liberar = resolve })
  let id = 1
  let sinalAntigo
  t.mock.method(globalThis, 'fetch', async (caminho, opcoes) => {
    if (String(caminho).includes('/pets/meus') && id === 1) {
      sinalAntigo = opcoes.signal
      return pendente
    }
    return respostaDe(String(caminho), id)
  })
  const antiga = dados.carregarDados(sessao(1))
  await new Promise(resolve => setTimeout(resolve, 0))
  await dados.sair()
  id = 2
  await dados.carregarDados(sessao(2))
  liberar(json({ dados: [{ id: 1, clienteId: 1, nome: 'Pet antigo confidencial' }], pagina: 1, paginas: 1 }))
  await antiga
  assert.equal(sinalAntigo.aborted, true)
  assert.equal(dados.db.clienteAtual.id, 2)
  assert.deepEqual(dados.db.pets.map(p => p.nome), ['Pet 2'])
})

test('401 de requisição antiga é descartado sem renovar sessão após logout', async t => {
  const { api } = await modulos()
  let liberar
  let renovacoes = 0
  t.mock.method(globalThis, 'fetch', async caminho => {
    if (String(caminho).includes('/auth/refresh')) { renovacoes++; return json({}) }
    return new Promise(resolve => { liberar = resolve })
  })
  const antiga = api.api.produtos.listar()
  api.invalidarRequisicoes()
  liberar(json({ codigo: 'TOKEN_EXPIRADO' }, 401))
  await assert.rejects(antiga, err => err.name === 'AbortError')
  assert.equal(renovacoes, 0)
})

test('logout não tenta renovar a sessão quando a API responde 401', async t => {
  const { dados } = await modulos()
  let chamadas = 0
  t.mock.method(globalThis, 'fetch', async caminho => {
    chamadas++
    assert.ok(String(caminho).endsWith('/auth/logout'))
    return json({ codigo: 'SEM_TOKEN' }, 401)
  })
  await dados.sair()
  assert.equal(chamadas, 1)
})

test('novo login espera o logout pendente para não perder os cookies novos', async t => {
  const { dados } = await modulos()
  let liberar
  const chamadas = []
  t.mock.method(globalThis, 'fetch', async caminho => {
    chamadas.push(String(caminho))
    if (String(caminho).endsWith('/auth/logout')) return new Promise(resolve => { liberar = resolve })
    return json({ usuario: sessao(2) })
  })
  const logout = dados.sair()
  const login = dados.entrar('tutor2@example.com', 'Senha1234')
  await new Promise(resolve => setTimeout(resolve, 0))
  assert.equal(chamadas.length, 1)
  liberar(json({ encerrada: true }))
  await logout
  assert.equal((await login).id, 2)
  assert.equal(chamadas.length, 2)
})

test('horários da API são adaptados ao formato consumido pela tela', async t => {
  const { api } = await modulos()
  t.mock.method(globalThis, 'fetch', async caminho => {
    assert.ok(String(caminho).includes('/agenda/horarios-livres?'))
    return json(['09:00', '10:30'])
  })
  const resultado = await api.api.agendamentos.horariosLivres({ colaboradorId: 2, data: '2026-11-10' })
  assert.deepEqual(resultado, { colaboradorId: 2, data: '2026-11-10', duracao: 60, horarios: ['09:00', '10:30'] })
})
test('erro de validação preserva mensagem e detalhe para os formulários', async t => {
  const { api } = await modulos()
  t.mock.method(globalThis, 'fetch', async () => json({
    erro: 'Dados inválidos na requisição.', codigo: 'VALIDACAO',
    detalhe: 'preco: Informe um valor válido.',
    campos: [{ campo: 'preco', mensagem: 'Informe um valor válido.' }],
  }, 422))
  await assert.rejects(api.api.produtos.criar({ nome: 'Produto', preco: -1 }), err => {
    assert.equal(err.status, 422)
    assert.match(err.mensagem, /Dados inválidos.*preco: Informe um valor válido/)
    assert.equal(err.campos[0].campo, 'preco')
    return true
  })
})
test('calendário da agenda respeita data local, domingo e virada de ano', async () => {
  const { utils } = await modulos()
  assert.equal(utils.dataLocalISO(new Date(2026, 10, 9, 23, 45)), '2026-11-09')
  assert.deepEqual(utils.diasDaSemana('2027-01-01'), ['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03'])
  assert.equal(utils.diasDaSemana('2027-01-03')[0], '2026-12-28')
  assert.equal(utils.adicionarDias('2028-02-28', 1), '2028-02-29')
})