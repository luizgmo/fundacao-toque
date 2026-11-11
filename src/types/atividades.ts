export interface RegistroAtividade {
  id: string
  dataAtividade: string
  turmaId: string
  idsTurmaOficinas: string[]
  usuarioResponsavelId: string
  observacoesGerais: string
  totalAnexos: number
  // Exclusão iniciada e não concluída (algum arquivo não pôde ser removido)
  exclusao: { status: 'em_andamento' | 'incompleta'; arquivosPendentes: string[] } | null
}

export interface Anexo {
  id: string
  tipoAnexo: 'imagem' | 'documento'
  caminhoFirestore: string
  nomeArquivoOriginal: string
  tipoConteudo: string
  legenda: string
}
