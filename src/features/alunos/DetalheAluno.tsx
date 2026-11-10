import { useState, useEffect } from 'react'
import {
  BarChart3,
  Cake,
  ChevronLeft,
  ClipboardCheck,
  Download,
  FileText,
  ListChecks,
  NotebookPen,
  Palette,
  Pencil,
  Phone,
  Printer,
  School,
  ShieldCheck,
  AlertCircle,
  RefreshCw,
} from 'lucide-react'
import { calculateAge } from './students-data'
import type { Student, ContactEntry, DocumentEntry, Guardian } from './students-data'
import { getStudentById, getDocumentosComUrl, getStudentGuardians } from '../../services/studentsService'
import { subscribeStudentOccurrences } from '../../services/attendanceService'
import './DetalheAluno.css'

const tabs = [
  { id: 'visao', label: 'Visão geral' },
  { id: 'relatorios', label: 'Relatórios pedagógicos' },
  { id: 'evolucao', label: 'Evolução' },
  { id: 'frequencia', label: 'Frequência' },
  { id: 'atividades', label: 'Atividades' },
  { id: 'contato', label: 'Contato por faltas' },
] as const

type TabId = (typeof tabs)[number]['id']

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
  const [student, setStudent] = useState<Student | null>(null)
  const [loadedStudentId, setLoadedStudentId] = useState<string | null>(null)
  const [dbContacts, setDbContacts] = useState<ContactEntry[]>([])
  const [documentos, setDocumentos] = useState<(DocumentEntry & { url: string | null })[]>([])
  const [documentosError, setDocumentosError] = useState<string | null>(null)
  const [documentosLoading, setDocumentosLoading] = useState(false)
  const [guardians, setGuardians] = useState<Guardian[]>([])

  useEffect(() => {
    let isMounted = true
    getStudentById(studentId).then((st) => {
      if (isMounted) {
        setStudent(st)
        setLoadedStudentId(studentId)
      }
    })

    const unsubOccurrences = subscribeStudentOccurrences(studentId, (contacts) => {
      if (isMounted && contacts.length > 0) {
        setDbContacts(contacts)
      }
    })

    return () => {
      isMounted = false
      unsubOccurrences()
    }
  }, [studentId])

  useEffect(() => {
    let active = true
    getStudentGuardians(studentId).then((items) => {
      if (active) setGuardians(items)
    }).catch((error) => {
      console.warn('Não foi possível carregar responsáveis:', error)
      if (active) setGuardians([])
    })
    return () => { active = false }
  }, [studentId])

  useEffect(() => {
    let isMounted = true
    let cancel = false

    const carregarDocumentos = async () => {
      setDocumentosLoading(true)
      setDocumentosError(null)
      try {
        const docs = await getDocumentosComUrl(studentId)
        if (isMounted && !cancel) {
          setDocumentos(docs)
        }
      } catch (err) {
        if (isMounted && !cancel) {
          setDocumentosError(err instanceof Error ? err.message : 'Falha ao carregar documentos')
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
  }, [studentId])

  const loadingStudent = loadedStudentId !== studentId

  if (loadingStudent) {
    return (
      <div className="page-container">
        <div className="form-card">
          <p>Carregando dados do aluno no banco de dados…</p>
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

  // Combina contatos do Firestore com contatos locais sem duplicação
  const allContacts = dbContacts.length > 0 ? dbContacts : student.contacts

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
            <span>
              <NotebookPen size={14} /> {student.deficiencia} ({student.cid})
            </span>
            {student.faltasConsecutivas > 0 && (
              <span className="status-pill warning">
                ⚠️ {student.faltasConsecutivas} faltas consecutivas
              </span>
            )}
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
          {tabs.map((tab) => (
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
                  <strong>Tipo de deficiência:</strong> {student.deficiencia}
                </p>
                <p>
                  <strong>CID:</strong> {student.cid}
                </p>
                <p>
                  <strong>Observações:</strong> {student.observacoes || 'Nenhuma'}
                </p>
              </div>
              <div>
                <h3>Responsável</h3>
                {guardians.length ? guardians.map((guardian) => (
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
                <div className="student-chip-row">
                  {student.oficinas && student.oficinas.length > 0 ? (
                    student.oficinas.map((oficina) => (
                      <span className="status-pill success" key={oficina}>
                        {oficina}
                      </span>
                    ))
                  ) : (
                    <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>Nenhuma oficina atribuída</span>
                  )}
                </div>
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
                    void getDocumentosComUrl(studentId).then((docs) => {
                      setDocumentos(docs)
                      setDocumentosLoading(false)
                    }).catch((err) => {
                      setDocumentosError(err.message || 'Falha ao carregar documentos')
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
            <h3>Evolução pedagógica</h3>
            <div className="timeline">
              {student.evolution.map((entry) => (
                <article key={entry.date + entry.area}>
                  <span className="timeline-dot">
                    <BarChart3 size={15} />
                  </span>
                  <div>
                    <small>
                      {entry.date} — {entry.area}
                    </small>
                    <p>{entry.note}</p>
                  </div>
                </article>
              ))}
              {student.evolution.length === 0 && (
                <p className="student-empty">Nenhuma observação registrada ainda.</p>
              )}
            </div>
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

        {activeTab === 'contato' && (
          <div className="student-tab-panel">
            <h3>Contato por faltas & Ocorrências</h3>
            <div className="timeline">
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
              {allContacts.length === 0 && (
                <p className="student-empty">Nenhum contato registrado.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
