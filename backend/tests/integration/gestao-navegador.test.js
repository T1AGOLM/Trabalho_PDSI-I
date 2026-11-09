import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import { mkdtemp, rm, mkdir } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'

const habilitado = process.env.PETPLUS_BANCO_TESTE === '1' && /test/i.test(process.env.DB_NAME ?? '')
const FRONT = process.env.FRONT_URL ?? 'http://localhost:5173'
const API = process.env.API_URL ?? 'http://localhost:3333/api'
const chrome = process.env.CHROME_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/chromium'].find(existsSync)
async function resposta(caminho, token, corpo, metodo = corpo ? 'POST' : 'GET') {
  return fetch(API+caminho, { method: metodo, headers: { ...(token ? { Authorization: 'Bearer '+token } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) })
}
async function chamar(...args) {
  const res = await resposta(...args)
  const body = await res.json()
  assert.ok(res.ok, `${args[0]}: ${res.status} ${JSON.stringify(body)}`)
  return body
}
async function clicar(page, texto, seletor = 'button') {
  await page.waitForFunction((t,s) => [...document.querySelectorAll(s)].some(b => b.textContent.includes(t) && !b.disabled), {}, texto, seletor)
  await page.evaluate((t,s) => [...document.querySelectorAll(s)].find(b => b.textContent.includes(t) && !b.disabled).click(), texto, seletor)
}
async function preencher(page, seletor, valor) {
  await page.$eval(seletor, (el, v) => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)
    el.dispatchEvent(new Event('input', { bubbles: true }))
    el.dispatchEvent(new Event('change', { bubbles: true }))
  }, String(valor))
}

test('gestão integrada: painel, configurações, relatórios, inativação e observações reais', { skip: !habilitado, timeout: 150_000 }, async t => {
  assert.ok(chrome, 'Configure CHROME_PATH.')
  assert.equal((await chamar('/health')).ambiente, 'test')
  const gestor = await chamar('/auth/login', null, { email: 'gestor@petplus.com', senha: '123' })
  const original = await chamar('/petshop', gestor.token)
  const marca = Date.now()
  const tutor = await chamar('/auth/cadastro', null, { nome: 'Tutor gestão '+marca, email: `gestao-${marca}@petplus.test`, senha: 'GestaoTeste123', consentimento: true,
    pet: { nome: 'PetGestao'+marca, especie: 'Cachorro', observacoesSaude: 'Observação real exclusiva '+marca } })
  const pet = (await chamar('/pets/meus', tutor.token)).dados[0]
  const outroPet = await chamar('/pets', tutor.token, { clienteId: tutor.usuario.id, nome: 'PetInativoAntes'+marca })
  const colaborador = await chamar('/colaboradores', gestor.token, { nome: 'Profissional gestão', email: `colab-gestao-${marca}@petplus.test`, senha: 'GestaoTeste123', cargo: 'BANHISTA', disponibilidade: Array.from({ length:7 }, (_,diaSemana) => ({ diaSemana, horaInicio:'08:00', horaFim:'18:00' })) })
  const colab = await chamar('/auth/login', null, { email: `colab-gestao-${marca}@petplus.test`, senha: 'GestaoTeste123' })
  const downloads = await mkdtemp(join(tmpdir(), 'petplus-gestao-'))
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, pipe: true, args: ['--no-sandbox', '--disable-gpu'] })
  const erros = []
  const captura = async (pagina, nome) => {
    if (!process.env.PETPLUS_CAPTURAS) return
    await mkdir(process.env.PETPLUS_CAPTURAS, { recursive:true })
    await pagina.screenshot({ path:join(process.env.PETPLUS_CAPTURAS, nome+'.png'), fullPage:true })
  }
  let venda, reserva
  t.after(async () => {
    await browser.close()
    await chamar('/petshop', gestor.token, { nome: original.nome, ...(original.email ? { email:original.email } : {}), telefone: original.telefone ?? '', endereco: original.endereco ?? '', prazoEstornoDias: original.prazoEstornoDias, antecedenciaLembreteH: original.antecedenciaLembreteH, antecedenciaValidadeD: original.antecedenciaValidadeD, pontosPorReal: original.pontosPorReal }, 'PATCH')
    if (venda) await chamar(`/vendas/${venda.id}/estornar`, gestor.token, { motivo: 'Limpeza da venda exclusiva do teste de gestão' })
    if (reserva) await chamar(`/agendamentos/${reserva.id}/cancelar`, gestor.token, { motivo: 'Limpeza da reserva exclusiva de teste' }, 'PATCH')
    await rm(downloads, { recursive:true, force:true })
    for (const sessao of [gestor,tutor,colab]) await chamar('/auth/logout', sessao.token, { refreshToken:sessao.refreshToken })
  })
  const contexto = await browser.createBrowserContext()
  await browser.defaultBrowserContext().overridePermissions(FRONT, [])
  const cdp = await browser.target().createCDPSession()
  await cdp.send('Browser.setDownloadBehavior', { behavior:'allow', downloadPath:downloads, browserContextId:contexto.id })
  const page = await contexto.newPage()
  await page.setViewport({ width:1366, height:900 }); page.setDefaultTimeout(15_000)
  page.on('pageerror', e => erros.push(e.message))
  await page.goto(FRONT+'/#/login', { waitUntil:'networkidle0' })
  await page.type('input[type=email]', 'gestor@petplus.com'); await page.type('input[type=password]', '123')
  await page.click('button[type=submit]'); await page.waitForSelector('.sidebar')

  // O painel acompanha a venda líquida e o estorno, sem descontar duas vezes.
  const antes = await chamar('/dashboard', gestor.token)
  const produto = (await chamar('/produtos?limite=100', gestor.token)).dados.find(p => p.ativo && p.quantidadeEstoque > 0)
  assert.ok(produto)
  venda = await chamar('/vendas', gestor.token, { desconto:10, itens:[{ produtoId:produto.id, quantidade:1, precoUnitario:133.45 }], pagamentos:[{ formaPagamento:'PIX', valor:123.45 }] })
  const painel = await chamar('/dashboard', gestor.token)
  assert.ok(Math.abs(painel.faturamento.hoje - antes.faturamento.hoje - 123.45) < 0.001)
  assert.equal(painel.serie.length, 7)
  assert.ok(Math.abs(painel.serie.at(-1).faturamento - painel.faturamento.hoje) < 0.001)
  await page.goto(FRONT+'/#/dashboard', { waitUntil:'networkidle0' })
  await page.waitForFunction(nome => document.querySelector('.page-head').innerText.includes(nome), {}, original.nome)
  assert.equal(await page.$eval('main', el => /\+12%|72%|12\/09\/2026/.test(el.innerText)), false)

  await captura(page, 'dashboard')

  // Configurações persistem após salvar e recarregar.
  await page.goto(FRONT+'/#/configuracoes', { waitUntil:'networkidle0' })
  await page.waitForSelector('input[aria-label="Nome do petshop"]')
  const nome = 'Unidade validada '+marca
  await preencher(page, 'input[aria-label="Nome do petshop"]', nome)
  await preencher(page, 'input[aria-label="Prazo de estorno"]', 30)
  await page.setRequestInterception(true)
  const falharSalvamento = req => {
    if (new URL(req.url()).pathname === '/api/petshop' && req.method() === 'PATCH') {
      return req.respond({ status:503, contentType:'application/json', body:JSON.stringify({ erro:'Falha simulada ao salvar configurações.' }) })
    }
    return req.continue()
  }
  page.on('request', falharSalvamento)
  await clicar(page, 'Salvar alterações')
  await page.waitForFunction(() => document.querySelector('[role=alert]')?.innerText.includes('Falha simulada'))
  assert.equal((await chamar('/petshop', gestor.token)).nome, original.nome)
  assert.equal(await page.$eval('input[aria-label="Nome do petshop"]', el => el.value), nome)
  await page.setRequestInterception(false)
  page.off('request', falharSalvamento)
  const salvou = page.waitForResponse(r => new URL(r.url()).pathname === '/api/petshop' && r.request().method() === 'PATCH')
  await clicar(page, 'Salvar alterações')
  assert.equal((await salvou).status(), 200)
  await page.reload({ waitUntil:'networkidle0' })
  await page.waitForFunction(n => document.querySelector('input[aria-label="Nome do petshop"]')?.value === n, {}, nome)
  assert.equal((await chamar('/petshop', gestor.token)).prazoEstornoDias, 30)
  await captura(page, 'configuracoes')
  assert.equal((await resposta('/petshop', colab.token, { nome:'Não permitido' }, 'PATCH')).status, 403)

  // Prévia dos quatro tipos, período vazio/inválido, download real e metadados.
  await page.goto(FRONT+'/#/relatorios', { waitUntil:'networkidle0' })
  await page.waitForSelector('select[aria-label="Tipo de relatório"]')
  for (const tipo of ['vendas','agendamentos','estoque','financeiro']) {
    await page.select('select[aria-label="Tipo de relatório"]', tipo)
    const previa = page.waitForResponse(r => new URL(r.url()).pathname === '/api/relatorios/previa')
    await clicar(page, 'Consultar prévia'); assert.equal((await previa).status(), 200)
    await page.waitForFunction(() => !document.querySelector('[role=status]'))
  }
  await page.select('select[aria-label="Tipo de relatório"]', 'vendas')
  await preencher(page, 'input[aria-label="Data inicial do relatório"]', '2000-01-02')
  await preencher(page, 'input[aria-label="Data final do relatório"]', '2000-01-01')
  await clicar(page, 'Consultar prévia')
  await page.waitForFunction(() => document.querySelector('[role=alert]')?.innerText.includes('período válido'))
  await preencher(page, 'input[aria-label="Data inicial do relatório"]', '2000-01-01')
  await clicar(page, 'Consultar prévia')
  await page.waitForFunction(() => document.body.innerText.includes('Nenhum registro encontrado'))
  await preencher(page, 'input[aria-label="Data inicial do relatório"]', painel.dataReferencia)
  await preencher(page, 'input[aria-label="Data final do relatório"]', painel.dataReferencia)
  await page.evaluate(() => {
    const original = URL.createObjectURL.bind(URL)
    URL.createObjectURL = blob => { window.__arquivoDoTeste = blob; return original(blob) }
  })
  for (const formato of ['PDF','CSV']) {
    await page.evaluate(() => { window.__arquivoDoTeste = null })
    const download = page.waitForResponse(r => new URL(r.url()).pathname === '/api/relatorios/exportar' && new URL(r.url()).searchParams.get('formato') === formato)
    await clicar(page, 'Baixar '+formato)
    const res = await download; assert.equal(res.status(), 200)
    await page.waitForFunction(() => window.__arquivoDoTeste instanceof Blob)
    const conteudo = Buffer.from(await page.evaluate(async () => [...new Uint8Array(await window.__arquivoDoTeste.arrayBuffer())]))
    if (formato === 'PDF') assert.equal(conteudo.subarray(0,4).toString(), '%PDF')
    else assert.match(conteudo.toString('utf8'), /Pagamento/)
    await page.waitForFunction(() => !document.querySelector('[role=status]'))
  }
  await clicar(page, 'Consultar prévia')
  await page.waitForFunction(() => !document.querySelector('[role=status]'))
  await captura(page, 'relatorios')
  const historico = (await chamar('/relatorios?limite=100', gestor.token)).dados
  assert.ok(historico.some(r => r.formato === 'PDF' && r.periodo.includes(painel.dataReferencia)))
  assert.equal((await resposta('/relatorios/previa?tipo=vendas', colab.token)).status, 403)

  // Observações exibidas vêm do pet, sem texto clínico de demonstração.
  const servico = (await chamar('/servicos?limite=100', gestor.token)).dados.find(s => s.ativo)
  const dia = new Date(); dia.setDate(dia.getDate()+1)
  const data = `${dia.getFullYear()}-${String(dia.getMonth()+1).padStart(2,'0')}-${String(dia.getDate()).padStart(2,'0')}`
  const livres = await chamar(`/agenda/horarios-livres?colaboradorId=${colaborador.id}&data=${data}&duracao=${servico.duracao}`, gestor.token)
  reserva = await chamar('/agendamentos', gestor.token, { petId:pet.id, servicoId:servico.id, colaboradorId:colaborador.id, dataHora:data+'T'+livres[0] })
  // Usa um contexto autenticado pelo colaborador para consultar a fila.
  const ctxColab = await browser.createBrowserContext(); const pc = await ctxColab.newPage()
  await pc.setViewport({width:1366,height:900})
  pc.on('pageerror', e => erros.push(e.message))
  await pc.goto(FRONT+'/#/login', {waitUntil:'networkidle0'})
  await pc.type('input[type=email]', `colab-gestao-${marca}@petplus.test`); await pc.type('input[type=password]', 'GestaoTeste123'); await pc.click('button[type=submit]'); await pc.waitForSelector('.sidebar')
  await pc.goto(FRONT+'/#/colab-atendimentos', {waitUntil:'networkidle0'})
  await preencher(pc, 'input[aria-label="Data dos atendimentos"]', data)
  await pc.waitForFunction(m => document.body.innerText.includes('Observação real exclusiva '+m), {}, marca)
  assert.equal(await pc.$eval('main', el => /sedação leve|Check-in rápido/.test(el.innerText)), false)
  await captura(pc, 'atendimentos')
  await ctxColab.close()

  // RN03: colaborador/cliente não inativam pets; reativação mantém decisão individual.
  for (const token of [colab.token,tutor.token]) {
    assert.equal((await resposta(`/pets/${pet.id}`, token, null, 'DELETE')).status, 403)
    assert.equal((await resposta(`/pets/${pet.id}/reativar`, token, {}, 'POST')).status, 403)
    assert.equal((await resposta(`/clientes/${tutor.usuario.id}`, token, null, 'DELETE')).status, 403)
  }
  await chamar(`/pets/${outroPet.id}`, gestor.token, null, 'DELETE')
  await page.goto(FRONT+'/#/clientes', {waitUntil:'networkidle0'})
  const acaoTutor = async texto => page.evaluate((email,t) => [...document.querySelectorAll('tbody tr')].find(tr => tr.innerText.includes(email)).querySelectorAll('button').forEach(b => { if(b.textContent === t) b.click() }), tutor.usuario.email, texto)
  await acaoTutor('Inativar'); await clicar(page, 'Inativar', '.modal button')
  await page.waitForFunction(email => {
    const linha = [...document.querySelectorAll('tbody tr')].find(tr => tr.innerText.includes(email))
    return linha && [...linha.querySelectorAll('button')].some(b => b.textContent === 'Reativar')
  }, {}, tutor.usuario.email)
  assert.equal((await resposta('/auth/eu', tutor.token)).status, 401)
  assert.equal((await resposta(`/pets/${pet.id}/reativar`, gestor.token, {}, 'POST')).status, 422)
  await acaoTutor('Reativar'); await clicar(page, 'Reativar', '.modal button')
  await page.waitForFunction(email => [...document.querySelectorAll('tbody tr')].find(tr => tr.innerText.includes(email))?.innerText.includes('Ativo'), {}, tutor.usuario.email)
  let pets = (await chamar(`/pets?clienteId=${tutor.usuario.id}`, gestor.token)).dados
  assert.ok(pets.every(p => p.ativo === false))
  await clicar(page, 'Pets (', '.tabs button')
  await page.evaluate(nome => [...document.querySelectorAll('tbody tr')].find(tr => tr.innerText.includes(nome)).querySelectorAll('button').forEach(b => { if(b.textContent === 'Reativar') b.click() }), pet.nome)
  await clicar(page, 'Reativar', '.modal button')
  await page.waitForFunction(nome => [...document.querySelectorAll('tbody tr')].find(tr => tr.innerText.includes(nome))?.innerText.includes('Ativo'), {}, pet.nome)
  pets = (await chamar(`/pets?clienteId=${tutor.usuario.id}`, gestor.token)).dados
  assert.equal(pets.find(p => p.id === pet.id).ativo, true)
  assert.equal(pets.find(p => p.id === outroPet.id).ativo, false)
  await captura(page, 'clientes')
  assert.deepEqual(erros, [])
  console.log('Painel com venda líquida; configurações persistentes; prévias e arquivos PDF/CSV; histórico; observações reais; inativação/reativação e bloqueios por perfil aprovados.')
})
