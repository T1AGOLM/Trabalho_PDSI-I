/**
 * Serialização CSV (RF27).
 *
 * Duas decisões pensando em quem abre o arquivo no Excel em português:
 *
 *  1. separador `;` (o Excel pt-BR usa vírgula como separador decimal, e
 *     com `,` como separador de campo tudo cairia em uma coluna só);
 *  2. **BOM UTF-8** no início — sem ele o Excel lê "Informação" como
 *     "InformaÃ§Ã£o".
 *
 * As regras de escape são as da RFC 4180: aspas duplicadas dentro de
 * aspas, e campo entre aspas quando contém separador, aspas ou quebra de
 * linha — o que também fecha a porta para CSV injection em fórmulas.
 */

export const SEPARADOR = ';'

/** Escapa um valor para CSV. */
export function campo(valor) {
  if (valor === null || valor === undefined) return ''
  const texto = String(valor)
  // Fórmula em célula (CSV injection): prefixa com apóstrofo para o Excel
  // tratar como texto. `-`/`+` numéricos legítimos ficam de fora.
  const perigoso = /^[=@\t\r]/.test(texto) || (/^[+-]/.test(texto) && /[A-Za-z(]/.test(texto))
  const seguro = perigoso ? `'${texto}` : texto
  return /[;"\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
}

/** Monta o CSV completo a partir de colunas ({rotulo}) e linhas ({campo}). */
export function paraCSV({ colunas, linhas }) {
  const cabecalho = colunas.map((c) => campo(c.rotulo)).join(SEPARADOR)
  const corpo = linhas.map((linha) => colunas.map((c) => campo(linha[c.campo])).join(SEPARADOR))
  return `\ufeff${[cabecalho, ...corpo].join('\r\n')}\r\n`
}
