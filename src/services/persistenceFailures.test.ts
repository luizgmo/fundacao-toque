import { beforeEach, describe, expect, it, vi } from 'vitest'

// Simula o SDK do Firestore para provocar falhas de permissão e de rede.
const firestore = vi.hoisted(() => ({
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  getDocs: vi.fn(),
  commit: vi.fn(),
}))

vi.mock('../lib/firebase', () => ({ db: {}, isFirebaseConfigured: true }))
vi.mock('firebase/firestore', () => {
  let counter = 0
  const ref = (path: string) => ({ id: `auto-${++counter}`, path })
  return {
    collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
    doc: (base: { path?: string } | unknown, ...segments: string[]) => {
      if (segments.length === 0) return ref(`${(base as { path: string }).path}/auto-${counter + 1}`)
      return { id: segments[segments.length - 1], path: segments.join('/') }
    },
    setDoc: firestore.setDoc,
    updateDoc: firestore.updateDoc,
    deleteDoc: firestore.deleteDoc,
    getDocs: firestore.getDocs,
    getDoc: vi.fn(),
    writeBatch: () => ({ set: vi.fn(), update: vi.fn(), commit: firestore.commit }),
    serverTimestamp: () => 'ts',
    increment: (n: number) => ({ increment: n }),
    query: vi.fn(),
    where: vi.fn(),
    orderBy: vi.fn(),
    limit: vi.fn(),
    onSnapshot: vi.fn(),
    arrayUnion: vi.fn(),
    arrayRemove: vi.fn(),
  }
})

import { saveOccurrenceToFirestore } from './attendanceService'
import { createStudent, uploadDocumento } from './studentsService'
import { PersistenceError } from '../lib/persistence'

const permissionDenied = () =>
  Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' })
const networkError = () => Object.assign(new Error('Failed to get document'), { code: 'unavailable' })


beforeEach(() => {
  vi.clearAllMocks()
  firestore.setDoc.mockResolvedValue(undefined)
  firestore.updateDoc.mockResolvedValue(undefined)
  firestore.deleteDoc.mockResolvedValue(undefined)
  firestore.getDocs.mockResolvedValue({ docs: [] })
  firestore.commit.mockResolvedValue(undefined)
})

describe('saveOccurrenceToFirestore', () => {
  it('propaga erro de rede em vez de devolver ID', async () => {
    firestore.setDoc.mockRejectedValueOnce(networkError())
    const input = {
      studentId: 'aluno-1',
      studentName: 'Aluno',
      faltaDate: '10/11/2026',
      type: 'WhatsApp',
      responsible: 'Prof',
      reason: 'Falta',
      status: 'Aberta',
      note: '',
      guardianId: 'g1',
      guardianSnapshot: { nome: 'Mãe', parentesco: 'Mãe', canal: 'WhatsApp', contato: '1' },
    }
    await expect(saveOccurrenceToFirestore(input, 'contato-fixo')).rejects.toMatchObject({
      code: 'unavailable',
    })
  })
})

describe('studentsService', () => {
  const alunoInput = {
    nome: 'Aluno Teste',
    nascimento: '2015-01-01',
    sexo: 'F',
    deficiencia: '',
    cid: '',
    observacoes: '',
    responsavelNome: 'Mãe',
    parentesco: 'Mãe',
    telefonePrincipal: '119999',
    turmas: [],
    oficinas: [],
  }

  it('createStudent não devolve ID quando o batch é recusado', async () => {
    firestore.commit.mockRejectedValueOnce(permissionDenied())
    await expect(createStudent(alunoInput)).rejects.toMatchObject({
      code: 'permission-denied',
      operation: 'cadastrar o aluno',
    })
  })

  it('createStudent usa o ID reservado pela tela', async () => {
    await expect(createStudent({ ...alunoInput, id: 'aluno-reservado' })).resolves.toBe('aluno-reservado')
  })

  it('uploadDocumento falha sem apresentar cópia local como salva', async () => {
    class FakeFileReader {
      result: string | null = null
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      readAsDataURL() {
        this.result = 'data:application/pdf;base64,AQ=='
        queueMicrotask(() => this.onload?.())
      }
    }
    const setItem = vi.fn()
    vi.stubGlobal('FileReader', FakeFileReader)
    vi.stubGlobal('localStorage', { getItem: () => null, setItem, removeItem: vi.fn() })
    try {
      firestore.setDoc.mockRejectedValueOnce(networkError())
      const pdf = new File([new Uint8Array([1])], 'ficha.pdf', { type: 'application/pdf' })
      await expect(uploadDocumento('aluno-1', pdf, 'ficha_medica', 'u1')).rejects.toBeInstanceOf(
        PersistenceError
      )
      expect(setItem).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
