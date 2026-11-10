import { createContext, useContext, useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  createUserWithEmailAndPassword,
} from 'firebase/auth'
import type { User } from 'firebase/auth'
import { initializeApp, getApps, getApp } from 'firebase/app'
import { getAuth as getSecondaryAuth } from 'firebase/auth'
import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { auth, db, isFirebaseConfigured } from '../../lib/firebase'
import type { UserProfile, UserRole } from '../../types/auth'

interface AuthContextType {
  currentUser: User | null
  userProfile: UserProfile | null
  loading: boolean
  isConfigured: boolean
  login: (email: string, pass: string) => Promise<void>
  loginAsGuest: (papel?: UserRole) => void
  logout: () => Promise<void>
  setupInitialAdmin: (nome: string, email: string, pass: string) => Promise<void>
  createAuthorUser: (
    nome: string,
    email: string,
    pass: string,
    papel: UserRole
  ) => Promise<string>
}

const AuthContext = createContext<AuthContextType | undefined>(undefined)

const secondaryAppName = 'SecondaryAuthAdmin'
function isUserRole(value: unknown): value is UserRole {
  return value === 'direcao' || value === 'pedagogia' || value === 'administrativo'
}

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
          uid: parsed.uid || 'guest-local-uid',
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
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setCurrentUser(user)
        try {
          const userDoc = await getDoc(doc(db, 'usuarios', user.uid))
          if (userDoc.exists()) {
            const data = userDoc.data()
            if (!isUserRole(data.papel) || data.ativo !== true) {
              setUserProfile(null)
              setCurrentUser(null)
              await signOut(auth)
            } else {
              setUserProfile({
                uid: user.uid,
                nome_completo: data.nome_completo || user.displayName || 'Usuário',
                email: data.email || user.email || '',
                papel: data.papel,
                ativo: true,
              })
            }
          } else {
            // Uma conta Auth sem perfil deve ser provisionada por um administrador confiável.
            setUserProfile(null)
            setCurrentUser(null)
            await signOut(auth)
          }
        } catch (err) {
          console.warn('Erro ao carregar perfil do Firestore:', err)
          setUserProfile(null)
          setCurrentUser(null)
          await signOut(auth).catch(() => undefined)
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
      uid: 'guest-local-uid',
      email: `${papel}@fundacaotoque.org.br`,
      displayName: papel === 'direcao' ? 'Direção (Modo Teste)' : papel === 'pedagogia' ? 'Pedagoga (Modo Teste)' : 'Administrativo (Modo Teste)',
    } as unknown as User

    const mockProfile: UserProfile = {
      uid: 'guest-local-uid',
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

    setCurrentUser(mockUser)
    setUserProfile(mockProfile)
  }

  const logout = async () => {
    try {
      localStorage.removeItem('ft_guest_session')
    } catch {
      // ignore
    }
    try {
      await signOut(auth)
    } catch {
      // ignore
    }
    setCurrentUser(null)
    setUserProfile(null)
  }

  // Cria o primeiro admin Direção (semeador ou setup inicial)
  const setupInitialAdmin = async (nome: string, email: string, pass: string) => {
    void nome
    void email
    void pass
    throw new Error('O primeiro perfil de Direção deve ser provisionado por um administrador confiável.')
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

    await setDoc(doc(db, 'usuarios', newUid), {
      nome_completo: nome,
      email: email,
      papel: papel,
      ativo: true,
      criado_em: serverTimestamp(),
      atualizado_em: serverTimestamp(),
    })

    await setDoc(doc(db, 'usuarios_publicos', newUid), {
      nome_completo: nome,
      papel,
      ativo: true,
      atualizado_em: serverTimestamp(),
    })

    await signOut(secAuth)
    return newUid
  }

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        isConfigured: isFirebaseConfigured,
        login,
        loginAsGuest,
        logout,
        setupInitialAdmin,
        createAuthorUser,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) {
    throw new Error('useAuth deve ser usado dentro de AuthProvider')
  }
  return context
}
