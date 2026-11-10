import { useEffect, useMemo, useState } from 'react'
import { collection, getDocs, orderBy, query } from 'firebase/firestore'
import { AlertTriangle, CheckCircle2, FileText, Paperclip, Save, Upload } from 'lucide-react'
import { db } from '../../lib/firebase'
import { useAuth } from '../auth/AuthContext'
import { uploadAnexo } from '../../services/activitiesService'
import { listarAnexosRelatorio, listarRelatoriosDoAluno, salvarRelatorio } from '../../services/relatoriosService'
import type { AnexoRelatorioPedagogico, RelatorioPedagogico, RelatorioPedagogicoInput, TipoRelatorioPedagogico } from '../../types/relatoriosPedagogicos'

type StudentOption = { id: string; name: string; status: string }
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
  const [students, setStudents] = useState<StudentOption[]>([])
  const [form, setForm] = useState<RelatorioPedagogicoInput>(() => emptyForm(initialStudentId, userId, userName))
  const [history, setHistory] = useState<RelatorioPedagogico[]>([])
  const [attachments, setAttachments] = useState<AnexoRelatorioPedagogico[]>([])
  const [selectedFiles, setSelectedFiles] = useState<File[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const student = useMemo(() => students.find((item) => item.id === form.aluno_id), [students, form.aluno_id])

  useEffect(() => {
    let alive = true
    getDocs(query(collection(db, 'alunos'), orderBy('nome_completo'))).then((snapshot) => {
      if (!alive) return
      setStudents(snapshot.docs.map((item) => ({ id: item.id, name: String(item.data().nome_completo || 'Aluno sem nome'), status: String(item.data().status || 'ativo') })))
      setLoading(false)
    }).catch((cause) => {
      if (!alive) return
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar os alunos.')
      setLoading(false)
    })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    let alive = true
    if (!form.aluno_id) { setHistory([]); return () => { alive = false } }
    listarRelatoriosDoAluno(form.aluno_id).then((items) => { if (alive) setHistory(items) })
      .catch((cause) => { if (alive) setError(cause instanceof Error ? cause.message : 'Não foi possível consultar o histórico.') })
    return () => { alive = false }
  }, [form.aluno_id])

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
      if (!form.aluno_id || !students.some((item) => item.id === form.aluno_id)) throw new Error('Selecione um aluno existente no Firestore.')
      const id = await salvarRelatorio({ ...form, status })
      setForm((current) => ({ ...current, id, status }))
      for (const file of selectedFiles) {
        if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name} excede o limite de 10 MB.`)
        if (!['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error(`${file.name}: tipo de arquivo não permitido.`)
        await uploadAnexo(`relatorios_pedagogicos/${id}`, file, userId)
      }
      const latest = { ...form, id, status } as RelatorioPedagogico
      setForm(latest)
      setSelectedFiles([])
      setAttachments(await listarAnexosRelatorio(id))
      setHistory(await listarRelatoriosDoAluno(form.aluno_id))
      setMessage(status === 'concluido' ? 'Relatório concluído e confirmado no Firestore.' : 'Rascunho salvo no Firestore.')
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o relatório.')
    } finally { setBusy(false) }
  }

  const startNew = () => {
    setForm(emptyForm(form.aluno_id, userId, userName)); setAttachments([]); setSelectedFiles([]); setError(''); setMessage('Novo relatório. Salve para criar um rascunho.')
  }

  const selectFiles = (files: FileList | null) => {
    if (!files) return
    const next = Array.from(files)
    const invalid = next.find((file) => file.size > 10 * 1024 * 1024 || !['application/pdf', 'image/jpeg', 'image/png', 'image/webp'].includes(file.type))
    if (invalid) { setError(`Arquivo inválido ou acima de 10 MB: ${invalid.name}`); return }
    setSelectedFiles((current) => [...current, ...next])
    setMessage('Salve o rascunho para enviar os anexos.')
  }

  return <div className="report-page page-container">
    <div className="report-page-heading"><div><span className="eyebrow">Acompanhamento pedagógico</span><h2>{form.id ? 'Relatório pedagógico' : 'Novo relatório pedagógico'}</h2><p>Campos e periodicidades seguem RF02/RF09 e permanecem sujeitos à validação institucional.</p></div>
      <div className="report-heading-actions"><span className={'report-status ' + (form.status === 'concluido' ? 'completed' : '')}>{form.status === 'concluido' ? 'Concluído' : 'Rascunho'}</span><button className="button secondary" disabled={busy} onClick={() => persist('rascunho')} type="button"><Save size={18}/> Salvar rascunho</button><button className="button primary" disabled={busy || form.status === 'concluido'} onClick={() => persist('concluido')} type="button"><CheckCircle2 size={18}/> Finalizar relatório</button></div>
    </div>
    {error && <div className="privacy-note" role="alert"><AlertTriangle size={19}/><p>{error}</p></div>}
    {message && <p role="status" className="save-feedback">{message}</p>}
    <div className="report-layout"><form className="report-form" onSubmit={(event) => { event.preventDefault(); void persist('rascunho') }}>
      <section className="form-card"><div className="form-card-heading"><span className="form-heading-icon"><FileText size={21}/></span><div><h3>Identificação do relatório</h3><p>Selecione um aluno cadastrado e informe o período avaliado.</p></div></div>
        <div className="form-grid"><label className="field field-wide"><span>Aluno</span><select disabled={loading || Boolean(form.id)} onChange={(e) => { update('aluno_id', e.target.value); setForm(emptyForm(e.target.value, userId, userName)); setAttachments([]) }} value={form.aluno_id}><option value="">Selecione um aluno</option>{students.map((item) => <option key={item.id} value={item.id}>{item.name}{item.status.toLowerCase() === 'inativo' ? ' (inativo)' : ''}</option>)}</select></label>
          <label className="field"><span>Tipo de relatório</span><select disabled={form.status === 'concluido'} onChange={(e) => update('tipo_relatorio', e.target.value as TipoRelatorioPedagogico)} value={form.tipo_relatorio}><option value="diario">Diário</option><option value="semestral">Semestral</option><option value="anual">Anual</option></select></label>
          <label className="field"><span>Início do período</span><input disabled={form.status === 'concluido'} onChange={(e) => update('periodo_inicio', e.target.value)} required type="date" value={form.periodo_inicio}/></label><label className="field"><span>Fim do período</span><input disabled={form.status === 'concluido'} min={form.periodo_inicio || undefined} onChange={(e) => update('periodo_fim', e.target.value)} required type="date" value={form.periodo_fim}/></label>
          <label className="field field-wide"><span>Profissional responsável</span><input readOnly value={userName} /></label></div>
        <div className="selected-student"><div><strong>{student?.name || 'Nenhum aluno selecionado'}</strong><span>Responsável pelo registro: {userName || 'perfil não identificado'}</span></div><button className="text-button" onClick={startNew} type="button">Novo relatório</button></div>
      </section>
      {([['evolucao','Evolução observada'],['avancos','Avanços identificados'],['dificuldades','Dificuldades observadas'],['encaminhamentos','Encaminhamentos'],['observacoes_finais','Observações finais']] as const).map(([key,label]) => <section className="form-card" key={key}><label className="field"><span>{label}{key === 'observacoes_finais' && <em> (opcional)</em>}</span><textarea disabled={form.status === 'concluido'} onChange={(e) => update(key, e.target.value)} rows={key === 'observacoes_finais' ? 3 : 5} value={form[key]}/></label></section>)}
      <section className="form-card"><div className="form-card-heading"><span className="form-heading-icon"><Paperclip size={21}/></span><div><h3>Anexos</h3><p>PDF, JPG, PNG ou WebP · até 10 MB por arquivo.</p></div></div>
        {form.status !== 'concluido' && <label className="upload-area"><input accept="application/pdf,image/jpeg,image/png,image/webp" multiple onChange={(e) => selectFiles(e.target.files)} type="file"/><span className="upload-icon"><Upload size={23}/></span><strong>Selecionar arquivos para anexar</strong><span>Os arquivos são enviados ao salvar o rascunho.</span></label>}
        <ul>{attachments.map((item) => <li key={item.id}>{item.url ? <a href={item.url} rel="noreferrer" target="_blank">{item.nome_arquivo_original}</a> : <span>{item.nome_arquivo_original} — arquivo indisponível</span>}</li>)}{selectedFiles.map((file,index) => <li key={`${file.name}-${index}`}>{file.name} — aguardando salvamento</li>)}</ul>
      </section>
    </form>
    <aside className="report-aside"><section className="form-card"><h3>Relatórios anteriores</h3><p>Consultados diretamente no Firestore para o aluno selecionado.</p><div className="report-history">{history.length === 0 ? <p>{form.aluno_id ? 'Nenhum relatório encontrado.' : 'Selecione um aluno para consultar o histórico.'}</p> : history.map((item) => <article key={item.id}><span className="history-icon"><FileText size={19}/></span><div><strong>{typeLabels[item.tipo_relatorio]} · {item.status === 'concluido' ? 'Concluído' : 'Rascunho'}</strong><span>{dateLabel(item.periodo_inicio)} a {dateLabel(item.periodo_fim)}</span><small>Atualizado no registro persistido</small></div><button aria-label="Abrir relatório" onClick={() => void openReport(item)} type="button">Abrir</button></article>)}</div></section>
      {form.id && <section className="form-card"><h3>Resumo</h3><dl className="report-summary"><div><dt>Aluno</dt><dd>{student?.name || form.aluno_id}</dd></div><div><dt>Período</dt><dd>{dateLabel(form.periodo_inicio)} a {dateLabel(form.periodo_fim)}</dd></div><div><dt>Responsável</dt><dd>{form.usuario_responsavel_nome}</dd></div><div><dt>Anexos</dt><dd>{attachments.length}</dd></div></dl></section>}
      <div className="privacy-note"><AlertTriangle size={19}/><p>Este relatório contém dados pessoais. Compartilhe somente com profissionais autorizados.</p></div>
    </aside></div>
  </div>
}
