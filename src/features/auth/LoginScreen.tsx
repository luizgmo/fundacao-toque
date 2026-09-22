import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  Lock,
  Mail,
  User,
  ShieldCheck,
  AlertCircle,
  CheckCircle2,
  Sparkles,
  ArrowRight,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useAuth } from './AuthContext'
import logoUrl from '../../assets/logo.png'
import './LoginScreen.css'

export function LoginScreen() {
  const { login, setupInitialAdmin } = useAuth()

  const [mode, setMode] = useState<'login' | 'setup-admin'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  // Setup initial admin fields
  const [adminNome, setAdminNome] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const handleLogin = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSubmitting(true)

    try {
      await login(email.trim(), password)
    } catch (err: any) {
      console.error('Erro de login:', err)
      if (
        err.code === 'auth/invalid-credential' ||
        err.code === 'auth/user-not-found' ||
        err.code === 'auth/wrong-password'
      ) {
        setErrorMsg('E-mail ou senha incorretos. Verifique suas credenciais.')
      } else if (err.code === 'auth/too-many-requests') {
        setErrorMsg('Muitas tentativas sem sucesso. Aguarde alguns instantes.')
      } else if (err.code === 'auth/invalid-email') {
        setErrorMsg('O endereço de e-mail informado é inválido.')
      } else {
        setErrorMsg('Não foi possível entrar no sistema. Detalhes: ' + (err.message || 'Erro desconhecido.'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const handleSetupAdmin = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (adminPassword.length < 6) {
      setErrorMsg('A senha deve conter no mínimo 6 caracteres.')
      return
    }

    if (adminPassword !== confirmPassword) {
      setErrorMsg('As senhas digitadas não coincidem.')
      return
    }

    setSubmitting(true)
    try {
      await setupInitialAdmin(adminNome.trim(), adminEmail.trim(), adminPassword)
      setSuccessMsg('Usuário Administrador (Direção) criado com sucesso! Redirecionando...')
    } catch (err: any) {
      console.error('Erro ao criar admin inicial:', err)
      if (err.code === 'auth/email-already-in-use') {
        setErrorMsg('Este e-mail já está cadastrado. Tente fazer login.')
      } else if (err.code === 'auth/weak-password') {
        setErrorMsg('A senha escolhida é muito fraca.')
      } else {
        setErrorMsg('Erro ao criar administrador: ' + (err.message || 'Erro desconhecido.'))
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="login-wrapper">
      <div className="login-card-container">
        {/* Brand Banner */}
        <div className="login-brand-header">
          <div className="login-logo-badge">
            <img alt="Fundação Toque" src={logoUrl} />
          </div>
          <h2>Fundação Toque</h2>
          <p>Sistema Integrado de Gestão Pedagógica e Acompanhamento</p>
        </div>

        {/* Mode Switcher */}
        <div className="login-mode-tabs">
          <button
            className={`tab-btn ${mode === 'login' ? 'active' : ''}`}
            onClick={() => {
              setMode('login')
              setErrorMsg(null)
            }}
            type="button"
          >
            Entrar no Sistema
          </button>
          <button
            className={`tab-btn ${mode === 'setup-admin' ? 'active' : ''}`}
            onClick={() => {
              setMode('setup-admin')
              setErrorMsg(null)
            }}
            type="button"
          >
            <ShieldCheck size={16} /> Primeiro Acesso (Admin)
          </button>
        </div>

        {/* Alerts */}
        {errorMsg && (
          <div className="login-alert error">
            <AlertCircle size={18} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="login-alert success">
            <CheckCircle2 size={18} />
            <span>{successMsg}</span>
          </div>
        )}

        {mode === 'login' ? (
          <form className="login-form" onSubmit={handleLogin}>
            <label className="login-field">
              <span>E-mail</span>
              <div className="input-icon-group">
                <Mail className="field-icon" size={18} />
                <input
                  autoComplete="email"
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="exemplo@fundacaotoque.org.br"
                  required
                  type="email"
                  value={email}
                />
              </div>
            </label>

            <label className="login-field">
              <span>Senha</span>
              <div className="input-icon-group">
                <Lock className="field-icon" size={18} />
                <input
                  autoComplete="current-password"
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Sua senha cadastrada"
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                />
                <button
                  aria-label="Alternar visualização da senha"
                  className="toggle-password-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  type="button"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            <button className="login-submit-button" disabled={submitting} type="submit">
              {submitting ? (
                'Autenticando...'
              ) : (
                <>
                  Entrar no Sistema <ArrowRight size={18} />
                </>
              )}
            </button>

            <div className="login-hint-box">
              <Sparkles size={16} />
              <span>
                Se ainda não possui um administrador cadastrado no banco, use a aba{' '}
                <strong>"Primeiro Acesso (Admin)"</strong> para criar a conta de Direção.
              </span>
            </div>
          </form>
        ) : (
          <form className="login-form" onSubmit={handleSetupAdmin}>
            <div className="admin-setup-badge">
              <ShieldCheck size={18} />
              <span>Perfil a ser criado: <strong>Direção (Administrador Master)</strong></span>
            </div>

            <label className="login-field">
              <span>Nome Completo *</span>
              <div className="input-icon-group">
                <User className="field-icon" size={18} />
                <input
                  onChange={(e) => setAdminNome(e.target.value)}
                  placeholder="Ex: Maria Aparecida Silva"
                  required
                  type="text"
                  value={adminNome}
                />
              </div>
            </label>

            <label className="login-field">
              <span>E-mail Corporativo ou Pessoal *</span>
              <div className="input-icon-group">
                <Mail className="field-icon" size={18} />
                <input
                  onChange={(e) => setAdminEmail(e.target.value)}
                  placeholder="direcao@fundacaotoque.org.br"
                  required
                  type="email"
                  value={adminEmail}
                />
              </div>
            </label>

            <label className="login-field">
              <span>Criar Senha (mínimo 6 caracteres) *</span>
              <div className="input-icon-group">
                <Lock className="field-icon" size={18} />
                <input
                  onChange={(e) => setAdminPassword(e.target.value)}
                  placeholder="Crie uma senha segura"
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={adminPassword}
                />
                <button
                  aria-label="Alternar visualização da senha"
                  className="toggle-password-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  type="button"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
            </label>

            <label className="login-field">
              <span>Confirmar Senha *</span>
              <div className="input-icon-group">
                <Lock className="field-icon" size={18} />
                <input
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="Repita a senha criada"
                  required
                  type={showPassword ? 'text' : 'password'}
                  value={confirmPassword}
                />
              </div>
            </label>

            <button className="login-submit-button primary-accent" disabled={submitting} type="submit">
              {submitting ? (
                'Criando Administrador...'
              ) : (
                <>
                  <ShieldCheck size={18} /> Criar Administrador & Acessar
                </>
              )}
            </button>
          </form>
        )}

        <footer className="login-footer">
          <small>© 2026 Fundação Toque · Todos os direitos reservados</small>
        </footer>
      </div>
    </div>
  )
}
