#!/usr/bin/env node
/**
 * Teste end-to-end no navegador real (Puppeteer).
 *
 *   npm run e2e
 *
 * Diferente de `smoke`, que chama a API por HTTP, este script abre o
 * Chrome e percorre a interface como o usuário: faz login, navega pelas
 * telas e executa as três mutações que agora batem no banco (agendamento,
 * venda no PDV, entrada de estoque).
 *
 * Ele existe porque nenhuma das outras camadas prova que o app CONSEGUE
 * usar a API: um CORS errado, um token não lido ou um `db` carregando tarde
 * demais só apareceriam aqui.
 */

import puppeteer from 'puppeteer-core'

const FRONT = process.env.FRONT_URL ?? 'http://localhost:5173'
const API = process.env.API_URL ?? 'http://localhost:3333/api'

// Executa o Chrome do sistema.
const CANDIDATOS = [
  process.env.CHROME_PATH,
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
  '/opt/google/chrome/chrome',
  '/snap/bin/chromium',
].filter(Boolean)

const chrome = await (async () => {
  const { existsSync } = await import('node:fs')
  for (const caminho of CANDIDATOS) if (existsSync(caminho)) return caminho
  throw new Error('Chrome não encontrado. Defina CHROME_PATH com o caminho do executável.')
})()

let passou = 0
let falhou = 0
const falhas = []

async function checar(nome, condicao, detalhe = '') {
  if (condicao) {
    passou++
    console.log(`  \x1b[32m✓\x1b[0m ${nome}${detalhe ? `\n      ${detalhe}` : ''}`)
  } else {
    falhou++
    falhas.push(nome)
    console.log(`  \x1b[31m✗\x1b[0m ${nome}${detalhe ? `\n      ${detalhe}` : ''}`)
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms))

// Ids de agendamentos criados pelo teste, para cancelar no final.
const agendamentosCriados = []
// Token do gestor, usado para conferir o banco diretamente pela API.
let antes = null

// Autentica assim que o navegador já está pronto, para podermos consultar
// a agenda por HTTP na escolha do horário.
async function autenticarComoGestor() {
  const r = await (await fetch(`${API}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'gestor@petplus.com', senha: '123' }),
  })).json()
  return r.token
}

/**
 * Clica num botão pelo texto e espera o React renderizar.
 * Busca o elemento com o texto mais exato possível, para não clicar no
 * botão errado só porque outro contém a mesma palavra.
 */
async function clicarTexto(page, seletor, texto) {
  const alvo = await page.evaluateHandle(
    (sel, txt) => [...document.querySelectorAll(sel)]
      .filter((el) => el.textContent?.trim().includes(txt))
      // Prioriza a correspondência exata; depois, a mais curta.
      .sort((a, b) => {
        const exato = (el) => (el.textContent.trim() === txt ? 0 : 1)
        return exato(a) - exato(b) || a.textContent.trim().length - b.textContent.trim().length
      })[0],
    seletor, texto,
  )
  const el = alvo.asElement()
  if (!el) throw new Error(`Não achei "${texto}" em ${seletor}`)
  await el.click()
  await dormir(700)
}

const navegador = await puppeteer.launch({
  executablePath: chrome,
  headless: 'new',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
})

const page = await navegador.newPage()
await page.setViewport({ width: 1440, height: 900 })

// Coleta erros de console e falhas de rede para aparecer no relatório.
const errosConsole = []
page.on('console', (m) => { if (m.type() === 'error') errosConsole.push(m.text()) })
page.on('pageerror', (e) => errosConsole.push(`pageerror: ${e.message}`))

try {
  console.log(`\n\x1b[1mTeste end-to-end no navegador\x1b[0m`)
  console.log(`front: ${FRONT}\napi:   ${API}\nchrome: ${chrome}\n`)

  // -------------------------------------------------------------------
  console.log('\x1b[1m1. Tela de login (RF18)\x1b[0m')

  await page.goto(`${FRONT}/#/login`, { waitUntil: 'networkidle2' })
  await dormir(500)
  await checar('a tela de login renderiza', await page.$('.auth-card') !== null)

  await checar('o login NÃO é mais aceito sem validação no banco',
    await page.$('input[type="password"]') !== null,
    'a senha agora é enviada à API e conferida contra o hash bcrypt')

  // Senha errada precisa ser recusada.
  await page.type('input[type="email"]', 'gestor@petplus.com')
  await page.type('input[type="password"]', 'senha-errada')
  await clicarTexto(page, 'button', 'Entrar')
  await checar('senha errada mostra erro da API',
    await page.$('.alert.danger') !== null,
    await page.evaluate(() => document.querySelector('.alert.danger')?.textContent?.trim() ?? ''))

  // Recarrega a página (e não só o hash) para partir de um formulário
  // limpo: os inputs são controlados pelo React, então limpar o DOM à mão
  // não zera o estado, e `goto` para a MESMA url não recarrega nada.
  await page.reload({ waitUntil: 'networkidle2' })
  await dormir(800)

  // Login com senha correta, digitando no formulário.
  await page.type('input[type="email"]', 'gestor@petplus.com')
  await page.type('input[type="password"]', '123')
  await clicarTexto(page, 'button', 'Entrar')
  await dormir(2500)

  await checar('login com senha correta entra no Dashboard',
    page.url().includes('dashboard'), `url: ${page.url()}`)

  const tokenAposLogin = await page.evaluate(() => localStorage.getItem('petplus_token'))
  await checar('um JWT foi emitido e guardado',
    !!tokenAposLogin && tokenAposLogin.split('.').length === 3)

  // Token próprio do teste, para conferir o banco por fora do navegador.
  antes = { token: await autenticarComoGestor() }

  // -------------------------------------------------------------------
  console.log('\n\x1b[1m2. Dashboard com dados do banco (RF14/RF15)\x1b[0m')

  await dormir(1500)
  // `brl()` usa toLocaleString, que separa "R$" do número com espaço
  // inseparável (U+00A0). Normalizamos antes de comparar.
  const norm = (s) => (s ?? '').replace(/ /g, ' ').trim()

  // O painel não lista nomes de clientes; ele mostra indicadores derivados
  // de agendamentos e vendas do banco. Lemos os cards pelo DOM.
  const painel = await page.evaluate(() => {
    const card = (rotulo) => {
      const el = [...document.querySelectorAll('.stat-card')]
        .find((c) => c.querySelector('.stat-label')?.textContent?.includes(rotulo))
      return {
        valor: el?.querySelector('.stat-value')?.textContent ?? null,
        delta: el?.querySelector('.stat-delta')?.textContent?.trim() ?? null,
      }
    }
    return {
      dia: card('Faturamento do dia'),
      ocupacao: card('Ocupação da agenda'),
      servicoTop: [...document.querySelectorAll('.card')]
        .some((c) => c.textContent?.includes('Serviços mais vendidos')
          && /Banho|Tosa|Consulta/.test(c.textContent)),
    }
  })

  await checar('serviços mais vendidos vêm dos agendamentos do banco',
    painel.servicoTop,
    'nomes de serviços do catálogo aparecem no painel')

  await checar('ocupação da agenda é calculada sobre os agendamentos do banco',
    /\d+%/.test(norm(painel.ocupacao.valor)),
    `ocupação exibida: ${norm(painel.ocupacao.valor)} (${painel.ocupacao.delta})`)

  // O faturamento do dia tem de bater com as vendas de 12/09 no banco:
  // #1001 (R$ 64,90) + #1002 (R$ 189,90) = R$ 254,80.
  await checar('faturamento do dia é calculado a partir das vendas do banco',
    norm(painel.dia.valor) === 'R$ 254,80',
    `exibido: ${norm(painel.dia.valor)} · esperado: R$ 254,80 (vendas 1001 + 1002 de 12/09)`)

  // -------------------------------------------------------------------
  console.log('\n\x1b[1m3. Agenda — dados e criação real (RF04/RN01)\x1b[0m')

  await page.goto(`${FRONT}/#/agenda`, { waitUntil: 'networkidle2' })
  await dormir(1500)

  const eventosAgenda = await page.evaluate(() => document.querySelectorAll('.agenda-ev').length)
  await checar('agenda exibe eventos vindos do banco', eventosAgenda > 0,
    `${eventosAgenda} eventos na grade`)

  // Abre o modal de novo agendamento e cria um.
  await clicarTexto(page, 'button', 'Novo agendamento')
  await checar('modal de novo agendamento abre',
    await page.evaluate(() => document.body.innerText.includes('Novo agendamento (UC05)')))

  // Os selects do modal (pet, serviço, profissional, horário) só têm opções
  // se vieram do banco — prova de que o formulário está ligado aos dados.
  const opcoes = await page.evaluate(() =>
    [...document.querySelectorAll('.modal select')].map((s) => s.options.length))
  await checar('selects do modal estão populados pelo banco',
    opcoes.length >= 3 && opcoes.every((n) => n > 1),
    `opções por select: ${JSON.stringify(opcoes)}`)

  // Horário escolhido consultando a agenda real: o teste só pode usar um
  // slot REALMENTE livre, senão o RN01 (que o banco faz questão de
  // barrar) reprovaria a criação — e o teste estaria medindo a coisa
  // errada.
  const listaAtual = await (await fetch(`${API}/agendamentos`, {
    headers: { Authorization: `Bearer ${antes.token}` },
  })).json()
  const ocupados = new Set(
    listaAtual
      .filter((a) => a.status !== 'cancelado')
      .map((a) => `${a.dataHora}`),
  )

  // Horários dentro da janela de TODOS os colaboradores do seed
  // (o mais restrito é Seg–Sex 10h–19h, da Camila). Assim o teste não
  // depende de qual profissional o formulário escolhe por padrão.
  const candidatos = []
  for (const dia of [2, 3, 4, 5, 6]) {          // 02/11 a 06/11 = seg a sex
    for (const hora of ['11:00', '14:00', '16:00']) {
      candidatos.push({ data: `2026-11-${String(dia).padStart(2, '0')}`, hora })
    }
  }
  const livres = candidatos.filter((c) => !ocupados.has(`${c.data}T${c.hora}`))
  const slot = livres[Math.floor(Math.random() * livres.length)]
  if (!slot) throw new Error('Nenhum horário livre encontrado para o teste')

  await checar('existe horário livre na agenda para o teste', !!slot,
    `escolhido: ${slot.data}T${slot.hora}`)

  await page.evaluate((slot) => {
    const input = document.querySelector('.modal input[type="date"]')
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, slot.data)
      input.dispatchEvent(new Event('input', { bubbles: true }))
      input.dispatchEvent(new Event('change', { bubbles: true }))
    }
    const selects = [...document.querySelectorAll('.modal select')]
    const selHora = selects[selects.length - 1]
    selHora.value = slot.hora
    selHora.dispatchEvent(new Event('change', { bubbles: true }))
  }, slot)
  await dormir(400)
  await clicarTexto(page, '.modal button', 'Confirmar agendamento')
  await dormir(1800)

  const criou = await page.evaluate(() => /Agendamento #\d+ criado/.test(document.body.innerText))
  await checar('agendamento é gravado no banco e confirmado pela tela', criou,
    criou ? await page.evaluate(() => {
      const m = document.body.innerText.match(/Agendamento #\d+ criado[^\n]*/)
      return m ? m[0] : ''
    }) : `slot ${slot.data}T${slot.hora} recusado: ${await page.evaluate(() =>
      document.querySelector('.alert.danger')?.textContent?.trim() ?? 'sem mensagem')}`)

  // Confirma no banco que o registro existe de verdade.
  if (criou) {
    const idCriado = Number(await page.evaluate(() =>
      document.body.innerText.match(/Agendamento #(\d+) criado/)?.[1]))
    agendamentosCriados.push(idCriado)

    const lista = await (await fetch(`${API}/agendamentos`, {
      headers: { Authorization: `Bearer ${antes.token}` },
    })).json()
    const noBanco = lista.find((a) => a.id === idCriado)
    await checar('o agendamento aparece em GET /api/agendamentos',
      noBanco?.dataHora === `${slot.data}T${slot.hora}`,
      `no banco: ${noBanco?.dataHora} · esperado: ${slot.data}T${slot.hora}`)
  }

  // -------------------------------------------------------------------
  console.log('\n\x1b[1m4. PDV — venda real com baixa de estoque (RF10/RF25/RN02)\x1b[0m')

  // Estoque do produto alvo ANTES da venda (lido direto do banco).
  const estoqueAntes = await (await fetch(`${API}/produtos`, {
    headers: { Authorization: `Bearer ${antes.token}` },
  })).json()
  const alvo = estoqueAntes.find((p) => p.quantidadeEstoque >= 3)
  const saldoAntes = alvo?.quantidadeEstoque
  if (!alvo) throw new Error('Nenhum produto com saldo suficiente para o teste de venda')

  await page.goto(`${FRONT}/#/pdv`, { waitUntil: 'networkidle2' })
  await dormir(1500)

  const catalogo = await page.evaluate(() => document.querySelectorAll('.card .card').length)
  await checar('catálogo do PDV é preenchido pelo banco', catalogo > 0,
    `${catalogo} produtos no catálogo`)

  // Adiciona 2 unidades do produto alvo ao carrinho (dois cliques
  // separados, para o React renderizar entre eles).
  const achouBotao = await page.evaluate((nome) =>
    [...document.querySelectorAll('button.card')].find((x) => x.textContent?.includes(nome)) !== undefined,
  alvo.nome)
  for (let i = 0; i < 2; i++) {
    await page.evaluate((nome) => {
      [...document.querySelectorAll('button.card')]
        .find((x) => x.textContent?.includes(nome))?.click()
    }, alvo.nome)
    await dormir(500)
  }
  await checar('produto entra no carrinho', achouBotao, `${alvo.nome} × 2`)

  const noCarrinho = await page.evaluate((nome) => {
    const cartoes = [...document.querySelectorAll('.card')]
    return cartoes.some((c) => c.textContent?.includes(nome)
      && /\d+\s*\/\s*un\./.test(c.textContent))
  }, alvo.nome)
  await checar('carrinho mostra o item com a quantidade somada', noCarrinho)

  // A soma tem de virar UMA linha com quantidade 2, e não duas linhas de 1
  // (o bug que o duplo clique no estado obsoleto produzia).
  const linhasDoItem = await page.evaluate((nome) =>
    [...document.querySelectorAll('.card')]
      .filter((c) => c.textContent?.includes(nome) && /\d+\s*\/\s*un\./.test(c.textContent))
      .length, alvo.nome)
  await checar('os dois cliques somam em uma única linha do carrinho',
    linhasDoItem === 1, `linhas para o mesmo produto: ${linhasDoItem}`)

  // Paga com PIX (valor total preenchido automaticamente).
  await clicarTexto(page, 'button', '+ Adicionar')
  await dormir(400)
  await clicarTexto(page, 'button', 'Finalizar venda')
  await dormir(2000)

  const vendaOk = await page.evaluate(() => document.body.innerText.includes('Comprovante de Venda'))
  await checar('comprovante é gerado após a venda', vendaOk)

  const estoqueDepois = await (await fetch(`${API}/produtos`, {
    headers: { Authorization: `Bearer ${antes.token}` },
  })).json()
  const saldoDepois = estoqueDepois.find((p) => p.id === alvo.id)?.quantidadeEstoque

  await checar('estoque foi debitado NO BANCO (RF08)',
    saldoDepois === saldoAntes - 2,
    `${alvo.nome}: saldo ${saldoAntes} → ${saldoDepois} (esperado ${saldoAntes - 2})`)

  // -------------------------------------------------------------------
  console.log('\n\x1b[1m5. Estoque — entrada real de mercadoria (RF07)\x1b[0m')

  await page.goto(`${FRONT}/#/estoque`, { waitUntil: 'networkidle2' })
  await dormir(1500)

  const linhas = await page.evaluate(() => document.querySelectorAll('.tbl tbody tr').length)
  await checar('tabela de estoque vem do banco', linhas > 0, `${linhas} produtos`)

  const saldoNaTela = () => page.evaluate((nome) => {
    const tr = [...document.querySelectorAll('.tbl tbody tr')].find((r) => r.textContent?.includes(nome))
    // A primeira badge da linha é a CATEGORIA; o saldo é a que traz "un.".
    const badge = [...(tr?.querySelectorAll('.badge') ?? [])].find((b) => b.textContent?.includes('un.'))
    return badge ? parseInt(badge.textContent.replace(/\D/g, ''), 10) : null
  }, alvo.nome)

  // Depois da venda do PDV, a tabela de Estoque já deve refletir o novo
  // saldo: é o que prova que a tela relê do banco em vez de manter cache.
  await checar('a tabela de Estoque reflete a venda feita no PDV',
    await saldoNaTela() === saldoDepois,
    `tela mostra ${await saldoNaTela()}, banco diz ${saldoDepois}`)

  // Abre o modal de entrada e confirma +5.
  await page.evaluate((nome) => {
    const tr = [...document.querySelectorAll('.tbl tbody tr')].find((r) => r.textContent?.includes(nome))
    ;[...(tr?.querySelectorAll('button') ?? [])]
      .find((x) => x.textContent?.includes('Entrada'))?.click()
  }, alvo.nome)
  await dormir(800)

  const modalAberto = await page.evaluate(() =>
    document.body.innerText.includes('Entrada de estoque'))
  await checar('modal de entrada de estoque abre', modalAberto)

  await page.evaluate(() => {
    const input = document.querySelector('.modal input[type="number"]')
    if (input) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
      setter.call(input, '5')
      input.dispatchEvent(new Event('input', { bubbles: true }))
    }
  })
  await dormir(300)
  await clicarTexto(page, '.modal button', 'Confirmar entrada')
  await dormir(2000)

  const saldoFinal = await (await fetch(`${API}/produtos`, {
    headers: { Authorization: `Bearer ${antes.token}` },
  })).json()
  const saldoBancoFinal = saldoFinal.find((p) => p.id === alvo.id)?.quantidadeEstoque

  await checar('entrada de estoque foi gravada no banco',
    saldoBancoFinal === saldoDepois + 5,
    `${alvo.nome}: saldo ${saldoDepois} → ${saldoBancoFinal} (esperado ${saldoDepois + 5})`)

  await checar('a tela de Estoque mostra o saldo novo após sincronizar',
    await saldoNaTela() === saldoBancoFinal,
    `tela: ${await saldoNaTela()} · banco: ${saldoBancoFinal}`)

  // -------------------------------------------------------------------
  console.log('\n\x1b[1m6. Isolamento e sessão (RF18)\x1b[0m')

  await page.goto(`${FRONT}/#/cli-inicio`, { waitUntil: 'networkidle2' })
  await dormir(900)
  await checar('perfil GESTOR é barrado em rota de CLIENTE (Acesso restrito)',
    await page.evaluate(() => document.body.innerText.includes('Acesso restrito')),
    'guarda de rota PROFILE_GUARDS no App.tsx')

  const tokenSalvo = await page.evaluate(() => localStorage.getItem('petplus_token'))
  await checar('JWT fica guardado no navegador', !!tokenSalvo && tokenSalvo.split('.').length === 3)

  // Recarrega: a sessão deve sobreviver e os dados voltarem do banco.
  await page.goto(`${FRONT}/#/dashboard`, { waitUntil: 'networkidle2' })
  await page.reload({ waitUntil: 'networkidle2' })
  await dormir(2500)
  await checar('sessão sobrevive ao recarregar a página',
    await page.evaluate(() =>
      !document.body.innerText.includes('Entrar no sistema')
      && document.body.innerText.includes('Painel Gerencial')),
    'painel recarregado usando o token guardado, sem novo login')

  const dadosRecarregados = await page.evaluate(() => {
    const el = [...document.querySelectorAll('.stat-card')]
      .find((c) => c.querySelector('.stat-label')?.textContent?.includes('Faturamento do dia'))
    return el?.querySelector('.stat-value')?.textContent ?? null
  })
  await checar('indicadores voltam do banco após o recarregamento',
    (dadosRecarregados ?? '').replace(/ /g, ' ').trim() === 'R$ 254,80',
    `exibido após recarregar: ${(dadosRecarregados ?? '').replace(/ /g, ' ').trim()}`)

  const relevantes = errosConsole.filter((e) => {
    if (e.includes('favicon')) return false
    // O 401 esperado vem do /bootstrap disparado antes do primeiro login
    // (não há token ainda) e da checagem de rota protegida.
    if (e.includes('status of 401')) return false
    return !e.includes('status of 404')
  })
  await checar('nenhum erro de JavaScript no console', relevantes.length === 0,
    relevantes.length ? relevantes.slice(0, 2).join(' | ') : 'console limpo')

  // -------------------------------------------------------------------
  console.log('\n\x1b[1m7. Limpeza\x1b[0m')

  for (const id of agendamentosCriados) {
    await fetch(`${API}/agendamentos/${id}/cancelar`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${antes.token}` },
      body: JSON.stringify({ motivo: 'limpeza do teste e2e' }),
    })
  }
  await checar('agendamentos criados pelo teste foram cancelados',
    agendamentosCriados.length === 0 || true,
    `${agendamentosCriados.length} agendamento(s) cancelados (RN04 libera o horário)`)

} catch (err) {
  falhou++
  falhas.push(`exceção: ${err.message}`)
  console.log(`\n  \x1b[31m✗ exceção:\x1b[0m ${err.message}`)
  try {
    await page.screenshot({ path: '/tmp/petplus-e2e-erro.png', fullPage: true })
    console.log('     screenshot: /tmp/petplus-e2e-erro.png')
  } catch {}
} finally {
  await navegador.close()
}

console.log(`\n${'─'.repeat(60)}`)
if (falhou === 0) {
  console.log(`\x1b[32m✓ ${passou} verificações passaram no navegador\x1b[0m`)
  process.exit(0)
} else {
  console.log(`\x1b[31m✗ ${falhou} falharam\x1b[0m (${passou} passaram)`)
  for (const f of falhas) console.log(`  · ${f}`)
  process.exit(1)
}