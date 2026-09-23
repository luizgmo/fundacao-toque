import {
  collection,
  doc,
  getDocs,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore'
import type { DocumentData } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { Turma, TurmaPeriodo } from '../types/turmas'
import type { Student } from '../features/alunos/students-data'

const TURMAS_COLLECTION = 'turmas'
const TURMA_OFICINAS_COLLECTION = 'turma_oficinas'
const ALUNO_OFICINAS_COLLECTION = 'aluno_oficinas'

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

// Inscrição em tempo real na coleção de turmas
export function subscribeToTurmas(
  onSuccess: (turmas: Turma[]) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    collection(db, TURMAS_COLLECTION),
    (snapshot) => {
      const list: Turma[] = []
      snapshot.forEach((docSnap) => {
        list.push(docToTurma(docSnap.id, docSnap.data()))
      })
      list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      onSuccess(list)
    },
    (err) => {
      console.warn('Erro ao escutar Firestore turmas:', err)
      if (onError) onError(err)
      else onSuccess([])
    }
  )
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

// Criar turma no Firestore
export async function createTurma(input: TurmaInput, userId: string): Promise<string> {
  const id = `turma-${slugify(input.nome)}-${Date.now().toString().slice(-4)}`

  await setDoc(doc(db, TURMAS_COLLECTION, id), {
    codigo: input.codigo.trim().toUpperCase(),
    nome: input.nome.trim(),
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

  return id
}

// Atualizar turma no Firestore
export async function updateTurma(id: string, input: TurmaInput, userId: string): Promise<void> {
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
}

// Excluir turma e seus vínculos com oficinas (turma_oficinas e aluno_oficinas).
// Registros de atividade e chamadas são preservados como histórico.
export async function deleteTurma(id: string): Promise<void> {
  const batch = writeBatch(db)

  const vinculos = await getDocs(
    query(collection(db, TURMA_OFICINAS_COLLECTION), where('turma_id', '==', id))
  )

  for (const vinculo of vinculos.docs) {
    const alunosVinculados = await getDocs(
      query(collection(db, ALUNO_OFICINAS_COLLECTION), where('turma_oficina_id', '==', vinculo.id))
    )
    alunosVinculados.forEach((a) => batch.delete(a.ref))
    batch.delete(vinculo.ref)
  }

  batch.delete(doc(db, TURMAS_COLLECTION, id))
  await batch.commit()
}
