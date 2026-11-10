export type TipoRelatorioPedagogico = 'diario' | 'semestral' | 'anual'
export type StatusRelatorioPedagogico = 'rascunho' | 'concluido'

export type RelatorioPedagogico = {
  id: string
  aluno_id: string
  tipo_relatorio: TipoRelatorioPedagogico
  periodo_inicio: string
  periodo_fim: string
  evolucao: string
  dificuldades: string
  avancos: string
  encaminhamentos: string
  observacoes_finais: string
  usuario_responsavel_id: string
  usuario_responsavel_nome: string
  modelo_formulario_id: string | null
  modelo_formulario_versao: number | null
  respostas: Record<string, string>
  status: StatusRelatorioPedagogico
  criado_em: unknown
  atualizado_em: unknown
}

export type RelatorioPedagogicoInput = Omit<
  RelatorioPedagogico,
  'id' | 'criado_em' | 'atualizado_em' | 'modelo_formulario_id' | 'modelo_formulario_versao'
> & { id?: string; modelo_formulario_id?: string | null; modelo_formulario_versao?: number | null }

export type AnexoRelatorioPedagogico = {
  id: string
  tipo_anexo: 'imagem' | 'documento'
  nome_arquivo_original: string
  tipo_conteudo: string
  url: string | null
  caminho_firestore: string
}
