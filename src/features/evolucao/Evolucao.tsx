import { useEffect, useState } from 'react'
import {
  BarChart3,
  FileText,
  Pencil,
  UserRound,
  X,
} from 'lucide-react'
import type { Student } from '../alunos/students-data'
import { subscribeToStudents } from '../../services/studentsService'
import type { StudentsSource } from '../../services/studentsService'
import { DataNotice } from '../../components/DataNotice'
import './Evolucao.css'

type Props = {
  onViewStudent: (studentId: string) => void
  onNovoRelatorio: (studentId?: string) => void
}

export function Evolucao({ onViewStudent, onNovoRelatorio }: Props) {
  const [allStudents, setAllStudents] = useState<Student[]>([])
  const [source, setSource] = useState<StudentsSource | 'loading'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)

  useEffect(() => {
    const unsub = subscribeToStudents(
      (data) => {
        setAllStudents(data)
        setLoadError(null)
      },
      (err) => setLoadError(err.message),
      (nextSource) => setSource(nextSource)
    )
    return () => unsub()
  }, [])

  if (!selectedStudentId) {
    return (
      <div className="page-container evolucao-page">
        <div className="report-page-heading">
          <div>
            <span className="eyebrow">Evolução Pedagógica</span>
            <h2>Evolução dos alunos</h2>
            <p>Selecione um aluno para visualizar o histórico de evolução pedagógica.</p>
          </div>
          <div className="report-heading-actions">
            <button className="button secondary" onClick={() => onNovoRelatorio()} type="button">
              <FileText size={18} /> Novo relatório
            </button>
          </div>
        </div>

        {source === 'demo' && (
          <DataNotice kind="demo">
            <strong>Modo demonstração:</strong> os alunos exibidos são fictícios e ficam apenas
            neste navegador. Nada é gravado no Firebase.
          </DataNotice>
        )}

        {source === 'loading' && (
          <DataNotice kind="loading">Carregando alunos do banco de dados…</DataNotice>
        )}

        {(source === 'error' || loadError) && (
          <DataNotice kind="error">
            <strong>Não foi possível carregar os alunos do Firestore.</strong>{' '}
            {loadError ? `Detalhes: ${loadError}` : 'Verifique a conexão e as permissões de acesso.'}
          </DataNotice>
        )}

        <div className="form-card">
          <div className="evolucao-students-list">
            {allStudents.map((student) => (
              <div
                key={student.id}
                className="evolucao-student-item"
                onClick={() => setSelectedStudentId(student.id)}
              >
                <span className="evolucao-student-avatar">
                  <UserRound size={20} />
                </span>
                <div className="evolucao-student-info">
                  <strong>{student.name}</strong>
                  <span className="evolucao-student-turma">{student.turma} — {student.turmaTurno}</span>
                </div>
                <span className="evolucao-student-count">
                  {student.evolution.length} registro(s)
                </span>
                <span className="evolucao-student-arrow">
                  <Pencil size={16} />
                </span>
              </div>
            ))}
            {allStudents.length === 0 && (
              <p className="student-empty">
                {source === 'loading'
                  ? 'Carregando alunos do banco de dados…'
                  : source === 'error'
                    ? 'Não foi possível carregar os alunos. Veja o aviso acima.'
                    : 'Nenhum aluno cadastrado no banco de dados.'}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }

  const student = allStudents.find((item) => item.id === selectedStudentId)
  if (!student) {
    return (
      <div className="page-container evolucao-page">
        <div className="report-page-heading">
          <div>
            <span className="eyebrow">Evolução Pedagógica</span>
            <h2>Aluno não encontrado</h2>
          </div>
          <div className="report-heading-actions">
            <button className="button secondary" onClick={() => setSelectedStudentId(null)} type="button">
              <X size={18} /> Voltar
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container evolucao-page">
      <div className="report-page-heading">
        <div>
          <span className="eyebrow">Evolução Pedagógica</span>
          <h2>{student.name}</h2>
          <p>
            {student.turma} — {student.turmaTurno} · {student.deficiencia} ({student.cid})
          </p>
        </div>
        <div className="report-heading-actions">
          <button className="button secondary" onClick={() => setSelectedStudentId(null)} type="button">
            <X size={18} /> Voltar
          </button>
          <button
            className="button primary"
            onClick={() => onNovoRelatorio(student.id)}
            type="button"
          >
            <FileText size={18} /> Novo relatório
          </button>
        </div>
      </div>

      <div className="form-card evolucao-detail-card">
        <h3 className="evolucao-section-title">Histórico de evolução</h3>
        {student.evolution.length > 0 ? (
          <div className="evolucao-timeline">
            {student.evolution.map((entry) => (
              <div key={entry.date + entry.area} className="evolucao-timeline-item">
                <span className="evolucao-timeline-dot">
                  <BarChart3 size={14} />
                </span>
                <div className="evolucao-timeline-content">
                  <div className="evolucao-timeline-header">
                    <span className="evolucao-area">{entry.area}</span>
                    <span className="evolucao-date">{entry.date}</span>
                  </div>
                  <p className="evolucao-note">{entry.note}</p>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="student-empty">Nenhuma observação de evolução registrada ainda.</p>
        )}
      </div>

      <div className="evolucao-actions">
        <button
          className="button secondary"
          onClick={() => onViewStudent(student.id)}
          type="button"
        >
          <UserRound size={18} /> Ver perfil completo
        </button>
        <button
          className="button primary"
          onClick={() => onNovoRelatorio(student.id)}
          type="button"
        >
          <FileText size={18} /> Novo relatório pedagógico
        </button>
      </div>
    </div>
  )
}
