import { useState } from 'react'
import {
  BarChart3,
  Cake,
  ChevronLeft,
  ClipboardCheck,
  FileText,
  ListChecks,
  NotebookPen,
  Palette,
  Pencil,
  Phone,
  Printer,
  School,
  ShieldCheck,
} from 'lucide-react'
import { calculateAge, findStudent } from './students-data'
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
}: {
  studentId: string
  onBack: () => void
  onNovoRelatorio: () => void
}) {
  const [activeTab, setActiveTab] = useState<TabId>('visao')
  const student = findStudent(studentId)

  if (!student) {
    return (
      <div className="page-container">
        <div className="form-card">
          <p>Aluno não encontrado.</p>
          <button className="button secondary" onClick={onBack} type="button">
            <ChevronLeft size={18} /> Voltar para Alunos
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container student-detail-page">
      <div className="report-page-heading">
        <div>
          <span className="eyebrow">Alunos</span>
          <h2>Perfil do aluno</h2>
        </div>
        <div className="report-heading-actions">
          <button aria-label="Imprimir" className="button secondary" type="button">
            <Printer size={18} />
          </button>
          <button className="button secondary" type="button">
            <Pencil size={18} /> Editar cadastro
          </button>
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
            <span><Cake size={14} /> {student.birthDate} — {calculateAge(student.birthDate)} anos</span>
            <span><School size={14} /> {student.turma} — {student.turmaTurno}</span>
            <span><NotebookPen size={14} /> {student.deficiencia} ({student.cid})</span>
            {student.faltasConsecutivas > 0 && (
              <span className="status-pill warning">⚠️ {student.faltasConsecutivas} faltas consecutivas</span>
            )}
          </div>
        </div>
        <span
          className={
            'status-pill student-header-status ' +
            (student.status === 'Ativo' ? 'success' : student.status === 'Em acompanhamento' ? 'warning' : 'danger')
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
                <p><strong>Nome:</strong> {student.name}</p>
                <p><strong>Data de nascimento:</strong> {student.birthDate}</p>
                <p><strong>Sexo:</strong> {student.sexo}</p>
                <p><strong>Tipo de deficiência:</strong> {student.deficiencia}</p>
                <p><strong>CID:</strong> {student.cid}</p>
                <p><strong>Observações:</strong> {student.observacoes}</p>
              </div>
              <div>
                <h3>Responsável</h3>
                <p><strong>Nome:</strong> {student.responsavelNome}</p>
                <p><strong>Parentesco:</strong> {student.parentesco}</p>
                <p><strong>Telefone:</strong> {student.telefone}</p>
                <p><strong>E-mail:</strong> {student.email}</p>
              </div>
            </div>

            <h3 className="student-section-title">Vínculos</h3>
            <div className="student-info-grid">
              <div className="review-mini-card">
                <h4><School size={16} /> Turma</h4>
                <span className="status-pill success">{student.turma} — {student.turmaTurno}</span>
              </div>
              <div className="review-mini-card">
                <h4><Palette size={16} /> Oficinas</h4>
                <div className="student-chip-row">
                  {student.oficinas.map((oficina) => (
                    <span className="status-pill success" key={oficina}>{oficina}</span>
                  ))}
                </div>
              </div>
            </div>

            <h3 className="student-section-title">Documentos</h3>
            <div className="student-documents-grid">
              {student.documentos.map((doc) => (
                <div className="student-document-card" key={doc.name}>
                  {doc.kind === 'lgpd' ? <ShieldCheck size={28} /> : <FileText size={28} />}
                  <p>{doc.name}</p>
                  <span>{doc.kind === 'lgpd' ? '✅ Autorizado' : 'Anexado em ' + doc.attachedAt}</span>
                </div>
              ))}
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
                  <span className="timeline-dot"><FileText size={15} /></span>
                  <div>
                    <small>{report.date} — {report.title}</small>
                    <p>{report.summary}</p>
                  </div>
                </article>
              ))}
              {student.reports.length === 0 && <p className="student-empty">Nenhum relatório registrado ainda.</p>}
            </div>
          </div>
        )}

        {activeTab === 'evolucao' && (
          <div className="student-tab-panel">
            <h3>Evolução pedagógica</h3>
            <div className="timeline">
              {student.evolution.map((entry) => (
                <article key={entry.date + entry.area}>
                  <span className="timeline-dot"><BarChart3 size={15} /></span>
                  <div>
                    <small>{entry.date} — {entry.area}</small>
                    <p>{entry.note}</p>
                  </div>
                </article>
              ))}
              {student.evolution.length === 0 && <p className="student-empty">Nenhuma observação registrada ainda.</p>}
            </div>
          </div>
        )}

        {activeTab === 'frequencia' && (
          <div className="student-tab-panel">
            <h3>Frequência</h3>
            <div className="student-frequency-summary">
              <div className="metric-card">
                <span className="metric-icon mint"><ClipboardCheck size={25} strokeWidth={2.2} /></span>
                <div><strong>{student.frequenciaMedia}%</strong><span>Frequência média</span></div>
              </div>
              <div className="metric-card">
                <span className="metric-icon orange"><ListChecks size={25} strokeWidth={2.2} /></span>
                <div><strong>{student.faltasConsecutivas}</strong><span>Faltas consecutivas</span></div>
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
              {student.activities.length === 0 && <li className="student-empty">Nenhuma atividade registrada ainda.</li>}
            </ul>
          </div>
        )}

        {activeTab === 'contato' && (
          <div className="student-tab-panel">
            <h3>Contato por faltas</h3>
            <div className="timeline">
              {student.contacts.map((contact) => (
                <article key={contact.contactDate}>
                  <span className="timeline-dot"><Phone size={15} /></span>
                  <div>
                    <small>Falta em {contact.faltaDate} — contato em {contact.contactDate} ({contact.type})</small>
                    <p>{contact.note} <em>— {contact.responsible}</em></p>
                  </div>
                </article>
              ))}
              {student.contacts.length === 0 && <p className="student-empty">Nenhum contato registrado.</p>}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
