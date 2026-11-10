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
import { initialAttendanceSessions } from '../features/alunos/students-data'

const SESSOES_COLLECTION = 'sessoes_chamada'
const CONTATOS_COLLECTION = 'contatos_familia'

export interface SaveSessionInput {
  id: string
  date: string
  turmaId: string
  scope: 'turma' | 'oficina'
  oficinaName?: string
  registeredBy: string
  records: Record<string, { status: AttendanceStatus; observation: string }>
}

// Salva sessão de chamada no Firestore (com fallback local)
export async function saveAttendanceToFirestore(session: SaveSessionInput): Promise<void> {
  const presencasMap: Record<string, AttendanceStatus> = {}
  const observacoesMap: Record<string, string> = {}

  Object.entries(session.records).forEach(([studentId, rec]) => {
    presencasMap[studentId] = rec.status
    if (rec.observation) {
      observacoesMap[studentId] = rec.observation
    }
  })

  // Salva no cache local imediatamente para transição instantânea
  initialAttendanceSessions[session.id] = {
    id: session.id,
    date: session.date,
    turmaId: session.turmaId,
    scope: session.scope,
    oficinaName: session.oficinaName,
    registeredBy: session.registeredBy,
    registeredAt: new Date().toISOString(),
    records: session.records,
  }

  const docData = {
    data_chamada: session.date,
    turma_id: session.turmaId,
    escopo: session.scope,
    oficina_nome: session.oficinaName || null,
    presencas: presencasMap,
    observacoes: observacoesMap,
    registrado_por: session.registeredBy,
    criado_em: serverTimestamp(),
    atualizado_em: serverTimestamp(),
  }

  // Grava com o ID determinístico: YYYY-MM-DD_Turma_Escopo
  const sessionDocId = session.id.replace(/\//g, '-')
  try {
    await setDoc(doc(db, SESSOES_COLLECTION, sessionDocId), docData)
  } catch (firestoreErr) {
    console.warn('Chamada gravada localmente (Firestore indisponível ou permissão pendente):', firestoreErr)
  }
}

// Carrega sessão do Firestore com fallback para memória
export async function getAttendanceFromFirestore(sessionId: string): Promise<AttendanceSession | null> {
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

  // Fallback para sessões padrão em memória
  return initialAttendanceSessions[sessionId] || null
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

// Salva contato com a família / ocorrência no Firestore (com fallback local)
export async function saveOccurrenceToFirestore(input: SaveOccurrenceInput): Promise<string> {
  const contactId = `contato-${input.studentId}-${Date.now()}`
  const todayStr = new Intl.DateTimeFormat('pt-BR').format(new Date())

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

// Escuta ocorrências de um aluno em tempo real
export function subscribeStudentOccurrences(
  studentId: string,
  onUpdate: (contacts: ContactEntry[]) => void
) {
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
