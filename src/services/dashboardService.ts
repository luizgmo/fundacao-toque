import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { docToRegistro } from './activitiesService'
import type { RegistroAtividade } from '../types/atividades'

export type AlunoFaltaRecorrente = {
  alunoId: string
  alunoNome: string
  turmaNome: string
  faltasConsecutivas: number
}

export type TimelineItem = {
  id: string
  horario: string
  autor: string
  texto: string
  data: string
}

function todayISO(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().split('T')[0]
}

function formatHorario(timestamp: unknown, fallbackDate: string, fallbackHora: string): string {
  try {
    const anyTs = timestamp as { toDate?: () => Date } | null
    if (anyTs && typeof anyTs.toDate === 'function') {
      const d = anyTs.toDate()
      const hoje = todayISO()
      const dataISO = d.toISOString().split('T')[0]
      const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      if (dataISO === hoje) return `Hoje, ${hora}`
      return `${d.toLocaleDateString('pt-BR')}, ${hora}`
    }
  } catch {
    // ignore
  }
  if (fallbackDate === todayISO()) return `Hoje, ${fallbackHora}`
  return `${fallbackDate} ${fallbackHora}`.trim()
}

// Conta documentos com filtro simples sem precisar de índice composto
async function countWhere(
  collectionName: string,
  field: string,
  value: string | boolean
): Promise<number> {
  const q = query(collection(db, collectionName), where(field, '==', value))
  const snap = await getDocs(q)
  return snap.size
}

// Resultado de uma métrica: o valor calculado ou o erro da consulta. Uma falha
// nunca é convertida em zero.
export type Metrica<T> = { ok: true; valor: T } | { ok: false; erro: Error }

async function metrica<T>(load: () => Promise<T>, nome: string): Promise<Metrica<T>> {
  try {
    return { ok: true, valor: await load() }
  } catch (err) {
    console.warn(`Não foi possível calcular ${nome}:`, err)
    return { ok: false, erro: err instanceof Error ? err : new Error(String(err)) }
  }
}

// Frequência média: lê até 200 sessões recentes e calcula % presentes.
// `null` significa que a consulta funcionou, mas não há presenças registradas.
async function calcularFrequenciaMedia(): Promise<number | null> {
  const q = query(collection(db, 'sessoes_chamada'), orderBy('data_chamada', 'desc'), limit(200))
  const snap = await getDocs(q)
  let presentes = 0
  let total = 0
  snap.forEach((d) => {
    const presencas = (d.data().presencas || {}) as Record<string, string>
    Object.values(presencas).forEach((status) => {
      total += 1
      if (status === 'presente') presentes += 1
    })
  })
  return total > 0 ? Math.round((presentes / total) * 100) : null
}

export type DashboardMetrics = {
  alunosAtivos: Metrica<number>
  turmasAtivas: Metrica<number>
  oficinasAtivas: Metrica<number>
  frequenciaMedia: Metrica<number | null>
}

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const [alunosAtivos, turmasAtivas, oficinasAtivas, frequenciaMedia] = await Promise.all([
    metrica(() => countWhere('alunos', 'status', 'ativo'), 'alunos ativos'),
    metrica(() => countWhere('turmas', 'ativo', true), 'turmas ativas'),
    metrica(() => countWhere('oficinas', 'ativo', true), 'oficinas ativas'),
    metrica(calcularFrequenciaMedia, 'frequência média'),
  ])
  return { alunosAtivos, turmasAtivas, oficinasAtivas, frequenciaMedia }
}

// Alunos com 3+ faltas consecutivas (lê sessoes_chamada recentes + nomes em alunos)
// Falhas de consulta são propagadas (não viram "nenhum aluno com faltas").
export async function getAlunosFaltasRecorrentes(limite = 5): Promise<AlunoFaltaRecorrente[]> {
  const q = query(collection(db, 'sessoes_chamada'), orderBy('data_chamada', 'desc'), limit(200))
  const snap = await getDocs(q)

  // Ordena sessões da mais antiga para a mais recente para calcular sequência
  const sessoes = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) }))
  const getStr = (s: Record<string, unknown>, key: string): string =>
    typeof s[key] === 'string' ? (s[key] as string) : ''
  const getMap = (s: Record<string, unknown>, key: string): Record<string, string> =>
    typeof s[key] === 'object' && s[key] !== null ? (s[key] as Record<string, string>) : {}
  sessoes.sort((a, b) => getStr(a, 'data_chamada').localeCompare(getStr(b, 'data_chamada')))

  const consecutivas = new Map<string, number>()
  sessoes.forEach((s) => {
    const presencas = getMap(s, 'presencas')
    const alunosNaSessao = new Set(Object.keys(presencas))
    // Zera quem estava presente/justificado; incrementa quem faltou
    alunosNaSessao.forEach((alunoId) => {
      const status = presencas[alunoId]
      if (status === 'ausente') {
        consecutivas.set(alunoId, (consecutivas.get(alunoId) || 0) + 1)
      } else {
        consecutivas.set(alunoId, 0)
      }
    })
  })

  const comFalta = [...consecutivas.entries()]
    .filter(([, n]) => n >= 3)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limite)

  if (comFalta.length === 0) return []

  // Busca nomes/turmas dos alunos
  const alunosSnap = await getDocs(collection(db, 'alunos'))
  const nomes = new Map<string, { nome: string; turma: string }>()
  alunosSnap.forEach((d) => {
    const data = d.data()
    nomes.set(d.id, {
      nome: data.nome_completo || 'Sem nome',
      turma: data.turma || data.turma_id || '—',
    })
  })

  return comFalta.map(([alunoId, faltas]) => ({
    alunoId,
    alunoNome: nomes.get(alunoId)?.nome || alunoId,
    turmaNome: nomes.get(alunoId)?.turma || '—',
    faltasConsecutivas: faltas,
  }))
}

export type UltimasAtualizacoes = {
  items: TimelineItem[]
  // Fontes que não puderam ser consultadas (a lista pode estar incompleta).
  fontesComFalha: string[]
}

// Últimas atualizações: mistura registros_atividade + sessoes_chamada + relatorios_pedagogicos.
// Se todas as fontes falharem, lança o erro; se só algumas falharem, informa quais.
export async function getUltimasAtualizacoes(maxItems = 6): Promise<UltimasAtualizacoes> {
  const fontes = [
    { nome: 'atividades', q: query(collection(db, 'registros_atividade'), orderBy('atualizado_em', 'desc'), limit(5)) },
    { nome: 'chamadas', q: query(collection(db, 'sessoes_chamada'), orderBy('atualizado_em', 'desc'), limit(5)) },
    { nome: 'relatórios', q: query(collection(db, 'relatorios_pedagogicos'), orderBy('atualizado_em', 'desc'), limit(5)) },
  ]
  const resultados = await Promise.allSettled(fontes.map((fonte) => getDocs(fonte.q)))
  const fontesComFalha = fontes.filter((_, i) => resultados[i].status === 'rejected').map((f) => f.nome)
  if (fontesComFalha.length === fontes.length) {
    throw (resultados[0] as PromiseRejectedResult).reason
  }
  const [regsSnap, sessoesSnap, relsSnap] = resultados.map((r) => (r.status === 'fulfilled' ? r.value : null))
  const items: TimelineItem[] = []

  regsSnap?.forEach((d) => {
    const data = d.data()
    const reg = docToRegistro(d.id, data)
    items.push({
      id: `reg_${d.id}`,
      horario: formatHorario(data.atualizado_em, reg.dataAtividade, ''),
      autor: data.usuario_responsavel_nome || 'Equipe',
      texto: `registrou atividade da turma ${reg.turmaId || '—'} em ${reg.dataAtividade || '—'}.`,
      data: reg.dataAtividade,
    })
  })

  sessoesSnap?.forEach((d) => {
    const data = d.data()
    items.push({
      id: `ses_${d.id}`,
      horario: formatHorario(data.atualizado_em, String(data.data_chamada || ''), ''),
      autor: String(data.registrado_por || 'Equipe'),
      texto: `registrou frequência (${String(data.escopo || 'turma')}) de ${String(data.data_chamada || '—')}.`,
      data: String(data.data_chamada || ''),
    })
  })

  relsSnap?.forEach((d) => {
    const data = d.data()
    const periodoInicio = String(data.periodo_inicio || '')
    const periodoFim = String(data.periodo_fim || '')
    items.push({
      id: `rel_${d.id}`,
      horario: formatHorario(data.atualizado_em, periodoFim, ''),
      autor: String(data.usuario_responsavel_nome || 'Equipe pedagógica'),
      texto: `atualizou relatório ${String(data.tipo_relatorio || '')} (${periodoInicio} a ${periodoFim}).`,
      data: periodoFim,
    })
  })

  return { items: items.slice(0, maxItems), fontesComFalha }
}

export type TarefaDoDia = {
  titulo: string
  prazo: string
  // null quando a consulta falhou: não se sabe se a tarefa foi feita.
  feito: boolean | null
  erro?: Error
}

// Tarefas de hoje: verifica se já existe chamada, atividade e relatório. Cada
// verificação que falhar aparece como "não verificada", nunca como pendente com zero.
export async function getTarefasDeHoje(): Promise<TarefaDoDia[]> {
  const hoje = todayISO()
  const [chamadas, atividades, relatorios] = await Promise.all([
    metrica(() => getDocs(query(collection(db, 'sessoes_chamada'), where('data_chamada', '==', hoje))).then((s) => s.size), 'chamadas de hoje'),
    metrica(() => getDocs(query(collection(db, 'registros_atividade'), where('data_atividade', '==', hoje))).then((s) => s.size), 'atividades de hoje'),
    metrica(() => getDocs(query(collection(db, 'relatorios_pedagogicos'), where('status', '==', 'concluido'), limit(50))).then((s) => s.size), 'relatórios concluídos'),
  ])

  const tarefa = (m: Metrica<number>, rotulo: (n: number) => string, base: string, prazo: string): TarefaDoDia =>
    m.ok
      ? { titulo: rotulo(m.valor), prazo, feito: m.valor > 0 }
      : { titulo: `${base} (não foi possível verificar)`, prazo, feito: null, erro: m.erro }

  return [
    tarefa(chamadas, (n) => `Frequência de hoje (${n} registrada${n === 1 ? '' : 's'})`, 'Frequência de hoje', 'Prazo: 12h00'),
    tarefa(atividades, (n) => `Atividades de hoje (${n} registrada${n === 1 ? '' : 's'})`, 'Atividades de hoje', 'Prazo: 17h00'),
    tarefa(relatorios, (n) => `Relatórios concluídos (${n})`, 'Relatórios concluídos', 'Prazo: sexta'),
  ]
}

export type { RegistroAtividade }
