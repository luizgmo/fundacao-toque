import { beforeEach, describe, expect, it, vi } from 'vitest'

const firestore = vi.hoisted(() => ({
  collection: vi.fn((_db: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  doc: vi.fn((base: { path: string }, ...segments: string[]) => ({
    id: segments.length > 0 ? segments[segments.length - 1] : 'evo-1',
    path: [...(segments.length > 0 ? [] : [base.path]), ...segments, ...(segments.length > 0 ? [] : ['evo-1'])].join('/'),
  })),
  getDocs: vi.fn(),
  setDoc: vi.fn(),
  query: vi.fn((ref: { path: string }, ...constraints: unknown[]) => ({
    path: ref.path,
    constraints,
  })),
  where: vi.fn((field: string, op: string, value: unknown) => ({ field, op, value })),
  orderBy: vi.fn((field: string, direction: string) => ({ field, direction })),
  limit: vi.fn((value: number) => ({ limit: value })),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
}))

const demoMode = vi.hoisted(() => ({
  DEMO_EVOLUTION_STORAGE_KEY: 'ft_demo_evolution',
  isDemoModeEnabled: vi.fn(() => false),
}))

vi.mock('../lib/firebase', () => ({ db: {} }))
vi.mock('../lib/demoMode', () => demoMode)
vi.mock('firebase/firestore', () => firestore)

import {
  criarEvolucao,
  listarEvolucao,
  listarEvolucaoAluno,
  validarEvolucao,
} from './evolutionService'

const permissionDenied = () =>
  Object.assign(new Error('Missing or insufficient permissions.'), {
    code: 'permission-denied',
  })

const inputValido = {
  alunoId: 'aluno-1',
  dataRegistro: '2026-11-13',
  profissionalUsuarioId: 'pedagogia-1',
  profissionalNome: 'Pedagoga Teste',
  area: 'social' as const,
  observacao: 'Interagiu melhor com os colegas.',
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.unstubAllGlobals()
  demoMode.isDemoModeEnabled.mockReturnValue(false)
  firestore.setDoc.mockResolvedValue(undefined)
  firestore.getDocs.mockResolvedValue({ docs: [] })
})

describe('validarEvolucao', () => {
  it('aceita um registro completo', () => {
    expect(validarEvolucao(inputValido)).toBeNull()
  })

  it('rejeita data impossível, área desconhecida e observação vazia', () => {
    expect(validarEvolucao({ ...inputValido, dataRegistro: '2026-02-30' })).toMatch(
      /data de registro válida/
    )
    expect(
      validarEvolucao({ ...inputValido, area: 'inexistente' as typeof inputValido.area })
    ).toMatch(/área de desenvolvimento válida/)
    expect(validarEvolucao({ ...inputValido, observacao: '   ' })).toMatch(
      /Informe a observação/
    )
  })

  it('rejeita profissional sem identificação', () => {
    expect(
      validarEvolucao({ ...inputValido, profissionalUsuarioId: '' })
    ).toMatch(/profissional responsável/)
    expect(validarEvolucao({ ...inputValido, profissionalNome: '' })).toMatch(
      /nome do profissional/
    )
  })
})

describe('criarEvolucao', () => {
  it('grava snake_case, autoria e timestamps, sem conteúdo binário', async () => {
    const registro = await criarEvolucao(inputValido)

    expect(registro.id).toBe('evo-1')
    expect(registro.criadoEm).toBeTruthy()
    expect(firestore.setDoc).toHaveBeenCalledTimes(1)
    const payload = firestore.setDoc.mock.calls[0][1]
    expect(payload).toEqual({
      aluno_id: 'aluno-1',
      data_registro: '2026-11-13',
      profissional_usuario_id: 'pedagogia-1',
      profissional_nome: 'Pedagoga Teste',
      area: 'social',
      observacao: 'Interagiu melhor com os colegas.',
      criado_por: 'pedagogia-1',
      criado_em: 'SERVER_TS',
      atualizado_por: 'pedagogia-1',
      atualizado_em: 'SERVER_TS',
    })
    expect(JSON.stringify(payload)).not.toContain('data:')
  })

  it('propaga permission-denied e não devolve registro criado', async () => {
    firestore.setDoc.mockRejectedValueOnce(permissionDenied())
    await expect(criarEvolucao(inputValido)).rejects.toMatchObject({
      code: 'permission-denied',
      operation: 'registrar a evolução do aluno',
    })
  })

  it('persiste no modo demonstração e permite nova leitura', async () => {
    const stored = new Map<string, string>()
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => stored.get(key) ?? null,
      setItem: (key: string, value: string) => stored.set(key, value),
      removeItem: (key: string) => stored.delete(key),
    })
    demoMode.isDemoModeEnabled.mockReturnValue(true)

    const registro = await criarEvolucao(inputValido)
    const lista = await listarEvolucaoAluno('aluno-1')

    expect(lista).toHaveLength(1)
    expect(lista[0]).toMatchObject({
      id: registro.id,
      alunoId: 'aluno-1',
      profissionalNome: 'Pedagoga Teste',
      area: 'social',
    })
  })
})

describe('listarEvolucaoAluno', () => {
  it('consulta as evoluções mais recentes antes de aplicar o limite', async () => {
    await listarEvolucao()
    await listarEvolucaoAluno('aluno-1')

    expect(firestore.orderBy).toHaveBeenCalledWith('data_registro', 'desc')
    expect(firestore.limit).toHaveBeenCalledWith(500)
    expect(firestore.limit).toHaveBeenCalledWith(200)
  })

  it('ordena por data e autor mais recente', async () => {
    firestore.getDocs.mockResolvedValueOnce({
      docs: [
        {
          id: 'antigo',
          data: () => ({
            aluno_id: 'aluno-1',
            data_registro: '2026-09-01',
            profissional_usuario_id: 'u1',
            profissional_nome: 'Profissional 1',
            area: 'social',
            observacao: 'Antigo',
            criado_por: 'u1',
            criado_em: '2026-09-01T10:00:00.000Z',
            atualizado_por: 'u1',
            atualizado_em: '2026-09-01T10:00:00.000Z',
          }),
        },
        {
          id: 'novo',
          data: () => ({
            aluno_id: 'aluno-1',
            data_registro: '2026-11-13',
            profissional_usuario_id: 'u2',
            profissional_nome: 'Profissional 2',
            area: 'cognitiva',
            observacao: 'Novo',
            criado_por: 'u2',
            criado_em: '2026-11-13T10:00:00.000Z',
            atualizado_por: 'u2',
            atualizado_em: '2026-11-13T10:00:00.000Z',
          }),
        },
      ],
    })

    const lista = await listarEvolucaoAluno('aluno-1')
    expect(lista.map((item) => item.id)).toEqual(['novo', 'antigo'])
  })

  it('propaga permission-denied em vez de devolver lista vazia', async () => {
    firestore.getDocs.mockRejectedValueOnce(permissionDenied())
    await expect(listarEvolucaoAluno('aluno-1')).rejects.toMatchObject({
      code: 'permission-denied',
    })
  })
})
