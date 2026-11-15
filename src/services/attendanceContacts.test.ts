import { beforeEach, describe, expect, it, vi } from 'vitest'

const firestore = vi.hoisted(() => ({
  onSnapshot: vi.fn(),
  collection: vi.fn((_db: unknown, name: string) => ({ path: name })),
  query: vi.fn((ref: unknown, ...constraints: unknown[]) => ({ ref, constraints })),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  orderBy: vi.fn((field: string, direction: string) => ({ field, direction })),
}))

vi.mock('../lib/firebase', () => ({ db: {}, storage: {} }))
vi.mock('../lib/demoMode', () => ({ isDemoModeEnabled: () => false }))
vi.mock('firebase/firestore', () => firestore)

import { subscribeStudentOccurrences } from './attendanceService'

beforeEach(() => {
  vi.clearAllMocks()
})

describe('subscribeStudentOccurrences', () => {
  it('mapeia o contrato de contatos_familia para a interface do aluno', () => {
    const cancelar = vi.fn()
    const dataContato = new Date('2026-11-15T18:30:00.000Z')
    firestore.onSnapshot.mockImplementation((_query, onData) => {
      onData({
        forEach: (callback: (doc: unknown) => void) => {
          callback({
            id: 'contato-1',
            data: () => ({
              aluno_id: 'aluno-1',
              datas_faltas_relacionadas: ['2026-11-10', '2026-11-11'],
              contatado_em: { toDate: () => dataContato },
              meio_contato: 'whatsapp',
              usuario_responsavel_nome: 'Pedagoga Teste',
              motivo_ocorrencia: 'Ausência recorrente',
              status_ocorrencia: 'Aberta / Em acompanhamento',
              observacoes: 'Família respondeu.',
              responsavel_id: 'responsavel-1',
              responsavel_snapshot: {
                nome: 'Maria Teste',
                parentesco: 'Mãe',
                contato: '(11) 99999-9999',
              },
            }),
          })
        },
      })
      return cancelar
    })
    const onData = vi.fn()

    const unsubscribe = subscribeStudentOccurrences('aluno-1', onData, vi.fn())

    expect(onData).toHaveBeenCalledWith([
      expect.objectContaining({
        id: 'contato-1',
        faltaDate: '2026-11-10, 2026-11-11',
        type: 'whatsapp',
        responsible: 'Pedagoga Teste',
        reason: 'Ausência recorrente',
        status: 'Aberta / Em acompanhamento',
        note: 'Família respondeu.',
        guardianId: 'responsavel-1',
        guardianName: 'Maria Teste',
        guardianRelationship: 'Mãe',
        guardianContact: '(11) 99999-9999',
      }),
    ])
    expect(onData.mock.calls[0][0][0].contactDate).toContain('2026')
    expect(unsubscribe).toBe(cancelar)
    expect(firestore.where).toHaveBeenCalledWith('aluno_id', '==', 'aluno-1')
    expect(firestore.orderBy).toHaveBeenCalledWith('contatado_em', 'desc')
  })
})
