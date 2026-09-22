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
import { auth, db } from '../../lib/firebase'
import type { UserProfile, UserRole } from '../../types/auth'

interface AuthContextType {
  currentUser: User | null
  userProfile: UserProfile | null
  loading: boolean
  login: (email: string, pass: string) => Promise<void>
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
  const [currentUser, setCurrentUser] = useState<User | null>(null)
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user)
      if (user) {
        try {
          const userDoc = await getDoc(doc(db, 'usuarios', user.uid))
          if (userDoc.exists()) {
            const data = userDoc.data()
            setUserProfile({
              uid: user.uid,
              nome_completo: data.nome_completo || user.displayName || 'Usuário',
              email: data.email || user.email || '',
              papel: (data.papel as UserRole) || 'direcao',
              ativo: data.ativo !== false,
            })
          } else {
            // Se o usuário foi criado no Auth mas ainda não tem doc no Firestore
            const defaultProfile: UserProfile = {
              uid: user.uid,
              nome_completo: user.displayName || user.email?.split('@')[0] || 'Administrador',
              email: user.email || '',
              papel: 'direcao',
              ativo: true,
            }
            await setDoc(doc(db, 'usuarios', user.uid), {
              nome_completo: defaultProfile.nome_completo,
              email: defaultProfile.email,
              papel: 'direcao',
              ativo: true,
              criado_em: serverTimestamp(),
              atualizado_em: serverTimestamp(),
            })
            setUserProfile(defaultProfile)
          }
        } catch (err) {
          console.warn('Erro ao carregar perfil do Firestore:', err)
          setUserProfile({
            uid: user.uid,
            nome_completo: user.email?.split('@')[0] || 'Administrador',
            email: user.email || '',
            papel: 'direcao',
            ativo: true,
          })
        }
      } else {
        setUserProfile(null)
      }
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  const login = async (email: string, pass: string) => {
    await signInWithEmailAndPassword(auth, email, pass)
  }

  const logout = async () => {
    await signOut(auth)
    setCurrentUser(null)
    setUserProfile(null)
  }

  // Cria o primeiro admin Direção (semeador ou setup inicial)
  const setupInitialAdmin = async (nome: string, email: string, pass: string) => {
    const userCredential = await createUserWithEmailAndPassword(auth, email, pass)
    const user = userCredential.user

    const profileData: UserProfile = {
      uid: user.uid,
      nome_completo: nome,
      email: email,
      papel: 'direcao',
      ativo: true,
    }

    await setDoc(doc(db, 'usuarios', user.uid), {
      nome_completo: nome,
      email: email,
      papel: 'direcao',
      ativo: true,
      criado_em: serverTimestamp(),
      atualizado_em: serverTimestamp(),
    })

    setUserProfile(profileData)
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

    await signOut(secAuth)
    return newUid
  }

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        login,
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
