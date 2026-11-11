import { beforeEach, describe, expect, it, vi } from 'vitest'

// Simula o SDK do Firestore para inspecionar o que seria gravado.
const fs = vi.hoisted(() => {
  const state = {
    existing: new Map<string, Record<string, unknown>>(),
    txWrites: [] as { op: string; path: string; data: Record<string, unknown> }[],
    batchWrites: [] as { op: string; path: string; data: Record<string, unknown> }[],
  }
  return { state }
})

vi.mock('../lib/firebase', () => ({ db: {}, isFirebaseConfigured: true }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  doc: (_db: unknown, ...segments: string[]) => ({ id: segments[segments.length - 1], path: segments.join('/') }),
  onSnapshot: vi.fn(),
  serverTimestamp: () => 'TS',
  updateDoc: vi.fn(async () => undefined),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
  setDoc: vi.fn(async () => undefined),
  runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) =>
    fn({
      get: async (ref: { path: string }) => {
        const data = fs.state.existing.get(ref.path)
        return { exists: () => Boolean(data), data: () => data }
      },
      set: (ref: { path: string }, data: Record<string, unknown>) => fs.state.txWrites.push({ op: 'set', path: ref.path, data }),
      update: (ref: { path: string }, data: Record<string, unknown>) =>
        fs.state.txWrites.push({ op: 'update', path: ref.path, data }),
    }),
  writeBatch: () => ({
    set: (ref: { path: string }, data: Record<string, unknown>) => fs.state.batchWrites.push({ op: 'set', path: ref.path, data }),
    update: (ref: { path: string }, data: Record<string, unknown>) =>
      fs.state.batchWrites.push({ op: 'update', path: ref.path, data }),
    commit: async () => undefined,
  }),
}))

import { inactivateOficina, salvarVinculo, VinculoInvalidoError } from './oficinasService'
import { inactivateTurma } from './turmasService'
import type { TurmaOficina } from '../types/oficinas'

const input = {
  turmaId: 'turma-a',
  oficinaId: 'oficina-1',
  idsUsuariosResponsaveis: ['u1', 'u1', 'u2'],
  horarios: [
    { diaSemana: 3, horaInicio: '10:00', horaFim: '11:00', validoAte: '2026-12-31' },
    { diaSemana: 1, horaInicio: '08:00', horaFim: '09:00' },
  ],
}

const vinculo = (extra: Partial<TurmaOficina> = {}): TurmaOficina => ({
  id: 'turma-a__oficina-1',
  turmaId: 'turma-a',
  oficinaId: 'oficina-1',
  idsUsuariosResponsaveis: ['u1'],
  ativo: true,
  horarios: [],
  ...extra,
})

beforeEach(() => {
  fs.state.existing.clear()
  fs.state.txWrites.length = 0
  fs.state.batchWrites.length = 0
})

describe('salvarVinculo', () => {
  it('cria com ID determinístico e grava horários no formato da modelagem', async () => {
    await expect(salvarVinculo(input, [], 'user-1')).resolves.toEqual({ id: 'turma-a__oficina-1', acao: 'criado' })
    expect(fs.state.txWrites).toHaveLength(1)
    const [write] = fs.state.txWrites
    expect(write.op).toBe('set')
    expect(write.path).toBe('turma_oficinas/turma-a__oficina-1')
    expect(write.data).toMatchObject({
      turma_id: 'turma-a',
      oficina_id: 'oficina-1',
      ativo: true,
      ids_usuarios_responsaveis: ['u1', 'u2'],
      horarios: [
        { dia_semana: 1, hora_inicio: '08:00', hora_fim: '09:00' },
        { dia_semana: 3, hora_inicio: '10:00', hora_fim: '11:00', valido_ate: '2026-12-31' },
      ],
      criado_por: 'user-1',
    })
  })

  it('reativa o vínculo inativo existente em vez de criar outro (mesmo com ID legado)', async () => {
    fs.state.existing.set('turma_oficinas/seed-cw-1', { ativo: false })
    const existentes = [vinculo({ id: 'seed-cw-1', ativo: false })]
    await expect(salvarVinculo(input, existentes, 'user-1')).resolves.toEqual({ id: 'seed-cw-1', acao: 'reativado' })
    expect(fs.state.txWrites).toEqual([
      expect.objectContaining({ op: 'update', path: 'turma_oficinas/seed-cw-1' }),
    ])
    expect(fs.state.txWrites[0].data).toMatchObject({ ativo: true, inativado_em: null })
    expect(fs.state.txWrites[0].data).not.toHaveProperty('criado_em')
  })

  it('se outra pessoa criou o par no meio-tempo, atualiza em vez de sobrescrever', async () => {
    fs.state.existing.set('turma_oficinas/turma-a__oficina-1', { ativo: true })
    await expect(salvarVinculo(input, [], 'user-1')).resolves.toMatchObject({ acao: 'atualizado' })
    expect(fs.state.txWrites[0].op).toBe('update')
  })

  it('não grava nada com horário inválido', async () => {
    await expect(
      salvarVinculo({ ...input, horarios: [{ diaSemana: 8, horaInicio: '08:00', horaFim: '09:00' }] }, [], 'u')
    ).rejects.toBeInstanceOf(VinculoInvalidoError)
    await expect(salvarVinculo({ ...input, idsUsuariosResponsaveis: [] }, [], 'u')).rejects.toBeInstanceOf(
      VinculoInvalidoError
    )
    expect(fs.state.txWrites).toHaveLength(0)
  })
})

describe('inativar turma/oficina inativa os vínculos ativos no mesmo batch', () => {
  const vinculos = [
    vinculo(),
    vinculo({ id: 'turma-a__oficina-2', oficinaId: 'oficina-2' }),
    vinculo({ id: 'turma-b__oficina-1', turmaId: 'turma-b' }),
    vinculo({ id: 'turma-a__oficina-3', oficinaId: 'oficina-3', ativo: false }),
  ]

  it('turma', async () => {
    await inactivateTurma('turma-a', vinculos, 'u')
    expect(fs.state.batchWrites.map((w) => w.path)).toEqual([
      'turmas/turma-a',
      'turma_oficinas/turma-a__oficina-1',
      'turma_oficinas/turma-a__oficina-2',
    ])
    expect(fs.state.batchWrites[1].data).toMatchObject({ ativo: false, inativado_por: 'u' })
  })

  it('oficina', async () => {
    await inactivateOficina('oficina-1', vinculos, 'u')
    expect(fs.state.batchWrites.map((w) => w.path)).toEqual([
      'oficinas/oficina-1',
      'turma_oficinas/turma-a__oficina-1',
      'turma_oficinas/turma-b__oficina-1',
    ])
  })
})
