import type { AttendanceStatus, Student } from '../alunos/students-data'
import type { AlunoOficina } from '../../types/oficinas'
import type { Turma } from '../../types/turmas'
import { studentBelongsToTurma } from '../../services/turmasService'

// Regra de chamada (modelagem.md, sessoes_chamada): uma sessão por data + turma +
// escopo. A chamada geral da turma e a chamada de cada oficina (vínculo
// turma-oficina) são documentos diferentes e nunca se sobrescrevem.

export type EscopoChamada = 'turma' | 'oficina'

export type ContextoChamada = {
  data: string // YYYY-MM-DD
  turmaId: string
  escopo: EscopoChamada
  turmaOficinaId?: string // obrigatório quando escopo = 'oficina'
}

export type RegistroPresenca = { status: AttendanceStatus; observation: string }

export const STATUS_PRESENCA: AttendanceStatus[] = ['presente', 'ausente', 'justificado']

// ID determinístico: YYYY-MM-DD_{turma_id}_geral ou YYYY-MM-DD_{turma_id}_{turma_oficina_id}.
// O mesmo contexto sempre gera o mesmo ID, então não existe segunda sessão para ele.
// As regras do Firestore exigem exatamente este formato na criação.
export function sessaoChamadaId(ctx: ContextoChamada): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ctx.data)) throw new Error('Data da chamada inválida.')
  if (!ctx.turmaId) throw new Error('Selecione a turma da chamada.')
  if (ctx.escopo === 'oficina') {
    if (!ctx.turmaOficinaId) throw new Error('Selecione a oficina da chamada.')
    return `${ctx.data}_${ctx.turmaId}_${ctx.turmaOficinaId}`
  }
  return `${ctx.data}_${ctx.turmaId}_geral`
}

// Data local (não UTC): às 22h de Brasília, toISOString() já seria o dia seguinte.
export function hojeLocalISO(now = new Date()): string {
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().split('T')[0]
}

// Participação do aluno na oficina vale na data se começou até ela e, quando
// encerrada/cancelada, terminou nela ou depois.
function participacaoVigente(a: AlunoOficina, data: string) {
  if (a.dataInicio && a.dataInicio > data) return false
  if (a.status === 'ativo') return true
  return Boolean(a.dataFim && a.dataFim >= data)
}

// Alunos elegíveis no contexto selecionado:
// - chamada geral: alunos ativos da turma;
// - chamada de oficina: alunos ativos da turma que participam do vínculo na data
//   (aluno_oficinas), e não a turma inteira.
export function alunosElegiveis(params: {
  students: Student[]
  turma: Turma | undefined
  escopo: EscopoChamada
  turmaOficinaId?: string
  alunoOficinas: AlunoOficina[]
  data: string
}): Student[] {
  const { students, turma, escopo, turmaOficinaId, alunoOficinas, data } = params
  if (!turma) return []
  const daTurma = students.filter((s) => s.status !== 'Inativo' && studentBelongsToTurma(s, turma))
  if (escopo === 'turma') return daTurma
  if (!turmaOficinaId) return []
  const participantes = new Set(
    alunoOficinas
      .filter((a) => a.turmaOficinaId === turmaOficinaId && participacaoVigente(a, data))
      .map((a) => a.alunoId)
  )
  return daTurma.filter((s) => participantes.has(s.id))
}

// Lista exibida: elegíveis + quem já está registrado na sessão salva (ex.: aluno
// que mudou de turma depois). Reabrir a data mostra exatamente o que foi salvo.
export function alunosDaChamada(
  elegiveis: Student[],
  todos: Student[],
  registrosSalvos: Record<string, RegistroPresenca> | null
): { student: Student; elegivel: boolean }[] {
  const ids = new Set(elegiveis.map((s) => s.id))
  const extras = Object.keys(registrosSalvos || {})
    .filter((id) => !ids.has(id))
    .map((id) => todos.find((s) => s.id === id))
    .filter((s): s is Student => Boolean(s))
  return [
    ...elegiveis.map((student) => ({ student, elegivel: true })),
    ...extras.map((student) => ({ student, elegivel: false })),
  ].sort((a, b) => a.student.name.localeCompare(b.student.name, 'pt-BR'))
}

// Presenças a gravar: todo aluno elegível (presente por padrão) com a observação
// digitada. Registros já salvos de quem não é mais elegível são mantidos como
// estavam, inclusive de alunos que não aparecem mais na lista (ex.: inativados).
export function montarPresencas(
  elegiveis: Student[],
  naTela: Record<string, RegistroPresenca>,
  registrosSalvos: Record<string, RegistroPresenca> | null
): Record<string, RegistroPresenca> {
  const resultado: Record<string, RegistroPresenca> = { ...(registrosSalvos || {}) }
  Object.entries(naTela).forEach(([id, registro]) => {
    if (resultado[id]) resultado[id] = { status: registro.status, observation: registro.observation.trim() }
  })
  elegiveis.forEach((s) => {
    const registro = naTela[s.id]
    resultado[s.id] = {
      status: registro?.status ?? 'presente',
      observation: (registro?.observation ?? '').trim(),
    }
  })
  return resultado
}
