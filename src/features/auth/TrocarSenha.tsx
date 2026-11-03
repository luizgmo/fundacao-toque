import { useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, CheckCircle2, Eye, EyeOff, KeyRound, Lock, LogOut, X } from 'lucide-react'
import { useAuth } from './AuthContext'
import './LoginScreen.css'

interface TrocarSenhaProps {
  // Sem onClose a troca é obrigatória (senha provisória) e só permite sair da conta
  onClose?: () => void
}

export function TrocarSenha({ onClose }: TrocarSenhaProps) {
  const { userProfile, changePassword, logout } = useAuth()
  const obrigatoria = !onClose

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)

  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)

    if (newPassword.length < 6) {
      setErrorMsg('A nova senha deve conter no mínimo 6 caracteres.')
      return
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg('As senhas digitadas não coincidem.')
      return
    }

    if (newPassword === currentPassword) {
      setErrorMsg('A nova senha deve ser diferente da senha atual.')
      return
    }

    setSubmitting(true)
    try {
      await changePassword(currentPassword, newPassword)
      setSuccessMsg('Senha alterada com sucesso!')
      setCurrentPassword('')
      setNewPassword('')
      setConfirmPassword('')
      if (onClose) setTimeout(onClose, 1500)
    } catch (err) {
      console.error('Erro ao trocar senha:', err)
      const { code, message } = err as { code?: string; message?: string }
      if (code === 'auth/invalid-credential' || code === 'auth/wrong-password') {
        setErrorMsg('A senha atual está incorreta.')
      } else if (code === 'auth/weak-password') {
        setErrorMsg('A nova senha é muito fraca. Escolha uma senha mais segura.')
      } else if (code === 'auth/too-many-requests') {
        setErrorMsg('Muitas tentativas sem sucesso. Aguarde alguns instantes.')
      } else {
        setErrorMsg('Não foi possível alterar a senha: ' + (message || 'Erro desconhecido.'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const card = (
    <div className="login-card-container" onClick={(e) => e.stopPropagation()}>
      <div className="trocar-senha-header">
        <div>
          <h2>
            <KeyRound size={22} /> {obrigatoria ? 'Defina sua nova senha' : 'Alterar senha'}
          </h2>
          <p>{userProfile?.email}</p>
        </div>
        {onClose && (
          <button aria-label="Fechar" className="icon-button" onClick={onClose} type="button">
            <X size={20} />
          </button>
        )}
      </div>

      {obrigatoria && (
        <div className="login-info-badge">
          <AlertCircle size={18} />
          <span>
            Sua conta foi criada pela Direção com uma <strong>senha provisória</strong>. Para continuar,
            defina uma senha pessoal.
          </span>
        </div>
      )}

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

      <form className="login-form" onSubmit={handleSubmit}>
        <label className="login-field">
          <span>{obrigatoria ? 'Senha provisória' : 'Senha atual'}</span>
          <div className="input-icon-group">
            <Lock className="field-icon" size={18} />
            <input
              autoComplete="current-password"
              onChange={(e) => setCurrentPassword(e.target.value)}
              required
              type={showPassword ? 'text' : 'password'}
              value={currentPassword}
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
          <span>Nova senha (mínimo 6 caracteres)</span>
          <div className="input-icon-group">
            <Lock className="field-icon" size={18} />
            <input
              autoComplete="new-password"
              onChange={(e) => setNewPassword(e.target.value)}
              required
              type={showPassword ? 'text' : 'password'}
              value={newPassword}
            />
          </div>
        </label>

        <label className="login-field">
          <span>Confirmar nova senha</span>
          <div className="input-icon-group">
            <Lock className="field-icon" size={18} />
            <input
              autoComplete="new-password"
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              type={showPassword ? 'text' : 'password'}
              value={confirmPassword}
            />
          </div>
        </label>

        <button className="login-submit-button" disabled={submitting || !!successMsg} type="submit">
          {submitting ? 'Salvando...' : 'Salvar nova senha'}
        </button>

        {obrigatoria && (
          <button className="button secondary trocar-senha-logout" onClick={logout} type="button">
            <LogOut size={16} /> Sair da conta
          </button>
        )}
      </form>
    </div>
  )

  if (obrigatoria) {
    return <div className="login-wrapper">{card}</div>
  }

  return (
    <div className="trocar-senha-overlay" onClick={onClose}>
      {card}
    </div>
  )
}
