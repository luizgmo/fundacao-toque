import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  runTransaction,
  serverTimestamp,
  onSnapshot,
  orderBy,
  limit,
  where,
  writeBatch,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { AttendanceSession, AttendanceStatus, ContactEntry } from '../features/alunos/students-data'
import {
  demoAttendanceSessions,
  normalizeContactMethod,
} from '../features/alunos/students-data'
import {
  DEMO_CONTACTS_STORAGE_KEY,
  DEMO_SESSIONS_STORAGE_KEY,
  isDemoModeEnabled,
} from '../lib/demoMode'
import { confirmWrite } from '../lib/persistence'
import { sessaoChamadaId, STATUS_PRESENCA } from '../features/frequencia/chamada'
import {
  agruparSessoes,
  sequenciaDoContexto,
  type SessaoChamadaResumo,
} from './dashboardService'

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
    const versao = await confirmWrite(
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

    // Persiste a sequência de faltas dos alunos deste contexto a partir das
    // sessões (fonte da verdade), para que a lista de alunos reflita o alerta.
    // Falha aqui não invalida a chamada já gravada.
    if (!isDemoModeEnabled()) {
      await recalcularFaltasConsecutivasContexto({
        turmaId: session.turmaId,
        escopo: session.scope,
        turmaOficinaId: session.turmaOficinaId,
      }).catch((err) => {
        console.warn('Não foi possível recalcular faltas consecutivas:', err)
      })
    }

    return versao
  } catch (err) {
    // confirmWrite embrulha a falha; o conflito precisa chegar intacto à tela,
    // que oferece "recarregar" em vez de "tentar novamente".
    const cause = (err as { cause?: unknown })?.cause
    if (cause instanceof ChamadaConflitoError) throw cause
    throw err
  }
}

// Recalcula e persiste a sequência de faltas consecutivas de cada aluno que
// aparece nas sessões de um contexto, a partir das sessões (fonte da verdade).
// Apenas 'ausente' incrementa; 'presente' e 'justificado' interrompem.
// Alunos que interromperam a sequência são zerados; alunos sem sessões no
// contexto não são tocados.
export async function recalcularFaltasConsecutivasContexto(params: {
  turmaId: string
  escopo: 'turma' | 'oficina'
  turmaOficinaId?: string
}): Promise<void> {
  if (isDemoModeEnabled()) return

  const { turmaId, escopo, turmaOficinaId } = params
  const q =
    escopo === 'turma'
      ? query(
          collection(db, SESSOES_COLLECTION),
          where('turma_id', '==', turmaId),
          orderBy('data_chamada', 'desc'),
          limit(500),
        )
      : query(
          collection(db, SESSOES_COLLECTION),
          where('turma_oficina_id', '==', turmaOficinaId),
          orderBy('data_chamada', 'desc'),
          limit(500),
        )

  const snap = await getDocs(q)
  const sessoes = snap.docs.map(
    (d) => ({ id: d.id, ...(d.data() as Record<string, unknown>) } as SessaoChamadaResumo),
  )

  const porAluno = new Map<
    string,
    { faltasConsecutivas: number; frequenciaMedia: number }
  >()
  for (const grupo of agruparSessoes(sessoes).values()) {
    const seq = sequenciaDoContexto(grupo)
    seq.forEach((s, alunoId) => {
      const atual = porAluno.get(alunoId) ?? {
        faltasConsecutivas: s.count,
        frequenciaMedia: 0,
      }
      porAluno.set(alunoId, atual)
    })
  }

  // Calcula frequência média por aluno a partir de todas as sessões do contexto.
  const frequenciaPorAluno = new Map<string, { presentes: number; total: number }>()
  sessoes.forEach((s) => {
    const presencas = getMap(s, 'presencas')
    Object.entries(presencas).forEach(([alunoId, status]) => {
      const atual = frequenciaPorAluno.get(alunoId) ?? { presentes: 0, total: 0 }
      atual.total += 1
      if (status === 'presente' || status === 'justificado') atual.presentes += 1
      frequenciaPorAluno.set(alunoId, atual)
    })
  })
  frequenciaPorAluno.forEach((f, alunoId) => {
    const entrada = porAluno.get(alunoId)
    if (entrada) {
      entrada.frequenciaMedia =
        f.total > 0 ? Math.round((f.presentes / f.total) * 100) : 0
    }
  })

  if (porAluno.size === 0) return

  const batch = writeBatch(db)
  porAluno.forEach((v, alunoId) => {
    batch.update(doc(db, 'alunos', alunoId), {
      faltas_consecutivas: v.faltasConsecutivas,
      frequencia_media: v.frequenciaMedia,
    })
  })
  await confirmWrite(
    'atualizar faltas consecutivas e frequência média dos alunos',
    batch.commit(),
  )
}

function getMap(s: Record<string, unknown>, key: string): Record<string, string> {
  const valor = s[key]
  return typeof valor === 'object' && valor !== null ? (valor as Record<string, string>) : {}
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
  relatedAbsenceDates?: string[]
  type: string
  responsibleId: string
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
  const meioContato = normalizeContactMethod(input.type)
  const datasFaltas =
    input.relatedAbsenceDates && input.relatedAbsenceDates.length > 0
      ? input.relatedAbsenceDates
      : [input.faltaDate]

  if (isDemoModeEnabled()) {
    const contacts = readDemoContacts()
    contacts.unshift({
      studentId: input.studentId,
      faltaDate: input.faltaDate,
      contactDate: todayStr,
      type: meioContato,
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
    datas_faltas_relacionadas: datasFaltas,
    contatado_em: serverTimestamp(),
    meio_contato: meioContato,
    motivo_ocorrencia: input.reason,
    status_ocorrencia: input.status,
    observacoes: input.note,
    usuario_responsavel_id: input.responsibleId,
    usuario_responsavel_nome: input.responsible,
    responsavel_id: input.guardianId,
    responsavel_snapshot: { ...input.guardianSnapshot, canal: meioContato },
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
    where('aluno_id', '==', studentId),
    orderBy('contatado_em', 'desc')
  )

  return onSnapshot(
    q,
    (snapshot) => {
      const list: ContactEntry[] = []
      snapshot.forEach((snap) => {
        const d = snap.data()
        const contatadoEm = d.contatado_em as { toDate?: () => Date } | undefined
        const dataContato = contatadoEm?.toDate?.()
        const datasFaltas = Array.isArray(d.datas_faltas_relacionadas)
          ? d.datas_faltas_relacionadas.filter(Boolean).join(', ')
          : ''
        list.push({
          id: snap.id,
          faltaDate: datasFaltas || '—',
          contactDate: dataContato
            ? dataContato.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
            : d.data_formatada || 'Data não registrada',
          type: normalizeContactMethod(String(d.meio_contato || 'telefone')),
          responsible:
            d.usuario_responsavel_nome || d.usuario_responsavel || 'Equipe',
          reason: d.motivo_ocorrencia || '',
          status: d.status_ocorrencia || 'Aberta',
          note: d.observacoes || '',
          guardianId: d.responsavel_id || undefined,
          guardianName:
            d.responsavel_snapshot?.nome ||
            'Responsável não identificado no registro original',
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
