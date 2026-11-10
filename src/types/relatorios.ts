// Tipos da prestação de contas (relatórios_gerados + consolidação de atividades/frequência/fotos)

export type TipoRelatorioPrestacao =
  | 'consolidado'
  | 'atividades'
  | 'frequencia'
  | 'fotos'

export interface PrestacaoContasFiltros {
  periodoInicio: string
  periodoFim: string
  /** Vazio = todas as turmas. */
  turmaIds: string[]
  tipo: TipoRelatorioPrestacao
  incluirFotos: boolean
}

export interface RelatorioAlunoFrequencia {
  alunoId: string
  alunoNome: string
  turmaId: string
  turmaNome: string
  sessoes: number
  presentes: number
  ausentes: number
  justificados: number
  percentual: number
  semRegistro: boolean
}

export interface RelatorioTurmaFrequencia {
  turmaId: string
  turmaNome: string
  turmaCodigo: string
  periodo: string
  sessoes: number
  registros: number
  presentes: number
  ausentes: number
  justificados: number
  percentual: number
  alunos: RelatorioAlunoFrequencia[]
}

export interface RelatorioFoto {
  id: string
  atividadeId: string
  data: string
  turmaId: string
  turmaNome: string
  oficinas: string[]
  nomeArquivo: string
  legenda: string
  caminhoStorage: string
  url: string | null
}

export interface RelatorioAtividade {
  id: string
  data: string
  turmaId: string
  turmaNome: string
  oficinas: string[]
  responsavelId: string
  responsavelNome: string
  observacoes: string
  presenca: { presentes: number; total: number } | null
  fotos: RelatorioFoto[]
}

export interface RestricaoImagemTurma {
  turmaId: string
  turmaNome: string
  alunosSemAutorizacao: string[]
  /** Fotos da turma que deixaram de ser incluídas por falta de autorização. */
  fotosBloqueadas: number
}

export interface RelatorioPrestacaoResumo {
  alunosAtendidos: number
  alunosAtivos: number
  totalTurmas: number
  totalAtividades: number
  totalOficinasRealizadas: number
  totalSessoes: number
  totalFotos: number
  frequenciaMedia: number
  presentes: number
  ausentes: number
  justificados: number
}

export interface RelatorioPrestacaoDados {
  filtros: PrestacaoContasFiltros
  geradoEm: string
  periodoLabel: string
  resumo: RelatorioPrestacaoResumo
  turmas: RelatorioTurmaFrequencia[]
  atividades: RelatorioAtividade[]
  fotos: RelatorioFoto[]
  restricaoImagem: {
    possuiAlunoSemAutorizacao: boolean
    fotosBloqueadas: number
    turmas: RestricaoImagemTurma[]
  }
  avisos: string[]
}

// ==== Formatos "crus" lidos do Firestore (sem transformação de domínio) ====

export interface RelatorioTurmaRaw {
  id: string
  nome: string
  codigo: string
  periodo: string
  ativo: boolean
}

export interface RelatorioAlunoRaw {
  id: string
  nome: string
  status: string
  turmaId?: string | null
  turmaNome?: string | null
  usoImagemAutorizado: boolean
}

export interface RelatorioMatriculaRaw {
  alunoId: string
  turmaId: string
  status: string
}

export interface RelatorioOficinaRaw {
  id: string
  nome: string
  categoria: string
}

export interface RelatorioTurmaOficinaRaw {
  id: string
  turmaId: string
  oficinaId: string
  ativo: boolean
}

export interface RelatorioAtividadeRaw {
  id: string
  data: string
  turmaId: string
  idsTurmaOficinas: string[]
  responsavelId: string
  observacoes: string
}

export interface RelatorioAnexoRaw {
  id: string
  atividadeId: string
  tipoAnexo: 'imagem' | 'documento'
  caminhoStorage: string
  nomeArquivo: string
  legenda: string
  url: string | null
}

export interface RelatorioSessaoRaw {
  id: string
  data: string
  turmaId: string
  escopo: 'turma' | 'oficina'
  turmaOficinaId?: string | null
  oficinaNome?: string | null
  presencas: Record<string, string>
  observacoes: Record<string, string>
}

export interface RelatorioUsuarioRaw {
  id: string
  nome: string
}

export const TIPO_RELATORIO_LABELS: Record<TipoRelatorioPrestacao, string> = {
  consolidado: 'Consolidado (atividades, frequência e fotos)',
  atividades: 'Apenas atividades',
  frequencia: 'Apenas frequência',
  fotos: 'Apenas fotos',
}
