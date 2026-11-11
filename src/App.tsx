import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
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
  FileBarChart,
  FileText,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  KeyRound,
  LogOut,
  Menu,
  MessageCircle,
  Palette,
  ShieldCheck,
  Sparkles,
  TrendingUp,
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
import { PedagogicalReport } from './features/relatorios/PedagogicalReport'
import { LoginScreen } from './features/auth/LoginScreen'
import { TrocarSenha } from './features/auth/TrocarSenha'
import { Evolucao } from './features/evolucao/Evolucao'
import { useAuth } from './features/auth/AuthContext'
import {
  getAlunosFaltasRecorrentes,
  getDashboardMetrics,
  getTarefasDeHoje,
  getUltimasAtualizacoes,
} from './services/dashboardService'
import type { AlunoFaltaRecorrente, DashboardMetrics, Metrica, TarefaDoDia, UltimasAtualizacoes } from './services/dashboardService'
import type { UserProfile, UserRole } from './types/auth'
import { ROLE_LABELS } from './types/auth'
import type { Student } from './features/alunos/students-data'
import { DataNotice } from './components/DataNotice'
import { LoadError } from './components/LoadError'
import { useQuery } from './lib/useSubscription'
import { describeLoadError } from './lib/persistence'
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
  | 'evolucao'

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
  'evolucao',
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
  { label: 'Evolução', icon: BarChart3, screen: 'evolucao' },
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
  onChangePassword,
}: {
  currentScreen: Screen
  isOpen: boolean
  userRole?: UserRole
  onClose: () => void
  onNavigate: (screen: Screen) => void
  onLogout: () => void
  onChangePassword?: () => void
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

        {onChangePassword && (
          <button
            className="nav-item"
            onClick={() => {
              onChangePassword()
              onClose()
            }}
            type="button"
          >
            <KeyRound size={19} strokeWidth={2} />
            <span>Alterar senha</span>
          </button>
        )}

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
  userProfile,
  onOpenMenu,
}: {
  screen: Screen
  userProfile?: UserProfile | null
  onOpenMenu: () => void
}) {
  const titles: Record<Screen, string> = {
    home: 'Dashboard',
    reports: 'Relatórios',
    register: 'Cadastrar aluno',
    students: 'Alunos',
    'student-detail': 'Perfil do aluno',
    frequencia: 'Frequência e Registro de Chamada',
    usuarios: 'Equipe e Autores do Sistema',
    turmas: 'Turmas',
    oficinas: 'Oficinas e Atividades',
    atividades: 'Registro de Atividades',
    evolucao: 'Evolução',
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

  const displayName = userProfile?.nome_completo || 'Equipe'
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

  // Cada seção tem seus próprios estados (carregando, erro, vazio, dados) e
  // nova tentativa independente. Falhas de consulta nunca aparecem como zero.
  const metricsQuery = useQuery<DashboardMetrics | null>(getDashboardMetrics, null)
  const faltasQuery = useQuery<AlunoFaltaRecorrente[]>(() => getAlunosFaltasRecorrentes(5), [])
  const timelineQuery = useQuery<UltimasAtualizacoes>(() => getUltimasAtualizacoes(6), { items: [], fontesComFalha: [] })
  const tarefasQuery = useQuery<TarefaDoDia[]>(getTarefasDeHoje, [])

  const metrics = metricsQuery.data
  const faltas = faltasQuery.data
  const timeline = timelineQuery.data.items
  const tarefas = tarefasQuery.data
  const metricasComFalha = metrics
    ? (Object.values(metrics) as Metrica<unknown>[]).filter((m) => !m.ok)
    : []
  const tarefasComFalha = tarefas.filter((t) => t.feito === null)
  const pendentes = tarefas.filter((t) => t.feito === false).length

  const metricValue = (m: Metrica<number> | undefined, format = (n: number) => String(n)) => {
    if (metricsQuery.status === 'loading') return '…'
    if (!m || !m.ok) return 'Erro'
    return format(m.valor)
  }

  const shortcuts = [
    { label: 'Cadastrar aluno', description: 'Novo cadastro completo', icon: UserRound, action: 'register' as Screen, tone: 'green' },
    { label: 'Registrar frequência', description: 'Chamada do dia', icon: ClipboardCheck, action: 'frequencia' as Screen, tone: 'blue' },
    {
      label: 'Registrar atividade',
      description: 'Atividades por turma',
      icon: BookOpenCheck,
      action: 'atividades' as Screen,
      tone: 'orange',
    },
    {
      label: 'Gerar relatório',
      description: 'Acompanhamento pedagógico',
      icon: FileBarChart,
      action: 'reports' as Screen,
      tone: 'red',
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

      {metricsQuery.status === 'error' && (
        <LoadError error={metricsQuery.error} onRetry={metricsQuery.retry} what="os indicadores do painel" />
      )}
      {metricasComFalha.length > 0 && (
        <LoadError
          error={(metricasComFalha[0] as { erro: Error }).erro}
          impact="Os indicadores marcados com “Erro” não foram calculados."
          onRetry={metricsQuery.retry}
          what={`${metricasComFalha.length} indicador(es) do painel`}
        />
      )}

      <section aria-label="Resumo do sistema" className="metrics-grid">
        <MetricCard icon={Users} label="Alunos ativos" tone="green" value={metricValue(metrics?.alunosAtivos)} />
        <MetricCard icon={GraduationCap} label="Turmas ativas" tone="blue" value={metricValue(metrics?.turmasAtivas)} />
        <MetricCard icon={Palette} label="Oficinas em andamento" tone="orange" value={metricValue(metrics?.oficinasAtivas)} />
        <MetricCard
          icon={TrendingUp}
          label={
            metrics?.frequenciaMedia.ok && metrics.frequenciaMedia.valor === null
              ? 'Frequência média (sem chamadas registradas)'
              : 'Frequência média (mês)'
          }
          tone="yellow"
          value={
            metricsQuery.status === 'loading'
              ? '…'
              : !metrics?.frequenciaMedia.ok
                ? 'Erro'
                : metrics.frequenciaMedia.valor === null
                  ? '—'
                  : `${metrics.frequenciaMedia.valor}%`
          }
        />
      </section>

      <div className="dashboard-primary-grid">
        <SectionCard className="shortcuts-card" title="Atalhos rápidos">
          <div className="shortcuts-grid">
            {shortcuts.map((shortcut) => {
              const Icon = shortcut.icon
              return (
                <button
                  className={`shortcut-button tone-${shortcut.tone}`}
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
          action={
            tarefasQuery.status === 'ready' && (
              <span className="status-pill warning">
                {pendentes} pendentes{tarefasComFalha.length ? ` · ${tarefasComFalha.length} não verificada(s)` : ''}
              </span>
            )
          }
          className="tasks-card"
          title="Tarefas de hoje"
        >
          {tarefasQuery.status === 'error' && (
            <LoadError error={tarefasQuery.error} onRetry={tarefasQuery.retry} what="as tarefas de hoje" />
          )}
          {tarefasComFalha.length > 0 && (
            <LoadError
              error={tarefasComFalha[0].erro}
              impact="Essas tarefas não foram marcadas como pendentes nem feitas."
              onRetry={tarefasQuery.retry}
              what={`${tarefasComFalha.length} verificação(ões) de tarefa`}
            />
          )}
          <div className="task-list">
            {tarefasQuery.status === 'loading' && (
              <article className="task-item">
                <Clock3 className="task-icon amber" size={21} />
                <div>
                  <strong>Carregando tarefas…</strong>
                  <span>Verificando os registros de hoje</span>
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
                <span
                  className={'status-pill ' + (tarefa.feito === null ? 'warning' : tarefa.feito ? 'success' : 'danger')}
                  title={tarefa.erro ? describeLoadError(tarefa.erro) : undefined}
                >
                  {tarefa.feito === null ? 'Não verificado' : tarefa.feito ? 'Feito' : 'Pendente'}
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
          {faltasQuery.status === 'error' ? (
            <LoadError error={faltasQuery.error} onRetry={faltasQuery.retry} what="os alunos com faltas recorrentes" />
          ) : (
          <div className="absence-alert">
            <AlertTriangle size={21} />
            <div>
              <strong>
                {faltasQuery.status === 'loading'
                  ? 'Verificando faltas recentes…'
                  : faltas.length === 0
                  ? 'Nenhum aluno com 3+ faltas consecutivas'
                  : `${faltas.length} aluno${faltas.length === 1 ? '' : 's'} precisa${faltas.length === 1 ? '' : 'm'} de contato com a família`}
              </strong>
              <span>Verifique os registros de contato e as ausências recentes.</span>
            </div>
          </div>
          )}
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
            {faltas.length === 0 && faltasQuery.status === 'ready' && (
              <p style={{ color: '#6b7280', fontSize: '0.9rem' }}>Sem alertas no momento. Bom trabalho!</p>
            )}
          </div>
        </SectionCard>

        <SectionCard title="Últimas atualizações">
          {timelineQuery.status === 'error' && (
            <LoadError error={timelineQuery.error} onRetry={timelineQuery.retry} what="as últimas atualizações" />
          )}
          {timelineQuery.data.fontesComFalha.length > 0 && (
            <DataNotice kind="error">
              Lista incompleta: não foi possível consultar {timelineQuery.data.fontesComFalha.join(', ')}.{' '}
              <button className="text-button" onClick={timelineQuery.retry} type="button">
                Tentar novamente
              </button>
            </DataNotice>
          )}
          <div className="timeline">
            {timelineQuery.status !== 'error' && timeline.length === 0 && (
              <article>
                <span className="timeline-dot"><Activity size={15} /></span>
                <div>
                  <small>{timelineQuery.status === 'loading' ? 'Carregando…' : 'Sem movimentações'}</small>
                  <p>{timelineQuery.status === 'loading' ? 'Buscando dados do banco…' : 'Nenhuma atividade, chamada ou relatório recente.'}</p>
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

function App() {
  const { currentUser, userProfile, loading, logout, isGuest } = useAuth()

  const [screen, setScreen] = useState<Screen>(() => {
    const param = new URLSearchParams(window.location.search).get('screen')
    return validScreens.includes(param as Screen) ? (param as Screen) : 'home'
  })
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('aluno'),
  )
  const [reportStudentId, setReportStudentId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('alunoRelatorio'),
  )
  const [editingStudent, setEditingStudent] = useState<Student | null>(null)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [changingPassword, setChangingPassword] = useState(false)

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

  if (userProfile?.trocar_senha) {
    return <TrocarSenha />
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
      url.searchParams.delete('alunoRelatorio')
      setReportStudentId(null)
    }
    Object.entries(params).forEach(([key, value]) => {
      if (value) url.searchParams.set(key, value)
      else url.searchParams.delete(key)
    })
    window.history.replaceState({}, '', url)
    if (Object.prototype.hasOwnProperty.call(params, 'alunoRelatorio')) {
      setReportStudentId(params.alunoRelatorio || null)
    }
    setScreen(nextScreen)
  }

  const viewStudent = (id: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('screen', 'student-detail')
    url.searchParams.set('aluno', id)
    url.searchParams.delete('aba')
    url.searchParams.delete('alunoRelatorio')
    window.history.replaceState({}, '', url)
    setSelectedStudentId(id)
    setReportStudentId(null)
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
        onChangePassword={isGuest ? undefined : () => setChangingPassword(true)}
        onLogout={logout}
        onNavigate={navigate}
        userRole={userProfile?.papel}
      />
      <div className="app-main">
        {isGuest && (
          <div style={{ padding: '0.75rem 1.5rem 0' }}>
            <DataNotice kind="demo">
              <strong>Modo demonstração ativo.</strong> Todos os dados exibidos são fictícios e
              ficam apenas neste navegador. Operações que exigem autenticação real estão
              desabilitadas.
            </DataNotice>
          </div>
        )}
        <Topbar
          onOpenMenu={() => setSidebarOpen(true)}
          screen={screen}
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
              onNovoRelatorio={() => navigate('reports', { aba: 'pedagogico', alunoRelatorio: selectedStudentId || '' })}
              studentId={selectedStudentId}
            />
          )}
          {screen === 'reports' && (
            <RelatoriosScreen
              isDirection={userProfile?.papel === 'direcao'}
              pedagogicalContent={<PedagogicalReport initialStudentId={reportStudentId || ''} />}
            />
          )}
          {screen === 'evolucao' && (
            <Evolucao
              userProfile={userProfile}
              onNavigate={(screen: string) => navigate(screen as Screen)}
              onViewStudent={viewStudent}
              onNovoRelatorio={(studentId) =>
                navigate('reports', { aba: 'pedagogico', alunoRelatorio: studentId || '' })
              }
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
      {changingPassword && <TrocarSenha onClose={() => setChangingPassword(false)} />}
      <button aria-label="Contato pelo WhatsApp" className="whatsapp-button" type="button">
        <MessageCircle size={26} />
      </button>
    </div>
  )
}

export default App
