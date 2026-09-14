import { useMemo, useState } from 'react'
import {
  Eye,
  Pencil,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  UserRoundX,
  Users,
  UserX,
} from 'lucide-react'
import { calculateAge, students } from './students-data'
import './ListarAlunos.css'

const turmaOptions = ['Todas as turmas', 'Turma A', 'Turma B', 'Turma C']
const statusOptions = ['Todos', 'Ativo', 'Em acompanhamento', 'Inativo']

export function ListarAlunos({
  onCadastrar,
  onViewStudent,
}: {
  onCadastrar: () => void
  onViewStudent: (id: string) => void
}) {
  const [search, setSearch] = useState('')
  const [turma, setTurma] = useState(turmaOptions[0])
  const [status, setStatus] = useState(statusOptions[0])

  const filtered = useMemo(() => {
    return students.filter((student) => {
      const matchesSearch = student.name.toLowerCase().includes(search.toLowerCase())
      const matchesTurma = turma === turmaOptions[0] || student.turma === turma
      const matchesStatus = status === statusOptions[0] || student.status === status
      return matchesSearch && matchesTurma && matchesStatus
    })
  }, [search, turma, status])

  const totals = useMemo(
    () => ({
      total: students.length,
      ativos: students.filter((s) => s.status === 'Ativo').length,
      acompanhamento: students.filter((s) => s.status === 'Em acompanhamento').length,
      inativos: students.filter((s) => s.status === 'Inativo').length,
    }),
    [],
  )

  return (
    <div className="page-container students-page">
      <div className="report-page-heading">
        <div>
          <span className="eyebrow">Alunos</span>
          <h2>Alunos</h2>
          <p>Gerencie os alunos assistidos pela Fundação.</p>
        </div>
        <div className="report-heading-actions">
          <button className="button primary" onClick={onCadastrar} type="button">
            <UserPlus size={18} /> Cadastrar aluno
          </button>
        </div>
      </div>

      <div className="students-stats">
        <article className="metric-card">
          <span className="metric-icon green"><Users size={25} strokeWidth={2.2} /></span>
          <div><strong>{totals.total}</strong><span>Total de alunos</span></div>
        </article>
        <article className="metric-card">
          <span className="metric-icon mint"><UserCheck size={25} strokeWidth={2.2} /></span>
          <div><strong>{totals.ativos}</strong><span>Ativos</span></div>
        </article>
        <article className="metric-card">
          <span className="metric-icon orange"><UserRoundX size={25} strokeWidth={2.2} /></span>
          <div><strong>{totals.acompanhamento}</strong><span>Em acompanhamento</span></div>
        </article>
        <article className="metric-card">
          <span className="metric-icon blue"><UserX size={25} strokeWidth={2.2} /></span>
          <div><strong>{totals.inativos}</strong><span>Inativos</span></div>
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
                  <td>{student.birthDate}</td>
                  <td>{calculateAge(student.birthDate)} anos</td>
                  <td>{student.turma}</td>
                  <td>{student.deficiencia} / {student.cid}</td>
                  <td>
                    <span
                      className={
                        'status-pill ' +
                        (student.status === 'Ativo'
                          ? 'success'
                          : student.status === 'Em acompanhamento'
                            ? 'warning'
                            : 'danger')
                      }
                    >
                      {student.status}
                    </span>
                  </td>
                  <td>
                    <div className="students-table-actions">
                      <button
                        aria-label={'Ver ' + student.name}
                        onClick={() => onViewStudent(student.id)}
                        type="button"
                      >
                        <Eye size={16} />
                      </button>
                      <button aria-label={'Editar ' + student.name} type="button">
                        <Pencil size={16} />
                      </button>
                      <button aria-label={'Excluir ' + student.name} className="danger" type="button">
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
          <span>Mostrando {filtered.length} de {students.length} resultados</span>
        </div>
      </div>
    </div>
  )
}
