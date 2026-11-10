import {
  collection,
  doc,
  getDoc,
  setDoc,
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
}

// Salva sessão de chamada no Firestore (ou localmente no modo demonstração)
export async function saveAttendanceToFirestore(session: SaveSessionInput): Promise<void> {
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
    sessions[session.id] = {
      id: session.id,
      date: session.date,
      turmaId: session.turmaId,
      scope: session.scope,
      oficinaName: session.oficinaName,
      registeredBy: session.registeredBy,
      registeredAt: new Date().toISOString(),
      records: session.records,
    }
    writeDemoSessions(sessions)
    return
  }

  const docData = {
    data_chamada: session.date,
    turma_id: session.turmaId,
    escopo: session.scope,
    turma_oficina_id: session.turmaOficinaId || null,
    oficina_nome: session.oficinaName || null,
    presencas: presencasMap,
    observacoes: observacoesMap,
    registrado_por: session.registeredBy,
    criado_em: serverTimestamp(),
    atualizado_em: serverTimestamp(),
  }

  // Grava com o ID determinístico: YYYY-MM-DD_TurmaId_(TurmaOficinaId | geral)
  const sessionDocId = session.id.replace(/\//g, '-')
  await setDoc(doc(db, SESSOES_COLLECTION, sessionDocId), docData)
}

// Carrega sessão do Firestore (ou do armazenamento local no modo demonstração).
// Retorna null quando a sessão não existe ou o banco está inacessível — nunca
// devolve uma chamada fictícia em nome do Firestore.
export async function getAttendanceFromFirestore(sessionId: string): Promise<AttendanceSession | null> {
  if (isDemoModeEnabled()) {
    const sessions = readDemoSessions()
    return sessions[sessionId] || sessions[sessionId.replace(/\//g, '-')] || null
  }

  const cleanId = sessionId.replace(/\//g, '-')
  try {
    const snap = await getDoc(doc(db, SESSOES_COLLECTION, cleanId))
    if (snap.exists()) {
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
        id: sessionId,
        date: data.data_chamada,
        turmaId: data.turma_id,
        scope: data.escopo || 'turma',
        oficinaName: data.oficina_nome || undefined,
        registeredBy: data.registrado_por || 'Sistema',
        registeredAt: data.atualizado_em ? new Date().toISOString() : '',
        records,
      }
    }
  } catch (err) {
    console.warn('Erro ao carregar sessão do Firestore:', err)
  }

  return null
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

// Salva contato com a família / ocorrência no Firestore (ou localmente no modo demonstração)
export async function saveOccurrenceToFirestore(input: SaveOccurrenceInput): Promise<string> {
  const contactId = `contato-${input.studentId}-${Date.now()}`
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

  await setDoc(doc(db, CONTATOS_COLLECTION, contactId), docData)
  return contactId
}

// Escuta ocorrências de um aluno em tempo real (ou localmente no modo demonstração)
export function subscribeStudentOccurrences(
  studentId: string,
  onUpdate: (contacts: ContactEntry[]) => void
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
    }
  )
}
