/**
 * Teste de conectividade com o Firestore (sem autenticação).
 * Esperado: PERMISSION_DENIED (regras deny-all ativas + projeto acessível).
 * Qualquer outro erro (network, invalid-api-key, project-not-found) indica
 * problema de conexão/configuração.
 */
import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { doc, getDoc, getFirestore } from 'firebase/firestore'

function loadEnv() {
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*([\w.]+)\s*=\s*(.*)?\s*$/)
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = (match[2] ?? '').trim()
    }
  } catch { /* ignore */ }
}
loadEnv()

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
})
const db = getFirestore(app)

console.log('Projeto:', process.env.VITE_FIREBASE_PROJECT_ID)

try {
  await getDoc(doc(db, 'relatorios_pedagogicos', 'seed-report-1'))
  console.log('RESULTADO: leitura anônima PERMITIDA (inesperado com deny-all)')
} catch (err) {
  console.log('RESULTADO: leitura anônima negada como esperado')
  console.log('Código:', err.code || '(sem código)')
  console.log('Mensagem:', err.message)
  if (err.code === 'permission-denied' || err.code === 'unauthenticated') {
    console.log('CONCLUSÃO: conexão com o projeto REAL funciona e as rules estão ativas.')
  } else {
    console.log('CONCLUSÃO: possível problema de conexão/config — investigar código acima.')
  }
}
