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
import { LIMITE_FALTAS_PADRAO } from './configuracaoService'
import type { RegistroAtividade } from '../types/atividades'

export type AlunoFaltaAlerta = {
  alunoId: string
  alunoNome: string
  turmaNome: string
  escopo: 'turma' | 'oficina'
  turmaOficinaId?: string
  oficinaNome?: string
  // Quantidade de faltas consecutivas no contexto (escopo) selecionado.
  faltasConsecutivas: number
  // Sessões que compõem a sequência corrente, da mais antiga para a mais recente.
  sessoes: {
    id: string
    data: string
    turmaId: string
    escopo: 'turma' | 'oficina'
    turmaOficinaId?: string
  }[]
}

export type ResultadoFaltasRecorrentes = {
  alertas: AlunoFaltaAlerta[]
  // Limite aplicado (configurado na Fundação ou o padrão).
  limite: number
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

export type SessaoChamadaResumo = {
  id: string
  data_chamada: string
  turma_id: string
  escopo: 'turma' | 'oficina'
  turma_oficina_id?: string
  presencas: Record<string, string>
}

function getStr(s: Record<string, unknown>, key: string): string {
  return typeof s[key] === 'string' ? (s[key] as string) : ''
}

function getMap(s: Record<string, unknown>, key: string): Record<string, string> {
  const valor = s[key]
  return typeof valor === 'object' && valor !== null ? (valor as Record<string, string>) : {}
}

// Agrupa sessões por contexto compatível (turma + escopo + vínculo da oficina)
// para nunca misturar sequências de contextos distintos.
export function agruparSessoes(
  sessoes: SessaoChamadaResumo[],
): Map<string, SessaoChamadaResumo[]> {
  const grupos = new Map<string, SessaoChamadaResumo[]>()
  sessoes.forEach((s) => {
    const chave = `${s.turma_id}|${s.escopo}|${s.turma_oficina_id ?? 'geral'}`
    const grupo = grupos.get(chave) ?? []
    grupo.push(s)
    grupos.set(chave, grupo)
  })
  return grupos
}

// Sequência corrente do aluno dentro de um contexto: apenas 'ausente'
// incrementa; 'presente' e 'justificado' interrompem a sequência. Sessões em
// que o aluno não foi registrado não alteram a sequência.
export function sequenciaDoContexto(
  grupo: SessaoChamadaResumo[],
): Map<string, { count: number; sessoes: string[]; ultimaData: string }> {
  const sequencias = new Map<string, { count: number; sessoes: string[]; ultimaData: string }>()

  const ordenadas = [...grupo].sort((a, b) =>
    getStr(a, 'data_chamada').localeCompare(getStr(b, 'data_chamada')),
  )

  ordenadas.forEach((s) => {
    const presencas = getMap(s, 'presencas')
    Object.keys(presencas).forEach((alunoId) => {
      const estado = presencas[alunoId]
      const atual = sequencias.get(alunoId) ?? { count: 0, sessoes: [], ultimaData: '' }
      if (estado === 'ausente') {
        sequencias.set(alunoId, {
          count: atual.count + 1,
          sessoes: [...atual.sessoes, s.id],
          ultimaData: getStr(s, 'data_chamada'),
        })
      } else {
        sequencias.set(alunoId, { count: 0, sessoes: [], ultimaData: atual.ultimaData })
      }
    })
  })

  return sequencias
}

// Alunos com faltas consecutivas >= limite, calculadas por contexto
// (turma geral ou vínculo de oficina) e nunca misturando sessões
// incompatíveis. Falhas de consulta são propagadas: nunca viram "sem alertas".
export async function getAlunosFaltasRecorrentes(
  maxItens = 5,
  limiteFaltas = LIMITE_FALTAS_PADRAO,
): Promise<ResultadoFaltasRecorrentes> {
  const q = query(collection(db, 'sessoes_chamada'), orderBy('data_chamada', 'desc'), limit(200))
  const snap = await getDocs(q)

  const sessoes = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Record<string, unknown>),
  })) as SessaoChamadaResumo[]

  // Melhor sequência corrente de cada aluno entre todos os seus contextos.
  const melhorPorAluno = new Map<
    string,
    { count: number; sessoes: string[]; ultimaData: string; chave: string }
  >()

  for (const grupo of agruparSessoes(sessoes).values()) {
    const sequencias = sequenciaDoContexto(grupo)
    const chave = `${grupo[0].turma_id}|${grupo[0].escopo}|${grupo[0].turma_oficina_id ?? 'geral'}`
    sequencias.forEach((seq, alunoId) => {
      if (seq.count === 0) return
      const atual = melhorPorAluno.get(alunoId)
      if (
        !atual ||
        seq.count > atual.count ||
        (seq.count === atual.count && seq.ultimaData > atual.ultimaData)
      ) {
        melhorPorAluno.set(alunoId, {
          count: seq.count,
          sessoes: seq.sessoes,
          ultimaData: seq.ultimaData,
          chave,
        })
      }
    })
  }

  const alertas = [...melhorPorAluno.entries()]
    .filter(([, seq]) => seq.count >= limiteFaltas)
    .sort((a, b) => {
      if (b[1].count !== a[1].count) return b[1].count - a[1].count
      return b[1].ultimaData.localeCompare(a[1].ultimaData)
    })
    .slice(0, maxItens)

  if (alertas.length === 0) {
    return { alertas: [], limite: limiteFaltas }
  }

  // Nomes dos alunos e de turmas/oficinas para exibir no alerta.
  const [alunosSnap, turmasSnap, oficinasSnap, vinculosSnap] = await Promise.all([
    getDocs(collection(db, 'alunos')),
    getDocs(collection(db, 'turmas')),
    getDocs(collection(db, 'oficinas')),
    getDocs(collection(db, 'turma_oficinas')),
  ])

  const nomesAlunos = new Map<string, { nome: string; turma: string }>()
  alunosSnap.forEach((d) => {
    const data = d.data()
    nomesAlunos.set(d.id, {
      nome: data.nome_completo || 'Sem nome',
      turma: data.turma || data.turma_id || '—',
    })
  })

  const nomesTurmas = new Map<string, string>()
  turmasSnap.forEach((d) => {
    nomesTurmas.set(d.id, String(d.data().nome || d.id))
  })

  const nomesOficinas = new Map<string, string>()
  oficinasSnap.forEach((d) => {
    nomesOficinas.set(d.id, String(d.data().nome || d.id))
  })

  const vinculos = new Map<string, { oficinaId: string }>()
  vinculosSnap.forEach((d) => {
    const data = d.data()
    vinculos.set(d.id, { oficinaId: data.oficina_id || '' })
  })

  const resumoSessao = (s: SessaoChamadaResumo) => ({
    id: s.id,
    data: s.data_chamada,
    turmaId: s.turma_id,
    escopo: s.escopo,
    turmaOficinaId: s.turma_oficina_id,
  })

  return {
    alertas: alertas.map(([alunoId, seq]) => {
      const partes = seq.chave.split('|')
      const turmaId = partes[0]
      const escopo = partes[1] as 'turma' | 'oficina'
      const turmaOficinaId = partes[2]
      const infoAluno = nomesAlunos.get(alunoId) ?? { nome: alunoId, turma: '—' }
      const oficinaId =
        escopo === 'oficina' ? vinculos.get(turmaOficinaId)?.oficinaId : undefined

      const sessoesDoAlerta = seq.sessoes.map((id) => {
        const sessao = sessoes.find((s) => s.id === id)
        if (sessao) return resumoSessao(sessao)
        return {
          id,
          data: '',
          turmaId,
          escopo,
          turmaOficinaId: escopo === 'oficina' ? turmaOficinaId : undefined,
        }
      })

      return {
        alunoId,
        alunoNome: infoAluno.nome,
        turmaNome: infoAluno.turma || nomesTurmas.get(turmaId) || '—',
        escopo,
        turmaOficinaId: escopo === 'oficina' ? turmaOficinaId : undefined,
        oficinaNome:
          escopo === 'oficina' && oficinaId ? nomesOficinas.get(oficinaId) || '—' : undefined,
        faltasConsecutivas: seq.count,
        sessoes: sessoesDoAlerta,
      }
    }),
    limite: limiteFaltas,
  }
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
