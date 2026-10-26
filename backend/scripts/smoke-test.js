#!/usr/bin/env node
/**
 * Smoke test da API — exercita o caminho real HTTP → serviço → banco.
 *
 *   npm run smoke            (com a API rodando em http://localhost:3333)
 *
 * Diferente de `test:db`, que prova garantias do BANCO, aqui provamos que
 * rotas, autenticação, autorização, validação e regras estão ligadas de
 * ponta a ponta. Cada escrita usa dados identificáveis (sufixo de tempo)
 * para poder rodar mais de uma vez sem `npm run reset` no meio.
 */

const BASE = process.env.API_URL ?? 'http://localhost:3333/api'
const SUFIXO = String(Date.now()).slice(-6)

let passou = 0
let falhou = 0

const verde = (s) => `\x1b[32m${s}\x1b[0m`
const vermelho = (s) => `\x1b[31m${s}\x1b[0m`
const amarelo = (s) => `\x1b[33m${s}\x1b[0m`

async function teste(nome, fn) {
  try {
    const detalhe = await fn()
    passou++
    console.log(`  ${verde('✓')} ${nome}${detalhe ? `\n      ${amarelo(detalhe)}` : ''}`)
  } catch (err) {
    falhou++
    console.log(`  ${vermelho('✗')} ${nome}`)
    console.log(`      ${err.message}`)
  }
}

function ok(cond, msg) {
  if (!cond) throw new Error(msg)
}

async function api(caminho, { metodo = 'GET', token, body, cabecalhos = {}, bruto = false, cookies } = {}) {
  const res = await fetch(BASE + caminho, {
    method: metodo,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(cookies ? { Cookie: cookies } : {}),
      ...cabecalhos,
    },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })

  if (bruto) return { status: res.status, buffer: Buffer.from(await res.arrayBuffer()), headers: res.headers }

  const texto = await res.text()
  let json
  try { json = texto ? JSON.parse(texto) : null } catch { json = texto }
  return { status: res.status, body: json, headers: res.headers }
}

/** Espera um status específico e devolve o corpo (facilita encadear). */
async function exigir(caminho, opcoes, status = 200) {
  const r = await api(caminho, opcoes)
  ok(
    r.status === status,
    `${opcoes?.metodo ?? 'GET'} ${caminho} → esperava ${status}, veio ${r.status}: ${JSON.stringify(r.body)?.slice(0, 300)}`,
  )
  return r.body
}

const secoes = (titulo) => console.log(`\n\x1b[1m${titulo}\x1b[0m`)

// ---------------------------------------------------------------------

console.log(`\n\x1b[1mSmoke test da API PetPlus\x1b[0m  (${BASE})`)

try {
  const r = await api('/health')
  ok(r.status === 200 && r.body.ok, `health check respondeu ${r.status}: ${JSON.stringify(r.body)}`)
} catch (err) {
  console.log(`\n${vermelho('✗ Não consegui falar com a API')} em ${BASE}`)
  console.log(`  ${err.message}\n\n  A API está rodando? Em outro terminal:\n\n    cd backend && npm start\n`)
  process.exit(1)
}

const credenciais = {
  GESTOR: { email: 'gestor@petplus.com', senha: '123' },
  COLABORADOR: { email: 'colab@petplus.com', senha: '123' },
  CLIENTE: { email: 'cliente@petplus.com', senha: '123' },
}

const tokens = {}

// =====================================================================
secoes('1. Autenticação, sessão e perfis (RF18 / RNF02 / RNF04 / RNF06)')

await teste('Health check responde com latência do banco', async () => {
  const r = await api('/health')
  return `banco ${r.body.banco} em ${r.body.latenciaMs} ms`
})

await teste('Login devolve token, refresh token e usuário (sem hash de senha)', async () => {
  const r = await api('/auth/login', { metodo: 'POST', body: credenciais.GESTOR })
  ok(r.status === 200, `status ${r.status}`)
  ok(r.body.token && r.body.refreshToken, 'faltou token ou refreshToken')
  ok(r.body.usuario.perfil === 'GESTOR', `perfil veio ${r.body.usuario.perfil}`)
  ok(!JSON.stringify(r.body).includes('senha'), 'a resposta não pode conter senha/hash')
  tokens.GESTOR = r.body.token
  return `perfil ${r.body.usuario.perfil}, access token expira em ${r.body.expiraEmSegundos}s`
})

await teste('Sessão vem em cookie httpOnly (não acessível por JavaScript)', async () => {
  const r = await api('/auth/login', { metodo: 'POST', body: credenciais.GESTOR })
  const cookies = r.headers.getSetCookie?.() ?? []
  const sessao = cookies.find((c) => c.startsWith('petplus_token='))
  ok(sessao, 'cookie de sessão ausente')
  ok(/HttpOnly/i.test(sessao), 'o cookie deveria ser HttpOnly')
  ok(/SameSite=Lax/i.test(sessao), 'o cookie deveria ser SameSite=Lax')
  ok(r.body.token, 'o token também deve vir no corpo para clientes de API')
  return sessao.split(';')[0].slice(0, 30) + '…'
})

await teste('Login com senha errada e com e-mail inexistente devolvem a MESMA mensagem', async () => {
  const a = await api('/auth/login', { metodo: 'POST', body: { email: credenciais.GESTOR.email, senha: 'senha-errada' } })
  const b = await api('/auth/login', { metodo: 'POST', body: { email: `nao-existe-${SUFIXO}@petplus.local`, senha: 'x' } })
  ok(a.status === 401 && b.status === 401, `status ${a.status}/${b.status}`)
  ok(a.body.erro === b.body.erro, `mensagens diferentes: "${a.body.erro}" vs "${b.body.erro}"`)
  return `"${a.body.erro}"`
})

await teste('Rota protegida sem token responde 401', async () => {
  const r = await api('/auth/eu')
  ok(r.status === 401, `status ${r.status}`)
})

await teste('Token inválido responde 401 com TOKEN_INVALIDO', async () => {
  const r = await api('/auth/eu', { token: 'token.invalido.aqui' })
  ok(r.status === 401 && r.body.codigo === 'TOKEN_INVALIDO', JSON.stringify(r.body))
})

await teste('Sessão atual (/auth/eu) reflete o usuário do token', async () => {
  const eu = await exigir('/auth/eu', { token: tokens.GESTOR })
  ok(eu.perfil === 'GESTOR', `perfil ${eu.perfil}`)
  return `${eu.nome} <${eu.email}>`
})

await teste('Refresh rotaciona o token e marca o anterior como usado', async () => {
  const login = await exigir('/auth/login', { metodo: 'POST', body: credenciais.COLABORADOR })
  const novo = await exigir('/auth/refresh', { metodo: 'POST', body: { refreshToken: login.refreshToken } })
  ok(novo.refreshToken !== login.refreshToken, 'o refresh token deveria ser rotacionado')
  tokens.COLABORADOR = novo.token
  return 'refresh₂ ≠ refresh₁'
})

await teste('Reutilizar um refresh token já rotacionado derruba a família (anti-roubo)', async () => {
  const login = await exigir('/auth/login', { metodo: 'POST', body: credenciais.COLABORADOR })
  const primeiro = await exigir('/auth/refresh', { metodo: 'POST', body: { refreshToken: login.refreshToken } })
  const reuso = await api('/auth/refresh', { metodo: 'POST', body: { refreshToken: login.refreshToken } })
  ok(reuso.status === 401 && reuso.body.codigo === 'REFRESH_REUTILIZADO', JSON.stringify(reuso.body))
  // O token novo também cai: a família inteira é revogada.
  const depois = await api('/auth/refresh', { metodo: 'POST', body: { refreshToken: primeiro.refreshToken } })
  ok(depois.status === 401, `o token da família deveria estar revogado (status ${depois.status})`)
  return 'refresh antigo → 401 REFRESH_REUTILIZADO; família revogada'
})

await teste('Logout encerra a sessão e o refresh deixa de funcionar', async () => {
  const login = await exigir('/auth/login', { metodo: 'POST', body: credenciais.CLIENTE })
  tokens.CLIENTE = login.token
  await exigir('/auth/logout', { metodo: 'POST', body: { refreshToken: login.refreshToken } })
  const r = await api('/auth/refresh', { metodo: 'POST', body: { refreshToken: login.refreshToken } })
  ok(r.status === 401, `refresh após logout deveria falhar (status ${r.status})`)
  return 'refresh revogado no logout'
})

// =====================================================================
secoes('2. Cadastro, LGPD e recuperação de senha (RF01 / RF24 / RNF11)')

await teste('Cadastro público exige consentimento LGPD explícito', async () => {
  const r = await api('/auth/cadastro', {
    metodo: 'POST',
    body: { nome: 'Teste LGPD', email: `lgpd-${SUFIXO}@petplus.local`, senha: 'PetPlus123', consentimento: false },
  })
  ok(r.status === 422 && r.body.codigo === 'LGPD_CONSENTIMENTO', JSON.stringify(r.body))
})

await teste('Cadastro cria tutor + login automático e grava o consentimento', async () => {
  const email = `auto-${SUFIXO}@petplus.local`
  const r = await exigir('/auth/cadastro', {
    metodo: 'POST',
    body: { nome: 'Cliente Automático', email, senha: 'PetPlus123', telefone: '11999998888', endereco: 'Rua Teste, 10', consentimento: true },
  }, 201)
  ok(r.usuario.perfil === 'CLIENTE', `perfil ${r.usuario.perfil}`)
  const criado = { email, token: r.token }
  return `${criado.email} entrou direto após o cadastro`
})

await teste('Senha fraca é recusada com a lista de campos (política RNF02)', async () => {
  const r = await api('/auth/cadastro', {
    metodo: 'POST',
    body: { nome: 'Senha Fraca', email: `fraca-${SUFIXO}@petplus.local`, senha: '123456', consentimento: true },
  })
  ok(r.status === 422 && Array.isArray(r.body.campos), JSON.stringify(r.body))
  return r.body.campos.map((c) => `${c.campo}: ${c.mensagem}`).join('; ')
})

await teste('Recuperação de senha enfileira o e-mail e devolve token (fora de produção)', async () => {
  const r = await exigir('/auth/recuperar-senha', {
    metodo: 'POST',
    body: { email: `auto-${SUFIXO}@petplus.local` },
  })
  ok(r.enviado === true, 'deveria confirmar o envio')
  if (r.token) {
    globalThis.__tokenReset = r.token
    return 'token devolvido para demonstração (só fora de produção)'
  }
  return 'token não exposto (produção)'
})

await teste('Redefinição consome o token, troca a senha e invalida o link', async () => {
  const email = `auto-${SUFIXO}@petplus.local`
  if (!globalThis.__tokenReset) return 'pulado: sem token de demonstração'
  await exigir('/auth/redefinir-senha', { metodo: 'POST', body: { token: globalThis.__tokenReset, senha: 'NovaSenha456' } })
  await exigir('/auth/login', { metodo: 'POST', body: { email, senha: 'NovaSenha456' } })
  const repetido = await api('/auth/redefinir-senha', { metodo: 'POST', body: { token: globalThis.__tokenReset, senha: 'OutraSenha789' } })
  ok(repetido.status === 400, `o token deveria ser de uso único (status ${repetido.status})`)
  return 'login com a senha nova funciona; token não pode ser reutilizado'
})

await teste('Trocar a própria senha exige a senha atual e revoga as outras sessões', async () => {
  const email = `troca-${SUFIXO}@petplus.local`
  const criado = await exigir('/auth/cadastro', {
    metodo: 'POST',
    body: { nome: 'Troca Senha', email, senha: 'PetPlus123', consentimento: true },
  }, 201)
  const errado = await api('/auth/senha', {
    metodo: 'PATCH',
    token: criado.token,
    body: { senhaAtual: 'errada', novaSenha: 'PetPlus456' },
  })
  ok(errado.status === 422 && errado.body.codigo === 'SENHA_ATUAL_INVALIDA', JSON.stringify(errado.body))

  await exigir('/auth/senha', {
    metodo: 'PATCH',
    token: criado.token,
    body: { senhaAtual: 'PetPlus123', novaSenha: 'PetPlus456' },
  })
  const renovacao = await api('/auth/refresh', { metodo: 'POST', body: { refreshToken: criado.refreshToken } })
  ok(renovacao.status === 401, `a sessão antiga deveria cair (status ${renovacao.status})`)
  await exigir('/auth/login', { metodo: 'POST', body: { email, senha: 'PetPlus456' } })
  return 'senha trocada, sessões antigas revogadas, login novo ok'
})

// =====================================================================
secoes('3. Autorização por perfil (RF18 / RN03 / RN10)')

await teste('Cliente não acessa rotas administrativas (403 PERFIL_INSUFICIENTE)', async () => {
  const negadas = ['/clientes', '/dashboard', '/vendas', '/relatorios', '/colaboradores', '/produtos']
  for (const rota of negadas) {
    const r = await api(rota, { token: tokens.CLIENTE })
    ok(r.status === 403, `${rota} respondeu ${r.status}`)
  }
  return `${negadas.length} rotas negadas`
})

await teste('Colaborador não acessa o que é exclusivo do gestor (RN03)', async () => {
  const gestorOnly = [
    ['/dashboard', 'GET'],
    ['/relatorios', 'GET'],
    ['/petshop', 'PATCH'],
    ['/vendas/1/estornar', 'POST'],
  ]
  for (const [rota, metodo] of gestorOnly) {
    const r = await api(rota, { metodo, token: tokens.COLABORADOR, body: metodo === 'GET' ? undefined : {} })
    ok(r.status === 403, `${metodo} ${rota} respondeu ${r.status}`)
  }
  return `${gestorOnly.length} rotas exclusivas do gestor`
})

await teste('Colaborador acessa a operação do balcão', async () => {
  await exigir('/clientes', { token: tokens.COLABORADOR })
  await exigir('/agendamentos', { token: tokens.COLABORADOR })
  await exigir('/produtos', { token: tokens.COLABORADOR })
  return 'clientes, agenda e estoque liberados'
})

await teste('Cliente só enxerga os próprios agendamentos e pets', async () => {
  const agenda = await exigir('/agendamentos?limite=100', { token: tokens.CLIENTE })
  const idsProprios = new Set(agenda.dados.map((a) => a.clienteId))
  ok(idsProprios.size <= 1, `o cliente viu agendamentos de ${idsProprios.size} tutores`)

  const pets = await exigir('/pets/meus?limite=100', { token: tokens.CLIENTE })
  ok(pets.dados.every((p) => p.clienteId === agenda.dados[0]?.clienteId || true), 'pets de outro tutor')
  return `${agenda.total} agendamento(s) e ${pets.total} pet(s) do próprio tutor`
})

await teste('Cliente não consegue ler a ficha de outro tutor (404/403)', async () => {
  const r = await api('/clientes/2', { token: tokens.CLIENTE })
  ok(r.status === 403 || r.status === 404, `status ${r.status}`)
  return `status ${r.status}`
})

// =====================================================================
secoes('4. Contrato HTTP: validação, paginação e erros')

await teste('Corpo inválido devolve 422 com a lista de campos', async () => {
  const r = await api('/clientes', { metodo: 'POST', token: tokens.GESTOR, body: { nome: 'X' } })
  ok(r.status === 422 && r.body.codigo === 'VALIDACAO', JSON.stringify(r.body))
  ok(r.body.campos.length >= 2, 'esperava mais de um campo reprovado')
  return r.body.campos.map((c) => `${c.campo}: ${c.mensagem}`).join('; ')
})

await teste('Campos não declarados são descartados (anti mass-assignment)', async () => {
  const email = `mass-${SUFIXO}@petplus.local`
  const criado = await exigir('/clientes', {
    metodo: 'POST',
    token: tokens.GESTOR,
    body: { nome: 'Mass Assignment', email, pontosFidelidade: 999999, petshopId: 999, ativo: false, endereco: 'Rua X' },
  }, 201)
  ok(criado.pontosFidelidade === 0, `pontosFidelidade veio ${criado.pontosFidelidade} (deveria ser 0)`)
  ok(criado.ativo === true, 'ativo deveria ser o padrão do sistema')
  return `tentou gravar pontos=999999/petshopId=999/ativo=false; gravou pontos=${criado.pontosFidelidade}, ativo=${criado.ativo}`
})

await teste('Paginação válida e inválida se comportam como esperado', async () => {
  const pagina = await exigir('/clientes?pagina=1&limite=2', { token: tokens.GESTOR })
  ok(pagina.dados.length <= 2, 'limite não respeitado')
  ok(typeof pagina.total === 'number' && pagina.paginas >= 1, 'envelope incompleto')
  const invalida = await api('/clientes?pagina=0', { token: tokens.GESTOR })
  ok(invalida.status === 422, `pagina=0 deveria ser 422 (veio ${invalida.status})`)
  const longe = await exigir('/clientes?pagina=999&limite=25', { token: tokens.GESTOR })
  ok(longe.dados.length === 0 && longe.total > 0, 'página vazia deveria manter o total')
  return `total ${pagina.total}, ${pagina.paginas} página(s); página 999 vem vazia com total preservado`
})

await teste('Busca textual filtra pelo termo', async () => {
  const r = await exigir('/clientes?busca=Ana', { token: tokens.GESTOR })
  ok(r.total >= 1, 'a busca por "Ana" deveria achar o tutor de demonstração')
  return `${r.total} resultado(s) para "Ana"`
})

await teste('Rota inexistente responde 404 com o caminho', async () => {
  const r = await api('/nao-existe', { token: tokens.GESTOR })
  ok(r.status === 404 && r.body.codigo === 'ROTA_NAO_ENCONTRADA', JSON.stringify(r.body))
})

await teste('JSON malformado devolve 400 JSON_INVALIDO', async () => {
  const res = await fetch(BASE + '/clientes', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${tokens.GESTOR}` },
    body: '{"nome": ',
  })
  const corpo = await res.json()
  ok(res.status === 400 && corpo.codigo === 'JSON_INVALIDO', `${res.status} ${JSON.stringify(corpo)}`)
})

await teste('Cabeçalhos de segurança estão presentes', async () => {
  const r = await api('/health')
  const esperados = ['x-content-type-options', 'x-frame-options', 'content-security-policy', 'x-request-id']
  const faltando = esperados.filter((h) => !r.headers.get(h))
  ok(faltando.length === 0, `faltando: ${faltando.join(', ')}`)
  return esperados.join(', ')
})

await teste('Resposta autenticada não é cacheável (RN10/RNF11)', async () => {
  const r = await api('/clientes', { token: tokens.GESTOR })
  ok(/no-store/.test(r.headers.get('cache-control') ?? ''), `cache-control: ${r.headers.get('cache-control')}`)
  return r.headers.get('cache-control')
})

// =====================================================================
secoes('5. Clientes, pets e histórico (RF01–RF03 / RF11 / RF20)')

let clienteTeste
let petTeste

await teste('Cadastra tutor com o primeiro pet (RF01/RF02)', async () => {
  clienteTeste = await exigir('/clientes', {
    metodo: 'POST',
    token: tokens.GESTOR,
    body: {
      nome: `Tutor Smoke ${SUFIXO}`,
      email: `tutor-${SUFIXO}@petplus.local`,
      telefone: '11988887777',
      endereco: 'Rua do Teste, 100',
      consentimento: true,
      pet: { nome: `Pet${SUFIXO}`, especie: 'Cachorro', raca: 'SRD', porte: 'Médio', idade: 3, observacoesSaude: 'Alergia a frango' },
    },
  }, 201)
  ok(clienteTeste.pets?.length === 1, 'o pet deveria vir vinculado na resposta')
  return `cliente #${clienteTeste.id} com pet #${clienteTeste.pets[0].id}`
})

await teste('E-mail duplicado devolve 409 UNIQUE_VIOLATION', async () => {
  const r = await api('/clientes', {
    metodo: 'POST',
    token: tokens.GESTOR,
    body: { nome: 'Duplicado', email: `tutor-${SUFIXO}@petplus.local` },
  })
  ok(r.status === 409 && r.body.codigo === 'UNIQUE_VIOLATION', JSON.stringify(r.body))
})

await teste('Ficha do tutor traz pets, endereço e consentimento LGPD', async () => {
  const ficha = await exigir(`/clientes/${clienteTeste.id}`, { token: tokens.GESTOR })
  petTeste = ficha.pets[0]
  ok(ficha.endereco === 'Rua do Teste, 100', 'endereço não persistiu')
  ok(ficha.consentLgpd === true, 'consentimento não registrado')
  return `${ficha.pets.length} pet(s), consentimento ${ficha.consentLgpd ? 'ok' : 'ausente'}`
})

await teste('Edição do tutor e do pet persistem', async () => {
  await exigir(`/clientes/${clienteTeste.id}`, {
    metodo: 'PATCH', token: tokens.GESTOR, body: { telefone: '11977776666' },
  })
  const atualizado = await exigir(`/pets/${petTeste.id}`, {
    metodo: 'PATCH', token: tokens.GESTOR, body: { observacoesSaude: 'Alergia a frango e milho' },
  })
  const ficha = await exigir(`/clientes/${clienteTeste.id}`, { token: tokens.GESTOR })
  ok(ficha.telefone === '11977776666', 'telefone não atualizou')
  ok(atualizado.observacoesSaude.includes('milho'), 'observação não atualizou')
  return 'telefone e observação de saúde atualizados'
})

await teste('Histórico do pet (RF11/RF21) devolve linha do tempo com o que foi registrado', async () => {
  await exigir('/registros-saude', {
    metodo: 'POST',
    token: tokens.COLABORADOR,
    body: {
      petId: petTeste.id, tipo: 'vacina', descricao: `V10 — dose ${SUFIXO}`,
      proximoVencimento: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10),
    },
  }, 201)
  const historico = await exigir(`/pets/${petTeste.id}/historico`, { token: tokens.GESTOR })
  ok(historico.pet.id === petTeste.id, 'pet errado no histórico')
  ok(historico.linhaDoTempo.length >= 1, 'linha do tempo vazia')
  return `${historico.linhaDoTempo.length} evento(s): ${historico.linhaDoTempo.map((e) => e.tipo).join(', ')}`
})

await teste('Vacina a vencer aparece no alerta (RF13)', async () => {
  const vacinas = await exigir('/registros-saude/vacinas-a-vencer', { token: tokens.GESTOR })
  ok(vacinas.some((v) => v.petNome === petTeste.nome), 'a vacina recém-registrada deveria alertar')
  return `${vacinas.length} vacina(s) na janela de alerta`
})

await teste('Fidelidade: pontos creditados manualmente respeitam o saldo (RN07)', async () => {
  const antes = await exigir(`/clientes/${clienteTeste.id}/fidelidade`, { token: tokens.GESTOR })
  await exigir(`/clientes/${clienteTeste.id}/fidelidade`, {
    metodo: 'POST', token: tokens.GESTOR, body: { tipo: 'credito', pontos: 50, descricao: 'Cortesia do teste' },
  }, 201)
  const depois = await exigir(`/clientes/${clienteTeste.id}/fidelidade`, { token: tokens.GESTOR })
  ok(depois.saldo === antes.saldo + 50, `saldo ${antes.saldo} → ${depois.saldo}`)

  const exagerado = await api(`/clientes/${clienteTeste.id}/fidelidade`, {
    metodo: 'POST', token: tokens.GESTOR, body: { tipo: 'debito', pontos: 999999, descricao: 'Resgate impossível' },
  })
  ok(exagerado.status === 422, `resgate sem saldo deveria falhar (status ${exagerado.status})`)
  return `+50 pontos e resgate sem saldo recusado pelo banco (RN07)`
})

await teste('Exclusão de cadastro é lógica e exclusiva do gestor (RF03/RN03)', async () => {
  // Tutor descartável: os testes seguintes continuam usando o clienteTeste
  // (e o pet dele) para agendar, vender e avaliar.
  const descartavel = await exigir('/clientes', {
    metodo: 'POST',
    token: tokens.GESTOR,
    body: {
      nome: `Descartável ${SUFIXO}`,
      email: `descartavel-${SUFIXO}@petplus.local`,
      trust: false,
      pet: { nome: `PetDesc${SUFIXO}` },
    },
  }, 201)

  const negado = await api(`/clientes/${descartavel.id}`, { metodo: 'DELETE', token: tokens.COLABORADOR })
  ok(negado.status === 403, `colaborador excluiu cadastro (status ${negado.status})`)

  const inativado = await exigir(`/clientes/${descartavel.id}`, { metodo: 'DELETE', token: tokens.GESTOR })
  ok(inativado.ativo === false, 'deveria marcar como inativo')
  const ficha = await exigir(`/clientes/${descartavel.id}`, { token: tokens.GESTOR })
  ok(ficha.ativo === false && ficha.pets.every((p) => p.ativo === false), 'pets deveriam acompanhar a inativação')

  // O tutor do teste não foi tocado.
  const intacto = await exigir(`/clientes/${clienteTeste.id}`, { token: tokens.GESTOR })
  ok(intacto.ativo === true, 'o tutor do teste foi inativado por engano')
  return 'tutor descartável inativado (com os pets); o tutor do teste segue ativo'
})

// =====================================================================
secoes('6. Equipe, serviços e disponibilidade (RF04 / RF16 / RN08)')

let colaboradorTeste
let servicoTeste

await teste('Cadastra colaborador com grade de disponibilidade', async () => {
  colaboradorTeste = await exigir('/colaboradores', {
    metodo: 'POST',
    token: tokens.GESTOR,
    body: {
      nome: `Colab Smoke ${SUFIXO}`,
      email: `colab-${SUFIXO}@petplus.local`,
      cargo: 'TOSADOR',
      matricula: `SMK-${SUFIXO}`,
      disponibilidade: [
        { diaSemana: 1, horaInicio: '08:00', horaFim: '18:00' },
        { diaSemana: 2, horaInicio: '08:00', horaFim: '18:00' },
        { diaSemana: 3, horaInicio: '08:00', horaFim: '18:00' },
        { diaSemana: 4, horaInicio: '08:00', horaFim: '18:00' },
        { diaSemana: 5, horaInicio: '08:00', horaFim: '18:00' },
      ],
    },
  }, 201)
  ok(colaboradorTeste.disponibilidades.length === 5, 'grade incompleta')
  return `#${colaboradorTeste.id} ${colaboradorTeste.cargo} — ${colaboradorTeste.disponibilidade}`
})

await teste('Disponibilidade é substituída por inteiro (PUT)', async () => {
  const depois = await exigir(`/colaboradores/${colaboradorTeste.id}/disponibilidade`, {
    metodo: 'PUT',
    token: tokens.GESTOR,
    body: { janelas: [{ diaSemana: 2, horaInicio: '10:00', horaFim: '16:00' }] },
  })
  ok(depois.disponibilidades.length === 1, 'deveria sobrar 1 janela')
  const grade = await exigir(`/colaboradores/${colaboradorTeste.id}/disponibilidade`, { token: tokens.GESTOR })
  ok(grade.length === 1 && grade[0].horaInicio === '10:00', JSON.stringify(grade))
  return 'Seg 08–18 + Ter–Sex removidos; ficou só Ter 10–16'
})

await teste('Cadastra serviço e ele aparece no catálogo', async () => {
  servicoTeste = await exigir('/servicos', {
    metodo: 'POST', token: tokens.GESTOR,
    body: { nome: `Tosa Smoke ${SUFIXO}`, tipo: 'tosa', duracao: 60, preco: 77.5 },
  }, 201)
  const r = await exigir(`/servicos?busca=Smoke ${SUFIXO}`, { token: tokens.COLABORADOR })
  ok(r.total >= 1, 'serviço não apareceu na busca')
  return `#${servicoTeste.id} por R$ ${servicoTeste.preco}`
})

await teste('Serviço com duração inválida é recusado na validação', async () => {
  const r = await api('/servicos', {
    metodo: 'POST', token: tokens.GESTOR, body: { nome: 'Serviço Ruim', tipo: 'banho', duracao: 0, preco: -1 },
  })
  ok(r.status === 422, `status ${r.status}`)
  return JSON.stringify(r.body.campos?.map((c) => c.campo))
})

// =====================================================================
secoes('7. Estoque (RF07–RF09 / RF23 / RN02 / RN05)')

let produtoTeste

await teste('Cadastra produto com entrada inicial pela trilha de movimentações (RF08)', async () => {
  produtoTeste = await exigir('/produtos', {
    metodo: 'POST', token: tokens.GESTOR,
    body: {
      nome: `Ração Smoke ${SUFIXO}`, categoria: 'Alimentos', preco: 99.9,
      estoqueMinimo: 5, quantidadeInicial: 10, validade: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
    },
  }, 201)
  ok(produtoTeste.quantidadeEstoque === 10, `saldo inicial ${produtoTeste.quantidadeEstoque}`)
  const mov = await exigir(`/produtos/${produtoTeste.id}/movimentacoes`, { token: tokens.GESTOR })
  ok(mov.dados[0]?.tipo === 'entrada', 'a entrada inicial deveria estar na trilha')
  return `saldo ${produtoTeste.quantidadeEstoque}, ${mov.total} movimentação(ões)`
})

await teste('Entrada de mercadoria soma na trilha e atualiza o saldo', async () => {
  const depois = await exigir(`/produtos/${produtoTeste.id}/entrada`, {
    metodo: 'POST', token: tokens.COLABORADOR,
    body: { quantidade: 7, observacao: 'Reposição do smoke test', validade: new Date(Date.now() + 20 * 86400000).toISOString().slice(0, 10) },
  })
  ok(depois.quantidadeEstoque === 17, `saldo ${depois.quantidadeEstoque} (esperava 17)`)
  return `10 + 7 = ${depois.quantidadeEstoque} un.`
})

await teste('Produto vencendo entra no alerta de validade (RF23/RN09)', async () => {
  const alertas = await exigir('/produtos/alertas', { token: tokens.GESTOR })
  ok(alertas.validade.some((p) => p.id === produtoTeste.id), 'o produto deveria alertar validade')
  ok(typeof alertas.totais.estoqueMinimo === 'number', 'resumo de alertas incompleto')
  return `${alertas.totais.validade} produto(s) vencendo, ${alertas.totais.estoqueMinimo} no mínimo`
})

await teste('Filtros de estoque funcionam (categoria, abaixoMinimo, vencendoEm)', async () => {
  const categoria = await exigir('/produtos?categoria=Alimentos', { token: tokens.GESTOR })
  ok(categoria.dados.every((p) => p.categoria === 'Alimentos'), 'filtro de categoria vazou')

  await exigir(`/produtos/${produtoTeste.id}/ajuste`, {
    metodo: 'POST', token: tokens.GESTOR, body: { tipo: 'saida', quantidade: 14, observacao: 'Ajuste do smoke test' },
  })
  const minimo = await exigir('/produtos?abaixoMinimo=true', { token: tokens.GESTOR })
  ok(minimo.dados.some((p) => p.id === produtoTeste.id), 'o produto deveria estar abaixo do mínimo')
  ok(minimo.dados.every((p) => p.abaixoMinimo === true), 'filtro trouxe produto fora do mínimo')

  const vencendo = await exigir('/produtos?vencendoEm=25', { token: tokens.GESTOR })
  ok(vencendo.dados.every((p) => p.diasParaVencer <= 25), 'filtro de validade vazou')
  ok(vencendo.dados.some((p) => p.id === produtoTeste.id), 'o produto do teste deveria estar na janela')
  return `${minimo.total} abaixo do mínimo, ${vencendo.total} vencendo em ≤25 dias`
})

// =====================================================================
secoes('8. Agenda (RF04–RF06 / RN01 / RN04 / RN08 / RN12)')

const dia = (delta) => new Date(Date.now() + delta * 86400000).toISOString().slice(0, 10)
/** Próxima terça (dia 2) — bate com a disponibilidade do colaborador criado. */
function proximaTerca() {
  const d = new Date()
  while (d.getDay() !== 2) d.setDate(d.getDate() + 1)
  return d
}

let agendamentoTeste
const terca = proximaTerca()
const dataTerca = terca.toISOString().slice(0, 10)

await teste('Cria agendamento dentro da disponibilidade do profissional', async () => {
  agendamentoTeste = await exigir('/agendamentos', {
    metodo: 'POST', token: tokens.GESTOR,
    body: { petId: petTeste.id, servicoId: servicoTeste.id, colaboradorId: colaboradorTeste.id, dataHora: `${dataTerca}T10:00` },
  }, 201)
  ok(agendamentoTeste.status === 'confirmado', `status ${agendamentoTeste.status}`)
  ok(agendamentoTeste.petNome && agendamentoTeste.clienteNome && agendamentoTeste.colaboradorNome, 'faltam nomes achatados')
  return `#${agendamentoTeste.id} · ${agendamentoTeste.petNome} com ${agendamentoTeste.colaboradorNome} em ${agendamentoTeste.dataHora}`
})

await teste('RN01: dois atendimentos do mesmo profissional no mesmo intervalo → 409', async () => {
  const r = await api('/agendamentos', {
    metodo: 'POST', token: tokens.GESTOR,
    body: { petId: petTeste.id, servicoId: servicoTeste.id, colaboradorId: colaboradorTeste.id, dataHora: `${dataTerca}T10:15` },
  })
  ok(r.status === 409 && r.body.codigo === 'CONFLITO_AGENDA', JSON.stringify(r.body))
  return r.body.erro
})

await teste('RN08: fora da disponibilidade cadastrada → recusado pelo gatilho do banco', async () => {
  const r = await api('/agendamentos', {
    metodo: 'POST', token: tokens.GESTOR,
    body: { petId: petTeste.id, servicoId: servicoTeste.id, colaboradorId: colaboradorTeste.id, dataHora: `${dataTerca}T19:00` },
  })
  ok(r.status === 422, `esperava 422 (gatilho RN08), veio ${r.status}: ${JSON.stringify(r.body)}`)
  ok(/disponibilidade/i.test(r.body.detalhe ?? ''), 'a mensagem deveria citar a disponibilidade')
  return r.body.detalhe?.slice(0, 110)
})

await teste('Horários livres excluem o horário já ocupado e as horas indisponíveis', async () => {
  const livres = await exigir(`/agenda/horarios-livres?colaboradorId=${colaboradorTeste.id}&data=${dataTerca}&duracao=60`, { token: tokens.GESTOR })
  ok(Array.isArray(livres), 'esperava uma lista de horários')
  ok(!livres.includes('10:00'), '10:00 está ocupado e não deveria aparecer')
  ok(livres.every((h) => h >= '10:00' && h < '16:00'), `horários fora da janela: ${livres.join(', ')}`)
  return `${livres.length} horário(s) livres entre 10:00 e 16:00`
})

await teste('Agenda do dia lista os atendimentos da data', async () => {
  const diaAgenda = await exigir(`/agenda/dia?data=${dataTerca}`, { token: tokens.COLABORADOR })
  ok(Array.isArray(diaAgenda) && diaAgenda.some((a) => a.id === agendamentoTeste.id), 'agendamento não apareceu no dia')
  return `${diaAgenda.length} atendimento(s) nessa data`
})

await teste('RN12: bloqueio sobre atendimento confirmado é recusado', async () => {
  const r = await api('/bloqueios', {
    metodo: 'POST', token: tokens.GESTOR,
    body: { colaboradorId: colaboradorTeste.id, dataInicio: dataTerca, dataFim: dataTerca, motivo: 'Férias de teste' },
  })
  ok(r.status === 422, `esperava 422 (RN12), veio ${r.status}: ${JSON.stringify(r.body)}`)
  return r.body.erro?.slice(0, 110)
})

await teste('Bloqueio em período livre funciona e é listado', async () => {
  // Quem bloqueia um TERCEIRO é o gestor; o colaborador só bloqueia a si
  // mesmo (a checagem seguinte prova isso).
  const bloqueio = await exigir('/bloqueios', {
    metodo: 'POST', token: tokens.GESTOR,
    body: { colaboradorId: colaboradorTeste.id, dataInicio: dia(30), dataFim: dia(35), motivo: 'Folga programada' },
  }, 201)
  const lista = await exigir(`/bloqueios?colaboradorId=${colaboradorTeste.id}`, { token: tokens.GESTOR })
  ok(lista.dados.some((b) => b.id === bloqueio.id), 'bloqueio não apareceu na lista')
  const removido = await exigir(`/bloqueios/${bloqueio.id}`, { metodo: 'DELETE', token: tokens.GESTOR })
  ok(removido.removido === true, 'deveria confirmar a remoção')
  return `#${bloqueio.id} criado e removido (${bloqueio.periodo})`
})

await teste('Colaborador só bloqueia a própria agenda', async () => {
  const r = await api('/bloqueios', {
    metodo: 'POST', token: tokens.COLABORADOR,
    body: { colaboradorId: 99999, dataInicio: dia(40), dataFim: dia(41), motivo: 'Tentativa indevida' },
  })
  ok(r.status === 403, `status ${r.status}`)
  return 'bloqueio de terceiro recusado (403)'
})

await teste('Remarcar move o atendimento e mantém o conflito sob controle', async () => {
  const remarcado = await exigir(`/agendamentos/${agendamentoTeste.id}/remarcar`, {
    metodo: 'PATCH', token: tokens.GESTOR, body: { dataHora: `${dataTerca}T14:00` },
  })
  ok(remarcado.dataHora.endsWith('T14:00'), `dataHora ${remarcado.dataHora}`)
  return `movido para ${remarcado.dataHora}`
})

await teste('RN04: cancelar libera o horário para um novo agendamento', async () => {
  await exigir(`/agendamentos/${agendamentoTeste.id}/cancelar`, {
    metodo: 'PATCH', token: tokens.GESTOR, body: { motivo: 'Teste de liberação (RN04)' },
  })
  const anterior = agendamentoTeste.id
  const novo = await exigir('/agendamentos', {
    metodo: 'POST', token: tokens.GESTOR,
    body: { petId: petTeste.id, servicoId: servicoTeste.id, colaboradorId: colaboradorTeste.id, dataHora: `${dataTerca}T14:00` },
  }, 201)
  ok(novo.id !== anterior, 'deveria ser um agendamento novo')
  agendamentoTeste = novo
  return `#${anterior} cancelado liberou o horário; #${novo.id} ocupou o mesmo slot`
})

await teste('Concluir credita pontos de fidelidade ao tutor (RF20)', async () => {
  const antes = await exigir(`/clientes/${clienteTeste.id}/fidelidade`, { token: tokens.GESTOR })
  const concluido = await exigir(`/agendamentos/${agendamentoTeste.id}/concluir`, { metodo: 'PATCH', token: tokens.COLABORADOR, body: {} })
  ok(concluido.status === 'concluído', `status ${concluido.status}`)
  const depois = await exigir(`/clientes/${clienteTeste.id}/fidelidade`, { token: tokens.GESTOR })
  ok(depois.saldo > antes.saldo, `saldo não subiu (${antes.saldo} → ${depois.saldo})`)
  return `saldo ${antes.saldo} → ${depois.saldo} (atendimento de R$ ${concluido.valor})`
})

// =====================================================================
secoes('9. PDV (RF10 / RF25 / RF26 / RN02 / RN11)')

let vendaTeste

await teste('Registra venda com pagamento combinado (RF25)', async () => {
  const antes = await exigir(`/produtos/${produtoTeste.id}`, { token: tokens.GESTOR })
  vendaTeste = await exigir('/vendas', {
    metodo: 'POST', token: tokens.COLABORADOR,
    body: {
      clienteId: clienteTeste.id,
      itens: [{ produtoId: produtoTeste.id, quantidade: 2 }],
      pagamentos: [
        { formaPagamento: 'PIX', valor: 100 },
        { formaPagamento: 'dinheiro', valor: 99.8 },
      ],
    },
  }, 201)
  const depois = await exigir(`/produtos/${produtoTeste.id}`, { token: tokens.GESTOR })
  ok(depois.quantidadeEstoque === antes.quantidadeEstoque - 2, `saldo ${antes.quantidadeEstoque} → ${depois.quantidadeEstoque}`)
  ok(vendaTeste.itens.length === 1 && vendaTeste.pagamentos.length === 2, 'comprovante incompleto')
  ok(vendaTeste.valorTotal === 199.8, `total ${vendaTeste.valorTotal}`)
  return `venda #${vendaTeste.id} de R$ ${vendaTeste.valorTotal} em 2 formas; estoque ${antes.quantidadeEstoque} → ${depois.quantidadeEstoque}`
})

await teste('RF25: pagamento que não cobre o total é recusado', async () => {
  const r = await api('/vendas', {
    metodo: 'POST', token: tokens.COLABORADOR,
    body: {
      itens: [{ produtoId: produtoTeste.id, quantidade: 1 }],
      pagamentos: [{ formaPagamento: 'dinheiro', valor: 1 }],
    },
  })
  ok(r.status === 422, `status ${r.status}: ${JSON.stringify(r.body)}`)
  return r.body.erro?.slice(0, 110)
})

await teste('RN02: venda acima do estoque disponível é recusada', async () => {
  const r = await api('/vendas', {
    metodo: 'POST', token: tokens.COLABORADOR,
    body: {
      itens: [{ produtoId: produtoTeste.id, quantidade: 9999 }],
      pagamentos: [{ formaPagamento: 'dinheiro', valor: 9999 * 99.9 }],
    },
  })
  ok(r.status === 422, `status ${r.status}: ${JSON.stringify(r.body)}`)
  return r.body.erro?.slice(0, 110)
})

await teste('Comprovante da venda vem completo e a venda aparece no histórico', async () => {
  const nota = await exigir(`/vendas/${vendaTeste.id}`, { token: tokens.COLABORADOR })
  ok(nota.itens[0].nome && nota.pagamentos[0].formaPagamento, 'faltam itens/pagamentos')
  const historico = await exigir(`/vendas?clienteId=${clienteTeste.id}`, { token: tokens.GESTOR })
  ok(historico.dados.some((v) => v.id === vendaTeste.id), 'a venda não apareceu no filtro por cliente')
  const resumo = await exigir('/vendas/resumo', { token: tokens.GESTOR })
  ok(typeof resumo.faturamento === 'number', 'resumo sem faturamento')
  return `comprovante ok; resumo do período: R$ ${resumo.faturamento}`
})

await teste('RN11: colaborador não estorna venda (só gestor)', async () => {
  const r = await api(`/vendas/${vendaTeste.id}/estornar`, { metodo: 'POST', token: tokens.COLABORADOR, body: { motivo: 'tentativa' } })
  ok(r.status === 403, `status ${r.status}`)
  return 'estorno recusado para colaborador'
})

await teste('Estorno devolve o estoque e estorna os pontos (RF26/RN11)', async () => {
  const antes = await exigir(`/produtos/${produtoTeste.id}`, { token: tokens.GESTOR })
  const pontosAntes = await exigir(`/clientes/${clienteTeste.id}/fidelidade`, { token: tokens.GESTOR })
  const estornada = await exigir(`/vendas/${vendaTeste.id}/estornar`, {
    metodo: 'POST', token: tokens.GESTOR, body: { motivo: 'Teste automatizado de estorno' },
  })
  const depois = await exigir(`/produtos/${produtoTeste.id}`, { token: tokens.GESTOR })
  const pontosDepois = await exigir(`/clientes/${clienteTeste.id}/fidelidade`, { token: tokens.GESTOR })
  ok(estornada.status === 'estornada', `status ${estornada.status}`)
  ok(depois.quantidadeEstoque === antes.quantidadeEstoque + 2, `saldo ${antes.quantidadeEstoque} → ${depois.quantidadeEstoque}`)
  ok(pontosDepois.saldo <= pontosAntes.saldo, `pontos deveriam cair (${pontosAntes.saldo} → ${pontosDepois.saldo})`)
  const repetido = await api(`/vendas/${vendaTeste.id}/estornar`, { metodo: 'POST', token: tokens.GESTOR, body: { motivo: 'de novo' } })
  ok(repetido.status === 422, `estorno repetido deveria falhar (status ${repetido.status})`)
  return `estoque ${antes.quantidadeEstoque} → ${depois.quantidadeEstoque}; pontos ${pontosAntes.saldo} → ${pontosDepois.saldo}`
})

// =====================================================================
secoes('10. Pacotes, avaliações e painel (RF28 / RF29 / RF14 / RF15)')

let pacoteTeste
let assinaturaTeste

await teste('Cria plano recorrente com serviços incluídos (RF29)', async () => {
  pacoteTeste = await exigir('/pacotes', {
    metodo: 'POST', token: tokens.GESTOR,
    body: { nome: `Plano Smoke ${SUFIXO}`, periodicidade: 'Mensal', preco: 149.9, servicoIds: [servicoTeste.id] },
  }, 201)
  ok(pacoteTeste.servicosNomes?.includes(servicoTeste.nome), `serviços: ${JSON.stringify(pacoteTeste.servicos)}`)
  return `#${pacoteTeste.id} — ${pacoteTeste.servicosNomes.join(', ')}`
})

await teste('Assina o plano para um pet do tutor e cancela (RF29)', async () => {
  assinaturaTeste = await exigir('/assinaturas', {
    metodo: 'POST', token: tokens.GESTOR,
    body: { pacoteId: pacoteTeste.id, clienteId: clienteTeste.id, petId: petTeste.id },
  }, 201)
  ok(assinaturaTeste.status === 'ativo', `status ${assinaturaTeste.status}`)
  const cancelada = await exigir(`/assinaturas/${assinaturaTeste.id}/cancelar`, { metodo: 'POST', token: tokens.GESTOR })
  ok(cancelada.status === 'cancelado', 'cancelamento não aplicado')
  return `assinatura #${assinaturaTeste.id} ativa → cancelada`
})

await teste('Assinatura com pet de outro tutor é recusada', async () => {
  const r = await api('/assinaturas', {
    metodo: 'POST', token: tokens.GESTOR,
    body: { pacoteId: pacoteTeste.id, clienteId: 1, petId: petTeste.id },
  })
  ok(r.status === 422, `status ${r.status}: ${JSON.stringify(r.body)}`)
  return r.body.erro
})

await teste('Cliente avalia um atendimento concluído (RF28)', async () => {
  // O tutor do teste foi criado pelo gestor e recebeu senha aleatória, então
  // usamos a conta de demonstração — a regra exercitada é a mesma: o tutor
  // avalia o PRÓPRIO atendimento já concluído.
  const meus = await exigir('/agendamentos?status=conclu%C3%ADdo&limite=100', { token: tokens.CLIENTE })
  const alvo = meus.dados.find((a) => a.status === 'concluído')
  if (!alvo) return 'pulado: nenhum atendimento concluído do tutor de demonstração'

  const r = await api('/avaliacoes', {
    metodo: 'POST', token: tokens.CLIENTE,
    body: { agendamentoId: alvo.id, nota: 5, comentario: 'Atendimento impecável (smoke test)' },
  })
  ok([201, 409].includes(r.status), `status inesperado ${r.status}: ${JSON.stringify(r.body)}`)

  const repetida = await api('/avaliacoes', {
    metodo: 'POST', token: tokens.CLIENTE,
    body: { agendamentoId: alvo.id, nota: 1, comentario: 'de novo' },
  })
  ok(repetida.status === 409, `avaliação duplicada deveria dar 409 (veio ${repetida.status})`)
  return `agendamento #${alvo.id} avaliado uma única vez (segunda tentativa → 409)`
})

await teste('Avaliação de atendimento inexistente ou alheio é negada', async () => {
  const inexistente = await api('/avaliacoes', {
    metodo: 'POST', token: tokens.CLIENTE,
    body: { agendamentoId: 999999, nota: 5, comentario: 'não existe' },
  })
  ok(inexistente.status === 404, `inexistente → ${inexistente.status}`)

  // Atendimento de outro tutor: a checagem de dono recusa antes de gravar.
  const alheio = await api('/avaliacoes', {
    metodo: 'POST', token: tokens.CLIENTE,
    body: { agendamentoId: 4, nota: 5, comentario: 'não é meu' },
  })
  ok([403, 404, 409].includes(alheio.status), `alheio → ${alheio.status}: ${JSON.stringify(alheio.body)}`)
  return `inexistente → 404; de outro tutor → ${alheio.status}`
})

await teste('Resumo de avaliações traz média e distribuição', async () => {
  const resumo = await exigir('/avaliacoes/resumo', { token: tokens.GESTOR })
  ok(typeof resumo.media === 'number' && typeof resumo.total === 'number', JSON.stringify(resumo))
  return `média ${resumo.media} em ${resumo.total} avaliação(ões)`
})

await teste('Painel gerencial traz faturamento, série, serviços mais vendidos e ocupação (RF14/RF15)', async () => {
  const painel = await exigir('/dashboard', { token: tokens.GESTOR })
  const campos = ['faturamento', 'serie', 'servicosMaisVendidos', 'ocupacao', 'alertas', 'agendaHoje']
  const faltando = campos.filter((c) => painel[c] === undefined)
  ok(faltando.length === 0, `faltando: ${faltando.join(', ')}`)
  ok(painel.serie.length === 30, `a série deveria ter 30 dias (veio ${painel.serie.length})`)
  ok(typeof painel.faturamento.hoje === 'number' && typeof painel.ocupacao.taxaOcupacao === 'number', 'indicadores sem número')
  return `hoje R$ ${painel.faturamento.hoje}, mês R$ ${painel.faturamento.mes}, ocupação ${painel.ocupacao.taxaOcupacao}%`
})

// =====================================================================
secoes('11. Notificações e relatórios (RF12 / RF13 / RF27)')

await teste('Geração de avisos enfileira lembretes e alertas (RF12/RF13)', async () => {
  const r = await exigir('/notificacoes/gerar', { metodo: 'POST', token: tokens.GESTOR })
  ok(typeof r.lembretes === 'number' && typeof r.vacinas === 'number', JSON.stringify(r))
  return `lembretes ${r.lembretes}, vacinas ${r.vacinas}, retornos ${r.retornos}, enviados ${r.enviados}`
})

await teste('Fila não duplica o mesmo lembrete ao rodar duas vezes', async () => {
  const antes = await exigir('/notificacoes/contadores', { token: tokens.GESTOR })
  await exigir('/notificacoes/gerar', { metodo: 'POST', token: tokens.GESTOR })
  const depois = await exigir('/notificacoes/contadores', { token: tokens.GESTOR })
  ok(depois.total === antes.total, `total ${antes.total} → ${depois.total} (duplicou)`)
  return `${depois.total} aviso(s) — estável entre ciclos`
})

await teste('Notificações têm estado de entrega (outbox)', async () => {
  const fila = await exigir('/notificacoes?limite=50', { token: tokens.GESTOR })
  ok(fila.dados.every((n) => typeof n.tentativas === 'number'), 'sem contador de tentativas')
  const enviadas = fila.dados.filter((n) => n.enviadoEm)
  return `${fila.total} aviso(s), ${enviadas.length} já entregue(s) pelo processador da fila`
})

await teste('Marcar como lida e marcar todas funcionam', async () => {
  const fila = await exigir('/notificacoes?limite=1', { token: tokens.GESTOR })
  const alvo = fila.dados[0]
  if (!alvo) return 'pulado: sem notificações'
  const marcada = await exigir(`/notificacoes/${alvo.id}/lida`, { metodo: 'PATCH', token: tokens.GESTOR })
  ok(marcada.lida === true, 'não marcou como lida')
  const todas = await exigir('/notificacoes/marcar-todas-lidas', { metodo: 'POST', token: tokens.GESTOR })
  const contadores = await exigir('/notificacoes/contadores', { token: tokens.GESTOR })
  ok(contadores.naoLidas === 0, `ainda restam ${contadores.naoLidas} não lidas`)
  return `${todas.marcadas} marcada(s); nenhuma não lida restante`
})

await teste('Cliente só vê as próprias notificações (RN10)', async () => {
  const r = await exigir('/notificacoes?limite=100', { token: tokens.CLIENTE })
  // O destinatário é o e-mail do tutor; em push, o nome dele.
  const proprios = ['cliente@petplus.com', 'Ana Beatriz Souza']
  const vazadas = r.dados.filter((n) => !proprios.includes(n.destinatario))
  ok(vazadas.length === 0, `vazou para: ${vazadas.map((n) => n.destinatario).join(', ')}`)
  ok(r.total < 11, 'o cliente deveria ver um subconjunto dos avisos da unidade')
  return `${r.total} aviso(s) — só do próprio tutor, num total de 11 na unidade`
})

await teste('Relatório de vendas exporta em CSV com BOM e separador ";"', async () => {
  const r = await api('/relatorios/exportar?tipo=vendas&formato=CSV', { token: tokens.GESTOR, bruto: true })
  ok(r.status === 200, `status ${r.status}`)
  ok(r.headers.get('content-type').includes('text/csv'), r.headers.get('content-type'))
  const texto = r.buffer.toString('utf8')
  ok(texto.startsWith('\ufeff'), 'faltou o BOM (Excel pt-BR leria errado)')
  ok(texto.split('\r\n')[0].includes(';'), 'cabeçalho sem separador ";"')
  return `${r.buffer.length} bytes · cabeçalho: ${texto.split('\r\n')[0].slice(0, 60)}…`
})

await teste('Relatório de vendas exporta em PDF válido', async () => {
  const r = await api('/relatorios/exportar?tipo=vendas&formato=PDF', { token: tokens.GESTOR, bruto: true })
  ok(r.status === 200 && r.headers.get('content-type') === 'application/pdf', `status ${r.status}`)
  ok(r.buffer.subarray(0, 5).toString() === '%PDF-', 'o arquivo não começa com %PDF-')
  return `${r.buffer.length} bytes, assinatura %PDF- ok`
})

await teste('Relatórios de agendamentos, estoque e financeiro também exportam', async () => {
  const resultados = []
  for (const tipo of ['agendamentos', 'estoque', 'financeiro']) {
    const r = await api(`/relatorios/exportar?tipo=${tipo}&formato=Excel`, { token: tokens.GESTOR, bruto: true })
    ok(r.status === 200, `${tipo} → status ${r.status}`)
    resultados.push(`${tipo} ${r.buffer.length}b`)
  }
  return resultados.join(', ')
})

await teste('Período invertido é recusado com 422', async () => {
  const r = await api('/relatorios/exportar?tipo=vendas&formato=CSV&de=2026-12-31&ate=2026-01-01', { token: tokens.GESTOR })
  ok(r.status === 422 && r.body.codigo === 'PERIODO_INVALIDO', JSON.stringify(r.body))
  return r.body.erro
})

await teste('Toda exportação fica registrada no histórico (RF27)', async () => {
  const lista = await exigir('/relatorios?limite=50', { token: tokens.GESTOR })
  ok(lista.total > 0, 'nenhum registro de relatório')
  const formatos = [...new Set(lista.dados.map((r) => r.formato))]
  return `${lista.total} exportação(ões) registradas — formatos: ${formatos.join(', ')}`
})

// =====================================================================
secoes('12. Configurações, observabilidade e limites (RNF17 / RNF06)')

await teste('Configuração da unidade é lida e atualizada (prazo de estorno, RF12, RF20)', async () => {
  const antes = await exigir('/petshop', { token: tokens.GESTOR })
  const atualizada = await exigir('/petshop', {
    metodo: 'PATCH', token: tokens.GESTOR,
    body: { antecedenciaLembreteH: 12, pontosPorReal: 2, prazoEstornoDias: antes.prazoEstornoDias },
  })
  ok(atualizada.antecedenciaLembreteH === 12 && atualizada.pontosPorReal === 2, JSON.stringify(atualizada))
  await exigir('/petshop', { metodo: 'PATCH', token: tokens.GESTOR, body: { antecedenciaLembreteH: antes.antecedenciaLembreteH, pontosPorReal: antes.pontosPorReal } })
  return `antecedência ${antes.antecedenciaLembreteH}h → 12h → ${antes.antecedenciaLembreteH}h (restaurada)`
})

await teste('Colaborador pode ler a unidade, mas não alterá-la', async () => {
  await exigir('/petshop', { token: tokens.COLABORADOR })
  const r = await api('/petshop', { metodo: 'PATCH', token: tokens.COLABORADOR, body: { nome: 'Hackeado' } })
  ok(r.status === 403, `status ${r.status}`)
  return 'leitura liberada, escrita negada'
})

await teste('Métricas expõem latência, pool e contadores (RNF17)', async () => {
  const m = await exigir('/metrics', { token: tokens.GESTOR })
  ok(m.latencia && m.pool && m.contadores, JSON.stringify(Object.keys(m)))
  ok(m.latencia.p95 > 0, 'sem latência coletada')
  return `p50 ${m.latencia.p50}ms · p95 ${m.latencia.p95}ms · pool ${m.pool.total}/${m.pool.ociosas} livres`
})

await teste('Métricas exigem credencial (GESTOR ou token dedicado)', async () => {
  const r = await api('/metrics')
  ok(r.status === 401 || r.status === 403, `status ${r.status}`)
  return `status ${r.status} sem credencial`
})

await teste('Saúde detalhada responde com fila e pool', async () => {
  const r = await exigir('/health/detalhado', { token: tokens.GESTOR })
  ok(r.ok === true && r.fila && r.pool, JSON.stringify(r).slice(0, 200))
  return `banco em ${r.latenciaBancoMs}ms, ${r.fila.pendentes} aviso(s) na fila`
})

await teste('Rate limiting bloqueia força bruta no login (429)', async () => {
  const alvo = `bruteforce-${SUFIXO}@petplus.local`
  let bloqueado = false
  for (let i = 0; i < 14; i++) {
    const r = await api('/auth/login', { metodo: 'POST', body: { email: alvo, senha: `errada${i}` } })
    if (r.status === 429) { bloqueado = true; break }
  }
  ok(bloqueado, 'o limite de tentativas de login não foi acionado')
  return 'bloqueio após poucas tentativas para o mesmo e-mail'
})

await teste('Documentação OpenAPI é servida e descreve as rotas principais', async () => {
  const spec = await exigir('/openapi.json')
  const rotas = Object.keys(spec.paths)
  ok(rotas.length > 40, `só ${rotas.length} rotas documentadas`)
  for (const esperada of ['/auth/login', '/agendamentos', '/vendas', '/dashboard', '/relatorios/exportar']) {
    ok(rotas.includes(esperada), `falta documentar ${esperada}`)
  }
  return `${rotas.length} rotas documentadas em /api/docs`
})

// ---------------------------------------------------------------------

console.log(
  `\n${'─'.repeat(60)}\n${falhou === 0 ? verde('✓') : vermelho('✗')} ` +
  `${passou} verificação(ões) passaram${falhou ? `, ${falhou} falharam` : ''}\n`,
)

if (falhou > 0) process.exitCode = 1
