import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import type { LucideIcon } from 'lucide-react'
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpenCheck,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ClipboardCheck,
  Clock3,
  FileBarChart,
  FileText,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
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
import { useAuth } from './features/auth/AuthContext'
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

      <section aria-label="Resumo do sistema" className="metrics-grid">
        <MetricCard icon={Users} label="Alunos ativos" tone="green" value="47" />
        <MetricCard icon={GraduationCap} label="Turmas ativas" tone="blue" value="5" />
        <MetricCard icon={Palette} label="Oficinas em andamento" tone="orange" value="12" />
        <MetricCard icon={TrendingUp} label="Frequência média (mês)" tone="mint" value="87%" />
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
          action={<span className="status-pill warning">3 pendentes</span>}
          className="tasks-card"
          title="Tarefas de hoje"
        >
          <div className="task-list">
            <article className="task-item">
              <ClipboardCheck className="task-icon amber" size={21} />
              <div>
                <strong>Frequência — Turma A</strong>
                <span><Clock3 size={13} /> Prazo: 12h00</span>
              </div>
              <span className="status-pill danger">Pendente</span>
            </article>
            <article className="task-item">
              <ListChecks className="task-icon orange" size={21} />
              <div>
                <strong>Atividades — Turma B</strong>
                <span><Clock3 size={13} /> Prazo: 17h00</span>
              </div>
              <span className="status-pill danger">Pendente</span>
            </article>
            <article className="task-item">
              <FileText className="task-icon green-text" size={21} />
              <div>
                <strong>Relatório semanal</strong>
                <span><CalendarDays size={13} /> Prazo: sexta</span>
              </div>
              <span className="status-pill warning">Em breve</span>
            </article>
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
              <strong>3 alunos precisam de contato com a família</strong>
              <span>Verifique os registros de contato e as ausências recentes.</span>
            </div>
          </div>
          <div className="student-alert-list">
            {['Lucas Almeida', 'Mariana Oliveira', 'Pedro Henrique'].map((student, index) => (
              <div className="student-alert-row" key={student}>
                <span className="mini-avatar">{student.charAt(0)}</span>
                <div>
                  <strong>{student}</strong>
                  <span>Turma {String.fromCharCode(65 + index)} · {3 + index} faltas consecutivas</span>
                </div>
                <button onClick={() => onNavigate('frequencia')} type="button">Ver chamadas</button>
              </div>
            ))}
          </div>
        </SectionCard>

        <SectionCard title="Últimas atualizações">
          <div className="timeline">
            <article>
              <span className="timeline-dot"><CheckCircle2 size={15} /></span>
              <div>
                <small>Hoje, 09:42</small>
                <p><strong>Roberto Mendes</strong> registrou frequência da <strong>Turma A</strong>.</p>
              </div>
            </article>
            <article>
              <span className="timeline-dot"><Activity size={15} /></span>
              <div>
                <small>Hoje, 08:15</small>
                <p><strong>Ana Carolina</strong> anexou fotos à atividade <strong>Musicalização</strong>.</p>
              </div>
            </article>
            <article>
              <span className="timeline-dot"><FileText size={15} /></span>
              <div>
                <small>Ontem, 16:28</small>
                <p>Relatório semestral de <strong>Mariana Oliveira</strong> foi atualizado.</p>
              </div>
            </article>
          </div>
        </SectionCard>
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
              onNovoRelatorio={() => navigate('reports', { aba: 'pedagogico', aluno: selectedStudentId })}
              studentId={selectedStudentId}
            />
          )}
          {screen === 'reports' && (
            <RelatoriosScreen
              isDirection={userProfile?.papel === 'direcao'}
              pedagogicalContent={<PedagogicalReport initialStudentId={selectedStudentId || new URLSearchParams(window.location.search).get('aluno') || ''} />}
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
