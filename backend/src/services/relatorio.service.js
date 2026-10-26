import PDFDocument from 'pdfkit'
import { paraCSV } from '../utils/csv.js'
import { dados as dadosDoRelatorio, registrar } from '../repositories/relatorio.repository.js'
import { obter as obterPetshop } from '../repositories/petshop.repository.js'

/**
 * Geração de relatórios (RF27).
 *
 * Fluxo: buscar os dados (`relatorio.repository.dados`) → renderizar no
 * formato pedido → registrar o metadado em `relatorio`. O arquivo vai na
 * própria resposta HTTP (stream), então não há arquivo órfão para limpar
 * depois e nenhum diretório compartilhado a proteger.
 */

export const FORMATOS = ['PDF', 'CSV', 'Excel']

const dinheiro = (v) =>
  v === null || v === undefined || v === ''
    ? ''
    : Number(v).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

/** Valor de exibição de uma célula (dinheiro formatado, resto como está). */
const valorDaCelula = (coluna, linha) => {
  const bruto = linha[coluna.campo]
  if (!coluna.dinheiro) return bruto ?? ''
  return dinheiro(bruto)
}

// ---------------------------------------------------------------------
// CSV / Excel
// ---------------------------------------------------------------------

/**
 * "Excel" e "CSV" usam o mesmo conteúdo: CSV com BOM e `;` abre
 * nativamente no Excel pt-BR. A diferença é só a extensão e o
 * Content-Type — e está documentado, em vez de fingir um .xlsx que não é.
 */
function renderizarCSV({ colunas, linhas, dinheiroCru = false }) {
  const colunasCsv = dinheiroCru
    ? colunas
    : colunas.map((c) => (c.dinheiro ? { ...c, campo: c.campo } : c))
  const linhasFormatadas = linhas.map((linha) => {
    const saida = {}
    for (const coluna of colunasCsv) saida[coluna.campo] = valorDaCelula(coluna, linha)
    return saida
  })
  return Buffer.from(paraCSV({ colunas: colunasCsv, linhas: linhasFormatadas }), 'utf8')
}

// ---------------------------------------------------------------------
// PDF
// ---------------------------------------------------------------------

const MARGEM = 30

/** Desenha cabeçalho, tabela e rodapé; devolve um Buffer. */
function renderizarPDF({ titulo, colunas, linhas, petshop, periodo, geradoPor }) {
  return new Promise((resolve, reject) => {
    // A4 paisagem: os relatórios têm de 6 a 8 colunas.
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGEM })
    const partes = []
    doc.on('data', (parte) => partes.push(parte))
    doc.on('end', () => resolve(Buffer.concat(partes)))
    doc.on('error', reject)

    const larguraPagina = doc.page.width - MARGEM * 2
    const escala = larguraPagina / colunas.reduce((s, c) => s + c.largura, 0)
    const larguras = colunas.map((c) => c.largura * escala)

    const cabecalho = () => {
      doc.font('Helvetica-Bold').fontSize(14).fillColor('#1f2937').text(petshop?.nome ?? 'PetPlus', MARGEM, MARGEM)
      doc.font('Helvetica').fontSize(9).fillColor('#4b5563')
        .text(`${titulo} · ${periodo ?? 'período completo'}`, MARGEM, MARGEM + 18)
      doc.fontSize(8).fillColor('#6b7280')
        .text(`Gerado em ${new Date().toLocaleString('pt-BR')}${geradoPor ? ` por ${geradoPor}` : ''}`,
          MARGEM, MARGEM + 30, { width: larguraPagina, align: 'right' })

      const y = MARGEM + 48
      doc.rect(MARGEM, y, larguraPagina, 16).fill('#f3f4f6')
      doc.fillColor('#111827').font('Helvetica-Bold').fontSize(8)
      let x = MARGEM
      colunas.forEach((coluna, i) => {
        doc.text(coluna.rotulo, x + 3, y + 4, { width: larguras[i] - 6, align: coluna.alinhamento ?? 'left' })
        x += larguras[i]
      })
      return y + 16
    }

    let y = cabecalho()
    doc.font('Helvetica').fontSize(8).fillColor('#111827')

    for (const linha of linhas) {
      // Quebra de página preservando o cabeçalho da tabela.
      if (y > doc.page.height - MARGEM - 20) {
        doc.addPage()
        y = cabecalho()
        doc.font('Helvetica').fontSize(8).fillColor('#111827')
      }
      let x = MARGEM
      let altura = 11
      colunas.forEach((coluna, i) => {
        const texto = String(valorDaCelula(coluna, linha) ?? '')
        const alturaTexto = doc.heightOfString(texto, { width: larguras[i] - 6 })
        altura = Math.max(altura, alturaTexto + 2)
      })
      // zebra sutil para leitura em tela
      if (Math.round((y - MARGEM) / 12) % 2 === 0) {
        doc.rect(MARGEM, y, larguraPagina, altura).fill('#fafafa')
        doc.fillColor('#111827')
      }
      x = MARGEM
      colunas.forEach((coluna, i) => {
        doc.text(String(valorDaCelula(coluna, linha) ?? ''), x + 3, y + 1, {
          width: larguras[i] - 6,
          align: coluna.alinhamento ?? 'left',
        })
        x += larguras[i]
      })
      y += altura
    }

    if (linhas.length === 0) {
      doc.font('Helvetica-Oblique').fillColor('#6b7280').text('Nenhum registro no período selecionado.', MARGEM, y + 6)
    }

    doc.font('Helvetica').fontSize(8).fillColor('#6b7280')
      .text(`${linhas.length} registro(s) · PetPlus`, MARGEM, doc.page.height - MARGEM - 8, {
        width: larguraPagina, align: 'center',
      })

    doc.end()
  })
}

// ---------------------------------------------------------------------
// Entrada única
// ---------------------------------------------------------------------

/**
 * Gera o relatório pedido e devolve o arquivo pronto para download.
 *
 *   const { arquivo, nomeArquivo, contentType } = await gerar(ctx, { tipo, formato, de, ate })
 */
export async function gerar(ctx, { tipo, formato, de, ate }) {
  const [petshop, dados] = await Promise.all([
    obterPetshop(ctx),
    dadosDoRelatorio(ctx, { tipo, de, ate }),
  ])

  const periodo = de || ate ? `${de ?? 'início'} a ${ate ?? 'hoje'}` : 'período completo'
  const carimbo = new Date().toISOString().slice(0, 10)

  let arquivo
  let contentType
  let extensao

  if (formato === 'PDF') {
    arquivo = await renderizarPDF({
      titulo: dados.titulo,
      colunas: dados.colunas,
      linhas: dados.linhas,
      petshop,
      periodo,
      geradoPor: ctx.perfil === 'GESTOR' ? 'gestor' : ctx.perfil.toLowerCase(),
    })
    contentType = 'application/pdf'
    extensao = 'pdf'
  } else {
    arquivo = renderizarCSV({ colunas: dados.colunas, linhas: dados.linhas })
    contentType = formato === 'Excel'
      ? 'application/vnd.ms-excel; charset=utf-8'
      : 'text/csv; charset=utf-8'
    extensao = formato === 'Excel' ? 'xls' : 'csv'
  }

  // Metadado registrado (RF27): quem gerou, quando, o quê e em que formato.
  const registro = await registrar(ctx, {
    tipo,
    formato,
    periodo,
    caminhoArquivo: null,
  })

  return {
    arquivo,
    contentType,
    nomeArquivo: `${tipo}-${carimbo}.${extensao}`,
    registro,
    resumo: {
      linhas: dados.linhas.length,
      tipo,
      formato,
      periodo,
      totais: dados.totais ?? null,
      servicos: dados.servicos ?? null,
    },
  }
}
