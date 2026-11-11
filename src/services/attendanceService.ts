import {
  collection,
  doc,
  getDoc,
  setDoc,
  runTransaction,
  query,
  where,
  serverTimestamp,
  onSnapshot,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { AttendanceSession, AttendanceStatus, ContactEntry } from '../features/alunos/students-data'
import { demoAttendanceSessions } from '../features/alunos/students-data'
import {
  DEMO_CONTACTS_STORAGE_KEY,
  DEMO_SESSIONS_STORAGE_KEY,
  isDemoModeEnabled,
} from '../lib/demoMode'
import { confirmWrite } from '../lib/persistence'
import { sessaoChamadaId, STATUS_PRESENCA } from '../features/frequencia/chamada'

const SESSOES_COLLECTION = 'sessoes_chamada'
const CONTATOS_COLLECTION = 'contatos_familia'

type DemoContact = ContactEntry & { studentId: string }

// Armazenamento local usado apenas no modo demonstração.
function readDemoSessions(): Record<string, AttendanceSession> {
  try {
    const raw = localStorage.getItem(DEMO_SESSIONS_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return { ...demoAttendanceSessions }
}

function writeDemoSessions(sessions: Record<string, AttendanceSession>) {
  try {
    localStorage.setItem(DEMO_SESSIONS_STORAGE_KEY, JSON.stringify(sessions))
  } catch {
    // ignore
  }
}

function readDemoContacts(): DemoContact[] {
  try {
    const raw = localStorage.getItem(DEMO_CONTACTS_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return []
}

function writeDemoContacts(contacts: DemoContact[]) {
  try {
    localStorage.setItem(DEMO_CONTACTS_STORAGE_KEY, JSON.stringify(contacts))
  } catch {
    // ignore
  }
}

export interface SaveSessionInput {
  id: string
  date: string
  turmaId: string
  scope: 'turma' | 'oficina'
  // ID do vínculo em turma_oficinas; obrigatório quando scope = 'oficina'
  turmaOficinaId?: string
  oficinaName?: string
  registeredBy: string
  records: Record<string, { status: AttendanceStatus; observation: string }>
  // Versão da sessão quando a tela a carregou; null = a sessão ainda não existia.
  versaoEsperada: number | null
}

// A sessão foi criada ou alterada por outra pessoa depois que a tela a carregou.
// Nada foi gravado: é preciso recarregar a chamada salva antes de salvar de novo.
export class ChamadaConflitoError extends Error {
  readonly code = 'conflito'
  constructor(message: string) {
    super(message)
    this.name = 'ChamadaConflitoError'
  }
}

function validarSessao(session: SaveSessionInput) {
  const esperado = sessaoChamadaId({
    data: session.date,
    turmaId: session.turmaId,
    escopo: session.scope,
    turmaOficinaId: session.turmaOficinaId,
  })
  if (session.id !== esperado) {
    throw new Error(`ID da chamada (${session.id}) não corresponde ao contexto (${esperado}).`)
  }
  Object.values(session.records).forEach((rec) => {
    if (!STATUS_PRESENCA.includes(rec.status)) throw new Error(`Status de presença inválido: ${rec.status}`)
  })
}

// Salva a sessão de chamada no Firestore (ou localmente no modo demonstração).
// O ID é determinístico por contexto (data + turma + escopo/vínculo), então
// cliques repetidos gravam sempre o mesmo documento. A transação confere a
// versão: se outra pessoa salvou depois que a tela carregou, nada é gravado e
// ChamadaConflitoError é lançado. Devolve a nova versão.
export async function saveAttendanceToFirestore(session: SaveSessionInput): Promise<number> {
  validarSessao(session)
  const presencasMap: Record<string, AttendanceStatus> = {}
  const observacoesMap: Record<string, string> = {}

  Object.entries(session.records).forEach(([studentId, rec]) => {
    presencasMap[studentId] = rec.status
    if (rec.observation) {
      observacoesMap[studentId] = rec.observation
    }
  })

  if (isDemoModeEnabled()) {
    const sessions = readDemoSessions()
    const versao = (sessions[session.id]?.versao ?? 0) + 1
    sessions[session.id] = {
      id: session.id,
      date: session.date,
      turmaId: session.turmaId,
      scope: session.scope,
      turmaOficinaId: session.turmaOficinaId,
      oficinaName: session.oficinaName,
      registeredBy: session.registeredBy,
      registeredAt: new Date().toISOString(),
      records: session.records,
      versao,
    }
    writeDemoSessions(sessions)
    return versao
  }

  const ref = doc(db, SESSOES_COLLECTION, session.id)
  const dados = {
    data_chamada: session.date,
    turma_id: session.turmaId,
    escopo: session.scope,
    turma_oficina_id: session.scope === 'oficina' ? session.turmaOficinaId : null,
    oficina_nome: session.oficinaName || null,
    presencas: presencasMap,
    observacoes: observacoesMap,
    registrado_por: session.registeredBy,
    atualizado_em: serverTimestamp(),
  }

  try {
    return await confirmWrite(
      'salvar a chamada',
      runTransaction(db, async (tx) => {
        const atual = await tx.get(ref)
        if (!atual.exists()) {
          if (session.versaoEsperada !== null) {
            throw new ChamadaConflitoError('A chamada carregada não existe mais no banco de dados.')
          }
          tx.set(ref, { ...dados, versao: 1, criado_em: serverTimestamp() })
          return 1
        }
        const versaoAtual = Number(atual.data().versao ?? 0)
        if (session.versaoEsperada === null || versaoAtual !== session.versaoEsperada) {
          const quem = atual.data().registrado_por
          throw new ChamadaConflitoError(
            `Esta chamada foi salva${quem ? ` por ${quem}` : ''} depois que você a abriu. ` +
              'Recarregue a chamada salva, confira e salve novamente.'
          )
        }
        tx.update(ref, { ...dados, versao: versaoAtual + 1 })
        return versaoAtual + 1
      })
    )
  } catch (err) {
    // confirmWrite embrulha a falha; o conflito precisa chegar intacto à tela,
    // que oferece "recarregar" em vez de "tentar novamente".
    const cause = (err as { cause?: unknown })?.cause
    if (cause instanceof ChamadaConflitoError) throw cause
    throw err
  }
}

function timestampToISO(value: unknown): string {
  const ts = value as { toDate?: () => Date } | null
  return ts && typeof ts.toDate === 'function' ? ts.toDate().toISOString() : ''
}

// Carrega a sessão do Firestore (ou do armazenamento local no modo demonstração).
// Retorna null somente quando a sessão não existe. Falhas de consulta são
// propagadas: "não consegui ler" não pode virar "chamada ainda não feita".
// Não há fallback para sessões fixas: fora do modo demonstração só vale o banco.
export async function getAttendanceFromFirestore(sessionId: string): Promise<AttendanceSession | null> {
  if (isDemoModeEnabled()) {
    return readDemoSessions()[sessionId] || null
  }

  const snap = await getDoc(doc(db, SESSOES_COLLECTION, sessionId))
  if (!snap.exists()) return null

  const data = snap.data()
  const records: Record<string, { status: AttendanceStatus; observation: string }> = {}
  const presencas = data.presencas || {}
  const observacoes = data.observacoes || {}

  Object.keys(presencas).forEach((studentId) => {
    records[studentId] = {
      status: presencas[studentId] as AttendanceStatus,
      observation: observacoes[studentId] || '',
    }
  })

  return {
    id: snap.id,
    date: data.data_chamada,
    turmaId: data.turma_id,
    scope: data.escopo === 'oficina' ? 'oficina' : 'turma',
    turmaOficinaId: data.turma_oficina_id || undefined,
    oficinaName: data.oficina_nome || undefined,
    registeredBy: data.registrado_por || 'Sistema',
    registeredAt: timestampToISO(data.atualizado_em),
    records,
    versao: Number(data.versao ?? 0),
  }
}

export interface SaveOccurrenceInput {
  studentId: string
  studentName: string
  faltaDate: string
  type: string
  responsible: string
  reason: string
  status: string
  note: string
  guardianId: string
  guardianSnapshot: { nome: string; parentesco: string; canal: string; contato: string }
}

// Salva contato com a família / ocorrência no Firestore (ou localmente no modo demonstração).
// O ID só é devolvido depois da confirmação do servidor. `contactId` permite que a
// tela reutilize o mesmo ID numa nova tentativa, evitando registros duplicados.
export async function saveOccurrenceToFirestore(
  input: SaveOccurrenceInput,
  contactId = `contato-${input.studentId}-${Date.now()}`
): Promise<string> {
  const todayStr = new Intl.DateTimeFormat('pt-BR').format(new Date())

  if (isDemoModeEnabled()) {
    const contacts = readDemoContacts()
    contacts.unshift({
      studentId: input.studentId,
      faltaDate: input.faltaDate,
      contactDate: todayStr,
      type: input.type,
      responsible: input.responsible,
      guardianId: input.guardianId,
      guardianName: input.guardianSnapshot.nome,
      guardianRelationship: input.guardianSnapshot.parentesco,
      guardianContact: input.guardianSnapshot.contato,
      reason: input.reason,
      status: input.status,
      note: input.note,
    })
    writeDemoContacts(contacts)
    return contactId
  }

  const docData = {
    aluno_id: input.studentId,
    aluno_nome: input.studentName,
    datas_faltas_relacionadas: [input.faltaDate],
    contatado_em: serverTimestamp(),
    data_formatada: todayStr,
    meio_contato: input.type,
    motivo_ocorrencia: input.reason,
    status_ocorrencia: input.status,
    observacoes: input.note,
    usuario_responsavel: input.responsible,
    usuario_responsavel_nome: input.responsible,
    responsavel_id: input.guardianId,
    responsavel_snapshot: input.guardianSnapshot,
    criado_em: serverTimestamp(),
  }

  await confirmWrite(
    'registrar a ocorrência / contato com a família',
    setDoc(doc(db, CONTATOS_COLLECTION, contactId), docData)
  )
  return contactId
}

// Escuta ocorrências de um aluno em tempo real (ou localmente no modo demonstração)
export function subscribeStudentOccurrences(
  studentId: string,
  onUpdate: (contacts: ContactEntry[]) => void,
  onError: (error: Error) => void
) {
  if (isDemoModeEnabled()) {
    const contacts = readDemoContacts()
      .filter((c) => c.studentId === studentId)
      .map((c) => ({
        faltaDate: c.faltaDate,
        contactDate: c.contactDate,
        type: c.type,
        responsible: c.responsible,
        guardianId: c.guardianId,
        guardianName: c.guardianName,
        guardianRelationship: c.guardianRelationship,
        guardianContact: c.guardianContact,
        reason: c.reason,
        status: c.status,
        note: c.note,
      }))
    onUpdate(contacts)
    return () => {}
  }

  const q = query(
    collection(db, CONTATOS_COLLECTION),
    where('aluno_id', '==', studentId)
  )

  return onSnapshot(
    q,
    (snapshot) => {
      const list: ContactEntry[] = []
      const orderedDocs = [...snapshot.docs].sort((a, b) => {
        const left = a.data().contatado_em?.toMillis?.() || 0
        const right = b.data().contatado_em?.toMillis?.() || 0
        return right - left
      })
      orderedDocs.forEach((snap) => {
        const d = snap.data()
        list.push({
          id: snap.id,
          faltaDate: (d.datas_faltas_relacionadas && d.datas_faltas_relacionadas[0]) || '—',
          contactDate: d.data_formatada || new Intl.DateTimeFormat('pt-BR').format(new Date()),
          type: d.meio_contato || 'Telefone',
          responsible: d.usuario_responsavel || 'Equipe',
          reason: d.motivo_ocorrencia || '',
          status: d.status_ocorrencia || 'Aberta',
          note: d.observacoes || '',
          guardianId: d.responsavel_id || undefined,
          guardianName: d.responsavel_snapshot?.nome || 'Responsável não identificado no registro original',
          guardianRelationship: d.responsavel_snapshot?.parentesco || '',
          guardianContact: d.responsavel_snapshot?.contato || '',
        })
      })
      onUpdate(list)
    },
    (err) => {
      console.warn('Erro ao escutar contatos no Firestore:', err)
      onError(err)
    }
  )
}
