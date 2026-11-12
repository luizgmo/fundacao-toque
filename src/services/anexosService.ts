import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  writeBatch,
} from 'firebase/firestore'
import type { DocumentData } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { confirmWrite, describePersistenceError, toPersistenceError } from '../lib/persistence'
import type { ArquivoComFalha } from '../lib/persistence'

// Anexos (fotos de atividades e arquivos de relatórios) ficam no próprio
// Firestore: metadados em {pai}/anexos/{id} e o conteúdo em partes base64 em
// {pai}/anexos/{id}/chunks/{000000..}. Este módulo concentra envio, reenvio,
// leitura e exclusão para os dois tipos de pai.

export const ANEXOS_SUBCOLLECTION = 'anexos'
export const CHUNK_BYTES = 600 * 1024 // cada parte fica abaixo do limite de 1 MiB por documento
export const MAX_ARQUIVOS_POR_ENVIO = 10

export type TipoPai = 'atividade' | 'relatorio'

// Limites validados no cliente e repetidos em firestore.rules.
export const LIMITES_ANEXO: Record<TipoPai, { tipos: string[]; maxBytes: number; descricao: string }> = {
  atividade: {
    tipos: ['image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 5 * 1024 * 1024,
    descricao: 'JPG, PNG ou WebP de até 5 MB',
  },
  relatorio: {
    tipos: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'],
    maxBytes: 10 * 1024 * 1024,
    descricao: 'PDF, JPG, PNG ou WebP de até 10 MB',
  },
}

export function tipoDoPai(parentPath: string): TipoPai {
  if (parentPath.startsWith('registros_atividade/')) return 'atividade'
  if (parentPath.startsWith('relatorios_pedagogicos/')) return 'relatorio'
  throw new Error(`Anexos não são suportados em ${parentPath}.`)
}

// Só registros de atividade mantêm o contador total_anexos.
function temContador(parentPath: string) {
  return tipoDoPai(parentPath) === 'atividade'
}

export class AnexoInvalidoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AnexoInvalidoError'
  }
}

// Validação síncrona (tipo declarado, tamanho, nome) feita ao selecionar o arquivo.
export function validarArquivo(file: { name: string; type: string; size: number }, tipo: TipoPai): string | null {
  const limite = LIMITES_ANEXO[tipo]
  if (!limite.tipos.includes(file.type)) {
    return `${file.name}: tipo não permitido (${file.type || 'desconhecido'}). Envie ${limite.descricao}.`
  }
  if (file.size <= 0) return `${file.name}: o arquivo está vazio.`
  if (file.size > limite.maxBytes) {
    return `${file.name}: ${(file.size / 1024 / 1024).toFixed(1)} MB excede o limite. Envie ${limite.descricao}.`
  }
  if (file.name.length > 200) return `${file.name.slice(0, 40)}…: nome do arquivo muito longo (máx. 200 caracteres).`
  return null
}

// Confere a assinatura binária: um .exe renomeado para .jpg não passa.
export function assinaturaConfere(bytes: Uint8Array, tipoConteudo: string): boolean {
  const comeca = (...sig: number[]) => sig.every((b, i) => bytes[i] === b)
  switch (tipoConteudo) {
    case 'image/jpeg':
      return comeca(0xff, 0xd8, 0xff)
    case 'image/png':
      return comeca(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
    case 'image/webp':
      return comeca(0x52, 0x49, 0x46, 0x46) && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
    case 'application/pdf':
      return comeca(0x25, 0x50, 0x44, 0x46, 0x2d)
    default:
      return false
  }
}

// Reserva o ID do anexo antes da primeira tentativa. Reenviar o mesmo arquivo
// com o mesmo ID retoma o envio em vez de criar uma cópia.
export function novoIdAnexo(): string {
  return doc(collection(db, ANEXOS_SUBCOLLECTION)).id
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = ''
  const blockSize = 0x8000
  for (let offset = 0; offset < bytes.length; offset += blockSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + blockSize))
  }
  return btoa(binary)
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return bytes
}

export function chunkId(indice: number) {
  return String(indice).padStart(6, '0')
}

export type ResultadoEnvioArquivo = 'enviado' | 'ja_enviado'

// Envia (ou retoma) um arquivo com ID reservado. Idempotente:
// - se o anexo já está "disponivel", nada é regravado ('ja_enviado');
// - se ficou "enviando" numa tentativa anterior, grava só as partes que faltam;
// - a troca para "disponivel" e o +1 em total_anexos vão no mesmo batch, então
//   o contador só conta arquivos completos e nunca é incrementado duas vezes.
export async function enviarAnexo(
  parentPath: string,
  anexoId: string,
  file: File,
  userId: string
): Promise<ResultadoEnvioArquivo> {
  const operacao = `enviar o arquivo ${file.name}`
  const tipo = tipoDoPai(parentPath)
  const invalido = validarArquivo(file, tipo)
  if (invalido) throw new AnexoInvalidoError(invalido)

  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!assinaturaConfere(bytes, file.type)) {
    throw new AnexoInvalidoError(`${file.name}: o conteúdo do arquivo não corresponde ao tipo ${file.type}.`)
  }
  const totalPartes = Math.ceil(bytes.length / CHUNK_BYTES)
  const anexoRef = doc(db, `${parentPath}/${ANEXOS_SUBCOLLECTION}/${anexoId}`)

  let metadadosGravados = false
  let partesExistentes = new Set<number>()
  try {
    const atual = await getDoc(anexoRef)
    if (atual.exists()) {
      const data = atual.data()
      if (data.tamanho_bytes !== file.size || data.nome_arquivo_original !== file.name) {
        throw new AnexoInvalidoError(`${file.name}: o ID reservado já pertence a outro arquivo. Selecione o arquivo novamente.`)
      }
      if (data.status === 'disponivel') return 'ja_enviado'
      metadadosGravados = true
      const chunks = await getDocs(collection(db, `${anexoRef.path}/chunks`))
      partesExistentes = new Set(chunks.docs.map((c) => Number(c.data().indice)))
    }
  } catch (err) {
    if (err instanceof AnexoInvalidoError) throw err
    throw toPersistenceError(operacao, err)
  }

  if (!metadadosGravados) {
    await confirmWrite(
      operacao,
      setDoc(anexoRef, {
        tipo_anexo: file.type.startsWith('image/') ? 'imagem' : 'documento',
        armazenamento: 'firestore',
        status: 'enviando',
        total_partes: totalPartes,
        tamanho_bytes: file.size,
        nome_arquivo_original: file.name,
        tipo_conteudo: file.type,
        legenda: null,
        enviado_por: userId,
        enviado_em: serverTimestamp(),
      })
    )
  }

  await Promise.all(
    Array.from({ length: totalPartes }, (_, indice) => indice)
      .filter((indice) => !partesExistentes.has(indice))
      .map((indice) =>
        confirmWrite(
          operacao,
          setDoc(doc(db, `${anexoRef.path}/chunks/${chunkId(indice)}`), {
            indice,
            conteudo_base64: bytesToBase64(bytes.subarray(indice * CHUNK_BYTES, (indice + 1) * CHUNK_BYTES)),
          })
        )
      )
  )

  const batch = writeBatch(db)
  batch.update(anexoRef, { status: 'disponivel' })
  if (temContador(parentPath)) {
    batch.update(doc(db, parentPath), {
      total_anexos: increment(1),
      atualizado_por: userId,
      atualizado_em: serverTimestamp(),
    })
  }
  await confirmWrite(operacao, batch.commit())
  return 'enviado'
}

// Descarta um envio não concluído (metadados "enviando" e partes já gravadas).
// Anexos "disponivel" não são tocados aqui: use excluirAnexos.
export async function descartarEnvio(parentPath: string, anexoId: string): Promise<void> {
  const anexoRef = doc(db, `${parentPath}/${ANEXOS_SUBCOLLECTION}/${anexoId}`)
  await confirmWrite(
    'descartar o envio incompleto',
    (async () => {
      const atual = await getDoc(anexoRef)
      if (!atual.exists() || atual.data().status !== 'enviando') return
      const chunks = await getDocs(collection(db, `${anexoRef.path}/chunks`))
      await Promise.all(chunks.docs.map((c) => deleteDoc(c.ref)))
      await deleteDoc(anexoRef)
    })()
  )
}

// ==== Leitura ====

export type StatusAnexo = 'enviando' | 'disponivel'

export type AnexoInfo = {
  id: string
  parentPath: string
  tipoAnexo: 'imagem' | 'documento'
  nomeArquivoOriginal: string
  tipoConteudo: string
  legenda: string
  status: StatusAnexo
  totalPartes: number
  tamanhoBytes: number
  enviadoPor: string
}

function docToAnexo(parentPath: string, id: string, data: DocumentData): AnexoInfo {
  return {
    id,
    parentPath,
    tipoAnexo: data.tipo_anexo === 'documento' ? 'documento' : 'imagem',
    nomeArquivoOriginal: data.nome_arquivo_original || 'arquivo',
    tipoConteudo: data.tipo_conteudo || '',
    legenda: data.legenda || '',
    status: data.status === 'disponivel' ? 'disponivel' : 'enviando',
    totalPartes: Number(data.total_partes) || 0,
    tamanhoBytes: Number(data.tamanho_bytes) || 0,
    enviadoPor: data.enviado_por || '',
  }
}

// Lista os metadados. Falha de leitura é propagada (não vira "sem anexos").
export async function listarAnexos(parentPath: string): Promise<AnexoInfo[]> {
  const snap = await getDocs(collection(db, `${parentPath}/${ANEXOS_SUBCOLLECTION}`))
  return snap.docs
    .map((d) => docToAnexo(parentPath, d.id, d.data()))
    .sort((a, b) => a.nomeArquivoOriginal.localeCompare(b.nomeArquivoOriginal, 'pt-BR'))
}

// Por que um arquivo não pode ser exibido. Nunca é escondido como "sem anexo".
export type EstadoConteudo =
  | { estado: 'disponivel'; url: string }
  | { estado: 'envio_incompleto'; motivo: string }
  | { estado: 'conteudo_incompleto'; motivo: string }
  | { estado: 'erro_leitura'; motivo: string }

export async function carregarConteudo(anexo: AnexoInfo): Promise<EstadoConteudo> {
  if (anexo.status !== 'disponivel') {
    return {
      estado: 'envio_incompleto',
      motivo: 'o envio deste arquivo não foi concluído; reenvie ou descarte',
    }
  }
  try {
    const chunksSnapshot = await getDocs(
      query(collection(db, `${anexo.parentPath}/${ANEXOS_SUBCOLLECTION}/${anexo.id}/chunks`), orderBy('indice', 'asc'))
    )
    const indices = chunksSnapshot.docs.map((c) => Number(c.data().indice))
    const sequenciaOk = indices.length === anexo.totalPartes && indices.every((v, i) => v === i)
    if (!sequenciaOk) {
      return {
        estado: 'conteudo_incompleto',
        motivo: `${indices.length} de ${anexo.totalPartes} parte(s) encontradas; o arquivo precisa ser excluído e enviado de novo`,
      }
    }
    const bytes = base64ToBytes(chunksSnapshot.docs.map((c) => String(c.data().conteudo_base64 || '')).join(''))
    if (anexo.tamanhoBytes && bytes.length !== anexo.tamanhoBytes) {
      return {
        estado: 'conteudo_incompleto',
        motivo: `tamanho reconstruído (${bytes.length} bytes) difere do original (${anexo.tamanhoBytes} bytes)`,
      }
    }
    const buffer = new ArrayBuffer(bytes.length)
    new Uint8Array(buffer).set(bytes)
    const blob = new Blob([buffer], { type: anexo.tipoConteudo || 'application/octet-stream' })
    return { estado: 'disponivel', url: URL.createObjectURL(blob) }
  } catch (err) {
    return { estado: 'erro_leitura', motivo: describePersistenceError(err) }
  }
}

export type AnexoComConteudo = AnexoInfo & { conteudo: EstadoConteudo }

export async function listarAnexosComConteudo(parentPath: string): Promise<AnexoComConteudo[]> {
  const anexos = await listarAnexos(parentPath)
  return Promise.all(anexos.map(async (anexo) => ({ ...anexo, conteudo: await carregarConteudo(anexo) })))
}

export function liberarUrls(anexos: { conteudo: EstadoConteudo }[]) {
  anexos.forEach((a) => {
    if (a.conteudo.estado === 'disponivel') URL.revokeObjectURL(a.conteudo.url)
  })
}

// Compatibilidade (prestação de contas): URL ou null quando não está disponível;
// lança quando o conteúdo está incompleto ou a leitura falha.
export async function getAnexoFirestoreUrl(parentPath: string, attachmentId: string): Promise<string | null> {
  const snap = await getDoc(doc(db, `${parentPath}/${ANEXOS_SUBCOLLECTION}/${attachmentId}`))
  if (!snap.exists()) return null
  const data = snap.data()
  if (data.armazenamento !== 'firestore' || data.status !== 'disponivel') return null
  const conteudo = await carregarConteudo(docToAnexo(parentPath, snap.id, data))
  if (conteudo.estado === 'disponivel') return conteudo.url
  throw new Error(`O anexo está indisponível: ${conteudo.motivo}.`)
}

// ==== Exclusão ====

export type ResultadoExclusaoAnexos = {
  removidos: string[] // nomes dos arquivos totalmente removidos
  falhas: ArquivoComFalha[] // arquivos que continuam no banco (podem ser excluídos de novo)
}

// Remove primeiro as partes e por último os metadados: se algo falhar, o anexo
// continua listado (e pode ser excluído de novo) em vez de deixar partes órfãs
// invisíveis. Os metadados saem no mesmo batch do -1 em total_anexos.
async function excluirUmAnexo(anexo: AnexoInfo, userId: string): Promise<void> {
  const anexoPath = `${anexo.parentPath}/${ANEXOS_SUBCOLLECTION}/${anexo.id}`
  const chunks = await getDocs(collection(db, `${anexoPath}/chunks`))
  await Promise.all(chunks.docs.map((c) => deleteDoc(c.ref)))
  const batch = writeBatch(db)
  batch.delete(doc(db, anexoPath))
  if (anexo.status === 'disponivel' && temContador(anexo.parentPath)) {
    batch.update(doc(db, anexo.parentPath), {
      total_anexos: increment(-1),
      atualizado_por: userId,
      atualizado_em: serverTimestamp(),
    })
  }
  await batch.commit()
}

export async function excluirAnexos(anexos: AnexoInfo[], userId: string): Promise<ResultadoExclusaoAnexos> {
  const resultados = await Promise.allSettled(
    anexos.map((anexo) =>
      confirmWrite(`excluir o arquivo ${anexo.nomeArquivoOriginal}`, excluirUmAnexo(anexo, userId), 30_000)
    )
  )
  const removidos: string[] = []
  const falhas: ArquivoComFalha[] = []
  resultados.forEach((r, indice) => {
    const anexo = anexos[indice]
    if (r.status === 'fulfilled') removidos.push(anexo.nomeArquivoOriginal)
    else falhas.push({ nome: anexo.nomeArquivoOriginal, motivo: describePersistenceError(r.reason), indice })
  })
  return { removidos, falhas }
}
