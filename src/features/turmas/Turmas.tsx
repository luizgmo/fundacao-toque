import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  CheckCircle2,
  Cloud,
  CloudSun,
  Eye,
  GraduationCap,
  Palette,
  Pencil,
  Plus,
  Search,
  Sun,
  Trash2,
  UserRoundCheck,
  UserX,
  Users,
  X,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Turma, TurmaPeriodo } from '../../types/turmas'
import { PERIODO_LABELS } from '../../types/turmas'
import type { Oficina, TurmaOficina } from '../../types/oficinas'
import { getCategoria } from '../../types/oficinas'
import type { Student } from '../alunos/students-data'
import type { UserProfile } from '../../types/auth'
import {
  createTurma,
  deleteTurma,
  studentBelongsToTurma,
  subscribeToTurmas,
  updateTurma,
} from '../../services/turmasService'
import type { TurmaInput } from '../../services/turmasService'
import { subscribeToOficinas, subscribeToTurmaOficinas } from '../../services/oficinasService'
import { subscribeToStudents } from '../../services/studentsService'
import { getUsuarioNome, subscribeToUsuarios } from '../../services/usuariosService'
import { useAuth } from '../auth/AuthContext'
import './Turmas.css'

const periodoIcons: Record<TurmaPeriodo, LucideIcon> = {
  manha: Sun,
  tarde: CloudSun,
  integral: Cloud,
}

const emptyForm: TurmaInput = {
  codigo: '',
  nome: '',
  periodo: 'manha',
  idsUsuariosResponsaveis: [],
  dataInicio: '',
  dataFim: '',
  ativo: true,
}

function toggleListValue(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

export function Turmas({ onViewStudent }: { onViewStudent: (id: string) => void }) {
  const { userProfile } = useAuth()

  const [turmas, setTurmas] = useState<Turma[]>([])
  const [oficinas, setOficinas] = useState<Oficina[]>([])
  const [vinculos, setVinculos] = useState<TurmaOficina[]>([])
  const [studentsList, setStudentsList] = useState<Student[]>([])
  const [usuarios, setUsuarios] = useState<UserProfile[]>([])
  const [loading, setLoading] = useState(true)

  const [search, setSearch] = useState('')
  const [periodoFilter, setPeriodoFilter] = useState<'todos' | TurmaPeriodo>('todos')

  // Modal cadastro/edição
  const [showForm, setShowForm] = useState(false)
  const [editingTurma, setEditingTurma] = useState<Turma | null>(null)
  const [form, setForm] = useState<TurmaInput>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Modais de alunos e exclusão
  const [turmaAlunos, setTurmaAlunos] = useState<Turma | null>(null)
  const [turmaToDelete, setTurmaToDelete] = useState<Turma | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)

  useEffect(() => {
    const unsubs = [
      subscribeToTurmas((data) => {
        setTurmas(data)
        setLoading(false)
      }),
      subscribeToOficinas(setOficinas),
      subscribeToTurmaOficinas(setVinculos),
      subscribeToStudents(setStudentsList),
      subscribeToUsuarios(setUsuarios),
    ]
    return () => unsubs.forEach((unsub) => unsub())
  }, [])

  const alunosPorTurma = useMemo(() => {
    const map: Record<string, Student[]> = {}
    turmas.forEach((t) => {
      map[t.id] = studentsList.filter((s) => studentBelongsToTurma(s, t))
    })
    return map
  }, [turmas, studentsList])

  const oficinasPorTurma = useMemo(() => {
    const map: Record<string, Oficina[]> = {}
    turmas.forEach((t) => {
      map[t.id] = vinculos
        .filter((v) => v.turmaId === t.id && v.ativo)
        .map((v) => oficinas.find((o) => o.id === v.oficinaId))
        .filter((o): o is Oficina => Boolean(o))
    })
    return map
  }, [turmas, vinculos, oficinas])

  const filtered = useMemo(() => {
    const term = search.toLowerCase()
    return turmas.filter((t) => {
      const matchesSearch =
        t.nome.toLowerCase().includes(term) || t.codigo.toLowerCase().includes(term)
      const matchesPeriodo = periodoFilter === 'todos' || t.periodo === periodoFilter
      return matchesSearch && matchesPeriodo
    })
  }, [turmas, search, periodoFilter])

  const totals = useMemo(
    () => ({
      total: turmas.length,
      ativas: turmas.filter((t) => t.ativo).length,
      alunos: Object.values(alunosPorTurma).reduce((acc, list) => acc + list.length, 0),
      vinculos: vinculos.filter((v) => v.ativo && turmas.some((t) => t.id === v.turmaId)).length,
    }),
    [turmas, alunosPorTurma, vinculos]
  )

  const showFeedback = (message: string) => {
    setActionFeedback(message)
    setTimeout(() => setActionFeedback(null), 3500)
  }

  const openCreate = () => {
    setEditingTurma(null)
    setForm(emptyForm)
    setFormError(null)
    setShowForm(true)
  }

  const openEdit = (turma: Turma) => {
    setEditingTurma(turma)
    setForm({
      codigo: turma.codigo,
      nome: turma.nome,
      periodo: turma.periodo,
      idsUsuariosResponsaveis: turma.idsUsuariosResponsaveis,
      dataInicio: turma.dataInicio,
      dataFim: turma.dataFim,
      ativo: turma.ativo,
    })
    setFormError(null)
    setShowForm(true)
  }

  const updateField = <K extends keyof TurmaInput>(field: K, value: TurmaInput[K]) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (form.idsUsuariosResponsaveis.length === 0) {
      setFormError('Selecione ao menos um profissional responsável pela turma.')
      return
    }
    if (form.dataInicio && form.dataFim && form.dataFim < form.dataInicio) {
      setFormError('A data de término deve ser posterior à data de início.')
      return
    }
    const codigoDuplicado = turmas.some(
      (t) =>
        t.id !== editingTurma?.id && t.codigo.toLowerCase() === form.codigo.trim().toLowerCase()
    )
    if (codigoDuplicado) {
      setFormError('Já existe uma turma com este código de identificação.')
      return
    }

    setSaving(true)
    try {
      const userId = userProfile?.uid || 'sistema'
      if (editingTurma) {
        await updateTurma(editingTurma.id, form, userId)
        showFeedback(`Turma ${form.nome} atualizada com sucesso.`)
      } else {
        await createTurma(form, userId)
        showFeedback(`Turma ${form.nome} cadastrada com sucesso.`)
      }
      setShowForm(false)
    } catch (err) {
      console.error('Erro ao salvar turma:', err)
      setFormError('Erro ao gravar turma no Firestore: ' + ((err as Error).message || 'Tente novamente.'))
    } finally {
      setSaving(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!turmaToDelete) return
    setDeleting(true)
    try {
      await deleteTurma(turmaToDelete.id)
      showFeedback(`Turma ${turmaToDelete.nome} inativada com sucesso.`)
      setTurmaToDelete(null)
    } catch (err) {
      console.error('Erro ao inativar turma:', err)
      alert('Erro ao inativar turma: ' + ((err as Error).message || 'Erro desconhecido.'))
    } finally {
      setDeleting(false)
    }
  }

  const alunosDaTurmaExcluida = turmaToDelete ? alunosPorTurma[turmaToDelete.id] || [] : []
  const oficinasDaTurmaExcluida = turmaToDelete ? oficinasPorTurma[turmaToDelete.id] || [] : []

  return (
    <div className="page-container turmas-page">
      <div className="report-page-heading">
        <div>
          <span className="eyebrow">Organização</span>
          <h2>Turmas</h2>
          <p>Organize os alunos em turmas por período e defina os profissionais responsáveis.</p>
        </div>
        <div className="report-heading-actions">
          <button className="button primary" onClick={openCreate} type="button">
            <Plus size={18} /> Nova turma
          </button>
        </div>
      </div>

      {actionFeedback && (
        <div className="feedback-banner success">
          <CheckCircle2 size={18} />
          <span>{actionFeedback}</span>
        </div>
      )}

      <div className="entity-stats">
        <article className="metric-card">
          <span className="metric-icon green">
            <GraduationCap size={25} strokeWidth={2.2} />
          </span>
          <div>
            <strong>{totals.total}</strong>
            <span>Turmas cadastradas</span>
          </div>
        </article>
        <article className="metric-card">
          <span className="metric-icon mint">
            <CheckCircle2 size={25} strokeWidth={2.2} />
          </span>
          <div>
            <strong>{totals.ativas}</strong>
            <span>Turmas ativas</span>
          </div>
        </article>
        <article className="metric-card">
          <span className="metric-icon blue">
            <Users size={25} strokeWidth={2.2} />
          </span>
          <div>
            <strong>{totals.alunos}</strong>
            <span>Alunos vinculados</span>
          </div>
        </article>
        <article className="metric-card">
          <span className="metric-icon orange">
            <Palette size={25} strokeWidth={2.2} />
          </span>
          <div>
            <strong>{totals.vinculos}</strong>
            <span>Oficinas nas turmas</span>
          </div>
        </article>
      </div>

      <div className="form-card entity-filter-card">
        <div className="entity-filter-bar turmas-filter-bar">
          <label className="field">
            <span>Buscar</span>
            <div className="search-input">
              <Search size={16} />
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nome ou código da turma..."
                value={search}
              />
            </div>
          </label>
          <label className="field">
            <span>Período</span>
            <select
              onChange={(event) => setPeriodoFilter(event.target.value as 'todos' | TurmaPeriodo)}
              value={periodoFilter}
            >
              <option value="todos">Todos os períodos</option>
              {(Object.keys(PERIODO_LABELS) as TurmaPeriodo[]).map((p) => (
                <option key={p} value={p}>
                  {PERIODO_LABELS[p]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="form-card entity-empty">Carregando turmas do banco de dados...</div>
      ) : filtered.length === 0 ? (
        <div className="form-card entity-empty">
          <GraduationCap size={32} />
          <strong>
            {turmas.length === 0 ? 'Nenhuma turma cadastrada' : 'Nenhuma turma encontrada'}
          </strong>
          <span>
            {turmas.length === 0
              ? 'Cadastre a primeira turma para começar a organizar os alunos.'
              : 'Ajuste os filtros para ver outras turmas.'}
          </span>
          {turmas.length === 0 && (
            <button className="button primary" onClick={openCreate} type="button">
              <Plus size={18} /> Nova turma
            </button>
          )}
        </div>
      ) : (
        <div className="entity-grid">
          {filtered.map((turma) => {
            const Icon = periodoIcons[turma.periodo]
            const alunos = alunosPorTurma[turma.id] || []
            const turmaOficinas = oficinasPorTurma[turma.id] || []
            const responsaveis = turma.idsUsuariosResponsaveis
              .map((uid) => getUsuarioNome(usuarios, uid))
              .join(', ')

            return (
              <article className={'entity-card' + (turma.ativo ? '' : ' inactive')} key={turma.id}>
                <div className="entity-card-top">
                  <span className="entity-icon">
                    <Icon size={22} />
                  </span>
                  <div className="entity-card-title">
                    <h3>{turma.nome}</h3>
                    <span className="entity-code">{turma.codigo}</span>
                  </div>
                  {!turma.ativo && <span className="status-pill danger">Inativa</span>}
                </div>

                <ul className="entity-meta">
                  <li>
                    <Sun size={14} /> {PERIODO_LABELS[turma.periodo]}
                  </li>
                  <li>
                    <UserRoundCheck size={14} /> {responsaveis || 'Sem responsável'}
                  </li>
                </ul>

                <div className="entity-tags">
                  <span className="entity-tag primary">
                    {alunos.length} {alunos.length === 1 ? 'aluno' : 'alunos'}
                  </span>
                  {turmaOficinas.map((o) => (
                    <span className="entity-tag" key={o.id}>
                      {getCategoria(o.categoria).emoji} {o.nome}
                    </span>
                  ))}
                  {turmaOficinas.length === 0 && (
                    <span className="entity-tag muted">Sem oficinas vinculadas</span>
                  )}
                </div>

                <div className="entity-actions">
                  <button
                    className="button secondary entity-main-action"
                    onClick={() => setTurmaAlunos(turma)}
                    type="button"
                  >
                    <Eye size={16} /> Ver alunos
                  </button>
                  <div className="students-table-actions">
                    <button
                      aria-label={'Editar ' + turma.nome}
                      onClick={() => openEdit(turma)}
                      title="Editar turma"
                      type="button"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      aria-label={'Excluir ' + turma.nome}
                      className="danger"
                      onClick={() => setTurmaToDelete(turma)}
                      title="Excluir turma"
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* Modal Cadastro / Edição de Turma */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <div className="modal-title-group">
                <GraduationCap className="modal-icon" size={22} />
                <div>
                  <h3>{editingTurma ? `Editar turma: ${editingTurma.nome}` : 'Nova turma'}</h3>
                  <p>
                    {editingTurma
                      ? 'Atualize a identificação, o período e os responsáveis.'
                      : 'Os alunos são vinculados à turma pelo cadastro de cada aluno.'}
                  </p>
                </div>
              </div>
              <button
                aria-label="Fechar"
                className="icon-button modal-close"
                onClick={() => setShowForm(false)}
                type="button"
              >
                <X size={20} />
              </button>
            </header>

            <form className="modal-form" onSubmit={handleSubmit}>
              {formError && (
                <div className="modal-error-banner">
                  <AlertCircle size={18} /> {formError}
                </div>
              )}

              <div className="modal-grid">
                <label className="field">
                  <span>Código *</span>
                  <input
                    maxLength={12}
                    onChange={(e) => updateField('codigo', e.target.value)}
                    placeholder="Ex: TUR-M1"
                    required
                    value={form.codigo}
                  />
                </label>
                <label className="field">
                  <span>Período *</span>
                  <select
                    onChange={(e) => updateField('periodo', e.target.value as TurmaPeriodo)}
                    required
                    value={form.periodo}
                  >
                    {(Object.keys(PERIODO_LABELS) as TurmaPeriodo[]).map((p) => (
                      <option key={p} value={p}>
                        {PERIODO_LABELS[p]}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field field-wide">
                  <span>Nome da turma *</span>
                  <input
                    onChange={(e) => updateField('nome', e.target.value)}
                    placeholder="Ex: Turma A"
                    required
                    value={form.nome}
                  />
                </label>
                <label className="field">
                  <span>
                    Data de início <em>(opcional)</em>
                  </span>
                  <input
                    onChange={(e) => updateField('dataInicio', e.target.value)}
                    type="date"
                    value={form.dataInicio}
                  />
                </label>
                <label className="field">
                  <span>
                    Data de término <em>(opcional)</em>
                  </span>
                  <input
                    onChange={(e) => updateField('dataFim', e.target.value)}
                    type="date"
                    value={form.dataFim}
                  />
                </label>

                <div className="field field-wide">
                  <span>Profissional(is) responsável(is) *</span>
                  {usuarios.length === 0 ? (
                    <small>Nenhum profissional cadastrado em Equipe / Autores.</small>
                  ) : (
                    <div className="chip-checkbox-grid compact">
                      {usuarios.map((u) => (
                        <label
                          className={
                            'chip-checkbox' +
                            (form.idsUsuariosResponsaveis.includes(u.uid) ? ' checked' : '')
                          }
                          key={u.uid}
                        >
                          <input
                            checked={form.idsUsuariosResponsaveis.includes(u.uid)}
                            onChange={() =>
                              updateField(
                                'idsUsuariosResponsaveis',
                                toggleListValue(form.idsUsuariosResponsaveis, u.uid)
                              )
                            }
                            type="checkbox"
                          />
                          <span>{u.nome_completo}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>

                <label className="toggle-check field-wide">
                  <input
                    checked={form.ativo}
                    onChange={(e) => updateField('ativo', e.target.checked)}
                    type="checkbox"
                  />
                  <span>Turma ativa (disponível para chamadas, oficinas e registros de atividade)</span>
                </label>
              </div>

              <div className="modal-form-actions">
                <button className="button secondary" onClick={() => setShowForm(false)} type="button">
                  Cancelar
                </button>
                <button className="button primary" disabled={saving} type="submit">
                  {saving ? 'Salvando...' : editingTurma ? 'Salvar alterações' : 'Cadastrar turma'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Alunos da Turma */}
      {turmaAlunos && (
        <div className="modal-backdrop" onClick={() => setTurmaAlunos(null)}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <div className="modal-title-group">
                <Users className="modal-icon" size={22} />
                <div>
                  <h3>Alunos — {turmaAlunos.nome}</h3>
                  <p>{PERIODO_LABELS[turmaAlunos.periodo]}</p>
                </div>
              </div>
              <button
                aria-label="Fechar"
                className="icon-button modal-close"
                onClick={() => setTurmaAlunos(null)}
                type="button"
              >
                <X size={20} />
              </button>
            </header>

            <div className="modal-form">
              {(alunosPorTurma[turmaAlunos.id] || []).length === 0 ? (
                <p className="entity-modal-empty">
                  Nenhum aluno vinculado. Para vincular, edite o cadastro do aluno e selecione esta
                  turma na etapa <strong>Vínculos</strong>.
                </p>
              ) : (
                <ul className="entity-student-list">
                  {(alunosPorTurma[turmaAlunos.id] || []).map((s) => (
                    <li key={s.id}>
                      <span className="mini-avatar">{s.name.charAt(0)}</span>
                      <div>
                        <strong>{s.name}</strong>
                        <span>
                          {s.deficiencia}
                          {s.grauDependencia ? ` · Dependência ${s.grauDependencia.toLowerCase()}` : ''}
                        </span>
                      </div>
                      <button
                        className="text-button"
                        onClick={() => onViewStudent(s.id)}
                        type="button"
                      >
                        Ver perfil
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmação de Inativação */}
      {turmaToDelete && (
        <div className="modal-backdrop" onClick={() => setTurmaToDelete(null)}>
          <div className="modal-container confirm-modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <div className="modal-title-group">
                <AlertTriangle className="modal-icon danger" size={22} />
                <div>
                  <h3 className="danger-text">Inativar Turma</h3>
                  <p>Ação reversível - o histórico será preservado</p>
                </div>
              </div>
              <button
                aria-label="Fechar"
                className="icon-button modal-close"
                onClick={() => setTurmaToDelete(null)}
                type="button"
              >
                <X size={20} />
              </button>
            </header>

            <div className="confirm-modal-body">
              {alunosDaTurmaExcluida.length > 0 ? (
                <>
                  <p>
                    A turma <strong>{turmaToDelete.nome}</strong> possui{' '}
                    <strong>{alunosDaTurmaExcluida.length} aluno(s)</strong> vinculado(s).
                  </p>
                  <p className="confirm-modal-hint">
                    Os alunos permanecerão vinculados, mas a turma ficará inativa. Transfira os alunos
                    para outra turma no cadastro de cada um, se necessário.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    Tem certeza que deseja inativar a turma <strong>{turmaToDelete.nome}</strong>?
                  </p>
                  <p className="confirm-modal-hint">
                    {oficinasDaTurmaExcluida.length > 0
                      ? `Os vínculos com ${oficinasDaTurmaExcluida.length} oficina(s) serão desativados. `
                      : ''}
                    Registros de atividade e chamadas já realizados são mantidos no histórico.
                  </p>
                </>
              )}
            </div>

            <div className="confirm-modal-footer">
              <button
                className="button secondary"
                onClick={() => setTurmaToDelete(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button primary"
                disabled={deleting}
                onClick={handleConfirmDelete}
                type="button"
              >
                <UserX size={16} />
                {deleting ? 'Inativando...' : 'Sim, Inativar Turma'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
