import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore'
import { confirmWrite } from '../lib/persistence'
import { db } from '../lib/firebase'
import { excluirAnexos, listarAnexos, listarAnexosComConteudo } from './anexosService'
import type { ResultadoExclusaoAnexos } from './anexosService'
import type {
  AnexoRelatorioPedagogico,
  RelatorioPedagogico,
  RelatorioPedagogicoInput,
} from '../types/relatoriosPedagogicos'

const COLLECTION = 'relatorios_pedagogicos'
function asReport(id: string, data: Record<string, unknown>): RelatorioPedagogico {
  return {
    id,
    aluno_id: String(data.aluno_id || ''),
    tipo_relatorio: data.tipo_relatorio as RelatorioPedagogico['tipo_relatorio'],
    periodo_inicio: String(data.periodo_inicio || ''),
    periodo_fim: String(data.periodo_fim || ''),
    evolucao: String(data.evolucao || ''),
    dificuldades: String(data.dificuldades || ''),
    avancos: String(data.avancos || ''),
    encaminhamentos: String(data.encaminhamentos || ''),
    observacoes_finais: String(data.observacoes_finais || ''),
    usuario_responsavel_id: String(data.usuario_responsavel_id || ''),
    usuario_responsavel_nome: String(data.usuario_responsavel_nome || ''),
    modelo_formulario_id: typeof data.modelo_formulario_id === 'string' ? data.modelo_formulario_id : null,
    modelo_formulario_versao: typeof data.modelo_formulario_versao === 'number' ? data.modelo_formulario_versao : null,
    respostas: (data.respostas && typeof data.respostas === 'object' ? data.respostas : {}) as Record<string, string>,
    status: data.status === 'concluido' ? 'concluido' : 'rascunho',
    criado_em: data.criado_em,
    atualizado_em: data.atualizado_em,
  }
}

export function validarRelatorioPedagogico(input: RelatorioPedagogicoInput): string | null {
  if (!input.aluno_id.trim()) return 'Selecione um aluno.'
  if (!['diario', 'semestral', 'anual'].includes(input.tipo_relatorio)) return 'Selecione um tipo de relatório válido.'
  const start = new Date(`${input.periodo_inicio}T00:00:00`)
  const end = new Date(`${input.periodo_fim}T00:00:00`)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodo_inicio) || Number.isNaN(start.getTime()) || start.toISOString().slice(0, 10) !== input.periodo_inicio) return 'Informe uma data inicial válida.'
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.periodo_fim) || Number.isNaN(end.getTime()) || end.toISOString().slice(0, 10) !== input.periodo_fim) return 'Informe uma data final válida.'
  if (input.periodo_inicio > input.periodo_fim) return 'A data inicial deve ser anterior ou igual à data final.'
  if (!input.usuario_responsavel_id.trim()) return 'O profissional responsável não está identificado.'
  // RF02 ainda não define quais campos são obrigatórios para concluir; validar isso
  // aqui antes da aprovação institucional poderia bloquear relatórios legítimos.
  return null
}

export async function salvarRelatorio(input: RelatorioPedagogicoInput): Promise<string> {
  const error = validarRelatorioPedagogico(input)
  if (error) throw new Error(error)
  const id = input.id || doc(collection(db, COLLECTION)).id
  const reportRef = doc(db, COLLECTION, id)
  const existing = await getDoc(reportRef)
  const payload = {
    aluno_id: input.aluno_id,
    tipo_relatorio: input.tipo_relatorio,
    periodo_inicio: input.periodo_inicio,
    periodo_fim: input.periodo_fim,
    evolucao: input.evolucao.trim(),
    dificuldades: input.dificuldades.trim(),
    avancos: input.avancos.trim(),
    encaminhamentos: input.encaminhamentos.trim(),
    observacoes_finais: input.observacoes_finais.trim(),
    usuario_responsavel_id: input.usuario_responsavel_id,
    usuario_responsavel_nome: input.usuario_responsavel_nome,
    modelo_formulario_id: input.modelo_formulario_id ?? null,
    modelo_formulario_versao: input.modelo_formulario_versao ?? null,
    respostas: input.respostas,
    status: input.status,
    atualizado_em: serverTimestamp(),
    ...(!existing.exists() ? { criado_em: serverTimestamp() } : {}),
  }
  const operacao = input.status === 'concluido' ? 'concluir o relatório' : 'salvar o rascunho do relatório'
  if (existing.exists()) await confirmWrite(operacao, updateDoc(reportRef, payload))
  else await confirmWrite(operacao, setDoc(reportRef, payload))
  return id
}

// Reserva um ID para um relatório novo. A tela reutiliza esse ID nas novas
// tentativas para não duplicar o relatório caso uma gravação sem confirmação
// acabe chegando ao banco.
export function novoIdRelatorio(): string {
  return doc(collection(db, COLLECTION)).id
}

export async function listarRelatoriosDoAluno(alunoId: string): Promise<RelatorioPedagogico[]> {
  if (!alunoId) return []
  const q = query(collection(db, COLLECTION), where('aluno_id', '==', alunoId), limit(100))
  const snap = await getDocs(q)
  return snap.docs.map((item) => asReport(item.id, item.data() as Record<string, unknown>))
    .sort((a, b) => b.periodo_fim.localeCompare(a.periodo_fim))
}

export async function obterRelatorio(id: string): Promise<RelatorioPedagogico | null> {
  const snap = await getDoc(doc(db, COLLECTION, id))
  return snap.exists() ? asReport(snap.id, snap.data()) : null
}

// Anexos com o estado de cada arquivo (disponível, envio incompleto, conteúdo
// incompleto ou erro de leitura). Falha ao listar é propagada.
export async function listarAnexosRelatorio(id: string): Promise<AnexoRelatorioPedagogico[]> {
  return listarAnexosComConteudo(`${COLLECTION}/${id}`)
}

// Exclui anexos do relatório; devolve quais arquivos saíram e quais continuam.
export async function excluirAnexosRelatorio(
  anexos: AnexoRelatorioPedagogico[],
  userId: string
): Promise<ResultadoExclusaoAnexos> {
  return excluirAnexos(anexos, userId)
}

// Exclui o rascunho e seus anexos. Se algum anexo não sair, o rascunho é
// mantido (com os anexos restantes visíveis) para nova tentativa, em vez de
// apagar o pai e deixar arquivos órfãos.
export async function inativarRascunhoRelatorio(
  id: string,
  userId: string
): Promise<{ status: 'excluido' | 'parcial' } & ResultadoExclusaoAnexos> {
  const report = await obterRelatorio(id)
  if (!report || report.status !== 'rascunho') throw new Error('Somente rascunhos podem ser excluídos.')
  const anexos = await listarAnexos(`${COLLECTION}/${id}`)
  const resultado = await excluirAnexos(anexos, userId)
  if (resultado.falhas.length > 0) return { status: 'parcial', ...resultado }
  await confirmWrite('excluir o rascunho do relatório', deleteDoc(doc(db, COLLECTION, id)))
  return { status: 'excluido', ...resultado }
}
