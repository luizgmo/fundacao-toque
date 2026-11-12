import { beforeEach, describe, expect, it, vi } from 'vitest'

// Firestore falso com estado: guarda documentos por caminho e permite injetar
// falhas por operação/caminho, para simular rede caindo no meio do envio.
const fake = vi.hoisted(() => {
  const docs = new Map<string, Record<string, unknown>>()
  let falhar: (op: string, path: string) => Error | undefined = () => undefined
  let auto = 0
  const apply = (path: string, data: Record<string, unknown>, merge: boolean) => {
    const base = merge ? { ...(docs.get(path) || {}) } : {}
    for (const [k, v] of Object.entries(data)) {
      if (v && typeof v === 'object' && '__inc' in (v as object)) {
        base[k] = Number(base[k] ?? 0) + (v as { __inc: number }).__inc
      } else base[k] = v
    }
    docs.set(path, base)
  }
  const check = (op: string, path: string) => {
    const err = falhar(op, path)
    if (err) throw err
  }
  return {
    docs,
    setFalhar: (fn: typeof falhar) => (falhar = fn),
    reset: () => {
      docs.clear()
      falhar = () => undefined
    },
    nextId: () => `auto${++auto}`,
    apply,
    check,
  }
})

const unavailable = () => Object.assign(new Error('offline'), { code: 'unavailable' })

vi.mock('../lib/firebase', () => ({ db: {}, isFirebaseConfigured: true }))
vi.mock('firebase/firestore', () => {
  const snap = (path: string) => ({
    id: path.split('/').pop(),
    ref: { path },
    exists: () => fake.docs.has(path),
    data: () => fake.docs.get(path),
  })
  const filhos = (colPath: string) =>
    [...fake.docs.keys()]
      .filter((p) => p.startsWith(colPath + '/') && !p.slice(colPath.length + 1).includes('/'))
      .sort()
      .map(snap)
  return {
    collection: (_db: unknown, path: string) => ({ path }),
    doc: (base: unknown, path?: string, ...rest: string[]) => {
      if (path === undefined) {
        const id = fake.nextId()
        return { id, path: `${(base as { path: string }).path}/${id}` }
      }
      const full = [path, ...rest].join('/')
      return { id: full.split('/').pop(), path: full }
    },
    query: (ref: { path: string }) => ref,
    orderBy: () => undefined,
    limit: () => undefined,
    onSnapshot: vi.fn(),
    serverTimestamp: () => 'TS',
    increment: (n: number) => ({ __inc: n }),
    getDoc: async (ref: { path: string }) => {
      fake.check('get', ref.path)
      return snap(ref.path)
    },
    getDocs: async (ref: { path: string }) => {
      fake.check('list', ref.path)
      const docs = filhos(ref.path)
      return { docs, size: docs.length, forEach: (fn: (d: unknown) => void) => docs.forEach(fn) }
    },
    setDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
      fake.check('set', ref.path)
      fake.apply(ref.path, data, false)
    },
    updateDoc: async (ref: { path: string }, data: Record<string, unknown>) => {
      fake.check('update', ref.path)
      if (!fake.docs.has(ref.path)) throw Object.assign(new Error('not found'), { code: 'not-found' })
      fake.apply(ref.path, data, true)
    },
    deleteDoc: async (ref: { path: string }) => {
      fake.check('delete', ref.path)
      fake.docs.delete(ref.path)
    },
    writeBatch: () => {
      const ops: (() => void)[] = []
      const paths: [string, string][] = []
      return {
        set: (ref: { path: string }, data: Record<string, unknown>) => {
          paths.push(['set', ref.path])
          ops.push(() => fake.apply(ref.path, data, false))
        },
        update: (ref: { path: string }, data: Record<string, unknown>) => {
          paths.push(['update', ref.path])
          ops.push(() => fake.apply(ref.path, data, true))
        },
        delete: (ref: { path: string }) => {
          paths.push(['delete', ref.path])
          ops.push(() => fake.docs.delete(ref.path))
        },
        commit: async () => {
          paths.forEach(([op, p]) => fake.check(`batch-${op}`, p))
          ops.forEach((op) => op())
          // falha "depois de aplicar" (confirmação perdida)
          fake.check('batch-ack', paths.map(([, p]) => p).join(','))
        },
      }
    },
    runTransaction: async (_db: unknown, fn: (tx: unknown) => Promise<unknown>) => {
      const ops: (() => void)[] = []
      const result = await fn({
        get: async (ref: { path: string }) => snap(ref.path),
        set: (ref: { path: string }, data: Record<string, unknown>) => ops.push(() => fake.apply(ref.path, data, false)),
        update: (ref: { path: string }, data: Record<string, unknown>) => ops.push(() => fake.apply(ref.path, data, true)),
      })
      ops.forEach((op) => op())
      return result
    },
  }
})

import {
  AnexoInvalidoError,
  CHUNK_BYTES,
  assinaturaConfere,
  carregarConteudo,
  descartarEnvio,
  enviarAnexo,
  listarAnexos,
  validarArquivo,
} from './anexosService'
import {
  createRegistroAtividade,
  deleteRegistroAtividade,
  recalcularTotalAnexos,
} from './activitiesService'
import { inativarRascunhoRelatorio } from './relatoriosService'

const JPEG = [0xff, 0xd8, 0xff, 0xe0]
function jpeg(name: string, size = 10) {
  const bytes = new Uint8Array(size)
  bytes.set(JPEG)
  for (let i = JPEG.length; i < size; i++) bytes[i] = i % 251
  return new File([bytes], name, { type: 'image/jpeg' })
}
const REG = 'registros_atividade/r1'
const anexoDocs = (parent = REG) =>
  [...fake.docs.keys()].filter((p) => p.startsWith(`${parent}/anexos/`) && p.split('/').length === 4)
const chunkDocs = (anexoPath: string) => [...fake.docs.keys()].filter((p) => p.startsWith(`${anexoPath}/chunks/`))

const input = {
  dataAtividade: '2026-11-10',
  turmaId: 'turma-a',
  idsTurmaOficinas: [],
  usuarioResponsavelId: 'prof-1',
  observacoesGerais: '',
}

beforeEach(() => {
  fake.reset()
  fake.docs.set(REG, { total_anexos: 0 })
})

describe('validação de arquivos', () => {
  it('aplica tipos e limites por tipo de registro', () => {
    expect(validarArquivo({ name: 'a.jpg', type: 'image/jpeg', size: 100 }, 'atividade')).toBeNull()
    expect(validarArquivo({ name: 'a.gif', type: 'image/gif', size: 100 }, 'atividade')).toMatch(/tipo não permitido/)
    expect(validarArquivo({ name: 'a.pdf', type: 'application/pdf', size: 100 }, 'atividade')).toMatch(/tipo/)
    expect(validarArquivo({ name: 'a.pdf', type: 'application/pdf', size: 100 }, 'relatorio')).toBeNull()
    expect(validarArquivo({ name: 'g.jpg', type: 'image/jpeg', size: 6 * 1024 * 1024 }, 'atividade')).toMatch(/excede/)
    expect(validarArquivo({ name: 'g.pdf', type: 'application/pdf', size: 6 * 1024 * 1024 }, 'relatorio')).toBeNull()
    expect(validarArquivo({ name: 'v.jpg', type: 'image/jpeg', size: 0 }, 'atividade')).toMatch(/vazio/)
  })

  it('confere a assinatura do conteúdo', () => {
    expect(assinaturaConfere(new Uint8Array(JPEG), 'image/jpeg')).toBe(true)
    expect(assinaturaConfere(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]), 'application/pdf')).toBe(true)
    expect(assinaturaConfere(new Uint8Array([0x4d, 0x5a, 0, 0]), 'image/jpeg')).toBe(false)
  })

  it('arquivo com conteúdo falso não grava nada', async () => {
    const falso = new File([new Uint8Array([0x4d, 0x5a, 1, 2])], 'virus.jpg', { type: 'image/jpeg' })
    await expect(enviarAnexo(REG, 'a1', falso, 'u')).rejects.toBeInstanceOf(AnexoInvalidoError)
    expect(anexoDocs()).toEqual([])
  })
})

describe('envio e reenvio', () => {
  it('grava metadados, partes e conta o arquivo uma vez', async () => {
    const arquivo = jpeg('grande.jpg', CHUNK_BYTES * 2 + 5) // 3 partes
    await expect(enviarAnexo(REG, 'a1', arquivo, 'u')).resolves.toBe('enviado')
    expect(fake.docs.get(`${REG}/anexos/a1`)).toMatchObject({ status: 'disponivel', total_partes: 3 })
    expect(chunkDocs(`${REG}/anexos/a1`)).toHaveLength(3)
    expect(fake.docs.get(REG)?.total_anexos).toBe(1)
  })

  it('falha no meio: reenvio retoma só as partes que faltam, sem duplicar nem contar duas vezes', async () => {
    const arquivo = jpeg('grande.jpg', CHUNK_BYTES * 2 + 5)
    fake.setFalhar((op, path) => (op === 'set' && path.endsWith('/chunks/000001') ? unavailable() : undefined))
    await expect(enviarAnexo(REG, 'a1', arquivo, 'u')).rejects.toMatchObject({ code: 'unavailable' })
    expect(fake.docs.get(`${REG}/anexos/a1`)?.status).toBe('enviando')
    expect(fake.docs.get(REG)?.total_anexos).toBe(0)

    const gravacoes: string[] = []
    fake.setFalhar((op, path) => {
      if (op === 'set') gravacoes.push(path)
      return undefined
    })
    await expect(enviarAnexo(REG, 'a1', arquivo, 'u')).resolves.toBe('enviado')
    expect(gravacoes).toEqual([`${REG}/anexos/a1/chunks/000001`])
    expect(anexoDocs()).toEqual([`${REG}/anexos/a1`])
    expect(fake.docs.get(REG)?.total_anexos).toBe(1)
  })

  it('confirmação perdida na conclusão: reenvio reconhece o arquivo já gravado', async () => {
    const arquivo = jpeg('a.jpg')
    fake.setFalhar((op) => (op === 'batch-ack' ? unavailable() : undefined))
    await expect(enviarAnexo(REG, 'a1', arquivo, 'u')).rejects.toBeTruthy()
    fake.setFalhar(() => undefined)
    await expect(enviarAnexo(REG, 'a1', arquivo, 'u')).resolves.toBe('ja_enviado')
    expect(fake.docs.get(REG)?.total_anexos).toBe(1)
  })

  it('ID reservado com outro arquivo é recusado', async () => {
    await enviarAnexo(REG, 'a1', jpeg('a.jpg'), 'u')
    await expect(enviarAnexo(REG, 'a1', jpeg('b.jpg', 20), 'u')).rejects.toBeInstanceOf(AnexoInvalidoError)
  })

  it('descartar remove só envios não concluídos', async () => {
    fake.setFalhar((op) => (op === 'batch-update' ? unavailable() : undefined))
    await expect(enviarAnexo(REG, 'a1', jpeg('a.jpg'), 'u')).rejects.toBeTruthy()
    fake.setFalhar(() => undefined)
    await enviarAnexo(REG, 'a2', jpeg('b.jpg'), 'u')
    await descartarEnvio(REG, 'a1')
    await descartarEnvio(REG, 'a2')
    expect(anexoDocs()).toEqual([`${REG}/anexos/a2`])
    expect(chunkDocs(`${REG}/anexos/a1`)).toEqual([])
  })

  it('criar o registro de novo com o mesmo ID não zera o contador', async () => {
    fake.docs.delete(REG)
    await createRegistroAtividade('r1', input, [{ id: 'a1', file: jpeg('a.jpg') }], 'u')
    const segunda = await createRegistroAtividade('r1', input, [{ id: 'a1', file: jpeg('a.jpg') }], 'u')
    expect(segunda.status).toBe('salvo')
    expect(fake.docs.get(REG)?.total_anexos).toBe(1)
    expect(anexoDocs()).toHaveLength(1)
  })

  it('informa estado por arquivo', async () => {
    const estados: string[] = []
    fake.setFalhar((op, path) => (op === 'set' && path.includes('/anexos/a2') ? unavailable() : undefined))
    const resultado = await createRegistroAtividade(
      'r1',
      input,
      [
        { id: 'a1', file: jpeg('ok.jpg') },
        { id: 'a2', file: jpeg('falha.jpg') },
      ],
      'u',
      (id, estado) => estados.push(`${id}:${estado}`)
    )
    expect(estados).toEqual(['a1:enviando', 'a1:enviado', 'a2:enviando', 'a2:falhou'])
    expect(resultado).toMatchObject({ status: 'parcial', enviados: ['a1'], falhas: [{ id: 'a2', nome: 'falha.jpg' }] })
  })
})

describe('leitura sem esconder indisponibilidade', () => {
  it('distingue disponível, envio incompleto, conteúdo incompleto e erro de leitura', async () => {
    const arquivo = jpeg('a.jpg', CHUNK_BYTES + 3)
    await enviarAnexo(REG, 'ok', arquivo, 'u')
    fake.setFalhar((op) => (op === 'batch-update' ? unavailable() : undefined))
    await expect(enviarAnexo(REG, 'parado', jpeg('b.jpg'), 'u')).rejects.toBeTruthy()
    fake.setFalhar(() => undefined)
    await enviarAnexo(REG, 'quebrado', jpeg('c.jpg', CHUNK_BYTES + 3), 'u')
    fake.docs.delete(`${REG}/anexos/quebrado/chunks/000001`)

    const anexos = Object.fromEntries((await listarAnexos(REG)).map((a) => [a.id, a]))
    const ok = await carregarConteudo(anexos.ok)
    expect(ok.estado).toBe('disponivel')
    if (ok.estado === 'disponivel') {
      const blob = await (await fetch(ok.url)).arrayBuffer()
      expect(new Uint8Array(blob)).toEqual(new Uint8Array(await arquivo.arrayBuffer()))
    }
    expect((await carregarConteudo(anexos.parado)).estado).toBe('envio_incompleto')
    expect(await carregarConteudo(anexos.quebrado)).toMatchObject({ estado: 'conteudo_incompleto', motivo: /1 de 2/ })

    fake.setFalhar((op) => (op === 'list' ? unavailable() : undefined))
    expect(await carregarConteudo(anexos.ok)).toMatchObject({ estado: 'erro_leitura', motivo: /sem conexão/ })
  })
})

describe('exclusão', () => {
  beforeEach(async () => {
    await enviarAnexo(REG, 'a1', jpeg('um.jpg'), 'u')
    await enviarAnexo(REG, 'a2', jpeg('dois.jpg'), 'u')
  })

  it('exclui registro, anexos e partes', async () => {
    await expect(deleteRegistroAtividade('r1', 'dir')).resolves.toEqual({
      status: 'excluido',
      removidos: ['dois.jpg', 'um.jpg'],
    })
    expect([...fake.docs.keys()]).toEqual([])
  })

  it('exclusão parcial: o que falhou continua ligado ao registro, fica registrado e pode ser concluído', async () => {
    fake.setFalhar((op, path) => (op === 'delete' && path.startsWith(`${REG}/anexos/a2/`) ? unavailable() : undefined))
    const resultado = await deleteRegistroAtividade('r1', 'dir')
    expect(resultado).toMatchObject({ status: 'parcial', removidos: ['um.jpg'], falhas: [{ nome: 'dois.jpg' }] })
    // nada órfão: o anexo que falhou continua com metadados e o registro existe
    expect(anexoDocs()).toEqual([`${REG}/anexos/a2`])
    expect(fake.docs.get(REG)).toMatchObject({
      total_anexos: 1,
      exclusao: { status: 'incompleta', arquivos_pendentes: ['dois.jpg'] },
    })

    fake.setFalhar(() => undefined)
    await expect(deleteRegistroAtividade('r1', 'dir')).resolves.toMatchObject({ status: 'excluido' })
    expect([...fake.docs.keys()]).toEqual([])
  })

  it('recalcula total_anexos a partir dos arquivos realmente disponíveis', async () => {
    fake.docs.set(REG, { ...fake.docs.get(REG), total_anexos: 7 })
    await expect(recalcularTotalAnexos('r1', 'u')).resolves.toEqual({ antes: 7, depois: 2 })
    expect(fake.docs.get(REG)?.total_anexos).toBe(2)
  })

  it('rascunho de relatório não é apagado se um anexo não sair', async () => {
    const REL = 'relatorios_pedagogicos/rel1'
    fake.docs.set(REL, { status: 'rascunho', aluno_id: 'x' })
    const pdf = new File([new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 1])], 'laudo.pdf', { type: 'application/pdf' })
    await enviarAnexo(REL, 'p1', pdf, 'u')
    fake.setFalhar((op, path) => (op === 'batch-delete' && path.startsWith(`${REL}/anexos/`) ? unavailable() : undefined))
    await expect(inativarRascunhoRelatorio('rel1', 'u')).resolves.toMatchObject({ status: 'parcial' })
    expect(fake.docs.has(REL)).toBe(true)
    expect(anexoDocs(REL)).toEqual([`${REL}/anexos/p1`])
  })
})
