import { useState } from 'react'
import type { FormEvent } from 'react'
import {
  Users,
  UserPlus,
  Shield,
  BookOpen,
  Briefcase,
  CheckCircle2,
  AlertCircle,
  Mail,
  Lock,
  User,
  X,
  Sparkles,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import { subscribeToUsuarios } from '../../services/usuariosService'
import { useSubscription } from '../../lib/useSubscription'
import { LoadError } from '../../components/LoadError'
import type { UserProfile, UserRole } from '../../types/auth'
import { ROLE_LABELS, ROLE_DESCRIPTIONS } from '../../types/auth'
import './GerenciarUsuarios.css'

export function GerenciarUsuarios() {
  const { userProfile, createAuthorUser, isGuest } = useAuth()

  // O modo demonstração não autentica no Firebase, então as regras negam a leitura:
  // nesse caso a lista nem é consultada (o aviso de modo demonstração explica).
  const usuariosSub = useSubscription<UserProfile[]>(
    (onData, onError) => (isGuest ? () => {} : subscribeToUsuarios(onData, onError)),
    [],
    isGuest ? 'guest' : 'auth'
  )
  const usuarios = usuariosSub.data
  const loading = !isGuest && usuariosSub.status === 'loading'
  const [showModal, setShowModal] = useState(false)

  // Form states
  const [nome, setNome] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [papel, setPapel] = useState<UserRole>('administrativo')

  const [submitting, setSubmitting] = useState(false)
  const [errorMsg, setErrorMsg] = useState<string | null>(null)
  const [successMsg, setSuccessMsg] = useState<string | null>(null)


  const handleCreateUser = async (e: FormEvent) => {
    e.preventDefault()
    setErrorMsg(null)
    setSuccessMsg(null)

    if (password.length < 6) {
      setErrorMsg('A senha provisória deve ter no mínimo 6 caracteres.')
      return
    }

    setSubmitting(true)
    try {
      await createAuthorUser(nome.trim(), email.trim(), password, papel)
      setSuccessMsg(`Usuário ${nome} (${ROLE_LABELS[papel]}) cadastrado com sucesso!`)

      setNome('')
      setEmail('')
      setPassword('')
      setPapel('administrativo')

      setTimeout(() => {
        setSuccessMsg(null)
        setShowModal(false)
      }, 1500)
    } catch (err) {
      const authError = err as { code?: string; message?: string }
      console.error('Erro ao cadastrar autor:', authError)
      if (authError.code === 'permission-denied') {
        setErrorMsg('Sem permissão para salvar o perfil no banco. Confirme que você está logado com uma conta de Direção.')
      } else if (authError.code === 'auth/email-already-in-use') {
        setErrorMsg('Este e-mail já está em uso por outro usuário.')
      } else if (authError.code === 'auth/weak-password') {
        setErrorMsg('A senha informada é fraca. Escolha uma senha mais segura.')
      } else {
        setErrorMsg('Não foi possível cadastrar o usuário: ' + (authError.message || 'Erro desconhecido.'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const getRoleIcon = (role: UserRole) => {
    switch (role) {
      case 'direcao':
        return <Shield className="role-icon direcao" size={16} />
      case 'pedagogia':
        return <BookOpen className="role-icon pedagogia" size={16} />
      case 'administrativo':
        return <Briefcase className="role-icon administrativo" size={16} />
    }
  }

  return (
    <div className="page-container gerenciar-usuarios-page">
      <div className="report-page-heading">
        <div>
          <span className="eyebrow">Administração & Governança</span>
          <h2>Autores e Equipe do Sistema</h2>
          <p>
            Gerencie o acesso dos profissionais da Fundação Toque com base nos papéis de{' '}
            <strong>Direção</strong>, <strong>Pedagoga</strong> e <strong>Administrativo</strong>.
          </p>
        </div>
        <div className="report-heading-actions">
          <button
            className="button primary"
            disabled={isGuest}
            onClick={() => setShowModal(true)}
            title={isGuest ? 'Indisponível no modo demonstração' : undefined}
            type="button"
          >
            <UserPlus size={18} /> Cadastrar Novo Membro
          </button>
        </div>
      </div>

      {isGuest && (
        <div className="modal-error-banner">
          <AlertCircle size={18} /> Você está no modo demonstração, sem conexão autenticada com o banco.
          Para listar e cadastrar membros da equipe, entre com uma conta de Direção.
        </div>
      )}

      {usuariosSub.status === 'error' && (
        <LoadError error={usuariosSub.error} onRetry={usuariosSub.retry} what="a equipe" />
      )}

      {/* Role explanation cards */}
      <div className="roles-summary-grid">
        {(['direcao', 'pedagogia', 'administrativo'] as UserRole[]).map((r) => {
          const count = usuarios.filter((u) => u.papel === r).length
          return (
            <div className={`role-summary-card ${r}`} key={r}>
              <div className="role-summary-header">
                {getRoleIcon(r)}
                <strong>{ROLE_LABELS[r]}</strong>
                <span className="role-count-pill">{count}</span>
              </div>
              <p>{ROLE_DESCRIPTIONS[r]}</p>
            </div>
          )
        })}
      </div>

      {/* Users table */}
      <div className="form-card users-table-card">
        <div className="users-table-header">
          <h3>
            <Users size={20} /> Profissionais Cadastrados ({usuarios.length})
          </h3>
        </div>

        <div className="users-table-wrapper">
          <table className="users-table">
            <thead>
              <tr>
                <th>Profissional</th>
                <th>E-mail</th>
                <th>Perfil de Acesso</th>
                <th>Status</th>
                <th>Criado em</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                    Carregando usuários do banco de dados...
                  </td>
                </tr>
              ) : usuarios.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ textAlign: 'center', padding: '2rem' }}>
                    {isGuest || usuariosSub.status === 'error'
                      ? 'Lista indisponível.'
                      : 'Nenhum profissional cadastrado no Firestore.'}
                  </td>
                </tr>
              ) : (
                usuarios.map((u) => (
                  <tr key={u.uid}>
                    <td>
                      <div className="user-name-cell">
                        <span className="user-avatar-badge">
                          {u.nome_completo
                            .split(' ')
                            .map((n) => n[0])
                            .slice(0, 2)
                            .join('')}
                        </span>
                        <div>
                          <strong>{u.nome_completo}</strong>
                          {u.uid === userProfile?.uid && (
                            <span className="current-user-tag">Você</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>{u.email}</td>
                    <td>
                      <span className={`role-badge ${u.papel}`}>
                        {getRoleIcon(u.papel)}
                        {ROLE_LABELS[u.papel]}
                      </span>
                    </td>
                    <td>
                      <span className={`status-pill ${u.ativo ? 'success' : 'danger'}`}>
                        {u.ativo ? 'Ativo' : 'Inativo'}
                      </span>
                      {u.trocar_senha && (
                        <span
                          className="status-pill warning"
                          style={{ marginLeft: 6 }}
                          title="Ainda não trocou a senha provisória"
                        >
                          Senha provisória
                        </span>
                      )}
                    </td>
                    <td>{u.criado_em || '—'}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal Cadastro de Novo Membro */}
      {showModal && (
        <div className="modal-backdrop" onClick={() => setShowModal(false)}>
          <div className="modal-container user-modal-box" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <div className="modal-title-group">
                <UserPlus className="modal-icon" size={22} />
                <div>
                  <h3>Cadastrar Novo Membro da Equipe</h3>
                  <p>Adicione um novo usuário ao sistema da Fundação Toque.</p>
                </div>
              </div>
              <button
                aria-label="Fechar"
                className="icon-button modal-close"
                onClick={() => setShowModal(false)}
                type="button"
              >
                <X size={20} />
              </button>
            </header>

            <form className="modal-form" onSubmit={handleCreateUser}>
              {errorMsg && (
                <div className="modal-error-banner">
                  <AlertCircle size={18} /> {errorMsg}
                </div>
              )}

              {successMsg && (
                <div className="modal-success-banner">
                  <CheckCircle2 size={18} /> {successMsg}
                </div>
              )}

              <div className="modal-grid">
                <label className="field field-wide">
                  <span>Nome Completo *</span>
                  <div className="input-icon-group">
                    <User className="field-icon" size={18} />
                    <input
                      onChange={(e) => setNome(e.target.value)}
                      placeholder="Ex: Carlos Eduardo de Oliveira"
                      required
                      type="text"
                      value={nome}
                    />
                  </div>
                </label>

                <label className="field field-wide">
                  <span>E-mail Corporativo ou de Acesso *</span>
                  <div className="input-icon-group">
                    <Mail className="field-icon" size={18} />
                    <input
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="carlos.oliveira@fundacaotoque.org.br"
                      required
                      type="email"
                      value={email}
                    />
                  </div>
                </label>

                <label className="field field-wide">
                  <span>Perfil de Acesso / Cargo *</span>
                  <select
                    onChange={(e) => setPapel(e.target.value as UserRole)}
                    value={papel}
                  >
                    <option value="administrativo">Administrativo (Alunos, Matrículas e Frequência)</option>
                    <option value="pedagogia">Pedagoga (Evolução, Frequência e Relatórios)</option>
                    <option value="direcao">Direção (Acesso Total e Gestão de Usuários)</option>
                  </select>
                </label>

                <label className="field field-wide">
                  <span>Senha Provisória (mínimo 6 caracteres) *</span>
                  <div className="input-icon-group">
                    <Lock className="field-icon" size={18} />
                    <input
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Crie a senha inicial para o usuário"
                      required
                      type="password"
                      value={password}
                    />
                  </div>
                </label>
              </div>

              <div className="role-preview-hint">
                <Sparkles size={16} />
                <span>
                  O usuário poderá entrar com este e-mail e senha imediatamente e será obrigado a
                  definir uma senha pessoal no primeiro acesso.
                </span>
              </div>

              <div className="modal-form-actions">
                <button
                  className="button secondary"
                  onClick={() => setShowModal(false)}
                  type="button"
                >
                  Cancelar
                </button>
                <button className="button primary" disabled={submitting} type="submit">
                  {submitting ? 'Salvando...' : 'Cadastrar Profissional'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
