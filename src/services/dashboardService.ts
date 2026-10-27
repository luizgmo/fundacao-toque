import {
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { docToRelatorio } from './relatoriosService'
import { docToRegistro } from './activitiesService'
import type { RelatorioPedagogico } from '../types/relatoriosPedagogicos'
import type { RegistroAtividade } from '../types/atividades'

export type DashboardMetrics = {
  alunosAtivos: number
  turmasAtivas: number
  oficinasAtivas: number
  frequenciaMedia: number | null
  totalSessoesFrequencia: number
}

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

export async function getDashboardMetrics(): Promise<DashboardMetrics> {
  const [alunosAtivos, turmasAtivas, oficinasAtivas] = await Promise.all([
    countWhere('alunos', 'status', 'ativo').catch(() => 0),
    countWhere('turmas', 'ativo', true).catch(() => 0),
    countWhere('oficinas', 'ativo', true).catch(() => 0),
  ])

  // Frequência média do mês: lê até 200 sessões recentes e calcula % presentes
  let frequenciaMedia: number | null = null
  let totalSessoesFrequencia = 0
  try {
    const q = query(
      collection(db, 'sessoes_chamada'),
      orderBy('data_chamada', 'desc'),
      limit(200)
    )
    const snap = await getDocs(q)
    totalSessoesFrequencia = snap.size
    let presentes = 0
    let total = 0
    snap.forEach((d) => {
      const presencas = (d.data().presencas || {}) as Record<string, string>
      Object.values(presencas).forEach((status) => {
        total += 1
        if (status === 'presente') presentes += 1
      })
    })
    if (total > 0) frequenciaMedia = Math.round((presentes / total) * 100)
  } catch (err) {
    console.warn('Não foi possível calcular frequência média:', err)
  }

  return { alunosAtivos, turmasAtivas, oficinasAtivas, frequenciaMedia, totalSessoesFrequencia }
}

// Alunos com 3+ faltas consecutivas (lê sessoes_chamada recentes + nomes em alunos)
export async function getAlunosFaltasRecorrentes(limite = 5): Promise<AlunoFaltaRecorrente[]> {
  try {
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
  } catch (err) {
    console.warn('Não foi possível carregar faltas recorrentes:', err)
    return []
  }
}

// Últimas atualizações: mistura registros_atividade + sessoes_chamada + relatorios_pedagogicos
export async function getUltimasAtualizacoes(maxItems = 6): Promise<TimelineItem[]> {
  const items: TimelineItem[] = []
  try {
    const [regsSnap, sessoesSnap, relsSnap] = await Promise.all([
      getDocs(query(collection(db, 'registros_atividade'), orderBy('atualizado_em', 'desc'), limit(5))).catch(() => null),
      getDocs(query(collection(db, 'sessoes_chamada'), orderBy('atualizado_em', 'desc'), limit(5))).catch(() => null),
      getDocs(query(collection(db, 'relatorios_pedagogicos'), orderBy('atualizado_em', 'desc'), limit(5))).catch(() => null),
    ])

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
      const rel: RelatorioPedagogico = docToRelatorio(d.id, data)
      items.push({
        id: `rel_${d.id}`,
        horario: formatHorario(data.atualizado_em, rel.periodoFim, ''),
        autor: rel.usuarioResponsavelNome || 'Equipe pedagógica',
        texto: `atualizou relatório ${rel.tipoRelatorio} (${rel.periodoInicio} a ${rel.periodoFim}).`,
        data: rel.periodoFim,
      })
    })
  } catch (err) {
    console.warn('Não foi possível carregar últimas atualizações:', err)
  }
  return items.slice(0, maxItems)
}

// Tarefas de hoje: verifica se já existe chamada e atividade registradas hoje
export async function getTarefasDeHoje(): Promise<
  { titulo: string; prazo: string; feito: boolean }[]
> {
  const hoje = todayISO()
  let chamadasHoje = 0
  let atividadesHoje = 0
  let relatoriosConcluidos = 0
  try {
    const [sessoesSnap, regsSnap, relsSnap] = await Promise.all([
      getDocs(query(collection(db, 'sessoes_chamada'), where('data_chamada', '==', hoje))).catch(() => null),
      getDocs(query(collection(db, 'registros_atividade'), where('data_atividade', '==', hoje))).catch(() => null),
      getDocs(query(collection(db, 'relatorios_pedagogicos'), where('status', '==', 'concluido'), limit(50))).catch(() => null),
    ])
    chamadasHoje = sessoesSnap?.size || 0
    atividadesHoje = regsSnap?.size || 0
    relatoriosConcluidos = relsSnap?.size || 0
  } catch (err) {
    console.warn('Não foi possível carregar tarefas de hoje:', err)
  }
  return [
    {
      titulo: `Frequência de hoje (${chamadasHoje} registrada${chamadasHoje === 1 ? '' : 's'})`,
      prazo: 'Prazo: 12h00',
      feito: chamadasHoje > 0,
    },
    {
      titulo: `Atividades de hoje (${atividadesHoje} registrada${atividadesHoje === 1 ? '' : 's'})`,
      prazo: 'Prazo: 17h00',
      feito: atividadesHoje > 0,
    },
    {
      titulo: `Relatórios concluídos (${relatoriosConcluidos})`,
      prazo: 'Prazo: sexta',
      feito: relatoriosConcluidos > 0,
    },
  ]
}

export type { RegistroAtividade }
