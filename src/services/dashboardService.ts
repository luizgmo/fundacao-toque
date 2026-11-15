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
  // Janela efetivamente consultada, para deixar o recorte visível na tela.
  janela: { sessoesLidas: number; limiteSessoes: number }
}

const LIMITE_SESSOES_FALTAS = 200

export type TimelineItem = {
  id: string
  horario: string
  autor: string
  texto: string
  data: string
}

function localDateISO(date: Date): string {
  const offset = date.getTimezoneOffset() * 60000
  return new Date(date.getTime() - offset).toISOString().split('T')[0]
}

function todayISO(): string {
  return localDateISO(new Date())
}

function localDateTimeMillis(
  value: unknown,
  fallbackDate: string,
  fallbackHora: string,
): number {
  const anyTs = value as { toDate?: () => Date } | null
  if (anyTs && typeof anyTs.toDate === 'function') {
    try {
      const data = anyTs.toDate()
      if (!Number.isNaN(data.getTime())) return data.getTime()
    } catch {
      // usa o fallback abaixo
    }
  }
  const [ano, mes, dia] = fallbackDate.split('-').map(Number)
  if (!ano || !mes || !dia) return 0
  const [hora, minuto] = fallbackHora.split(':').map(Number)
  const data = new Date(ano, mes - 1, dia, hora || 0, minuto || 0)
  return Number.isNaN(data.getTime()) ? 0 : data.getTime()
}

function formatHorario(timestamp: unknown, fallbackDate: string, fallbackHora: string): string {
  try {
    const anyTs = timestamp as { toDate?: () => Date } | null
    if (anyTs && typeof anyTs.toDate === 'function') {
      const d = anyTs.toDate()
      const dataISO = localDateISO(d)
      const hora = d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
      if (dataISO === todayISO()) return `Hoje, ${hora}`
      return `${d.toLocaleDateString('pt-BR')}, ${hora}`
    }
  } catch {
    // ignore
  }
  if (fallbackDate === todayISO()) return `Hoje, ${fallbackHora}`.trim()
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

export type PeriodoIndicador = {
  inicio: string
  fim: string
}

export type FrequenciaMedia = {
  // `null` significa que a consulta funcionou, mas não há registros no período.
  percentual: number | null
  presentes: number
  justificados: number
  ausentes: number
  registros: number
  sessoes: number
  periodo: PeriodoIndicador
}

// Frequência média do mês corrente: chamadas registradas do dia 1 até hoje.
// Justificadas contam como presença, conforme a regra documentada; a base é
// sempre exibida para permitir conferir o cálculo contra as chamadas.
async function calcularFrequenciaMedia(): Promise<FrequenciaMedia> {
  const fim = todayISO()
  const inicio = `${fim.slice(0, 7)}-01`
  const q = query(
    collection(db, 'sessoes_chamada'),
    where('data_chamada', '>=', inicio),
    where('data_chamada', '<=', fim),
  )
  const snap = await getDocs(q)
  let presentes = 0
  let justificados = 0
  let ausentes = 0
  let registros = 0
  snap.forEach((d) => {
    const presencas = (d.data().presencas || {}) as Record<string, string>
    Object.values(presencas).forEach((status) => {
      registros += 1
      if (status === 'presente') presentes += 1
      else if (status === 'justificado') justificados += 1
      else if (status === 'ausente') ausentes += 1
    })
  })
  return {
    percentual: registros > 0 ? Math.round(((presentes + justificados) / registros) * 100) : null,
    presentes,
    justificados,
    ausentes,
    registros,
    sessoes: snap.size,
    periodo: { inicio, fim },
  }
}

export type DashboardMetrics = {
  alunosAtivos: Metrica<number>
  turmasAtivas: Metrica<number>
  oficinasAtivas: Metrica<number>
  frequenciaMedia: Metrica<FrequenciaMedia>
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

type VinculoVigencia = {
  alunoId: string
  turmaId: string
  turmaOficinaId: string
  dataInicio: string
  dataFim: string
  status: string
}

function matriculaVigenteNaData(v: VinculoVigencia, data: string): boolean {
  if (v.dataInicio && data < v.dataInicio) return false
  if (v.status === 'ativo') return true
  return Boolean(v.dataFim && data <= v.dataFim)
}

function participacaoVigenteNaData(v: VinculoVigencia, data: string): boolean {
  if (v.dataInicio && data < v.dataInicio) return false
  if (v.status === 'ativo') return true
  return Boolean(v.dataFim && data <= v.dataFim)
}

// Só conta a presença/falta quando o aluno pertencia à turma na data. Quando
// não há nenhum vínculo importado (base legada), mantém o registro para não
// apagar o histórico anterior à migração de matrículas.
function montarElegibilidade(
  matriculas: VinculoVigencia[],
  alunoOficinas: VinculoVigencia[],
) {
  const porAluno = new Map<string, VinculoVigencia[]>()
  matriculas.forEach((v) => {
    const lista = porAluno.get(v.alunoId) ?? []
    lista.push(v)
    porAluno.set(v.alunoId, lista)
  })

  const oficinasPorChave = new Map<string, VinculoVigencia[]>()
  alunoOficinas.forEach((v) => {
    const chave = `${v.alunoId}|${v.turmaOficinaId}`
    const lista = oficinasPorChave.get(chave) ?? []
    lista.push(v)
    oficinasPorChave.set(chave, lista)
  })

  return (alunoId: string, sessao: SessaoChamadaResumo): boolean => {
    const doAluno = porAluno.get(alunoId)
    if (doAluno && doAluno.length > 0) {
      const daTurma = doAluno.some(
        (v) => v.turmaId === sessao.turma_id && matriculaVigenteNaData(v, sessao.data_chamada),
      )
      if (!daTurma) return false
    }

    if (sessao.escopo === 'turma') return true
    if (!sessao.turma_oficina_id) return false

    const daOficina = oficinasPorChave.get(`${alunoId}|${sessao.turma_oficina_id}`)
    if (daOficina && daOficina.length > 0) {
      return daOficina.some((v) => participacaoVigenteNaData(v, sessao.data_chamada))
    }
    // Base legada sem aluno_oficinas para este aluno: vale a matrícula.
    return true
  }
}

// Alunos com faltas consecutivas >= limite, calculadas por contexto
// (turma geral ou vínculo de oficina) e nunca misturando sessões
// incompatíveis. Falhas de consulta são propagadas: nunca viram "sem alertas".
export async function getAlunosFaltasRecorrentes(
  maxItens = 5,
  limiteFaltas = LIMITE_FALTAS_PADRAO,
): Promise<ResultadoFaltasRecorrentes> {
  const q = query(
    collection(db, 'sessoes_chamada'),
    orderBy('data_chamada', 'desc'),
    limit(LIMITE_SESSOES_FALTAS),
  )
  const [snap, matriculasSnap, alunoOficinasSnap] = await Promise.all([
    getDocs(q),
    getDocs(collection(db, 'matriculas')),
    getDocs(collection(db, 'aluno_oficinas')),
  ])

  const matriculas: (VinculoVigencia & { alunoId: string })[] = []
  matriculasSnap.forEach((d) => {
    const data = d.data()
    const alunoId = getStr(data, 'aluno_id')
    if (!alunoId) return
    matriculas.push({
      alunoId,
      turmaId: getStr(data, 'turma_id'),
      turmaOficinaId: '',
      dataInicio: getStr(data, 'data_inicio').slice(0, 10),
      dataFim: getStr(data, 'data_fim').slice(0, 10),
      status: getStr(data, 'status').toLowerCase(),
    })
  })

  const alunoOficinas: (VinculoVigencia & { alunoId: string })[] = []
  alunoOficinasSnap.forEach((d) => {
    const data = d.data()
    const alunoId = getStr(data, 'aluno_id')
    const turmaOficinaId = getStr(data, 'turma_oficina_id')
    if (!alunoId || !turmaOficinaId) return
    alunoOficinas.push({
      alunoId,
      turmaId: '',
      turmaOficinaId,
      dataInicio: getStr(data, 'data_inicio').slice(0, 10),
      dataFim: getStr(data, 'data_fim').slice(0, 10),
      status: getStr(data, 'status').toLowerCase(),
    })
  })

  const elegivel = montarElegibilidade(matriculas, alunoOficinas)

  const sessoes = snap.docs.map((d) => {
    const data = d.data() as Record<string, unknown>
    const presencas = getMap(data, 'presencas')
    const filtradas = Object.fromEntries(
      Object.entries(presencas).filter(([alunoId]) =>
        elegivel(alunoId, {
          id: d.id,
          data_chamada: getStr(data, 'data_chamada'),
          turma_id: getStr(data, 'turma_id'),
          escopo: getStr(data, 'escopo') === 'oficina' ? 'oficina' : 'turma',
          turma_oficina_id: getStr(data, 'turma_oficina_id') || undefined,
          presencas,
        }),
      ),
    )
    return {
      id: d.id,
      ...data,
      presencas: filtradas,
    } as unknown as SessaoChamadaResumo
  })

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

  const janela = { sessoesLidas: sessoes.length, limiteSessoes: LIMITE_SESSOES_FALTAS }

  if (alertas.length === 0) {
    return { alertas: [], limite: limiteFaltas, janela }
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
    janela,
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
  const ordemPorItem = new Map<string, number>()

  regsSnap?.forEach((d) => {
    const data = d.data()
    const reg = docToRegistro(d.id, data)
    const id = `reg_${d.id}`
    items.push({
      id,
      horario: formatHorario(data.atualizado_em, reg.dataAtividade, ''),
      autor: data.usuario_responsavel_nome || 'Equipe',
      texto: `registrou atividade da turma ${reg.turmaId || '—'} em ${reg.dataAtividade || '—'}.`,
      data: reg.dataAtividade,
    })
    ordemPorItem.set(id, localDateTimeMillis(data.atualizado_em, reg.dataAtividade, ''))
  })

  sessoesSnap?.forEach((d) => {
    const data = d.data()
    const id = `ses_${d.id}`
    items.push({
      id,
      horario: formatHorario(data.atualizado_em, String(data.data_chamada || ''), ''),
      autor: String(data.registrado_por || 'Equipe'),
      texto: `registrou frequência (${String(data.escopo || 'turma')}) de ${String(data.data_chamada || '—')}.`,
      data: String(data.data_chamada || ''),
    })
    ordemPorItem.set(
      id,
      localDateTimeMillis(data.atualizado_em, String(data.data_chamada || ''), ''),
    )
  })

  relsSnap?.forEach((d) => {
    const data = d.data()
    const periodoInicio = String(data.periodo_inicio || '')
    const periodoFim = String(data.periodo_fim || '')
    const id = `rel_${d.id}`
    items.push({
      id,
      horario: formatHorario(data.atualizado_em, periodoFim, ''),
      autor: String(data.usuario_responsavel_nome || 'Equipe pedagógica'),
      texto: `atualizou relatório ${String(data.tipo_relatorio || '')} (${periodoInicio} a ${periodoFim}).`,
      data: periodoFim,
    })
    ordemPorItem.set(id, localDateTimeMillis(data.atualizado_em, periodoFim, ''))
  })

  items.sort((a, b) => (ordemPorItem.get(b.id) ?? 0) - (ordemPorItem.get(a.id) ?? 0))
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
  const inicioDoDia = new Date()
  inicioDoDia.setHours(0, 0, 0, 0)
  const inicioDoDiaSeguinte = new Date(inicioDoDia)
  inicioDoDiaSeguinte.setDate(inicioDoDiaSeguinte.getDate() + 1)

  const [chamadas, atividades, relatorios] = await Promise.all([
    metrica(() => getDocs(query(collection(db, 'sessoes_chamada'), where('data_chamada', '==', hoje))).then((s) => s.size), 'chamadas de hoje'),
    metrica(() => getDocs(query(collection(db, 'registros_atividade'), where('data_atividade', '==', hoje))).then((s) => s.size), 'atividades de hoje'),
    metrica(
      () =>
        getDocs(
          query(
            collection(db, 'relatorios_pedagogicos'),
            where('status', '==', 'concluido'),
            where('atualizado_em', '>=', inicioDoDia),
            where('atualizado_em', '<', inicioDoDiaSeguinte),
          ),
        ).then((s) => s.size),
      'relatórios concluídos hoje',
    ),
  ])

  const tarefa = (m: Metrica<number>, rotulo: (n: number) => string, base: string, prazo: string): TarefaDoDia =>
    m.ok
      ? { titulo: rotulo(m.valor), prazo, feito: m.valor > 0 }
      : { titulo: `${base} (não foi possível verificar)`, prazo, feito: null, erro: m.erro }

  return [
    tarefa(chamadas, (n) => `Frequência de hoje (${n} registrada${n === 1 ? '' : 's'})`, 'Frequência de hoje', 'Prazo: 12h00'),
    tarefa(atividades, (n) => `Atividades de hoje (${n} registrada${n === 1 ? '' : 's'})`, 'Atividades de hoje', 'Prazo: 17h00'),
    tarefa(relatorios, (n) => `Relatórios concluídos hoje (${n})`, 'Relatórios concluídos hoje', 'Prazo: hoje'),
  ]
}

export type { RegistroAtividade }
