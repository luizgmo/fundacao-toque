import { useEffect, useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertTriangle,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock,
  History,
  Info,
  Phone,
  Save,
  Search,
  User,
  Users,
  X,
  XCircle,
} from 'lucide-react'
import type { AttendanceSession, AttendanceStatus, ContactEntry, Guardian, Student } from '../alunos/students-data'
import {
  addContactToStudent,
  CONTACT_METHOD_OPTIONS,
  normalizeContactMethod,
  saveAttendanceSession,
} from '../alunos/students-data'
import { getStudentById, getStudentGuardians } from '../../services/studentsService'
import { subscribeToTurmas } from '../../services/turmasService'
import {
  subscribeToAlunoOficinas,
  subscribeToOficinas,
  subscribeToTurmaOficinas,
} from '../../services/oficinasService'
import type { Turma } from '../../types/turmas'
import type { AlunoOficina, Oficina, TurmaOficina } from '../../types/oficinas'
import { vinculoPrevistoEm, vinculosAtivosDaTurma } from '../../types/oficinas'
import {
  ChamadaConflitoError,
  getAttendanceFromFirestore,
  recalcularFaltasConsecutivasContexto,
  saveAttendanceToFirestore,
  saveOccurrenceToFirestore,
  subscribeStudentOccurrences,
} from '../../services/attendanceService'
import { obterLimiteFaltas, LIMITE_FALTAS_PADRAO } from '../../services/configuracaoService'
import { isDemoModeEnabled } from '../../lib/demoMode'
import { failureMessage } from '../../lib/persistence'
import { useSubscription } from '../../lib/useSubscription'
import type { LoadStatus } from '../../lib/useSubscription'
import { useQuery } from '../../lib/useSubscription'
import { LoadError, LoadErrors } from '../../components/LoadError'
import { useStudents } from '../alunos/useStudents'
import { DataNotice } from '../../components/DataNotice'
import { maskPhone } from '../../lib/masks'
import { useAuth } from '../auth/AuthContext'
import { alunosDaChamada, alunosElegiveis, hojeLocalISO, montarPresencas, sessaoChamadaId } from './chamada'
import './Frequencia.css'

type Props = {
  onViewStudentProfile?: (studentId: string) => void
}

export function Frequencia({ onViewStudentProfile }: Props) {
  const { userProfile, currentUser } = useAuth()
  // Estados separados de carregando / erro / dados para cada fonte.
  const studentsSub = useStudents()
  const allStudents = studentsSub.data
  const studentsSource = studentsSub.source
  const turmasSub = useSubscription<Turma[]>(subscribeToTurmas, [])
  const oficinasSub = useSubscription<Oficina[]>(subscribeToOficinas, [])
  const vinculosSub = useSubscription<TurmaOficina[]>(subscribeToTurmaOficinas, [])
  const alunoOficinasSub = useSubscription<AlunoOficina[]>(subscribeToAlunoOficinas, [])
  const turmas = turmasSub.data
  const oficinas = oficinasSub.data
  const vinculos = vinculosSub.data

  // O limite de faltas vem da configuração da Fundação (valor padrão quando
  // ainda não configurado). Alterá-lo muda os alertas sem alterar código.
  const configuracaoQuery = useQuery<{ valor: number; fonte: 'configurado' | 'padrao' }>(
    () => obterLimiteFaltas(),
    { valor: LIMITE_FALTAS_PADRAO, fonte: 'padrao' },
  )
  const absenceThreshold =
    configuracaoQuery.status === 'ready' ? configuracaoQuery.data.valor : LIMITE_FALTAS_PADRAO

  // Alerta de faltas recorrentes usa o campo `faltas_consecutivas` do aluno,
  // populado ao recalcular a partir das sessões (fonte da verdade). Assim alunos
  // excluídos ou inativados saem automaticamente da lista (não constam mais em
  // allStudents) e sessões órfãs não geram alertas fantasmas.
  const recurrentAbsenceStudents = useMemo(
    () => allStudents.filter((s) => s.faltasConsecutivas >= absenceThreshold),
    [allStudents, absenceThreshold],
  )

  // Chamada states (IDs do Firestore)
  const [selectedTurmaId, setSelectedTurmaId] = useState<string>('')
  const [selectedTurmaOficinaId, setSelectedTurmaOficinaId] = useState<string>('')
  // Data local: em UTC, à noite a tela abriria a chamada do dia seguinte.
  const [dateStr, setDateStr] = useState<string>(() => hojeLocalISO())

  // Attendance values per student for current selected parameters
  const [attendanceRecords, setAttendanceRecords] = useState<
    Record<string, { status: AttendanceStatus; observation: string }>
  >({})

  const turmasAtivas = useMemo(() => turmas.filter((t) => t.ativo), [turmas])
  // Turma selecionada ou, enquanto nenhuma foi escolhida, a primeira turma ativa
  const turmaAtual = turmasAtivas.find((t) => t.id === selectedTurmaId) || turmasAtivas[0]
  const turmaId = turmaAtual?.id || ''

  // Oficinas oferecidas na turma: vínculos ativos de turma_oficinas (com oficina
  // ativa). O id é o turma_oficina_id gravado na sessão de chamada. As previstas
  // para o dia da semana (dentro da vigência) aparecem primeiro.
  const oficinasDaTurma = useMemo(
    () =>
      vinculosAtivosDaTurma(vinculos, oficinas, turmaId)
        .map(({ vinculo, oficina }) => ({
          id: vinculo.id,
          nome: oficina.nome,
          previstaHoje: vinculoPrevistoEm(vinculo, dateStr),
        }))
        .sort((a, b) => Number(b.previstaHoje) - Number(a.previstaHoje)),
    [vinculos, oficinas, turmaId, dateStr]
  )
  const oficinaAtual =
    oficinasDaTurma.find((o) => o.id === selectedTurmaOficinaId) || oficinasDaTurma[0]
  // Frequência é registrada apenas por oficina (vínculo turma_oficina).
  const chamadaPorOficina = true
  // ID determinístico do contexto: data + turma + vínculo da oficina.
  const sessionId =
    turmaId && dateStr && oficinaAtual
      ? sessaoChamadaId({ data: dateStr, turmaId, escopo: 'oficina', turmaOficinaId: oficinaAtual.id })
      : ''

  // Sincroniza com a sessão do Firestore quando os filtros mudam. Uma falha de
  // leitura não pode parecer "chamada ainda não feita": salvar ficaria
  // sobrescrevendo a chamada existente com uma lista em branco.
  const [sessionAttempt, setSessionAttempt] = useState(0)
  const sessionKey = `${sessionId}|${sessionAttempt}`
  const [sessionLoad, setSessionLoad] = useState<{
    key: string
    error: unknown
    session: AttendanceSession | null
  } | null>(null)
  useEffect(() => {
    let isMounted = true
    // Sempre lê a sessão real antes de permitir iniciar/editar a chamada
    const load = sessionId ? getAttendanceFromFirestore(sessionId) : Promise.resolve(null)
    load.then(
      (existing) => {
        if (!isMounted) return
        setAttendanceRecords(existing ? { ...existing.records } : {})
        setSessionLoad({ key: sessionKey, error: null, session: existing })
      },
      (error: unknown) => {
        if (!isMounted) return
        console.warn('Erro ao carregar sessão do Firestore:', error)
        setAttendanceRecords({})
        setSessionLoad({ key: sessionKey, error, session: null })
      }
    )
    return () => {
      isMounted = false
    }
  }, [sessionId, sessionKey])
  const sessionStatus: LoadStatus =
    sessionLoad?.key !== sessionKey ? 'loading' : sessionLoad.error ? 'error' : 'ready'
  // Sessão salva no banco para o contexto atual (null = ainda não registrada)
  const savedSession = sessionStatus === 'ready' ? sessionLoad?.session ?? null : null
  const reloadSession = () => {
    setSaveError(null)
    setSessionAttempt((n) => n + 1)
  }

  // Popula o campo faltas_consecutivas dos alunos deste contexto a partir das
  // sessões (fonte da verdade), para que o perfil do aluno e a lista reflitam o
  // valor correto mesmo quando as sessões foram criadas fora desta tela.
  useEffect(() => {
    if (!turmaId || !oficinaAtual || studentsSub.status !== 'ready') return
    recalcularFaltasConsecutivasContexto({
      turmaId,
      escopo: 'oficina',
      turmaOficinaId: oficinaAtual.id,
    }).catch((err) => {
      console.warn('Não foi possível recalcular faltas consecutivas:', err)
    })
  }, [turmaId, oficinaAtual, studentsSub.status])

  // Feedback states
  const [saveSuccessMessage, setSaveSuccessMessage] = useState<string | null>(null)
  // Erro do último salvamento, amarrado ao contexto em que ocorreu
  const [saveErrorState, setSaveErrorState] = useState<{ message: string; conflito: boolean; sessionId: string } | null>(null)
  const setSaveError = (value: { message: string; conflito: boolean } | null) =>
    setSaveErrorState(value ? { ...value, sessionId } : null)
  const saveError = saveErrorState?.sessionId === sessionId ? saveErrorState : null
  const [savingChamada, setSavingChamada] = useState(false)

  // Modal contact / occurrence state
  const [selectedStudentForContact, setSelectedStudentForContact] = useState<Student | null>(null)
  const [contactGuardians, setContactGuardians] = useState<Guardian[]>([])
  const [guardiansAttempt, setGuardiansAttempt] = useState(0)
  const [guardiansError, setGuardiansError] = useState<unknown>(null)
  const [selectedGuardianId, setSelectedGuardianId] = useState('')
  const [contactFaltaDate, setContactFaltaDate] = useState<string>('')
  const [contactType, setContactType] = useState<string>('whatsapp')
  const [contactResponsible, setContactResponsible] = useState<string>(
    userProfile?.nome_completo || ''
  )
  const [contactReason, setContactReason] = useState<string>(
    'Faltas consecutivas recorrentes (Alerta institucional)'
  )
  const [contactStatus, setContactStatus] = useState<string>('Aberta / Em acompanhamento')
  const [contactNote, setContactNote] = useState<string>('')
  const [familyContactSuccess, setFamilyContactSuccess] = useState<string | null>(null)
  const [savingContact, setSavingContact] = useState(false)
  // ID reservado para a ocorrência em edição; reutilizado se o usuário repetir o envio.
  const [pendingContactId, setPendingContactId] = useState<string | null>(null)

  // Histórico real de contatos do aluno selecionado. O modal precisa refletir a
  // coleção contatos_familia, não apenas os contatos legados embutidos no aluno.
  const contactStudentId = selectedStudentForContact?.id || ''
  const occurrencesSub = useSubscription<ContactEntry[]>(
    (onData, onError) => {
      if (!contactStudentId) return () => {}
      return subscribeStudentOccurrences(contactStudentId, onData, onError)
    },
    [],
    contactStudentId,
  )

  const fecharContato = () => {
    setSelectedStudentForContact(null)
    setContactGuardians([])
    setSelectedGuardianId('')
    setGuardiansError(null)
  }

  useEffect(() => {
    let active = true
    if (!selectedStudentForContact) return () => { active = false }
    getStudentGuardians(selectedStudentForContact.id).then((items) => {
      if (!active) return
      const eligible = items.filter((item) => item.ativo && item.id)
      setContactGuardians(eligible)
      setGuardiansError(null)
      setSelectedGuardianId(eligible.find((item) => item.principal)?.id || eligible[0]?.id || '')
    }).catch((error) => {
      console.warn('Não foi possível carregar responsáveis para o contato:', error)
      if (!active) return
      setContactGuardians([])
      setGuardiansError(error)
    })
    return () => { active = false }
  }, [selectedStudentForContact, guardiansAttempt])

  // Search filter for attendance list
  const [studentSearch, setStudentSearch] = useState<string>('')

  // Alunos elegíveis no contexto: participantes do vínculo na data (chamada de oficina)
  const elegiveis = useMemo(
    () =>
      alunosElegiveis({
        students: allStudents,
        turma: turmaAtual,
        escopo: 'oficina',
        turmaOficinaId: oficinaAtual?.id,
        alunoOficinas: alunoOficinasSub.data,
        data: dateStr,
      }),
    [allStudents, turmaAtual, oficinaAtual?.id, alunoOficinasSub.data, dateStr]
  )
  // Elegíveis + quem já consta na sessão salva (reabrir mostra exatamente o salvo)
  const listaChamada = useMemo(
    () => alunosDaChamada(elegiveis, allStudents, savedSession?.records ?? null),
    [elegiveis, allStudents, savedSession]
  )
  const elegivelIds = useMemo(() => new Set(elegiveis.map((s) => s.id)), [elegiveis])
  // A busca só filtra a exibição; salvar sempre considera a lista completa.
  const turmaStudents = useMemo(() => {
    const term = studentSearch.toLowerCase()
    return listaChamada
      .map((item) => item.student)
      .filter((s) => !term || s.name.toLowerCase().includes(term))
  }, [listaChamada, studentSearch])
  const participantesStatus: LoadStatus = chamadaPorOficina ? alunoOficinasSub.status : 'ready'

  // Get current status for a student in local form state
  const getStudentStatus = (studentId: string): AttendanceStatus => {
    return attendanceRecords[studentId]?.status ?? 'presente'
  }

  const getStudentObservation = (studentId: string): string => {
    return attendanceRecords[studentId]?.observation ?? ''
  }

  // Update status or observation for a student
  const updateStudentAttendance = (
    studentId: string,
    status: AttendanceStatus,
    observation?: string
  ) => {
    setAttendanceRecords((prev) => ({
      ...prev,
      [studentId]: {
        status,
        observation: observation !== undefined ? observation : prev[studentId]?.observation ?? '',
      },
    }))
  }

  // Bulk actions
  const markAllAs = (status: AttendanceStatus) => {
    const next: Record<string, { status: AttendanceStatus; observation: string }> = { ...attendanceRecords }
    turmaStudents.forEach((student) => {
      next[student.id] = {
        status,
        observation: next[student.id]?.observation ?? '',
      }
    })
    setAttendanceRecords(next)
  }

  // Totais da chamada inteira (independem da busca)
  const stats = useMemo(() => {
    let presentes = 0
    let ausentes = 0
    let justificados = 0
    const todos = listaChamada.map((item) => item.student)

    todos.forEach((st) => {
      const status = attendanceRecords[st.id]?.status ?? 'presente'
      if (status === 'presente') presentes++
      else if (status === 'ausente') ausentes++
      else if (status === 'justificado') justificados++
    })

    const total = todos.length
    const pctPresente = total > 0 ? Math.round(((presentes + justificados) / total) * 100) : 0

    return { total, presentes, ausentes, justificados, pctPresente }
  }, [listaChamada, attendanceRecords])

  // Date navigation handlers
  const changeDateByDays = (days: number) => {
    const current = new Date(dateStr + 'T12:00:00')
    current.setDate(current.getDate() + days)
    setDateStr(current.toISOString().split('T')[0])
  }

  const formattedDisplayDate = useMemo(() => {
    if (!dateStr) return ''
    const parts = dateStr.split('-')
    if (parts.length !== 3) return dateStr
    const dateObj = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]))
    return new Intl.DateTimeFormat('pt-BR', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(dateObj)
  }, [dateStr])

  // Salva a chamada do contexto atual. Bloqueado enquanto a sessão real, os
  // alunos ou os participantes da oficina não estiverem carregados.
  const handleSaveAttendance = async () => {
    setSaveError(null)
    if (!sessionId) {
      setSaveError({
        message: chamadaPorOficina
          ? 'Selecione uma turma com oficina vinculada para registrar a chamada.'
          : 'Cadastre uma turma ativa para registrar a chamada.',
        conflito: false,
      })
      return
    }
    if (dateStr > hojeLocalISO()) {
      setSaveError({ message: 'Não é possível registrar chamada em data futura.', conflito: false })
      return
    }
    if (sessionStatus !== 'ready' || studentsSub.status !== 'ready' || participantesStatus !== 'ready') {
      setSaveError({
        message:
          'A chamada não pode ser salva enquanto os alunos, os participantes da oficina e a chamada já registrada ' +
          'para este contexto não forem carregados. Use “Tentar novamente” no aviso exibido na página.',
        conflito: false,
      })
      return
    }
    if (elegiveis.length === 0 && !savedSession) {
      setSaveError({ message: 'Não há alunos elegíveis neste contexto para registrar a chamada.', conflito: false })
      return
    }

    setSavingChamada(true)
    const recordsMap = montarPresencas(elegiveis, attendanceRecords, savedSession?.records ?? null)
    const professional = userProfile?.nome_completo || 'Equipe'
    const turmaOficinaId = oficinaAtual?.id
    const oficinaName = oficinaAtual?.nome

    try {
      await saveAttendanceToFirestore({
        id: sessionId,
        date: dateStr,
        turmaId,
        scope: 'oficina',
        turmaOficinaId,
        oficinaName,
        registeredBy: professional,
        records: recordsMap,
        versaoEsperada: savedSession ? savedSession.versao ?? 0 : null,
      })

      if (isDemoModeEnabled()) {
        // Atualiza a sequência de faltas dos alunos fictícios
        saveAttendanceSession({
          id: sessionId,
          date: dateStr,
          turmaId,
          scope: 'oficina',
          turmaOficinaId,
          oficinaName,
          registeredBy: professional,
          registeredAt: new Date().toISOString(),
          records: recordsMap,
        })
      }

      setSaveSuccessMessage(
        isDemoModeEnabled()
          ? 'Modo demonstração: chamada guardada apenas neste navegador (não enviada ao sistema).'
          : 'Chamada confirmada no banco de dados. O histórico foi atualizado.'
      )
      setTimeout(() => setSaveSuccessMessage(null), 4000)
      // Relê a sessão gravada (nova versão) para que o próximo salvamento parta dela
      setSessionAttempt((n) => n + 1)
    } catch (err) {
      console.error('Erro ao salvar chamada no Firestore:', err)
      const conflito = err instanceof ChamadaConflitoError
      setSaveError({ message: conflito ? err.message : failureMessage(err, 'salvar a chamada'), conflito })
    } finally {
      setSavingChamada(false)
    }
  }

  // Handle open contact / occurrence modal
  const handleOpenContactModal = (
    student: Student,
    defaultFaltaDate?: string,
    defaultReason?: string
  ) => {
    setSelectedStudentForContact(student)
    setContactGuardians([])
    setSelectedGuardianId('')
    setGuardiansError(null)
    setContactFaltaDate(defaultFaltaDate || dateStr)
    setContactType('whatsapp')
    setContactResponsible(userProfile?.nome_completo || '')
    setContactReason(
      defaultReason ||
        (student.faltasConsecutivas >= absenceThreshold
          ? `Alerta institucional: ${student.faltasConsecutivas} faltas consecutivas`
          : 'Ausência sem justificativa prévia')
    )
    setContactStatus('Aberta / Em acompanhamento')
    setContactNote('')
    setFamilyContactSuccess(null)
    setPendingContactId(null)
    setGuardiansError(null)
  }

  // Handle submit contact log / occurrence integrado ao Firestore
  const handleSubmitContact = async (e: FormEvent) => {
    e.preventDefault()
    if (!selectedStudentForContact) return
    const guardian = contactGuardians.find((item) => item.id === selectedGuardianId && item.ativo)
    if (!guardian?.id) {
      alert('Selecione um responsável ativo do aluno para registrar o contato.')
      return
    }
    setSavingContact(true)

    const todayStr = new Intl.DateTimeFormat('pt-BR').format(new Date())

    const contactId = pendingContactId || `contato-${selectedStudentForContact.id}-${Date.now()}`
    setPendingContactId(contactId)

    try {
      await saveOccurrenceToFirestore({
        studentId: selectedStudentForContact.id,
        studentName: selectedStudentForContact.name,
        faltaDate: contactFaltaDate,
        relatedAbsenceDates: [contactFaltaDate],
        type: contactType,
        responsibleId: currentUser?.uid || userProfile?.uid || '',
        responsible: contactResponsible,
        guardianId: guardian.id,
        guardianSnapshot: {
          nome: guardian.nome,
          parentesco: guardian.parentesco,
          canal: normalizeContactMethod(contactType),
          contato: guardian.telefone,
        },
        reason: contactReason,
        status: contactStatus,
        note: contactNote,
      }, contactId)
      setPendingContactId(null)

      const newContact: ContactEntry = {
        faltaDate: contactFaltaDate,
        contactDate: todayStr,
        type: contactType,
        responsible: contactResponsible,
        guardianId: guardian.id,
        guardianName: guardian.nome,
        guardianRelationship: guardian.parentesco,
        guardianContact: guardian.telefone,
        reason: contactReason,
        status: contactStatus,
        note: contactNote,
      }

      if (isDemoModeEnabled()) {
        addContactToStudent(selectedStudentForContact.id, newContact)
        // A assinatura de demonstração lê o armazenamento local uma única vez.
        occurrencesSub.retry()
      }
      setFamilyContactSuccess(
        isDemoModeEnabled()
          ? 'Modo demonstração: ocorrência guardada apenas neste navegador (não enviada ao sistema).'
          : 'Ocorrência e contato confirmados no banco de dados.'
      )

      setTimeout(() => {
        setFamilyContactSuccess(null)
        fecharContato()
      }, 1800)
    } catch (err) {
      console.error('Erro ao salvar ocorrência no Firestore:', err)
      alert(failureMessage(err, 'registrar a ocorrência / contato com a família'))
    } finally {
      setSavingContact(false)
    }
  }

  const contactHistory =
    occurrencesSub.status === 'ready' && occurrencesSub.data.length > 0
      ? occurrencesSub.data
      : occurrencesSub.status === 'ready'
        ? selectedStudentForContact?.contacts ?? []
        : []

  return (
    <div className="frequencia-page page-container">
      {studentsSource === 'demo' && (
        <DataNotice kind="demo">
          <strong>Modo demonstração:</strong> alunos, chamadas e ocorrências são fictícios e ficam
          apenas neste navegador. Nada é gravado no Firebase.
        </DataNotice>
      )}

      {studentsSource === 'loading' && (
        <DataNotice kind="loading">Carregando alunos do banco de dados…</DataNotice>
      )}

      {studentsSub.status === 'error' && (
        <LoadError
          error={studentsSub.error}
          impact="A chamada e os alertas de faltas não estão disponíveis."
          onRetry={studentsSub.retry}
          what="os alunos"
        />
      )}

      <LoadErrors
        impact="A seleção de turma e oficina pode estar incompleta."
        sources={[
          { what: 'as turmas', ...turmasSub },
          { what: 'as oficinas', ...oficinasSub },
          { what: 'os vínculos turma-oficina', ...vinculosSub },
        ]}
      />

      {sessionStatus === 'error' && (
        <LoadError
          error={sessionLoad?.error}
          impact="Para não sobrescrever a chamada, salvar fica bloqueado até a leitura funcionar."
          onRetry={reloadSession}
          what="a chamada já registrada para este dia"
        />
      )}

      {chamadaPorOficina && alunoOficinasSub.status === 'error' && (
        <LoadError
          error={alunoOficinasSub.error}
          impact="Sem eles não dá para saber quem participa da oficina; salvar fica bloqueado."
          onRetry={alunoOficinasSub.retry}
          what="os participantes das oficinas"
        />
      )}

      {studentsSource === 'empty' && (
        <DataNotice kind="empty">
          Nenhum aluno cadastrado no banco de dados. Cadastre alunos para registrar a chamada.
        </DataNotice>
      )}

      {/* Top Banner / Introduction */}
      <header className="frequencia-header">
        <div>
          <span className="eyebrow">Gestão de Presença & Ocorrências</span>
          <h2>Chamada Diária e Acompanhamento de Faltas</h2>
          <p>
            Realize o registro de presença da oficina e gerencie contatos com responsáveis
            em casos de ausências recorrentes.
          </p>
        </div>
        <div className="threshold-setting">
          <AlertTriangle className="alert-icon-warning" size={17} />
          <span>
            Alerta de faltas recorrentes: {absenceThreshold}+ (
            {configuracaoQuery.status === 'ready' && configuracaoQuery.data.fonte === 'configurado'
              ? 'limite configurado pela Fundação'
              : 'limite padrão'}
            )
          </span>
          {configuracaoQuery.status === 'error' && (
            <span style={{ fontSize: '0.78rem', color: '#6b7280', marginLeft: '0.4rem' }}>
              Configuração indisponível — usando o padrão {LIMITE_FALTAS_PADRAO}
            </span>
          )}
        </div>
      </header>

      {/* Main Grid: Call Table & Recurrent Absences Side Panel */}
      <div className="frequencia-grid">
        {/* Left / Main Section: Attendance Register */}
        <section className="frequencia-main-card">
          {/* Controls Bar: Turma, Scope, Date & Bulk Actions */}
          <div className="controls-bar">
            <div className="control-group">
              <label>
                <span>Turma</span>
                <select onChange={(e) => setSelectedTurmaId(e.target.value)} value={turmaId}>
                  {turmasAtivas.length === 0 && (
                    <option value="">
                      {turmasSub.status === 'loading'
                        ? 'Carregando turmas…'
                        : turmasSub.status === 'error'
                          ? 'Turmas indisponíveis'
                          : 'Nenhuma turma cadastrada'}
                    </option>
                  )}
                  {turmasAtivas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                <span>Oficina</span>
                <select
                  onChange={(e) => setSelectedTurmaOficinaId(e.target.value)}
                  value={oficinaAtual?.id || ''}
                >
                  {oficinasDaTurma.length === 0 && (
                    <option value="">Nenhuma oficina nesta turma</option>
                  )}
                  {oficinasDaTurma.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.nome}
                      {o.previstaHoje ? ' (prevista neste dia)' : ''}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            {/* Date Selection */}
            <div className="date-picker-group">
              <button
                aria-label="Dia anterior"
                className="icon-button date-nav-button"
                onClick={() => changeDateByDays(-1)}
                type="button"
              >
                <ChevronLeft size={18} />
              </button>
              <div className="date-input-wrapper">
                <Calendar className="date-calendar-icon" size={17} />
                <input
                  onChange={(e) => setDateStr(e.target.value)}
                  type="date"
                  value={dateStr}
                />
              </div>
              <button
                aria-label="Próximo dia"
                className="icon-button date-nav-button"
                onClick={() => changeDateByDays(1)}
                type="button"
              >
                <ChevronRight size={18} />
              </button>
            </div>
          </div>

          <div className="sub-controls-bar">
            <span className="formatted-date-label">
              <Clock size={15} />
              {formattedDisplayDate}
            </span>

            <span className="session-status-label" role="status">
              {sessionStatus === 'loading'
                ? 'Carregando chamada salva…'
                : sessionStatus === 'error'
                  ? 'Chamada salva indisponível'
                  : savedSession
                    ? `Chamada da oficina salva por ${savedSession.registeredBy}` +
                      (savedSession.registeredAt
                        ? ` em ${new Date(savedSession.registeredAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
                        : '')
                    : sessionId
                      ? `Nova chamada da oficina — ainda não salva`
                      : ''}
            </span>

            {/* Search Input */}
            <div className="student-search-box">
              <Search size={16} />
              <input
                onChange={(e) => setStudentSearch(e.target.value)}
                placeholder="Buscar aluno na turma..."
                type="text"
                value={studentSearch}
              />
            </div>

            {/* Bulk actions */}
            <div className="bulk-actions">
              <span className="bulk-label">Marcar todos:</span>
              <button
                className="bulk-btn present"
                onClick={() => markAllAs('presente')}
                type="button"
              >
                <Check size={14} /> Presentes
              </button>
              <button className="bulk-btn absent" onClick={() => markAllAs('ausente')} type="button">
                <X size={14} /> Ausentes
              </button>
            </div>
          </div>

          {/* Table of Students */}
          <div className="attendance-table-container">
            <table className="attendance-table">
              <thead>
                <tr>
                  <th>Aluno</th>
                  <th style={{ width: '260px' }}>Status da Chamada</th>
                  <th>Observações / Justificativa</th>
                  <th style={{ width: '130px', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {turmaStudents.length === 0 ? (
                  <tr>
                    <td className="empty-table" colSpan={4}>
                      {studentsSub.status === 'loading' || participantesStatus === 'loading'
                        ? 'Carregando alunos…'
                        : studentsSub.status === 'error' || participantesStatus === 'error'
                          ? 'Alunos indisponíveis — veja o aviso no topo da página.'
                          : studentSearch && listaChamada.length > 0
                            ? 'Nenhum aluno encontrado para a busca.'
                            : chamadaPorOficina
                              ? 'Nenhum aluno participa desta oficina na data. Inclua os participantes em Oficinas.'
                              : 'Nenhum aluno ativo nesta turma.'}
                    </td>
                  </tr>
                ) : (
                  turmaStudents.map((student) => {
                    const currentStatus = getStudentStatus(student.id)
                    const obs = getStudentObservation(student.id)
                    const isHighAbsence = student.faltasConsecutivas >= absenceThreshold

                    return (
                      <tr className={isHighAbsence ? 'row-alert' : ''} key={student.id}>
                        <td>
                          <div className="student-cell">
                            <span className="student-avatar-badge">
                              {student.name
                                .split(' ')
                                .map((n) => n[0])
                                .slice(0, 2)
                                .join('')}
                            </span>
                            <div className="student-info">
                              <div className="student-name-row">
                                {onViewStudentProfile ? (
                                  <button
                                    className="student-name-link"
                                    onClick={() => onViewStudentProfile(student.id)}
                                    title="Clique para ver o perfil completo do aluno"
                                    type="button"
                                  >
                                    <strong>{student.name}</strong>
                                  </button>
                                ) : (
                                  <strong>{student.name}</strong>
                                )}
                                {!elegivelIds.has(student.id) && (
                                  <span
                                    className="absence-warning-badge"
                                    title="Registrado nesta chamada, mas hoje não está elegível neste contexto (mudou de turma, foi inativado ou saiu da oficina). O registro salvo é mantido."
                                  >
                                    Fora do contexto atual
                                  </span>
                                )}
                                {isHighAbsence && (
                                  <span
                                    className="absence-warning-badge"
                                    title={`${student.faltasConsecutivas} faltas consecutivas`}
                                  >
                                    <AlertTriangle size={12} /> {student.faltasConsecutivas} faltas
                                  </span>
                                )}
                              </div>
                              <span className="student-sub">
                                {student.responsavelNome} ({student.telefone})
                              </span>
                            </div>
                          </div>
                        </td>

                        <td>
                          <div className="status-toggle-group">
                            <button
                              className={`status-toggle-btn present ${
                                currentStatus === 'presente' ? 'active' : ''
                              }`}
                              onClick={() => updateStudentAttendance(student.id, 'presente')}
                              type="button"
                            >
                              <Check size={14} /> Presente
                            </button>
                            <button
                              className={`status-toggle-btn absent ${
                                currentStatus === 'ausente' ? 'active' : ''
                              }`}
                              onClick={() => updateStudentAttendance(student.id, 'ausente')}
                              type="button"
                            >
                              <X size={14} /> Ausente
                            </button>
                            <button
                              className={`status-toggle-btn justified ${
                                currentStatus === 'justificado' ? 'active' : ''
                              }`}
                              onClick={() => updateStudentAttendance(student.id, 'justificado')}
                              type="button"
                            >
                              Justificado
                            </button>
                          </div>
                        </td>

                        <td>
                          <input
                            className="observation-input"
                            onChange={(e) =>
                              updateStudentAttendance(student.id, currentStatus, e.target.value)
                            }
                            placeholder={
                              currentStatus === 'ausente'
                                ? 'Informe a justificativa se houver...'
                                : 'Observações adicionais...'
                            }
                            type="text"
                            value={obs}
                          />
                        </td>

                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: '0.4rem' }}>
                            {isHighAbsence ? (
                              <>
                                <button
                                  className="button secondary sm-button alert-action-btn"
                                  onClick={() => handleOpenContactModal(student, dateStr)}
                                  title="Abrir ocorrência e registrar contato com a família devido às faltas recorrentes"
                                  type="button"
                                >
                                  <Phone size={13} /> Ocorrência
                                </button>
                                {onViewStudentProfile && (
                                  <button
                                    className="text-button-sm"
                                    onClick={() => onViewStudentProfile(student.id)}
                                    title="Ver ficha e perfil completo do aluno"
                                    type="button"
                                  >
                                    Ver perfil
                                  </button>
                                )}
                              </>
                            ) : (
                              <>
                                {currentStatus === 'ausente' && (
                                  <button
                                    className="button secondary sm-button"
                                    onClick={() =>
                                      handleOpenContactModal(
                                        student,
                                        dateStr,
                                        'Falta registrada no dia (sem justificativa prévia)'
                                      )
                                    }
                                    title="Abrir ocorrência ou registrar contato com a família"
                                    type="button"
                                  >
                                    <Phone size={13} /> Ocorrência
                                  </button>
                                )}
                                {onViewStudentProfile && (
                                  <button
                                    className="text-button-sm"
                                    onClick={() => onViewStudentProfile(student.id)}
                                    type="button"
                                  >
                                    Ver perfil
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </td>
                      </tr>
                    )
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* Footer Bar: Metrics & Save Button */}
          <div className="attendance-footer">
            <div className="stats-summary">
              <span className="stat-item total">
                <Users size={16} /> Total: <strong>{stats.total}</strong>
              </span>
              <span className="stat-item present">
                <CheckCircle2 size={16} /> Presentes: <strong>{stats.presentes}</strong>
              </span>
              <span className="stat-item absent">
                <XCircle size={16} /> Ausentes: <strong>{stats.ausentes}</strong>
              </span>
              <span className="stat-item justified">
                <Info size={16} /> Justificados: <strong>{stats.justificados}</strong>
              </span>
              <span className="stat-pill-pct">
                Presença: <strong>{stats.pctPresente}%</strong>
              </span>
            </div>

            <div className="save-action-group">
              {saveError && (
                <div className="modal-error-banner save-error-banner" role="alert">
                  <AlertTriangle size={16} />
                  <span>{saveError.message}</span>
                  {saveError.conflito ? (
                    <button className="text-button" onClick={reloadSession} type="button">
                      Recarregar chamada salva (descarta o que não foi salvo)
                    </button>
                  ) : (
                    <button className="text-button" disabled={savingChamada} onClick={handleSaveAttendance} type="button">
                      Tentar novamente
                    </button>
                  )}
                </div>
              )}
              {saveSuccessMessage && (
                <span className="save-toast-msg">
                  <CheckCircle2 size={16} /> {saveSuccessMessage}
                </span>
              )}
              <button
                className="button primary"
                disabled={
                  savingChamada ||
                  sessionStatus !== 'ready' ||
                  studentsSub.status !== 'ready' ||
                  participantesStatus !== 'ready' ||
                  dateStr > hojeLocalISO()
                }
                onClick={handleSaveAttendance}
                type="button"
              >
                <Save size={18} />{' '}
                {savingChamada
                  ? 'Gravando no Banco...'
                  : sessionStatus === 'loading'
                    ? 'Carregando chamada...'
                    : savedSession
                      ? 'Salvar alterações'
                      : 'Salvar Chamada'}
              </button>
            </div>
          </div>
        </section>

        {/* Right Section: Recurrent Absences Alert & Family Contact Register */}
        <aside className="frequencia-aside">
          {/* Card: High Absences List */}
          <section className="aside-card alert-card">
            <div className="aside-card-header">
              <div className="header-with-icon">
                <AlertTriangle className="text-warning-icon" size={20} />
                <h3>Alerta de Faltas Recorrentes</h3>
              </div>
              <span className="badge-count warning">{recurrentAbsenceStudents.length}</span>
            </div>

            <p className="aside-description">
              Alunos com <strong>{absenceThreshold} ou mais faltas consecutivas</strong> que
              requerem contato com a família e acompanhamento da equipe.
            </p>

            <div className="recurrent-students-list">
              {recurrentAbsenceStudents.length === 0 ? (
                <div className="empty-alert-box">
                  <CheckCircle2 size={24} style={{ color: 'var(--color-success, #10b981)' }} />
                  <p>Nenhum aluno atingiu o limite de faltas consecutivas no momento.</p>
                </div>
              ) : (
                recurrentAbsenceStudents.map((st) => (
                  <article className="recurrent-item" key={st.id}>
                    <div className="recurrent-main-info">
                      <span className="recurrent-avatar">
                        {st.name
                          .split(' ')
                          .map((n) => n[0])
                          .slice(0, 2)
                          .join('')}
                      </span>
                      <div className="recurrent-text">
                        {onViewStudentProfile ? (
                          <button
                            className="student-name-link"
                            onClick={() => onViewStudentProfile(st.id)}
                            title="Ver perfil completo do aluno"
                            type="button"
                          >
                            <strong>{st.name}</strong>
                          </button>
                        ) : (
                          <strong>{st.name}</strong>
                        )}
                        <span>
                          {st.turma}
                          · {st.faltasConsecutivas} faltas consecutivas
                        </span>
                      </div>
                    </div>

                    <div className="recurrent-actions">
                      <button
                        className="button secondary sm-button full-width-btn"
                        onClick={() => {
                          getStudentById(st.id).then((aluno) => {
                            if (aluno) handleOpenContactModal(aluno)
                          })
                        }}
                        type="button"
                      >
                        <Phone size={14} /> Registrar Contato Família
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          </section>

          {/* Quick Guidance Card */}
          <section className="aside-card guide-card">
            <h3>
              <ClipboardCheck size={18} /> Orientações da Instituição
            </h3>
            <ul className="guide-list">
              <li>
                <strong>Chamada Diária:</strong> Realize a chamada no início de cada período ou
                oficina.
              </li>
              <li>
                <strong>Faltas Consecutivas:</strong> Ao atingir o limite
                configurado ({absenceThreshold} faltas), o sistema gera um
                alerta à equipe.
              </li>
              <li>
                <strong>Contato com Família:</strong> Registre todas as tentativas e retornos de
                contato telefônico, presencial ou por WhatsApp para garantir o histórico
                pedagógico.
              </li>
            </ul>
          </section>
        </aside>
      </div>

      {/* Modal: Registrar Contato com a Família / Abrir Ocorrência */}
      {selectedStudentForContact && (
        <div className="modal-backdrop" onClick={fecharContato}>
          <div className="modal-container" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <div className="modal-title-group">
                <Phone className="modal-icon" size={22} />
                <div>
                  <h3>Abrir Ocorrência & Registrar Contato com a Família</h3>
                  <p>Aluno: <strong>{selectedStudentForContact.name}</strong> ({selectedStudentForContact.turma})</p>
                </div>
              </div>
              <button
                aria-label="Fechar"
                className="icon-button modal-close"
                onClick={fecharContato}
                type="button"
              >
                <X size={20} />
              </button>
            </header>

            <form className="modal-form" onSubmit={handleSubmitContact}>
              {familyContactSuccess && (
                <div className="modal-success-banner">
                  <CheckCircle2 size={18} /> {familyContactSuccess}
                </div>
              )}

              <div className="modal-grid">
                <label className="field field-wide">
                  <span>Motivo da Ocorrência / Assunto</span>
                  <select
                    onChange={(e) => setContactReason(e.target.value)}
                    value={contactReason}
                  >
                    <option value="Faltas consecutivas recorrentes (Alerta institucional)">
                      Alerta institucional: Faltas consecutivas recorrentes
                    </option>
                    <option value="Ausência do dia sem justificativa prévia">
                      Ausência do dia sem justificativa prévia
                    </option>
                    <option value="Busca ativa / Prevenção de evasão escolar">
                      Busca ativa / Prevenção de evasão escolar
                    </option>
                    <option value="Justificativa médica ou atestado apresentado">
                      Justificativa médica ou atestado apresentado
                    </option>
                    <option value="Outro alinhamento pedagógico ou familiar">
                      Outro alinhamento pedagógico ou familiar
                    </option>
                  </select>
                </label>

                <label className="field">
                  <span>Data da Falta Relacionada</span>
                  <input
                    onChange={(e) => setContactFaltaDate(e.target.value)}
                    required
                    type="date"
                    value={contactFaltaDate}
                  />
                </label>

                <label className="field">
                  <span>Meio de Contato</span>
                  <select
                    onChange={(e) => setContactType(e.target.value)}
                    value={contactType}
                  >
                    {CONTACT_METHOD_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span>Responsável pelo Contato (Profissional)</span>
                  <input
                    readOnly
                    required
                    title="Registrado com o usuário autenticado"
                    type="text"
                    value={contactResponsible}
                  />
                </label>

                <label className="field">
                  <span>Status da Ocorrência</span>
                  <select
                    onChange={(e) => setContactStatus(e.target.value)}
                    value={contactStatus}
                  >
                    <option value="Aberta / Em acompanhamento">Aberta / Em acompanhamento</option>
                    <option value="Resolvida / Família justificou ausência">Resolvida / Família justificou ausência</option>
                    <option value="Encaminhada para Serviço Social / CRAS">Encaminhada para Serviço Social / CRAS</option>
                    <option value="Encaminhada para Direção Pedagógica">Encaminhada para Direção Pedagógica</option>
                  </select>
                </label>

                <div className="family-info-box field-wide">
                  <label className="field">
                    <span>Responsável familiar contatado</span>
                    <select value={selectedGuardianId} onChange={(event) => setSelectedGuardianId(event.target.value)} required>
                      <option value="">Selecione um responsável ativo</option>
                      {contactGuardians.map((guardian) => <option key={guardian.id} value={guardian.id}>{guardian.nome} · {guardian.parentesco}{guardian.principal ? ' · Principal' : ''}</option>)}
                    </select>
                    {guardiansError ? (
                      <LoadError
                        error={guardiansError}
                        onRetry={() => {
                          setGuardiansError(null)
                          setGuardiansAttempt((n) => n + 1)
                        }}
                        what="os responsáveis do aluno"
                      />
                    ) : (
                      contactGuardians.length === 0 && <small>Este aluno não tem responsáveis ativos cadastrados.</small>
                    )}
                  </label>
                  <div className="family-info-row">
                    <span>
                      <User size={14} /> Familiar selecionado:
                    </span>
                    <strong>
                      {contactGuardians.find((item) => item.id === selectedGuardianId)?.nome || '—'} (
                      {contactGuardians.find((item) => item.id === selectedGuardianId)?.parentesco || '—'})
                    </strong>
                  </div>
                  <div className="family-info-row">
                    <span>
                      <Phone size={14} /> Telefone:
                    </span>
                    <strong>{maskPhone(contactGuardians.find((item) => item.id === selectedGuardianId)?.telefone || '') || 'Não informado'}</strong>
                  </div>
                </div>

                <label className="field field-wide">
                  <span>Observações e Retorno da Família *</span>
                  <textarea
                    onChange={(e) => setContactNote(e.target.value)}
                    placeholder="Descreva o motivo da ausência relatado pela família, acordos feitos ou próximos passos..."
                    required
                    rows={4}
                    value={contactNote}
                  />
                </label>
              </div>

              {/* History of Previous Contacts */}
              {occurrencesSub.status === 'error' && (
                <LoadError
                  error={occurrencesSub.error}
                  what="o histórico de contatos"
                  onRetry={occurrencesSub.retry}
                />
              )}

              {occurrencesSub.status === 'loading' && (
                <div className="contact-history-section">
                  <h4>
                    <History size={16} /> Histórico de Contatos Anteriores
                  </h4>
                  <p className="history-item-note">Carregando histórico…</p>
                </div>
              )}

              {occurrencesSub.status === 'ready' && contactHistory.length === 0 && (
                <div className="contact-history-section">
                  <h4>
                    <History size={16} /> Histórico de Contatos Anteriores
                  </h4>
                  <p className="history-item-note">Nenhum contato registrado para este aluno.</p>
                </div>
              )}

              {occurrencesSub.status === 'ready' && contactHistory.length > 0 && (
                <div className="contact-history-section">
                  <h4>
                    <History size={16} /> Histórico de Contatos Anteriores (
                    {contactHistory.length})
                  </h4>
                  <div className="contact-history-list">
                    {contactHistory.map((c, index) => (
                      <div className="history-item-row" key={c.id || index}>
                        <div className="history-item-meta">
                          <strong>{c.contactDate}</strong> — <small>{c.type}</small> por{' '}
                          <em>{c.responsible}</em> (Falta de {c.faltaDate})
                          {c.status && <span style={{ marginLeft: '0.5rem', fontSize: '0.75rem', opacity: 0.85 }}>[{c.status}]</span>}
                        </div>
                        {(c.guardianName || c.guardianContact) && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-sub, #4b5563)', margin: '0.2rem 0' }}>
                            <strong>Familiar:</strong> {c.guardianName || 'Não identificado'}
                            {c.guardianRelationship ? ` (${c.guardianRelationship})` : ''}
                            {c.guardianContact ? ` · ${c.guardianContact}` : ''}
                          </div>
                        )}
                        {c.reason && (
                          <div style={{ fontSize: '0.8rem', color: 'var(--color-text-sub, #4b5563)', margin: '0.2rem 0' }}>
                            <strong>Motivo:</strong> {c.reason}
                          </div>
                        )}
                        <p className="history-item-note">"{c.note}"</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <footer className="modal-footer">
                <button
                  className="button secondary"
                  onClick={fecharContato}
                  type="button"
                >
                  Cancelar
                </button>
                <button className="button primary" disabled={savingContact} type="submit">
                  <Save size={18} /> {savingContact ? 'Gravando Ocorrência...' : 'Salvar Ocorrência e Contato'}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
