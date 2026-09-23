export type TurmaPeriodo = 'manha' | 'tarde' | 'integral'

export interface Turma {
  id: string
  codigo: string
  nome: string
  periodo: TurmaPeriodo
  idsUsuariosResponsaveis: string[]
  dataInicio: string
  dataFim: string
  ativo: boolean
}

export const PERIODO_LABELS: Record<TurmaPeriodo, string> = {
  manha: 'Manhã (8h–12h)',
  tarde: 'Tarde (13h–17h)',
  integral: 'Integral (8h–17h)',
}
