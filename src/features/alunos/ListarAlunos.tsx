import { useEffect, useMemo, useState } from 'react'
import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  Pencil,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  UserX,
  X,
} from 'lucide-react'
import { calculateAge } from './students-data'
import type { Student } from './students-data'
import { subscribeToStudents, inactivateStudent } from '../../services/studentsService'
import './ListarAlunos.css'

const turmaOptions = ['Todas as turmas', 'Turma A', 'Turma B', 'Turma C', 'Turma D']
const statusOptions = ['Todos', 'Ativo', 'Inativo']

export function ListarAlunos({
  onCadastrar,
  onViewStudent,
  onEditStudent,
}: {
  onCadastrar: () => void
  onViewStudent: (id: string) => void
  onEditStudent: (student: Student) => void
}) {
  const [studentsList, setStudentsList] = useState<Student[]>([])
  const [search, setSearch] = useState('')
  const [turma, setTurma] = useState(turmaOptions[0])
  const [status, setStatus] = useState(statusOptions[0])

  // Delete modal states
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)

  // Escuta dados do Firestore em tempo real
  useEffect(() => {
    const unsubscribe = subscribeToStudents((data) => {
      setStudentsList(data)
    })
    return () => unsubscribe()
  }, [])

  const filtered = useMemo(() => {
    return studentsList.filter((student) => {
      const matchesSearch = student.name.toLowerCase().includes(search.toLowerCase())
      const matchesTurma =
        turma === turmaOptions[0] ||
        student.turma.toLowerCase().includes(turma.toLowerCase())
      const matchesStatus = status === statusOptions[0] || student.status === status
      return matchesSearch && matchesTurma && matchesStatus
    })
  }, [studentsList, search, turma, status])

  const totals = useMemo(
    () => ({
      total: studentsList.length,
      ativos: studentsList.filter((s) => s.status === 'Ativo').length,
      inativos: studentsList.filter((s) => s.status === 'Inativo').length,
    }),
    [studentsList],
  )

  const handleConfirmDelete = async () => {
    if (!studentToDelete) return
    setDeleting(true)
    try {
      await inactivateStudent(studentToDelete.id)
      setActionFeedback(`Aluno ${studentToDelete.name} inativado com sucesso.`)
      setStudentToDelete(null)
      setTimeout(() => setActionFeedback(null), 3500)
    } catch (err: any) {
      console.error('Erro ao inativar aluno:', err)
      alert('Erro ao inativar aluno: ' + (err.message || 'Erro desconhecido.'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="page-container students-page">
      <div className="report-page-heading">
        <div>
          <span className="eyebrow">Alunos</span>
          <h2>Alunos</h2>
          <p>Gerencie os alunos assistidos pela Fundação (Sincronizado com o Firestore).</p>
        </div>
        <div className="report-heading-actions">
          <button className="button primary" onClick={onCadastrar} type="button">
            <UserPlus size={18} /> Cadastrar aluno
          </button>
        </div>
      </div>

      {actionFeedback && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.85rem 1.2rem',
            borderRadius: '0.65rem',
            background: '#ecfdf5',
            color: '#065f46',
            border: '1px solid #a7f3d0',
            marginBottom: '1rem',
            fontSize: '0.9rem',
            fontWeight: 500,
          }}
        >
          <CheckCircle2 size={18} />
          <span>{actionFeedback}</span>
        </div>
      )}

      <div className="students-stats">
        <article className="metric-card">
          <span className="metric-icon green">
            <Users size={25} strokeWidth={2.2} />
          </span>
          <div>
            <strong>{totals.total}</strong>
            <span>Total de alunos</span>
          </div>
        </article>
        <article className="metric-card">
          <span className="metric-icon mint">
            <UserCheck size={25} strokeWidth={2.2} />
          </span>
          <div>
            <strong>{totals.ativos}</strong>
            <span>Ativos</span>
          </div>
        </article>
        <article className="metric-card">
          <span className="metric-icon blue">
            <UserX size={25} strokeWidth={2.2} />
          </span>
          <div>
            <strong>{totals.inativos}</strong>
            <span>Inativos</span>
          </div>
        </article>
      </div>

      <div className="form-card students-filter-card">
        <div className="students-filter-bar">
          <label className="field">
            <span>Buscar</span>
            <div className="search-input">
              <Search size={16} />
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nome do aluno..."
                value={search}
              />
            </div>
          </label>
          <label className="field">
            <span>Turma</span>
            <select onChange={(event) => setTurma(event.target.value)} value={turma}>
              {turmaOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Status</span>
            <select onChange={(event) => setStatus(event.target.value)} value={status}>
              {statusOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </label>
        </div>
      </div>

      <div className="form-card students-table-card">
        <div className="students-table-wrapper">
          <table className="students-table">
            <thead>
              <tr>
                <th>Aluno</th>
                <th>Data de nasc.</th>
                <th>Idade</th>
                <th>Turma</th>
                <th>Deficiência / CID</th>
                <th>Status</th>
                <th>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((student) => (
                <tr key={student.id}>
                  <td>
                    <div className="students-table-name">
                      <span className="mini-avatar">{student.name.charAt(0)}</span>
                      <div>
                        <strong>{student.name}</strong>
                        <span>Resp: {student.responsavelNome}</span>
                      </div>
                    </div>
                  </td>
                  <td>{student.birthDate || '—'}</td>
                  <td>
                    {student.birthDate && student.birthDate.includes('/')
                      ? `${calculateAge(student.birthDate)} anos`
                      : '—'}
                  </td>
                  <td>{student.turma}</td>
                  <td>
                    {student.deficiencia} / {student.cid}
                  </td>
                  <td>
                    <span
                      className={
                        'status-pill ' +
                        (student.status === 'Ativo' ? 'success' : 'danger')
                      }
                    >
                      {student.status}
                    </span>
                  </td>
                  <td>
                    <div className="students-table-actions">
                      <button
                        aria-label={'Ver perfil de ' + student.name}
                        onClick={() => onViewStudent(student.id)}
                        title="Ver perfil completo"
                        type="button"
                      >
                        <Eye size={16} />
                      </button>
                      <button
                        aria-label={'Editar ' + student.name}
                        onClick={() => onEditStudent(student)}
                        title="Editar cadastro"
                        type="button"
                      >
                        <Pencil size={16} />
                      </button>
                      <button
                        aria-label={'Excluir ' + student.name}
                        className="danger"
                        onClick={() => setStudentToDelete(student)}
                        title="Excluir cadastro"
                        type="button"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td className="students-table-empty" colSpan={7}>
                    Nenhum aluno encontrado para os filtros selecionados.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="students-table-footer">
          <span>
            Mostrando {filtered.length} de {studentsList.length} resultados
          </span>
        </div>
      </div>

      {/* Modal Confirmação de Inativação */}
      {studentToDelete && (
        <div className="modal-backdrop" onClick={() => setStudentToDelete(null)}>
          <div
            className="modal-container"
            onClick={(e) => e.stopPropagation()}
            style={{ maxWidth: '440px' }}
          >
            <header className="modal-header">
              <div className="modal-title-group">
                <AlertTriangle className="modal-icon" size={22} style={{ color: '#dc2626' }} />
                <div>
                  <h3 style={{ color: '#991b1b' }}>Inativar Aluno</h3>
                  <p>Ação reversível - o histórico será preservado</p>
                </div>
              </div>
              <button
                aria-label="Fechar"
                className="icon-button modal-close"
                onClick={() => setStudentToDelete(null)}
                type="button"
              >
                <X size={20} />
              </button>
            </header>

            <div style={{ padding: '1.25rem', fontSize: '0.92rem', color: '#374151', lineHeight: '1.5' }}>
              <p>
                Tem certeza que deseja inativar o aluno{' '}
                <strong>{studentToDelete.name}</strong>?
              </p>
              <p style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#6b7280' }}>
                O cadastro será mantido no histórico e poderá ser reativado a qualquer momento pela
                edição do aluno.
              </p>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'flex-end',
                gap: '0.75rem',
                padding: '1rem 1.25rem',
                background: '#f9fafb',
                borderTop: '1px solid #e5e7eb',
                borderRadius: '0 0 1rem 1rem',
              }}
            >
              <button
                className="button secondary"
                onClick={() => setStudentToDelete(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button primary"
                disabled={deleting}
                onClick={handleConfirmDelete}
                style={{ background: '#dc2626', borderColor: '#dc2626' }}
                type="button"
              >
                <UserX size={16} />
                {deleting ? 'Inativando...' : 'Sim, Inativar Aluno'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
