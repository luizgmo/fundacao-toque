import { useCallback, useEffect, useState } from 'react'

export type LoadStatus = 'loading' | 'ready' | 'error'

// Assinatura no formato dos serviços: entrega dados ou erro, e devolve a função
// que cancela a escuta.
export type Subscribe<T> = (onData: (data: T) => void, onError: (error: Error) => void) => () => void

export type SubscriptionState<T> = {
  status: LoadStatus
  data: T
  error: Error | null
  retry: () => void
}

type Snapshot<T> = { key: string; status: LoadStatus; data: T; error: Error | null }

// Mantém estados separados para carregando, erro e dados recebidos. A tela
// decide o "vazio" olhando `status === 'ready'` e o tamanho dos dados — um erro
// nunca é convertido em lista vazia. `retry` refaz a assinatura (o onSnapshot
// do Firestore encerra a escuta depois de um erro).
//
// `depsKey` identifica os parâmetros da consulta: quando muda, a assinatura é
// refeita e o estado volta para "loading".
export function useSubscription<T>(
  subscribe: Subscribe<T>,
  initialData: T,
  depsKey = ''
): SubscriptionState<T> {
  // Referência estável: um `[]` novo a cada render invalidaria memos e efeitos.
  const [initial] = useState(initialData)
  const [attempt, setAttempt] = useState(0)
  const key = `${attempt}|${depsKey}`
  const [snapshot, setSnapshot] = useState<Snapshot<T>>({
    key,
    status: 'loading',
    data: initial,
    error: null,
  })

  useEffect(() => {
    let active = true
    const unsubscribe = subscribe(
      (data) => {
        if (active) setSnapshot({ key, status: 'ready', data, error: null })
      },
      (error) => {
        if (active) setSnapshot({ key, status: 'error', data: initial, error })
      }
    )
    return () => {
      active = false
      unsubscribe()
    }
    // A assinatura é refeita apenas quando a chave muda (novos parâmetros ou retry).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  const retry = useCallback(() => setAttempt((current) => current + 1), [])

  // Enquanto a nova assinatura não responde, o estado anterior não vale mais.
  if (snapshot.key !== key) return { status: 'loading', data: initial, error: null, retry }
  return { status: snapshot.status, data: snapshot.data, error: snapshot.error, retry }
}

// Versão para consultas pontuais (Promise) com o mesmo contrato de estados.
export function useQuery<T>(
  load: () => Promise<T>,
  initialData: T,
  depsKey = ''
): SubscriptionState<T> {
  return useSubscription<T>(
    (onData, onError) => {
      let cancelled = false
      load().then(
        (data) => !cancelled && onData(data),
        (error: unknown) =>
          !cancelled && onError(error instanceof Error ? error : new Error(String(error)))
      )
      return () => {
        cancelled = true
      }
    },
    initialData,
    depsKey
  )
}

// Status de um valor que depende de várias fontes: erro se alguma falhou,
// carregando se alguma ainda não respondeu.
export function combineStatus(...statuses: LoadStatus[]): LoadStatus {
  if (statuses.includes('error')) return 'error'
  if (statuses.includes('loading')) return 'loading'
  return 'ready'
}

// Formata um número calculado a partir de dados carregados: "…" enquanto
// carrega e "—" quando a consulta falhou (nunca exibe zero no lugar do erro).
export function formatLoadedCount(value: number, status: LoadStatus): string {
  if (status === 'loading') return '…'
  if (status === 'error') return '—'
  return String(value)
}
