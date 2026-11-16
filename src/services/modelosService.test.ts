import { describe, expect, it, vi } from 'vitest'

const firestore = vi.hoisted(() => ({ getDocs: vi.fn() }))
vi.mock('../lib/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', async (importOriginal) => ({
  ...await importOriginal<typeof import('firebase/firestore')>(),
  collection: () => ({ path: 'modelos_formulario' }),
  orderBy: (field: string, direction: string) => ({ field, direction }),
  query: (ref: unknown, ...constraints: unknown[]) => ({ ref, constraints }),
  getDocs: firestore.getDocs,
}))

import { listarModelos, listarModelosAtivos } from './modelosService'

describe('modelos disponíveis no relatório', () => {
  it('carrega modelos ativos sem depender de índice composto e mantém a ordem das versões', async () => {
    firestore.getDocs.mockImplementation(async (consulta) => {
      if (consulta.constraints.length > 1) {
        throw new Error('failed-precondition: The query requires an index')
      }
      return { docs: [
        { id: 'inativo', data: () => ({ nome: 'Antigo', versao: 3, ativo: false }) },
        { id: 'ativo', data: () => ({ nome: 'Avaliação', versao: 2, ativo: true }) },
        { id: 'legado', data: () => ({ nome: 'Legado', versao: 1 }) },
      ] }
    })

    const ativos = await listarModelosAtivos()
    const todos = await listarModelos()

    expect(ativos.map((modelo) => modelo.id)).toEqual(['ativo', 'legado'])
    expect(todos.map((modelo) => modelo.id)).toEqual(['inativo', 'ativo', 'legado'])
  })

  it('propaga falhas de leitura para que a tela possa exibir o erro', async () => {
    firestore.getDocs.mockRejectedValueOnce(new Error('permission-denied'))
    await expect(listarModelosAtivos()).rejects.toThrow('permission-denied')
  })
})
