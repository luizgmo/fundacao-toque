import { useMemo, useState } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { AlertTriangle, CheckCircle2, FileText, Paperclip, Save, Upload } from 'lucide-react'
import { db } from '../../lib/firebase'
import { useAuth } from '../auth/AuthContext'
import { uploadAnexo } from '../../services/activitiesService'
import { listarAnexosRelatorio, listarRelatoriosDoAluno, novoIdRelatorio, salvarRelatorio } from '../../services/relatoriosService'
import { describePersistenceError, failureMessage } from '../../lib/persistence'
import { useQuery } from '../../lib/useSubscription'
import { LoadError } from '../../components/LoadError'
import type { AnexoRelatorioPedagogico, RelatorioPedagogico, RelatorioPedagogicoInput, TipoRelatorioPedagogico } from '../../types/relatoriosPedagogicos'

const TIPOS_ANEXO = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
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

export function PedagogicalReport({ initialStudentId = '' }: { initialStudentId?: string }) {
  const { currentUser, userProfile } = useAuth()
  const userId = userProfile?.uid || currentUser?.uid || ''
  const userName = userProfile?.nome_completo || currentUser?.displayName || currentUser?.email || ''
  const [form, setForm] = useState<RelatorioPedagogicoInput>(() => emptyForm(initialStudentId, userId, userName))
  const [attachments, setAttachments] = useState<AnexoRelatorioPedagogico[]>([])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  // ID reservado para um relatório ainda não gravado; reutilizado nas novas tentativas.
  const [reservedId, setReservedId] = useState(() => novoIdRelatorio())
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


  const update = <K extends keyof RelatorioPedagogicoInput>(key: K, value: RelatorioPedagogicoInput[K]) => {
    setForm((current) => ({ ...current, [key]: value, status: current.id ? current.status : 'rascunho' }))
    setMessage('Alterações ainda não salvas.')
  }

  const openReport = async (report: RelatorioPedagogico) => {
    setError(''); setMessage(''); setBusy(true)
    try {
      setForm({ ...report })
      setAttachments(await listarAnexosRelatorio(report.id))
      setSelectedFiles([])
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível abrir o relatório.')
    } finally { setBusy(false) }
  }

  const persist = async (status: 'rascunho' | 'concluido') => {
    setError(''); setMessage(''); setBusy(true)
    try {
      if (status === 'concluido' && selectedFiles.length) throw new Error('Envie ou remova os anexos pendentes antes de concluir.')
      if (studentsQuery.status !== 'ready') throw new Error('A lista de alunos não foi carregada. Use “Tentar novamente” no aviso acima.')
      if (!form.aluno_id || !students.some((item) => item.id === form.aluno_id)) throw new Error('Selecione um aluno existente no Firestore.')
      const invalido = selectedFiles.find((file) => file.size > 10 * 1024 * 1024 || !TIPOS_ANEXO.includes(file.type))
      if (invalido) throw new Error(`${invalido.name}: arquivo acima de 10 MB ou tipo não permitido. Remova-o antes de salvar.`)

      // 1) Relatório. Se não for confirmado, nada foi salvo e o formulário permanece.
      let id: string
      try {
        id = await salvarRelatorio({ ...form, id: form.id || reservedId, status })
      } catch (cause) {
        setError(failureMessage(cause, status === 'concluido' ? 'concluir o relatório' : 'salvar o rascunho do relatório'))
        return
      }
      setForm((current) => ({ ...current, id, status }))

      // 2) Anexos. Os enviados saem da fila; os que falharem ficam para nova tentativa.
      const enviados: string[] = []
      const pendentes: File[] = []
      const falhas: string[] = []
      for (const file of selectedFiles) {
        try {
          await uploadAnexo(`relatorios_pedagogicos/${id}`, file, userId)
          enviados.push(file.name)
        } catch (cause) {
          pendentes.push(file)
          falhas.push(`${file.name} (${describePersistenceError(cause)})`)
        }
      }
      setSelectedFiles(pendentes)

      // 3) Atualiza as listas exibidas. Uma falha de leitura aqui não desfaz o que foi salvo.
      let avisoLeitura = ''
      try {
        setAttachments(await listarAnexosRelatorio(id))
        historyQuery.retry()
      } catch (cause) {
        console.warn('Relatório salvo, mas as listas não foram recarregadas:', cause)
        avisoLeitura = ' Não foi possível recarregar a lista de anexos e o histórico; atualize a página para conferir.'
      }

      if (falhas.length) {
        setError(
          'O rascunho do relatório foi salvo no sistema, mas o envio de anexos ficou incompleto.' +
          (enviados.length ? ` Anexos gravados: ${enviados.join(', ')}.` : ' Nenhum anexo foi gravado.') +
          ` Não enviados: ${falhas.join('; ')}. Os arquivos pendentes continuam selecionados: clique em “Salvar rascunho” para reenviar apenas eles.` +
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
    setForm(emptyForm(form.aluno_id, userId, userName)); setReservedId(novoIdRelatorio()); setAttachments([]); setSelectedFiles([]); setError(''); setMessage('Novo relatório. Salve para criar um rascunho.')
  }

  const selectFiles = (files: FileList | null) => {
    if (!files) return
    const next = Array.from(files)
    const invalid = next.find((file) => file.size > 10 * 1024 * 1024 || !TIPOS_ANEXO.includes(file.type))
    if (invalid) { setError(`Arquivo inválido ou acima de 10 MB: ${invalid.name}`); return }
    setSelectedFiles((current) => [...current, ...next])
    setMessage('Salve o rascunho para enviar os anexos.')
  }

  return <div className="report-page page-container">
    <div className="report-page-heading"><div><span className="eyebrow">Acompanhamento pedagógico</span><h2>{form.id ? 'Relatório pedagógico' : 'Novo relatório pedagógico'}</h2><p>Campos e periodicidades seguem RF02/RF09 e permanecem sujeitos à validação institucional.</p></div>
      <div className="report-heading-actions"><span className={'report-status ' + (form.status === 'concluido' ? 'completed' : '')}>{form.status === 'concluido' ? 'Concluído' : 'Rascunho'}</span><button className="button secondary" disabled={busy} onClick={() => persist('rascunho')} type="button"><Save size={18}/> Salvar rascunho</button><button className="button primary" disabled={busy || form.status === 'concluido'} onClick={() => persist('concluido')} type="button"><CheckCircle2 size={18}/> Finalizar relatório</button></div>
    </div>
    {studentsQuery.status === 'error' && <LoadError error={studentsQuery.error} onRetry={studentsQuery.retry} what="os alunos" />}
    {error && <div className="privacy-note" role="alert"><AlertTriangle size={19}/><p>{error}</p></div>}
    {message && <p role="status" className="save-feedback">{message}</p>}
    <div className="report-layout"><form className="report-form" onSubmit={(event) => { event.preventDefault(); void persist('rascunho') }}>
      <section className="form-card"><div className="form-card-heading"><span className="form-heading-icon"><FileText size={21}/></span><div><h3>Identificação do relatório</h3><p>Selecione um aluno cadastrado e informe o período avaliado.</p></div></div>
        <div className="form-grid"><label className="field field-wide"><span>Aluno</span><select disabled={studentsQuery.status !== 'ready' || Boolean(form.id)} onChange={(e) => { update('aluno_id', e.target.value); setForm(emptyForm(e.target.value, userId, userName)); setReservedId(novoIdRelatorio()); setAttachments([]) }} value={form.aluno_id}><option value="">{studentsQuery.status === 'loading' ? 'Carregando alunos…' : studentsQuery.status === 'error' ? 'Alunos indisponíveis' : students.length === 0 ? 'Nenhum aluno cadastrado' : 'Selecione um aluno'}</option>{students.map((item) => <option key={item.id} value={item.id}>{item.name}{item.status.toLowerCase() === 'inativo' ? ' (inativo)' : ''}</option>)}</select></label>
          <label className="field"><span>Tipo de relatório</span><select disabled={form.status === 'concluido'} onChange={(e) => update('tipo_relatorio', e.target.value as TipoRelatorioPedagogico)} value={form.tipo_relatorio}><option value="diario">Diário</option><option value="semestral">Semestral</option><option value="anual">Anual</option></select></label>
          <label className="field"><span>Início do período</span><input disabled={form.status === 'concluido'} onChange={(e) => update('periodo_inicio', e.target.value)} required type="date" value={form.periodo_inicio}/></label><label className="field"><span>Fim do período</span><input disabled={form.status === 'concluido'} min={form.periodo_inicio || undefined} onChange={(e) => update('periodo_fim', e.target.value)} required type="date" value={form.periodo_fim}/></label>
          <label className="field field-wide"><span>Profissional responsável</span><input readOnly value={userName} /></label></div>
        <div className="selected-student"><div><strong>{student?.name || 'Nenhum aluno selecionado'}</strong><span>Responsável pelo registro: {userName || 'perfil não identificado'}</span></div><button className="text-button" onClick={startNew} type="button">Novo relatório</button></div>
      </section>
      {([['evolucao','Evolução observada'],['avancos','Avanços identificados'],['dificuldades','Dificuldades observadas'],['encaminhamentos','Encaminhamentos'],['observacoes_finais','Observações finais']] as const).map(([key,label]) => <section className="form-card" key={key}><label className="field"><span>{label}{key === 'observacoes_finais' && <em> (opcional)</em>}</span><textarea disabled={form.status === 'concluido'} onChange={(e) => update(key, e.target.value)} rows={key === 'observacoes_finais' ? 3 : 5} value={form[key]}/></label></section>)}
      <section className="form-card"><div className="form-card-heading"><span className="form-heading-icon"><Paperclip size={21}/></span><div><h3>Anexos</h3><p>PDF, JPG, PNG ou WebP · até 10 MB por arquivo.</p></div></div>
        {form.status !== 'concluido' && <label className="upload-area"><input accept="application/pdf,image/jpeg,image/png,image/webp" multiple onChange={(e) => selectFiles(e.target.files)} type="file"/><span className="upload-icon"><Upload size={23}/></span><strong>Selecionar arquivos para anexar</strong><span>Os arquivos são enviados ao salvar o rascunho.</span></label>}
        <ul>{attachments.map((item) => <li key={item.id}>{item.url ? <a href={item.url} rel="noreferrer" target="_blank">{item.nome_arquivo_original}</a> : <span>{item.nome_arquivo_original} — arquivo indisponível</span>}</li>)}{selectedFiles.map((file,index) => <li key={`${file.name}-${index}`}>{file.name} — ainda não enviado (será enviado ao salvar o rascunho)</li>)}</ul>
      </section>
    </form>
    <aside className="report-aside"><section className="form-card"><h3>Relatórios anteriores</h3><p>Consultados diretamente no Firestore para o aluno selecionado.</p><div className="report-history">{!form.aluno_id ? <p>Selecione um aluno para consultar o histórico.</p> : historyQuery.status === 'loading' ? <p>Carregando relatórios…</p> : historyQuery.status === 'error' ? <LoadError error={historyQuery.error} onRetry={historyQuery.retry} what="os relatórios anteriores" /> : history.length === 0 ? <p>Nenhum relatório encontrado para este aluno.</p> : history.map((item) => <article key={item.id}><span className="history-icon"><FileText size={19}/></span><div><strong>{typeLabels[item.tipo_relatorio]} · {item.status === 'concluido' ? 'Concluído' : 'Rascunho'}</strong><span>{dateLabel(item.periodo_inicio)} a {dateLabel(item.periodo_fim)}</span><small>Atualizado no registro persistido</small></div><button aria-label="Abrir relatório" onClick={() => void openReport(item)} type="button">Abrir</button></article>)}</div></section>
      {form.id && <section className="form-card"><h3>Resumo</h3><dl className="report-summary"><div><dt>Aluno</dt><dd>{student?.name || form.aluno_id}</dd></div><div><dt>Período</dt><dd>{dateLabel(form.periodo_inicio)} a {dateLabel(form.periodo_fim)}</dd></div><div><dt>Responsável</dt><dd>{form.usuario_responsavel_nome}</dd></div><div><dt>Anexos</dt><dd>{attachments.length}</dd></div></dl></section>}
      <div className="privacy-note"><AlertTriangle size={19}/><p>Este relatório contém dados pessoais. Compartilhe somente com profissionais autorizados.</p></div>
    </aside></div>
  </div>
}
