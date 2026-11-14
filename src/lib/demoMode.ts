export const DEMO_MODE_STORAGE_KEY = 'ft_demo_mode'
export const DEMO_STUDENTS_STORAGE_KEY = 'ft_demo_students'
export const DEMO_SESSIONS_STORAGE_KEY = 'ft_demo_sessions'
export const DEMO_CONTACTS_STORAGE_KEY = 'ft_demo_contacts'
export const DEMO_GENERATED_REPORTS_STORAGE_KEY = 'ft_demo_generated_reports'
export const DEMO_EVOLUTION_STORAGE_KEY = 'ft_demo_evolution'

// O modo demonstração é sempre explícito: só é ativado pelo botão de convidado
// na tela de login e nunca se mistura com dados reais do Firestore.
export function isDemoModeEnabled(): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(DEMO_MODE_STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function setDemoModeEnabled(enabled: boolean): void {
  if (typeof window === 'undefined') return
  try {
    if (enabled) {
      window.localStorage.setItem(DEMO_MODE_STORAGE_KEY, '1')
    } else {
      window.localStorage.removeItem(DEMO_MODE_STORAGE_KEY)
    }
  } catch {
    // ignore
  }
}

export function clearDemoData(): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(DEMO_STUDENTS_STORAGE_KEY)
    window.localStorage.removeItem(DEMO_SESSIONS_STORAGE_KEY)
    window.localStorage.removeItem(DEMO_CONTACTS_STORAGE_KEY)
    window.localStorage.removeItem(DEMO_GENERATED_REPORTS_STORAGE_KEY)
    window.localStorage.removeItem(DEMO_EVOLUTION_STORAGE_KEY)
  } catch {
    // ignore
  }
}
