export type UserRole = 'direcao' | 'pedagogia' | 'administrativo'

export interface UserProfile {
  uid: string
  nome_completo: string
  email: string
  papel: UserRole
  ativo: boolean
  // true quando a conta foi criada pela Direção com senha provisória
  trocar_senha?: boolean
  criado_em?: string | null
  atualizado_em?: string | null
  ultimo_login_em?: string | null
}

export const ROLE_LABELS: Record<UserRole, string> = {
  direcao: 'Direção',
  pedagogia: 'Pedagoga',
  administrativo: 'Administrativo',
}

export const ROLE_DESCRIPTIONS: Record<UserRole, string> = {
  direcao: 'Acesso total, gestão de usuários da equipe, alunos, relatórios e configurações.',
  pedagogia: 'Acesso pedagógico, acompanhamento de evolução, frequência e relatórios.',
  administrativo: 'Cadastro de alunos, matrículas, gestão diária e apoio operacional.',
}
