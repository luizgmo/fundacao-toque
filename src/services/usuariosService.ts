import { collection, onSnapshot } from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { UserProfile, UserRole } from '../types/auth'

const USUARIOS_COLLECTION = 'usuarios'

// Escuta a equipe cadastrada (usada nos selects de profissional responsável)
export function subscribeToUsuarios(
  onSuccess: (usuarios: UserProfile[]) => void,
  onError?: (error: Error) => void
) {
  return onSnapshot(
    collection(db, USUARIOS_COLLECTION),
    (snapshot) => {
      const list: UserProfile[] = []
      snapshot.forEach((d) => {
        const data = d.data()
        list.push({
          uid: d.id,
          nome_completo: data.nome_completo || 'Sem nome',
          email: data.email || '',
          papel: (data.papel as UserRole) || 'administrativo',
          ativo: data.ativo !== false,
          trocar_senha: data.trocar_senha === true,
          criado_em: data.criado_em?.toDate?.()?.toLocaleDateString('pt-BR') || null,
        })
      })
      list.sort((a, b) => a.nome_completo.localeCompare(b.nome_completo, 'pt-BR'))
      onSuccess(list)
    },
    (err) => {
      console.warn('Erro ao escutar usuários no Firestore:', err)
      if (onError) onError(err)
      else onSuccess([])
    }
  )
}

export function getUsuarioNome(usuarios: UserProfile[], uid: string): string {
  return usuarios.find((u) => u.uid === uid)?.nome_completo || '—'
}
