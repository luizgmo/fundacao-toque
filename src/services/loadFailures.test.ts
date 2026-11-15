import { beforeEach, describe, expect, it, vi } from 'vitest'

// Simula o SDK do Firestore para provocar falhas de leitura (permissão / rede).
const firestore = vi.hoisted(() => ({
  getDocs: vi.fn(),
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
}))

vi.mock('../lib/firebase', () => ({ db: {}, isFirebaseConfigured: true }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  doc: (_db: unknown, ...segments: string[]) => ({ id: segments[segments.length - 1], path: segments.join('/') }),
  query: (ref: { path: string }, ...constraints: unknown[]) => ({ path: ref.path, constraints }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: vi.fn(),
  limit: vi.fn(),
  getDocs: firestore.getDocs,
  getDoc: firestore.getDoc,
  onSnapshot: firestore.onSnapshot,
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
  serverTimestamp: vi.fn(),
  increment: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
}))

import { getDashboardMetrics, getTarefasDeHoje, getUltimasAtualizacoes, getAlunosFaltasRecorrentes } from './dashboardService'
import { subscribeToTurmas } from './turmasService'
import { subscribeToOficinas, subscribeToTurmaOficinas, subscribeToAlunoOficinas } from './oficinasService'
import { subscribeToUsuarios } from './usuariosService'
import { subscribeToRegistrosAtividade } from './activitiesService'
import { subscribeToStudents, getStudentById } from './studentsService'
import { getAttendanceFromFirestore, subscribeStudentOccurrences } from './attendanceService'
import { describeLoadError } from '../lib/persistence'

const permissionDenied = () =>
  Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })
const networkError = () => Object.assign(new Error('offline'), { code: 'unavailable' })
const snapshot = (size: number) => ({ size, docs: [], forEach: () => undefined })

beforeEach(() => {
  vi.clearAllMocks()
})

describe('dashboard: falha de consulta nunca vira zero', () => {
  it('métrica que falha volta como erro; as demais mantêm o valor', async () => {
    firestore.getDocs.mockImplementation(async (q: { path: string }) => {
      if (q.path === 'turmas') throw permissionDenied()
      if (q.path === 'sessoes_chamada') return snapshot(0)
      return snapshot(4)
    })
    const metrics = await getDashboardMetrics()
    expect(metrics.alunosAtivos).toEqual({ ok: true, valor: 4 })
    expect(metrics.turmasAtivas.ok).toBe(false)
    expect(metrics.oficinasAtivas).toEqual({ ok: true, valor: 4 })
    // Consulta funcionou mas não há presenças: percentual null (sem dados), não erro.
    expect(metrics.frequenciaMedia.ok).toBe(true)
    expect(metrics.frequenciaMedia.ok && metrics.frequenciaMedia.valor).toMatchObject({
      percentual: null,
      registros: 0,
      sessoes: 0,
    })
  })

  it('frequência média que falha é erro, não "sem dados"', async () => {
    firestore.getDocs.mockImplementation(async (q: { path: string }) => {
      if (q.path === 'sessoes_chamada') throw networkError()
      return snapshot(1)
    })
    const metrics = await getDashboardMetrics()
    expect(metrics.frequenciaMedia.ok).toBe(false)
  })

  it('tarefa cuja verificação falha fica "não verificada" (feito: null)', async () => {
    firestore.getDocs.mockImplementation(async (q: { path: string }) => {
      if (q.path === 'registros_atividade') throw networkError()
      return snapshot(2)
    })
    const tarefas = await getTarefasDeHoje()
    expect(tarefas.map((t) => t.feito)).toEqual([true, null, true])
    expect(tarefas[1].titulo).toContain('não foi possível verificar')
  })

  it('faltas recorrentes propagam o erro em vez de devolver lista vazia', async () => {
    firestore.getDocs.mockRejectedValue(permissionDenied())
    await expect(getAlunosFaltasRecorrentes()).rejects.toMatchObject({ code: 'permission-denied' })
  })

  it('últimas atualizações informam fontes com falha e lançam se todas falharem', async () => {
    firestore.getDocs.mockImplementation(async (q: { path: string }) => {
      if (q.path === 'sessoes_chamada') throw networkError()
      return snapshot(0)
    })
    await expect(getUltimasAtualizacoes()).resolves.toEqual({ items: [], fontesComFalha: ['chamadas'] })

    firestore.getDocs.mockRejectedValue(networkError())
    await expect(getUltimasAtualizacoes()).rejects.toMatchObject({ code: 'unavailable' })
  })
})

describe('assinaturas: erro chega pelo onError, nunca como lista vazia', () => {
  const subscriptions: [string, (ok: (d: unknown[]) => void, err: (e: Error) => void) => unknown][] = [
    ['turmas', (ok, err) => subscribeToTurmas(ok, err)],
    ['oficinas', (ok, err) => subscribeToOficinas(ok, err)],
    ['turma_oficinas', (ok, err) => subscribeToTurmaOficinas(ok, err)],
    ['aluno_oficinas', (ok, err) => subscribeToAlunoOficinas(ok, err)],
    ['usuarios', (ok, err) => subscribeToUsuarios(ok, err)],
    ['registros_atividade', (ok, err) => subscribeToRegistrosAtividade(ok, err)],
    ['alunos', (ok, err) => subscribeToStudents(ok, err)],
    ['contatos_familia', (ok, err) => subscribeStudentOccurrences('aluno-1', ok, err)],
  ]

  it.each(subscriptions)('%s', (_name, subscribe) => {
    firestore.onSnapshot.mockImplementation((_q, _next, onError: (e: Error) => void) => {
      onError(permissionDenied())
      return () => undefined
    })
    const onData = vi.fn()
    const onError = vi.fn()
    subscribe(onData, onError)
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onData).not.toHaveBeenCalled()
  })
})

describe('leituras pontuais: null só quando o documento não existe', () => {
  it('getAttendanceFromFirestore propaga erro de rede', async () => {
    firestore.getDoc.mockRejectedValueOnce(networkError())
    await expect(getAttendanceFromFirestore('2026-11-10_turma-a_geral')).rejects.toMatchObject({
      code: 'unavailable',
    })
  })

  it('getAttendanceFromFirestore devolve null quando a chamada não existe', async () => {
    firestore.getDoc.mockResolvedValueOnce({ exists: () => false })
    await expect(getAttendanceFromFirestore('2026-11-10_turma-a_geral')).resolves.toBeNull()
  })

  it('getStudentById propaga erro de permissão (não vira "aluno não encontrado")', async () => {
    firestore.getDoc.mockRejectedValueOnce(permissionDenied())
    await expect(getStudentById('aluno-1')).rejects.toMatchObject({ code: 'permission-denied' })
  })
})

describe('describeLoadError', () => {
  it('reconhece o código de erros embrulhados pelos serviços', () => {
    const wrapped = new Error('Não foi possível carregar as turmas.', { cause: permissionDenied() })
    expect(describeLoadError(wrapped)).toBe('sem permissão para consultar esses dados')
  })
})
