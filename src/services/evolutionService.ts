import {
  collection,
  doc,
  getDocs,
  limit,
  query,
  serverTimestamp,
  setDoc,
  where,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import { DEMO_EVOLUTION_STORAGE_KEY, isDemoModeEnabled } from '../lib/demoMode'
import { confirmWrite } from '../lib/persistence'
import type { UserRole } from '../types/auth'

const COLLECTION = 'registros_evolucao'

export type EvolutionArea =
  | 'cognitiva'
  | 'motora'
  | 'social'
  | 'comunicacao'
  | 'autonomia'
  | 'outra'

export const EVOLUTION_AREAS: { value: EvolutionArea; label: string }[] = [
  { value: 'cognitiva', label: 'Cognitiva' },
  { value: 'motora', label: 'Motora' },
  { value: 'social', label: 'Social' },
  { value: 'comunicacao', label: 'Comunicação' },
  { value: 'autonomia', label: 'Autonomia' },
  { value: 'outra', label: 'Outra' },
]

export const EVOLUTION_AREA_LABELS: Record<EvolutionArea, string> = {
  cognitiva: 'Cognitiva',
  motora: 'Motora',
  social: 'Social',
  comunicacao: 'Comunicação',
  autonomia: 'Autonomia',
  outra: 'Outra',
}

export type EvolucaoRegistro = {
  id: string
  alunoId: string
  dataRegistro: string
  profissionalUsuarioId: string
  profissionalNome: string
  area: EvolutionArea
  observacao: string
  criadoPor: string
  criadoEm?: string
  atualizadoPor: string
  atualizadoEm?: string
}

export type EvolucaoInput = {
  alunoId: string
  dataRegistro: string
  profissionalUsuarioId: string
  profissionalNome: string
  area: EvolutionArea
  observacao: string
}

function asTimestampISO(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const withToDate = value as { toDate?: () => Date }
    if (typeof withToDate.toDate === 'function') {
      try {
        return withToDate.toDate().toISOString()
      } catch {
        return undefined
      }
    }
    const seconds = (value as { seconds?: number }).seconds
    if (typeof seconds === 'number') return new Date(seconds * 1000).toISOString()
  }
  return undefined
}

function asEvolucao(id: string, data: Record<string, unknown>): EvolucaoRegistro {
  const area = data.area as EvolutionArea
  return {
    id,
    alunoId: String(data.aluno_id || ''),
    dataRegistro: String(data.data_registro || ''),
    profissionalUsuarioId: String(data.profissional_usuario_id || ''),
    profissionalNome: String(data.profissional_nome || ''),
    area: EVOLUTION_AREAS.some((item) => item.value === area) ? area : 'outra',
    observacao: String(data.observacao || ''),
    criadoPor: String(data.criado_por || ''),
    criadoEm: asTimestampISO(data.criado_em),
    atualizadoPor: String(data.atualizado_por || ''),
    atualizadoEm: asTimestampISO(data.atualizado_em),
  }
}

export function ordenarEvolucao(registros: EvolucaoRegistro[]): EvolucaoRegistro[] {
  return [...registros].sort((a, b) => {
    const porData = b.dataRegistro.localeCompare(a.dataRegistro)
    if (porData !== 0) return porData
    return (b.criadoEm || '').localeCompare(a.criadoEm || '')
  })
}

function getDemoEvolucao(): EvolucaoRegistro[] {
  try {
    const raw = localStorage.getItem(DEMO_EVOLUTION_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveDemoEvolucao(registros: EvolucaoRegistro[]) {
  try {
    localStorage.setItem(DEMO_EVOLUTION_STORAGE_KEY, JSON.stringify(registros))
  } catch {
    // No modo demonstração, a falha local não deve simular gravação no servidor.
    throw new Error('Não foi possível salvar a evolução neste navegador.')
  }
}

export function canReadEvolution(role?: UserRole | null): boolean {
  return role === 'direcao' || role === 'pedagogia' || role === 'administrativo'
}

export function canCreateEvolution(role?: UserRole | null): boolean {
  return role === 'direcao' || role === 'pedagogia'
}

export function validarEvolucao(input: EvolucaoInput): string | null {
  if (!input.alunoId.trim()) return 'Selecione um aluno.'

  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dataRegistro)) {
    return 'Informe uma data de registro válida.'
  }
  const data = new Date(`${input.dataRegistro}T00:00:00`)
  if (Number.isNaN(data.getTime()) || data.toISOString().slice(0, 10) !== input.dataRegistro) {
    return 'Informe uma data de registro válida.'
  }

  if (!EVOLUTION_AREAS.some((item) => item.value === input.area)) {
    return 'Selecione uma área de desenvolvimento válida.'
  }

  if (!input.profissionalUsuarioId.trim()) return 'O profissional responsável não está identificado.'
  if (!input.profissionalNome.trim()) return 'O nome do profissional responsável não está preenchido.'

  const observacao = input.observacao.trim()
  if (!observacao) return 'Informe a observação de evolução.'
  if (observacao.length > 5000) return 'A observação deve ter no máximo 5000 caracteres.'

  return null
}

export async function listarEvolucao(): Promise<EvolucaoRegistro[]> {
  if (isDemoModeEnabled()) return ordenarEvolucao(getDemoEvolucao())

  const snap = await getDocs(query(collection(db, COLLECTION), limit(500)))
  return ordenarEvolucao(
    snap.docs.map((item) => asEvolucao(item.id, item.data() as Record<string, unknown>))
  )
}

export async function listarEvolucaoAluno(alunoId: string): Promise<EvolucaoRegistro[]> {
  if (!alunoId) return []
  if (isDemoModeEnabled()) {
    return ordenarEvolucao(getDemoEvolucao().filter((registro) => registro.alunoId === alunoId))
  }

  const snap = await getDocs(
    query(collection(db, COLLECTION), where('aluno_id', '==', alunoId), limit(200))
  )
  return ordenarEvolucao(
    snap.docs.map((item) => asEvolucao(item.id, item.data() as Record<string, unknown>))
  )
}

export async function criarEvolucao(input: EvolucaoInput): Promise<EvolucaoRegistro> {
  const erro = validarEvolucao(input)
  if (erro) throw new Error(erro)

  const agora = new Date().toISOString()
  const registro: EvolucaoRegistro = {
    id: doc(collection(db, COLLECTION)).id,
    alunoId: input.alunoId,
    dataRegistro: input.dataRegistro,
    profissionalUsuarioId: input.profissionalUsuarioId,
    profissionalNome: input.profissionalNome.trim(),
    area: input.area,
    observacao: input.observacao.trim(),
    criadoPor: input.profissionalUsuarioId,
    criadoEm: agora,
    atualizadoPor: input.profissionalUsuarioId,
    atualizadoEm: agora,
  }

  if (isDemoModeEnabled()) {
    saveDemoEvolucao([registro, ...getDemoEvolucao()])
    return registro
  }

  await confirmWrite(
    'registrar a evolução do aluno',
    setDoc(doc(db, COLLECTION, registro.id), {
      aluno_id: registro.alunoId,
      data_registro: registro.dataRegistro,
      profissional_usuario_id: registro.profissionalUsuarioId,
      profissional_nome: registro.profissionalNome,
      area: registro.area,
      observacao: registro.observacao,
      criado_por: registro.criadoPor,
      criado_em: serverTimestamp(),
      atualizado_por: registro.atualizadoPor,
      atualizado_em: serverTimestamp(),
    })
  )

  return registro
}

