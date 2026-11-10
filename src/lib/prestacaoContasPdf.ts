import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import logoUrl from '../assets/logo.png'
import type { RelatorioPrestacaoDados } from '../types/relatorios'
import {
  buildReportFileName,
  formatDateBR,
  formatDateTimeBR,
  secaoAtividadesAtiva,
  secaoFrequenciaAtiva,
  secaoFotosAtiva,
} from './reportBuilder'

const PAGE_WIDTH = 210
const MARGIN = 15
const CONTENT_WIDTH = PAGE_WIDTH - MARGIN * 2
const CONTENT_START_Y = 60
const CONTENT_BOTTOM = 277

const GREEN: [number, number, number] = [45, 145, 93]
const GREEN_DARK: [number, number, number] = [36, 119, 73]
const GREEN_LIGHT: [number, number, number] = [243, 250, 246]
const NAVY: [number, number, number] = [23, 44, 64]
const MUTED: [number, number, number] = [100, 115, 126]
const BORDER: [number, number, number] = [221, 228, 233]
const DANGER: [number, number, number] = [153, 27, 27]

interface ImagemPdf {
  dataUrl: string
  format: 'PNG' | 'JPEG'
  width: number
  height: number
}

export interface PdfProgress {
  atual: number
  total: number
  mensagem: string
}

export interface PdfResult {
  blob: Blob
  totalPages: number
  fileName: string
  fotosComErro: number
}

export interface PdfOptions {
  onProgress?: (progress: PdfProgress) => void
}

function getDoc(doc: jsPDF) {
  return doc as jsPDF & {
    lastAutoTable?: { finalY?: number }
  }
}

function ensureSpace(
  doc: jsPDF,
  data: RelatorioPrestacaoDados,
  logo: ImagemPdf | null,
  y: number,
  needed: number
): number {
  if (y + needed <= CONTENT_BOTTOM) return y
  doc.addPage()
  drawHeader(doc, data, logo)
  return CONTENT_START_Y
}

function drawHeader(doc: jsPDF, data: RelatorioPrestacaoDados, logo: ImagemPdf | null) {
  const docComPaginas = doc as jsPDF & { __ftHeaderPages?: Set<number> }
  const paginas = docComPaginas.__ftHeaderPages || new Set<number>()
  docComPaginas.__ftHeaderPages = paginas
  const paginaAtual = doc.getCurrentPageInfo().pageNumber
  if (paginas.has(paginaAtual)) return
  paginas.add(paginaAtual)

  if (logo) {
    doc.addImage(logo.dataUrl, logo.format, MARGIN, 10, 18, 18)
  } else {
    doc.setFillColor(...GREEN)
    doc.circle(MARGIN + 9, 19, 9, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('FT', MARGIN + 9, 20, { align: 'center' })
  }

  doc.setTextColor(...NAVY)
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11)
  doc.text('Fundação Toque - FUNBESCO', 36, 15)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.2)
  doc.setTextColor(...MUTED)
  doc.text('Fundação para o Bem Estar Educacional, Esportivo, Social, Cultural e Ocupacional', 36, 20)
  doc.text('de Araraquara e Região - CNPJ 08.409.109/0001-99', 36, 24)

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(14)
  doc.setTextColor(...GREEN_DARK)
  doc.text('RELATÓRIO DE PRESTAÇÃO DE CONTAS', MARGIN, 37)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(8.3)
  doc.setTextColor(70, 83, 94)
  doc.text(`Período: ${data.periodoLabel}`, MARGIN, 43.5)
  doc.text(`Emitido em: ${formatDateTimeBR(data.geradoEm)}`, MARGIN, 48.5)

  doc.setDrawColor(...GREEN)
  doc.setLineWidth(0.8)
  doc.line(MARGIN, 53, PAGE_WIDTH - MARGIN, 53)
}

function drawFooters(doc: jsPDF, data: RelatorioPrestacaoDados, totalPages: number) {
  for (let page = 1; page <= totalPages; page += 1) {
    doc.setPage(page)
    doc.setDrawColor(...BORDER)
    doc.setLineWidth(0.3)
    doc.line(MARGIN, 282, PAGE_WIDTH - MARGIN, 282)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.8)
    doc.setTextColor(...MUTED)
    doc.text(
      `Documento gerado eletronicamente pelo Sistema Fundação Toque em ${formatDateTimeBR(
        data.geradoEm
      )}.`,
      MARGIN,
      287
    )
    doc.text(`Página ${page} de ${totalPages}`, PAGE_WIDTH - MARGIN, 287, { align: 'right' })
  }
}

function sectionTitle(
  doc: jsPDF,
  data: RelatorioPrestacaoDados,
  logo: ImagemPdf | null,
  y: number,
  title: string
): number {
  let cursor = ensureSpace(doc, data, logo, y, 14)
  doc.setFillColor(...GREEN)
  doc.rect(MARGIN, cursor - 3.5, 2, 5, 'F')
  doc.setFont('helvetica', 'bold')
  doc.setFontSize(11.5)
  doc.setTextColor(...GREEN_DARK)
  doc.text(title, MARGIN + 5, cursor)
  cursor += 4
  doc.setDrawColor(...BORDER)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, cursor, PAGE_WIDTH - MARGIN, cursor)
  return cursor + 5
}

function drawParagraph(
  doc: jsPDF,
  data: RelatorioPrestacaoDados,
  logo: ImagemPdf | null,
  y: number,
  text: string,
  options: { bold?: boolean; size?: number; color?: [number, number, number] } = {}
): number {
  const fontSize = options.size || 8.5
  doc.setFont('helvetica', options.bold ? 'bold' : 'normal')
  doc.setFontSize(fontSize)
  doc.setTextColor(...(options.color || [60, 70, 80]))
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH) as string[]
  let cursor = ensureSpace(doc, data, logo, y, lines.length * (fontSize * 0.42) + 2)
  doc.text(lines, MARGIN, cursor)
  cursor += lines.length * (fontSize * 0.42) + 2
  return cursor
}

function drawSummary(
  doc: jsPDF,
  data: RelatorioPrestacaoDados,
  logo: ImagemPdf | null,
  y: number
): number {
  const items = [
    { label: 'Alunos atendidos', value: String(data.resumo.alunosAtendidos) },
    { label: 'Turmas atendidas', value: String(data.resumo.totalTurmas) },
    { label: 'Oficinas realizadas', value: String(data.resumo.totalOficinasRealizadas) },
    { label: 'Frequência média', value: `${data.resumo.frequenciaMedia}%` },
    { label: 'Alunos ativos', value: String(data.resumo.alunosAtivos) },
    { label: 'Atividades', value: String(data.resumo.totalAtividades) },
    { label: 'Chamadas', value: String(data.resumo.totalSessoes) },
    { label: 'Fotos', value: String(data.resumo.totalFotos) },
  ]

  const gap = 4
  const boxWidth = (CONTENT_WIDTH - gap * 3) / 4
  const boxHeight = 19
  let cursor = y

  items.forEach((item, index) => {
    const column = index % 4
    if (column === 0 && index > 0) cursor += boxHeight + gap
    const x = MARGIN + column * (boxWidth + gap)
    doc.setFillColor(...GREEN_LIGHT)
    doc.roundedRect(x, cursor, boxWidth, boxHeight, 2, 2, 'F')
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(15)
    doc.setTextColor(...GREEN_DARK)
    doc.text(item.value, x + boxWidth / 2, cursor + 8.5, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(6.8)
    doc.setTextColor(...MUTED)
    const labelLines = doc.splitTextToSize(item.label, boxWidth - 4) as string[]
    doc.text(labelLines, x + boxWidth / 2, cursor + 13.5, { align: 'center' })
  })

  cursor += boxHeight + 4
  return drawParagraph(
    doc,
    data,
    logo,
    cursor,
    `Presenças: ${data.resumo.presentes} · Ausências: ${data.resumo.ausentes} · Justificadas: ${data.resumo.justificados}. Justificativas são consideradas comparecimento no percentual.`,
    { size: 7.6, color: MUTED }
  )
}

function drawActivities(
  doc: jsPDF,
  data: RelatorioPrestacaoDados,
  logo: ImagemPdf | null,
  y: number
): number {
  let cursor = sectionTitle(doc, data, logo, y, 'Atividades realizadas no período')

  if (data.atividades.length === 0) {
    return drawParagraph(doc, data, logo, cursor, 'Nenhuma atividade registrada no período.', {
      color: MUTED,
    })
  }

  autoTable(doc, {
    startY: cursor,
    head: [['Data', 'Turma', 'Oficinas', 'Presença', 'Responsável', 'Fotos']],
    body: data.atividades.map((atividade) => [
      formatDateBR(atividade.data),
      atividade.turmaNome,
      atividade.oficinas.length > 0 ? atividade.oficinas.join(' · ') : '—',
      atividade.presenca
        ? `${atividade.presenca.presentes}/${atividade.presenca.total}`
        : '—',
      atividade.responsavelNome,
      String(atividade.fotos.length),
    ]),
    margin: { left: MARGIN, right: MARGIN, top: CONTENT_START_Y, bottom: 18 },
    styles: {
      font: 'helvetica',
      fontSize: 7.2,
      cellPadding: 1.6,
      overflow: 'linebreak',
      textColor: [45, 55, 64],
    },
    headStyles: {
      fillColor: GREEN,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
    },
    alternateRowStyles: { fillColor: [245, 250, 247] },
    columnStyles: {
      0: { cellWidth: 19 },
      1: { cellWidth: 30 },
      2: { cellWidth: 50 },
      3: { cellWidth: 19, halign: 'center' },
      4: { cellWidth: 40 },
      5: { cellWidth: 22, halign: 'center' },
    },
    didDrawPage: () => drawHeader(doc, data, logo),
  })

  cursor = (getDoc(doc).lastAutoTable?.finalY || cursor) + 5

  const comObservacoes = data.atividades.filter((atividade) => atividade.observacoes)
  if (comObservacoes.length > 0) {
    cursor = sectionTitle(doc, data, logo, cursor, 'Registros descritivos')
    for (const atividade of comObservacoes) {
      cursor = drawParagraph(
        doc,
        data,
        logo,
        cursor,
        `${formatDateBR(atividade.data)} · ${atividade.turmaNome}${
          atividade.oficinas.length > 0 ? ` · ${atividade.oficinas.join(', ')}` : ''
        }`,
        { bold: true, size: 8 }
      )
      cursor = drawParagraph(doc, data, logo, cursor, atividade.observacoes)
      cursor += 1
    }
  }

  return cursor
}

function drawFrequency(
  doc: jsPDF,
  data: RelatorioPrestacaoDados,
  logo: ImagemPdf | null,
  y: number
): number {
  let cursor = sectionTitle(doc, data, logo, y, 'Frequência por turma')

  if (data.turmas.length === 0) {
    return drawParagraph(
      doc,
      data,
      logo,
      cursor,
      'Nenhuma turma encontrada para os filtros selecionados.',
      { color: MUTED }
    )
  }

  autoTable(doc, {
    startY: cursor,
    head: [['Turma', 'Chamadas', 'Presentes', 'Ausentes', 'Justificadas', 'Frequência']],
    body: data.turmas.map((turma) => [
      turma.turmaNome,
      String(turma.sessoes),
      String(turma.presentes),
      String(turma.ausentes),
      String(turma.justificados),
      `${turma.percentual}%`,
    ]),
    margin: { left: MARGIN, right: MARGIN, top: CONTENT_START_Y, bottom: 18 },
    styles: {
      font: 'helvetica',
      fontSize: 8,
      cellPadding: 1.8,
      textColor: [45, 55, 64],
    },
    headStyles: {
      fillColor: GREEN,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
    },
    alternateRowStyles: { fillColor: [245, 250, 247] },
    columnStyles: {
      0: { cellWidth: 62 },
      1: { cellWidth: 24, halign: 'center' },
      2: { cellWidth: 23, halign: 'center' },
      3: { cellWidth: 23, halign: 'center' },
      4: { cellWidth: 25, halign: 'center' },
      5: { cellWidth: 23, halign: 'center' },
    },
    didDrawPage: () => drawHeader(doc, data, logo),
  })

  cursor = (getDoc(doc).lastAutoTable?.finalY || cursor) + 6
  cursor = sectionTitle(doc, data, logo, cursor, 'Frequência por aluno')

  const linhasAlunos = data.turmas.flatMap((turma) =>
    turma.alunos.map((aluno) => [
      turma.turmaNome,
      aluno.alunoNome,
      String(aluno.sessoes),
      String(aluno.presentes),
      String(aluno.ausentes),
      String(aluno.justificados),
      aluno.semRegistro ? 'Sem registro' : `${aluno.percentual}%`,
    ])
  )

  if (linhasAlunos.length === 0) {
    return drawParagraph(
      doc,
      data,
      logo,
      cursor,
      'Nenhum aluno vinculado às turmas selecionadas.',
      { color: MUTED }
    )
  }

  autoTable(doc, {
    startY: cursor,
    head: [['Turma', 'Aluno', 'Chamadas', 'P', 'A', 'J', 'Frequência']],
    body: linhasAlunos,
    margin: { left: MARGIN, right: MARGIN, top: CONTENT_START_Y, bottom: 18 },
    styles: {
      font: 'helvetica',
      fontSize: 7,
      cellPadding: 1.4,
      overflow: 'linebreak',
      textColor: [45, 55, 64],
    },
    headStyles: {
      fillColor: GREEN,
      textColor: [255, 255, 255],
      fontStyle: 'bold',
      halign: 'left',
    },
    alternateRowStyles: { fillColor: [245, 250, 247] },
    columnStyles: {
      0: { cellWidth: 32 },
      1: { cellWidth: 68 },
      2: { cellWidth: 18, halign: 'center' },
      3: { cellWidth: 12, halign: 'center' },
      4: { cellWidth: 12, halign: 'center' },
      5: { cellWidth: 12, halign: 'center' },
      6: { cellWidth: 26, halign: 'center' },
    },
    didDrawPage: () => drawHeader(doc, data, logo),
  })

  cursor = (getDoc(doc).lastAutoTable?.finalY || cursor) + 4
  return drawParagraph(
    doc,
    data,
    logo,
    cursor,
    'P = presentes, A = ausentes, J = justificadas. O percentual considera presentes + justificadas.',
    { size: 7, color: MUTED }
  )
}

async function drawPhotos(
  doc: jsPDF,
  data: RelatorioPrestacaoDados,
  logo: ImagemPdf | null,
  y: number,
  options: PdfOptions
): Promise<{ y: number; fotosComErro: number }> {
  const gap = 4
  const cellWidth = (CONTENT_WIDTH - gap) / 2
  const imageHeight = 60
  const captionHeight = 16
  const cellHeight = imageHeight + captionHeight + 6

  if (data.fotos.length === 0) {
    const cursor = sectionTitle(doc, data, logo, y, 'Registro fotográfico')
    return {
      y: drawParagraph(doc, data, logo, cursor, 'Nenhuma foto anexada no período.', {
        color: MUTED,
      }),
      fotosComErro: 0,
    }
  }

  let cursor = ensureSpace(doc, data, logo, y, 14 + cellHeight)
  cursor = sectionTitle(doc, data, logo, cursor, 'Registro fotográfico')

  const cache = new Map<string, ImagemPdf | null>()
  let fotosComErro = 0

  for (let index = 0; index < data.fotos.length; index += 2) {
    const linha = data.fotos.slice(index, index + 2)
    cursor = ensureSpace(doc, data, logo, cursor, cellHeight)

    for (let column = 0; column < linha.length; column += 1) {
      const foto = linha[column]
      const x = MARGIN + column * (cellWidth + gap)
      let imagem: ImagemPdf | null = null

      options.onProgress?.({
        atual: index + column + 1,
        total: data.fotos.length,
        mensagem: `Preparando foto ${index + column + 1} de ${data.fotos.length}...`,
      })

      if (foto.url) {
        if (cache.has(foto.url)) {
          imagem = cache.get(foto.url) || null
        } else {
          imagem = await carregarImagem(foto.url)
          cache.set(foto.url, imagem)
        }
      }

      doc.setFillColor(250, 251, 252)
      doc.setDrawColor(...BORDER)
      doc.setLineWidth(0.3)
      doc.roundedRect(x, cursor, cellWidth, cellHeight, 2, 2, 'FD')

      if (imagem) {
        const fitted = ajustarDimensoes(imagem.width, imagem.height, cellWidth - 4, imageHeight - 4)
        const imageX = x + (cellWidth - fitted.width) / 2
        const imageY = cursor + 2 + (imageHeight - 4 - fitted.height) / 2
        doc.addImage(
          imagem.dataUrl,
          imagem.format,
          imageX,
          imageY,
          fitted.width,
          fitted.height
        )
      } else {
        fotosComErro += 1
        doc.setFillColor(238, 242, 244)
        doc.roundedRect(x + 2, cursor + 2, cellWidth - 4, imageHeight - 4, 2, 2, 'F')
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7.5)
        doc.setTextColor(...MUTED)
        doc.text('Foto indisponível', x + cellWidth / 2, cursor + imageHeight / 2, {
          align: 'center',
        })
      }

      const legenda = [
        `${formatDateBR(foto.data)} · ${foto.turmaNome}${
          foto.oficinas.length > 0 ? ` · ${foto.oficinas.join(', ')}` : ''
        }`,
        foto.legenda || foto.nomeArquivo,
      ]
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(6.5)
      doc.setTextColor(...MUTED)
      const linhas = doc.splitTextToSize(legenda.join(' · '), cellWidth - 4) as string[]
      doc.text(linhas.slice(0, 3), x + 2, cursor + imageHeight + 4)
    }

    cursor += cellHeight + 2
  }

  return { y: cursor, fotosComErro }
}

function ajustarDimensoes(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: maxWidth, height: maxHeight }
  const escala = Math.min(maxWidth / width, maxHeight / height)
  return { width: width * escala, height: height * escala }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  if (typeof FileReader !== 'undefined') {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result))
      reader.onerror = () => reject(reader.error || new Error('Falha ao ler imagem.'))
      reader.readAsDataURL(blob)
    })
  }

  return blob.arrayBuffer().then((buffer) => {
    const bytes = new Uint8Array(buffer)
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    return `data:${blob.type || 'application/octet-stream'};base64,${btoa(binary)}`
  })
}

function carregarHtmlImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Falha ao decodificar imagem.'))
    image.src = src
  })
}

async function carregarImagem(url: string): Promise<ImagemPdf | null> {
  try {
    const controller = new AbortController()
    const timeout = globalThis.setTimeout(() => controller.abort(), 15000)
    const response = await fetch(url, { mode: 'cors', signal: controller.signal }).finally(() => {
      globalThis.clearTimeout(timeout)
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const blob = await response.blob()
    let dataUrl = await blobToDataUrl(blob)
    const mime = blob.type.toLowerCase()
    let format: 'PNG' | 'JPEG' | null = mime.includes('png')
      ? 'PNG'
      : mime.includes('jpeg') || mime.includes('jpg')
        ? 'JPEG'
        : null
    let width = 1
    let height = 1

    if (typeof Image !== 'undefined') {
      const image = await carregarHtmlImage(dataUrl)
      width = image.naturalWidth || image.width
      height = image.naturalHeight || image.height

      const limite = 1400
      if (format === null || Math.max(width, height) > limite) {
        const escala = Math.min(1, limite / Math.max(width, height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(width * escala))
        canvas.height = Math.max(1, Math.round(height * escala))
        const context = canvas.getContext('2d')
        if (context) {
          context.fillStyle = '#ffffff'
          context.fillRect(0, 0, canvas.width, canvas.height)
          context.drawImage(image, 0, 0, canvas.width, canvas.height)
          dataUrl = canvas.toDataURL('image/jpeg', 0.82)
          format = 'JPEG'
          width = canvas.width
          height = canvas.height
        }
      }
    }

    if (!format) return null
    return { dataUrl, format, width, height }
  } catch (error) {
    console.warn('Foto não incorporada ao PDF:', url, error)
    return null
  }
}

export async function generatePrestacaoContasPdf(
  data: RelatorioPrestacaoDados,
  options: PdfOptions = {}
): Promise<PdfResult> {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  doc.setProperties({
    title: `Prestação de contas - ${data.periodoLabel}`,
    subject: 'Relatório de prestação de contas - Fundação Toque',
    author: 'Fundação Toque',
    creator: 'Sistema Fundação Toque',
  })

  const logo = typeof document !== 'undefined' ? await carregarImagem(logoUrl) : null
  drawHeader(doc, data, logo)

  let cursor = CONTENT_START_Y
  cursor = drawSummary(doc, data, logo, cursor)

  if (secaoAtividadesAtiva(data.filtros.tipo)) {
    cursor = drawActivities(doc, data, logo, cursor)
  }

  if (secaoFrequenciaAtiva(data.filtros.tipo)) {
    cursor = drawFrequency(doc, data, logo, cursor)
  }

  let fotosComErro = 0
  if (secaoFotosAtiva(data.filtros)) {
    const resultadoFotos = await drawPhotos(doc, data, logo, cursor, options)
    cursor = resultadoFotos.y
    fotosComErro = resultadoFotos.fotosComErro
  }

  if (data.avisos.length > 0) {
    cursor = sectionTitle(doc, data, logo, cursor, 'Observações de integridade dos dados')
    for (const aviso of data.avisos) {
      cursor = drawParagraph(doc, data, logo, cursor, `• ${aviso}`, {
        size: 7.5,
        color: DANGER,
      })
    }
  }

  cursor = sectionTitle(doc, data, logo, cursor, 'Responsável pela emissão')
  cursor = drawParagraph(
    doc,
    data,
    logo,
    cursor,
    `${data.filtros.confirmacaoImagem ? 'A Direção confirmou a responsabilidade pelo uso das imagens.' : !secaoFotosAtiva(data.filtros) ? 'Relatório gerado sem registro fotográfico.' : data.restricaoImagem.possuiAlunoSemAutorizacao ? 'Relatório sem confirmação explícita de uso de imagem.' : 'Não há alunos sem autorização de imagem registrada nas turmas selecionadas.'}`,
    { size: 7.5, color: MUTED }
  )
  cursor = ensureSpace(doc, data, logo, cursor, 30)
  doc.setDrawColor(...MUTED)
  doc.setLineWidth(0.3)
  doc.line(MARGIN, cursor + 12, MARGIN + 80, cursor + 12)
  doc.setFont('helvetica', 'normal')
  doc.setFontSize(7.5)
  doc.setTextColor(...MUTED)
  doc.text('Assinatura e carimbo da Direção', MARGIN, cursor + 17)

  const totalPages = doc.getNumberOfPages()
  drawFooters(doc, data, totalPages)

  return {
    blob: doc.output('blob'),
    totalPages,
    fileName: buildReportFileName(data.filtros),
    fotosComErro,
  }
}
