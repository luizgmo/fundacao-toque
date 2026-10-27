import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import type { DocumentData } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { uploadAnexo } from './activitiesService'
import type {
  AvaliacaoPorArea,
  RelatorioPedagogico,
  RelatorioPedagogicoInput,
  StatusRelatorioPedagogico,
  TipoRelatorioPedagogico,
} from '../types/relatoriosPedagogicos'

const RELATORIOS_COLLECTION = 'relatorios_pedagogicos'

export function docToRelatorio(id: string, data: DocumentData): RelatorioPedagogico {
  const respostas: DocumentData = data.respostas || {}
  const avaliacao = respostas.avaliacao_por_area || {}
  const avaliacaoPorArea: AvaliacaoPorArea = {
    cognitivo: avaliacao.cognitivo || avaliacao.cognitive || 'Não avaliado',
    motor: avaliacao.motor || 'Não avaliado',
    social: avaliacao.social || 'Não avaliado',
    comunicacao: avaliacao.comunicacao || avaliacao.communication || 'Não avaliado',
    autonomia: avaliacao.autonomia || avaliacao.autonomy || 'Não avaliado',
  }
  return {
    id,
    alunoId: data.aluno_id || '',
    tipoRelatorio: (data.tipo_relatorio as TipoRelatorioPedagogico) || 'semestral',
    periodoInicio: data.periodo_inicio || '',
    periodoFim: data.periodo_fim || '',
    evolucao: data.evolucao || '',
    dificuldades: data.dificuldades || '',
    avancos: data.avancos || '',
    encaminhamentos: data.encaminhamentos || '',
    observacoesFinais: respostas.observacoes_finais || '',
    avaliacaoPorArea,
    usuarioResponsavelId: data.usuario_responsavel_id || '',
    usuarioResponsavelNome: data.usuario_responsavel_nome || '',
    modeloFormularioId: data.modelo_formulario_id || null,
    modeloFormularioVersao: data.modelo_formulario_versao ?? null,
    status: (data.status as StatusRelatorioPedagogico) || 'rascunho',
    criadoEm: data.criado_em,
    atualizadoEm: data.atualizado_em,
    totalAnexos: data.total_anexos ?? 0,
  }
}

function inputToFirestore(input: RelatorioPedagogicoInput, userId: string) {
  return {
    aluno_id: input.alunoId,
    tipo_relatorio: input.tipoRelatorio,
    periodo_inicio: input.periodoInicio,
    periodo_fim: input.periodoFim,
    evolucao: input.evolucao.trim() || null,
    dificuldades: input.dificuldades.trim() || null,
    avancos: input.avancos.trim() || null,
    encaminhamentos: input.encaminhamentos.trim() || null,
    usuario_responsavel_id: input.usuarioResponsavelId,
    usuario_responsavel_nome: input.usuarioResponsavelNome?.trim() || null,
    modelo_formulario_id: null,
    modelo_formulario_versao: null,
    respostas: {
      avaliacao_por_area: {
        cognitivo: input.avaliacaoPorArea.cognitivo,
        motor: input.avaliacaoPorArea.motor,
        social: input.avaliacaoPorArea.social,
        comunicacao: input.avaliacaoPorArea.comunicacao,
        autonomia: input.avaliacaoPorArea.autonomia,
      },
      observacoes_finais: input.observacoesFinais?.trim() || null,
    },
    status: input.status,
    atualizado_por: userId,
    atualizado_em: serverTimestamp(),
  }
}

// Escuta os relatórios de um aluno (mais recentes primeiro)
export function subscribeToRelatoriosDoAluno(
  alunoId: string,
  onSuccess: (relatorios: RelatorioPedagogico[]) => void,
  onError?: (error: Error) => void
) {
  if (!alunoId) {
    onSuccess([])
    return () => {}
  }
  const q = query(
    collection(db, RELATORIOS_COLLECTION),
    where('aluno_id', '==', alunoId),
    orderBy('periodo_fim', 'desc')
  )
  return onSnapshot(
    q,
    (snapshot) => {
      const list: RelatorioPedagogico[] = []
      snapshot.forEach((docSnap) => {
        list.push(docToRelatorio(docSnap.id, docSnap.data()))
      })
      onSuccess(list)
    },
    (err) => {
      console.warn('Erro ao escutar relatorios_pedagogicos:', err)
      if (onError) onError(err)
      else onSuccess([])
    }
  )
}

// Escuta os relatórios mais recentes (para Dashboard / histórico geral)
export function subscribeToRelatoriosRecentes(
  onSuccess: (relatorios: RelatorioPedagogico[]) => void,
  onError?: (error: Error) => void,
  maxItems = 20
) {
  const q = query(
    collection(db, RELATORIOS_COLLECTION),
    orderBy('atualizado_em', 'desc'),
    limit(maxItems)
  )
  return onSnapshot(
    q,
    (snapshot) => {
      const list: RelatorioPedagogico[] = []
      snapshot.forEach((docSnap) => {
        list.push(docToRelatorio(docSnap.id, docSnap.data()))
      })
      onSuccess(list)
    },
    (err) => {
      console.warn('Erro ao escutar relatórios recentes:', err)
      if (onError) onError(err)
      else onSuccess([])
    }
  )
}

// Busca única (sem realtime) — útil para montar o Dashboard
export async function getRelatoriosRecentes(maxItems = 50): Promise<RelatorioPedagogico[]> {
  const q = query(
    collection(db, RELATORIOS_COLLECTION),
    orderBy('atualizado_em', 'desc'),
    limit(maxItems)
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => docToRelatorio(d.id, d.data()))
}

export async function getRelatoriosDoAluno(alunoId: string): Promise<RelatorioPedagogico[]> {
  const q = query(
    collection(db, RELATORIOS_COLLECTION),
    where('aluno_id', '==', alunoId),
    orderBy('periodo_fim', 'desc')
  )
  const snap = await getDocs(q)
  return snap.docs.map((d) => docToRelatorio(d.id, d.data()))
}

// Cria um relatório (rascunho ou já concluído)
export async function createRelatorio(
  input: RelatorioPedagogicoInput,
  userId: string
): Promise<string> {
  const id = `rel_${input.alunoId}_${input.tipoRelatorio}_${Date.now().toString().slice(-6)}`
  await setDoc(doc(db, RELATORIOS_COLLECTION, id), {
    ...inputToFirestore(input, userId),
    criado_por: userId,
    criado_em: serverTimestamp(),
  })
  return id
}

// Atualiza um relatório existente (mantém criado_por/criado_em)
export async function updateRelatorio(
  id: string,
  input: RelatorioPedagogicoInput,
  userId: string
): Promise<void> {
  await updateDoc(doc(db, RELATORIOS_COLLECTION, id), inputToFirestore(input, userId))
}

// Cria ou atualiza: se já existe rascunho do mesmo aluno+tipo+período, atualiza; senão cria.
// Retorna o ID do documento gravado.
export async function saveRelatorio(
  input: RelatorioPedagogicoInput,
  userId: string,
  relatorioId?: string | null
): Promise<string> {
  if (relatorioId) {
    await updateRelatorio(relatorioId, input, userId)
    return relatorioId
  }
  return createRelatorio(input, userId)
}

export async function deleteRelatorio(id: string): Promise<void> {
  await deleteDoc(doc(db, RELATORIOS_COLLECTION, id))
}

// Envia anexo do relatório (PDF/imagem) para o Storage + subcoleção anexos
export async function uploadAnexoRelatorio(
  relatorioId: string,
  file: File,
  userId: string
): Promise<string> {
  return uploadAnexo(`${RELATORIOS_COLLECTION}/${relatorioId}`, file, userId)
}
