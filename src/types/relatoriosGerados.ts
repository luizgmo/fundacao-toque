import type { PrestacaoContasFiltros } from './relatorios'

export type TipoRelatorioGerado = 'prestacao_contas'

export type StatusRelatorioGerado = 'processando' | 'concluido' | 'falhou'

export interface RelatorioGerado {
  id: string
  tipoRelatorio: TipoRelatorioGerado
  periodoInicio: string
  periodoFim: string
  /** `null` quando o documento antigo/corrompido não tem filtros utilizáveis. */
  filtros: PrestacaoContasFiltros | null
  status: StatusRelatorioGerado
  geradoPor: string
  geradoEm: string | null
}

export interface NovoRelatorioGeradoInput {
  tipoRelatorio: TipoRelatorioGerado
  periodoInicio: string
  periodoFim: string
  filtros: PrestacaoContasFiltros
  geradoPor: string
}
