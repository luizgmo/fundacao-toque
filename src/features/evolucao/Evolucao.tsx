import { useEffect, useMemo, useState } from 'react'
import { ROLE_LABELS } from '../../types/auth'
import type { UserProfile, UserRole } from '../../types/auth'
import {
  BarChart3,
  FileText,
  Pencil,
  UserRound,
  X,
} from 'lucide-react'
import type { Student, EvolutionEntry } from '../alunos/students-data'
import { subscribeToStudents } from '../../services/studentsService'
import type { StudentsSource } from '../../services/studentsService'
import { DataNotice } from '../../components/DataNotice'
import { useAuth } from '../auth/AuthContext'
import './Evolucao.css'

type Props = {
  userProfile?: UserProfile | null
  onNavigate?: (screen: string) => void
  onViewStudent: (studentId: string) => void
  onNovoRelatorio: (studentId?: string) => void
}

const EVOLUCAO_PAPEIS: UserRole[] = ['direcao', 'pedagogia']

function parsePtBrDate(value: string): { y: number; m: number; d: number } | null {
  const parts = value.split('/')
  if (parts.length !== 3) return null
  const [d, m, y] = parts.map((part) => Number(part))
  if (!y || !m || !d || m < 1 || m > 12 || d < 1 || d > 31) return null
  const date = new Date(y, m - 1, d)
  if (
    date.getFullYear() !== y ||
    date.getMonth() + 1 !== m ||
    date.getDate() !== d
  ) {
    return null
  }
  return { y, m, d }
}

function dateKey(value: string): string | null {
  const parsed = parsePtBrDate(value)
  if (!parsed) return null
  const { y, m, d } = parsed
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

function isDateInRange(value: string, inicio?: string, fim?: string): boolean {
  const key = dateKey(value)
  if (!key) return false
  if (inicio && key < inicio) return false
  if (fim && key > fim) return false
  return true
}

export function Evolucao({ userProfile: profileProp, onNavigate, onViewStudent, onNovoRelatorio }: Props) {
  const { userProfile: authProfile } = useAuth()
  const profile = profileProp ?? authProfile ?? null
  const papel = profile?.papel
  const podeVisualizar = papel ? EVOLUCAO_PAPEIS.includes(papel) : false
  const podeCriar = podeVisualizar

  const [allStudents, setAllStudents] = useState<Student[]>([])
  const [source, setSource] = useState<StudentsSource | 'loading'>('loading')
  const [loadError, setLoadError] = useState<string | null>(null)
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)

  const [filterStudent, setFilterStudent] = useState('')
  const [filterArea, setFilterArea] = useState('')
  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoFim, setPeriodoFim] = useState('')

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

  const areas = useMemo(() => {
    const set = new Set<string>()
    allStudents.forEach((student) => {
      student.evolution.forEach((entry) => {
        if (entry.area) set.add(entry.area)
      })
    })
    return Array.from(set).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }, [allStudents])

  const filteredStudents = useMemo(() => {
    const term = filterStudent.toLowerCase().trim()
    return allStudents.filter((student) => {
      const matchTerm =
        !term ||
        student.name.toLowerCase().includes(term) ||
        student.turma.toLowerCase().includes(term) ||
        student.id.toLowerCase().includes(term)
      return matchTerm
    })
  }, [allStudents, filterStudent])

  const evolutionByStudent = useMemo(() => {
    const map = new Map<string, EvolutionEntry[]>()
    allStudents.forEach((student) => {
      map.set(
        student.id,
        student.evolution.filter((entry) =>
          isDateInRange(entry.date, periodoInicio || undefined, periodoFim || undefined) &&
          (!filterArea || entry.area === filterArea)
        )
      )
    })
    return map
  }, [allStudents, filterArea, periodoInicio, periodoFim])

  if (profile && !podeVisualizar) {
    return (
      <div className="page-container evolucao-page">
        <div className="report-page-heading">
          <div>
            <span className="eyebrow">Evolução Pedagógica</span>
            <h2>Acesso Restrito</h2>
          </div>
        </div>
        <div className="form-card" style={{ textAlign: 'center', padding: '2rem' }}>
          <h3 style={{ color: '#991b1b', marginBottom: '0.5rem' }}>
            Seu perfil não tem acesso à Evolução pedagógica
          </h3>
          <p style={{ color: '#4b5563', marginBottom: '1rem' }}>
            A evolução está disponível para os perfis <strong>Direção</strong> e{' '}
            <strong>Pedagogia</strong>. Você está logado como{' '}
            <strong>{ROLE_LABELS[papel as UserRole] || papel}</strong>.
          </p>
          <button
            className="button secondary"
            onClick={() => onNavigate?.('home')}
            type="button"
          >
            <X size={18} /> Voltar ao Dashboard
          </button>
        </div>
      </div>
    )
  }

  if (source === 'loading') {
    return (
      <div className="page-container evolucao-page">
        <div className="report-page-heading">
          <div>
            <span className="eyebrow">Evolução Pedagógica</span>
            <h2>Evolução dos alunos</h2>
          </div>
        </div>
        <DataNotice kind="loading">Carregando alunos do banco de dados…</DataNotice>
      </div>
    )
  }

  if (source === 'error' || loadError) {
    return (
      <div className="page-container evolucao-page">
        <div className="report-page-heading">
          <div>
            <span className="eyebrow">Evolução Pedagógica</span>
            <h2>Evolução dos alunos</h2>
          </div>
        </div>
        <DataNotice kind="error">
          <strong>Não foi possível carregar os alunos do banco de dados.</strong>{' '}
          {loadError ? `Detalhes: ${loadError}` : 'Verifique a conexão e as permissões de acesso.'}
        </DataNotice>
      </div>
    )
  }

  if (!selectedStudentId) {
    const activeFilters = filterStudent || filterArea || periodoInicio || periodoFim
    return (
      <div className="page-container evolucao-page">
        <div className="report-page-heading">
          <div>
            <span className="eyebrow">Evolução Pedagógica</span>
            <h2>Evolução dos alunos</h2>
            <p>
              Selecione um aluno para visualizar o histórico de evolução pedagógica.{' '}
              {activeFilters ? 'Os registros são filtrados por período e área ao abrir o aluno.' : ''}
            </p>
          </div>
          <div className="report-heading-actions">
            {podeCriar && (
              <button className="button secondary" onClick={() => onNovoRelatorio()} type="button">
                <FileText size={18} /> Novo relatório
              </button>
            )}
          </div>
        </div>

        {source === 'demo' && (
          <DataNotice kind="demo">
            <strong>Modo demonstração:</strong> os alunos exibidos são fictícios e ficam apenas
            neste navegador. Nada é gravado no Firebase.
          </DataNotice>
        )}

        <div className="evolucao-filters">
          <div className="evolucao-filter">
            <span>Aluno</span>
            <select
              aria-label="Filtrar por aluno"
              onChange={(e) => setFilterStudent(e.target.value)}
              value={filterStudent}
            >
              <option value="">Todos os alunos</option>
              {allStudents.map((student) => (
                <option key={student.id} value={student.name}>
                  {student.name} · {student.turma}
                </option>
              ))}
            </select>
          </div>
          <div className="evolucao-filter">
            <span>Período inicial</span>
            <input onChange={(e) => setPeriodoInicio(e.target.value)} type="date" value={periodoInicio} />
          </div>
          <div className="evolucao-filter">
            <span>Período final</span>
            <input onChange={(e) => setPeriodoFim(e.target.value)} type="date" value={periodoFim} />
          </div>
          <div className="evolucao-filter">
            <span>Área</span>
            <select
              aria-label="Filtrar por área"
              onChange={(e) => setFilterArea(e.target.value)}
              value={filterArea}
            >
              <option value="">Todas as áreas</option>
              {areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>
          <button
            className="button secondary evolucao-filter-reset"
            onClick={() => {
              setFilterStudent('')
              setFilterArea('')
              setPeriodoInicio('')
              setPeriodoFim('')
            }}
            type="button"
          >
            <X size={16} /> Limpar filtros
          </button>
        </div>

        <div className="form-card">
          <div className="evolucao-students-list">
            {filteredStudents.map((student) => {
              const entries = evolutionByStudent.get(student.id) || []
              return (
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
                    {entries.length} registro(s)
                  </span>
                  <span className="evolucao-student-arrow">
                    <Pencil size={16} />
                  </span>
                </div>
              )
            })}
            {filteredStudents.length === 0 && (
              <p className="student-empty">
                Nenhum aluno encontrado com os filtros informados.
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

  const entries = evolutionByStudent.get(student.id) || []

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
          {podeCriar && (
            <button
              className="button primary"
              onClick={() => onNovoRelatorio(student.id)}
              type="button"
            >
              <FileText size={18} /> Novo relatório pedagógico
            </button>
          )}
        </div>
      </div>

      <div className="form-card evolucao-detail-card">
        <div className="evolucao-filters">
          <div className="evolucao-filter">
            <span>Período inicial</span>
            <input onChange={(e) => setPeriodoInicio(e.target.value)} type="date" value={periodoInicio} />
          </div>
          <div className="evolucao-filter">
            <span>Período final</span>
            <input onChange={(e) => setPeriodoFim(e.target.value)} type="date" value={periodoFim} />
          </div>
          <div className="evolucao-filter">
            <span>Área</span>
            <select
              aria-label="Filtrar por área"
              onChange={(e) => setFilterArea(e.target.value)}
              value={filterArea}
            >
              <option value="">Todas as áreas</option>
              {areas.map((area) => (
                <option key={area} value={area}>
                  {area}
                </option>
              ))}
            </select>
          </div>
          <button
            className="button secondary evolucao-filter-reset"
            onClick={() => {
              setFilterArea('')
              setPeriodoInicio('')
              setPeriodoFim('')
            }}
            type="button"
          >
            <X size={16} /> Limpar filtros
          </button>
        </div>

        <h3 className="evolucao-section-title">Histórico de evolução</h3>
        {entries.length > 0 ? (
          <div className="evolucao-timeline">
            {entries.map((entry) => (
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
          <p className="student-empty">
            Nenhuma observação de evolução registrada com os filtros informados.
          </p>
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
        {podeCriar && (
          <button
            className="button primary"
            onClick={() => onNovoRelatorio(student.id)}
            type="button"
          >
            <FileText size={18} /> Novo relatório pedagógico
          </button>
        )}
      </div>
    </div>
  )
}
