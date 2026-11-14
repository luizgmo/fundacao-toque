import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  GraduationCap,
  Link2,
  Palette,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserRoundCheck,
  UserX,
  Users,
  X,
} from 'lucide-react'
import type { AlunoOficina, Oficina, TurmaOficina } from '../../types/oficinas'
import {
  CATEGORIAS_OFICINA,
  NIVEIS_SUPORTE,
  formatHorarios,
  getCategoria,
} from '../../types/oficinas'
import type { Turma } from '../../types/turmas'
import type { UserProfile } from '../../types/auth'
import type { Student } from '../alunos/students-data'
import {
  createOficina,
  deleteOficina,
  saveAlunosDaOficina,
  subscribeToAlunoOficinas,
  subscribeToOficinas,
  subscribeToTurmaOficinas,
  updateOficina,
} from '../../services/oficinasService'
import type { AlunoOficinaSelecao, OficinaInput } from '../../services/oficinasService'
import { studentBelongsToTurma, subscribeToTurmas } from '../../services/turmasService'
import { subscribeToStudents } from '../../services/studentsService'
import { getUsuarioNome, subscribeToUsuarios } from '../../services/usuariosService'
import { failureMessage } from '../../lib/persistence'
import { combineStatus, formatLoadedCount, useSubscription } from '../../lib/useSubscription'
import { LoadError, LoadErrors } from '../../components/LoadError'
import { useAuth } from '../auth/AuthContext'
import { VinculoModal } from './VinculoModal'
import type { VinculoModalAlvo } from './VinculoModal'
import './Oficinas.css'

type OficinaForm = {
  nome: string
  categoria: string
  descricao: string
  idsUsuariosResponsaveis: string[]
  ativo: boolean
}

const emptyForm: OficinaForm = {
  nome: '',
  categoria: '',
  descricao: '',
  idsUsuariosResponsaveis: [],
  ativo: true,
}

type SelecaoAluno = { selected: boolean; nivelSuporte: string; consideracoesPedagogicas: string }

function formatDataBR(data?: string) {
  if (!data) return ''
  const [y, m, d] = data.split('-')
  return `${d}/${m}/${y}`
}

function toggleListValue<T>(list: T[], value: T) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

export function Oficinas() {
  const { userProfile } = useAuth()
  const canAssignStudents = userProfile?.papel === 'direcao' || userProfile?.papel === 'pedagogia'

  // Estados separados de carregando / erro / dados para cada fonte.
  const oficinasSub = useSubscription<Oficina[]>(subscribeToOficinas, [])
  const turmasSub = useSubscription<Turma[]>(subscribeToTurmas, [])
  const vinculosSub = useSubscription<TurmaOficina[]>(subscribeToTurmaOficinas, [])
  const alunoOficinasSub = useSubscription<AlunoOficina[]>(subscribeToAlunoOficinas, [])
  const studentsSub = useSubscription<Student[]>((onData, onError) => subscribeToStudents(onData, onError), [])
  const usuariosSub = useSubscription<UserProfile[]>(subscribeToUsuarios, [])
  const oficinas = oficinasSub.data
  const turmas = turmasSub.data
  const vinculos = vinculosSub.data
  const alunoOficinas = alunoOficinasSub.data
  const studentsList = studentsSub.data
  const usuarios = usuariosSub.data

  const [search, setSearch] = useState('')
  const [categoriaFilter, setCategoriaFilter] = useState('todas')
  const [turmaFilter, setTurmaFilter] = useState('todas')

  // Modal cadastro/edição
  const [showForm, setShowForm] = useState(false)
  const [editingOficina, setEditingOficina] = useState<Oficina | null>(null)
  const [form, setForm] = useState<OficinaForm>(emptyForm)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Modal de alunos por oficina/turma
  const [vinculoAlunos, setVinculoAlunos] = useState<TurmaOficina | null>(null)
  const [selecaoAlunos, setSelecaoAlunos] = useState<Record<string, SelecaoAluno>>({})
  const [savingAlunos, setSavingAlunos] = useState(false)
  const [alunosError, setAlunosError] = useState<string | null>(null)

  // Modal de vínculo turma-oficina (criar / editar / inativar)
  const [vinculoAlvo, setVinculoAlvo] = useState<VinculoModalAlvo | null>(null)

  // Modal exclusão
  const [oficinaToDelete, setOficinaToDelete] = useState<Oficina | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [actionFeedback, setActionFeedback] = useState<string | null>(null)
  const [partialWarning, setPartialWarning] = useState<string | null>(null)


  const vinculosAtivosPorOficina = useMemo(() => {
    const map: Record<string, TurmaOficina[]> = {}
    vinculos
      .filter((v) => v.ativo && turmas.some((t) => t.id === v.turmaId))
      .forEach((v) => {
        map[v.oficinaId] = [...(map[v.oficinaId] || []), v]
      })
    return map
  }, [vinculos, turmas])

  // Vínculos inativados: não recebem novos registros, mas ficam visíveis no histórico
  const vinculosInativosPorOficina = useMemo(() => {
    const map: Record<string, TurmaOficina[]> = {}
    vinculos
      .filter((v) => !v.ativo)
      .forEach((v) => {
        map[v.oficinaId] = [...(map[v.oficinaId] || []), v]
      })
    return map
  }, [vinculos])

  const alunosAtivosPorVinculo = useMemo(() => {
    const map: Record<string, AlunoOficina[]> = {}
    alunoOficinas
      .filter((a) => a.status === 'ativo')
      .forEach((a) => {
        map[a.turmaOficinaId] = [...(map[a.turmaOficinaId] || []), a]
      })
    return map
  }, [alunoOficinas])

  const filtered = useMemo(() => {
    const term = search.toLowerCase()
    return oficinas.filter((o) => {
      const matchesSearch = o.nome.toLowerCase().includes(term)
      const matchesCategoria = categoriaFilter === 'todas' || o.categoria === categoriaFilter
      const matchesTurma =
        turmaFilter === 'todas' ||
        (vinculosAtivosPorOficina[o.id] || []).some((v) => v.turmaId === turmaFilter)
      return matchesSearch && matchesCategoria && matchesTurma
    })
  }, [oficinas, search, categoriaFilter, turmaFilter, vinculosAtivosPorOficina])

  const totals = useMemo(() => {
    const vinculosAtivos = Object.values(vinculosAtivosPorOficina).flat()
    const alunosUnicos = new Set(
      vinculosAtivos.flatMap((v) => (alunosAtivosPorVinculo[v.id] || []).map((a) => a.alunoId))
    )
    return {
      total: oficinas.length,
      ativas: oficinas.filter((o) => o.ativo).length,
      vinculos: vinculosAtivos.length,
      alunos: alunosUnicos.size,
    }
  }, [oficinas, vinculosAtivosPorOficina, alunosAtivosPorVinculo])

  const showFeedback = (message: string) => {
    setActionFeedback(message)
    setTimeout(() => setActionFeedback(null), 3500)
  }

  const turmaNome = (turmaId: string) => turmas.find((t) => t.id === turmaId)?.nome || 'Turma removida'

  // ==== Cadastro / edição ====

  const openCreate = () => {
    setEditingOficina(null)
    setForm(emptyForm)
    setFormError(null)
    setShowForm(true)
  }

  const openEdit = (oficina: Oficina) => {
    setEditingOficina(oficina)
    setForm({
      nome: oficina.nome,
      categoria: oficina.categoria,
      descricao: oficina.descricao,
      idsUsuariosResponsaveis: oficina.idsUsuariosResponsaveis,
      ativo: oficina.ativo,
    })
    setFormError(null)
    setShowForm(true)
  }

  const updateField = <K extends keyof OficinaForm>(field: K, value: OficinaForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)

    if (!form.categoria) {
      setFormError('Selecione a categoria da oficina.')
      return
    }
    if (form.idsUsuariosResponsaveis.length === 0) {
      setFormError('Selecione ao menos um profissional responsável pela oficina.')
      return
    }

    const payload: OficinaInput = {
      nome: form.nome,
      categoria: form.categoria,
      descricao: form.descricao,
      idsUsuariosResponsaveis: form.idsUsuariosResponsaveis,
      ativo: form.ativo,
    }

    setSaving(true)
    try {
      const userId = userProfile?.uid || 'sistema'
      if (editingOficina) {
        await updateOficina(editingOficina.id, payload, userId)
        showFeedback(`Oficina ${form.nome} atualizada com sucesso.`)
      } else {
        await createOficina(payload, userId)
        showFeedback(`Oficina ${form.nome} cadastrada. Use “Vincular turma” no card para definir turmas, horários e responsáveis.`)
      }
      setShowForm(false)
    } catch (err) {
      console.error('Erro ao salvar oficina:', err)
      setFormError(failureMessage(err, editingOficina ? 'atualizar a oficina' : 'cadastrar a oficina'))
    } finally {
      setSaving(false)
    }
  }

  // ==== Alunos por oficina na turma ====

  const openAlunos = (vinculo: TurmaOficina) => {
    const atuais = alunosAtivosPorVinculo[vinculo.id] || []
    const selecao: Record<string, SelecaoAluno> = {}
    atuais.forEach((a) => {
      selecao[a.alunoId] = {
        selected: true,
        nivelSuporte: a.nivelSuporte,
        consideracoesPedagogicas: a.consideracoesPedagogicas,
      }
    })
    setSelecaoAlunos(selecao)
    setAlunosError(null)
    setVinculoAlunos(vinculo)
  }

  const updateSelecao = (alunoId: string, patch: Partial<SelecaoAluno>) => {
    setSelecaoAlunos((current) => ({
      ...current,
      [alunoId]: {
        ...(current[alunoId] || { selected: false, nivelSuporte: '', consideracoesPedagogicas: '' }),
        ...patch,
      },
    }))
  }

  const alunosDaTurmaDoVinculo = useMemo(() => {
    if (!vinculoAlunos) return []
    const turma = turmas.find((t) => t.id === vinculoAlunos.turmaId)
    if (!turma) return []
    return studentsList
      .filter((s) => studentBelongsToTurma(s, turma) && s.status !== 'Inativo')
      .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
  }, [vinculoAlunos, turmas, studentsList])

  const handleSaveAlunos = async () => {
    if (!vinculoAlunos) return
    const oficina = oficinas.find((o) => o.id === vinculoAlunos.oficinaId)
    const selecionados: AlunoOficinaSelecao[] = Object.entries(selecaoAlunos)
      .filter(([, s]) => s.selected)
      .map(([alunoId, s]) => ({
        alunoId,
        nivelSuporte: s.nivelSuporte,
        consideracoesPedagogicas: s.consideracoesPedagogicas,
      }))

    // A lista atual de participantes define quem será incluído ou removido.
    if (alunoOficinasSub.status !== 'ready') {
      setAlunosError(
        'Os participantes atuais da oficina não foram carregados. Use “Tentar novamente” no aviso da página antes de salvar.'
      )
      return
    }

    setSavingAlunos(true)
    setAlunosError(null)
    try {
      const { resumosNaoAtualizados } = await saveAlunosDaOficina(
        vinculoAlunos.id,
        oficina?.nome || '',
        selecionados,
        alunoOficinas,
        userProfile?.uid || 'sistema'
      )
      const titulo = `Participantes de ${oficina?.nome} na ${turmaNome(vinculoAlunos.turmaId)}`
      if (resumosNaoAtualizados.length > 0) {
        const nomes = resumosNaoAtualizados
          .map((r) => `${studentsList.find((st) => st.id === r.alunoId)?.name || r.alunoId} (${r.motivo})`)
          .join('; ')
        setPartialWarning(
          `${titulo}: vínculos salvos no sistema, mas o resumo de oficinas no cadastro destes alunos não foi atualizado: ${nomes}. ` +
            'A participação está registrada; ajuste o campo de oficinas no cadastro do aluno, se necessário.'
        )
      } else {
        showFeedback(`${titulo} confirmados no banco de dados.`)
      }
      setVinculoAlunos(null)
    } catch (err) {
      console.error('Erro ao vincular alunos:', err)
      setAlunosError(failureMessage(err, 'salvar os participantes da oficina'))
    } finally {
      setSavingAlunos(false)
    }
  }

  // ==== Exclusão ====

  const handleConfirmDelete = async () => {
    if (!oficinaToDelete) return
    // Os vínculos ativos são inativados junto; sem a lista atual, algum ficaria ativo.
    if (vinculosSub.status !== 'ready') {
      alert('Os vínculos da oficina não foram carregados. Use “Tentar novamente” no aviso da página antes de inativar.')
      return
    }
    setDeleting(true)
    try {
      await deleteOficina(oficinaToDelete.id, vinculos, userProfile?.uid || 'sistema')
      showFeedback(`Oficina ${oficinaToDelete.nome} inativada com sucesso.`)
      setOficinaToDelete(null)
    } catch (err) {
      console.error('Erro ao inativar oficina:', err)
      alert(failureMessage(err, 'inativar a oficina'))
    } finally {
      setDeleting(false)
    }
  }

  const vinculosDaOficinaExcluida = oficinaToDelete
    ? vinculosAtivosPorOficina[oficinaToDelete.id] || []
    : []
  const alunosDaOficinaExcluida = vinculosDaOficinaExcluida.reduce(
    (acc, v) => acc + (alunosAtivosPorVinculo[v.id] || []).length,
    0
  )

  const oficinaDoVinculo = vinculoAlunos
    ? oficinas.find((o) => o.id === vinculoAlunos.oficinaId)
    : null

  return (
    <div className="page-container oficinas-page">
      <div className="report-page-heading">
        <div>
          <span className="eyebrow">Organização</span>
          <h2>Oficinas e atividades</h2>
          <p>
            Cadastre as oficinas, defina em quais turmas e horários acontecem e vincule os alunos
            conforme o plano individual.
          </p>
        </div>
        <div className="report-heading-actions">
          <button className="button primary" onClick={openCreate} type="button">
            <Plus size={18} /> Nova oficina
          </button>
        </div>
      </div>

      <LoadErrors
        impact="Vínculos, contagens e participantes exibidos podem estar incompletos; salvar alterações fica bloqueado até carregarem."
        sources={[
          { what: 'as turmas', ...turmasSub },
          { what: 'os vínculos turma-oficina', ...vinculosSub },
          { what: 'os participantes das oficinas', ...alunoOficinasSub },
          { what: 'os alunos', ...studentsSub },
          { what: 'a equipe', ...usuariosSub },
        ]}
      />

      {partialWarning && (
        <div className="feedback-banner warning" role="alert">
          <AlertCircle size={18} />
          <span>{partialWarning}</span>
          <button className="text-button" onClick={() => setPartialWarning(null)} type="button">
            Fechar
          </button>
        </div>
      )}

      {actionFeedback && (
        <div className="feedback-banner success">
          <CheckCircle2 size={18} />
          <span>{actionFeedback}</span>
        </div>
      )}

      <div className="entity-stats">
        <article className="metric-card">
          <span className="metric-icon orange">
            <Palette size={25} strokeWidth={2.2} />
          </span>
          <div>
            <strong>{formatLoadedCount(totals.total, oficinasSub.status)}</strong>
            <span>Oficinas cadastradas</span>
          </div>
        </article>
        <article className="metric-card">
          <span className="metric-icon mint">
            <CheckCircle2 size={25} strokeWidth={2.2} />
          </span>
          <div>
            <strong>{formatLoadedCount(totals.ativas, oficinasSub.status)}</strong>
            <span>Oficinas ativas</span>
          </div>
        </article>
        <article className="metric-card">
          <span className="metric-icon green">
            <GraduationCap size={25} strokeWidth={2.2} />
          </span>
          <div>
            <strong>{formatLoadedCount(totals.vinculos, combineStatus(oficinasSub.status, vinculosSub.status, turmasSub.status))}</strong>
            <span>Vínculos com turmas</span>
          </div>
        </article>
        <article className="metric-card">
          <span className="metric-icon blue">
            <Users size={25} strokeWidth={2.2} />
          </span>
          <div>
            <strong>{formatLoadedCount(totals.alunos, combineStatus(oficinasSub.status, vinculosSub.status, turmasSub.status, alunoOficinasSub.status))}</strong>
            <span>Alunos participantes</span>
          </div>
        </article>
      </div>

      <div className="form-card entity-filter-card">
        <div className="entity-filter-bar">
          <label className="field">
            <span>Buscar</span>
            <div className="search-input">
              <Search size={16} />
              <input
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nome da oficina..."
                value={search}
              />
            </div>
          </label>
          <label className="field">
            <span>Categoria</span>
            <select onChange={(event) => setCategoriaFilter(event.target.value)} value={categoriaFilter}>
              <option value="todas">Todas as categorias</option>
              {CATEGORIAS_OFICINA.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>Turma</span>
            <select onChange={(event) => setTurmaFilter(event.target.value)} value={turmaFilter}>
              <option value="todas">Todas as turmas</option>
              {turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>

      {oficinasSub.status === 'loading' ? (
        <div className="form-card entity-empty">Carregando oficinas do banco de dados...</div>
      ) : oficinasSub.status === 'error' ? (
        <LoadError error={oficinasSub.error} onRetry={oficinasSub.retry} what="as oficinas" />
      ) : filtered.length === 0 ? (
        <div className="form-card entity-empty">
          <Palette size={32} />
          <strong>
            {oficinas.length === 0 ? 'Nenhuma oficina cadastrada' : 'Nenhuma oficina encontrada'}
          </strong>
          <span>
            {oficinas.length === 0
              ? 'Cadastre a primeira oficina e vincule-a às turmas.'
              : 'Ajuste os filtros para ver outras oficinas.'}
          </span>
          {oficinas.length === 0 && (
            <button className="button primary" onClick={openCreate} type="button">
              <Plus size={18} /> Nova oficina
            </button>
          )}
        </div>
      ) : (
        <div className="entity-grid">
          {filtered.map((oficina) => {
            const categoria = getCategoria(oficina.categoria)
            const oficinaVinculos = vinculosAtivosPorOficina[oficina.id] || []
            const responsaveis = oficina.idsUsuariosResponsaveis
              .map((uid) => getUsuarioNome(usuarios, uid))
              .join(', ')

            return (
              <article
                className={'entity-card' + (oficina.ativo ? '' : ' inactive')}
                key={oficina.id}
              >
                <div className="entity-card-top">
                  <span aria-hidden="true" className="entity-icon">
                    {categoria.emoji}
                  </span>
                  <div className="entity-card-title">
                    <h3>{oficina.nome}</h3>
                    <span className="entity-code">{categoria.label}</span>
                  </div>
                  {!oficina.ativo && <span className="status-pill danger">Inativa</span>}
                </div>

                <ul className="entity-meta">
                  <li>
                    <UserRoundCheck size={14} /> {responsaveis || 'Sem responsável'}
                  </li>
                  {oficina.descricao && <li className="oficina-descricao">{oficina.descricao}</li>}
                </ul>

                <div className="oficina-vinculos">
                  {oficinaVinculos.length === 0 ? (
                    <span className="entity-tag muted">
                      {combineStatus(vinculosSub.status, turmasSub.status) === 'ready'
                        ? 'Não vinculada a nenhuma turma'
                        : combineStatus(vinculosSub.status, turmasSub.status) === 'loading'
                          ? 'Carregando turmas…'
                          : 'Turmas indisponíveis'}
                    </span>
                  ) : (
                    oficinaVinculos.map((v) => {
                      const qtdAlunos = (alunosAtivosPorVinculo[v.id] || []).length
                      const responsaveisVinculo = v.idsUsuariosResponsaveis
                        .map((uid) => getUsuarioNome(usuarios, uid))
                        .join(', ')
                      return (
                        <div className="oficina-vinculo-row" key={v.id}>
                          <div>
                            <strong>{turmaNome(v.turmaId)}</strong>
                            <span>
                              <CalendarClock size={13} /> {formatHorarios(v.horarios)}
                            </span>
                            <span className="vinculo-responsaveis">
                              <UserRoundCheck size={13} /> {responsaveisVinculo || 'Sem responsável no vínculo'}
                            </span>
                          </div>
                          <div className="oficina-vinculo-actions">
                            <button
                              className="oficina-alunos-button"
                              onClick={() => openAlunos(v)}
                              title="Alunos participantes nesta turma"
                              type="button"
                            >
                              <Users size={14} /> {qtdAlunos}
                            </button>
                            <button
                              aria-label={`Editar vínculo com ${turmaNome(v.turmaId)}`}
                              className="icon-button"
                              onClick={() => setVinculoAlvo({ tipo: 'editar', vinculo: v })}
                              title="Editar horários e responsáveis"
                              type="button"
                            >
                              <Pencil size={14} />
                            </button>
                          </div>
                        </div>
                      )
                    })
                  )}
                  {(vinculosInativosPorOficina[oficina.id] || []).length > 0 && (
                    <details className="vinculo-historico">
                      <summary>
                        {(vinculosInativosPorOficina[oficina.id] || []).length} vínculo(s) inativo(s) no histórico
                      </summary>
                      <ul>
                        {(vinculosInativosPorOficina[oficina.id] || []).map((v) => (
                          <li key={v.id}>
                            {turmaNome(v.turmaId)} — {formatHorarios(v.horarios)}
                            {v.inativadoEm ? ` (inativado em ${formatDataBR(v.inativadoEm)})` : ''}
                          </li>
                        ))}
                      </ul>
                    </details>
                  )}
                </div>

                <div className="entity-actions">
                  <button
                    className="button secondary entity-main-action"
                    disabled={!oficina.ativo}
                    onClick={() => setVinculoAlvo({ tipo: 'novo-na-oficina', oficinaId: oficina.id })}
                    title={oficina.ativo ? 'Vincular a uma turma' : 'Reative a oficina para vinculá-la a turmas'}
                    type="button"
                  >
                    <Link2 size={16} /> Vincular turma
                  </button>
                  <div className="students-table-actions">
                    <button
                      aria-label={'Editar ' + oficina.nome}
                      onClick={() => openEdit(oficina)}
                      title="Editar oficina"
                      type="button"
                    >
                      <Pencil size={16} />
                    </button>
                    <button
                      aria-label={'Excluir ' + oficina.nome}
                      className="danger"
                      onClick={() => setOficinaToDelete(oficina)}
                      title="Excluir oficina"
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

      {/* Modal Cadastro / Edição de Oficina */}
      {showForm && (
        <div className="modal-backdrop" onClick={() => setShowForm(false)}>
          <div className="modal-container oficina-modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <div className="modal-title-group">
                <Palette className="modal-icon" size={22} />
                <div>
                  <h3>{editingOficina ? `Editar oficina: ${editingOficina.nome}` : 'Nova oficina'}</h3>
                  <p>Dados gerais da oficina e responsáveis padrão.</p>
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
                <label className="field field-wide">
                  <span>Nome da oficina *</span>
                  <input
                    onChange={(e) => updateField('nome', e.target.value)}
                    placeholder="Ex: Musicalização"
                    required
                    value={form.nome}
                  />
                </label>
                <label className="field field-wide">
                  <span>Tipo / categoria *</span>
                  <select
                    onChange={(e) => updateField('categoria', e.target.value)}
                    required
                    value={form.categoria}
                  >
                    <option value="">Selecione</option>
                    {CATEGORIAS_OFICINA.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.emoji} {c.label}
                      </option>
                    ))}
                  </select>
                </label>

                <div className="field field-wide">
                  <span>Profissional(is) responsável(is) padrão *</span>
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

                <label className="field field-wide">
                  <span>
                    Descrição / objetivos <em>(opcional)</em>
                  </span>
                  <textarea
                    onChange={(e) => updateField('descricao', e.target.value)}
                    placeholder="Descreva os objetivos da oficina..."
                    rows={3}
                    value={form.descricao}
                  />
                </label>

                <p className="oficina-alunos-hint field-wide">
                  Os responsáveis acima são o padrão da oficina. Turmas, horários semanais e responsáveis de cada
                  turma são definidos no vínculo, pelo botão <strong>Vincular turma</strong> no card da oficina ou
                  na tela <strong>Turmas</strong>.
                </p>

                <label className="toggle-check field-wide">
                  <input
                    checked={form.ativo}
                    onChange={(e) => updateField('ativo', e.target.checked)}
                    type="checkbox"
                  />
                  <span>Oficina ativa (disponível no registro de atividades)</span>
                </label>
              </div>

              <div className="modal-form-actions">
                <button className="button secondary" onClick={() => setShowForm(false)} type="button">
                  Cancelar
                </button>
                <button className="button primary" disabled={saving} type="submit">
                  {saving ? 'Salvando...' : editingOficina ? 'Salvar alterações' : 'Cadastrar oficina'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {vinculoAlvo && (
        <VinculoModal
          alvo={vinculoAlvo}
          dadosStatus={combineStatus(turmasSub.status, oficinasSub.status, vinculosSub.status, usuariosSub.status)}
          oficinas={oficinas}
          onClose={() => setVinculoAlvo(null)}
          onSaved={showFeedback}
          participantesAtivos={(id) => (alunosAtivosPorVinculo[id] || []).length}
          turmas={turmas}
          userId={userProfile?.uid || 'sistema'}
          usuarios={usuarios}
          vinculos={vinculos}
        />
      )}

      {/* Modal Alunos participantes da oficina na turma */}
      {vinculoAlunos && (
        <div className="modal-backdrop" onClick={() => setVinculoAlunos(null)}>
          <div className="modal-container oficina-modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <div className="modal-title-group">
                <Link2 className="modal-icon" size={22} />
                <div>
                  <h3>
                    {oficinaDoVinculo?.nome} — {turmaNome(vinculoAlunos.turmaId)}
                  </h3>
                  <p>{formatHorarios(vinculoAlunos.horarios)}</p>
                </div>
              </div>
              <button
                aria-label="Fechar"
                className="icon-button modal-close"
                onClick={() => setVinculoAlunos(null)}
                type="button"
              >
                <X size={20} />
              </button>
            </header>

            <div className="modal-form">
              {alunosError && (
                <div className="modal-error-banner">
                  <AlertCircle size={18} /> {alunosError}
                </div>
              )}

              <small className="oficina-alunos-hint">
                Selecione os alunos da turma que participam desta oficina, considerando o grau de
                dependência e o desenvolvimento cognitivo e físico de cada um.
                {!canAssignStudents && ' Somente Direção e Pedagogia podem alterar os vínculos.'}
              </small>

              {combineStatus(studentsSub.status, alunoOficinasSub.status) === 'error' ? (
                <LoadError
                  error={studentsSub.error || alunoOficinasSub.error}
                  onRetry={() => {
                    if (studentsSub.status === 'error') studentsSub.retry()
                    if (alunoOficinasSub.status === 'error') alunoOficinasSub.retry()
                  }}
                  what="os alunos e participantes"
                />
              ) : combineStatus(studentsSub.status, alunoOficinasSub.status) === 'loading' ? (
                <p className="entity-modal-empty">Carregando alunos…</p>
              ) : alunosDaTurmaDoVinculo.length === 0 ? (
                <p className="entity-modal-empty">
                  Nenhum aluno ativo vinculado a esta turma. Vincule alunos à turma pelo cadastro do
                  aluno.
                </p>
              ) : (
                <ul className="oficina-alunos-list">
                  {alunosDaTurmaDoVinculo.map((s) => {
                    const sel = selecaoAlunos[s.id]
                    const checked = Boolean(sel?.selected)
                    return (
                      <li className={checked ? 'selected' : ''} key={s.id}>
                        <label className="toggle-check">
                          <input
                            checked={checked}
                            disabled={!canAssignStudents}
                            onChange={(e) => updateSelecao(s.id, { selected: e.target.checked })}
                            type="checkbox"
                          />
                          <span className="oficina-aluno-info">
                            <strong>{s.name}</strong>
                          </span>
                        </label>
                        {checked && (
                          <div className="oficina-aluno-fields">
                            <label className="field">
                              <span>Nível de suporte</span>
                              <select
                                disabled={!canAssignStudents}
                                onChange={(e) => updateSelecao(s.id, { nivelSuporte: e.target.value })}
                                value={sel?.nivelSuporte || ''}
                              >
                                <option value="">Não definido</option>
                                {NIVEIS_SUPORTE.map((n) => (
                                  <option key={n} value={n.toLowerCase()}>
                                    {n}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label className="field">
                              <span>
                                Considerações pedagógicas <em>(opcional)</em>
                              </span>
                              <input
                                disabled={!canAssignStudents}
                                onChange={(e) =>
                                  updateSelecao(s.id, { consideracoesPedagogicas: e.target.value })
                                }
                                placeholder="Ex: acompanhamento próximo em grupo"
                                value={sel?.consideracoesPedagogicas || ''}
                              />
                            </label>
                          </div>
                        )}
                      </li>
                    )
                  })}
                </ul>
              )}

              <div className="modal-form-actions">
                <button
                  className="button secondary"
                  onClick={() => setVinculoAlunos(null)}
                  type="button"
                >
                  {canAssignStudents ? 'Cancelar' : 'Fechar'}
                </button>
                {canAssignStudents && alunosDaTurmaDoVinculo.length > 0 && (
                  <button
                    className="button primary"
                    disabled={savingAlunos}
                    onClick={handleSaveAlunos}
                    type="button"
                  >
                    {savingAlunos ? 'Salvando...' : 'Salvar participantes'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmação de Inativação */}
      {oficinaToDelete && (
        <div className="modal-backdrop" onClick={() => setOficinaToDelete(null)}>
          <div className="modal-container confirm-modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <div className="modal-title-group">
                <AlertTriangle className="modal-icon danger" size={22} />
                <div>
                  <h3 className="danger-text">Inativar Oficina</h3>
                  <p>Ação reversível - o histórico será preservado</p>
                </div>
              </div>
              <button
                aria-label="Fechar"
                className="icon-button modal-close"
                onClick={() => setOficinaToDelete(null)}
                type="button"
              >
                <X size={20} />
              </button>
            </header>

            <div className="confirm-modal-body">
              <p>
                Tem certeza que deseja inativar a oficina <strong>{oficinaToDelete.nome}</strong>?
              </p>
              <p className="confirm-modal-hint">
                {vinculosDaOficinaExcluida.length > 0
                  ? `Ela está vinculada a ${vinculosDaOficinaExcluida.length} turma(s) e ` +
                    `${alunosDaOficinaExcluida} aluno(s); esses vínculos serão inativados e deixam de aparecer na chamada e nas atividades. `
                  : ''}
                Registros de atividade já realizados são mantidos no histórico.
              </p>
            </div>

            <div className="confirm-modal-footer">
              <button
                className="button secondary"
                onClick={() => setOficinaToDelete(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button danger"
                disabled={deleting}
                onClick={handleConfirmDelete}
                type="button"
              >
                <UserX size={16} />
                {deleting ? 'Inativando...' : 'Sim, Inativar Oficina'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
