import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync } from 'node:fs'
import puppeteer from 'puppeteer-core'

// Integração que grava dados: somente com API ligada à cópia exclusiva de testes.
const habilitado = process.env.PETPLUS_BANCO_TESTE === '1' && /test/i.test(process.env.DB_NAME ?? '')
const FRONT = process.env.FRONT_URL ?? 'http://localhost:5173'
const API = process.env.API_URL ?? 'http://localhost:3333/api'
const chrome = process.env.CHROME_PATH ?? ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/usr/bin/google-chrome', '/usr/bin/chromium'].find(existsSync)
const local = data => `${data.getFullYear()}-${String(data.getMonth()+1).padStart(2,'0')}-${String(data.getDate()).padStart(2,'0')}`

async function chamar(caminho, token, corpo, metodo = corpo ? 'POST' : 'GET') {
  const resposta = await fetch(API + caminho, { method: metodo, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(corpo ? { 'Content-Type': 'application/json' } : {}) }, ...(corpo ? { body: JSON.stringify(corpo) } : {}) })
  const dados = await resposta.json()
  assert.ok(resposta.ok, `${metodo} ${caminho}: HTTP ${resposta.status} ${dados.erro ?? ''}`)
  return dados
}
async function clicar(page, texto) {
  await page.waitForFunction(t => [...document.querySelectorAll('button')].some(b => b.textContent.includes(t) && !b.disabled), {}, texto)
  await page.evaluate(t => [...document.querySelectorAll('button')].find(b => b.textContent.includes(t) && !b.disabled).click(), texto)
}
async function dataDaAgenda(page, dia) {
  await page.waitForSelector('input[aria-label="Data da agenda"]')
  await page.evaluate(valor => {
    const input = document.querySelector('input[aria-label="Data da agenda"]')
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, valor)
    input.dispatchEvent(new Event('input', { bubbles: true }))
    input.dispatchEvent(new Event('change', { bubbles: true }))
  }, dia)
}

test('reserva feita pelo cliente aparece na semana do gestor e do profissional responsável', { skip: !habilitado, timeout: 120_000 }, async t => {
  assert.ok(chrome, 'Configure CHROME_PATH.')
  const saude = await chamar('/health')
  assert.equal(saude.ambiente, 'test', 'A API também deve estar em NODE_ENV=test e conectada à cópia de testes.')
  const erros = []
  const gestor = await chamar('/auth/login', null, { email: 'gestor@petplus.com', senha: '123' })
  const emailProfissional = `agenda-${Date.now()}@petplus.test`
  await chamar('/colaboradores', gestor.token, {
    nome: 'Profissional do teste de agendas', email: emailProfissional, senha: 'AgendaTeste123', cargo: 'BANHISTA',
    disponibilidade: Array.from({ length: 7 }, (_, diaSemana) => ({ diaSemana, horaInicio: '08:00', horaFim: '18:00' })),
  })
  const profissional = await chamar('/auth/login', null, { email: emailProfissional, senha: 'AgendaTeste123' })
  const cliente = await chamar('/auth/login', null, { email: 'cliente@petplus.com', senha: '123' })
  const servicos = (await chamar('/servicos?limite=100', cliente.token)).dados
  const pets = (await chamar('/pets/meus?limite=100', cliente.token)).dados
  const servico = servicos.find(s => s.ativo)
  const pet = pets.find(p => p.ativo)
  assert.ok(servico && pet, 'A cópia precisa de serviço e pet ativos.')
  let slot
  for (let n=1; n<14 && !slot; n++) {
    const data = new Date(); data.setDate(data.getDate()+n)
    const dia = local(data)
    const livres = await chamar(`/agenda/horarios-livres?colaboradorId=${profissional.usuario.id}&data=${dia}&duracao=${servico.duracao}`, cliente.token)
    const hora = livres.find(h => h.endsWith(':30'))
    if (hora) slot = { dia, hora }
  }
  assert.ok(slot, 'A cópia precisa de disponibilidade para o profissional do teste nos próximos 13 dias.')
  const browser = await puppeteer.launch({ executablePath: chrome, headless: true, pipe: true, args: ['--no-sandbox', '--disable-gpu'] })
  let criado
  const reservas = []
  t.after(async () => {
    await browser.close()
    for (const reserva of reservas) {
      const atual = await chamar(`/agendamentos/${reserva}`, gestor.token)
      if (atual.status === 'confirmado') await chamar(`/agendamentos/${reserva}/cancelar`, gestor.token, { motivo: 'Limpeza da reserva exclusiva do teste de agendas' }, 'PATCH')
    }
    for (const sessao of [gestor, profissional, cliente]) await chamar('/auth/logout', sessao.token, { refreshToken: sessao.refreshToken })
  })
  async function entrar(nome, senha = '123') {
    const contexto = await browser.createBrowserContext()
    const page = await contexto.newPage()
    await page.setViewport({ width: 1366, height: 900 })
    page.on('pageerror', e => erros.push(e.message))
    page.setDefaultTimeout(15_000)
    await page.goto(FRONT+'/#/login', { waitUntil: 'networkidle0' })
    await page.type('input[type=email]', nome.includes('@') ? nome : nome+'@petplus.com')
    await page.type('input[type=password]', senha)
    await page.click('button[type=submit]')
    await page.waitForSelector('.sidebar')
    return { page, contexto }
  }
  const tutor = await entrar('cliente')
  await tutor.page.goto(FRONT+'/#/cli-agendar', { waitUntil: 'networkidle0' })
  const selects = await tutor.page.$$('main select')
  await selects[0].select(String(pet.id)); await selects[1].select(String(servico.id))
  await clicar(tutor.page, 'Continuar')
  await tutor.page.select('main select', String(profissional.usuario.id))
  await clicar(tutor.page, `${slot.dia.slice(8,10)}/${slot.dia.slice(5,7)}`)
  await clicar(tutor.page, 'Ver horários')
  await clicar(tutor.page, slot.hora)
  const resposta = tutor.page.waitForResponse(r => new URL(r.url()).pathname === '/api/agendamentos' && r.request().method() === 'POST')
  await clicar(tutor.page, 'Confirmar agendamento')
  const r = await resposta
  assert.equal(r.status(), 201)
  criado = (await r.json()).id
  reservas.push(criado)
  await tutor.page.waitForFunction(() => location.hash === '#/cli-agendamentos')
  assert.ok((await chamar('/agendamentos?limite=100', cliente.token)).dados.some(a => a.id === criado))
  await tutor.contexto.close()

  const admin = await entrar('gestor')
  await admin.page.goto(FRONT+'/#/agenda', { waitUntil: 'networkidle0' })
  await dataDaAgenda(admin.page, slot.dia)
  const evento = `[data-agendamento-id="${criado}"]`
  await admin.page.waitForSelector(evento)
  assert.match(await admin.page.$eval(evento, e => e.innerText), new RegExp(slot.hora))
  await clicar(admin.page, 'Semana anterior')
  await admin.page.waitForFunction(sel => !document.querySelector(sel), {}, evento)
  await clicar(admin.page, 'Próxima semana')
  await admin.page.waitForSelector(evento)
  await admin.page.select('select[aria-label="Status"]', 'cancelado')
  await admin.page.waitForFunction(sel => !document.querySelector(sel), {}, evento)
  await admin.page.select('select[aria-label="Status"]', 'confirmado')
  await admin.page.waitForSelector(evento)
  await admin.contexto.close()

  const colab = await entrar(emailProfissional, 'AgendaTeste123')
  await colab.page.goto(FRONT+'/#/colab-agenda', { waitUntil: 'networkidle0' })
  await dataDaAgenda(colab.page, slot.dia)
  await colab.page.waitForSelector(evento)
  const ids = await colab.page.$$eval('[data-agendamento-id]', elementos => elementos.map(e => Number(e.dataset.agendamentoId)))
  const esperados = (await chamar(`/agendamentos?colaboradorId=${profissional.usuario.id}&limite=100`, profissional.token)).dados.map(a=>a.id)
  assert.ok(ids.every(id => esperados.includes(id)), 'A agenda pessoal não deve incluir outro profissional.')
  await colab.page.click(evento)
  await clicar(colab.page, 'Marcar como concluído')
  await colab.page.waitForSelector(evento+'.ev-concluído')
  assert.equal((await chamar(`/agendamentos/${criado}`, gestor.token)).status, 'concluído')
  await colab.page.reload({ waitUntil: 'networkidle0' })
  await dataDaAgenda(colab.page, slot.dia)
  await colab.page.waitForSelector(evento+'.ev-concluído')
  const outrasHoras = await chamar(`/agenda/horarios-livres?colaboradorId=${profissional.usuario.id}&data=${slot.dia}&duracao=${servico.duracao}`, cliente.token)
  const outraHora = outrasHoras.find(h => h !== slot.hora)
  assert.ok(outraHora)
  const segunda = await chamar('/agendamentos', cliente.token, { petId: pet.id, servicoId: servico.id, colaboradorId: profissional.usuario.id, dataHora: `${slot.dia}T${outraHora}` })
  reservas.push(segunda.id)
  const outroEvento = `[data-agendamento-id="${segunda.id}"]`
  await clicar(colab.page, 'Atualizar agenda')
  await colab.page.waitForSelector(outroEvento)
  await colab.page.evaluate(sel => document.querySelector(sel).click(), outroEvento)
  await colab.page.waitForSelector('.modal')
  await clicar(colab.page, '✕ Cancelar')
  await clicar(colab.page, 'Sim, cancelar')
  await colab.page.waitForFunction(sel => !document.querySelector(sel), {}, outroEvento)
  assert.equal((await chamar(`/agendamentos/${segunda.id}`, gestor.token)).status, 'cancelado')
  await colab.page.reload({ waitUntil: 'networkidle0' })
  await dataDaAgenda(colab.page, slot.dia)
  await colab.page.waitForSelector(evento+'.ev-concluído')
  assert.equal(await colab.page.$(outroEvento), null)
  assert.deepEqual(erros, [])
  console.log('Reserva criada pela interface; visível no gestor e no profissional, incluindo :30; conclusão e cancelamento persistiram após recarga.')
  await colab.contexto.close()
})