import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpenCheck,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  Download,
  FileBarChart,
  FileText,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MessageCircle,
  Palette,
  Paperclip,
  Save,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { CadastrarAluno } from './features/alunos/CadastrarAluno'
import { ListarAlunos } from './features/alunos/ListarAlunos'
import { DetalheAluno } from './features/alunos/DetalheAluno'
import { Frequencia } from './features/frequencia/Frequencia'
import { GerenciarUsuarios } from './features/usuarios/GerenciarUsuarios'
import { Turmas } from './features/turmas/Turmas'
import { Oficinas } from './features/oficinas/Oficinas'
import { Atividades } from './features/atividades/Atividades'
import { RelatoriosScreen } from './features/relatorios/RelatoriosScreen'
import { LoginScreen } from './features/auth/LoginScreen'
import { useAuth } from './features/auth/AuthContext'
import { subscribeToStudents } from './services/studentsService'
import {
  getRelatoriosDoAluno,
  saveRelatorio,
  subscribeToRelatoriosDoAluno,
  uploadAnexoRelatorio,
} from './services/relatoriosService'
import type { RelatorioPedagogico } from './types/relatoriosPedagogicos'
import { tipoRelatorioToFirestore, tipoRelatorioToLabel } from './types/relatoriosPedagogicos'
import {
  getAlunosFaltasRecorrentes,
  getDashboardMetrics,
  getTarefasDeHoje,
  getUltimasAtualizacoes,
} from './services/dashboardService'
import type { AlunoFaltaRecorrente, TimelineItem } from './services/dashboardService'
import type { UserProfile, UserRole } from './types/auth'
import { ROLE_LABELS } from './types/auth'
import type { Student } from './features/alunos/students-data'
import { findStudent } from './features/alunos/students-data'
import logoUrl from './assets/logo.png'
import './App.css'

type Screen =
  | 'home'
  | 'reports'
  | 'register'
  | 'students'
  | 'student-detail'
  | 'frequencia'
  | 'usuarios'
  | 'turmas'
  | 'oficinas'
  | 'atividades'

const validScreens: Screen[] = [
  'reports',
  'register',
  'students',
  'student-detail',
  'frequencia',
  'usuarios',
  'turmas',
  'oficinas',
  'atividades',
]

type NavItem = {
  label: string
  icon: LucideIcon
  screen?: Screen
}

const mainNavigation: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, screen: 'home' },
  { label: 'Alunos', icon: Users, screen: 'students' },
  { label: 'Turmas', icon: GraduationCap, screen: 'turmas' },
  { label: 'Oficinas', icon: Palette, screen: 'oficinas' },
  { label: 'Frequência', icon: ClipboardCheck, screen: 'frequencia' },
  { label: 'Atividades', icon: ListChecks, screen: 'atividades' },
]

const pedagogicalNavigation: NavItem[] = [
  { label: 'Evolução', icon: BarChart3 },
  { label: 'Relatórios', icon: FileText, screen: 'reports' },
]

const adminNavigation: NavItem[] = [
  { label: 'Equipe / Autores', icon: ShieldCheck, screen: 'usuarios' },
]

function Brand() {
  return (
    <div className="brand">
      <span className="brand-mark" aria-hidden="true">
        <img alt="" src={logoUrl} />
      </span>
      <span className="brand-copy">
        <strong>Fundação</strong>
        <strong>Toque</strong>
      </span>
    </div>
  )
}

function Sidebar({
  currentScreen,
  isOpen,
  userRole,
  onClose,
  onNavigate,
  onLogout,
}: {
  currentScreen: Screen
  isOpen: boolean
  userRole?: UserRole
  onClose: () => void
  onNavigate: (screen: Screen) => void
  onLogout: () => void
}) {
  const renderItem = (item: NavItem) => {
    const Icon = item.icon
    const active =
      item.screen === currentScreen ||
      (item.screen === 'students' && (currentScreen === 'register' || currentScreen === 'student-detail'))

    return (
      <button
        className={'nav-item' + (active ? ' active' : '')}
        key={item.label}
        onClick={() => {
          if (item.screen) {
            onNavigate(item.screen)
            onClose()
          }
        }}
        type="button"
      >
        <Icon size={19} strokeWidth={2} />
        <span>{item.label}</span>
      </button>
    )
  }

  return (
    <>
      <aside className={'sidebar' + (isOpen ? ' open' : '')}>
        <div className="sidebar-header">
          <Brand />
          <button
            aria-label="Fechar menu"
            className="icon-button sidebar-close"
            onClick={onClose}
            type="button"
          >
            <X size={20} />
          </button>
        </div>

        <nav aria-label="Navegação principal" className="sidebar-nav">
          <p className="nav-label">Principal</p>
          {mainNavigation.map(renderItem)}
          <p className="nav-label nav-label-spaced">Pedagógico</p>
          {pedagogicalNavigation.map(renderItem)}
          {userRole === 'direcao' && (
            <>
              <p className="nav-label nav-label-spaced">Administração</p>
              {adminNavigation.map(renderItem)}
            </>
          )}
        </nav>

        <button className="logout-button" onClick={onLogout} title="Sair da conta" type="button">
          <LogOut size={19} />
          <span>Sair</span>
        </button>
      </aside>
      {isOpen && (
        <button
          aria-label="Fechar menu"
          className="sidebar-overlay"
          onClick={onClose}
          type="button"
        />
      )}
    </>
  )
}

function Topbar({
  screen,
  studentName,
  userProfile,
  onOpenMenu,
}: {
  screen: Screen
  studentName?: string
  userProfile?: UserProfile | null
  onOpenMenu: () => void
}) {
  const titles: Record<Screen, string> = {
    home: 'Dashboard',
    reports: 'Relatórios',
    register: 'Cadastrar aluno',
    students: 'Alunos',
    'student-detail': studentName ?? 'Perfil do aluno',
    frequencia: 'Frequência e Registro de Chamada',
    usuarios: 'Equipe e Autores do Sistema',
    turmas: 'Turmas',
    oficinas: 'Oficinas e Atividades',
    atividades: 'Registro de Atividades',
  }

  const initials = userProfile
    ? userProfile.nome_completo
        .split(' ')
        .filter(Boolean)
        .map((n) => n[0])
        .slice(0, 2)
        .join('')
        .toUpperCase()
    : 'AS'

  const displayName = userProfile?.nome_completo || 'Ana Carolina Silva'
  const displayRole = userProfile ? ROLE_LABELS[userProfile.papel] : 'Pedagoga'

  return (
    <header className="topbar">
      <div className="topbar-title">
        <button
          aria-label="Abrir menu"
          className="icon-button menu-button"
          onClick={onOpenMenu}
          type="button"
        >
          <Menu size={22} />
        </button>
        <h1>{titles[screen]}</h1>
      </div>

      <div className="topbar-actions">
        <button aria-label="Notificações" className="icon-button notification-button" type="button">
          <Bell size={19} />
          <span className="notification-dot" />
        </button>
        <span className="profile-avatar" aria-hidden="true">{initials}</span>
        <div className="profile-copy">
          <strong>{displayName}</strong>
          <span>{displayRole}</span>
        </div>
        <ChevronDown className="profile-chevron" size={18} />
      </div>
    </header>
  )
}

function MetricCard({
  icon: Icon,
  value,
  label,
  tone,
}: {
  icon: LucideIcon
  value: string
  label: string
  tone: string
}) {
  return (
    <article className="metric-card">
      <span className={'metric-icon ' + tone}>
        <Icon size={25} strokeWidth={2.2} />
      </span>
      <div>
        <strong>{value}</strong>
        <span>{label}</span>
      </div>
    </article>
  )
}

function SectionCard({
  title,
  action,
  className = '',
  children,
}: {
  title: string
  action?: ReactNode
  className?: string
  children: ReactNode
}) {
  return (
    <section className={'section-card ' + className}>
      <div className="section-card-header">
        <h2>{title}</h2>
        {action}
      </div>
      {children}
    </section>
  )
}

function Dashboard({
  onNavigate,
  userName,
}: {
  onNavigate: (screen: Screen, params?: Record<string, string>) => void
  userName?: string
}) {
  const formattedDate = useMemo(() => {
    const text = new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(new Date())
    return text.charAt(0).toUpperCase() + text.slice(1)
  }, [])

  const [metrics, setMetrics] = useState({ alunosAtivos: 0, turmasAtivas: 0, oficinasAtivas: 0, frequenciaMedia: null as number | null })
  const [loadingMetrics, setLoadingMetrics] = useState(true)
  const [faltas, setFaltas] = useState<AlunoFaltaRecorrente[]>([])
  const [timeline, setTimeline] = useState<TimelineItem[]>([])
  const [tarefas, setTarefas] = useState<{ titulo: string; prazo: string; feito: boolean }[]>([])
  const [dashboardError, setDashboardError] = useState('')

  useEffect(() => {
    let mounted = true
    async function load() {
      setLoadingMetrics(true)
      setDashboardError('')
      try {
        const [m, f, t, tasks] = await Promise.all([
          getDashboardMetrics(),
          getAlunosFaltasRecorrentes(5),
          getUltimasAtualizacoes(6),
          getTarefasDeHoje(),
        ])
        if (!mounted) return
        setMetrics({
          alunosAtivos: m.alunosAtivos,
          turmasAtivas: m.turmasAtivas,
          oficinasAtivas: m.oficinasAtivas,
          frequenciaMedia: m.frequenciaMedia,
        })
        setFaltas(f)
        setTimeline(t)
        setTarefas(tasks)
      } catch (err) {
        console.warn('Erro ao carregar dashboard do Firestore:', err)
        if (mounted) setDashboardError('Não foi possível carregar os dados do banco. Verifique a conexão/permissões.')
      } finally {
        if (mounted) setLoadingMetrics(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [])

  const pendentes = tarefas.filter((t) => !t.feito).length

  const shortcuts = [
    { label: 'Cadastrar aluno', description: 'Novo cadastro completo', icon: UserRound, action: 'register' as Screen },
    { label: 'Registrar frequência', description: 'Chamada do dia', icon: ClipboardCheck, action: 'frequencia' as Screen },
    {
      label: 'Registrar atividade',
      description: 'Atividades por turma',
      icon: BookOpenCheck,
      action: 'atividades' as Screen,
    },
    {
      label: 'Gerar relatório',
      description: 'Acompanhamento pedagógico',
      icon: FileBarChart,
      action: 'reports' as Screen,
    },
  ]

  return (
    <div className="dashboard-page page-container">
      <section className="welcome-banner">
        <div>
          <h2>Olá, {userName || 'Colaborador'}! <span aria-hidden="true">👋</span></h2>
          <p>{formattedDate} — Tenha um ótimo dia de trabalho.</p>
        </div>
        <Sparkles aria-hidden="true" size={60} strokeWidth={1.5} />
      </section>

      {dashboardError && (
        <p style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 8, padding: '0.6rem 0.9rem' }}>
          {dashboardError}
        </p>
      )}

      <section aria-label="Resumo do sistema" className="metrics-grid">
        <MetricCard icon={Users} label="Alunos ativos" tone="green" value={loadingMetrics ? '…' : String(metrics.alunosAtivos)} />
        <MetricCard icon={GraduationCap} label="Turmas ativas" tone="blue" value={loadingMetrics ? '…' : String(metrics.turmasAtivas)} />
        <MetricCard icon={Palette} label="Oficinas em andamento" tone="orange" value={loadingMetrics ? '…' : String(metrics.oficinasAtivas)} />
        <MetricCard
          icon={TrendingUp}
          label="Frequência média (mês)"
          tone="mint"
          value={loadingMetrics ? '…' : metrics.frequenciaMedia === null ? '—' : `${metrics.frequenciaMedia}%`}
        />
      </section>

      <div className="dashboard-primary-grid">
        <SectionCard className="shortcuts-card" title="Atalhos rápidos">
          <div className="shortcuts-grid">
            {shortcuts.map((shortcut) => {
              const Icon = shortcut.icon
              return (
                <button
                  className="shortcut-button"
                  key={shortcut.label}
                  onClick={() => {
                    if (!shortcut.action) return
                    if (shortcut.action === 'reports') {
                      onNavigate('reports', { aba: 'pedagogico' })
                      return
                    }
                    onNavigate(shortcut.action)
                  }}
                  type="button"
                >
                  <Icon size={34} strokeWidth={2} />
                  <strong>{shortcut.label}</strong>
                  <span>{shortcut.description}</span>
                </button>
              )
            })}
          </div>
        </SectionCard>

        <SectionCard
          action={<span className="status-pill warning">{pendentes} pendentes</span>}
          className="tasks-card"
          title="Tarefas de hoje"
        >
          <div className="task-list">
            {tarefas.length === 0 && (
              <article className="task-item">
                <Clock3 className="task-icon amber" size={21} />
                <div>
                  <strong>{loadingMetrics ? 'Carregando tarefas…' : 'Nenhuma tarefa encontrada'}</strong>
                  <span>Verifique os registros de hoje</span>
                </div>
              </article>
            )}
            {tarefas.map((tarefa, i) => (
              <article className="task-item" key={tarefa.titulo}>
                {i === 0 && <ClipboardCheck className="task-icon amber" size={21} />}
                {i === 1 && <ListChecks className="task-icon orange" size={21} />}
                {i > 1 && <FileText className="task-icon green-text" size={21} />}
                <div>
                  <strong>{tarefa.titulo}</strong>
                  <span><Clock3 size={13} /> {tarefa.prazo}</span>
                </div>
                <span className={'status-pill ' + (tarefa.feito ? 'success' : 'danger')}>
                  {tarefa.feito ? 'Feito' : 'Pendente'}
                </span>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>

      <div className="dashboard-secondary-grid">
        <SectionCard
          action={<span className="status-pill warning">3+ faltas</span>}
          title="Alunos com faltas recorrentes"
        >
          <div className="absence-alert">
            <AlertTriangle size={21} />
            <div>
              <strong>
                {faltas.length === 0
                  ? 'Nenhum aluno com 3+ faltas consecutivas'
                  : `${faltas.length} aluno${faltas.length === 1 ? '' : 's'} precisa${faltas.length === 1 ? '' : 'm'} de contato com a família`}
              </strong>
              <span>Verifique os registros de contato e as ausências recentes.</span>
            </div>
          </div>
          <div className="student-alert-list">
            {faltas.map((aluno) => (
              <div className="student-alert-row" key={aluno.alunoId}>
                <span className="mini-avatar">{aluno.alunoNome.charAt(0)}</span>
                <div>
                  <strong>{aluno.alunoNome}</strong>
                  <span>{aluno.turmaNome} · {aluno.faltasConsecutivas} faltas consecutivas</span>
                </div>
                <button onClick={() => onNavigate('frequencia')} type="button">Ver chamadas</button>
              </div>
            ))}
            {faltas.length === 0 && !loadingMetrics && (
              <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Sem alertas no momento. Bom trabalho!</p>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Últimas atualizações">
          <div className="timeline">
            {timeline.length === 0 && (
              <article>
                <span className="timeline-dot"><Activity size={15} /></span>
                <div>
                  <small>{loadingMetrics ? 'Carregando…' : 'Sem movimentações'}</small>
                  <p>{loadingMetrics ? 'Buscando dados do banco…' : 'Nenhuma atividade, chamada ou relatório recente.'}</p>
                </div>
              </article>
            )}
            {timeline.map((item, index) => (
              <article key={item.id}>
                <span className="timeline-dot">
                  {index % 3 === 0 ? <CheckCircle2 size={15} /> : index % 3 === 1 ? <Activity size={15} /> : <FileText size={15} />}
                </span>
                <div>
                  <small>{item.horario}</small>
                  <p><strong>{item.autor}</strong> {item.texto}</p>
                </div>
              </article>
            ))}
          </div>
        </SectionCard>
      </div>
    </div>
  )
}

type ReportValues = {
  student: string
  reportType: string
  periodStart: string
  periodEnd: string
  professional: string
  evolution: string
  advances: string
  difficulties: string
  referrals: string
  finalNotes: string
}

const initialReport: ReportValues = {
  student: 'mariana-oliveira',
  reportType: 'Semestral',
  periodStart: '2026-01-01',
  periodEnd: '2026-06-30',
  professional: '',
  evolution:
    'Mariana demonstrou evolução gradual na participação das atividades coletivas e maior segurança para realizar tarefas com orientação.',
  advances:
    'Maior interação com os colegas, melhor organização da rotina e participação frequente nas oficinas de musicalização.',
  difficulties:
    'Ainda necessita de apoio para mudanças inesperadas de atividade e para manter a concentração por períodos prolongados.',
  referrals:
    'Manter estímulos visuais na rotina e ampliar, de forma progressiva, as atividades realizadas em pequenos grupos.',
  finalNotes: '',
}

function PedagogicalReport() {
  const { currentUser, userProfile } = useAuth()
  const [values, setValues] = useState<ReportValues>(initialReport)
  const [areas, setAreas] = useState({
    cognitive: 'Em evolução',
    motor: 'Adequado',
    social: 'Em evolução',
    communication: 'Em evolução',
    autonomy: 'Necessita apoio',
  })
  const [status, setStatus] = useState<'Rascunho' | 'Concluído'>('Rascunho')
  const [savedMessage, setSavedMessage] = useState('Nenhum salvamento ainda — preencha e salve no banco.')
  const [attachmentName, setAttachmentName] = useState('')
  const [attachmentFile, setAttachmentFile] = useState<File | null>(null)
  const [students, setStudents] = useState<Student[]>([])
  const [history, setHistory] = useState<RelatorioPedagogico[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingHistory, setLoadingHistory] = useState(true)
  const [error, setError] = useState('')

  const canWrite = userProfile?.papel === 'direcao' || userProfile?.papel === 'pedagogia'
  // Profissional exibido: o digitado, ou o nome do usuário logado como padrão
  const professionalName = values.professional || userProfile?.nome_completo || ''

  // Alunos reais do Firestore para o select (antes eram 3 fixos)
  useEffect(() => {
    const unsub = subscribeToStudents((list) => {
      setStudents(list)
      setValues((current) => {
        if (list.length === 0) return current
        const exists = list.some((s) => s.id === current.student)
        if (!exists) return { ...current, student: list[0].id }
        return current
      })
    })
    return () => unsub()
  }, [])

  // Histórico real do aluno selecionado (antes eram 2 fixos)
  useEffect(() => {
    if (!values.student) return undefined
    const unsub = subscribeToRelatoriosDoAluno(
      values.student,
      (list) => {
        setHistory(list)
        setLoadingHistory(false)
      },
      () => setLoadingHistory(false)
    )
    return () => unsub()
  }, [values.student])

  const selectedStudent = students.find((s) => s.id === values.student)

  const updateValue = (field: keyof ReportValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setStatus('Rascunho')
    if (field === 'student' || field === 'reportType' || field === 'periodStart' || field === 'periodEnd') {
      setEditingId(null)
    }
    if (field === 'student') {
      setHistory([])
      setLoadingHistory(true)
    }
  }

  function buildInput(nextStatus: 'rascunho' | 'concluido') {
    return {
      alunoId: values.student,
      tipoRelatorio: tipoRelatorioToFirestore(values.reportType),
      periodoInicio: values.periodStart,
      periodoFim: values.periodEnd,
      evolucao: values.evolution,
      dificuldades: values.difficulties,
      avancos: values.advances,
      encaminhamentos: values.referrals,
      observacoesFinais: values.finalNotes,
      avaliacaoPorArea: {
        cognitivo: areas.cognitive,
        motor: areas.motor,
        social: areas.social,
        comunicacao: areas.communication,
        autonomia: areas.autonomy,
      },
      usuarioResponsavelId: currentUser?.uid || userProfile?.uid || 'desconhecido',
      usuarioResponsavelNome: values.professional || userProfile?.nome_completo || '',
      status: nextStatus,
    }
  }

  async function persist(nextStatus: 'rascunho' | 'concluido'): Promise<boolean> {
    setError('')
    if (!canWrite) {
      setError('Seu perfil não tem permissão para salvar relatórios (apenas Direção e Pedagogia).')
      return false
    }
    if (!values.student) {
      setError('Selecione um aluno.')
      return false
    }
    if (!values.periodStart || !values.periodEnd) {
      setError('Informe o período avaliado.')
      return false
    }
    if (values.periodStart > values.periodEnd) {
      setError('O início do período não pode ser depois do fim.')
      return false
    }
    setSaving(true)
    try {
      const userId = currentUser?.uid || userProfile?.uid || 'desconhecido'
      const id = await saveRelatorio(buildInput(nextStatus), userId, editingId)
      setEditingId(id)
      if (attachmentFile) {
        try {
          await uploadAnexoRelatorio(id, attachmentFile, userId)
        } catch (anexoErr) {
          console.warn('Relatório salvo, mas anexo falhou:', anexoErr)
          setError('Relatório salvo, mas o anexo falhou (projeto sem Storage ou permissão).')
        }
      }
      if (nextStatus === 'rascunho') {
        setStatus('Rascunho')
        setSavedMessage(
          'Rascunho salvo no banco às ' +
            new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date())
        )
      } else {
        setStatus('Concluído')
        setSavedMessage('Relatório finalizado e salvo no banco — pronto para consulta.')
      }
      try {
        const updated = await getRelatoriosDoAluno(values.student)
        setHistory(updated)
      } catch {
        // realtime já atualiza
      }
      return true
    } catch (err) {
      console.error('Erro ao salvar relatório no Firestore:', err)
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('permission') || msg.includes('Missing or insufficient')) {
        setError('Sem permissão no Firestore (firestore.rules: apenas Direção/Pedagogia criam relatórios).')
      } else {
        setError('Não foi possível salvar no banco: ' + msg)
      }
      return false
    } finally {
      setSaving(false)
    }
  }

  const saveDraft = () => {
    void persist('rascunho')
  }

  const finishReport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    void persist('concluido')
  }

  const selectAttachment = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0] || null
    setAttachmentFile(selectedFile)
    setAttachmentName(selectedFile?.name ?? '')
  }

  function loadReportIntoForm(report: RelatorioPedagogico) {
    setEditingId(report.id)
    setValues({
      student: report.alunoId,
      reportType: tipoRelatorioToLabel(report.tipoRelatorio),
      periodStart: report.periodoInicio,
      periodEnd: report.periodoFim,
      professional: report.usuarioResponsavelNome || values.professional,
      evolution: report.evolucao,
      advances: report.avancos,
      difficulties: report.dificuldades,
      referrals: report.encaminhamentos,
      finalNotes: report.observacoesFinais || '',
    })
    setAreas({
      cognitive: report.avaliacaoPorArea.cognitivo,
      motor: report.avaliacaoPorArea.motor,
      social: report.avaliacaoPorArea.social,
      communication: report.avaliacaoPorArea.comunicacao,
      autonomy: report.avaliacaoPorArea.autonomia,
    })
    setStatus(report.status === 'concluido' ? 'Concluído' : 'Rascunho')
    setSavedMessage(
      report.status === 'concluido'
        ? 'Relatório concluído carregado do banco para consulta.'
        : 'Rascunho carregado do banco — continue editando.'
    )
  }

  return (
    <div className="report-page page-container">
      <div className="report-page-heading">
        <div>
          <span className="eyebrow">Acompanhamento pedagógico</span>
          <h2>Novo relatório pedagógico</h2>
          <p>Registre a evolução do aluno durante o período avaliado.</p>
        </div>
        <div className="report-heading-actions">
          <span className={'report-status ' + (status === 'Concluído' ? 'completed' : '')}>
            {status}{editingId ? ' · no banco' : ''}
          </span>
          <button className="button secondary" disabled={saving || !canWrite} onClick={saveDraft} type="button">
            <Save size={18} />
            {saving ? 'Salvando…' : 'Salvar rascunho'}
          </button>
          <button className="button primary" disabled={saving || !canWrite} form="pedagogical-report-form" type="submit">
            <CheckCircle2 size={18} />
            Finalizar relatório
          </button>
        </div>
      </div>
      {error && (
        <p style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#991b1b', borderRadius: 8, padding: '0.6rem 0.9rem', marginBottom: '1rem' }}>
          {error}
        </p>
      )}
      {!canWrite && (
        <p style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', borderRadius: 8, padding: '0.6rem 0.9rem', marginBottom: '1rem' }}>
          Visualização somente leitura: seu perfil ({userProfile?.papel}) não pode salvar relatórios no banco.
        </p>
      )}

      <div className="report-layout">
        <form className="report-form" id="pedagogical-report-form" onSubmit={finishReport}>
          <section className="form-card student-summary-card">
            <div className="form-card-heading">
              <span className="form-heading-icon"><UserRound size={21} /></span>
              <div>
                <h3>Identificação do relatório</h3>
                <p>Selecione o aluno e informe o período avaliado.</p>
              </div>
            </div>

            <div className="form-grid">
              <label className="field field-wide">
                <span>Aluno</span>
                <select
                  onChange={(event) => updateValue('student', event.target.value)}
                  required
                  value={values.student}
                >
                  {students.length === 0 && <option value="">Carregando alunos do banco…</option>}
                  {students.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Tipo de relatório</span>
                <select
                  onChange={(event) => updateValue('reportType', event.target.value)}
                  value={values.reportType}
                >
                  <option>Diário</option>
                  <option>Semestral</option>
                  <option>Anual</option>
                </select>
              </label>
              <label className="field">
                <span>Início do período</span>
                <input
                  onChange={(event) => updateValue('periodStart', event.target.value)}
                  required
                  type="date"
                  value={values.periodStart}
                />
              </label>
              <label className="field">
                <span>Fim do período</span>
                <input
                  onChange={(event) => updateValue('periodEnd', event.target.value)}
                  required
                  type="date"
                  value={values.periodEnd}
                />
              </label>
              <label className="field field-wide">
                <span>Profissional responsável</span>
                <input
                  onChange={(event) => updateValue('professional', event.target.value)}
                  placeholder={userProfile?.nome_completo || 'Nome do profissional'}
                  required
                  value={professionalName}
                />
              </label>
            </div>

            <div className="selected-student">
              <span className="student-avatar">
                {(selectedStudent?.name || values.professional || 'A').split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
              </span>
              <div>
                <strong>{selectedStudent?.name || 'Selecione um aluno'}</strong>
                <span>{selectedStudent ? `${selectedStudent.turma} · ${selectedStudent.turmaTurno}` : 'Dados do banco'}</span>
              </div>
              <span className="status-pill success">{selectedStudent?.status || '—'}</span>
            </div>
          </section>

          <section className="form-card">
            <div className="form-card-heading">
              <span className="form-heading-icon"><TrendingUp size={21} /></span>
              <div>
                <h3>Evolução pedagógica</h3>
                <p>Descreva os principais aspectos observados no período.</p>
              </div>
            </div>

            <label className="field">
              <span>Evolução observada</span>
              <textarea
                onChange={(event) => updateValue('evolution', event.target.value)}
                required
                rows={5}
                value={values.evolution}
              />
              <small>Informe mudanças percebidas no desenvolvimento e na participação do aluno.</small>
            </label>

            <div className="two-column-fields">
              <label className="field">
                <span>Avanços identificados</span>
                <textarea
                  onChange={(event) => updateValue('advances', event.target.value)}
                  required
                  rows={5}
                  value={values.advances}
                />
              </label>
              <label className="field">
                <span>Dificuldades observadas</span>
                <textarea
                  onChange={(event) => updateValue('difficulties', event.target.value)}
                  required
                  rows={5}
                  value={values.difficulties}
                />
              </label>
            </div>
          </section>

          <section className="form-card">
            <div className="form-card-heading">
              <span className="form-heading-icon"><BarChart3 size={21} /></span>
              <div>
                <h3>Avaliação por área</h3>
                <p>Classifique o desenvolvimento nas áreas acompanhadas pela equipe.</p>
              </div>
            </div>
            <div className="area-evaluation-grid">
              {[
                ['cognitive', 'Desenvolvimento cognitivo'],
                ['motor', 'Desenvolvimento motor'],
                ['social', 'Interação social'],
                ['communication', 'Comunicação'],
                ['autonomy', 'Autonomia'],
              ].map(([key, label]) => (
                <label className="area-field" key={key}>
                  <span>{label}</span>
                  <select
                    onChange={(event) => {
                      setAreas((current) => ({ ...current, [key]: event.target.value }))
                      setStatus('Rascunho')
                    }}
                    value={areas[key as keyof typeof areas]}
                  >
                    <option>Adequado</option>
                    <option>Em evolução</option>
                    <option>Necessita apoio</option>
                    <option>Não avaliado</option>
                  </select>
                </label>
              ))}
            </div>
          </section>

          <section className="form-card">
            <div className="form-card-heading">
              <span className="form-heading-icon"><BookOpenCheck size={21} /></span>
              <div>
                <h3>Encaminhamentos e observações</h3>
                <p>Indique recomendações para a continuidade do acompanhamento.</p>
              </div>
            </div>
            <label className="field">
              <span>Encaminhamentos</span>
              <textarea
                onChange={(event) => updateValue('referrals', event.target.value)}
                required
                rows={4}
                value={values.referrals}
              />
            </label>
            <label className="field">
              <span>Observações finais <em>(opcional)</em></span>
              <textarea
                onChange={(event) => updateValue('finalNotes', event.target.value)}
                placeholder="Adicione informações complementares relevantes para a equipe."
                rows={4}
                value={values.finalNotes}
              />
            </label>
          </section>

          <section className="form-card">
            <div className="form-card-heading">
              <span className="form-heading-icon"><Paperclip size={21} /></span>
              <div>
                <h3>Anexos</h3>
                <p>Inclua fotos ou documentos relacionados ao período avaliado.</p>
              </div>
            </div>
            <label className="upload-area">
              <input accept=".pdf,image/*" onChange={selectAttachment} type="file" />
              <span className="upload-icon"><Upload size={23} /></span>
              <strong>{attachmentName || 'Selecione um arquivo para anexar'}</strong>
              <span>PDF, JPG ou PNG · máximo de 10 MB</span>
            </label>
          </section>

          <div className="mobile-form-actions">
            <button className="button secondary" disabled={saving || !canWrite} onClick={saveDraft} type="button">
              <Save size={18} /> {saving ? 'Salvando…' : 'Salvar rascunho'}
            </button>
            <button className="button primary" disabled={saving || !canWrite} type="submit">
              <CheckCircle2 size={18} /> Finalizar relatório
            </button>
          </div>
        </form>

        <aside className="report-aside">
          <SectionCard title="Resumo">
            <dl className="report-summary">
              <div><dt>Aluno</dt><dd>{selectedStudent?.name || '—'}</dd></div>
              <div><dt>Turma</dt><dd>{selectedStudent?.turma || '—'}</dd></div>
              <div><dt>Período</dt><dd>{values.periodStart || '—'} a {values.periodEnd || '—'}</dd></div>
              <div><dt>Responsável</dt><dd>{professionalName || '—'}</dd></div>
            </dl>
            <div className="save-feedback">
              <CheckCircle2 size={16} />
              <span>{saving ? 'Salvando no banco…' : savedMessage}</span>
            </div>
          </SectionCard>

          <SectionCard title="Relatórios anteriores">
            <div className="report-history">
              {loadingHistory && <p style={{ color: '#6b7280' }}>Carregando do banco…</p>}
              {!loadingHistory && history.length === 0 && (
                <p style={{ color: '#6b7280' }}>Nenhum relatório deste aluno no banco ainda.</p>
              )}
              {history.map((report) => (
                <article key={report.id}>
                  <span className="history-icon"><FileText size={19} /></span>
                  <div>
                    <strong>Relatório {tipoRelatorioToLabel(report.tipoRelatorio).toLowerCase()}</strong>
                    <span>{report.periodoInicio} a {report.periodoFim}</span>
                    <small>{report.status === 'concluido' ? 'Concluído' : 'Rascunho'}</small>
                  </div>
                  <button aria-label="Carregar relatório" onClick={() => loadReportIntoForm(report)} type="button"><Download size={17} /></button>
                </article>
              ))}
            </div>
            <button className="text-button" onClick={() => { setEditingId(null); setStatus('Rascunho'); setSavedMessage('Novo relatório — preencha e salve no banco.') }} type="button">Novo relatório</button>
          </SectionCard>

          <div className="privacy-note">
            <AlertTriangle size={19} />
            <p>Este relatório contém dados pessoais. Compartilhe somente com profissionais autorizados.</p>
          </div>
        </aside>
      </div>
    </div>
  )
}

function App() {
  const { currentUser, userProfile, loading, logout } = useAuth()

  const [screen, setScreen] = useState<Screen>(() => {
    const param = new URLSearchParams(window.location.search).get('screen')
    return validScreens.includes(param as Screen) ? (param as Screen) : 'home'
  })
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('aluno'),
  )
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)

  if (loading) {
    return (
      <div
        style={{
          minHeight: '100vh',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          background: '#f0fdf4',
          color: '#1b4332',
          gap: '1rem',
          fontFamily: 'inherit',
        }}
      >
        <div style={{ fontSize: '2.5rem' }}>🌱</div>
        <p style={{ fontWeight: 600, fontSize: '1.15rem' }}>Carregando Fundação Toque...</p>
      </div>
    )
  }

  if (!currentUser) {
    return <LoginScreen />
  }

  const navigate = (nextScreen: Screen, params: Record<string, string> = {}) => {
    const url = new URL(window.location.href)
    if (nextScreen === 'home') {
      url.searchParams.delete('screen')
    } else {
      url.searchParams.set('screen', nextScreen)
    }
    if (nextScreen !== 'student-detail') {
      url.searchParams.delete('aluno')
    }
    if (nextScreen !== 'reports') {
      url.searchParams.delete('aba')
    }
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value)
      else url.searchParams.delete(key)
    })
    window.history.replaceState({}, '', url)
    setScreen(nextScreen)
  }

  const viewStudent = (id: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('screen', 'student-detail')
    url.searchParams.set('aluno', id)
    url.searchParams.delete('aba')
    window.history.replaceState({}, '', url)
    setSelectedStudentId(id)
    setScreen('student-detail')
  }

  const handleEditStudent = (student: Student) => {
    setEditingStudent(student)
    navigate('register')
  }

  const handleNewStudent = () => {
    setEditingStudent(null)
    navigate('register')
  }

  return (
    <div className="app-shell">
      <Sidebar
        currentScreen={screen}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onLogout={logout}
        onNavigate={navigate}
        userRole={userProfile?.papel}
      />
      <div className="app-main">
        <Topbar
          onOpenMenu={() => setSidebarOpen(true)}
          screen={screen}
          studentName={selectedStudentId ? findStudent(selectedStudentId)?.name : undefined}
          userProfile={userProfile}
        />
        <main>
          {screen === 'home' && (
            <Dashboard
              onNavigate={navigate}
              userName={userProfile?.nome_completo.split(' ')[0]}
            />
          )}
          {screen === 'register' && (
            <CadastrarAluno
              key={editingStudent?.id || 'new'}
              initialStudent={editingStudent}
              onCancel={() => {
                setEditingStudent(null)
                navigate('students')
              }}
              onSaveSuccess={() => {
                setEditingStudent(null)
                navigate('students')
              }}
            />
          )}
          {screen === 'students' && (
            <ListarAlunos
              onCadastrar={handleNewStudent}
              onEditStudent={handleEditStudent}
              onViewStudent={viewStudent}
            />
          )}
          {screen === 'student-detail' && selectedStudentId && (
            <DetalheAluno
              onBack={() => navigate('students')}
              onEdit={handleEditStudent}
              onNovoRelatorio={() => navigate('reports', { aba: 'pedagogico' })}
              studentId={selectedStudentId}
            />
          )}
          {screen === 'reports' && (
            <RelatoriosScreen
              isDirection={userProfile?.papel === 'direcao'}
              pedagogicalContent={<PedagogicalReport />}
            />
          )}
          {screen === 'frequencia' && <Frequencia onViewStudentProfile={viewStudent} />}
          {screen === 'turmas' && <Turmas onViewStudent={viewStudent} />}
          {screen === 'oficinas' && <Oficinas />}
          {screen === 'atividades' && <Atividades />}
          {screen === 'usuarios' &&
            (userProfile?.papel === 'direcao' ? (
              <GerenciarUsuarios />
            ) : (
              <div className="page-container">
                <div className="form-card" style={{ textAlign: 'center', padding: '2rem' }}>
                  <h3 style={{ color: '#991b1b', marginBottom: '0.5rem' }}>Acesso Restrito</h3>
                  <p style={{ color: '#4b5563', marginBottom: '1rem' }}>
                    Esta seção é exclusiva para o perfil de Direção.
                  </p>
                  <button className="button primary" onClick={() => navigate('home')} type="button">
                    Voltar ao Dashboard
                  </button>
                </div>
              </div>
            ))}
        </main>
      </div>
      <button aria-label="Contato pelo WhatsApp" className="whatsapp-button" type="button">
        <MessageCircle size={26} />
      </button>
    </div>
  )
}

export default App
