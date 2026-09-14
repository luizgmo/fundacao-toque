import { useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent, ReactNode } from 'react'
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
  Sparkles,
  TrendingUp,
  Upload,
  UserRound,
  Users,
  X,
} from 'lucide-react'
import { CadastrarAluno } from './CadastrarAluno'
import { ListarAlunos } from './ListarAlunos'
import { DetalheAluno } from './DetalheAluno'
import { findStudent } from './students-data'
import logoUrl from './assets/logo.png'
import './App.css'

type Screen = 'home' | 'reports' | 'register' | 'students' | 'student-detail'

type NavItem = {
  label: string
  icon: LucideIcon
  screen?: Screen
}

const mainNavigation: NavItem[] = [
  { label: 'Dashboard', icon: LayoutDashboard, screen: 'home' },
  { label: 'Alunos', icon: Users, screen: 'students' },
  { label: 'Turmas', icon: GraduationCap },
  { label: 'Oficinas', icon: Palette },
  { label: 'Frequência', icon: ClipboardCheck },
  { label: 'Atividades', icon: ListChecks },
]

const pedagogicalNavigation: NavItem[] = [
  { label: 'Evolução', icon: BarChart3 },
  { label: 'Relatórios', icon: FileText, screen: 'reports' },
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
  onClose,
  onNavigate,
}: {
  currentScreen: Screen
  isOpen: boolean
  onClose: () => void
  onNavigate: (screen: Screen) => void
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
        </nav>

        <button className="logout-button" type="button">
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
  onOpenMenu,
}: {
  screen: Screen
  studentName?: string
  onOpenMenu: () => void
}) {
  const titles: Record<Screen, string> = {
    home: 'Dashboard',
    reports: 'Relatório pedagógico',
    register: 'Cadastrar aluno',
    students: 'Alunos',
    'student-detail': studentName ?? 'Perfil do aluno',
  }

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
        <span className="profile-avatar" aria-hidden="true">AS</span>
        <div className="profile-copy">
          <strong>Ana Carolina Silva</strong>
          <span>Pedagoga</span>
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

function Dashboard({ onNavigate }: { onNavigate: (screen: Screen) => void }) {
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
    { label: 'Registrar frequência', description: 'Chamada do dia', icon: ClipboardCheck },
    { label: 'Registrar atividade', description: 'Atividades por turma', icon: BookOpenCheck },
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
          <h2>Olá, Ana! <span aria-hidden="true">👋</span></h2>
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
                  onClick={() => shortcut.action && onNavigate(shortcut.action)}
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
                <button type="button">Ver aluno</button>
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
  professional: 'Ana Carolina Silva',
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
  const [values, setValues] = useState<ReportValues>(initialReport)
  const [areas, setAreas] = useState({
    cognitive: 'Em evolução',
    motor: 'Adequado',
    social: 'Em evolução',
    communication: 'Em evolução',
    autonomy: 'Necessita apoio',
  })
  const [status, setStatus] = useState<'Rascunho' | 'Concluído'>('Rascunho')
  const [savedMessage, setSavedMessage] = useState('Salvo automaticamente às 14:18')
  const [attachmentName, setAttachmentName] = useState('')

  const updateValue = (field: keyof ReportValues, value: string) => {
    setValues((current) => ({ ...current, [field]: value }))
    setStatus('Rascunho')
  }

  const saveDraft = () => {
    setStatus('Rascunho')
    setSavedMessage(
      'Rascunho salvo às ' +
        new Intl.DateTimeFormat('pt-BR', {
          hour: '2-digit',
          minute: '2-digit',
        }).format(new Date()),
    )
  }

  const finishReport = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    setStatus('Concluído')
    setSavedMessage('Relatório finalizado e pronto para consulta')
  }

  const selectAttachment = (event: ChangeEvent<HTMLInputElement>) => {
    const selectedFile = event.target.files?.[0]
    setAttachmentName(selectedFile?.name ?? '')
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
            {status}
          </span>
          <button className="button secondary" onClick={saveDraft} type="button">
            <Save size={18} />
            Salvar rascunho
          </button>
          <button className="button primary" form="pedagogical-report-form" type="submit">
            <CheckCircle2 size={18} />
            Finalizar relatório
          </button>
        </div>
      </div>

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
                  <option value="mariana-oliveira">Mariana Oliveira</option>
                  <option value="lucas-almeida">Lucas Almeida</option>
                  <option value="pedro-henrique">Pedro Henrique</option>
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
                  required
                  value={values.professional}
                />
              </label>
            </div>

            <div className="selected-student">
              <span className="student-avatar">MO</span>
              <div>
                <strong>Mariana Oliveira</strong>
                <span>12 anos · Turma B · Período da manhã</span>
              </div>
              <span className="status-pill success">Cadastro ativo</span>
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
            <button className="button secondary" onClick={saveDraft} type="button">
              <Save size={18} /> Salvar rascunho
            </button>
            <button className="button primary" type="submit">
              <CheckCircle2 size={18} /> Finalizar relatório
            </button>
          </div>
        </form>

        <aside className="report-aside">
          <SectionCard title="Resumo">
            <dl className="report-summary">
              <div><dt>Aluno</dt><dd>Mariana Oliveira</dd></div>
              <div><dt>Turma</dt><dd>Turma B</dd></div>
              <div><dt>Período</dt><dd>1º semestre de 2026</dd></div>
              <div><dt>Responsável</dt><dd>Ana Carolina Silva</dd></div>
            </dl>
            <div className="save-feedback">
              <CheckCircle2 size={16} />
              <span>{savedMessage}</span>
            </div>
          </SectionCard>

          <SectionCard title="Relatórios anteriores">
            <div className="report-history">
              <article>
                <span className="history-icon"><FileText size={19} /></span>
                <div>
                  <strong>Relatório anual</strong>
                  <span>Janeiro a dezembro de 2025</span>
                  <small>Concluído em 18/12/2025</small>
                </div>
                <button aria-label="Baixar relatório anual" type="button"><Download size={17} /></button>
              </article>
              <article>
                <span className="history-icon"><FileText size={19} /></span>
                <div>
                  <strong>Relatório semestral</strong>
                  <span>Janeiro a junho de 2025</span>
                  <small>Concluído em 02/07/2025</small>
                </div>
                <button aria-label="Baixar relatório semestral" type="button"><Download size={17} /></button>
              </article>
            </div>
            <button className="text-button" type="button">Ver histórico completo</button>
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
  const [screen, setScreen] = useState<Screen>(() => {
    const param = new URLSearchParams(window.location.search).get('screen')
    return param === 'reports' || param === 'register' || param === 'students' || param === 'student-detail'
      ? param
      : 'home'
  })
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('aluno'),
  )
  const [sidebarOpen, setSidebarOpen] = useState(false)

  const navigate = (nextScreen: Screen) => {
    const url = new URL(window.location.href)
    if (nextScreen === 'home') {
      url.searchParams.delete('screen')
    } else {
      url.searchParams.set('screen', nextScreen)
    }
    if (nextScreen !== 'student-detail') {
      url.searchParams.delete('aluno')
    }
    window.history.replaceState({}, '', url)
    setScreen(nextScreen)
  }

  const viewStudent = (id: string) => {
    const url = new URL(window.location.href)
    url.searchParams.set('screen', 'student-detail')
    url.searchParams.set('aluno', id)
    window.history.replaceState({}, '', url)
    setSelectedStudentId(id)
    setScreen('student-detail')
  }

  return (
    <div className="app-shell">
      <Sidebar
        currentScreen={screen}
        isOpen={sidebarOpen}
        onClose={() => setSidebarOpen(false)}
        onNavigate={navigate}
      />
      <div className="app-main">
        <Topbar
          onOpenMenu={() => setSidebarOpen(true)}
          screen={screen}
          studentName={selectedStudentId ? findStudent(selectedStudentId)?.name : undefined}
        />
        <main>
          {screen === 'home' && <Dashboard onNavigate={navigate} />}
          {screen === 'register' && <CadastrarAluno onCancel={() => navigate('students')} />}
          {screen === 'students' && (
            <ListarAlunos onCadastrar={() => navigate('register')} onViewStudent={viewStudent} />
          )}
          {screen === 'student-detail' && selectedStudentId && (
            <DetalheAluno
              onBack={() => navigate('students')}
              onNovoRelatorio={() => navigate('reports')}
              studentId={selectedStudentId}
            />
          )}
          {screen === 'reports' && <PedagogicalReport />}
        </main>
      </div>
      <button aria-label="Contato pelo WhatsApp" className="whatsapp-button" type="button">
        <MessageCircle size={26} />
      </button>
    </div>
  )
}

export default App
