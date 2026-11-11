import {
  collection,
  doc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import {
  DEMO_GENERATED_REPORTS_STORAGE_KEY,
  isDemoModeEnabled,
} from '../lib/demoMode'
import type { PrestacaoContasFiltros } from '../types/relatorios'
import type {
  NovoRelatorioGeradoInput,
  RelatorioGerado,
  StatusRelatorioGerado,
} from '../types/relatoriosGerados'

const COLLECTION = 'relatorios_gerados'
const LIST_LIMIT = 50

function timestampToISO(value: unknown): string | null {
  if (!value) return null
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const withToDate = value as { toDate?: () => Date }
    if (typeof withToDate.toDate === 'function') {
      try {
        return withToDate.toDate().toISOString()
      } catch {
        return null
      }
    }
    const seconds = (value as { seconds?: number }).seconds
    if (typeof seconds === 'number') return new Date(seconds * 1000).toISOString()
  }
  return null
}

function normalizarStatus(value: unknown): StatusRelatorioGerado {
  if (value === 'processando' || value === 'concluido' || value === 'falhou') return value
  // Valor desconhecido nunca pode ser exibido como concluído.
  return 'falhou'
}

function normalizarFiltros(value: unknown): PrestacaoContasFiltros | null {
  if (!value || typeof value !== 'object') return null
  const raw = value as Record<string, unknown>
  const periodoInicio =
    typeof raw.periodoInicio === 'string'
      ? raw.periodoInicio
      : typeof raw.periodo_inicio === 'string'
        ? raw.periodo_inicio
        : ''
  const periodoFim =
    typeof raw.periodoFim === 'string'
      ? raw.periodoFim
      : typeof raw.periodo_fim === 'string'
        ? raw.periodo_fim
        : ''
  const tipo = raw.tipo
  if (
    !periodoInicio ||
    !periodoFim ||
    !['consolidado', 'atividades', 'frequencia', 'fotos'].includes(String(tipo))
  ) {
    return null
  }
  return {
    periodoInicio,
    periodoFim,
    turmaIds: Array.isArray(raw.turmaIds)
      ? raw.turmaIds.filter((item): item is string => typeof item === 'string')
      : [],
    tipo: tipo as PrestacaoContasFiltros['tipo'],
    incluirFotos: raw.incluirFotos === true,
  }
}

function docToRelatorioGerado(id: string, data: Record<string, unknown>): RelatorioGerado {
  return {
    id,
    tipoRelatorio: 'prestacao_contas',
    periodoInicio: String(data.periodo_inicio || data.periodoInicio || ''),
    periodoFim: String(data.periodo_fim || data.periodoFim || ''),
    filtros: normalizarFiltros(data.filtros),
    status: normalizarStatus(data.status),
    geradoPor: String(data.gerado_por || data.geradoPor || ''),
    geradoEm: timestampToISO(data.gerado_em ?? data.geradoEm),
  }
}

function readDemoRecords(): RelatorioGerado[] {
  try {
    const raw = localStorage.getItem(DEMO_GENERATED_REPORTS_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.map((item) => {
      const rawItem = item as Record<string, unknown>
      return docToRelatorioGerado(
        String(rawItem.id || ''),
        rawItem as Record<string, unknown>
      )
    })
  } catch {
    return []
  }
}

function writeDemoRecords(records: RelatorioGerado[]) {
  try {
    localStorage.setItem(DEMO_GENERATED_REPORTS_STORAGE_KEY, JSON.stringify(records))
  } catch {
    // ignore
  }
}

function novoIdDemo(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `demo-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  }
}

export async function listarRelatoriosGerados(): Promise<RelatorioGerado[]> {
  if (isDemoModeEnabled()) {
    return readDemoRecords()
      .sort((a, b) => (b.geradoEm || '').localeCompare(a.geradoEm || ''))
      .slice(0, LIST_LIMIT)
  }

  const snapshot = await getDocs(
    query(collection(db, COLLECTION), orderBy('gerado_em', 'desc'), limit(LIST_LIMIT))
  )
  return snapshot.docs.map((item) => docToRelatorioGerado(item.id, item.data()))
}

export async function iniciarRelatorioGerado(
  input: NovoRelatorioGeradoInput
): Promise<string> {
  if (isDemoModeEnabled()) {
    const id = novoIdDemo()
    const records = readDemoRecords()
    records.push({
      id,
      tipoRelatorio: input.tipoRelatorio,
      periodoInicio: input.periodoInicio,
      periodoFim: input.periodoFim,
      filtros: input.filtros,
      status: 'processando',
      geradoPor: input.geradoPor,
      geradoEm: new Date().toISOString(),
    })
    writeDemoRecords(records)
    return id
  }

  const ref = doc(collection(db, COLLECTION))
  await setDoc(ref, {
    tipo_relatorio: input.tipoRelatorio,
    periodo_inicio: input.periodoInicio,
    periodo_fim: input.periodoFim,
    filtros: input.filtros,
    status: 'processando',
    gerado_por: input.geradoPor,
    gerado_em: serverTimestamp(),
  })
  return ref.id
}

async function atualizarStatusDemo(id: string, status: StatusRelatorioGerado) {
  const records = readDemoRecords()
  const updated = records.map((item) =>
    item.id === id
      ? { ...item, status, geradoEm: new Date().toISOString() }
      : item
  )
  writeDemoRecords(updated)
}

export async function concluirRelatorioGerado(id: string): Promise<void> {
  if (isDemoModeEnabled()) {
    await atualizarStatusDemo(id, 'concluido')
    return
  }
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'concluido',
    gerado_em: serverTimestamp(),
  })
}

export async function falharRelatorioGerado(id: string): Promise<void> {
  if (isDemoModeEnabled()) {
    await atualizarStatusDemo(id, 'falhou')
    return
  }
  await updateDoc(doc(db, COLLECTION, id), {
    status: 'falhou',
    gerado_em: serverTimestamp(),
  })
}
