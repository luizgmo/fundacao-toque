import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  PersistenceError,
  confirmWrite,
  describePersistenceError,
  failureMessage,
} from './persistence'

afterEach(() => {
  vi.useRealTimers()
})

describe('confirmWrite', () => {
  it('resolve quando o servidor confirma a gravação', async () => {
    await expect(confirmWrite('salvar teste', Promise.resolve('ok'))).resolves.toBe('ok')
  })

  it('converte erro de permissão em PersistenceError com a operação', async () => {
    const denied = Object.assign(new Error('Missing or insufficient permissions.'), {
      code: 'permission-denied',
    })
    const error = await confirmWrite('salvar a chamada', Promise.reject(denied)).catch((e) => e)
    expect(error).toBeInstanceOf(PersistenceError)
    expect(error.code).toBe('permission-denied')
    expect(error.operation).toBe('salvar a chamada')
    expect(error.message).toMatch(/sem permissão/)
  })

  it('converte erro de rede em PersistenceError', async () => {
    const offline = Object.assign(new Error('offline'), { code: 'unavailable' })
    const error = await confirmWrite('salvar', Promise.reject(offline)).catch((e) => e)
    expect(error.code).toBe('unavailable')
    expect(describePersistenceError(error)).toMatch(/sem conexão/)
  })

  it('falha quando a gravação fica pendente (sem rede) além do tempo limite', async () => {
    vi.useFakeTimers()
    const pendente = new Promise<void>(() => undefined)
    const resultado = confirmWrite('salvar o aluno', pendente, 1000).catch((e) => e)
    await vi.advanceTimersByTimeAsync(1000)
    const error = await resultado
    expect(error).toBeInstanceOf(PersistenceError)
    expect(error.code).toBe('timeout')
  })
})

describe('failureMessage', () => {
  it('informa a operação que falhou e que nada foi confirmado', () => {
    const error = new PersistenceError('registrar a atividade', 'unavailable', 'sem conexão com o servidor')
    const message = failureMessage(error, 'salvar')
    expect(message).toContain('registrar a atividade')
    expect(message).toContain('sem conexão')
    expect(message).not.toMatch(/sucesso/i)
  })
})
