export interface Oficina {
  id: string
  nome: string
  categoria: string
  descricao: string
  idsUsuariosResponsaveis: string[]
  ativo: boolean
}

// Horário semanal de um vínculo turma-oficina (modelagem.md: turma_oficinas.horarios)
export interface HorarioOficina {
  diaSemana: number // 1 = segunda ... 7 = domingo
  horaInicio: string // HH:mm
  horaFim: string // HH:mm
  validoDe?: string // YYYY-MM-DD (opcional)
  validoAte?: string // YYYY-MM-DD (opcional)
}

// Vínculo turma-oficina (coleção turma_oficinas) com horários embutidos.
// É a fonte da verdade para horários e responsáveis da oficina naquela turma.
export interface TurmaOficina {
  id: string
  turmaId: string
  oficinaId: string
  idsUsuariosResponsaveis: string[]
  ativo: boolean
  horarios: HorarioOficina[]
  inativadoEm?: string // YYYY-MM-DD, quando o vínculo foi encerrado
}

export type AlunoOficinaStatus = 'ativo' | 'concluido' | 'cancelado'

// Vínculo individual do aluno a uma oficina dentro da turma (coleção aluno_oficinas)
export interface AlunoOficina {
  id: string
  alunoId: string
  turmaOficinaId: string
  dataInicio: string
  dataFim?: string // YYYY-MM-DD, quando a participação foi encerrada/cancelada
  status: AlunoOficinaStatus
  nivelSuporte: string
  consideracoesPedagogicas: string
}

export const CATEGORIAS_OFICINA: { id: string; label: string; emoji: string }[] = [
  { id: 'musicalizacao', label: 'Musicalização', emoji: '🎵' },
  { id: 'danca', label: 'Dança', emoji: '💃' },
  { id: 'culinaria', label: 'Culinária', emoji: '🍳' },
  { id: 'horta', label: 'Horta/NEMA', emoji: '🌱' },
  { id: 'artes', label: 'Artes', emoji: '🎨' },
  { id: 'esporte', label: 'Esporte', emoji: '⚽' },
  { id: 'alfabetizacao', label: 'Alfabetização', emoji: '📚' },
  { id: 'informatica', label: 'Informática', emoji: '🖥️' },
  { id: 'outra', label: 'Outra', emoji: '✨' },
]

// 1 = segunda ... 7 = domingo (ISO 8601), conforme modelagem.md
export const DIAS_SEMANA: { id: number; label: string; curto: string }[] = [
  { id: 1, label: 'Segunda', curto: 'Seg' },
  { id: 2, label: 'Terça', curto: 'Ter' },
  { id: 3, label: 'Quarta', curto: 'Qua' },
  { id: 4, label: 'Quinta', curto: 'Qui' },
  { id: 5, label: 'Sexta', curto: 'Sex' },
  { id: 6, label: 'Sábado', curto: 'Sáb' },
  { id: 7, label: 'Domingo', curto: 'Dom' },
]

export const NIVEIS_SUPORTE = ['Baixo', 'Moderado', 'Alto']

export function getCategoria(id: string) {
  return (
    CATEGORIAS_OFICINA.find((c) => c.id === id) || { id, label: id || 'Outra', emoji: '✨' }
  )
}

// Converte "YYYY-MM-DD" para o dia da semana ISO (1 = segunda ... 7 = domingo)
export function isoWeekday(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  const day = new Date(y, m - 1, d).getDay()
  return day === 0 ? 7 : day
}

const HORA_RE = /^([01]\d|2[0-3]):[0-5]\d$/
const DATA_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/

export const MAX_HORARIOS_POR_VINCULO = 7
export const MAX_RESPONSAVEIS_POR_VINCULO = 20

function dataValida(value: string) {
  if (!DATA_RE.test(value)) return false
  const [y, m, d] = value.split('-').map(Number)
  const date = new Date(y, m - 1, d)
  return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d
}

function nomeDia(dia: number) {
  return DIAS_SEMANA.find((d) => d.id === dia)?.label || `dia ${dia}`
}

// Valida os horários semanais conforme modelagem.md. Devolve a primeira
// mensagem de erro ou null quando tudo está correto.
export function validarHorarios(horarios: HorarioOficina[]): string | null {
  if (horarios.length === 0) return 'Informe ao menos um horário semanal.'
  if (horarios.length > MAX_HORARIOS_POR_VINCULO) {
    return `Informe no máximo ${MAX_HORARIOS_POR_VINCULO} horários por vínculo.`
  }
  for (const [index, h] of horarios.entries()) {
    const n = `Horário ${index + 1}`
    if (!Number.isInteger(h.diaSemana) || h.diaSemana < 1 || h.diaSemana > 7) {
      return `${n}: escolha o dia da semana (segunda a domingo).`
    }
    if (!HORA_RE.test(h.horaInicio) || !HORA_RE.test(h.horaFim)) {
      return `${n}: informe início e fim no formato HH:mm.`
    }
    if (h.horaInicio >= h.horaFim) {
      return `${n}: o início (${h.horaInicio}) deve ser antes do fim (${h.horaFim}).`
    }
    if (h.validoDe && !dataValida(h.validoDe)) return `${n}: a data "válido de" é inválida.`
    if (h.validoAte && !dataValida(h.validoAte)) return `${n}: a data "válido até" é inválida.`
    if (h.validoDe && h.validoAte && h.validoDe > h.validoAte) {
      return `${n}: a vigência termina antes de começar.`
    }
  }
  // Mesmo dia com horários sobrepostos e vigências que se cruzam
  for (let i = 0; i < horarios.length; i++) {
    for (let j = i + 1; j < horarios.length; j++) {
      const a = horarios[i]
      const b = horarios[j]
      if (a.diaSemana !== b.diaSemana) continue
      const horasCruzam = a.horaInicio < b.horaFim && b.horaInicio < a.horaFim
      const vigenciasCruzam =
        (a.validoAte || '9999-12-31') >= (b.validoDe || '0000-01-01') &&
        (b.validoAte || '9999-12-31') >= (a.validoDe || '0000-01-01')
      if (horasCruzam && vigenciasCruzam) {
        return `Os horários ${i + 1} e ${j + 1} se sobrepõem na ${nomeDia(a.diaSemana).toLowerCase()}.`
      }
    }
  }
  return null
}

export function validarResponsaveisVinculo(ids: string[]): string | null {
  if (ids.length === 0) return 'Selecione ao menos um profissional responsável pelo vínculo.'
  if (ids.length > MAX_RESPONSAVEIS_POR_VINCULO) {
    return `Selecione no máximo ${MAX_RESPONSAVEIS_POR_VINCULO} responsáveis.`
  }
  return null
}

// O horário vale na data (YYYY-MM-DD) se ela estiver dentro da vigência
export function horarioVigenteEm(h: HorarioOficina, data: string) {
  return (!h.validoDe || h.validoDe <= data) && (!h.validoAte || data <= h.validoAte)
}

// O vínculo tem horário previsto no dia da semana da data, dentro da vigência
export function vinculoPrevistoEm(vinculo: TurmaOficina, data: string) {
  if (!data) return false
  const dia = isoWeekday(data)
  return vinculo.horarios.some((h) => h.diaSemana === dia && horarioVigenteEm(h, data))
}

// Vínculos que podem receber novos registros (chamada, atividade): vínculo
// ativo da turma cuja oficina também está ativa. Vínculos inativos continuam
// existindo para o histórico, mas não aparecem aqui.
export function vinculosAtivosDaTurma(
  vinculos: TurmaOficina[],
  oficinas: Oficina[],
  turmaId: string
): { vinculo: TurmaOficina; oficina: Oficina }[] {
  return vinculos
    .filter((v) => v.turmaId === turmaId && v.ativo)
    .map((v) => ({ vinculo: v, oficina: oficinas.find((o) => o.id === v.oficinaId) }))
    .filter((item): item is { vinculo: TurmaOficina; oficina: Oficina } =>
      Boolean(item.oficina && item.oficina.ativo)
    )
    .sort((a, b) => a.oficina.nome.localeCompare(b.oficina.nome, 'pt-BR'))
}

// Vínculo já gravado para o par turma/oficina, independentemente do ID do
// documento (dados antigos ou de seed podem não seguir o padrão turma__oficina).
// Prefere o ativo; senão devolve o inativo mais recente para ser reativado.
export function vinculoDoPar(
  vinculos: TurmaOficina[],
  turmaId: string,
  oficinaId: string
): TurmaOficina | undefined {
  const doPar = vinculos.filter((v) => v.turmaId === turmaId && v.oficinaId === oficinaId)
  return (
    doPar.find((v) => v.ativo) ||
    [...doPar].sort((a, b) => (b.inativadoEm || '').localeCompare(a.inativadoEm || ''))[0]
  )
}

function formatDataBR(data: string) {
  const [y, m, d] = data.split('-')
  return `${d}/${m}/${y}`
}

export function formatVigencia(h: HorarioOficina): string {
  if (h.validoDe && h.validoAte) return `de ${formatDataBR(h.validoDe)} a ${formatDataBR(h.validoAte)}`
  if (h.validoDe) return `a partir de ${formatDataBR(h.validoDe)}`
  if (h.validoAte) return `até ${formatDataBR(h.validoAte)}`
  return ''
}

// Ex.: "Seg/Qua 08:00–09:00 · Sex 14:00–15:30 (até 30/06/2026)"
export function formatHorarios(horarios: HorarioOficina[]): string {
  if (horarios.length === 0) return 'Sem horário definido'
  const grupos = new Map<string, number[]>()
  ;[...horarios]
    .sort((a, b) => a.diaSemana - b.diaSemana || a.horaInicio.localeCompare(b.horaInicio))
    .forEach((h) => {
      const vigencia = formatVigencia(h)
      const chave = `${h.horaInicio}–${h.horaFim}${vigencia ? ` (${vigencia})` : ''}`
      grupos.set(chave, [...(grupos.get(chave) || []), h.diaSemana])
    })
  return [...grupos.entries()]
    .map(([chave, dias]) => {
      const nomes = dias.map((d) => DIAS_SEMANA.find((x) => x.id === d)?.curto || '?').join('/')
      return `${nomes} ${chave}`
    })
    .join(' · ')
}
