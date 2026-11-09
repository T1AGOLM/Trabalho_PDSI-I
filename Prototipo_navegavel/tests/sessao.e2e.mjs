import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import puppeteer from 'puppeteer-core'

// Navegador real + frontend compilado; somente a API é simulada.
// Rode o build antes. Não conecta ao PostgreSQL nem usa dados da equipe.
const raiz = fileURLToPath(new URL('../dist/', import.meta.url))
const chrome = process.env.CHROME_PATH ?? [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/usr/bin/chromium',
].find(p => existsSync(p))

test('sessões e redefinição no navegador real com API simulada', { timeout: 60_000 }, async t => {
  assert.ok(chrome, 'Defina CHROME_PATH com um Chrome/Edge instalado.')
  const server = createServer(async (req, res) => {
    try {
      const nome = decodeURIComponent(new URL(req.url, 'http://local').pathname)
      const arquivo = path.resolve(raiz, '.' + (nome === '/' ? '/index.html' : nome))
      if (!arquivo.startsWith(raiz)) { res.writeHead(403).end(); return }
      const tipos = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' }
      const conteudo = await readFile(arquivo)
      res.writeHead(200, { 'Content-Type': tipos[path.extname(arquivo)] ?? 'application/octet-stream' })
      res.end(conteudo)
    } catch { res.writeHead(404).end() }
  })
  server.listen(0, '127.0.0.1')
  await new Promise(resolve => server.once('listening', resolve))
  let browser
  t.after(async () => {
    if (browser) await browser.close()
    server.closeAllConnections()
    await new Promise(resolve => server.close(resolve))
  })
  browser = await puppeteer.launch({ executablePath: chrome, headless: true, pipe: true, timeout: 15_000,
    // Apenas o navegador isolado de testes; não altera a segurança do app.
    args: ['--no-first-run', '--disable-extensions', '--disable-crash-reporter', '--disable-breakpad', '--no-sandbox'] })
  const page = await browser.newPage()
  page.setDefaultTimeout(12_000)
  let usuario = null
  let logouts = 0
  let logins = 0
  let redefinicao = null
  let demonstracao = true
  let atualizacaoCliente = null
  let liberarAgendaAntiga
  let sinalizarAgendaAntiga
  const agendaAntigaIniciada = new Promise(resolve => { sinalizarAgendaAntiga = resolve })
  let falharAgenda = false
  let testeAtendimentos = false
  const clienteSemContato = { id: 10, nome: 'Tutor sem contato', email: 'semcontato@example.com', telefone: null, endereco: null, ativo: true, pontosFidelidade: 0 }
  const erros = []
  page.on('pageerror', err => erros.push(err.message))
  await page.setRequestInterception(true)
  page.on('request', async req => {
    const url = new URL(req.url())
    if (!url.pathname.startsWith('/api/')) { await req.continue(); return }
    const caminho = url.pathname.slice(4)
    const responder = (body, status = 200) => req.respond({ status, contentType: 'application/json', body: JSON.stringify(body) })
    if (caminho === '/auth/eu' || caminho === '/auth/refresh') return responder({ codigo: 'SEM_TOKEN' }, 401)
    if (caminho === '/auth/login') {
      logins++
      const body = JSON.parse(req.postData())
      const id = body.email.startsWith('primeiro') ? 1 : 2
      usuario = { id, nome: id === 1 ? 'Primeiro Tutor' : 'Segundo Tutor', email: body.email, perfil: body.email.startsWith('gestor') ? 'GESTOR' : body.email.startsWith('colaborador') ? 'COLABORADOR' : 'CLIENTE', petshopId: 1 }
      return responder({ usuario })
    }
    if (caminho === '/auth/logout') { logouts++; usuario = null; return req.abort('failed') }
    if (caminho === '/auth/redefinir-senha') {
      redefinicao = JSON.parse(req.postData())
      return responder({ redefinida: true })
    }
    if (caminho === '/auth/recuperar-senha') {
      return responder({ enviado: true, ...(demonstracao ? { token: 'token-de-teste-comprido' } : {}) })
    }
    if (caminho === '/agendamentos') {
      const de = url.searchParams.get('de')
      if (falharAgenda) return responder({ erro: 'Consulta da agenda indisponível. Tente novamente.' }, 500)
      const evento = { id: 901, petId: 10, clienteId: 10, colaboradorId: 2, servicoId: 1, status: 'confirmado', dataHora: '2027-01-04T09:30' }
      if (testeAtendimentos) return responder({ dados: de === '2027-01-04' ? [evento] : [], paginas: 1 })
      if (!de) return responder({ dados: [], paginas: 1 })
      if (de === '2027-01-04') return responder({ dados: [evento], paginas: 1 })
      sinalizarAgendaAntiga()
      return new Promise(resolve => { liberarAgendaAntiga = () => resolve(responder({ dados: [{ ...evento, id: 900, dataHora: de + 'T09:00' }], paginas: 1 })) })
    }
    if (caminho === '/clientes/10' && req.method() === 'PATCH') {
      atualizacaoCliente = JSON.parse(req.postData())
      return responder({ ...clienteSemContato, ...atualizacaoCliente })
    }
    if (caminho === '/clientes') return responder({ dados: [clienteSemContato], pagina: 1, paginas: 1 })
    if (caminho === '/pets') return responder({ dados: [{ id: 10, clienteId: 10, nome: 'Pet sem raça', raca: null, ativo: true }], pagina: 1, paginas: 1 })
    if (caminho.includes('/fidelidade')) return responder({ clienteId: usuario.id, saldo: 0, extrato: [] })
    if (/^\/clientes\/\d+$/.test(caminho)) return responder({ ...usuario, telefone: '11999999999', endereco: '', pontosFidelidade: 0 })
    if (caminho === '/profissionais') return responder([])
    if (caminho === '/pets/meus') return responder({ dados: [{ id: usuario.id, clienteId: usuario.id, nome: `Pet do ${usuario.nome}`, especie: 'Cachorro', raca: 'SRD', porte: 'Pequeno', idade: 2, observacoesSaude: '' }], pagina: 1, paginas: 1 })
    return responder({ dados: [], pagina: 1, paginas: 1 })
  })
  const base = `http://127.0.0.1:${server.address().port}`
  await page.goto(base + '/#/login')
  await page.waitForSelector('input[type="email"]')
  for (const perfil of ['Gestor', 'Colaborador', 'Cliente (tutor)']) {
    await page.type('input[type="email"]', 'rascunho@example.com')
    await page.type('input[type="password"]', 'Rascunho123')
    await page.evaluate(texto => [...document.querySelectorAll('button')].find(b => b.textContent.includes(texto)).click(), perfil)
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)))
    assert.equal(logins, 0, `selecionar ${perfil} não deve autenticar automaticamente`)
    assert.equal(await page.$eval('input[type="email"]', i => i.value), '')
    assert.equal(await page.$eval('input[type="password"]', i => i.value), '')
  }
  assert.equal(await page.evaluate(() => /(?:gestor|colab|cliente)@petplus\.com|senha: 123/.test(document.body.innerText)), false)
  await page.type('input[type="email"]', 'primeiro@example.com')
  await page.type('input[type="password"]', 'Senha1234')
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => location.hash === '#/cli-inicio')
  assert.equal(logouts, 0, 'abrir o login público não deve chamar logout')
  await page.evaluate(() => { location.hash = '#/cli-perfil' })
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === 'Primeiro Tutor'))
  await page.click('.user-chip')
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Sair da conta')).click())
  await page.waitForSelector('input[type="email"]')
  await page.waitForFunction(() => location.hash === '#/login')
  assert.equal(await page.evaluate(() => document.body.innerText.includes('Primeiro Tutor')), false)
  await page.type('input[type="email"]', 'segundo@example.com')
  await page.type('input[type="password"]', 'Senha1234')
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => location.hash === '#/cli-inicio')
  assert.equal(logouts, 1)
  assert.equal(await page.evaluate(() => document.body.innerText.includes('Primeiro Tutor')), false)
  await page.evaluate(() => { location.hash = '#/cli-perfil' })
  await page.waitForFunction(() => [...document.querySelectorAll('input')].some(i => i.value === 'Segundo Tutor'))
  await page.click('.user-chip')
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Sair da conta')).click())
  await page.waitForFunction(() => location.hash === '#/login')
  await page.evaluate(() => { location.hash = '#/recuperar-senha' })
  await page.waitForSelector('input[type="email"]')
  await page.type('input[type="email"]', 'primeiro@example.com')
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => document.body.innerText.includes('Continuar redefinição em modo de demonstração'))
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Continuar redefinição')).click())
  await page.waitForFunction(() => document.querySelectorAll('input[type="password"]').length === 2)
  const campos = await page.$$('input[type="password"]')
  await campos[0].type('NovaSenha123')
  await campos[1].type('NovaSenha123')
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => location.hash === '#/login')
  assert.deepEqual(redefinicao, { token: 'token-de-teste-comprido', senha: 'NovaSenha123' })
  demonstracao = false
  await page.evaluate(() => { location.hash = '#/recuperar-senha' })
  await page.waitForSelector('input[type="email"]')
  await page.type('input[type="email"]', 'primeiro@example.com')
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => document.body.innerText.includes('Solicitação registrada'))
  assert.equal(await page.evaluate(() => document.body.innerText.includes('Continuar redefinição')), false)
  // Regressão: valores opcionais nulos não podem derrubar a lista, busca ou edição.
  await page.evaluate(() => { location.hash = '#/login' })
  await page.waitForSelector('input[type="email"]')
  await page.type('input[type="email"]', 'gestor@example.com')
  await page.type('input[type="password"]', 'Senha1234')
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => location.hash === '#/dashboard')
  await page.evaluate(() => { location.hash = '#/clientes' })
  await page.waitForFunction(() => document.querySelector('main')?.innerText.includes('Tutor sem contato'))
  await page.type('.search-box input', 'busca-sem-correspondencia')
  await page.waitForFunction(() => document.body.innerText.includes('Nenhum cliente encontrado'))
  await page.focus('.search-box input')
  await page.keyboard.down('Control')
  await page.keyboard.press('A')
  await page.keyboard.up('Control')
  await page.keyboard.press('Backspace')
  await page.waitForFunction(() => !!document.querySelector('tbody button'))
  await page.evaluate(() => [...document.querySelectorAll('tbody button')].find(b => b.textContent === 'Editar').click())
  await page.waitForSelector('.modal input')
  const valores = await page.$$eval('.modal input', inputs => inputs.map(i => i.value))
  assert.equal(valores[2], '', 'telefone nulo é apresentado como campo vazio')
  assert.equal(valores[4], '', 'endereço nulo é apresentado como campo vazio')
  await page.evaluate(() => [...document.querySelectorAll('.modal button')].find(b => b.textContent === 'Salvar').click())
  await page.waitForFunction(() => !document.querySelector('.modal'))
  assert.equal(Object.hasOwn(atualizacaoCliente, 'telefone'), false, 'telefone ausente não é enviado como null')
  assert.equal(atualizacaoCliente.endereco, '')
  // Uma semana antiga que responde depois não pode substituir a semana escolhida.
  await page.evaluate(() => { location.hash = '#/agenda' })
  await page.waitForSelector('input[aria-label="Data da agenda"]')
  await agendaAntigaIniciada
  await page.evaluate(() => {
    const input = document.querySelector('input[aria-label="Data da agenda"]')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2027-01-04')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.waitForSelector('[data-agendamento-id="901"]')
  assert.match(await page.$eval('[data-agendamento-id="901"]', e => e.innerText), /09:30/)
  const antiga = page.waitForResponse(r => new URL(r.url()).pathname === '/api/agendamentos' && new URL(r.url()).searchParams.has('de') && new URL(r.url()).searchParams.get('de') !== '2027-01-04')
  liberarAgendaAntiga()
  await antiga
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  assert.ok(await page.$('[data-agendamento-id="901"]'), 'resposta antiga não deve remover a reserva da semana atual')
  falharAgenda = true
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent === 'Atualizar agenda').click())
  await page.waitForFunction(() => document.querySelector('[role="alert"]')?.textContent.includes('Consulta da agenda indisponível'))
  // Atendimentos abre no dia local atual e consulta novamente ao trocar a data.
  falharAgenda = false
  testeAtendimentos = true
  await page.evaluate(() => { location.hash = '#/login' })
  await page.waitForSelector('input[type="email"]')
  await page.type('input[type="email"]', 'colaborador@example.com')
  await page.type('input[type="password"]', 'Senha1234')
  await page.click('button[type="submit"]')
  await page.waitForFunction(() => location.hash === '#/colab-agenda')
  await page.evaluate(() => { location.hash = '#/colab-atendimentos' })
  await page.waitForSelector('input[aria-label="Data dos atendimentos"]')
  assert.equal(await page.$eval('input[aria-label="Data dos atendimentos"]', input => {
    const hoje = new Date()
    return input.value === `${hoje.getFullYear()}-${String(hoje.getMonth()+1).padStart(2,'0')}-${String(hoje.getDate()).padStart(2,'0')}`
  }), true)
  await page.evaluate(() => {
    const input = document.querySelector('input[aria-label="Data dos atendimentos"]')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '2027-01-04')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await page.waitForFunction(() => document.querySelector('tbody')?.innerText.includes('09:30'))
  assert.equal(await page.evaluate(() => document.querySelector('.page-head .sub').textContent.includes('04/01/2027')), true)
  await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.includes('Próximo dia')).click())
  await page.waitForFunction(() => document.body.innerText.includes('Nenhum atendimento nesta data'))
  assert.equal(await page.$eval('input[aria-label="Data dos atendimentos"]', i => i.value), '2027-01-05')
  assert.deepEqual(erros, [], 'não deve haver erros de execução React')
})
