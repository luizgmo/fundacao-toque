import type { RelatorioPrestacaoDados } from '../types/relatorios'
import { generatePrestacaoContasPdf } from './prestacaoContasPdf'
import type { PdfOptions, PdfResult } from './prestacaoContasPdf'
import { printPrestacaoContas } from './prestacaoContasPrint'
import {
  concluirRelatorioGerado,
  falharRelatorioGerado,
  iniciarRelatorioGerado,
} from '../services/relatoriosGeradosService'

export type ExportadorRelatorio = {
  id: string
  nome: string
}

function baixarBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = fileName
  link.rel = 'noopener'
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

async function iniciarRegistro(
  data: RelatorioPrestacaoDados,
  exportador: ExportadorRelatorio
): Promise<string | null> {
  if (!exportador.id) return null
  try {
    return await iniciarRelatorioGerado({
      tipoRelatorio: 'prestacao_contas',
      periodoInicio: data.filtros.periodoInicio,
      periodoFim: data.filtros.periodoFim,
      filtros: data.filtros,
      geradoPor: exportador.id,
    })
  } catch (error) {
    console.warn('Não foi possível registrar o relatório gerado:', error)
    return null
  }
}

async function concluirRegistro(id: string | null) {
  if (!id) return
  try {
    await concluirRelatorioGerado(id)
  } catch (error) {
    console.warn('Não foi possível concluir o registro do relatório gerado:', error)
  }
}

async function falharRegistro(id: string | null) {
  if (!id) return
  try {
    await falharRelatorioGerado(id)
  } catch (error) {
    console.warn('Não foi possível marcar o relatório gerado como falho:', error)
  }
}

async function registrarFalhaSemProcessando(
  data: RelatorioPrestacaoDados,
  exportador: ExportadorRelatorio
) {
  const id = await iniciarRegistro(data, exportador)
  await falharRegistro(id)
}

/**
 * Gera o PDF, dispara o download no navegador e mantém o registro em
 * `relatorios_gerados`. O arquivo não é armazenado: o histórico permite regerar.
 */
export async function gerarEBaixarPdfPrestacaoContas(
  data: RelatorioPrestacaoDados,
  exportador: ExportadorRelatorio,
  options: PdfOptions = {}
): Promise<PdfResult> {
  const registroId = await iniciarRegistro(data, exportador)

  try {
    const pdf = await generatePrestacaoContasPdf(data, options)
    baixarBlob(pdf.blob, pdf.fileName)
    await concluirRegistro(registroId)
    return pdf
  } catch (error) {
    await falharRegistro(registroId)
    throw error
  }
}

/**
 * Abre a janela de impressão de forma síncrona (para não ser bloqueada) e registra
 * a exportação na sequência. A promessa resolve quando o registro é gravado.
 */
export async function imprimirPrestacaoContasComRegistro(
  data: RelatorioPrestacaoDados,
  exportador: ExportadorRelatorio
): Promise<void> {
  try {
    printPrestacaoContas(data)
  } catch (error) {
    await registrarFalhaSemProcessando(data, exportador)
    throw error
  }

  const registroId = await iniciarRegistro(data, exportador)
  await concluirRegistro(registroId)
}
