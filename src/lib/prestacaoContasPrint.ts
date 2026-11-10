import logoUrl from '../assets/logo.png'
import type { RelatorioPrestacaoDados } from '../types/relatorios'
import {
  formatDateBR,
  formatDateTimeBR,
  formatPeriodoCurto,
  secaoAtividadesAtiva,
  secaoFrequenciaAtiva,
  secaoFotosAtiva,
} from './reportBuilder'

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function escapeAttr(value: string): string {
  return escapeHtml(value).replace(/`/g, '&#96;')
}

function safeImageUrl(value: string | null): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (/^https?:\/\//i.test(trimmed) || /^data:image\//i.test(trimmed)) return trimmed
  return null
}

function absoluteAssetUrl(value: string): string {
  if (/^https?:\/\//i.test(value) || /^data:/i.test(value)) return value
  if (typeof window === 'undefined') return value
  try {
    return new URL(value, window.location.href).href
  } catch {
    return value
  }
}

function emptyState(message: string): string {
  return `<p class="empty">${escapeHtml(message)}</p>`
}

function renderResumo(data: RelatorioPrestacaoDados): string {
  const items = [
    ['Alunos atendidos', data.resumo.alunosAtendidos],
    ['Turmas atendidas', data.resumo.totalTurmas],
    ['Oficinas realizadas', data.resumo.totalOficinasRealizadas],
    ['Frequência média', `${data.resumo.frequenciaMedia}%`],
    ['Alunos ativos', data.resumo.alunosAtivos],
    ['Atividades', data.resumo.totalAtividades],
    ['Chamadas', data.resumo.totalSessoes],
    ['Fotos', data.resumo.totalFotos],
  ]

  return `
    <section class="resumo">
      <div class="resumo-grid">
        ${items
          .map(
            ([label, value]) => `
              <div class="resumo-card">
                <strong>${escapeHtml(String(value))}</strong>
                <span>${escapeHtml(String(label))}</span>
              </div>`
          )
          .join('')}
      </div>
      <p class="legenda">
        Presenças: <strong>${data.resumo.presentes}</strong> ·
        Ausências: <strong>${data.resumo.ausentes}</strong> ·
        Justificadas: <strong>${data.resumo.justificados}</strong>.
        Justificativas são consideradas comparecimento no percentual.
      </p>
    </section>`
}

function renderAtividades(data: RelatorioPrestacaoDados): string {
  if (data.atividades.length === 0) {
    return `
      <section class="bloco">
        <h2>Atividades realizadas no período</h2>
        ${emptyState('Nenhuma atividade registrada no período.')}
      </section>`
  }

  const linhas = data.atividades
    .map(
      (atividade) => `
        <tr>
          <td class="nowrap">${escapeHtml(formatDateBR(atividade.data))}</td>
          <td>${escapeHtml(atividade.turmaNome)}</td>
          <td>${escapeHtml(atividade.oficinas.length > 0 ? atividade.oficinas.join(' · ') : '—')}</td>
          <td class="center">${
            atividade.presenca
              ? `${atividade.presenca.presentes}/${atividade.presenca.total}`
              : '—'
          }</td>
          <td>${escapeHtml(atividade.responsavelNome)}</td>
          <td class="center">${atividade.fotos.length}</td>
        </tr>`
    )
    .join('')

  const descritivos = data.atividades
    .filter((atividade) => atividade.observacoes)
    .map(
      (atividade) => `
        <article class="descritivo">
          <h3>${escapeHtml(formatDateBR(atividade.data))} · ${escapeHtml(atividade.turmaNome)}${
            atividade.oficinas.length > 0
              ? ` · ${escapeHtml(atividade.oficinas.join(', '))}`
              : ''
          }</h3>
          <p>${escapeHtml(atividade.observacoes)}</p>
        </article>`
    )
    .join('')

  return `
    <section class="bloco">
      <h2>Atividades realizadas no período</h2>
      <table>
        <thead>
          <tr>
            <th>Data</th>
            <th>Turma</th>
            <th>Oficinas</th>
            <th class="center">Presença</th>
            <th>Responsável</th>
            <th class="center">Fotos</th>
          </tr>
        </thead>
        <tbody>${linhas}</tbody>
      </table>
      ${
        descritivos
          ? `<h3 class="subtitulo">Registros descritivos</h3>${descritivos}`
          : ''
      }
    </section>`
}

function renderFrequencia(data: RelatorioPrestacaoDados): string {
  if (data.turmas.length === 0) {
    return `
      <section class="bloco">
        <h2>Frequência</h2>
        ${emptyState('Nenhuma turma encontrada para os filtros selecionados.')}
      </section>`
  }

  const blocos = data.turmas
    .map((turma) => {
      const alunos = turma.alunos
        .map(
          (aluno) => `
            <tr>
              <td>${escapeHtml(aluno.alunoNome)}</td>
              <td class="center">${aluno.sessoes}</td>
              <td class="center">${aluno.presentes}</td>
              <td class="center">${aluno.ausentes}</td>
              <td class="center">${aluno.justificados}</td>
              <td class="center">${
                aluno.semRegistro ? 'Sem registro' : `${aluno.percentual}%`
              }</td>
            </tr>`
        )
        .join('')

      return `
        <article class="turma-bloco">
          <div class="turma-cabecalho">
            <h3>${escapeHtml(turma.turmaNome)}</h3>
            <span>${escapeHtml(formatPeriodoCurto(turma.periodo) || 'Período não informado')} · ${turma.percentual}% de frequência</span>
          </div>
          <table class="compacta">
            <thead>
              <tr>
                <th>Indicador</th>
                <th class="center">Chamadas</th>
                <th class="center">Presentes</th>
                <th class="center">Ausentes</th>
                <th class="center">Justificadas</th>
                <th class="center">Frequência</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Total da turma</td>
                <td class="center">${turma.sessoes}</td>
                <td class="center">${turma.presentes}</td>
                <td class="center">${turma.ausentes}</td>
                <td class="center">${turma.justificados}</td>
                <td class="center"><strong>${turma.percentual}%</strong></td>
              </tr>
            </tbody>
          </table>
          ${
            alunos
              ? `<table class="compacta">
                  <thead>
                    <tr>
                      <th>Aluno</th>
                      <th class="center">Chamadas</th>
                      <th class="center">P</th>
                      <th class="center">A</th>
                      <th class="center">J</th>
                      <th class="center">Frequência</th>
                    </tr>
                  </thead>
                  <tbody>${alunos}</tbody>
                </table>`
              : emptyState('Nenhum aluno vinculado a esta turma.')
          }
        </article>`
    })
    .join('')

  return `
    <section class="bloco">
      <h2>Frequência por turma e aluno</h2>
      ${blocos}
      <p class="legenda">
        P = presentes, A = ausentes, J = justificadas. O percentual considera presentes + justificadas.
      </p>
    </section>`
}

function renderFotos(data: RelatorioPrestacaoDados): string {
  if (data.fotos.length === 0) {
    return `
      <section class="bloco">
        <h2>Registro fotográfico</h2>
        ${emptyState('Nenhuma foto anexada no período.')}
      </section>`
  }

  const fotos = data.fotos
    .map((foto) => {
      const url = safeImageUrl(foto.url)
      const legenda = `${formatDateBR(foto.data)} · ${foto.turmaNome}${
        foto.oficinas.length > 0 ? ` · ${foto.oficinas.join(', ')}` : ''
      }${foto.legenda ? ` · ${foto.legenda}` : ''}`

      return `
        <figure class="foto">
          ${
            url
              ? `<img alt="${escapeAttr(foto.legenda || foto.nomeArquivo)}" src="${escapeAttr(url)}" onerror="this.outerHTML='<div class=&quot;foto-indisponivel&quot;>Foto indisponível</div>'" />`
              : '<div class="foto-indisponivel">Foto indisponível</div>'
          }
          <figcaption>${escapeHtml(legenda)}</figcaption>
        </figure>`
    })
    .join('')

  return `
    <section class="bloco">
      <h2>Registro fotográfico</h2>
      <div class="fotos-grid">${fotos}</div>
    </section>`
}

function renderAvisos(data: RelatorioPrestacaoDados): string {
  if (data.avisos.length === 0) return ''
  return `
    <section class="bloco">
      <h2>Observações de integridade dos dados</h2>
      <ul class="avisos">
        ${data.avisos.map((aviso) => `<li>${escapeHtml(aviso)}</li>`).join('')}
      </ul>
    </section>`
}

function renderRestricaoImagem(data: RelatorioPrestacaoDados): string {
  if (!secaoFotosAtiva(data.filtros)) return ''
  if (!data.restricaoImagem.possuiAlunoSemAutorizacao) return ''
  const turmas = data.restricaoImagem.turmas
    .map(
      (turma) => `
        <li>
          <strong>${escapeHtml(turma.turmaNome)}:</strong>
          ${escapeHtml(turma.alunosSemAutorizacao.join(', '))}
        </li>`
    )
    .join('')

  return `
    <section class="bloco alerta">
      <h2>Restrição de uso de imagem (LGPD)</h2>
      <p>
        As fotos que poderiam envolver alunos sem autorização registrada foram omitidas do relatório.
        A regra de autorização por matrícula e turma permanece pendente de validação institucional.
      </p>
      <ul>${turmas}</ul>
    </section>`
}

function renderAssinatura(data: RelatorioPrestacaoDados): string {
  return `
    <section class="bloco assinatura">
      <h2>Responsável pela emissão</h2>
      <p>
        ${
          data.fotosOmitidasPorAutorizacao
            ? `${data.fotosOmitidasPorAutorizacao} foto(s) omitida(s) por falta de autorização comprovada.`
            : !secaoFotosAtiva(data.filtros)
              ? 'Relatório gerado sem registro fotográfico.'
              : 'Imagens incluídas somente quando a autorização foi comprovada para os alunos vinculados.'
        }
      </p>
      <div class="linha-assinatura"></div>
      <span>Assinatura e carimbo da Direção</span>
    </section>`
}

export function buildPrintHtml(data: RelatorioPrestacaoDados): string {
  const secoes = [
    secaoAtividadesAtiva(data.filtros.tipo) ? renderAtividades(data) : '',
    secaoFrequenciaAtiva(data.filtros.tipo) ? renderFrequencia(data) : '',
    secaoFotosAtiva(data.filtros) ? renderFotos(data) : '',
    renderAvisos(data),
    renderRestricaoImagem(data),
    renderAssinatura(data),
  ]
    .filter(Boolean)
    .join('')

  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Prestação de contas — ${escapeHtml(data.periodoLabel)}</title>
  <style>
    :root {
      --verde: #2d915d;
      --verde-escuro: #247749;
      --verde-claro: #f3faf6;
      --navy: #172c40;
      --texto: #3c4650;
      --muted: #64737e;
      --borda: #dde4e9;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--texto);
      background: #eef2f4;
      font-family: Arial, Helvetica, sans-serif;
      font-size: 10pt;
      line-height: 1.45;
    }
    .pagina {
      width: 210mm;
      min-height: 297mm;
      margin: 12mm auto;
      padding: 14mm 15mm 18mm;
      background: white;
      box-shadow: 0 4px 20px rgba(23, 44, 64, 0.12);
    }
    .cabecalho {
      display: flex;
      align-items: flex-start;
      gap: 12px;
      padding-bottom: 10px;
      border-bottom: 2px solid var(--verde);
    }
    .logo {
      width: 17mm;
      height: 17mm;
      flex: 0 0 auto;
      object-fit: contain;
      border-radius: 50%;
    }
    .logo-fallback {
      display: grid;
      width: 17mm;
      height: 17mm;
      flex: 0 0 auto;
      place-items: center;
      color: white;
      background: var(--verde);
      border-radius: 50%;
      font-weight: bold;
    }
    .identidade { flex: 1; min-width: 0; }
    .identidade strong {
      display: block;
      color: var(--navy);
      font-size: 11pt;
    }
    .identidade span {
      display: block;
      color: var(--muted);
      font-size: 7.5pt;
    }
    h1 {
      margin: 14px 0 2px;
      color: var(--verde-escuro);
      font-size: 16pt;
      letter-spacing: -0.01em;
    }
    .periodo {
      margin: 0;
      color: var(--muted);
      font-size: 9pt;
    }
    .resumo-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 6px;
      margin-top: 14px;
    }
    .resumo-card {
      padding: 9px 8px;
      text-align: center;
      background: var(--verde-claro);
      border-radius: 6px;
    }
    .resumo-card strong {
      display: block;
      color: var(--verde-escuro);
      font-size: 15pt;
      line-height: 1.1;
    }
    .resumo-card span {
      color: var(--muted);
      font-size: 7.5pt;
    }
    .legenda {
      margin: 9px 0 0;
      color: var(--muted);
      font-size: 8pt;
    }
    .bloco {
      margin-top: 18px;
      break-inside: avoid-page;
    }
    .bloco > h2 {
      margin: 0 0 8px;
      padding-left: 8px;
      color: var(--verde-escuro);
      border-left: 3px solid var(--verde);
      font-size: 12pt;
    }
    .subtitulo {
      margin: 12px 0 6px;
      color: var(--navy);
      font-size: 10pt;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      font-size: 8pt;
    }
    th {
      padding: 5px 6px;
      color: white;
      background: var(--verde);
      font-weight: bold;
      text-align: left;
    }
    td {
      padding: 4px 6px;
      border-bottom: 1px solid var(--borda);
      vertical-align: top;
    }
    tbody tr:nth-child(even) { background: #f7fbf8; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
    .center { text-align: center; }
    .nowrap { white-space: nowrap; }
    .compacta { margin-top: 6px; }
    .turma-bloco {
      margin-top: 12px;
      padding: 9px 10px;
      border: 1px solid var(--borda);
      border-radius: 6px;
      break-inside: avoid-page;
    }
    .turma-cabecalho {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 12px;
    }
    .turma-cabecalho h3 {
      margin: 0;
      color: var(--navy);
      font-size: 10pt;
    }
    .turma-cabecalho span {
      color: var(--muted);
      font-size: 8pt;
    }
    .descritivo {
      margin-top: 8px;
      break-inside: avoid-page;
    }
    .descritivo h3 {
      margin: 0;
      color: var(--navy);
      font-size: 9pt;
    }
    .descritivo p {
      margin: 2px 0 0;
      text-align: justify;
      font-size: 9pt;
    }
    .fotos-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
    }
    .foto {
      margin: 0;
      padding: 4px;
      border: 1px solid var(--borda);
      border-radius: 6px;
      break-inside: avoid-page;
    }
    .foto img,
    .foto-indisponivel {
      width: 100%;
      height: 55mm;
      object-fit: cover;
      background: #f0f3f5;
      border-radius: 4px;
    }
    .foto-indisponivel {
      display: grid;
      place-items: center;
      color: var(--muted);
      font-size: 8pt;
    }
    .foto figcaption {
      padding: 4px 2px 1px;
      color: var(--muted);
      font-size: 7.5pt;
      overflow-wrap: anywhere;
    }
    .empty {
      padding: 12px;
      color: var(--muted);
      background: #f7f9fa;
      border-radius: 6px;
      font-size: 9pt;
    }
    .avisos {
      margin: 0;
      padding-left: 18px;
      color: #8a3d36;
      font-size: 8.5pt;
    }
    .alerta {
      padding: 10px 12px;
      background: #fff8e1;
      border: 1px solid #f5dfa8;
      border-radius: 6px;
    }
    .alerta > h2 {
      border-left-color: #ed9800;
      color: #8a5a00;
    }
    .alerta p,
    .alerta ul {
      margin: 0;
      color: #7a5200;
      font-size: 8.5pt;
    }
    .alerta ul { margin-top: 5px; padding-left: 18px; }
    .assinatura {
      margin-top: 26px;
      break-inside: avoid-page;
    }
    .assinatura p {
      margin: 0;
      color: var(--muted);
      font-size: 8pt;
    }
    .linha-assinatura {
      width: 80mm;
      margin-top: 22px;
      border-top: 1px solid var(--muted);
    }
    .assinatura > span {
      color: var(--muted);
      font-size: 8pt;
    }
    .rodape {
      margin-top: 18px;
      padding-top: 6px;
      color: var(--muted);
      border-top: 1px solid var(--borda);
      font-size: 7pt;
    }
    @media print {
      body { background: white; }
      .pagina {
        width: auto;
        min-height: 0;
        margin: 0;
        padding: 0;
        box-shadow: none;
      }
      @page { size: A4 portrait; margin: 14mm 15mm 16mm; }
    }
  </style>
</head>
<body>
  <main class="pagina">
    <header class="cabecalho">
      <img class="logo" alt="" src="${escapeAttr(absoluteAssetUrl(logoUrl))}" />
      <div class="identidade">
        <strong>Fundação Toque - FUNBESCO</strong>
        <span>Fundação para o Bem Estar Educacional, Esportivo, Social, Cultural e Ocupacional</span>
        <span>de Araraquara e Região - CNPJ 08.409.109/0001-99</span>
      </div>
    </header>
    <h1>Relatório de Prestação de Contas</h1>
    <p class="periodo">Período: ${escapeHtml(data.periodoLabel)} · Emitido em ${escapeHtml(
      formatDateTimeBR(data.geradoEm)
    )}</p>
    ${renderResumo(data)}
    ${secoes}
    <footer class="rodape">
      Documento gerado eletronicamente pelo Sistema Fundação Toque em ${escapeHtml(
        formatDateTimeBR(data.geradoEm)
      )}.
    </footer>
  </main>
</body>
</html>`
}

export function printPrestacaoContas(data: RelatorioPrestacaoDados): void {
  const printWindow = window.open('', '_blank')
  if (!printWindow) {
    throw new Error(
      'O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente novamente.'
    )
  }

  printWindow.document.open()
  printWindow.document.write(buildPrintHtml(data))
  printWindow.document.close()

  let printed = false
  const triggerPrint = () => {
    if (printed) return
    printed = true
    try {
      printWindow.focus()
      printWindow.print()
    } catch (error) {
      console.warn('Não foi possível abrir a impressão:', error)
    }
  }

  const images = Array.from(printWindow.document.images)
  if (images.length === 0) {
    window.setTimeout(triggerPrint, 150)
    return
  }

  let pending = images.length
  const imageDone = () => {
    pending -= 1
    if (pending <= 0) window.setTimeout(triggerPrint, 150)
  }

  images.forEach((image) => {
    if (image.complete) {
      imageDone()
      return
    }
    image.addEventListener('load', imageDone, { once: true })
    image.addEventListener('error', imageDone, { once: true })
  })

  window.setTimeout(triggerPrint, 5000)
}
