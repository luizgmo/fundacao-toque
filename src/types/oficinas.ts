export interface Oficina {
  id: string
  nome: string
  categoria: string
  descricao: string
  idsUsuariosResponsaveis: string[]
  ativo: boolean
}

export interface HorarioOficina {
  diaSemana: number
  horaInicio: string
  horaFim: string
}

// Vínculo turma-oficina (coleção turma_oficinas) com horários embutidos
export interface TurmaOficina {
  id: string
  turmaId: string
  oficinaId: string
  idsUsuariosResponsaveis: string[]
  ativo: boolean
  horarios: HorarioOficina[]
}

export type AlunoOficinaStatus = 'ativo' | 'concluido' | 'cancelado'

// Vínculo individual do aluno a uma oficina dentro da turma (coleção aluno_oficinas)
export interface AlunoOficina {
  id: string
  alunoId: string
  turmaOficinaId: string
  dataInicio: string
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

export function formatHorarios(horarios: HorarioOficina[]): string {
  if (horarios.length === 0) return 'Sem horário definido'
  const dias = horarios
    .map((h) => DIAS_SEMANA.find((d) => d.id === h.diaSemana)?.curto || '?')
    .join('/')
  const { horaInicio, horaFim } = horarios[0]
  return `${dias} — ${horaInicio} às ${horaFim}`
}
