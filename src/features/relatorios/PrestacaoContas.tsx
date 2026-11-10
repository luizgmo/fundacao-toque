import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertTriangle,
  CalendarDays,
  CalendarRange,
  CheckCircle2,
  Download,
  FileBarChart,
  FileDown,
  ImageOff,
  Info,
  Loader2,
  Printer,
  Search,
  ShieldAlert,
  ShieldCheck,
  Users,
} from 'lucide-react'
import type {
  PrestacaoContasFiltros,
  RelatorioPrestacaoDados,
  TipoRelatorioPrestacao,
} from '../../types/relatorios'
import { TIPO_RELATORIO_LABELS } from '../../types/relatorios'
import {
  buildReportFileName,
  formatPeriodoCurto,
  secaoFotosAtiva,
  todayISO,
  validatePrestacaoContasFiltros,
} from '../../lib/reportBuilder'
import { generatePrestacaoContasPdf } from '../../lib/prestacaoContasPdf'
import type { PdfProgress } from '../../lib/prestacaoContasPdf'
import { printPrestacaoContas } from '../../lib/prestacaoContasPrint'
import {
  loadPrestacaoContasData,
  loadTurmasParaFiltro,
} from '../../services/prestacaoContasService'
import type { RelatorioTurmaRaw } from '../../types/relatorios'
import { PrestacaoContasPreview } from './PrestacaoContasPreview'
import './PrestacaoContas.css'

type PeriodoPreset = 'hoje' | 'mes' | 'semestre' | 'ano'

type Feedback = {
  tone: 'success' | 'warning' | 'error'
  message: string
}

function criarFiltrosIniciais(): PrestacaoContasFiltros {
  const hoje = todayISO()
  return {
    periodoInicio: `${hoje.slice(0, 7)}-01`,
    periodoFim: hoje,
    turmaIds: [],
    tipo: 'consolidado',
    incluirFotos: true,
  }
}

function periodoDoPreset(preset: PeriodoPreset): { inicio: string; fim: string } {
  const hoje = todayISO()
  if (preset === 'hoje') return { inicio: hoje, fim: hoje }

  const ano = hoje.slice(0, 4)
  if (preset === 'mes') return { inicio: `${hoje.slice(0, 7)}-01`, fim: hoje }

  if (preset === 'semestre') {
    const mes = Number(hoje.slice(5, 7))
    return { inicio: mes <= 6 ? `${ano}-01-01` : `${ano}-07-01`, fim: hoje }
  }

  return { inicio: `${ano}-01-01`, fim: hoje }
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

export function PrestacaoContas() {
  const [filtros, setFiltros] = useState<PrestacaoContasFiltros>(criarFiltrosIniciais)
  const [turmas, setTurmas] = useState<RelatorioTurmaRaw[]>([])
  const [turmasCarregando, setTurmasCarregando] = useState(true)
  const [turmasErro, setTurmasErro] = useState<string | null>(null)
  const [data, setData] = useState<RelatorioPrestacaoDados | null>(null)
  const [carregandoDados, setCarregandoDados] = useState(false)
  const [processando, setProcessando] = useState(false)
  const [progresso, setProgresso] = useState<PdfProgress | null>(null)
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  useEffect(() => {
    let ativo = true
    loadTurmasParaFiltro()
      .then((lista) => {
        if (ativo) {
          setTurmas(lista)
          setTurmasErro(null)
        }
      })
      .catch((error: unknown) => {
        if (ativo) {
          setTurmasErro(
            error instanceof Error ? error.message : 'Não foi possível carregar as turmas.'
          )
        }
      })
      .finally(() => {
        if (ativo) setTurmasCarregando(false)
      })
    return () => {
      ativo = false
    }
  }, [])

  const possuiRestricaoImagem = Boolean(
    data && secaoFotosAtiva(data.filtros) && data.restricaoImagem.possuiAlunoSemAutorizacao
  )
  const podeExportar = Boolean(data) && !processando

  const atualizarFiltros = (patch: Partial<PrestacaoContasFiltros>) => {
    setFiltros((atual) => ({ ...atual, ...patch }))
    setData(null)
    setProgresso(null)
    setFeedback(null)
  }

  const alterarTipo = (tipo: TipoRelatorioPrestacao) => {
    atualizarFiltros({
      tipo,
      incluirFotos:
        tipo === 'fotos' ? true : tipo === 'frequencia' ? false : filtros.incluirFotos,
    })
  }

  const aplicarPreset = (preset: PeriodoPreset) => {
    const { inicio, fim } = periodoDoPreset(preset)
    atualizarFiltros({ periodoInicio: inicio, periodoFim: fim })
  }

  const alternarTurma = (turmaId: string) => {
    const selecionadas = filtros.turmaIds.includes(turmaId)
      ? filtros.turmaIds.filter((id) => id !== turmaId)
      : [...filtros.turmaIds, turmaId]
    atualizarFiltros({ turmaIds: selecionadas })
  }

  const gerarPrevia = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    const erroValidacao = validatePrestacaoContasFiltros(filtros)
    if (erroValidacao) {
      setFeedback({ tone: 'error', message: erroValidacao })
      return
    }

    setCarregandoDados(true)
    setFeedback(null)
    setData(null)

    try {
      const relatorio = await loadPrestacaoContasData(filtros)
      setData(relatorio)
      if (
        secaoFotosAtiva(relatorio.filtros) &&
        (relatorio.restricaoImagem.possuiAlunoSemAutorizacao ||
          (relatorio.fotosOmitidasPorAutorizacao || 0) > 0)
      ) {
        const fotosBloqueadas = relatorio.restricaoImagem.fotosBloqueadas
        setFeedback({
          tone: 'warning',
          message:
            fotosBloqueadas > 0
              ? `Prévia carregada com ${fotosBloqueadas} foto(s) omitida(s): há alunos sem autorização de uso de imagem nas turmas selecionadas. Veja abaixo os nomes e a ação necessária.`
              : 'Prévia carregada. Há alunos sem autorização de uso de imagem: as fotos dessas turmas não entram no PDF nem na impressão. Veja abaixo a ação necessária.',
        })
      } else {
        setFeedback({
          tone: 'success',
          message: 'Prévia carregada. Revise os dados e baixe o PDF ou abra a impressão.',
        })
      }
    } catch (error) {
      setFeedback({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível carregar os dados do relatório.',
      })
    } finally {
      setCarregandoDados(false)
    }
  }

  const baixarPdf = async () => {
    if (!data || processando) return
    const dados = data

    setProcessando(true)
    setProgresso(null)
    setFeedback(null)

    try {
      const pdf = await generatePrestacaoContasPdf(dados, {
        onProgress: setProgresso,
      })

      baixarBlob(pdf.blob, pdf.fileName)
      let mensagem = 'PDF gerado e baixado. Nenhum arquivo foi enviado ao servidor.'
      let tone: Feedback['tone'] = 'success'

      if (pdf.fotosComErro > 0) {
        tone = 'warning'
        mensagem += ` ${pdf.fotosComErro} foto(s) não puderam ser incorporadas ao PDF. Use a opção "Imprimir" para o registro fotográfico completo.`
      }

      setFeedback({ tone, message: mensagem })
    } catch (error) {
      setFeedback({
        tone: 'error',
        message:
          error instanceof Error ? error.message : 'Não foi possível gerar o PDF do relatório.',
      })
    } finally {
      setProcessando(false)
      setProgresso(null)
    }
  }

  const imprimir = () => {
    if (!data) return
    const dados = data

    try {
      printPrestacaoContas(dados)
      setFeedback({
        tone: 'success',
        message: 'Janela de impressão aberta. Nenhum arquivo foi enviado ao servidor.',
      })
    } catch (error) {
      setFeedback({
        tone: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Não foi possível abrir a janela de impressão.',
      })
    }
  }

  const fotoAtiva =
    filtros.tipo === 'fotos'
      ? true
      : filtros.tipo === 'frequencia'
        ? false
        : filtros.incluirFotos

  return (
    <div className="prestacao-page page-container">
      <div className="report-page-heading prestacao-heading">
        <div>
          <span className="eyebrow">Prestação de contas</span>
          <h2>Relatório consolidado para financiadores</h2>
          <p>
            Consolide atividades, frequência e registro fotográfico por período e turma. Uso
            exclusivo da Direção.
          </p>
        </div>
        <div className="report-heading-actions">
          <span className="prestacao-acesso-pill">
            <ShieldCheck size={15} /> Acesso da Direção
          </span>
          <button
            className="button secondary"
            disabled={!podeExportar}
            onClick={imprimir}
            type="button"
          >
            <Printer size={17} />
            Imprimir
          </button>
          <button
            className="button primary"
            disabled={!podeExportar}
            onClick={baixarPdf}
            type="button"
          >
            {processando ? <Loader2 className="spin" size={17} /> : <FileDown size={17} />}
            {processando ? 'Gerando PDF...' : 'Baixar PDF'}
          </button>
        </div>
      </div>

      {feedback && (
        <div className={`feedback-banner ${feedback.tone}`} role="status">
          {feedback.tone === 'success' ? (
            <CheckCircle2 size={18} />
          ) : (
            <AlertTriangle size={18} />
          )}
          <span>{feedback.message}</span>
        </div>
      )}

      {processando && (
        <div className="prestacao-progresso" role="status">
          <div className="prestacao-progresso-copy">
            <Loader2 className="spin" size={17} />
            <span>{progresso?.mensagem || 'Montando o PDF...'}</span>
            {progresso && progresso.total > 0 && (
              <small>
                {progresso.atual}/{progresso.total}
              </small>
            )}
          </div>
          <div className="prestacao-progresso-trilha" aria-hidden="true">
            <span
              style={{
                width: progresso?.total
                  ? `${Math.min(100, Math.round((progresso.atual / progresso.total) * 100))}%`
                  : '35%',
              }}
            />
          </div>
        </div>
      )}

      <form className="prestacao-filtros form-card" onSubmit={gerarPrevia}>
        <div className="form-card-heading">
          <span className="form-heading-icon">
            <CalendarRange size={21} />
          </span>
          <div>
            <h3>Filtros do relatório</h3>
            <p>Defina o período, o tipo de consolidação e as turmas incluídas.</p>
          </div>
        </div>

        <div className="prestacao-filtros-grid">
          <label className="field">
            <span>Data inicial</span>
            <input
              max={todayISO()}
              onChange={(event) => atualizarFiltros({ periodoInicio: event.target.value })}
              required
              type="date"
              value={filtros.periodoInicio}
            />
          </label>

          <label className="field">
            <span>Data final</span>
            <input
              max={todayISO()}
              onChange={(event) => atualizarFiltros({ periodoFim: event.target.value })}
              required
              type="date"
              value={filtros.periodoFim}
            />
          </label>

          <label className="field">
            <span>Tipo de relatório</span>
            <select
              onChange={(event) => alterarTipo(event.target.value as TipoRelatorioPrestacao)}
              value={filtros.tipo}
            >
              {(Object.keys(TIPO_RELATORIO_LABELS) as TipoRelatorioPrestacao[]).map((tipo) => (
                <option key={tipo} value={tipo}>
                  {TIPO_RELATORIO_LABELS[tipo]}
                </option>
              ))}
            </select>
          </label>

          <div className="field prestacao-presets-field">
            <span>Períodos rápidos</span>
            <div className="prestacao-presets">
              <button onClick={() => aplicarPreset('hoje')} type="button">
                <CalendarDays size={14} /> Hoje
              </button>
              <button onClick={() => aplicarPreset('mes')} type="button">
                Este mês
              </button>
              <button onClick={() => aplicarPreset('semestre')} type="button">
                Semestre
              </button>
              <button onClick={() => aplicarPreset('ano')} type="button">
                Ano
              </button>
            </div>
          </div>
        </div>

        <div className="prestacao-turmas-bloco">
          <div className="prestacao-bloco-titulo">
            <div>
              <strong>Turmas incluídas</strong>
              <span>
                {filtros.turmaIds.length === 0
                  ? 'Todas as turmas cadastradas serão consideradas.'
                  : `${filtros.turmaIds.length} turma(s) selecionada(s).`}
              </span>
            </div>
            {turmasCarregando && <Loader2 className="spin" size={17} />}
          </div>

          {turmasErro ? (
            <div className="prestacao-alerta avisos compacto">
              <AlertTriangle size={17} />
              <span>{turmasErro}</span>
            </div>
          ) : (
            <div className="prestacao-turmas-grid">
              <label
                className={
                  'prestacao-turma-chip' +
                  (filtros.turmaIds.length === 0 ? ' selected' : '')
                }
              >
                <input
                  checked={filtros.turmaIds.length === 0}
                  onChange={() => atualizarFiltros({ turmaIds: [] })}
                  type="checkbox"
                />
                <span>
                  <Users size={15} /> Todas as turmas
                </span>
              </label>

              {turmas.map((turma) => (
                <label
                  className={
                    'prestacao-turma-chip' +
                    (filtros.turmaIds.includes(turma.id) ? ' selected' : '')
                  }
                  key={turma.id}
                >
                  <input
                    checked={filtros.turmaIds.includes(turma.id)}
                    onChange={() => alternarTurma(turma.id)}
                    type="checkbox"
                  />
                  <span>
                    <strong>{turma.nome}</strong>
                    <small>
                      {formatPeriodoCurto(turma.periodo) || 'Período não informado'}
                      {turma.ativo ? '' : ' · Inativa'}
                    </small>
                  </span>
                </label>
              ))}
            </div>
          )}

          {!turmasCarregando && !turmasErro && turmas.length === 0 && (
            <p className="prestacao-hint">Nenhuma turma cadastrada no Firestore.</p>
          )}
        </div>

        <label className="prestacao-toggle">
          <input
            checked={fotoAtiva}
            disabled={filtros.tipo === 'fotos' || filtros.tipo === 'frequencia'}
            onChange={(event) => atualizarFiltros({ incluirFotos: event.target.checked })}
            type="checkbox"
          />
          <span>
            <strong>Incluir registro fotográfico</strong>
            <small>
              Fotos anexadas às atividades do período. Em relatórios apenas de fotos, a inclusão é
              obrigatória.
            </small>
          </span>
        </label>

        <div className="prestacao-filtros-acoes">
          <button className="button primary" disabled={carregandoDados} type="submit">
            {carregandoDados ? <Loader2 className="spin" size={17} /> : <Search size={17} />}
            {carregandoDados ? 'Carregando dados...' : 'Gerar prévia'}
          </button>
          <span>
            <Info size={14} /> A prévia não é salva. O PDF é gerado no navegador para
            download ou impressão.
          </span>
        </div>
      </form>

      {data && possuiRestricaoImagem && (
        <div className="prestacao-lgpd">
          <div className="prestacao-lgpd-icon">
            <ShieldAlert size={22} />
          </div>
          <div className="prestacao-lgpd-copy">
            <strong>Fotos omitidas por falta de autorização de uso de imagem</strong>
            <p>
              {data.restricaoImagem.fotosBloqueadas > 0
                ? `${data.restricaoImagem.fotosBloqueadas} foto(s) das turmas abaixo não foram incluídas na prévia, no PDF nem na impressão.`
                : 'Nenhuma foto dessas turmas foi encontrada no período, mas o impedimento permanece registrado.'}{' '}
              A exportação considera apenas fotos de atividades com matrícula histórica
              identificada e autorização registrada para todos os alunos vinculados à turma naquela
              data. O consentimento só é válido quando está gravado no cadastro do aluno — a
              confirmação visual desta tela não substitui essa autorização.
            </p>
            <p className="prestacao-lgpd-acao">
              <strong>Ação necessária:</strong> edite o cadastro dos alunos abaixo, marque a
              autorização de uso de imagem e salve. Se houver termo assinado, anexe-o em
              Documentos. Depois, gere a prévia novamente.
            </p>
            <div className="prestacao-lgpd-turmas">
              {data.restricaoImagem.turmas.map((turma) => (
                <span key={turma.turmaId}>
                  <strong>{turma.turmaNome}</strong>: {turma.alunosSemAutorizacao.join(', ')}
                  {turma.fotosBloqueadas > 0
                    ? ` — ${turma.fotosBloqueadas} foto(s) omitida(s)`
                    : ''}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      <div className="prestacao-conteudo">
        <div className="prestacao-preview-coluna">
          {data ? (
            <>
              <PrestacaoContasPreview data={data} />
              <div className="prestacao-exportacao">
                <div>
                  <strong>Exportar relatório</strong>
                  <span>Arquivo: {buildReportFileName(data.filtros)}</span>
                </div>
                <div className="prestacao-exportacao-acoes">
                  <button
                    className="button secondary"
                    disabled={!podeExportar}
                    onClick={imprimir}
                    type="button"
                  >
                    <Printer size={16} /> Imprimir
                  </button>
                  <button
                    className="button primary"
                    disabled={!podeExportar}
                    onClick={baixarPdf}
                    type="button"
                  >
                    {processando ? <Loader2 className="spin" size={16} /> : <Download size={16} />}
                    Baixar PDF
                  </button>
                </div>
              </div>
            </>
          ) : (
            <section className="prestacao-vazia section-card">
              <span className="prestacao-vazia-icon">
                <FileBarChart size={30} />
              </span>
              <strong>Nenhuma prévia gerada</strong>
              <p>
                Selecione o período e as turmas e clique em <b>Gerar prévia</b> para revisar os
                dados consolidados.
              </p>
              <ul>
                <li>
                  <CheckCircle2 size={15} /> Atividades, oficinas e responsáveis
                </li>
                <li>
                  <CheckCircle2 size={15} /> Frequência por turma e aluno
                </li>
                <li>
                  <CheckCircle2 size={15} /> Registro fotográfico com controle de imagem
                </li>
              </ul>
            </section>
          )}
        </div>

        <aside className="prestacao-aside">
          <div className="privacy-note">
            <ShieldCheck size={19} />
            <p>
              Relatórios de prestação de contas contêm dados pessoais e imagens de alunos. O acesso
              é exclusivo da Direção e o compartilhamento deve seguir a LGPD e as autorizações
              registradas.
            </p>
          </div>

          {data && data.resumo.totalFotos === 0 && secaoFotosAtiva(data.filtros) && (
            <div className="prestacao-aside-nota">
              <ImageOff size={17} />
              <p>
                {data.restricaoImagem.fotosBloqueadas > 0
                  ? 'As fotos do período foram omitidas por falta de autorização de uso de imagem.'
                  : 'Nenhuma foto foi encontrada para o período e as turmas selecionadas.'}
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
