import { test } from 'node:test'
import assert from 'node:assert/strict'
import { campo, paraCSV, SEPARADOR } from '../../src/utils/csv.js'

test('campo escapa separador, aspas e quebra de linha (RFC 4180)', () => {
  assert.equal(campo('simples'), 'simples')
  assert.equal(campo(`com${SEPARADOR}ponto e vírgula`), `"com${SEPARADOR}ponto e vírgula"`)
  assert.equal(campo('aspas "internas"'), '"aspas ""internas"""')
  assert.equal(campo('duas\nlinhas'), '"duas\nlinhas"')
})

test('campo trata nulo e indefinido como texto vazio', () => {
  assert.equal(campo(null), '')
  assert.equal(campo(undefined), '')
  assert.equal(campo(0), '0')
})

test('fórmulas são neutralizadas (CSV injection)', () => {
  // Uma célula que o Excel interpretaria como fórmula ganha apóstrofo.
  // O apóstrofo entra antes do escape de campo, que continua valendo.
  assert.equal(
    campo('=HYPERLINK("http://mau.example")'),
    `"'=HYPERLINK(""http://mau.example"")"`,
  )
  assert.equal(campo('@SUM(A1:A9)'), "'@SUM(A1:A9)")
  // Número negativo continua número (o sinal é do valor, não uma fórmula).
  assert.equal(campo(-12.5), '-12.5')
})

test('paraCSV gera BOM, cabeçalho e CRLF', () => {
  const csv = paraCSV({
    colunas: [{ campo: 'nome', rotulo: 'Produto' }, { campo: 'preco', rotulo: 'Preço' }],
    linhas: [{ nome: 'Ração; 15kg', preco: '189,90' }],
  })
  assert.ok(csv.startsWith('\ufeff'), 'deve começar com BOM para o Excel pt-BR')
  const linhas = csv.split('\r\n')
  assert.equal(linhas[0], '\ufeffProduto;Preço')
  assert.equal(linhas[1], '"Ração; 15kg";189,90')
  assert.equal(linhas[2], '')
})

test('paraCSV sem linhas devolve só o cabeçalho', () => {
  const csv = paraCSV({ colunas: [{ campo: 'a', rotulo: 'A' }], linhas: [] })
  assert.equal(csv, '\ufeffA\r\n')
})
