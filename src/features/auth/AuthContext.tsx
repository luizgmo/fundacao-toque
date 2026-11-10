import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
  deleteUser,
  EmailAuthProvider,
  reauthenticateWithCredential,
  updatePassword,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth as getSecondaryAuth } from 'firebase/auth'
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, isFirebaseConfigured } from '../../lib/firebase'
import { clearDemoData, setDemoModeEnabled } from '../../lib/demoMode'
import type { UserProfile, UserRole } from '../../types/auth'

interface AuthContextType {
  currentUser: User | null
  userProfile: UserProfile | null
  loading: boolean
  isConfigured: boolean
  isGuest: boolean
  login: (email: string, pass: string) => Promise<void>
  loginAsGuest: (papel?: UserRole) => void
  logout: () => Promise<void>
  createAuthorUser: (
    nome: string,
    email: string,
    pass: string,
    papel: UserRole
  ) => Promise<string>
  changePassword: (currentPass: string, newPass: string) => Promise<void>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const GUEST_UID = 'guest-local-uid'

const secondaryAppName = 'SecondaryAuthAdmin'
function getSecondaryAuthInstance() {
  const existing = getApps().find((a) => a.name === secondaryAppName)
  if (existing) {
    return getSecondaryAuth(existing)
  }
  const mainApp = getApp()
  const secondary = initializeApp(mainApp.options, secondaryAppName)
  return getSecondaryAuth(secondary)
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [currentUser, setCurrentUser] = useState<User | null>(() => {
    try {
      const saved = localStorage.getItem('ft_guest_session')
      if (saved) {
        const parsed = JSON.parse(saved)
        return {
          uid: parsed.uid || GUEST_UID,
          email: parsed.email || '',
          displayName: parsed.nome_completo || '',
        } as unknown as User
      }
    } catch {
      // ignore
    }
    return null
  })
  const [userProfile, setUserProfile] = useState<UserProfile | null>(() => {
    try {
      const saved = localStorage.getItem('ft_guest_session')
      if (saved) return JSON.parse(saved)
    } catch {
      // ignore
    }
    return null
  })
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Sessão de convidado sempre implica modo demonstração explícito.
    try {
      if (localStorage.getItem('ft_guest_session')) setDemoModeEnabled(true)
    } catch {
      // ignore
    }

    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Usuário real: nunca misturar com dados fictícios de demonstração.
        setDemoModeEnabled(false)
        try {
          localStorage.removeItem('ft_guest_session')
        } catch {
          // ignore
        }
        setCurrentUser(user)
        try {
          const userDoc = await getDoc(doc(db, 'usuarios', user.uid))
          if (userDoc.exists()) {
            const data = userDoc.data()
            const validRole = ['direcao', 'pedagogia', 'administrativo'].includes(data.papel)
            if (data.ativo !== true || !validRole) {
              throw new Error('Perfil ausente, inativo ou com papel inválido.')
            }
            setUserProfile({
              uid: user.uid,
              nome_completo: data.nome_completo || user.displayName || 'Usuário',
              email: data.email || user.email || '',
              papel: data.papel as UserRole,
              ativo: true,
              trocar_senha: data.trocar_senha === true,
            })
          } else {
            throw new Error('Conta sem perfil no Firestore; solicite provisionamento à Direção.')
          }
        } catch (err) {
          console.warn('Erro ao carregar perfil do Firestore:', err)
          setUserProfile(null)
          setCurrentUser(null)
          await signOut(auth).catch(() => {})
        }
      } else {
        // Se já havia uma sessão de convidado/local, não limpa
        const savedGuest = localStorage.getItem('ft_guest_session')
        if (!savedGuest) {
          setCurrentUser(null)
          setUserProfile(null)
        }
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const login = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass)
  }

  const loginAsGuest = (papel: UserRole = 'direcao') => {
    const mockUser = {
      uid: GUEST_UID,
      email: `${papel}@modo-demonstracao.local`,
      displayName: papel === 'direcao' ? 'Direção (Modo Demonstração)' : papel === 'pedagogia' ? 'Pedagoga (Modo Demonstração)' : 'Administrativo (Modo Demonstração)',
    } as unknown as User

    const mockProfile: UserProfile = {
      uid: GUEST_UID,
      nome_completo: mockUser.displayName || 'Colaborador',
      email: mockUser.email || '',
      papel,
      ativo: true,
    }

    try {
      localStorage.setItem('ft_guest_session', JSON.stringify(mockProfile))
    } catch {
      // ignore
    }
    setDemoModeEnabled(true)

    setCurrentUser(mockUser)
    setUserProfile(mockProfile)
  }

  const logout = async () => {
    try {
      localStorage.removeItem('ft_guest_session')
    } catch {
      // ignore
    }
    setDemoModeEnabled(false)
    clearDemoData()
    try {
      await signOut(auth)
    } catch {
      // ignore
    }
    setCurrentUser(null)
    setUserProfile(null)
  }

  // Permite à Direção criar outro autor sem deslogar a sessão atual
  const createAuthorUser = async (
    nome: string,
    email: string,
    pass: string,
    papel: UserRole
  ): Promise<string> => {
    const secAuth = getSecondaryAuthInstance()
    const cred = await createUserWithEmailAndPassword(secAuth, email, pass)
    const newUid = cred.user.uid

    try {
      await setDoc(doc(db, 'usuarios', newUid), {
        nome_completo: nome,
        email: email,
        papel: papel,
        ativo: true,
        trocar_senha: true,
        criado_em: serverTimestamp(),
        atualizado_em: serverTimestamp(),
      })
    } catch (err) {
      // Sem o perfil no Firestore a conta fica órfã no Auth e bloqueia o e-mail;
      // desfaz a criação para permitir nova tentativa.
      await deleteUser(cred.user).catch((delErr) =>
        console.warn('Não foi possível desfazer a conta criada no Auth:', delErr)
      )
      throw err
    } finally {
      await signOut(secAuth).catch(() => {})
    }

    return newUid
  }

  // Troca a senha do usuário logado e libera o aviso de senha provisória
  const changePassword = async (currentPass: string, newPass: string) => {
    const user = auth.currentUser
    if (!user || !user.email) {
      throw new Error('Nenhum usuário autenticado no Firebase.')
    }

    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, currentPass))
    await updatePassword(user, newPass)
    await updateDoc(doc(db, 'usuarios', user.uid), {
      trocar_senha: false,
      atualizado_em: serverTimestamp(),
    })

    setUserProfile((prev) => (prev ? { ...prev, trocar_senha: false } : prev))
  }

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        isConfigured: isFirebaseConfigured,
        isGuest: currentUser?.uid === GUEST_UID,
        login,
        loginAsGuest,
        logout,
        createAuthorUser,
        changePassword,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider')
  }
  return context
}
