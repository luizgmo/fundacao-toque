import { RefreshCw } from 'lucide-react'
import { DataNotice } from './DataNotice'
import { describeLoadError } from '../lib/persistence'

type Props = {
  // O que não pôde ser carregado, ex.: "as turmas".
  what: string
  error: unknown
  onRetry?: () => void
  // Consequência para a tela, ex.: "As contagens de alunos podem estar incompletas."
  impact?: string
}

// Erro de carregamento com ação de nova tentativa. Nunca usar uma lista vazia
// no lugar deste aviso.
export function LoadError({ what, error, onRetry, impact }: Props) {
  return (
    <DataNotice kind="error">
      <span role="alert">
        Não foi possível carregar {what}: {describeLoadError(error)}.{impact ? ` ${impact}` : ''}
      </span>
      {onRetry && (
        <>
          {' '}
          <button
            className="button secondary"
            onClick={onRetry}
            style={{ marginLeft: 6, padding: '2px 10px', fontSize: '12px' }}
            type="button"
          >
            <RefreshCw size={13} /> Tentar novamente
          </button>
        </>
      )}
    </DataNotice>
  )
}

type Source = { what: string; status: string; error: unknown; retry: () => void }

// Agrupa falhas de dados auxiliares (selects, contagens) num único aviso.
export function LoadErrors({ sources, impact }: { sources: Source[]; impact?: string }) {
  const failed = sources.filter((source) => source.status === 'error')
  if (failed.length === 0) return null
  const what = failed.map((source) => source.what).join(', ')
  return (
    <LoadError
      error={failed[0].error}
      impact={impact}
      onRetry={() => failed.forEach((source) => source.retry())}
      what={what}
    />
  )
}
