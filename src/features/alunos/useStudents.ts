import { useSubscription } from '../../lib/useSubscription'
import { isDemoModeEnabled } from '../../lib/demoMode'
import { subscribeToStudents } from '../../services/studentsService'
import type { StudentsSource } from '../../services/studentsService'
import type { Student } from './students-data'

// Lista de alunos com estados separados (carregando, erro, vazio, dados) e
// nova tentativa. `source` mantém a distinção do modo demonstração.
export function useStudents() {
  const sub = useSubscription<Student[]>((onData, onError) => subscribeToStudents(onData, onError), [])
  const source: StudentsSource | 'loading' =
    sub.status === 'loading'
      ? 'loading'
      : sub.status === 'error'
        ? 'error'
        : isDemoModeEnabled()
          ? 'demo'
          : sub.data.length > 0
            ? 'firestore'
            : 'empty'
  return { ...sub, source }
}
