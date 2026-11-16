import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import {
  AlertTriangle,
  CheckCircle2,
  FileText,
  Paperclip,
  Save,
  Upload,
} from 'lucide-react'
import { db } from '../../lib/firebase'
import { useAuth } from '../auth/AuthContext'
import {
  excluirAnexosRelatorio,
  listarAnexosRelatorio,
  listarRelatoriosDoAluno,
  novoIdRelatorio,
  salvarRelatorio,
} from '../../services/relatoriosService'
import {
  listarModelosAtivos,
  obterModelo,
} from '../../services/modelosService'
import {
  LIMITES_ANEXO,
  MAX_ARQUIVOS_POR_ENVIO,
  descartarEnvio,
  enviarAnexo,
  liberarUrls,
  novoIdAnexo,
  validarArquivo,
} from '../../services/anexosService'
import { EstadoConteudoBadge, EstadoEnvioBadge } from '../../components/EstadoArquivo'
import type { EstadoEnvioArquivo } from '../../components/EstadoArquivo'
import { describePersistenceError, failureMessage } from '../../lib/persistence'
import { useQuery } from '../../lib/useSubscription'
import { LoadError } from '../../components/LoadError'
import type {
  AnexoRelatorioPedagogico,
  RelatorioPedagogico,
  RelatorioPedagogicoInput,
  TipoRelatorioPedagogico,
} from '../../types/relatoriosPedagogicos'
import { CamposModelo } from './CamposModelo'
import { validarCamposObrigatorios } from './camposModeloUtils'
import type { ModeloFormulario } from '../../types/modelosFormulario'
import './CamposModelo.css'

// Arquivo na fila de envio, com ID de anexo reservado: reenviar usa o mesmo ID e não duplica.
type ArquivoPendente = { id: string; file: File; estado: EstadoEnvioArquivo; motivo?: string }
type StudentOption = { id: string; name: string; status: string }
async function loadStudentOptions(): Promise<StudentOption[]> {
  const snapshot = await getDocs(query(collection(db, 'alunos'), orderBy('nome_completo')))
  return snapshot.docs.map((item) => ({ id: item.id, name: String(item.data().nome_completo || 'Aluno sem nome'), status: String(item.data().status || 'ativo') }))
}
const emptyForm = (studentId: string, userId: string, userName: string): RelatorioPedagogicoInput => ({
  aluno_id: studentId, tipo_relatorio: 'diario', periodo_inicio: '', periodo_fim: '',
  evolucao: '', dificuldades: '', avancos: '', encaminhamentos: '', observacoes_finais: '',
  usuario_responsavel_id: userId, usuario_responsavel_nome: userName, respostas: {}, status: 'rascunho',
})
const typeLabels: Record<TipoRelatorioPedagogico, string> = { diario: 'Diário', semestral: 'Semestral', anual: 'Anual' }
const dateLabel = (value: string) => value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC' }).format(new Date(`${value}T00:00:00Z`)) : 'Período não informado'
const mergeModelos = (current: ModeloFormulario[], data: ModeloFormulario[]) => {
  const porId = new Map(data.map((modelo) => [modelo.id, modelo]))
  current.forEach((modelo) => {
    if (!porId.has(modelo.id)) porId.set(modelo.id, modelo)
  })
  return [...porId.values()]
}

export function PedagogicalReport({ initialStudentId = '' }: { initialStudentId?: string }) {
  const { currentUser, userProfile } = useAuth()
  const userId = userProfile?.uid || currentUser?.uid || ''
  const userName = userProfile?.nome_completo || currentUser?.displayName || currentUser?.email || ''
  const [form, setForm] = useState<RelatorioPedagogicoInput>(() => emptyForm(initialStudentId, userId, userName))
  const [attachments, setAttachments] = useState<AnexoRelatorioPedagogico[]>([])
  const [selectedFiles, setSelectedFiles] = useState<ArquivoPendente[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  // ID reservado para um relatório ainda não gravado; reutilizado nas novas tentativas.
  const [reservedId, setReservedId] = useState(() => novoIdRelatorio())
  // Modelo de formulário selecionado e respostas dinâmicas dos campos configuráveis.
  const [modelos, setModelos] = useState<ModeloFormulario[]>([])
  const [modelosLoading, setModelosLoading] = useState(true)
  const [modelosError, setModelosError] = useState<unknown>(null)
  const modeloSelecionado = modelos.find((m) => m.id === form.modelo_formulario_id) || null

  // Estados separados de carregando / erro / dados para alunos e histórico.
  const studentsQuery = useQuery<StudentOption[]>(loadStudentOptions, [])
  const students = studentsQuery.data
  const historyQuery = useQuery<RelatorioPedagogico[]>(
    () => (form.aluno_id ? listarRelatoriosDoAluno(form.aluno_id) : Promise.resolve([])),
    [],
    form.aluno_id
  )
  const history = historyQuery.data
  const student = useMemo(() => students.find((item) => item.id === form.aluno_id), [students, form.aluno_id])

  const carregarModelos = async () => {
    setModelosLoading(true)
    setModelosError(null)
    try {
      const data = await listarModelosAtivos()
      setModelos((current) => mergeModelos(current, data))
    } catch (cause) {
      setModelosError(cause)
    } finally {
      setModelosLoading(false)
    }
  }

  useEffect(() => {
    let cancelled = false
    listarModelosAtivos()
      .then((data) => {
        if (!cancelled) setModelos((current) => mergeModelos(current, data))
      })
      .catch((cause) => {
        if (!cancelled) setModelosError(cause)
      })
      .finally(() => {
        if (!cancelled) setModelosLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const update = <K extends keyof RelatorioPedagogicoInput>(key: K, value: RelatorioPedagogicoInput[K]) => {
    setForm((current) => ({ ...current, [key]: value, status: current.id ? current.status : 'rascunho' }))
    setMessage('Alterações ainda não salvas.')
  }

  const updateResposta = (respostas: Record<string, string>) => {
    setForm((current) => ({ ...current, respostas }))
    setMessage('Alterações ainda não salvas.')
  }

  // Substitui a lista exibida liberando as URLs temporárias da anterior
  const showAttachments = (next: AnexoRelatorioPedagogico[]) => {
    setAttachments((current) => { liberarUrls(current); return next })
  }
  const setFileState = (id: string, estado: EstadoEnvioArquivo, motivo?: string) =>
    setSelectedFiles((current) => current.map((f) => (f.id === id ? { ...f, estado, motivo } : f)))

  // Envia os arquivos ainda não confirmados; os enviados saem da fila, os que falharem ficam com o motivo.
  const uploadPending = async (reportId: string, files: ArquivoPendente[]) => {
    const enviados: string[] = []
    const falhas: string[] = []
    for (const item of files) {
      setFileState(item.id, 'enviando')
      try {
        await enviarAnexo(`relatorios_pedagogicos/${reportId}`, item.id, item.file, userId)
        enviados.push(item.file.name)
        setSelectedFiles((current) => current.filter((f) => f.id !== item.id))
      } catch (cause) {
        const motivo = describePersistenceError(cause)
        falhas.push(`${item.file.name} (${motivo})`)
        setFileState(item.id, 'falhou', motivo)
      }
    }
    return { enviados, falhas }
  }

  const reloadAttachments = async (reportId: string) => {
    try {
      showAttachments(await listarAnexosRelatorio(reportId))
      return ''
    } catch (cause) {
      console.warn('Não foi possível recarregar os anexos:', cause)
      return ` Não foi possível recarregar a lista de anexos (${describePersistenceError(cause)}); atualize a página para conferir.`
    }
  }

  const retryFile = async (item: ArquivoPendente) => {
    if (!form.id) return
    setError(''); setMessage(''); setBusy(true)
    try {
      const { falhas } = await uploadPending(form.id, [item])
      const aviso = await reloadAttachments(form.id)
      if (falhas.length) setError(`Não enviado: ${falhas.join('; ')}.${aviso}`)
      else setMessage(`${item.file.name} enviado e confirmado no banco de dados.${aviso}`)
    } finally { setBusy(false) }
  }

  const removePending = async (item: ArquivoPendente) => {
    setSelectedFiles((current) => current.filter((f) => f.id !== item.id))
    if (form.id && item.estado === 'falhou') {
      try { await descartarEnvio(`relatorios_pedagogicos/${form.id}`, item.id) } catch (cause) {
        setError(`${item.file.name} saiu da fila, mas o envio parcial não pôde ser descartado (${describePersistenceError(cause)}). Ele aparece como “Envio não concluído” na lista de anexos.`)
      }
      setMessage(await reloadAttachments(form.id))
    }
  }

  // Exclui (ou descarta) um anexo já gravado no rascunho, informando se saiu de fato.
  const removeAttachment = async (item: AnexoRelatorioPedagogico) => {
    if (!form.id) return
    setError(''); setMessage(''); setBusy(true)
    try {
      const { falhas } = await excluirAnexosRelatorio([item], userId)
      const aviso = await reloadAttachments(form.id)
      if (falhas.length) setError(`${item.nomeArquivoOriginal} não foi removido: ${falhas[0].motivo}. Ele continua na lista; tente excluir de novo.${aviso}`)
      else setMessage(`${item.nomeArquivoOriginal} removido do relatório.${aviso}`)
    } finally { setBusy(false) }
  }

  const openReport = async (report: RelatorioPedagogico) => {
    setError(''); setMessage(''); setBusy(true)
    try {
      setForm({ ...report })
      showAttachments(await listarAnexosRelatorio(report.id))
      setSelectedFiles([])
      if (report.modelo_formulario_id) {
        const modelo = await obterModelo(report.modelo_formulario_id)
        if (modelo) {
          setModelos((current) => current.some((m) => m.id === modelo.id) ? current : [...current, modelo])
        }
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o relatório.')
    } finally { setBusy(false) }
  }

  const persist = async (status: 'rascunho' | 'concluido') => {
    setError(''); setMessage(''); setBusy(true)
    try {
      if (status === 'concluido' && selectedFiles.length) throw new Error('Envie ou remova os anexos pendentes antes de concluir.')
      if (status === 'concluido' && attachments.some((a) => a.conteudo.estado === 'envio_incompleto' || a.conteudo.estado === 'conteudo_incompleto')) throw new Error('Há anexos incompletos neste rascunho. Exclua-os (ou envie de novo) antes de concluir: depois de concluído, o relatório não aceita mais alterações nos anexos.')
      if (studentsQuery.status !== 'ready') throw new Error('A lista de alunos não foi carregada. Use “Tentar novamente” no aviso acima.')
      if (!form.aluno_id || !students.some((item) => item.id === form.aluno_id)) throw new Error('Selecione um aluno existente no Firestore.')
      const invalido = selectedFiles.map((item) => validarArquivo(item.file, 'relatorio')).find(Boolean)
      if (invalido) throw new Error(`${invalido} Remova-o antes de salvar.`)

      // Valida os campos obrigatórios do modelo selecionado ao concluir.
      if (status === 'concluido' && modeloSelecionado) {
        const erroObrigatorio = validarCamposObrigatorios(modeloSelecionado, form.respostas)
        if (erroObrigatorio) throw new Error(erroObrigatorio)
      }

      // 1) Relatório. Se não for confirmado, nada foi salvo e o formulário permanece.
      let id: string
      try {
        id = await salvarRelatorio({ ...form, id: form.id || reservedId, status })
      } catch (cause) {
        setError(failureMessage(cause, status === 'concluido' ? 'concluir o relatório' : 'salvar o rascunho do relatório'))
        return
      }
      setForm((current) => ({ ...current, id, status }))

      // 2) Anexos. Os enviados saem da fila; os que falharem ficam com o motivo para nova tentativa.
      const { enviados, falhas } = await uploadPending(id, selectedFiles)

      // 3) Atualiza as listas exibidas. Uma falha de leitura aqui não desfaz o que foi salvo.
      const avisoLeitura = await reloadAttachments(id)
      historyQuery.retry()

      if (falhas.length) {
        setError(
          'O rascunho do relatório foi salvo no sistema, mas o envio de anexos ficou incompleto.' +
          (enviados.length ? ` Anexos gravados: ${enviados.join(', ')}.` : ' Nenhum anexo foi gravado.') +
          ` Não enviados: ${falhas.join('; ')}. Os arquivos com falha continuam na lista com o motivo: use “Reenviar” em cada um ou “Salvar rascunho” para reenviar todos, sem duplicar os já enviados.` +
          avisoLeitura
        )
        return
      }
      setMessage((status === 'concluido' ? 'Relatório concluído e confirmado no banco de dados.' : 'Rascunho confirmado no banco de dados.') + avisoLeitura)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o relatório.')
    } finally { setBusy(false) }
  }

  const startNew = () => {
    setForm(emptyForm(form.aluno_id, userId, userName)); setReservedId(novoIdRelatorio()); showAttachments([]); setSelectedFiles([]); setError(''); setMessage('Novo relatório. Salve para criar um rascunho.')
  }

  const selectFiles = (files: FileList | null) => {
    if (!files) return
    const next = Array.from(files)
    const erros = next.map((file) => validarArquivo(file, 'relatorio')).filter((e): e is string => Boolean(e))
    const validos = next.filter((file) => !validarArquivo(file, 'relatorio'))
    const aceitos = validos.slice(0, Math.max(0, MAX_ARQUIVOS_POR_ENVIO - selectedFiles.length))
    if (aceitos.length < validos.length) erros.push(`Selecione no máximo ${MAX_ARQUIVOS_POR_ENVIO} arquivos por envio; ${validos.length - aceitos.length} ficaram de fora.`)
    setError(erros.join(' '))
    setSelectedFiles((current) => [...current, ...aceitos.map((file) => ({ id: novoIdAnexo(), file, estado: 'aguardando' as const }))])
    if (aceitos.length) setMessage('Salve o rascunho para enviar os anexos.')
  }

  return <div className="report-page page-container">
    <div className="report-page-heading"><div><span className="eyebrow">Acompanhamento pedagógico</span><h2>{form.id ? 'Relatório pedagógico' : 'Novo relatório pedagógico'}</h2><p>Campos e periodicidades seguem RF02/RF09 e permanecem sujeitos à validação institucional.</p></div>
      <div className="report-heading-actions"><span className={'report-status ' + (form.status === 'concluido' ? 'completed' : '')}>{form.status === 'concluido' ? 'Concluído' : 'Rascunho'}</span><button className="button secondary" disabled={busy} onClick={() => persist('rascunho')} type="button"><Save size={18}/> Salvar rascunho</button><button className="button primary" disabled={busy || form.status === 'concluido'} onClick={() => persist('concluido')} type="button"><CheckCircle2 size={18}/> Finalizar relatório</button></div>
    </div>
    {modelosError != null && <LoadError error={modelosError} onRetry={() => void carregarModelos()} what="os modelos de formulário" />}
    {studentsQuery.status === 'error' && <LoadError error={studentsQuery.error} onRetry={studentsQuery.retry} what="os alunos" />}
    {error && <div className="privacy-note" role="alert"><AlertTriangle size={19}/><p>{error}</p></div>}
    {message && <p role="status" className="save-feedback">{message}</p>}
    <div className="report-layout"><form className="report-form" onSubmit={(event) => { event.preventDefault(); void persist('rascunho') }}>
      <section className="form-card"><div className="form-card-heading"><span className="form-heading-icon"><FileText size={21}/></span><div><h3>Identificação do relatório</h3><p>Selecione um aluno cadastrado e informe o período avaliado.</p></div></div>
        <div className="form-grid"><label className="field field-wide"><span>Aluno</span><select disabled={studentsQuery.status !== 'ready' || Boolean(form.id)} onChange={(e) => { update('aluno_id', e.target.value); setForm(emptyForm(e.target.value, userId, userName)); setReservedId(novoIdRelatorio()); showAttachments([]); setSelectedFiles([]); void carregarModelos() }} value={form.aluno_id}><option value="">{studentsQuery.status === 'loading' ? 'Carregando alunos…' : studentsQuery.status === 'error' ? 'Alunos indisponíveis' : students.length === 0 ? 'Nenhum aluno cadastrado' : 'Selecione um aluno'}</option>{students.map((item) => <option key={item.id} value={item.id}>{item.name}{item.status.toLowerCase() === 'inativo' ? ' (inativo)' : ''}</option>)}</select></label>
          <label className="field"><span>Tipo de relatório</span><select disabled={form.status === 'concluido'} onChange={(e) => update('tipo_relatorio', e.target.value as TipoRelatorioPedagogico)} value={form.tipo_relatorio}><option value="diario">Diário</option><option value="semestral">Semestral</option><option value="anual">Anual</option></select></label>
          <label className="field"><span>Início do período</span><input disabled={form.status === 'concluido'} onChange={(e) => update('periodo_inicio', e.target.value)} required type="date" value={form.periodo_inicio}/></label><label className="field"><span>Fim do período</span><input disabled={form.status === 'concluido'} min={form.periodo_inicio || undefined} onChange={(e) => update('periodo_fim', e.target.value)} required type="date" value={form.periodo_fim}/></label>
          <label className="field field-wide"><span>Modelo de formulário</span><select disabled={form.status === 'concluido' || modelosLoading} onChange={(e) => { const id = e.target.value || null; const modelo = modelos.find((m) => m.id === id) || null; setForm((current) => ({ ...current, modelo_formulario_id: id, modelo_formulario_versao: modelo?.versao ?? null, respostas: {} })); setMessage('Campos do modelo carregados. Preencha-os antes de concluir.') }} value={form.modelo_formulario_id || ''}><option value="">Nenhum modelo (campos livres)</option>{!modelosLoading && modelos.map((m) => <option key={m.id} value={m.id}>{m.nome} (v{m.versao})</option>)}</select></label>
          <label className="field field-wide"><span>Profissional responsável</span><input readOnly value={userName} /></label></div>
        <div className="selected-student"><div><strong>{student?.name || 'Nenhum aluno selecionado'}</strong><span>Responsável pelo registro: {userName || 'perfil não identificado'}</span></div><button className="text-button" onClick={startNew} type="button">Novo relatório</button></div>
      </section>
      {modeloSelecionado && (
        <CamposModelo
          modelo={modeloSelecionado}
          respostas={form.respostas}
          onChange={updateResposta}
          disabled={form.status === 'concluido'}
        />
      )}
      {([['evolucao','Evolução observada'],['avancos','Avanços identificados'],['dificuldades','Dificuldades observadas'],['encaminhamentos','Encaminhamentos'],['observacoes_finais','Observações finais']] as const).map(([key,label]) => <section className="form-card" key={key}><label className="field"><span>{label}{key === 'observacoes_finais' && <em> (opcional)</em>}</span><textarea disabled={form.status === 'concluido'} onChange={(e) => update(key, e.target.value)} rows={key === 'observacoes_finais' ? 3 : 5} value={form[key]}/></label></section>)}
      <section className="form-card"><div className="form-card-heading"><span className="form-heading-icon"><Paperclip size={21}/></span><div><h3>Anexos</h3><p>{LIMITES_ANEXO.relatorio.descricao} · até {MAX_ARQUIVOS_POR_ENVIO} por envio.</p></div></div>
        {form.status !== 'concluido' && <label className="upload-area"><input accept={LIMITES_ANEXO.relatorio.tipos.join(',')} multiple onChange={(e) => { selectFiles(e.target.files); e.target.value = '' }} type="file"/><span className="upload-icon"><Upload size={23}/></span><strong>Selecionar arquivos para anexar</strong><span>Os arquivos são enviados ao salvar o rascunho.</span></label>}
        <ul className="report-attachments">
          {attachments.map((item) => {
            const podeRemover = form.status !== 'concluido' && (userProfile?.papel === 'direcao' || item.enviadoPor === userId)
            return <li key={item.id}>
              {item.conteudo.estado === 'disponivel' ? <a href={item.conteudo.url} rel="noreferrer" target="_blank">{item.nomeArquivoOriginal}</a> : <span>{item.nomeArquivoOriginal}</span>}
              <EstadoConteudoBadge conteudo={item.conteudo} />
              {item.conteudo.estado === 'erro_leitura' && form.id && <button className="text-button" disabled={busy} onClick={() => void reloadAttachments(form.id as string).then((aviso) => aviso && setError(aviso))} type="button">Tentar novamente</button>}
              {podeRemover && <button className="text-button" disabled={busy} onClick={() => void removeAttachment(item)} type="button">{item.status === 'enviando' ? 'Descartar envio' : 'Excluir'}</button>}
            </li>
          })}
          {selectedFiles.map((item) => <li key={item.id}>
            <span>{item.file.name}</span>
            <EstadoEnvioBadge estado={item.estado} motivo={item.motivo} />
            {item.estado === 'aguardando' && <small>será enviado ao salvar o rascunho</small>}
            {item.estado === 'falhou' && form.id && <button className="text-button" disabled={busy} onClick={() => void retryFile(item)} type="button">Reenviar</button>}
            {item.estado !== 'enviando' && <button className="text-button" disabled={busy} onClick={() => void removePending(item)} type="button">Remover</button>}
          </li>)}
        </ul>
      </section>
    </form>
    <aside className="report-aside"><section className="form-card"><h3>Relatórios anteriores</h3><p>Consultados diretamente no Firestore para o aluno selecionado.</p><div className="report-history">{!form.aluno_id ? <p>Selecione um aluno para consultar o histórico.</p> : historyQuery.status === 'loading' ? <p>Carregando relatórios…</p> : historyQuery.status === 'error' ? <LoadError error={historyQuery.error} onRetry={historyQuery.retry} what="os relatórios anteriores" /> : history.length === 0 ? <p>Nenhum relatório encontrado para este aluno.</p> : history.map((item) => <article key={item.id}><span className="history-icon"><FileText size={19}/></span><div><strong>{typeLabels[item.tipo_relatorio]} · {item.status === 'concluido' ? 'Concluído' : 'Rascunho'}</strong><span>{dateLabel(item.periodo_inicio)} a {dateLabel(item.periodo_fim)}</span><small>Modelo {item.modelo_formulario_id ? `v${item.modelo_formulario_versao}` : 'sem modelo'}</small></div><button aria-label="Abrir relatório" onClick={() => void openReport(item)} type="button">Abrir</button></article>)}</div></section>
      {form.id && <section className="form-card"><h3>Resumo</h3><dl className="report-summary"><div><dt>Aluno</dt><dd>{student?.name || form.aluno_id}</dd></div><div><dt>Período</dt><dd>{dateLabel(form.periodo_inicio)} a {dateLabel(form.periodo_fim)}</dd></div><div><dt>Responsável</dt><dd>{form.usuario_responsavel_nome}</dd></div><div><dt>Anexos</dt><dd>{attachments.filter((a) => a.conteudo.estado === 'disponivel').length}{attachments.some((a) => a.conteudo.estado !== 'disponivel') ? ` (+${attachments.filter((a) => a.conteudo.estado !== 'disponivel').length} com problema)` : ''}</dd></div></dl></section>}
      <div className="privacy-note"><AlertTriangle size={19}/><p>Este relatório contém dados pessoais. Compartilhe somente com profissionais autorizados.</p></div>
    </aside></div>
  </div>
}
