export interface RegistroAtividade {
  id: string
  dataAtividade: string
  turmaId: string
  idsTurmaOficinas: string[]
  usuarioResponsavelId: string
  observacoesGerais: string
  totalAnexos: number
}

export interface Anexo {
  id: string
  tipoAnexo: 'imagem' | 'documento'
  caminhoFirestore: string
  nomeArquivoOriginal: string
  tipoConteudo: string
  legenda: string
}
