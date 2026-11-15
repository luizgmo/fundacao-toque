import { beforeEach, describe, expect, it, vi } from 'vitest'

const firestore = vi.hoisted(() => ({
  getDoc: vi.fn(),
  setDoc: vi.fn(),
  doc: vi.fn((_base: unknown, ...segments: string[]) => ({ path: segments.join('/') })),
  serverTimestamp: vi.fn(() => 'SERVER_TS'),
  Timestamp: {
    fromDate: vi.fn((date: Date) => ({ toDate: () => date })),
  },
}))

const storage = vi.hoisted(() => ({
  ref: vi.fn((_base: unknown, path: string) => ({ path })),
  uploadBytes: vi.fn(),
  deleteObject: vi.fn(),
  getDownloadURL: vi.fn(),
}))

const demoMode = vi.hoisted(() => ({
  isDemoModeEnabled: vi.fn(() => false),
}))

vi.mock('../lib/firebase', () => ({ db: {}, storage: {} }))
vi.mock('../lib/demoMode', () => demoMode)
vi.mock('firebase/firestore', () => firestore)
vi.mock('firebase/storage', () => storage)

import {
  getFichaMedica,
  salvarFichaMedica,
  uploadAnexoFichaMedica,
} from './medicalService'

const permissionDenied = () =>
  Object.assign(new Error('Missing or insufficient permissions.'), {
    code: 'permission-denied',
  })

const fichaBase = {
  tiposDeficiencia: ['TEA'],
  codigosCid: ['F84.0'],
}

beforeEach(() => {
  vi.clearAllMocks()
  demoMode.isDemoModeEnabled.mockReturnValue(false)
  firestore.getDoc.mockResolvedValue({ exists: () => false })
  firestore.setDoc.mockResolvedValue(undefined)
  storage.uploadBytes.mockResolvedValue(undefined)
  storage.deleteObject.mockResolvedValue(undefined)
})

describe('getFichaMedica', () => {
  it('lê somente o caminho canônico e devolve null quando o documento não existe', async () => {
    await expect(getFichaMedica('aluno-1')).resolves.toBeNull()
    expect(firestore.getDoc).toHaveBeenCalledWith({
      path: 'alunos/aluno-1/ficha_medica/ficha',
    })
  })

  it('propaga permission-denied em vez de tratar como ficha vazia', async () => {
    firestore.getDoc.mockRejectedValueOnce(permissionDenied())
    await expect(getFichaMedica('aluno-1')).rejects.toMatchObject({
      code: 'permission-denied',
    })
  })
})

describe('salvarFichaMedica', () => {
  it('grava o formulário digital em snake_case, sem conteúdo binário', async () => {
    const salva = await salvarFichaMedica(
      'aluno-1',
      {
        ...fichaBase,
        formatoFichaMedica: 'digital',
        dadosFichaMedica: {
          alergias: 'Nenhuma',
          contatoEmergenciaNome: 'Maria',
        },
      },
      'usuario-1'
    )

    expect(salva.formatoFichaMedica).toBe('digital')
    expect(firestore.setDoc).toHaveBeenCalledTimes(1)
    const payload = firestore.setDoc.mock.calls[0][1]
    expect(payload).toMatchObject({
      tipos_deficiencia: ['TEA'],
      codigos_cid: ['F84.0'],
      formato_ficha_medica: 'digital',
      dados_ficha_medica: {
        alergias: 'Nenhuma',
        contato_emergencia_nome: 'Maria',
      },
      anexo_caminho_storage: null,
      atualizado_por: 'usuario-1',
    })
    expect(JSON.stringify(payload)).not.toContain('data:')
  })

  it('envia o anexo ao Storage e grava apenas metadados no Firestore', async () => {
    const arquivo = new File([new Uint8Array([1, 2, 3])], 'ficha.pdf', {
      type: 'application/pdf',
    })

    await salvarFichaMedica(
      'aluno-1',
      {
        ...fichaBase,
        formatoFichaMedica: 'anexo',
        anexo: null,
        novoAnexo: arquivo,
      },
      'usuario-1'
    )

    expect(storage.uploadBytes).toHaveBeenCalledTimes(1)
    const payload = firestore.setDoc.mock.calls[0][1]
    expect(payload.anexo_caminho_storage).toMatch(
      /^alunos\/aluno-1\/ficha_medica\/\d+-ficha\.pdf$/
    )
    expect(payload.anexo_nome_arquivo).toBe('ficha.pdf')
    expect(payload.anexo_tipo_conteudo).toBe('application/pdf')
    expect(payload.anexo_tamanho_bytes).toBe(3)
    expect(JSON.stringify(payload)).not.toContain('data:')
  })

  it('remove o anexo anterior ao trocar o formato para digital', async () => {
    const anexoAnterior = {
      caminhoStorage: 'alunos/aluno-1/ficha_medica/old-ficha.pdf',
      nomeArquivo: 'old-ficha.pdf',
      tipoConteudo: 'application/pdf',
      tamanhoBytes: 10,
    }

    const salva = await salvarFichaMedica(
      'aluno-1',
      {
        ...fichaBase,
        formatoFichaMedica: 'digital',
        anexo: anexoAnterior,
        removerAnexo: true,
      },
      'usuario-1'
    )

    expect(salva.anexo).toBeNull()
    expect(storage.deleteObject).toHaveBeenCalledTimes(1)
    expect(storage.deleteObject.mock.calls[0][0].path).toBe(
      'alunos/aluno-1/ficha_medica/old-ficha.pdf'
    )
    expect(firestore.setDoc.mock.calls[0][1]).toMatchObject({
      formato_ficha_medica: 'digital',
      anexo_caminho_storage: null,
      anexo_nome_arquivo: null,
    })
  })

  it('remove o anexo recém-enviado quando a gravação no Firestore falha', async () => {
    firestore.setDoc.mockRejectedValueOnce(permissionDenied())
    const arquivo = new File([new Uint8Array([1])], 'ficha.pdf', {
      type: 'application/pdf',
    })

    await expect(
      salvarFichaMedica(
        'aluno-1',
        {
          ...fichaBase,
          formatoFichaMedica: 'anexo',
          anexo: null,
          novoAnexo: arquivo,
        },
        'usuario-1'
      )
    ).rejects.toMatchObject({ code: 'permission-denied' })

    expect(storage.deleteObject).toHaveBeenCalledTimes(1)
    expect(storage.deleteObject.mock.calls[0][0].path).toMatch(
      /^alunos\/aluno-1\/ficha_medica\/\d+-ficha\.pdf$/
    )
  })

  it('propaga permission-denied ao salvar, sem confirmar sucesso', async () => {
    firestore.setDoc.mockRejectedValueOnce(permissionDenied())
    await expect(
      salvarFichaMedica(
        'aluno-1',
        { ...fichaBase, formatoFichaMedica: 'digital' },
        'usuario-1'
      )
    ).rejects.toMatchObject({
      code: 'permission-denied',
      operation: 'salvar ficha médica',
    })
  })
})

describe('uploadAnexoFichaMedica', () => {
  it('rejeita tipo não permitido antes de tocar no Storage', async () => {
    const arquivo = new File([new Uint8Array([1])], 'ficha.gif', {
      type: 'image/gif',
    })
    await expect(uploadAnexoFichaMedica('aluno-1', arquivo, 'usuario-1')).rejects.toThrow(
      'PDF, JPG, PNG ou WEBP'
    )
    expect(storage.uploadBytes).not.toHaveBeenCalled()
  })
})
