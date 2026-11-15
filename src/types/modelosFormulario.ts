export type TipoCampo = 'texto' | 'texto_longo' | 'numero' | 'booleano' | 'selecao' | 'data'

export type CampoFormulario = {
  chave: string
  rotulo: string
  tipo: TipoCampo
  obrigatorio: boolean
  opcoes: string[]
}

export type ModeloFormulario = {
  id: string
  nome: string
  tipo_modelo: string
  versao: number
  campos: CampoFormulario[]
  ativo: boolean
  criado_por: string
  criado_em: unknown
  atualizado_em: unknown
}

export type ModeloFormularioInput = Omit<ModeloFormulario, 'id' | 'criado_em' | 'atualizado_em'> & {
  id?: string
}

export const TIPOS_CAMPO: Record<TipoCampo, string> = {
  texto: 'Texto curto',
  texto_longo: 'Texto longo',
  numero: 'Número',
  booleano: 'Sim/Não',
  selecao: 'Seleção (múltipla escolha)',
  data: 'Data',
}

export const VALID_TIPOS_MODELO = ['avaliacao_pedagogica']

export const emptyCampo: CampoFormulario = {
  chave: '',
  rotulo: '',
  tipo: 'texto',
  obrigatorio: false,
  opcoes: [],
}

export const emptyModeloInput: ModeloFormularioInput = {
  nome: '',
  tipo_modelo: 'avaliacao_pedagogica',
  versao: 1,
  campos: [],
  ativo: true,
  criado_por: '',
}
