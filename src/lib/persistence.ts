// Utilitários para confirmar gravações no Firestore e descrever falhas.
//
// Regra: a interface só confirma uma gravação depois que o servidor confirma.
// Sem rede, o SDK do Firestore mantém a escrita pendente indefinidamente em vez
// de rejeitar a promessa; por isso as gravações passam por `confirmWrite`, que
// transforma a falta de confirmação em erro explícito após um tempo limite.

export const WRITE_CONFIRMATION_TIMEOUT_MS = 20_000

export type PersistenceErrorCode =
  | 'permission-denied'
  | 'unauthenticated'
  | 'unavailable'
  | 'timeout'
  | 'too-large'
  | 'unknown'

export class PersistenceError extends Error {
  readonly code: PersistenceErrorCode
  readonly operation: string

  constructor(operation: string, code: PersistenceErrorCode, message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'PersistenceError'
    this.code = code
    this.operation = operation
  }
}

function firebaseCode(err: unknown, depth = 0): string {
  if (err && typeof err === 'object' && 'code' in err) {
    return String((err as { code: unknown }).code).replace(/^firestore\//, '')
  }
  // Erros embrulhados pelos serviços preservam o original em `cause`.
  if (depth < 3 && err instanceof Error && err.cause) return firebaseCode(err.cause, depth + 1)
  return ''
}

function classify(err: unknown): PersistenceErrorCode {
  if (err instanceof PersistenceError) return err.code
  switch (firebaseCode(err)) {
    case 'permission-denied':
      return 'permission-denied'
    case 'unauthenticated':
      return 'unauthenticated'
    case 'unavailable':
    case 'deadline-exceeded':
    case 'cancelled':
      return 'unavailable'
    case 'resource-exhausted':
    case 'invalid-argument':
      // Documento acima de 1 MiB e cotas estouradas chegam com esses códigos.
      return 'too-large'
    default:
      return 'unknown'
  }
}

const REASONS: Record<PersistenceErrorCode, string> = {
  'permission-denied': 'sem permissão para gravar esses dados (verifique o perfil do usuário)',
  unauthenticated: 'sessão expirada; entre novamente no sistema',
  unavailable: 'sem conexão com o servidor',
  timeout:
    'o servidor não confirmou a gravação a tempo (verifique a conexão; se ela voltar, a gravação ainda pode ser concluída — confira a lista antes de repetir)',
  'too-large': 'os dados excedem o limite aceito pelo banco',
  unknown: 'erro inesperado ao gravar',
}

// Motivo curto e legível de uma falha de persistência.
export function describePersistenceError(err: unknown): string {
  if (err instanceof PersistenceError) return err.message
  const code = classify(err)
  if (code === 'unknown' && err instanceof Error && err.message) return err.message
  return REASONS[code]
}

// Converte qualquer erro em PersistenceError, preservando a operação que falhou.
export function toPersistenceError(operation: string, err: unknown): PersistenceError {
  if (err instanceof PersistenceError) return err
  const code = classify(err)
  const reason = code === 'unknown' && err instanceof Error && err.message ? err.message : REASONS[code]
  return new PersistenceError(operation, code, reason, err)
}

// Aguarda a confirmação do servidor para uma gravação. Rejeita com
// PersistenceError quando o Firestore recusa a escrita ou quando não há
// confirmação dentro do tempo limite.
export async function confirmWrite<T>(
  operation: string,
  write: Promise<T>,
  timeoutMs = WRITE_CONFIRMATION_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(new PersistenceError(operation, 'timeout', REASONS.timeout))
    }, timeoutMs)
  })
  // Evita "unhandled rejection" se a escrita falhar depois do tempo limite.
  write.catch(() => undefined)
  try {
    return await Promise.race([write, timeout])
  } catch (err) {
    throw toPersistenceError(operation, err)
  } finally {
    clearTimeout(timer)
  }
}

// Mensagem padrão para a tela: qual operação falhou e por quê.
export function failureMessage(err: unknown, fallbackOperation: string): string {
  const operation = err instanceof PersistenceError ? err.operation : fallbackOperation
  return `Não foi possível ${operation}: ${describePersistenceError(err)}. Nada foi confirmado no sistema; os dados preenchidos foram mantidos para nova tentativa.`
}

// `indice` aponta para a posição do arquivo na lista enviada (ausente para
// falhas que não são de um arquivo específico).
export type ArquivoComFalha = { nome: string; motivo: string; indice?: number }

// Resultado explícito de operações compostas (registro principal + arquivos).
export type ResultadoPersistencia = {
  status: 'salvo' | 'parcial'
  enviados: string[]
  falhas: ArquivoComFalha[]
}

// ============================================================================
// Leitura: falhas de consulta nunca devem aparecer como "não há dados".
// ============================================================================

const READ_REASONS: Record<PersistenceErrorCode, string> = {
  'permission-denied': 'sem permissão para consultar esses dados',
  unauthenticated: 'sessão expirada; entre novamente no sistema',
  unavailable: 'sem conexão com o servidor',
  timeout: 'o servidor não respondeu a tempo',
  'too-large': 'a consulta excedeu o limite do banco',
  unknown: 'erro inesperado ao consultar o banco',
}

// Motivo curto e legível de uma falha de leitura.
export function describeLoadError(err: unknown): string {
  const code = classify(err)
  if (code === 'unknown' && err instanceof Error && err.message) {
    // Erros de índice ausente trazem mensagens longas com link; resume.
    if (/requires an index/i.test(err.message)) return 'a consulta depende de um índice ainda não criado no banco'
    return err.message
  }
  return READ_REASONS[code]
}
