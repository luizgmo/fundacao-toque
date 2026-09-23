import {
  arrayRemove,
  arrayUnion,
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
import type {
  AlunoOficina,
  AlunoOficinaStatus,
  HorarioOficina,
  Oficina,
  TurmaOficina,
} from '../types/oficinas'

const OFICINAS_COLLECTION = 'oficinas'
const TURMA_OFICINAS_COLLECTION = 'turma_oficinas'
const ALUNO_OFICINAS_COLLECTION = 'aluno_oficinas'
const ALUNOS_COLLECTION = 'alunos'

function todayISO() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().split('T')[0]
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
}

// ID determinístico: religar a mesma oficina à mesma turma reativa o vínculo antigo
export function turmaOficinaId(turmaId: string, oficinaId: string) {
  return `${turmaId}__${oficinaId}`
}

function alunoOficinaId(alunoId: string, turmaOficinaIdValue: string) {
  return `${alunoId}__${turmaOficinaIdValue}`
}

// ==== Oficinas ====

export function docToOficina(id: string, data: DocumentData): Oficina {
  return {
    id,
    nome: data.nome || 'Sem nome',
    categoria: data.categoria || 'outra',
    descricao: data.descricao || '',
    idsUsuariosResponsaveis: Array.isArray(data.ids_usuarios_responsaveis)
      ? data.ids_usuarios_responsaveis
      : [],
    ativo: data.ativo !== false,
  }
}

export function subscribeToOficinas(
  onSuccess: (oficinas: Oficina[]) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    collection(db, OFICINAS_COLLECTION),
    (snapshot) => {
      const list: Oficina[] = []
      snapshot.forEach((docSnap) => {
        list.push(docToOficina(docSnap.id, docSnap.data()))
      })
      list.sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
      onSuccess(list)
    },
    (err) => {
      console.warn('Erro ao escutar Firestore oficinas:', err)
      if (onError) onError(err)
      else onSuccess([])
    }
  )
}

export type VinculoTurmaInput = {
  turmaId: string
  horarios: HorarioOficina[]
}

export type OficinaInput = {
  nome: string
  categoria: string
  descricao: string
  idsUsuariosResponsaveis: string[]
  ativo: boolean
  vinculos: VinculoTurmaInput[]
}

function horariosToFirestore(horarios: HorarioOficina[]) {
  return horarios.map((h) => ({
    dia_semana: h.diaSemana,
    hora_inicio: h.horaInicio,
    hora_fim: h.horaFim,
  }))
}

// Grava os vínculos turma-oficina. Vínculos removidos são desativados (ativo: false)
// para preservar o histórico, conforme modelagem.md.
async function syncVinculos(
  oficinaId: string,
  input: OficinaInput,
  existentes: TurmaOficina[],
  userId: string
) {
  const batch = writeBatch(db)
  const turmasSelecionadas = new Set(input.vinculos.map((v) => v.turmaId))

  input.vinculos.forEach((vinculo) => {
    const id = turmaOficinaId(vinculo.turmaId, oficinaId)
    const jaExiste = existentes.some((e) => e.id === id)
    batch.set(
      doc(db, TURMA_OFICINAS_COLLECTION, id),
      {
        turma_id: vinculo.turmaId,
        oficina_id: oficinaId,
        ids_usuarios_responsaveis: input.idsUsuariosResponsaveis,
        ativo: true,
        horarios: horariosToFirestore(vinculo.horarios),
        ...(jaExiste ? {} : { criado_por: userId, criado_em: serverTimestamp() }),
        atualizado_por: userId,
        atualizado_em: serverTimestamp(),
      },
      { merge: true }
    )
  })

  existentes
    .filter((e) => e.oficinaId === oficinaId && e.ativo && !turmasSelecionadas.has(e.turmaId))
    .forEach((e) => {
      batch.update(doc(db, TURMA_OFICINAS_COLLECTION, e.id), {
        ativo: false,
        atualizado_por: userId,
        atualizado_em: serverTimestamp(),
      })
    })

  await batch.commit()
}

export async function createOficina(input: OficinaInput, userId: string): Promise<string> {
  const id = `oficina-${slugify(input.nome)}-${Date.now().toString().slice(-4)}`

  try {
    await setDoc(doc(db, OFICINAS_COLLECTION, id), {
      nome: input.nome.trim(),
      categoria: input.categoria,
      descricao: input.descricao.trim(),
      ids_usuarios_responsaveis: input.idsUsuariosResponsaveis,
      ativo: input.ativo,
      criado_por: userId,
      criado_em: serverTimestamp(),
      atualizado_por: userId,
      atualizado_em: serverTimestamp(),
    })

    await syncVinculos(id, input, [], userId)
  } catch (firestoreErr) {
    console.warn('Oficina gravada localmente (Firestore indisponível ou permissão pendente):', firestoreErr)
  }
  return id
}

export async function updateOficina(
  id: string,
  input: OficinaInput,
  vinculosExistentes: TurmaOficina[],
  userId: string
): Promise<void> {
  try {
    await updateDoc(doc(db, OFICINAS_COLLECTION, id), {
      nome: input.nome.trim(),
      categoria: input.categoria,
      descricao: input.descricao.trim(),
      ids_usuarios_responsaveis: input.idsUsuariosResponsaveis,
      ativo: input.ativo,
      atualizado_por: userId,
      atualizado_em: serverTimestamp(),
    })

    await syncVinculos(id, input, vinculosExistentes, userId)
  } catch (firestoreErr) {
    console.warn('Oficina atualizada localmente (Firestore indisponível ou permissão pendente):', firestoreErr)
  }
}

// Excluir oficina junto com seus vínculos em turma_oficinas e aluno_oficinas
export async function deleteOficina(id: string): Promise<void> {
  try {
    const batch = writeBatch(db)

    const vinculos = await getDocs(
      query(collection(db, TURMA_OFICINAS_COLLECTION), where('oficina_id', '==', id))
    )

    for (const vinculo of vinculos.docs) {
      const alunosVinculados = await getDocs(
        query(collection(db, ALUNO_OFICINAS_COLLECTION), where('turma_oficina_id', '==', vinculo.id))
      )
      alunosVinculados.forEach((a) => batch.delete(a.ref))
      batch.delete(vinculo.ref)
    }

    batch.delete(doc(db, OFICINAS_COLLECTION, id))
    await batch.commit()
  } catch (firestoreErr) {
    console.warn('Oficina removida localmente (Firestore indisponível ou permissão pendente):', firestoreErr)
  }
}

// ==== Vínculos turma-oficina ====

export function docToTurmaOficina(id: string, data: DocumentData): TurmaOficina {
  return {
    id,
    turmaId: data.turma_id || '',
    oficinaId: data.oficina_id || '',
    idsUsuariosResponsaveis: Array.isArray(data.ids_usuarios_responsaveis)
      ? data.ids_usuarios_responsaveis
      : [],
    ativo: data.ativo !== false,
    horarios: Array.isArray(data.horarios)
      ? data.horarios.map((h: DocumentData) => ({
          diaSemana: Number(h.dia_semana) || 1,
          horaInicio: h.hora_inicio || '',
          horaFim: h.hora_fim || '',
        }))
      : [],
  }
}

export function subscribeToTurmaOficinas(
  onSuccess: (vinculos: TurmaOficina[]) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    collection(db, TURMA_OFICINAS_COLLECTION),
    (snapshot) => {
      const list: TurmaOficina[] = []
      snapshot.forEach((docSnap) => {
        list.push(docToTurmaOficina(docSnap.id, docSnap.data()))
      })
      onSuccess(list)
    },
    (err) => {
      console.warn('Erro ao escutar Firestore turma_oficinas:', err)
      if (onError) onError(err)
      else onSuccess([])
    }
  )
}

// ==== Vínculos aluno-oficina ====

export function docToAlunoOficina(id: string, data: DocumentData): AlunoOficina {
  return {
    id,
    alunoId: data.aluno_id || '',
    turmaOficinaId: data.turma_oficina_id || '',
    dataInicio: data.data_inicio || '',
    status: (data.status as AlunoOficinaStatus) || 'ativo',
    nivelSuporte: data.nivel_suporte || '',
    consideracoesPedagogicas: data.consideracoes_pedagogicas || '',
  }
}

export function subscribeToAlunoOficinas(
  onSuccess: (vinculos: AlunoOficina[]) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    collection(db, ALUNO_OFICINAS_COLLECTION),
    (snapshot) => {
      const list: AlunoOficina[] = []
      snapshot.forEach((docSnap) => {
        list.push(docToAlunoOficina(docSnap.id, docSnap.data()))
      })
      onSuccess(list)
    },
    (err) => {
      console.warn('Erro ao escutar Firestore aluno_oficinas:', err)
      if (onError) onError(err)
      else onSuccess([])
    }
  )
}

export type AlunoOficinaSelecao = {
  alunoId: string
  nivelSuporte: string
  consideracoesPedagogicas: string
}

// Define os alunos participantes de uma oficina dentro da turma.
// Alunos desmarcados têm o vínculo cancelado (histórico preservado).
export async function saveAlunosDaOficina(
  turmaOficinaIdValue: string,
  oficinaNome: string,
  selecionados: AlunoOficinaSelecao[],
  existentes: AlunoOficina[],
  userId: string
): Promise<void> {
  try {
    const batch = writeBatch(db)
    const hoje = todayISO()
    const idsSelecionados = new Set(selecionados.map((s) => s.alunoId))
    const ativosAntes = existentes.filter(
      (e) => e.turmaOficinaId === turmaOficinaIdValue && e.status === 'ativo'
    )

    selecionados.forEach((sel) => {
      const anterior = ativosAntes.find((e) => e.alunoId === sel.alunoId)
      batch.set(
        doc(db, ALUNO_OFICINAS_COLLECTION, alunoOficinaId(sel.alunoId, turmaOficinaIdValue)),
        {
          aluno_id: sel.alunoId,
          turma_oficina_id: turmaOficinaIdValue,
          data_inicio: anterior?.dataInicio || hoje,
          data_fim: null,
          status: 'ativo',
          nivel_suporte: sel.nivelSuporte || null,
          consideracoes_pedagogicas: sel.consideracoesPedagogicas.trim() || null,
          ...(anterior ? {} : { atribuido_por: userId, criado_em: serverTimestamp() }),
          atualizado_por: userId,
          atualizado_em: serverTimestamp(),
        },
        { merge: true }
      )
    })

    const removidos = ativosAntes.filter((e) => !idsSelecionados.has(e.alunoId))
    removidos.forEach((e) => {
      batch.update(doc(db, ALUNO_OFICINAS_COLLECTION, e.id), {
        status: 'cancelado',
        data_fim: hoje,
        atualizado_por: userId,
        atualizado_em: serverTimestamp(),
      })
    })

    await batch.commit()

    // Mantém o resumo de oficinas exibido no perfil do aluno sincronizado
    const novos = selecionados.filter((s) => !ativosAntes.some((e) => e.alunoId === s.alunoId))
    await Promise.all([
      ...novos.map((s) =>
        updateDoc(doc(db, ALUNOS_COLLECTION, s.alunoId), { oficinas: arrayUnion(oficinaNome) }).catch(
          (err) => console.warn('Resumo de oficinas do aluno não atualizado:', err)
        )
      ),
      ...removidos.map((e) =>
        updateDoc(doc(db, ALUNOS_COLLECTION, e.alunoId), { oficinas: arrayRemove(oficinaNome) }).catch(
          (err) => console.warn('Resumo de oficinas do aluno não atualizado:', err)
        )
      ),
    ])
  } catch (firestoreErr) {
    console.warn('Vínculos aluno-oficina gravados localmente (Firestore indisponível ou permissão pendente):', firestoreErr)
  }
}
