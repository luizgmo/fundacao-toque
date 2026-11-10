import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  Lock,
  Mail,
  User,
  ShieldCheck,
  AlertCircle,
  Sparkles,
  ArrowRight,
  Eye,
  EyeOff,
} from 'lucide-react'
import { useAuth } from './AuthContext'
import logoUrl from '../../assets/logo.png'
import './LoginScreen.css'

export function LoginScreen() {
  const { login, loginAsGuest, isConfigured } = useAuth()

  // O provisionamento inicial não é oferecido pela interface pública.
  const [mode] = useState<'login' | 'setup-admin'>('login')

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [adminNome, setAdminNome] = useState('')
  const [adminEmail, setAdminEmail] = useState('')
  const [adminPassword, setAdminPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')

  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)

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
    setErrorMsg('O primeiro perfil de Direção precisa ser provisionado por um administrador confiável.')
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
        <div className="login-mode-tabs"><span>Entrar no Sistema</span></div>

        {/* Alerts */}
        {errorMsg && (
          <div className="login-alert error">
            <AlertCircle size={18} />
            <span>{errorMsg}</span>
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

            <div style={{ marginTop: '0.5rem', textAlign: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', margin: '0.75rem 0', gap: '0.5rem' }}>
                <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
                <span style={{ fontSize: '0.75rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  Ou para testes locais
                </span>
                <div style={{ flex: 1, height: '1px', background: '#e5e7eb' }} />
              </div>

              <button
                className="button secondary"
                onClick={() => loginAsGuest('direcao')}
                style={{
                  width: '100%',
                  justifyContent: 'center',
                  background: '#f8fafc',
                  borderColor: '#cbd5e1',
                  color: '#334155',
                  padding: '0.75rem',
                  fontSize: '0.88rem',
                  fontWeight: 600,
                }}
                type="button"
              >
                <Sparkles size={16} style={{ color: '#059669' }} /> Entrar em Modo Demonstração (Direção)
              </button>
            </div>

            <div className="login-hint-box" style={{ marginTop: '0.75rem' }}>
              <Sparkles size={16} />
              <span>
                {!isConfigured ? (
                  <>
                    <strong>Ambiente Local:</strong> Nenhuma chave do Firebase (.env.local) foi detectada.
                    Você pode usar o botão <strong>"Modo Demonstração"</strong> acima para testar todos os fluxos e telas imediatamente.
                  </>
                ) : (
                  <>
                    Se ainda não possui um administrador cadastrado no banco, use a aba{' '}
                    <strong>"Primeiro Acesso (Admin)"</strong> para criar a conta de Direção.
                  </>
                )}
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
