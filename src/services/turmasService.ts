import {
  collection,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import type { DocumentData } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { Turma, TurmaPeriodo } from '../types/turmas'
import type { Student } from '../features/alunos/students-data'

const TURMAS_COLLECTION = 'turmas'

export function docToTurma(id: string, data: DocumentData): Turma {
  return {
    id,
    codigo: data.codigo || '',
    nome: data.nome || 'Sem nome',
    periodo: (data.periodo as TurmaPeriodo) || 'manha',
    idsUsuariosResponsaveis: Array.isArray(data.ids_usuarios_responsaveis)
      ? data.ids_usuarios_responsaveis
      : [],
    dataInicio: data.data_inicio || '',
    dataFim: data.data_fim || '',
    ativo: data.ativo !== false,
  }
}

// Aluno pertence à turma pelo ID (novos cadastros) ou pelo nome (cadastros legados)
export function studentBelongsToTurma(student: Student, turma: Turma) {
  if (student.turmaId) return student.turmaId === turma.id
  return student.turma.toLowerCase() === turma.nome.toLowerCase()
}

const LOCAL_TURMAS_KEY = 'fundacao_toque_local_turmas'

const DEFAULT_LOCAL_TURMAS: Turma[] = [
  {
    id: 'turma-a-manha',
    codigo: 'TURMA-A',
    nome: 'Turma A',
    periodo: 'manha',
    idsUsuariosResponsaveis: [],
    dataInicio: '2024-02-01',
    dataFim: '',
    ativo: true,
  },
  {
    id: 'turma-b-tarde',
    codigo: 'TURMA-B',
    nome: 'Turma B',
    periodo: 'tarde',
    idsUsuariosResponsaveis: [],
    dataInicio: '2024-02-01',
    dataFim: '',
    ativo: true,
  },
  {
    id: 'turma-c-integral',
    codigo: 'TURMA-C',
    nome: 'Turma C',
    periodo: 'integral',
    idsUsuariosResponsaveis: [],
    dataInicio: '2024-02-01',
    dataFim: '',
    ativo: true,
  },
]

function getStoredTurmas(): Turma[] {
  try {
    const raw = localStorage.getItem(LOCAL_TURMAS_KEY)
    if (raw) {
      return JSON.parse(raw)
    }
  } catch {
    // ignore
  }
  return DEFAULT_LOCAL_TURMAS
}

function saveStoredTurmas(list: Turma[]) {
  try {
    localStorage.setItem(LOCAL_TURMAS_KEY, JSON.stringify(list))
  } catch {
    // ignore
  }
}

let activeTurmaListeners: ((turmas: Turma[]) => void)[] = []

function notifyTurmaListeners(turmas: Turma[]) {
  activeTurmaListeners.forEach((fn) => {
    try {
      fn(turmas)
    } catch (e) {
      console.warn('Erro ao notificar listener de turmas:', e)
    }
  })
}

// Inscrição em tempo real na coleção de turmas com suporte a cache local
export function subscribeToTurmas(
  onSuccess: (turmas: Turma[]) => void,
  onError?: (error: Error) => void
) {
  activeTurmaListeners.push(onSuccess)
  onSuccess(getStoredTurmas())

  const unsubscribe = onSnapshot(
    collection(db, TURMAS_COLLECTION),
    (snapshot) => {
      if (snapshot.empty) {
        onSuccess(getStoredTurmas())
      } else {
        const list: Turma[] = []
        snapshot.forEach((docSnap) => {
          list.push(docToTurma(docSnap.id, docSnap.data()))
        })
        list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
        saveStoredTurmas(list)
        onSuccess(list)
      }
    },
    (err) => {
      console.warn('Aviso: Firestore turmas offline ou permissão pendente. Usando turmas locais:', err.message)
      if (onError) onError(err)
      onSuccess(getStoredTurmas())
    }
  )

  return () => {
    activeTurmaListeners = activeTurmaListeners.filter((l) => l !== onSuccess)
    unsubscribe()
  }
}

export type TurmaInput = {
  codigo: string
  nome: string
  periodo: TurmaPeriodo
  idsUsuariosResponsaveis: string[]
  dataInicio: string
  dataFim: string
  ativo: boolean
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// Criar turma (persiste localmente primeiro, depois tenta Firestore)
export async function createTurma(input: TurmaInput, userId: string): Promise<string> {
  const id = `turma-${slugify(input.nome)}-${Date.now().toString().slice(-4)}`

  const newTurma: Turma = {
    id,
    codigo: input.codigo.trim().toUpperCase(),
    nome: input.nome.trim(),
    periodo: input.periodo,
    idsUsuariosResponsaveis: input.idsUsuariosResponsaveis,
    dataInicio: input.dataInicio || '',
    dataFim: input.dataFim || '',
    ativo: input.ativo,
  }

  // Atualiza cache local imediatamente
  const currentList = getStoredTurmas()
  const updatedList = [newTurma, ...currentList.filter((t) => t.id !== id)]
  saveStoredTurmas(updatedList)
  notifyTurmaListeners(updatedList)

  // Grava no Firestore se houver conexão e permissão
  try {
    await setDoc(doc(db, TURMAS_COLLECTION, id), {
      codigo: newTurma.codigo,
      nome: newTurma.nome,
      periodo: input.periodo,
      ids_usuarios_responsaveis: input.idsUsuariosResponsaveis,
      data_inicio: input.dataInicio || null,
      data_fim: input.dataFim || null,
      ativo: input.ativo,
      criado_por: userId,
      criado_em: serverTimestamp(),
      atualizado_por: userId,
      atualizado_em: serverTimestamp(),
    })
  } catch (firestoreErr) {
    console.warn('Turma gravada localmente (Firestore indisponível ou permissão pendente):', firestoreErr)
  }

  return id
}

// Atualizar turma (atualiza local primeiro, depois tenta Firestore)
export async function updateTurma(id: string, input: TurmaInput, userId: string): Promise<void> {
  // Atualiza cache local imediatamente
  const currentList = getStoredTurmas()
  const updatedList = currentList.map((t) => {
    if (t.id !== id) return t
    return {
      ...t,
      codigo: input.codigo.trim().toUpperCase(),
      nome: input.nome.trim(),
      periodo: input.periodo,
      idsUsuariosResponsaveis: input.idsUsuariosResponsaveis,
      dataInicio: input.dataInicio || '',
      dataFim: input.dataFim || '',
      ativo: input.ativo,
    }
  })
  saveStoredTurmas(updatedList)
  notifyTurmaListeners(updatedList)

  try {
    await updateDoc(doc(db, TURMAS_COLLECTION, id), {
      codigo: input.codigo.trim().toUpperCase(),
      nome: input.nome.trim(),
      periodo: input.periodo,
      ids_usuarios_responsaveis: input.idsUsuariosResponsaveis,
      data_inicio: input.dataInicio || null,
      data_fim: input.dataFim || null,
      ativo: input.ativo,
      atualizado_por: userId,
      atualizado_em: serverTimestamp(),
    })
  } catch (firestoreErr) {
    console.warn('Turma atualizada localmente (Firestore indisponível ou permissão pendente):', firestoreErr)
  }
}

// Inativar turma (em vez de excluir, para preservar histórico)
export async function inactivateTurma(id: string): Promise<void> {
  // Atualiza cache local imediatamente
  const currentList = getStoredTurmas()
  const updatedList = currentList.map((t) => {
    if (t.id !== id) return t
    return { ...t, ativo: false }
  })
  saveStoredTurmas(updatedList)
  notifyTurmaListeners(updatedList)

  try {
    await updateDoc(doc(db, TURMAS_COLLECTION, id), {
      ativo: false,
      atualizado_em: serverTimestamp(),
    })
  } catch (firestoreErr) {
    console.warn('Turma inativada localmente (Firestore indisponível ou permissão pendente):', firestoreErr)
  }
}

// Manter função deleteTurma para compatibilidade, mas agora inativa
export async function deleteTurma(id: string): Promise<void> {
  return inactivateTurma(id)
}
