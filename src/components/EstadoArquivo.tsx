import type { EstadoConteudo } from '../services/anexosService'

// Estado de um arquivo selecionado na tela (antes/durante o envio)
export type EstadoEnvioArquivo = 'aguardando' | 'enviando' | 'enviado' | 'falhou'

const ROTULO_ENVIO: Record<EstadoEnvioArquivo, string> = {
  aguardando: 'Aguardando envio',
  enviando: 'Enviando…',
  enviado: 'Enviado',
  falhou: 'Falhou',
}

export function EstadoEnvioBadge({ estado, motivo }: { estado: EstadoEnvioArquivo; motivo?: string }) {
  return (
    <span className={`arquivo-estado ${estado}`} title={motivo}>
      {ROTULO_ENVIO[estado]}
      {estado === 'falhou' && motivo ? `: ${motivo}` : ''}
    </span>
  )
}

// Estado de um arquivo já gravado no banco
const ROTULO_CONTEUDO: Record<EstadoConteudo['estado'], string> = {
  disponivel: 'Disponível',
  envio_incompleto: 'Envio não concluído',
  conteudo_incompleto: 'Arquivo incompleto',
  erro_leitura: 'Não foi possível carregar',
}

export function EstadoConteudoBadge({ conteudo }: { conteudo: EstadoConteudo }) {
  const classe =
    conteudo.estado === 'disponivel' ? 'enviado' : conteudo.estado === 'erro_leitura' ? 'aguardando' : 'falhou'
  return (
    <span className={`arquivo-estado ${classe}`}>
      {ROTULO_CONTEUDO[conteudo.estado]}
      {conteudo.estado !== 'disponivel' ? `: ${conteudo.motivo}` : ''}
    </span>
  )
}
