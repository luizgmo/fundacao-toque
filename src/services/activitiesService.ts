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
import { confirmWrite, describePersistenceError } from '../lib/persistence'
import type { ArquivoComFalha, ResultadoPersistencia } from '../lib/persistence'

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
  onError: (error: Error) => void,
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
      onError(err)
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

export type ResultadoRegistroAtividade = ResultadoPersistencia & { id: string }

// Cria o registro diário e grava as fotos em partes na subcoleção Firestore do anexo.
// Se o registro principal não for confirmado, lança PersistenceError e nenhum ID é
// devolvido. Falhas de fotos não desfazem o registro: o resultado informa
// exatamente quais fotos foram persistidas e quais faltam (status "parcial").
export async function createRegistroAtividade(
  input: RegistroAtividadeInput,
  fotos: File[],
  userId: string
): Promise<ResultadoRegistroAtividade> {
  const id = `${input.dataAtividade}_${input.turmaId}_${Date.now().toString().slice(-5)}`

  await confirmWrite(
    'registrar a atividade',
    setDoc(doc(db, REGISTROS_COLLECTION, id), {
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
  )

  return { id, ...(await anexarFotosRegistro(id, fotos, userId)) }
}

// Envia fotos para um registro já existente (também usado para reenviar as que falharam).
export async function anexarFotosRegistro(
  registroId: string,
  fotos: File[],
  userId: string
): Promise<ResultadoPersistencia> {
  const enviados: string[] = []
  const falhas: ArquivoComFalha[] = []
  for (const [indice, foto] of fotos.entries()) {
    try {
      await uploadAnexo(`${REGISTROS_COLLECTION}/${registroId}`, foto, userId)
      enviados.push(foto.name)
    } catch (err) {
      console.warn('Erro ao gravar foto no Firestore:', err)
      falhas.push({ nome: foto.name, motivo: describePersistenceError(err), indice })
    }
  }

  if (enviados.length > 0) {
    try {
      await confirmWrite(
        'atualizar o total de fotos do registro',
        updateDoc(doc(db, REGISTROS_COLLECTION, registroId), {
          total_anexos: increment(enviados.length),
          atualizado_por: userId,
          atualizado_em: serverTimestamp(),
        })
      )
    } catch (err) {
      // As fotos estão gravadas, mas o contador do registro ficou desatualizado.
      console.warn('Erro ao atualizar total_anexos:', err)
      falhas.push({
        nome: 'Contador de fotos do registro',
        motivo: `${enviados.length} foto(s) gravada(s), mas o total exibido na lista não foi atualizado: ${describePersistenceError(err)}`,
      })
    }
  }

  return { status: falhas.length > 0 ? 'parcial' : 'salvo', enviados, falhas }
}

// Grava metadados e conteúdo em partes no Firestore, abaixo de {parentPath}/anexos.
// Cada parte fica abaixo do limite de 1 MiB por documento do Firestore.
export async function uploadAnexo(parentPath: string, file: File, userId: string): Promise<string> {
  const anexoRef = doc(collection(db, `${parentPath}/${ANEXOS_SUBCOLLECTION}`))
  const bytes = new Uint8Array(await file.arrayBuffer())
  const totalPartes = Math.ceil(bytes.length / FIRESTORE_CHUNK_BYTES)
  await confirmWrite(`enviar o arquivo ${file.name}`, setDoc(anexoRef, {
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
  }))

  try {
    await Promise.all(Array.from({ length: totalPartes }, async (_, indice) => {
      const parte = bytes.subarray(indice * FIRESTORE_CHUNK_BYTES, (indice + 1) * FIRESTORE_CHUNK_BYTES)
      await confirmWrite(
        `enviar o arquivo ${file.name}`,
        setDoc(doc(db, `${anexoRef.path}/chunks/${String(indice).padStart(6, '0')}`), {
          indice,
          conteudo_base64: bytesToBase64(parte),
        })
      )
    }))
    await confirmWrite(`enviar o arquivo ${file.name}`, updateDoc(anexoRef, { status: 'disponivel' }))
  } catch (error) {
    // Limpeza best-effort: sem rede, as exclusões ficariam pendentes para sempre.
    // O anexo permanece com status "enviando" e é ignorado na leitura.
    await confirmWrite('limpar envio incompleto', (async () => {
      const chunks = await getDocs(collection(db, `${anexoRef.path}/chunks`))
      await Promise.all(chunks.docs.map((chunk) => deleteDoc(chunk.ref)))
      await deleteDoc(anexoRef)
    })(), 10_000).catch((cleanupError) => console.warn('Limpeza do anexo incompleto falhou:', cleanupError))
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
  await confirmWrite('excluir o registro de atividade', deleteRegistroAtividadeNoFirestore(id), 60_000)
}

async function deleteRegistroAtividadeNoFirestore(id: string): Promise<void> {
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
