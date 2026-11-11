import {
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  onSnapshot,
  serverTimestamp,
  runTransaction,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import type { DocumentData } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { confirmWrite, describePersistenceError } from '../lib/persistence'
import type {
  AlunoOficina,
  AlunoOficinaStatus,
  HorarioOficina,
  Oficina,
  TurmaOficina,
} from '../types/oficinas'
import { validarHorarios, validarResponsaveisVinculo, vinculoDoPar } from '../types/oficinas'

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
  onError: (error: Error) => void
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
      onError(err)
    }
  )
}

export type OficinaInput = {
  nome: string
  categoria: string
  descricao: string
  idsUsuariosResponsaveis: string[]
  ativo: boolean
}

export async function createOficina(input: OficinaInput, userId: string): Promise<string> {
  const id = `oficina-${slugify(input.nome)}-${Date.now().toString().slice(-4)}`

  const batch = writeBatch(db)
  batch.set(doc(db, OFICINAS_COLLECTION, id), {
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
  await confirmWrite('cadastrar a oficina', batch.commit())
  return id
}

export async function updateOficina(id: string, input: OficinaInput, userId: string): Promise<void> {
  await confirmWrite(
    'atualizar a oficina',
    updateDoc(doc(db, OFICINAS_COLLECTION, id), {
      nome: input.nome.trim(),
      categoria: input.categoria,
      descricao: input.descricao.trim(),
      ids_usuarios_responsaveis: input.idsUsuariosResponsaveis,
      ativo: input.ativo,
      atualizado_por: userId,
      atualizado_em: serverTimestamp(),
    })
  )
}

// Inativar oficina (em vez de excluir, para preservar histórico). Os vínculos
// ativos da oficina são inativados no mesmo batch: ou tudo é confirmado, ou nada.
export async function inactivateOficina(
  id: string,
  vinculosAtivos: TurmaOficina[],
  userId: string
): Promise<void> {
  const batch = writeBatch(db)
  batch.update(doc(db, OFICINAS_COLLECTION, id), {
    ativo: false,
    atualizado_por: userId,
    atualizado_em: serverTimestamp(),
  })
  vinculosAtivos
    .filter((v) => v.oficinaId === id && v.ativo)
    .forEach((v) => {
      batch.update(doc(db, TURMA_OFICINAS_COLLECTION, v.id), {
        ativo: false,
        inativado_em: todayISO(),
        inativado_por: userId,
        atualizado_por: userId,
        atualizado_em: serverTimestamp(),
      })
    })
  await confirmWrite('inativar a oficina', batch.commit())
}

// Manter função deleteOficina para compatibilidade, mas agora inativa
export async function deleteOficina(
  id: string,
  vinculosAtivos: TurmaOficina[],
  userId: string
): Promise<void> {
  return inactivateOficina(id, vinculosAtivos, userId)
}

// ==== Vínculos turma-oficina ====

function optionalString(value: unknown) {
  return typeof value === 'string' && value ? value : undefined
}

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
          validoDe: optionalString(h.valido_de),
          validoAte: optionalString(h.valido_ate),
        }))
      : [],
    inativadoEm: optionalString(data.inativado_em),
  }
}

export function subscribeToTurmaOficinas(
  onSuccess: (vinculos: TurmaOficina[]) => void,
  onError: (error: Error) => void
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
      onError(err)
    }
  )
}

export type VinculoInput = {
  turmaId: string
  oficinaId: string
  idsUsuariosResponsaveis: string[]
  horarios: HorarioOficina[]
}

export class VinculoInvalidoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'VinculoInvalidoError'
  }
}

function horariosToFirestore(horarios: HorarioOficina[]) {
  return [...horarios]
    .sort((a, b) => a.diaSemana - b.diaSemana || a.horaInicio.localeCompare(b.horaInicio))
    .map((h) => ({
      dia_semana: h.diaSemana,
      hora_inicio: h.horaInicio,
      hora_fim: h.horaFim,
      ...(h.validoDe ? { valido_de: h.validoDe } : {}),
      ...(h.validoAte ? { valido_ate: h.validoAte } : {}),
    }))
}

export type ResultadoVinculo = { id: string; acao: 'criado' | 'atualizado' | 'reativado' }

// Cria, edita ou reativa o vínculo turma-oficina. Existe no máximo um documento
// por par turma/oficina: religar uma oficina inativada reativa o documento
// antigo, e chamadas/atividades que já apontavam para ele continuam válidas.
// Novos vínculos usam o ID determinístico turma__oficina, exigido pelas regras
// do Firestore, o que impede duplicar o par mesmo com gravações simultâneas.
export async function salvarVinculo(
  input: VinculoInput,
  existentes: TurmaOficina[],
  userId: string
): Promise<ResultadoVinculo> {
  if (!input.turmaId || !input.oficinaId) {
    throw new VinculoInvalidoError('Selecione a turma e a oficina do vínculo.')
  }
  const erro = validarResponsaveisVinculo(input.idsUsuariosResponsaveis) || validarHorarios(input.horarios)
  if (erro) throw new VinculoInvalidoError(erro)

  // Reaproveita o documento já existente do par (mesmo com ID fora do padrão);
  // só cria um novo, com ID determinístico, quando o par nunca foi vinculado.
  const anterior = vinculoDoPar(existentes, input.turmaId, input.oficinaId)
  const id = anterior?.id || turmaOficinaId(input.turmaId, input.oficinaId)
  const operacao = !anterior ? 'criar o vínculo' : anterior.ativo ? 'atualizar o vínculo' : 'reativar o vínculo'

  const dados = {
    turma_id: input.turmaId,
    oficina_id: input.oficinaId,
    ids_usuarios_responsaveis: [...new Set(input.idsUsuariosResponsaveis)],
    ativo: true,
    horarios: horariosToFirestore(input.horarios),
    inativado_em: null,
    inativado_por: null,
    atualizado_por: userId,
    atualizado_em: serverTimestamp(),
  }

  // A transação lê o documento antes de gravar: se outra pessoa criou o mesmo
  // vínculo nesse meio-tempo, ele é atualizado (não sobrescrito do zero).
  const ref = doc(db, TURMA_OFICINAS_COLLECTION, id)
  const acao = await confirmWrite(
    operacao,
    runTransaction(db, async (tx): Promise<ResultadoVinculo['acao']> => {
      const atual = await tx.get(ref)
      if (!atual.exists()) {
        tx.set(ref, { ...dados, criado_por: userId, criado_em: serverTimestamp() })
        return 'criado'
      }
      tx.update(ref, dados)
      return atual.data().ativo === false ? 'reativado' : 'atualizado'
    })
  )
  return { id, acao }
}

// Inativa o vínculo sem apagá-lo: chamadas, atividades e participantes que o
// referenciam continuam resolvendo turma, oficina e horários no histórico.
export async function inativarVinculo(id: string, userId: string): Promise<void> {
  await confirmWrite(
    'inativar o vínculo',
    updateDoc(doc(db, TURMA_OFICINAS_COLLECTION, id), {
      ativo: false,
      inativado_em: todayISO(),
      inativado_por: userId,
      atualizado_por: userId,
      atualizado_em: serverTimestamp(),
    })
  )
}

// ==== Vínculos aluno-oficina ====

export function docToAlunoOficina(id: string, data: DocumentData): AlunoOficina {
  return {
    id,
    alunoId: data.aluno_id || '',
    turmaOficinaId: data.turma_oficina_id || '',
    dataInicio: data.data_inicio || '',
    dataFim: typeof data.data_fim === 'string' && data.data_fim ? data.data_fim : undefined,
    status: (data.status as AlunoOficinaStatus) || 'ativo',
    nivelSuporte: data.nivel_suporte || '',
    consideracoesPedagogicas: data.consideracoes_pedagogicas || '',
  }
}

export function subscribeToAlunoOficinas(
  onSuccess: (vinculos: AlunoOficina[]) => void,
  onError: (error: Error) => void
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
      onError(err)
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
// Lança PersistenceError se os vínculos não forem confirmados. Depois disso,
// devolve os alunos cujo resumo de oficinas (campo denormalizado no cadastro
// do aluno) não pôde ser atualizado, com o motivo.
export async function saveAlunosDaOficina(
  turmaOficinaIdValue: string,
  oficinaNome: string,
  selecionados: AlunoOficinaSelecao[],
  existentes: AlunoOficina[],
  userId: string
): Promise<{ resumosNaoAtualizados: { alunoId: string; motivo: string }[] }> {
  const batch = writeBatch(db)
  const hoje = todayISO()
  const idsSelecionados = new Set(selecionados.map((s) => s.alunoId))

  // O vínculo turma-oficina deve existir e a oficina só pode receber alunos da
  // turma à qual o vínculo pertence. Isso evita associar um aluno a uma oficina
  // de outra turma, preservando o histórico sem reescrevê-lo.
  const vinculoSnap = await getDoc(doc(db, TURMA_OFICINAS_COLLECTION, turmaOficinaIdValue))
  if (!vinculoSnap.exists()) {
    throw new Error('O vínculo turma-oficina informado não existe.')
  }
  const turmaDoVinculo = vinculoSnap.data().turma_id

  const alunosForaDaTurma: string[] = []
  for (const sel of selecionados) {
    const alunoSnap = await getDoc(doc(db, ALUNOS_COLLECTION, sel.alunoId))
    if (!alunoSnap.exists() || alunoSnap.data().turma_id !== turmaDoVinculo) {
      alunosForaDaTurma.push(sel.alunoId)
    }
  }
  if (alunosForaDaTurma.length > 0) {
    throw new Error(
      'Não é possível associar aluno(s) a uma oficina de outra turma: ' + alunosForaDaTurma.join(', ')
    )
  }

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

  await confirmWrite('salvar os participantes da oficina', batch.commit())

  // Mantém o resumo de oficinas exibido no perfil do aluno sincronizado
  const novos = selecionados.filter((s) => !ativosAntes.some((e) => e.alunoId === s.alunoId))
  const atualizacoes = [
    ...novos.map((s) => ({ alunoId: s.alunoId, data: { oficinas: arrayUnion(oficinaNome) } })),
    ...removidos.map((e) => ({ alunoId: e.alunoId, data: { oficinas: arrayRemove(oficinaNome) } })),
  ]
  const resultados = await Promise.all(
    atualizacoes.map(async ({ alunoId, data }) => {
      try {
        await confirmWrite('atualizar o resumo de oficinas do aluno', updateDoc(doc(db, ALUNOS_COLLECTION, alunoId), data))
        return null
      } catch (err) {
        console.warn('Resumo de oficinas do aluno não atualizado:', err)
        return { alunoId, motivo: describePersistenceError(err) }
      }
    })
  )
  return { resumosNaoAtualizados: resultados.filter((r): r is { alunoId: string; motivo: string } => r !== null) }
}
