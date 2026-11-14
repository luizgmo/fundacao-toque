import { initializeApp } from 'firebase/app'
import { getAuth } from 'firebase/auth'
import { getFirestore } from 'firebase/firestore'
import { getStorage } from 'firebase/storage'

const isConfigured = Boolean(
  import.meta.env.VITE_FIREBASE_API_KEY &&
  import.meta.env.VITE_FIREBASE_API_KEY !== 'undefined' &&
  import.meta.env.VITE_FIREBASE_API_KEY.trim() !== ''
)

if (!isConfigured) {
  console.warn(
    '⚠️ [Firebase] VITE_FIREBASE_API_KEY não foi encontrada nas variáveis de ambiente (.env ou .env.local). ' +
    'O aplicativo usará uma configuração de demonstração para evitar tela branca em ambiente de testes/desenvolvimento local. ' +
    'Para conectar ao seu projeto real do Firebase, configure o arquivo .env.local com suas chaves.'
  )
}

const projectId = import.meta.env.VITE_FIREBASE_PROJECT_ID || 'fundacao-toque-dev'

const firebaseConfig = {
  apiKey: isConfigured ? import.meta.env.VITE_FIREBASE_API_KEY : 'AIzaSyDemoFallbackKeyForLocalDevelopmentOnly000',
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || 'fundacao-toque-dev.firebaseapp.com',
  projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || `${projectId}.appspot.com`,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || '1234567890',
  appId: import.meta.env.VITE_FIREBASE_APP_ID || '1:1234567890:web:abcdef123456',
}

export const isFirebaseConfigured = isConfigured
export const app = initializeApp(firebaseConfig)

export const auth = getAuth(app)
export const db = getFirestore(app)
export const storage = getStorage(app)

