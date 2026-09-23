import {
  collection,
  deleteDoc,
  doc,
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
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import type { Anexo, RegistroAtividade } from '../types/atividades'

const REGISTROS_COLLECTION = 'registros_atividade'
const ANEXOS_SUBCOLLECTION = 'anexos'

export const MAX_FOTO_BYTES = 5 * 1024 * 1024

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

// Cria o registro diário e envia as fotos para o Storage (metadados em subcoleção anexos)
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
      console.warn('Erro ao enviar foto para o Storage:', err)
      fotosComErro.push(foto.name)
    }
  }

  return { id, fotosComErro }
}

// Envia um arquivo ao Storage e grava seus metadados em {parentPath}/anexos.
// Reutilizável para registros_atividade e relatorios_pedagogicos (modelagem.md).
export async function uploadAnexo(parentPath: string, file: File, userId: string): Promise<string> {
  const anexoRef = doc(collection(db, `${parentPath}/${ANEXOS_SUBCOLLECTION}`))
  const safeName = file.name.replace(/[^\w.-]+/g, '_')
  const caminhoStorage = `${parentPath}/${anexoRef.id}_${safeName}`

  await uploadBytes(ref(storage, caminhoStorage), file, { contentType: file.type })

  await setDoc(anexoRef, {
    tipo_anexo: file.type.startsWith('image/') ? 'imagem' : 'documento',
    caminho_storage: caminhoStorage,
    nome_arquivo_original: file.name,
    tipo_conteudo: file.type,
    legenda: null,
    enviado_por: userId,
    enviado_em: serverTimestamp(),
  })

  return anexoRef.id
}

// Lista anexos de um registro com a URL de download de cada arquivo
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
        caminhoStorage: data.caminho_storage || '',
        nomeArquivoOriginal: data.nome_arquivo_original || 'arquivo',
        tipoConteudo: data.tipo_conteudo || '',
        legenda: data.legenda || '',
      }
      let url: string | null = null
      try {
        url = await getDownloadURL(ref(storage, anexo.caminhoStorage))
      } catch (err) {
        console.warn('Não foi possível obter URL do anexo:', err)
      }
      return { ...anexo, url }
    })
  )
}

// Excluir registro de atividade, seus anexos e arquivos no Storage
export async function deleteRegistroAtividade(id: string): Promise<void> {
  const parentPath = `${REGISTROS_COLLECTION}/${id}`
  const anexos = await getDocs(collection(db, `${parentPath}/${ANEXOS_SUBCOLLECTION}`))

  await Promise.all(
    anexos.docs.map(async (a) => {
      const caminho = a.data().caminho_storage
      if (caminho) {
        await deleteObject(ref(storage, caminho)).catch((err) =>
          console.warn('Arquivo do anexo não removido do Storage:', err)
        )
      }
      await deleteDoc(a.ref)
    })
  )

  await deleteDoc(doc(db, REGISTROS_COLLECTION, id))
}
