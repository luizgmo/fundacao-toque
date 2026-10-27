export type TipoRelatorioPedagogico = 'diario' | 'semestral' | 'anual'

export type StatusRelatorioPedagogico = 'rascunho' | 'concluido'

export type AvaliacaoPorArea = {
  cognitivo: string
  motor: string
  social: string
  comunicacao: string
  autonomia: string
}

export type RelatorioPedagogico = {
  id: string
  alunoId: string
  tipoRelatorio: TipoRelatorioPedagogico
  periodoInicio: string
  periodoFim: string
  evolucao: string
  dificuldades: string
  avancos: string
  encaminhamentos: string
  observacoesFinais?: string
  avaliacaoPorArea: AvaliacaoPorArea
  usuarioResponsavelId: string
  usuarioResponsavelNome?: string
  modeloFormularioId?: string | null
  modeloFormularioVersao?: number | null
  status: StatusRelatorioPedagogico
  criadoEm?: unknown
  atualizadoEm?: unknown
  totalAnexos?: number
}

export type RelatorioPedagogicoInput = {
  alunoId: string
  tipoRelatorio: TipoRelatorioPedagogico
  periodoInicio: string
  periodoFim: string
  evolucao: string
  dificuldades: string
  avancos: string
  encaminhamentos: string
  observacoesFinais?: string
  avaliacaoPorArea: AvaliacaoPorArea
  usuarioResponsavelId: string
  usuarioResponsavelNome?: string
  status: StatusRelatorioPedagogico
}

export const TIPOS_RELATORIO_LABEL: Record<TipoRelatorioPedagogico, string> = {
  diario: 'Diário',
  semestral: 'Semestral',
  anual: 'Anual',
}

export function tipoRelatorioToFirestore(label: string): TipoRelatorioPedagogico {
  const normalized = label.trim().toLowerCase()
  if (normalized === 'diario' || normalized === 'diário') return 'diario'
  if (normalized === 'anual') return 'anual'
  return 'semestral'
}

export function tipoRelatorioToLabel(tipo: string): string {
  const normalized = tipo.trim().toLowerCase()
  if (normalized === 'diario' || normalized === 'diário') return 'Diário'
  if (normalized === 'anual') return 'Anual'
  return 'Semestral'
}
