import { useMemo, useState } from 'react'
import { ROLE_LABELS } from '../../types/auth'
import type { UserProfile, UserRole } from '../../types/auth'
import { FileText, Pencil, UserRound, X } from 'lucide-react'
import { useStudents } from '../alunos/useStudents'
import { LoadError } from '../../components/LoadError'
import { DataNotice } from '../../components/DataNotice'
import { useAuth } from '../auth/AuthContext'
import { useQuery } from '../../lib/useSubscription'
import {
  canCreateEvolution,
  canReadEvolution,
  EVOLUTION_AREAS,
  listarEvolucao,
} from '../../services/evolutionService'
import type { EvolucaoRegistro } from '../../services/evolutionService'
import { EvolucaoAluno } from './EvolucaoAluno'
import './Evolucao.css'

type Props = {
  userProfile?: UserProfile | null
  onNavigate?: (screen: string) => void
  onViewStudent: (studentId: string) => void
  onNovoRelatorio: (studentId?: string) => void
}

function isDateInRange(value: string, inicio?: string, fim?: string): boolean {
  if (inicio && value < inicio) return false
  if (fim && value > fim) return false
  return true
}

export function Evolucao({ userProfile: profileProp, onNavigate, onViewStudent, onNovoRelatorio }: Props) {
  const { userProfile: authProfile } = useAuth()
  const profile = profileProp ?? authProfile ?? null
  const papel = profile?.papel
  const podeVisualizar = canReadEvolution(papel)
  const podeCriar = canCreateEvolution(papel)

  const studentsSub = useStudents()
  const allStudents = studentsSub.data
  const source = studentsSub.source
  const evolucaoSub = useQuery(() => listarEvolucao(), [], 'todos')
  const [createdRecords, setCreatedRecords] = useState<EvolucaoRegistro[]>([])
  const allRecords = useMemo(() => {
    const map = new Map(evolucaoSub.data.map((registro) => [registro.id, registro]))
    createdRecords.forEach((registro) => map.set(registro.id, registro))
    return Array.from(map.values())
  }, [evolucaoSub.data, createdRecords])
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null)

  const [filterStudent, setFilterStudent] = useState('')
  const [filterArea, setFilterArea] = useState('')
  const [periodoInicio, setPeriodoInicio] = useState('')
  const [periodoFim, setPeriodoFim] = useState('')

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
    const map = new Map<string, EvolucaoRegistro[]>()
    allStudents.forEach((student) => map.set(student.id, []))
    allRecords.forEach((registro) => {
      if (!isDateInRange(registro.dataRegistro, periodoInicio || undefined, periodoFim || undefined)) {
        return
      }
      if (filterArea && registro.area !== filterArea) return
      map.get(registro.alunoId)?.push(registro)
    })
    return map
  }, [allStudents, allRecords, filterArea, periodoInicio, periodoFim])

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
            A evolução está disponível para os perfis <strong>Direção</strong>,{' '}
            <strong>Pedagogia</strong> e <strong>Administrativo</strong>. Você está logado como{' '}
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

  if (source === 'loading' || evolucaoSub.status === 'loading') {
    return (
      <div className="page-container evolucao-page">
        <div className="report-page-heading">
          <div>
            <span className="eyebrow">Evolução Pedagógica</span>
            <h2>Evolução dos alunos</h2>
          </div>
        </div>
        <DataNotice kind="loading">Carregando evolução dos alunos…</DataNotice>
      </div>
    )
  }

  if (source === 'error' || studentsSub.status === 'error') {
    return (
      <div className="page-container evolucao-page">
        <div className="report-page-heading">
          <div>
            <span className="eyebrow">Evolução Pedagógica</span>
            <h2>Evolução dos alunos</h2>
          </div>
        </div>
        <LoadError error={studentsSub.error} onRetry={studentsSub.retry} what="os alunos" />
      </div>
    )
  }

  if (evolucaoSub.status === 'error') {
    return (
      <div className="page-container evolucao-page">
        <div className="report-page-heading">
          <div>
            <span className="eyebrow">Evolução Pedagógica</span>
            <h2>Evolução dos alunos</h2>
          </div>
        </div>
        <LoadError
          error={evolucaoSub.error}
          impact="As contagens e o histórico não são exibidos como vazios."
          onRetry={evolucaoSub.retry}
          what="os registros de evolução"
        />
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
              {EVOLUTION_AREAS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
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

  return (
    <div className="page-container evolucao-page">
      <div className="report-page-heading">
        <div>
          <span className="eyebrow">Evolução Pedagógica</span>
          <h2>{student.name}</h2>
          <p>
            {student.turma} — {student.turmaTurno}
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

      <div className="evolucao-detail-card">
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
              {EVOLUTION_AREAS.map((item) => (
                <option key={item.value} value={item.value}>
                  {item.label}
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

        <EvolucaoAluno
          alunoId={student.id}
          filtros={{
            area: filterArea || undefined,
            inicio: periodoInicio || undefined,
            fim: periodoFim || undefined,
          }}
          onRegistroCriado={(registro) =>
            setCreatedRecords((current) => [...current, registro])
          }
          papel={papel}
        />
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