import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  updateDoc,
} from 'firebase/firestore'
import type { DocumentData } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { RegistroAtividade } from '../types/atividades'
import { confirmWrite, describePersistenceError } from '../lib/persistence'
import type { ArquivoComFalha } from '../lib/persistence'
import {
  LIMITES_ANEXO,
  enviarAnexo,
  excluirAnexos,
  listarAnexos,
} from './anexosService'
import type { ResultadoEnvioArquivo } from './anexosService'

// Mantido para quem importava daqui (prestação de contas, relatórios).
export { getAnexoFirestoreUrl } from './anexosService'

const REGISTROS_COLLECTION = 'registros_atividade'

export const MAX_FOTO_BYTES = LIMITES_ANEXO.atividade.maxBytes

export function docToRegistro(id: string, data: DocumentData): RegistroAtividade {
  return {
    id,
    dataAtividade: data.data_atividade || '',
    turmaId: data.turma_id || '',
    idsTurmaOficinas: Array.isArray(data.ids_turma_oficinas) ? data.ids_turma_oficinas : [],
    usuarioResponsavelId: data.usuario_responsavel_id || '',
    observacoesGerais: data.observacoes_gerais || '',
    totalAnexos: data.total_anexos ?? 0,
    exclusao:
      data.exclusao && typeof data.exclusao === 'object'
        ? {
            status: data.exclusao.status === 'incompleta' ? 'incompleta' : 'em_andamento',
            arquivosPendentes: Array.isArray(data.exclusao.arquivos_pendentes) ? data.exclusao.arquivos_pendentes : [],
          }
        : null,
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

// Foto com ID de anexo reservado na seleção: o mesmo ID é usado em todas as
// tentativas, então reenviar não cria cópia.
export type FotoParaEnvio = { id: string; file: File }

export type EstadoEnvio = 'aguardando' | 'enviando' | 'enviado' | 'falhou'

export type ResultadoEnvioFotos = {
  status: 'salvo' | 'parcial'
  enviados: string[] // IDs reservados confirmados (inclusive os que já estavam enviados)
  falhas: (ArquivoComFalha & { id: string })[]
}

export type ResultadoRegistroAtividade = ResultadoEnvioFotos & { id: string }

// Reserva o ID do registro antes da primeira tentativa.
export function novoIdRegistroAtividade(): string {
  return doc(collection(db, REGISTROS_COLLECTION)).id
}

// Cria o registro com ID reservado e envia as fotos. Se o registro principal não
// for confirmado, lança PersistenceError e nenhum ID é devolvido. Repetir com o
// mesmo ID não duplica: se a tentativa anterior chegou ao banco, o registro é
// atualizado sem zerar total_anexos.
export async function createRegistroAtividade(
  registroId: string,
  input: RegistroAtividadeInput,
  fotos: FotoParaEnvio[],
  userId: string,
  onProgresso?: (fotoId: string, estado: EstadoEnvio, motivo?: string) => void
): Promise<ResultadoRegistroAtividade> {
  const ref = doc(db, REGISTROS_COLLECTION, registroId)
  const dados = {
    data_atividade: input.dataAtividade,
    turma_id: input.turmaId,
    ids_turma_oficinas: input.idsTurmaOficinas,
    usuario_responsavel_id: input.usuarioResponsavelId,
    observacoes_gerais: input.observacoesGerais.trim() || null,
    atualizado_por: userId,
    atualizado_em: serverTimestamp(),
  }
  await confirmWrite(
    'registrar a atividade',
    runTransaction(db, async (tx) => {
      const atual = await tx.get(ref)
      if (atual.exists()) tx.update(ref, dados)
      else tx.set(ref, { ...dados, total_anexos: 0, criado_por: userId, criado_em: serverTimestamp() })
    })
  )

  return { id: registroId, ...(await anexarFotosRegistro(registroId, fotos, userId, onProgresso)) }
}

// Envia (ou reenvia) fotos para um registro existente, uma por vez, informando o
// estado de cada uma. total_anexos é atualizado junto com cada foto concluída.
export async function anexarFotosRegistro(
  registroId: string,
  fotos: FotoParaEnvio[],
  userId: string,
  onProgresso?: (fotoId: string, estado: EstadoEnvio, motivo?: string) => void
): Promise<ResultadoEnvioFotos> {
  const enviados: string[] = []
  const falhas: ResultadoEnvioFotos['falhas'] = []
  for (const [indice, foto] of fotos.entries()) {
    onProgresso?.(foto.id, 'enviando')
    try {
      const resultado: ResultadoEnvioArquivo = await enviarAnexo(
        `${REGISTROS_COLLECTION}/${registroId}`,
        foto.id,
        foto.file,
        userId
      )
      enviados.push(foto.id)
      onProgresso?.(foto.id, 'enviado', resultado === 'ja_enviado' ? 'já estava gravada' : undefined)
    } catch (err) {
      console.warn('Erro ao gravar foto no Firestore:', err)
      const motivo = describePersistenceError(err)
      falhas.push({ id: foto.id, nome: foto.file.name, motivo, indice })
      onProgresso?.(foto.id, 'falhou', motivo)
    }
  }
  return { status: falhas.length > 0 ? 'parcial' : 'salvo', enviados, falhas }
}

// Recalcula total_anexos a partir dos anexos realmente disponíveis.
export async function recalcularTotalAnexos(
  registroId: string,
  userId: string
): Promise<{ antes: number; depois: number }> {
  const parentPath = `${REGISTROS_COLLECTION}/${registroId}`
  const anexos = await listarAnexos(parentPath)
  const depois = anexos.filter((a) => a.status === 'disponivel').length
  return confirmWrite(
    'corrigir o total de fotos do registro',
    runTransaction(db, async (tx) => {
      const ref = doc(db, parentPath)
      const atual = await tx.get(ref)
      const antes = Number(atual.data()?.total_anexos ?? 0)
      if (antes !== depois) tx.update(ref, { total_anexos: depois, atualizado_por: userId, atualizado_em: serverTimestamp() })
      return { antes, depois }
    })
  )
}

export type ResultadoExclusaoRegistro =
  | { status: 'excluido'; removidos: string[] }
  | { status: 'parcial'; removidos: string[]; falhas: ArquivoComFalha[] }

// Exclui o registro e seus anexos. Antes de começar, marca o registro com
// `exclusao` para que uma interrupção fique visível. Cada arquivo é removido de
// forma independente: os que falharem continuam ligados ao registro (não ficam
// órfãos), o registro fica com exclusao.status = 'incompleta' e a exclusão pode
// ser concluída depois chamando esta função de novo.
export async function deleteRegistroAtividade(id: string, userId: string): Promise<ResultadoExclusaoRegistro> {
  const ref = doc(db, REGISTROS_COLLECTION, id)
  const parentPath = `${REGISTROS_COLLECTION}/${id}`
  await confirmWrite(
    'iniciar a exclusão do registro',
    updateDoc(ref, {
      exclusao: { status: 'em_andamento', iniciada_por: userId, iniciada_em: serverTimestamp() },
    })
  )

  const anexos = await listarAnexos(parentPath).catch((err) => {
    throw new Error(
      `A exclusão foi iniciada, mas não foi possível listar as fotos do registro (${describePersistenceError(err)}). ` +
        'Nada foi apagado; use “Concluir exclusão” para tentar de novo.'
    )
  })
  const { removidos, falhas } = await excluirAnexos(anexos, userId)

  if (falhas.length > 0) {
    await confirmWrite(
      'registrar a exclusão incompleta',
      updateDoc(ref, {
        exclusao: {
          status: 'incompleta',
          iniciada_por: userId,
          atualizado_em: serverTimestamp(),
          arquivos_pendentes: falhas.map((f) => f.nome),
        },
      })
    ).catch((err) => console.warn('Não foi possível registrar a exclusão incompleta:', err))
    return { status: 'parcial', removidos, falhas }
  }

  try {
    await confirmWrite('excluir o registro de atividade', deleteDoc(ref))
  } catch (err) {
    return {
      status: 'parcial',
      removidos,
      falhas: [{ nome: 'Registro principal', motivo: describePersistenceError(err) }],
    }
  }
  return { status: 'excluido', removidos }
}

