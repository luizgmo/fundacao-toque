import { beforeEach, describe, expect, it, vi } from 'vitest'

const fs = vi.hoisted(() => ({
  existing: new Map<string, Record<string, unknown>>(),
  writes: [] as { op: string; path: string; data: Record<string, unknown> }[],
}))

vi.mock('../lib/firebase', () => ({ db: {}, isFirebaseConfigured: true }))
vi.mock('../lib/demoMode', () => ({
  DEMO_CONTACTS_STORAGE_KEY: 'c',
  DEMO_SESSIONS_STORAGE_KEY: 's',
  isDemoModeEnabled: () => false,
}))
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(),
  doc: (_db: unknown, ...segments: string[]) => ({ id: segments[segments.length - 1], path: segments.join('/') }),
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  query: vi.fn(),
  where: vi.fn(),
  onSnapshot: vi.fn(),
  serverTimestamp: () => 'TS',
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
    const pending: typeof fs.writes = []
    const result = await fn({
      get: async (ref: { path: string }) => {
        const data = fs.existing.get(ref.path)
        return { exists: () => Boolean(data), data: () => data }
      },
      set: (ref: { path: string }, data: Record<string, unknown>) => pending.push({ op: 'set', path: ref.path, data }),
      update: (ref: { path: string }, data: Record<string, unknown>) =>
        pending.push({ op: 'update', path: ref.path, data }),
    })
    fs.writes.push(...pending)
    pending.forEach((w) => fs.existing.set(w.path, { ...(fs.existing.get(w.path) || {}), ...w.data }))
    return result
  },
}))

import { ChamadaConflitoError, saveAttendanceToFirestore } from './attendanceService'

const base = {
  id: '2026-11-10_turma-a_geral',
  date: '2026-11-10',
  turmaId: 'turma-a',
  scope: 'turma' as const,
  registeredBy: 'Pedagogia',
  records: { ana: { status: 'justificado' as const, observation: 'Atestado' } },
  versaoEsperada: null,
}

beforeEach(() => {
  fs.existing.clear()
  fs.writes.length = 0
})

describe('saveAttendanceToFirestore', () => {
  it('cria a sessão com versão 1 e presença/observação individuais', async () => {
    await expect(saveAttendanceToFirestore(base)).resolves.toBe(1)
    expect(fs.writes).toHaveLength(1)
    expect(fs.writes[0]).toMatchObject({
      op: 'set',
      path: 'sessoes_chamada/2026-11-10_turma-a_geral',
      data: {
        escopo: 'turma',
        turma_oficina_id: null,
        presencas: { ana: 'justificado' },
        observacoes: { ana: 'Atestado' },
        versao: 1,
      },
    })
  })

  it('clique repetido com a mesma versão não cria segunda sessão nem sobrescreve', async () => {
    await saveAttendanceToFirestore(base)
    await expect(saveAttendanceToFirestore(base)).rejects.toBeInstanceOf(ChamadaConflitoError)
    expect(fs.writes).toHaveLength(1)
  })

  it('atualiza a sessão carregada incrementando a versão', async () => {
    await saveAttendanceToFirestore(base)
    await expect(saveAttendanceToFirestore({ ...base, versaoEsperada: 1 })).resolves.toBe(2)
    expect(fs.writes[1]).toMatchObject({ op: 'update', data: { versao: 2 } })
    expect(fs.writes[1].data).not.toHaveProperty('criado_em')
  })

  it('recusa salvar sobre versão alterada por outra pessoa', async () => {
    fs.existing.set('sessoes_chamada/2026-11-10_turma-a_geral', { versao: 3, registrado_por: 'Outra pessoa' })
    await expect(saveAttendanceToFirestore({ ...base, versaoEsperada: 2 })).rejects.toThrow(/Outra pessoa/)
    expect(fs.writes).toHaveLength(0)
  })

  it('chamada de oficina grava em outro documento e não toca na chamada geral', async () => {
    await saveAttendanceToFirestore(base)
    await saveAttendanceToFirestore({
      ...base,
      id: '2026-11-10_turma-a_turma-a__oficina-1',
      scope: 'oficina',
      turmaOficinaId: 'turma-a__oficina-1',
      records: { ana: { status: 'ausente', observation: '' } },
    })
    expect(fs.writes.map((w) => w.path)).toEqual([
      'sessoes_chamada/2026-11-10_turma-a_geral',
      'sessoes_chamada/2026-11-10_turma-a_turma-a__oficina-1',
    ])
    expect(fs.existing.get('sessoes_chamada/2026-11-10_turma-a_geral')).toMatchObject({ presencas: { ana: 'justificado' } })
  })

  it('recusa ID que não corresponde ao contexto', async () => {
    await expect(saveAttendanceToFirestore({ ...base, id: '2026-11-10_turma-a_outro' })).rejects.toThrow(/não corresponde/)
    expect(fs.writes).toHaveLength(0)
  })
})
