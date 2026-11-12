import { doc, getDoc, setDoc, serverTimestamp } from 'firebase/firestore'
import { db } from '../lib/firebase'
import { isDemoModeEnabled } from '../lib/demoMode'

export const LIMITE_FALTAS_PADRAO = 3
export const CONFIGURACOES_DOC_ID = 'geral'

export type FonteLimite = 'configurado' | 'padrao'

export type LimiteFaltasResultado =
  | { ok: true; valor: number; fonte: FonteLimite }
  | { ok: false; erro: Error }

// Valor usado quando a Fundação ainda não configurou o limite. Só é aplicado
// depois que o perfil do usuário foi validado (leitura feita por quem já está
// autenticado no sistema).
export async function lerLimiteFaltasConsecutivas(): Promise<LimiteFaltasResultado> {
  if (isDemoModeEnabled()) {
    return { ok: true, valor: LIMITE_FALTAS_PADRAO, fonte: 'padrao' }
  }

  try {
    const snap = await getDoc(doc(db, 'configuracoes_sistema', CONFIGURACOES_DOC_ID))
    if (!snap.exists()) {
      return { ok: true, valor: LIMITE_FALTAS_PADRAO, fonte: 'padrao' }
    }

    const valor = Number(snap.data().limite_faltas_consecutivas)
    if (!Number.isFinite(valor) || valor < 0 || !Number.isInteger(valor)) {
      return { ok: true, valor: LIMITE_FALTAS_PADRAO, fonte: 'padrao' }
    }

    return { ok: true, valor, fonte: 'configurado' }
  } catch (err) {
    return {
      ok: false,
      erro: err instanceof Error ? err : new Error(String(err)),
    }
  }
}

// Retorna { valor, fonte } ou lança o erro, adequado a consultas pontuais
// (useQuery) que tratam falhas no estado de erro em vez de misturá-las com
// um valor válido.
export async function obterLimiteFaltas(): Promise<{
  valor: number
  fonte: 'configurado' | 'padrao'
}> {
  const resultado = await lerLimiteFaltasConsecutivas()
  if (!resultado.ok) throw resultado.erro
  return { valor: resultado.valor, fonte: resultado.fonte }
}

export async function salvarLimiteFaltasConsecutivas(
  valor: number,
  usuarioUid: string,
): Promise<void> {
  if (isDemoModeEnabled()) {
    return
  }

  await setDoc(
    doc(db, 'configuracoes_sistema', CONFIGURACOES_DOC_ID),
    {
      limite_faltas_consecutivas: valor,
      atualizado_por: usuarioUid,
      atualizado_em: serverTimestamp(),
    },
    { merge: true },
  )
}
