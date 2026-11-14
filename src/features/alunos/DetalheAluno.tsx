import { useState, useEffect } from 'react'
import {
  Cake,
  ChevronLeft,
  ClipboardCheck,
  Download,
  FileText,
  ListChecks,
  Palette,
  Pencil,
  Phone,
  Printer,
  School,
  ShieldCheck,
  ShieldAlert,
  AlertCircle,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react'
import { calculateAge } from './students-data'
import type { Student, ContactEntry, DocumentEntry, Guardian } from './students-data'
import type { AlunoOficina, Oficina, TurmaOficina } from '../../types/oficinas'
import { describePersistenceError } from '../../lib/persistence'
import { combineStatus, useQuery, useSubscription } from '../../lib/useSubscription'
import { obterLimiteFaltas, LIMITE_FALTAS_PADRAO } from '../../services/configuracaoService'
import { LoadError } from '../../components/LoadError'
import {
  getStudentById,
  getDocumentosComUrl,
  getStudentGuardians,
} from '../../services/studentsService'
import { subscribeStudentOccurrences } from '../../services/attendanceService'
import {
  subscribeToAlunoOficinas,
  subscribeToOficinas,
  subscribeToTurmaOficinas,
} from '../../services/oficinasService'
import { useAuth } from '../../features/auth/AuthContext'
import { canReadMedicalRecord } from '../../services/medicalService'
import { FichaMedica } from './FichaMedica'
import { EvolucaoAluno } from '../evolucao/EvolucaoAluno'
import './DetalheAluno.css'

const tabs = [
  { id: 'visao', label: 'Visão geral' },
  { id: 'relatorios', label: 'Relatórios pedagógicos' },
  { id: 'evolucao', label: 'Evolução' },
  { id: 'frequencia', label: 'Frequência' },
  { id: 'atividades', label: 'Atividades' },
  { id: 'contato', label: 'Contato por faltas' },
  { id: 'ficha', label: 'Ficha médica' },
] as const

type TabId = (typeof tabs)[number]['id']

function formatConsentimentoISO(value?: string): string | null {
  if (!value) return null
  const data = new Date(value)
  if (Number.isNaN(data.getTime())) return null
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(data)
}

function formatDataBR(data?: string) {
  if (!data) return ''
  const [y, m, d] = data.split('-')
  return `${d}/${m}/${y}`
}

const STATUS_LABEL: Record<string, string> = {
  ativo: 'Ativo',
  concluido: 'Concluído',
  cancelado: 'Cancelado',
}

export function DetalheAluno({
  studentId,
  onBack,
  onNovoRelatorio,
  onEdit,
}: {
  studentId: string
  onBack: () => void
  onNovoRelatorio: () => void
  onEdit?: (student: Student) => void
}) {
  const [activeTab, setActiveTab] = useState<TabId>('visao')
  // Estados separados de carregando / erro / dados. `null` com status "ready"
  // significa aluno inexistente; falha de leitura aparece como erro.
  const { userProfile } = useAuth()
  const studentQuery = useQuery<Student | null>(() => getStudentById(studentId), null, studentId)
  const student = studentQuery.data
  const contactsSub = useSubscription<ContactEntry[]>(
    (onData, onError) => subscribeStudentOccurrences(studentId, onData, onError),
    [],
    studentId
  )
  const dbContacts = contactsSub.data
  const [documentos, setDocumentos] = useState<(DocumentEntry & { url: string | null })[]>([])
  const [documentosError, setDocumentosError] = useState<string | null>(null)
  const [documentosLoading, setDocumentosLoading] = useState(false)
  const guardiansQuery = useQuery<Guardian[]>(() => getStudentGuardians(studentId), [], studentId)
  const guardians = guardiansQuery.data
  const papel = userProfile?.papel
  const podeLerFichaMedica = canReadMedicalRecord(papel)
  const visibleTabs = tabs.filter((tab) => tab.id !== 'ficha' || podeLerFichaMedica)

  const configuracaoQuery = useQuery<{ valor: number; fonte: 'configurado' | 'padrao' }>(
    () => obterLimiteFaltas(),
    { valor: LIMITE_FALTAS_PADRAO, fonte: 'padrao' },
  )
  const limiteFaltas = configuracaoQuery.status === 'ready' ? configuracaoQuery.data.valor : LIMITE_FALTAS_PADRAO

  // Oficinas do aluno (fonte da verdade: coleção aluno_oficinas), com o
  // vínculo turma-oficina e a oficina para exibir nome, período e status.
  const alunoOficinasSub = useSubscription<AlunoOficina[]>(
    (onData, onError) => subscribeToAlunoOficinas(onData, onError),
    [],
    studentId
  )
  const turmaOficinasSub = useSubscription<TurmaOficina[]>(
    (onData, onError) => subscribeToTurmaOficinas(onData, onError),
    []
  )
  const oficinasSub = useSubscription<Oficina[]>(
    (onData, onError) => subscribeToOficinas(onData, onError),
    []
  )

  useEffect(() => {
    let isMounted = true
    let cancel = false

    const carregarDocumentos = async () => {
      setDocumentosLoading(true)
      setDocumentosError(null)
      try {
        const docs = await getDocumentosComUrl(studentId, papel)
        if (isMounted && !cancel) {
          setDocumentos(docs)
        }
      } catch (err) {
        if (isMounted && !cancel) {
          setDocumentosError(`Não foi possível carregar os documentos do sistema: ${describePersistenceError(err)}`)
          setDocumentos([])
        }
      } finally {
        if (isMounted && !cancel) {
          setDocumentosLoading(false)
        }
      }
    }

    carregarDocumentos()

    return () => {
      isMounted = false
      cancel = true
    }
  }, [studentId, papel])

  if (studentQuery.status === 'loading') {
    return (
      <div className="page-container">
        <div className="form-card">
          <p>Carregando dados do aluno no banco de dados…</p>
        </div>
      </div>
    )
  }

  if (studentQuery.status === 'error') {
    return (
      <div className="page-container">
        <div className="form-card">
          <LoadError error={studentQuery.error} onRetry={studentQuery.retry} what="os dados do aluno" />
          <button className="button secondary" onClick={onBack} type="button">
            <ChevronLeft size={18} /> Voltar para Alunos
          </button>
        </div>
      </div>
    )
  }

  if (!student) {
    return (
      <div className="page-container">
        <div className="form-card">
          <p>Aluno não encontrado no banco de dados.</p>
          <button className="button secondary" onClick={onBack} type="button">
            <ChevronLeft size={18} /> Voltar para Alunos
          </button>
        </div>
      </div>
    )
  }

  // Oficinas do aluno a partir da coleção aluno_oficinas (fonte da verdade),
  // resolvendo o vínculo turma-oficina e o nome da oficina.
  const alunoOficinas = alunoOficinasSub.data || []
  const turmaOficinas = turmaOficinasSub.data || []
  const oficinas = oficinasSub.data || []

  const turmaOficinaPorId = new Map(turmaOficinas.map((v) => [v.id, v]))
  const oficinaPorId = new Map(oficinas.map((o) => [o.id, o]))

  const vinculacoes = alunoOficinas
    .filter((a) => a.alunoId === studentId)
    .map((a) => {
      const vinculo = turmaOficinaPorId.get(a.turmaOficinaId)
      return {
        alunoOficina: a,
        oficina: vinculo ? oficinaPorId.get(vinculo.oficinaId) : null,
        turmaId: vinculo?.turmaId ?? null,
      }
    })

  const vinculacoesAtuais = vinculacoes.filter((v) => v.alunoOficina.status === 'ativo')
  const vinculacoesHistorico = vinculacoes.filter((v) => v.alunoOficina.status !== 'ativo')
  const oficinasStatus = combineStatus(
    alunoOficinasSub.status,
    turmaOficinasSub.status,
    oficinasSub.status
  )

  // Contatos da coleção contatos_familia; registros legados no próprio aluno
  // são usados apenas quando a coleção respondeu e não tem nenhum contato.
  const allContacts = dbContacts.length > 0 ? dbContacts : student.contacts

  const autorizacaoDoc = [...documentos, ...student.documentos].some(
    (doc) =>
      (doc.tipo === 'autorizacao_imagem' || doc.kind === 'lgpd') && Boolean(doc.dataUrl)
  )
  const consentimentoLabel = formatConsentimentoISO(student.consentimentoImagemEm)

  return (
    <div className="page-container student-detail-page">
      <div className="report-page-heading">
        <div>
          <span className="eyebrow">Alunos</span>
          <h2>Perfil do aluno</h2>
        </div>
        <div className="report-heading-actions">
          <button
            aria-label="Imprimir"
            className="button secondary"
            onClick={() => window.print()}
            type="button"
          >
            <Printer size={18} />
          </button>
          {onEdit && (
            <button className="button secondary" onClick={() => onEdit(student)} type="button">
              <Pencil size={18} /> Editar cadastro
            </button>
          )}
          <button className="button secondary" onClick={onBack} type="button">
            <ChevronLeft size={18} /> Voltar
          </button>
        </div>
      </div>

      <div className="form-card student-header-card">
        <span className="student-header-avatar">{student.name.charAt(0)}</span>
        <div className="student-header-info">
          <h2>{student.name}</h2>
          <div className="student-header-meta">
            <span>
              <Cake size={14} /> {student.birthDate}
              {student.birthDate && student.birthDate.includes('/')
                ? ` — ${calculateAge(student.birthDate)} anos`
                : ''}
            </span>
            <span>
              <School size={14} /> {student.turma} — {student.turmaTurno}
            </span>
            {student.faltasConsecutivas > 0 && (
              <span className="status-pill warning">
                ⚠️ {student.faltasConsecutivas} faltas consecutivas
              </span>
            )}
            <span
              className={
                'status-pill ' + (student.usoImagemAutorizado ? 'success' : 'danger')
              }
            >
              {student.usoImagemAutorizado ? 'Imagem autorizada' : 'Imagem não autorizada'}
            </span>
          </div>
        </div>
        <span
          className={
            'status-pill student-header-status ' +
            (student.status === 'Ativo' ? 'success' : 'danger')
          }
        >
          {student.status}
        </span>
      </div>

      <div className="form-card student-tabs-card">
        <div className="student-tabs">
          {visibleTabs.map((tab) => (
            <button
              className={'student-tab' + (activeTab === tab.id ? ' active' : '')}
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              type="button"
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === 'visao' && (
          <div className="student-tab-panel">
            <div className="student-info-grid">
              <div>
                <h3>Dados pessoais</h3>
                <p>
                  <strong>Nome:</strong> {student.name}
                </p>
                <p>
                  <strong>Data de nascimento:</strong> {student.birthDate}
                </p>
                <p>
                  <strong>Sexo:</strong> {student.sexo}
                </p>
                <p>
                  <strong>Observações:</strong> {student.observacoes || 'Nenhuma'}
                </p>
              </div>
              <div>
                <h3>Responsável</h3>
                {guardiansQuery.status === 'error' ? (
                  <LoadError error={guardiansQuery.error} onRetry={guardiansQuery.retry} what="os responsáveis" />
                ) : guardiansQuery.status === 'loading' ? (
                  <p>Carregando responsáveis…</p>
                ) : guardians.length ? guardians.map((guardian) => (
                  <article className="guardian-profile-card" key={guardian.id || guardian.nome}>
                    <p><strong>{guardian.nome}</strong> {guardian.principal && <span className="guardian-primary-badge">Principal</span>} {!guardian.ativo && <span className="guardian-inactive-badge">Inativo</span>}</p>
                    <p><strong>Parentesco:</strong> {guardian.parentesco}</p>
                    <p><strong>Telefone:</strong> {guardian.telefone || 'Não informado'}</p>
                    <p><strong>Telefone alternativo:</strong> {guardian.telefoneAlternativo || 'Não informado'}</p>
                    <p><strong>E-mail:</strong> {guardian.email || 'Não informado'}</p>
                  </article>
                )) : <>
                  <p><strong>{student.responsavelNome}</strong> <span className="guardian-primary-badge">Principal · legado</span></p>
                  <p><strong>Parentesco:</strong> {student.parentesco}</p>
                  <p><strong>Telefone:</strong> {student.telefone || 'Não informado'}</p>
                  <p><strong>E-mail:</strong> {student.email || 'Não informado'}</p>
                </>}
              </div>
            </div>

            <h3 className="student-section-title">Autorização de uso de imagem (LGPD)</h3>
            <div
              className={
                'image-consent-card ' + (student.usoImagemAutorizado ? 'ok' : 'blocked')
              }
            >
              <span className="image-consent-icon">
                {student.usoImagemAutorizado ? (
                  <ShieldCheck size={24} />
                ) : (
                  <ShieldAlert size={24} />
                )}
              </span>
              <div>
                <strong>
                  {student.usoImagemAutorizado
                    ? 'Uso de imagem autorizado'
                    : 'Uso de imagem NÃO autorizado'}
                </strong>
                {student.usoImagemAutorizado ? (
                  <p>
                    {consentimentoLabel
                      ? `Consentimento registrado em ${consentimentoLabel}.`
                      : 'Consentimento registrado, mas sem data de registro (cadastro legado).'}
                  </p>
                ) : (
                  <p>
                    As fotos de atividades que incluam <strong>{student.name}</strong> serão
                    omitidas da prévia, do PDF e da impressão dos relatórios de prestação de contas.
                  </p>
                )}
                <p>
                  <strong>Ação necessária:</strong>{' '}
                  {student.usoImagemAutorizado
                    ? autorizacaoDoc
                      ? 'manter o termo de autorização arquivado nos documentos do aluno.'
                      : 'anexar o termo assinado em Documentos.'
                    : 'edite o cadastro, marque a autorização de uso de imagem e salve; se houver termo assinado, anexe-o em Documentos.'}
                </p>
                <p>
                  Termo de autorização:{' '}
                  {autorizacaoDoc ? 'anexado aos documentos.' : 'não anexado.'}
                </p>
              </div>
            </div>

            <h3 className="student-section-title">Vínculos</h3>
            <div className="student-info-grid">
              <div className="review-mini-card">
                <h4>
                  <School size={16} /> Turma
                </h4>
                <span className="status-pill success">
                  {student.turma} — {student.turmaTurno}
                </span>
              </div>
              <div className="review-mini-card">
                <h4>
                  <Palette size={16} /> Oficinas
                </h4>
                {oficinasStatus === 'loading' ? (
                  <p className="oficinas-vazio">Carregando oficinas…</p>
                ) : oficinasStatus === 'error' ? (
                  <p className="oficinas-vazio" style={{ color: '#991b1b' }}>
                    Não foi possível carregar o histórico de oficinas.
                  </p>
                ) : vinculacoes.length === 0 ? (
                  <p className="oficinas-vazio">Nenhuma oficina registrada</p>
                ) : (
                  <>
                    {vinculacoesAtuais.length > 0 && (
                      <>
                        <p className="oficinas-rotulo">Atuais</p>
                        <ul className="oficinas-lista">
                          {vinculacoesAtuais.map((v) => (
                            <li key={v.alunoOficina.id} className="oficina-atual">
                              <span className="oficinas-nome">
                                {v.oficina?.nome || 'Oficina removida'}
                              </span>{' · '}
                              desde {formatDataBR(v.alunoOficina.dataInicio)}
                              {v.alunoOficina.nivelSuporte ? ` · Suporte ${v.alunoOficina.nivelSuporte}` : ''}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                    {vinculacoesHistorico.length > 0 && (
                      <>
                        <p className="oficinas-rotulo">Histórico</p>
                        <ul className="oficinas-lista">
                          {vinculacoesHistorico.map((v) => (
                            <li key={v.alunoOficina.id}>
                              <span className="oficinas-nome">
                                {v.oficina?.nome || 'Oficina removida'}
                              </span>{' · '}
                              {formatDataBR(v.alunoOficina.dataInicio)} a{' '}
                              {v.alunoOficina.dataFim || 'presente'} ·
                              {STATUS_LABEL[v.alunoOficina.status] || v.alunoOficina.status}
                              {v.alunoOficina.nivelSuporte ? ` · Suporte ${v.alunoOficina.nivelSuporte}` : ''}
                            </li>
                          ))}
                        </ul>
                      </>
                    )}
                  </>
                )}
              </div>
            </div>

            <h3 className="student-section-title">Documentos</h3>

            {documentosLoading && (
              <div className="student-empty">Carregando documentos…</div>
            )}

            {documentosError && (
              <div style={{ padding: '14px', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: '8px', color: '#991b1b', fontSize: '12px', marginBottom: '10px' }}>
                <AlertCircle size={16} style={{ marginRight: '8px', verticalAlign: 'middle' }} />
                {documentosError}
                <button
                  className="button secondary"
                  onClick={() => {
                    setDocumentosLoading(true)
                    setDocumentosError(null)
                    void getDocumentosComUrl(studentId, papel).then((docs) => {
                      setDocumentos(docs)
                      setDocumentosLoading(false)
                    }).catch((err) => {
                      setDocumentosError(`Não foi possível carregar os documentos do sistema: ${describePersistenceError(err)}`)
                      setDocumentosLoading(false)
                    })
                  }}
                  type="button"
                  style={{ marginTop: '6px', padding: '4px 10px', fontSize: '11px' }}
                >
                  <RefreshCw size={14} /> Tentar novamente
                </button>
              </div>
            )}

            <div className="student-documents-grid">
              {(documentos.length > 0 ? documentos : student.documentos).map((doc) => {
                const nome = doc.nomeArquivoOriginal
                const tipo = doc.tipo
                const dataUrl = doc.dataUrl
                const enviadoEm = doc.enviadoEm
                const ehImagem = dataUrl.startsWith('data:image/')
                const ehPdf = dataUrl.startsWith('data:application/pdf') || tipo === 'ficha_medica'
                return (
                  <div className="student-document-card" key={doc.id}>
                    {tipo === 'autorizacao_imagem' ? <ShieldCheck size={28} /> : <FileText size={28} />}
                    <p title={nome}>{nome}</p>
                    {ehImagem && dataUrl ? (
                      <img
                        src={dataUrl}
                        alt={nome}
                        style={{
                          width: '100%',
                          height: 'auto',
                          maxHeight: 200,
                          objectFit: 'contain',
                          borderRadius: '6px',
                          marginTop: '8px',
                          border: '1px solid var(--border)',
                        }}
                      />
                    ) : ehPdf && dataUrl ? (
                      <a
                        href={dataUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="button secondary"
                        style={{ padding: '4px 10px', fontSize: '11px', marginTop: '8px', width: '100%' }}
                      >
                        <Download size={14} /> Abrir PDF
                      </a>
                    ) : (
                      <span style={{ fontSize: '11px', color: '#6b7280', marginTop: '8px', display: 'block' }}>
                        {enviadoEm ? 'Anexado em ' + enviadoEm : 'Sem arquivo'}
                      </span>
                    )}
                  </div>
                )
              })}
              {(documentos.length === 0 && student.documentos.length === 0) && (
                <p className="student-empty">Nenhum documento anexado.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'relatorios' && (
          <div className="student-tab-panel">
            <div className="student-tab-panel-header">
              <h3>Relatórios pedagógicos</h3>
              <button className="button primary" onClick={onNovoRelatorio} type="button">
                <FileText size={16} /> Novo relatório
              </button>
            </div>
            <div className="timeline">
              {student.reports.map((report) => (
                <article key={report.date}>
                  <span className="timeline-dot">
                    <FileText size={15} />
                  </span>
                  <div>
                    <small>
                      {report.date} — {report.title}
                    </small>
                    <p>{report.summary}</p>
                  </div>
                </article>
              ))}
              {student.reports.length === 0 && (
                <p className="student-empty">Nenhum relatório registrado ainda.</p>
              )}
            </div>
          </div>
        )}

        {activeTab === 'evolucao' && (
          <div className="student-tab-panel">
            <EvolucaoAluno alunoId={studentId} papel={papel} />
          </div>
        )}

        {activeTab === 'frequencia' && (
          <div className="student-tab-panel">
            <h3>Frequência</h3>
            <div className="student-frequency-summary">
              <div className="metric-card">
                <span className="metric-icon mint">
                  <ClipboardCheck size={25} strokeWidth={2.2} />
                </span>
                <div>
                  <strong>{student.frequenciaMedia}%</strong>
                  <span>Frequência média</span>
                </div>
              </div>
              <div className="metric-card">
                <span className="metric-icon orange">
                  <ListChecks size={25} strokeWidth={2.2} />
                </span>
                <div>
                  <strong>{student.faltasConsecutivas}</strong>
                  <span>Faltas consecutivas</span>
                </div>
              </div>
            </div>
            {configuracaoQuery.status === 'ready' && (
              <div className="student-frequency-alert">
                {student.faltasConsecutivas >= limiteFaltas ? (
                  <>
                    <AlertTriangle size={16} />
                    <span>
                      Alerta: {student.faltasConsecutivas} faltas consecutivas atingiram o
                      limite de {limiteFaltas}. Registre o contato com a família na aba
                      Contato por faltas.
                    </span>
                  </>
                ) : (
                  <span>
                    Limite de alerta: {limiteFaltas} faltas consecutivas (
                    {configuracaoQuery.data.fonte === 'configurado'
                      ? 'configurado pela Fundação'
                      : 'padrão'}).
                  </span>
                )}
              </div>
            )}
          </div>
        )}

        {activeTab === 'atividades' && (
          <div className="student-tab-panel">
            <h3>Atividades recentes</h3>
            <ul className="student-activity-list">
              {student.activities.map((activity) => (
                <li key={activity}>{activity}</li>
              ))}
              {student.activities.length === 0 && (
                <li className="student-empty">Nenhuma atividade registrada ainda.</li>
              )}
            </ul>
          </div>
        )}

        {activeTab === 'ficha' && podeLerFichaMedica && (
          <div className="student-tab-panel">
            <FichaMedica alunoId={studentId} papel={papel} />
          </div>
        )}

        {activeTab === 'contato' && (
          <div className="student-tab-panel">
            <h3>Contato por faltas & Ocorrências</h3>
            <div className="timeline">
              {contactsSub.status === 'error' && (
                <LoadError
                  error={contactsSub.error}
                  impact="A lista abaixo pode não incluir os contatos mais recentes."
                  onRetry={contactsSub.retry}
                  what="os contatos registrados"
                />
              )}
              {allContacts.map((contact, index) => (
                <article key={contact.contactDate + index}>
                  <span className="timeline-dot">
                    <Phone size={15} />
                  </span>
                  <div>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: '0.5rem',
                        flexWrap: 'wrap',
                      }}
                    >
                      <small>
                        Falta em {contact.faltaDate} — contato em {contact.contactDate} (
                        {contact.type})
                      </small>
                      {contact.status && (
                        <span
                          className="status-pill warning"
                          style={{ fontSize: '0.75rem', padding: '0.15rem 0.5rem' }}
                        >
                          {contact.status}
                        </span>
                      )}
                    </div>
                    {contact.reason && (
                      <p
                        style={{
                          margin: '0.2rem 0',
                          fontWeight: 600,
                          color: 'var(--color-primary-dark, #1e3a8a)',
                        }}
                      >
                        {contact.reason}
                      </p>
                    )}
                    <p>
                      {contact.note} <em>— {contact.responsible}</em>
                    </p>
                  </div>
                </article>
              ))}
              {allContacts.length === 0 && contactsSub.status === 'ready' && (
                <p className="student-empty">Nenhum contato registrado.</p>
              )}
              {allContacts.length === 0 && contactsSub.status === 'loading' && (
                <p className="student-empty">Carregando contatos…</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
