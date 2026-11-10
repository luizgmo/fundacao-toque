import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  increment,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import type { DocumentData } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { Anexo, RegistroAtividade } from '../types/atividades'

const REGISTROS_COLLECTION = 'registros_atividade'
const ANEXOS_SUBCOLLECTION = 'anexos'

export const MAX_FOTO_BYTES = 5 * 1024 * 1024
const FIRESTORE_CHUNK_BYTES = 600 * 1024

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

export async function getAnexoFirestoreUrl(parentPath: string, attachmentId: string): Promise<string | null> {
  const attachmentRef = doc(db, `${parentPath}/${ANEXOS_SUBCOLLECTION}/${attachmentId}`)
  const metadataSnapshot = await getDoc(attachmentRef)
  if (!metadataSnapshot.exists()) return null
  const metadata = metadataSnapshot.data()
  if (metadata.armazenamento !== 'firestore' || metadata.status !== 'disponivel') return null

  const chunksSnapshot = await getDocs(query(collection(db, `${attachmentRef.path}/chunks`), orderBy('indice', 'asc')))
  if (chunksSnapshot.size !== metadata.total_partes) throw new Error('O anexo está incompleto no Firestore.')
  const chunks = chunksSnapshot.docs.map((chunk) => String(chunk.data().conteudo_base64 || ''))
  const bytes = base64ToBytes(chunks.join(''))
  const buffer = new ArrayBuffer(bytes.length)
  new Uint8Array(buffer).set(bytes)
  const blob = new Blob([buffer], { type: String(metadata.tipo_conteudo || 'application/octet-stream') })
  return URL.createObjectURL(blob)
}

export function docToRegistro(id: string, data: DocumentData): RegistroAtividade {
  return {
    id,
    dataAtividade: data.data_atividade || '',
    turmaId: data.turma_id || '',
    idsTurmaOficinas: Array.isArray(data.ids_turma_oficinas) ? data.ids_turma_oficinas : [],
    usuarioResponsavelId: data.usuario_responsavel_id || '',
    observacoesGerais: data.observacoes_gerais || '',
    totalAnexos: data.total_anexos ?? 0,
  }
}

// Escuta os registros de atividade mais recentes
export function subscribeToRegistrosAtividade(
  onSuccess: (registros: RegistroAtividade[]) => void,
  onError?: (error: Error) => void,
  maxItems = 50
) {
  const q = query(
    collection(db, REGISTROS_COLLECTION),
    orderBy('data_atividade', 'desc'),
    limit(maxItems)
  )
  return onSnapshot(
    q,
    (snapshot) => {
      const list: RegistroAtividade[] = []
      snapshot.forEach((docSnap) => {
        list.push(docToRegistro(docSnap.id, docSnap.data()))
      })
      onSuccess(list)
    },
    (err) => {
      console.warn('Erro ao escutar Firestore registros_atividade:', err)
      if (onError) onError(err)
      else onSuccess([])
    }
  )
}

export type RegistroAtividadeInput = {
  dataAtividade: string
  turmaId: string
  idsTurmaOficinas: string[]
  usuarioResponsavelId: string
  observacoesGerais: string
}

// Cria o registro diário e grava as fotos em partes na subcoleção Firestore do anexo.
export async function createRegistroAtividade(
  input: RegistroAtividadeInput,
  fotos: File[],
  userId: string
): Promise<{ id: string; fotosComErro: string[] }> {
  const id = `${input.dataAtividade}_${input.turmaId}_${Date.now().toString().slice(-5)}`

  await setDoc(doc(db, REGISTROS_COLLECTION, id), {
    data_atividade: input.dataAtividade,
    turma_id: input.turmaId,
    ids_turma_oficinas: input.idsTurmaOficinas,
    usuario_responsavel_id: input.usuarioResponsavelId,
    observacoes_gerais: input.observacoesGerais.trim() || null,
    total_anexos: 0,
    criado_por: userId,
    criado_em: serverTimestamp(),
    atualizado_por: userId,
    atualizado_em: serverTimestamp(),
  })

  const fotosComErro: string[] = []
  for (const foto of fotos) {
    try {
      await uploadAnexo(`${REGISTROS_COLLECTION}/${id}`, foto, userId)
      await updateDoc(doc(db, REGISTROS_COLLECTION, id), { total_anexos: increment(1) })
    } catch (err) {
      console.warn('Erro ao gravar foto no Firestore:', err)
      fotosComErro.push(foto.name)
    }
  }

  return { id, fotosComErro }
}

// Grava metadados e conteúdo em partes no Firestore, abaixo de {parentPath}/anexos.
// Cada parte fica abaixo do limite de 1 MiB por documento do Firestore.
export async function uploadAnexo(parentPath: string, file: File, userId: string): Promise<string> {
  const anexoRef = doc(collection(db, `${parentPath}/${ANEXOS_SUBCOLLECTION}`))
  const bytes = new Uint8Array(await file.arrayBuffer())
  const totalPartes = Math.ceil(bytes.length / FIRESTORE_CHUNK_BYTES)
  await setDoc(anexoRef, {
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

  try {
    await Promise.all(Array.from({ length: totalPartes }, async (_, indice) => {
      const parte = bytes.subarray(indice * FIRESTORE_CHUNK_BYTES, (indice + 1) * FIRESTORE_CHUNK_BYTES)
      await setDoc(doc(db, `${anexoRef.path}/chunks/${String(indice).padStart(6, '0')}`), {
        indice,
        conteudo_base64: bytesToBase64(parte),
      })
    }))
    await updateDoc(anexoRef, { status: 'disponivel' })
  } catch (error) {
    const chunks = await getDocs(collection(db, `${anexoRef.path}/chunks`)).catch(() => null)
    await Promise.all(chunks?.docs.map((chunk) => deleteDoc(chunk.ref)) || [])
    await deleteDoc(anexoRef).catch(() => undefined)
    throw error
  }

  return anexoRef.id
}

// Lista anexos e reconstrói seus arquivos persistidos em partes no Firestore.
export async function getAnexosComUrl(
  parentPath: string
): Promise<(Anexo & { url: string | null })[]> {
  const snap = await getDocs(collection(db, `${parentPath}/${ANEXOS_SUBCOLLECTION}`))
  return Promise.all(
    snap.docs.map(async (d) => {
      const data = d.data()
      const anexo: Anexo = {
        id: d.id,
        tipoAnexo: data.tipo_anexo === 'documento' ? 'documento' : 'imagem',
        caminhoFirestore: data.armazenamento === 'firestore' ? `${parentPath}/${ANEXOS_SUBCOLLECTION}/${d.id}` : '',
        nomeArquivoOriginal: data.nome_arquivo_original || 'arquivo',
        tipoConteudo: data.tipo_conteudo || '',
        legenda: data.legenda || '',
      }
      let url: string | null = null
      try {
        url = await getAnexoFirestoreUrl(parentPath, d.id)
      } catch (err) {
        console.warn('Não foi possível reconstruir o anexo do Firestore:', err)
      }
      return { ...anexo, url }
    })
  )
}

// Excluir registro de atividade e o conteúdo dividido em partes no Firestore.
export async function deleteRegistroAtividade(id: string): Promise<void> {
  const parentPath = `${REGISTROS_COLLECTION}/${id}`
  const anexos = await getDocs(collection(db, `${parentPath}/${ANEXOS_SUBCOLLECTION}`))

  await Promise.all(
    anexos.docs.map(async (a) => {
      const chunks = await getDocs(collection(db, `${parentPath}/${ANEXOS_SUBCOLLECTION}/${a.id}/chunks`))
      await Promise.all(chunks.docs.map((chunk) => deleteDoc(chunk.ref)))
      await deleteDoc(a.ref)
    })
  )

  await deleteDoc(doc(db, REGISTROS_COLLECTION, id))
}
