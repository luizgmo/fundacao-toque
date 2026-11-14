import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  writeBatch,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../lib/firebase'
import type { Student, StudentStatus, DocumentoTipo, DocumentEntry, Guardian } from '../features/alunos/students-data'
import type { UserRole } from '../types/auth'
import { demoStudents } from '../features/alunos/students-data'
import { DEMO_STUDENTS_STORAGE_KEY, isDemoModeEnabled } from '../lib/demoMode'
import { confirmWrite } from '../lib/persistence'

const ALUNOS_COLLECTION = 'alunos'

type EmbeddedDocument = {
  id?: string
  name?: string
  tipo_documento?: string
  tipo?: string
  data_url?: string
  dataUrl?: string
  nome_arquivo_original?: string
  nomeArquivoOriginal?: string
  tipo_conteudo?: string
  tipoConteudo?: string
  tamanho_bytes?: number
  tamanhoBytes?: number
  enviado_por?: string
  enviadoPor?: string
  enviado_em?: string | number | Date
  attachedAt?: string
  kind?: 'pdf' | 'lgpd'
}

// Converte Timestamp do Firestore (ou Date/ISO) para ISO-8601.
function timestampToISO(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value
  if (typeof value === 'number') return new Date(value).toISOString()
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

// Converte documento Firestore para a interface Student da UI
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function docToStudent(id: string, data: any): Student {
  // Converte data de YYYY-MM-DD para DD/MM/AAAA se necessário
  let formattedBirth = data.data_nascimento || data.birthDate || ''
  if (formattedBirth && formattedBirth.includes('-')) {
    const [y, m, d] = formattedBirth.split('-')
    if (y && m && d) formattedBirth = `${d}/${m}/${y}`
  }

  // Mapeia status
  const rawStatus = (data.status || '').toLowerCase()
  const status: StudentStatus = rawStatus === 'inativo' || rawStatus === 'inativa' ? 'Inativo' : 'Ativo'

  return {
    id,
    name: data.nome_completo || data.name || 'Sem nome',
    birthDate: formattedBirth,
    sexo: data.sexo || 'Não informado',
    turma: data.turma || 'Turma A',
    turmaId: data.turma_id || undefined,
    turmaTurno: data.turma_turno || data.turmaTurno || 'Manhã (8h–12h)',
    status,
    observacoes: data.observacoes || '',
    usoImagemAutorizado: data.uso_imagem_autorizado === true,
    consentimentoImagemEm: timestampToISO(data.consentimento_imagem_em),
    tratamentoDadosAutorizado: data.tratamento_dados_autorizado === true,
    responsavelNome: data.responsavel_nome || data.responsavelNome || '—',
    parentesco: data.responsavel_parentesco || data.parentesco || 'Mãe',
    telefone: data.responsavel_telefone || data.telefone || '',
    email: data.responsavel_email || data.email || '',
    oficinas: Array.isArray(data.oficinas) ? data.oficinas : [],
    documentos: Array.isArray(data.documentos)
      ? (data.documentos as EmbeddedDocument[])
          .filter((d) => (d.tipo_documento || d.tipo || 'outro') !== 'ficha_medica')
          .map((d) => ({
            id: d.id || d.name || 'doc-legacy',
            tipo: (d.tipo_documento || d.tipo || 'outro') as DocumentoTipo,
            dataUrl: d.data_url || d.dataUrl || '',
            nomeArquivoOriginal: d.nome_arquivo_original || d.nomeArquivoOriginal || d.name || 'documento',
            tipoConteudo: d.tipo_conteudo || d.tipoConteudo || 'application/octet-stream',
            tamanhoBytes: d.tamanho_bytes ?? d.tamanhoBytes ?? 0,
            enviadoPor: d.enviado_por || d.enviadoPor || 'sistema',
            enviadoEm: timestampToISO(d.enviado_em) ?? (d.attachedAt || new Date().toISOString()),
            // Campos legados mantidos para compatibilidade com dados existentes
            name: d.name || d.nome_arquivo_original || d.nomeArquivoOriginal || undefined,
            attachedAt: d.attachedAt || undefined,
            kind: (d.kind as 'pdf' | 'lgpd') || undefined,
          }))
      : data.uso_imagem_autorizado
        ? [{
            id: 'lgpd-legacy',
            tipo: 'autorizacao_imagem' as DocumentoTipo,
            dataUrl: '',
            nomeArquivoOriginal: 'Autorização de Imagem (LGPD)',
            tipoConteudo: 'application/pdf',
            tamanhoBytes: 0,
            enviadoPor: 'sistema',
            enviadoEm: new Date().toISOString(),
          }]
        : [],
    faltasConsecutivas: data.faltas_consecutivas ?? data.faltasConsecutivas ?? 0,
    frequenciaMedia: data.frequencia_media ?? data.frequenciaMedia ?? 100,
    reports: Array.isArray(data.reports) ? data.reports : [],
    contacts: Array.isArray(data.contacts) ? data.contacts : [],
    activities: Array.isArray(data.activities) ? data.activities : [],
  }
}

const LOCAL_DOCUMENTOS_KEY = 'fundacao_toque_local_documentos'

export type StudentsSource = 'firestore' | 'demo' | 'empty' | 'error'

// Lista fictícia mutável usada apenas enquanto o modo demonstração está ativo.
export function getDemoStudents(): Student[] {
  try {
    const raw = localStorage.getItem(DEMO_STUDENTS_STORAGE_KEY)
    if (raw) return JSON.parse(raw)
  } catch {
    // ignore
  }
  return demoStudents
}

function saveDemoStudents(list: Student[]) {
  try {
    localStorage.setItem(DEMO_STUDENTS_STORAGE_KEY, JSON.stringify(list))
  } catch {
    // ignore
  }
}

// Documentos do modo demonstração (ficam apenas neste navegador; nunca usados
// como substituto do Firestore fora desse modo).
function getStoredDocumentos(alunoId: string): DocumentEntry[] {
  try {
    const raw = localStorage.getItem(`${LOCAL_DOCUMENTOS_KEY}_${alunoId}`)
    if (raw) {
      return JSON.parse(raw)
    }
  } catch {
    // ignore
  }
  return []
}

function saveStoredDocumentos(alunoId: string, docs: DocumentEntry[]) {
  try {
    localStorage.setItem(`${LOCAL_DOCUMENTOS_KEY}_${alunoId}`, JSON.stringify(docs))
  } catch {
    // ignore
  }
}

function appendStoredDocumento(alunoId: string, doc: DocumentEntry) {
  const current = getStoredDocumentos(alunoId)
  const updated = [...current.filter((d) => d.id !== doc.id), doc]
  saveStoredDocumentos(alunoId, updated)
}

// Inscrição em tempo real na coleção real de alunos.
// O modo demonstração é explícito e nunca se mistura com o Firestore.
// Falhas chegam apenas por onError: nunca são convertidas em lista vazia.
export function subscribeToStudents(
  onSuccess: (students: Student[]) => void,
  onError: (error: Error) => void,
  onSource?: (source: StudentsSource) => void
) {
  if (isDemoModeEnabled()) {
    onSource?.('demo')
    onSuccess(getDemoStudents())
    return () => {}
  }

  if (!isFirebaseConfigured) {
    const error = new Error('Firebase não configurado: preencha o arquivo .env.local.')
    onSource?.('error')
    onError(error)
    return () => {}
  }

  const colRef = collection(db, ALUNOS_COLLECTION)
  return onSnapshot(
    colRef,
    (snapshot) => {
      const list = snapshot.docs.map((docSnap) => docToStudent(docSnap.id, docSnap.data()))
      onSource?.(list.length > 0 ? 'firestore' : 'empty')
      onSuccess(list)
    },
    (err) => {
      console.warn('Erro ao carregar alunos do Firestore:', err.message)
      onSource?.('error')
      onError(err)
    }
  )
}

// Busca aluno por ID (sem fallback fictício). Devolve null somente quando o
// aluno não existe; falhas de leitura são propagadas. Os responsáveis são
// carregados à parte (getStudentGuardians) por quem precisa deles, para que uma
// falha nessa subcoleção não seja confundida com "aluno sem responsáveis".
export async function getStudentById(id: string): Promise<Student | null> {
  if (isDemoModeEnabled()) {
    return getDemoStudents().find((s) => s.id === id) || null
  }
  const snap = await getDoc(doc(db, ALUNOS_COLLECTION, id))
  return snap.exists() ? docToStudent(snap.id, snap.data()) : null
}

export async function getStudentGuardians(studentId: string): Promise<Guardian[]> {
  if (isDemoModeEnabled()) return getDemoStudents().find((item) => item.id === studentId)?.responsaveis || []
  const snapshot = await getDocs(collection(db, ALUNOS_COLLECTION, studentId, 'responsaveis'))
  return snapshot.docs.map((item) => {
    const data = item.data()
    return {
      id: item.id,
      nome: String(data.nome_completo || ''),
      parentesco: String(data.parentesco || 'Outro'),
      telefone: String(data.telefone || ''),
      telefoneAlternativo: String(data.telefone_alternativo || ''),
      email: String(data.email || ''),
      principal: data.principal === true,
      ativo: data.ativo !== false,
    }
  })
}

export type StudentInput = {
  id?: string
  nome: string
  nascimento: string
  sexo: string
  observacoes: string
  responsavelNome: string
  parentesco: string
  responsaveis?: Guardian[]
  cpf?: string
  rg?: string
  telefonePrincipal: string
  telefoneSecundario?: string
  email?: string
  endereco?: string
  turmas: string[]
  turmaId?: string
  turmaTurno?: string
  oficinas: string[]
  fichaMatricula?: string
  lgpdImagem?: boolean
  lgpdDados?: boolean
  status?: StudentStatus
}

// Gera o ID do documento do aluno a partir do nome. A tela reserva o ID antes da
// primeira tentativa para que novas tentativas regravem o mesmo documento.
export function gerarIdAluno(nome: string): string {
  return (
    nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + `-${Date.now().toString().slice(-4)}`
  )
}

// Criar aluno. Só devolve o ID depois que o Firestore confirma a gravação.
export async function createStudent(input: StudentInput): Promise<string> {
  const guardians = input.responsaveis?.length ? input.responsaveis : [{
    nome: input.responsavelNome,
    parentesco: input.parentesco,
    telefone: input.telefonePrincipal,
    telefoneAlternativo: input.telefoneSecundario || '',
    email: input.email || '',
    principal: true,
    ativo: true,
  }]
  const ativos = guardians.filter((item) => item.ativo)
  if (!ativos.length || ativos.filter((item) => item.principal).length !== 1) {
    throw new Error('Cadastre ao menos um responsável ativo e selecione exatamente um principal.')
  }
  if (ativos.some((item) => !item.nome.trim() || !item.telefone.trim())) {
    throw new Error('Informe nome e telefone de cada responsável ativo.')
  }
  const principal = ativos.find((item) => item.principal)!
  const id = input.id || gerarIdAluno(input.nome)

  let formattedBirth = input.nascimento
  if (formattedBirth && formattedBirth.includes('-')) {
    const [y, m, d] = formattedBirth.split('-')
    if (y && m && d) formattedBirth = `${d}/${m}/${y}`
  }

  const localNewStudent: Student = {
    id,
    name: input.nome,
    birthDate: formattedBirth,
    sexo: input.sexo,
    status: input.status || 'Ativo',
    usoImagemAutorizado: Boolean(input.lgpdImagem),
    consentimentoImagemEm: input.lgpdImagem ? new Date().toISOString() : undefined,
    tratamentoDadosAutorizado: Boolean(input.lgpdDados),
    turma: input.turmas[0] || 'Turma A',
    turmaId: input.turmaId,
    turmaTurno: input.turmaTurno || 'Manhã (8h–12h)',
    observacoes: input.observacoes || '',
    responsavelNome: input.responsavelNome,
    parentesco: input.parentesco || 'Mãe',
    telefone: input.telefonePrincipal,
    email: input.email || '',
    oficinas: input.oficinas || [],
    documentos: [],
    responsaveis: guardians,
    faltasConsecutivas: 0,
    frequenciaMedia: 100,
    reports: [],
    contacts: [],
    activities: [],
  }

  // Modo demonstração: grava apenas no armazenamento local, sem tocar no Firebase
  if (isDemoModeEnabled()) {
    const currentList = getDemoStudents()
    saveDemoStudents([localNewStudent, ...currentList.filter((s) => s.id !== id)])
    return id
  }

  const guardianEntries = guardians.map((guardian) => ({
    guardian,
    ref: guardian.id
      ? doc(db, ALUNOS_COLLECTION, id, 'responsaveis', guardian.id)
      : doc(collection(db, ALUNOS_COLLECTION, id, 'responsaveis')),
  }))
  const principalEntry = guardianEntries.find(({ guardian }) => guardian === principal)!
  const studentData = {
    nome_completo: input.nome,
    nome_busca: input.nome.toLowerCase(),
    data_nascimento: input.nascimento,
    sexo: input.sexo,
    status: (input.status || 'Ativo').toLowerCase(),
    uso_imagem_autorizado: Boolean(input.lgpdImagem),
    consentimento_imagem_em: input.lgpdImagem ? serverTimestamp() : null,
    tratamento_dados_autorizado: Boolean(input.lgpdDados),
    observacoes: input.observacoes || '',
    turma: input.turmas[0] || 'Turma A',
    turma_id: input.turmaId || null,
    turma_turno:
      input.turmaTurno ||
      (input.turmas[0]?.includes('b') ? 'Tarde (13h–17h)' : 'Manhã (8h–12h)'),
    oficinas: input.oficinas,
    responsavel_nome: principal.nome,
    responsavel_parentesco: principal.parentesco,
    responsavel_cpf: input.cpf || '',
    responsavel_rg: input.rg || '',
    responsavel_telefone: principal.telefone,
    responsavel_telefone_secundario: principal.telefoneAlternativo || '',
    responsavel_email: principal.email || '',
    responsavel_principal_id: principalEntry.ref.id,
    responsavel_endereco: input.endereco || '',
    ficha_matricula_nome: input.fichaMatricula || '',
    faltas_consecutivas: 0,
    frequencia_media: 100,
    reports: [],
    contacts: [],
    activities: [],
    criado_em: serverTimestamp(),
    atualizado_em: serverTimestamp(),
  }

  const batch = writeBatch(db)
  batch.set(doc(db, ALUNOS_COLLECTION, id), studentData)
  guardianEntries.forEach(({ guardian, ref }) => batch.set(ref, {
    nome_completo: guardian.nome.trim(),
    parentesco: guardian.parentesco,
    telefone: guardian.telefone,
    telefone_alternativo: guardian.telefoneAlternativo || null,
    email: guardian.email || null,
    principal: guardian === principal,
    ativo: guardian.ativo,
    criado_em: serverTimestamp(),
    atualizado_em: serverTimestamp(),
  }))
  await confirmWrite('cadastrar o aluno', batch.commit())

  return id
}

// Atualizar aluno
export async function updateStudent(id: string, input: Partial<StudentInput>): Promise<void> {
  const guardianPrincipal = input.responsaveis?.find((guardian) => guardian.principal && guardian.ativo)
  if (input.responsaveis && input.responsaveis.filter((guardian) => guardian.principal && guardian.ativo).length !== 1) {
    throw new Error('Selecione exatamente um responsável principal ativo.')
  }
  if (isDemoModeEnabled()) {
    const currentList = getDemoStudents()
    const updatedList = currentList.map((st) => {
      if (st.id !== id) return st

      let formattedBirth = st.birthDate
      if (input.nascimento) {
        formattedBirth = input.nascimento
        if (formattedBirth.includes('-')) {
          const [y, m, d] = formattedBirth.split('-')
          if (y && m && d) formattedBirth = `${d}/${m}/${y}`
        }
      }

      return {
        ...st,
        name: input.nome !== undefined ? input.nome : st.name,
        birthDate: formattedBirth,
        sexo: input.sexo !== undefined ? input.sexo : st.sexo,
        turma: input.turmas && input.turmas.length > 0 ? input.turmas[0] : st.turma,
        turmaId: input.turmaId !== undefined ? input.turmaId : st.turmaId,
        turmaTurno: input.turmaTurno !== undefined ? input.turmaTurno : st.turmaTurno,
        usoImagemAutorizado:
          input.lgpdImagem !== undefined ? input.lgpdImagem : st.usoImagemAutorizado,
        consentimentoImagemEm:
          input.lgpdImagem === true && !st.usoImagemAutorizado
            ? new Date().toISOString()
            : input.lgpdImagem === false
              ? undefined
              : st.consentimentoImagemEm,
        tratamentoDadosAutorizado:
          input.lgpdDados !== undefined ? input.lgpdDados : st.tratamentoDadosAutorizado,
        observacoes: input.observacoes !== undefined ? input.observacoes : st.observacoes,
        responsavelNome: input.responsavelNome !== undefined ? input.responsavelNome : st.responsavelNome,
        parentesco: input.parentesco !== undefined ? input.parentesco : st.parentesco,
        telefone: input.telefonePrincipal !== undefined ? input.telefonePrincipal : st.telefone,
        email: input.email !== undefined ? input.email : st.email,
        oficinas: input.oficinas !== undefined ? input.oficinas : st.oficinas,
        status: input.status !== undefined ? input.status : st.status,
        responsaveis: input.responsaveis !== undefined ? input.responsaveis : st.responsaveis,
      }
    })
    saveDemoStudents(updatedList)
    return
  }

  const updateData: Record<string, unknown> = {
    atualizado_em: serverTimestamp(),
  }
  if (input.nome !== undefined) {
    updateData.nome_completo = input.nome
    updateData.nome_busca = input.nome.toLowerCase()
  }
  if (input.nascimento !== undefined) updateData.data_nascimento = input.nascimento
  if (input.sexo !== undefined) updateData.sexo = input.sexo
  if (input.observacoes !== undefined) updateData.observacoes = input.observacoes
  if (input.turmas && input.turmas.length > 0) updateData.turma = input.turmas[0]
  if (input.turmaId !== undefined) updateData.turma_id = input.turmaId
  if (input.turmaTurno !== undefined) updateData.turma_turno = input.turmaTurno
  if (input.oficinas !== undefined) updateData.oficinas = input.oficinas
  if (guardianPrincipal) {
    updateData.responsavel_nome = guardianPrincipal.nome
    updateData.responsavel_parentesco = guardianPrincipal.parentesco
    updateData.responsavel_telefone = guardianPrincipal.telefone
    updateData.responsavel_telefone_secundario = guardianPrincipal.telefoneAlternativo || ''
    updateData.responsavel_email = guardianPrincipal.email || ''
  } else {
    if (input.responsavelNome !== undefined) updateData.responsavel_nome = input.responsavelNome
    if (input.parentesco !== undefined) updateData.responsavel_parentesco = input.parentesco
  }
  if (input.cpf !== undefined) updateData.responsavel_cpf = input.cpf
  if (input.rg !== undefined) updateData.responsavel_rg = input.rg
  if (!guardianPrincipal && input.telefonePrincipal !== undefined) updateData.responsavel_telefone = input.telefonePrincipal
  if (!guardianPrincipal && input.telefoneSecundario !== undefined) updateData.responsavel_telefone_secundario = input.telefoneSecundario
  if (!guardianPrincipal && input.email !== undefined) updateData.responsavel_email = input.email
  if (input.endereco !== undefined) updateData.responsavel_endereco = input.endereco
  if (input.lgpdImagem !== undefined) {
    updateData.uso_imagem_autorizado = input.lgpdImagem
    if (!input.lgpdImagem) {
      // Revogação: a data do consentimento deixa de existir.
      updateData.consentimento_imagem_em = null
    } else {
      const atual = await getDoc(doc(db, ALUNOS_COLLECTION, id))
      const atualData = atual.data()
      // Só registra nova data quando o consentimento está sendo concedido agora.
      if (!atualData?.uso_imagem_autorizado || !atualData?.consentimento_imagem_em) {
        updateData.consentimento_imagem_em = serverTimestamp()
      }
    }
  }
  if (input.lgpdDados !== undefined) updateData.tratamento_dados_autorizado = input.lgpdDados
  if (input.status !== undefined) updateData.status = input.status.toLowerCase()

  const batch = writeBatch(db)
  const studentRef = doc(db, ALUNOS_COLLECTION, id)
  if (input.responsaveis) {
    const existing = await getDocs(collection(db, ALUNOS_COLLECTION, id, 'responsaveis'))
    const guardians = input.responsaveis
    const guardianEntries = guardians.map((guardian) => ({
      guardian,
      ref: guardian.id
        ? doc(db, ALUNOS_COLLECTION, id, 'responsaveis', guardian.id)
        : doc(collection(db, ALUNOS_COLLECTION, id, 'responsaveis')),
    }))
    const principalEntry = guardianEntries.find(({ guardian }) => guardian === guardianPrincipal)
    if (!principalEntry) throw new Error('O responsável principal não foi encontrado.')
    updateData.responsavel_principal_id = principalEntry.ref.id
    const keepIds = new Set(guardians.filter((guardian) => guardian.id).map((guardian) => guardian.id))
    existing.docs.forEach((item) => {
      if (!keepIds.has(item.id)) batch.update(item.ref, { ativo: false, principal: false, atualizado_em: serverTimestamp() })
    })
    guardianEntries.forEach(({ guardian, ref }) => batch.set(ref, {
      nome_completo: guardian.nome.trim(), parentesco: guardian.parentesco,
      telefone: guardian.telefone, telefone_alternativo: guardian.telefoneAlternativo || null,
      email: guardian.email || null, principal: guardian === guardianPrincipal, ativo: guardian.ativo,
      atualizado_em: serverTimestamp(), ...(!guardian.id ? { criado_em: serverTimestamp() } : {}),
    }, { merge: true }))
  }
  batch.update(studentRef, updateData)
  await confirmWrite('atualizar os dados do aluno', batch.commit())
}

// Inativar aluno (em vez de excluir, para preservar histórico)
export async function inactivateStudent(id: string): Promise<void> {
  if (isDemoModeEnabled()) {
    const updatedList = getDemoStudents().map((st) =>
      st.id === id ? { ...st, status: 'Inativo' as StudentStatus } : st
    )
    saveDemoStudents(updatedList)
    return
  }

  await confirmWrite(
    'inativar o aluno',
    updateDoc(doc(db, ALUNOS_COLLECTION, id), {
      status: 'inativo',
      atualizado_em: serverTimestamp(),
    })
  )
}

// Manter função deleteStudent para compatibilidade, mas agora inativa
export async function deleteStudent(id: string): Promise<void> {
  return inactivateStudent(id)
}

// ============================================================================
// Documentos do aluno (arquivo em base64 dentro do Firestore, sem custo do Storage)
// ============================================================================

const DOCUMENTOS_SUBCOLLECTION = 'documentos'

// Limite de 500 KB por documento (Firestore limita ~1MB por documento; base64 expande ~33%).
export const MAX_DOCUMENTO_BYTES = 500 * 1024

const TIPOS_PERMITIDOS: Record<string, boolean> = {
  'application/pdf': true,
  'image/jpeg': true,
  'image/png': true,
  'image/jpg': true,
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo.'))
    reader.readAsDataURL(file)
  })
}

// Lê um arquivo como DataURL (base64) e grava os metadados + conteúdo em
// alunos/{alunoId}/documentos/{documentoId} dentro do Firestore.
// Só devolve o documento depois da confirmação do servidor; em falha lança
// PersistenceError e nada é guardado localmente como se estivesse salvo.
export async function uploadDocumento(
  alunoId: string,
  file: File,
  tipo: DocumentoTipo,
  userId: string
): Promise<DocumentEntry> {
  if (!TIPOS_PERMITIDOS[file.type]) {
    throw new Error(`Tipo de arquivo não permitido: ${file.type || 'desconhecido'}`)
  }
  if (file.size > MAX_DOCUMENTO_BYTES) {
    throw new Error(`Arquivo excede o limite de ${Math.round(MAX_DOCUMENTO_BYTES / 1024)} KB`)
  }

  const docRef = doc(collection(db, `${ALUNOS_COLLECTION}/${alunoId}/${DOCUMENTOS_SUBCOLLECTION}`))
  const dataUrl = await fileToDataUrl(file)

  const agora = new Date().toISOString()
  const entry: DocumentEntry = {
    id: docRef.id,
    tipo,
    dataUrl,
    nomeArquivoOriginal: file.name,
    tipoConteudo: file.type,
    tamanhoBytes: file.size,
    enviadoPor: userId,
    enviadoEm: agora,
  }

  // Modo demonstração: documentos ficam apenas neste navegador
  if (isDemoModeEnabled()) {
    appendStoredDocumento(alunoId, entry)
    return entry
  }

  await confirmWrite(
    `enviar o documento ${file.name}`,
    setDoc(docRef, {
      tipo_documento: tipo,
      data_url: dataUrl,
      nome_arquivo_original: file.name,
      tipo_conteudo: file.type,
      tamanho_bytes: file.size,
      enviado_por: userId,
      enviado_em: serverTimestamp(),
    })
  )

  return entry
}

// Lista os documentos de um aluno, retornando o dataUrl (base64) de cada um.
// Fora do modo demonstração, falhas de leitura são propagadas: uma cópia local
// não pode ser exibida como se fosse o que está gravado no sistema.
//
// A regra de segurança do Firestore restringe a leitura de `ficha_medica` à
// Direção e Pedagogia. Como as regras não funcionam como filtro, uma consulta
// aberta que pudesse retornar um documento sem permissão é rejeitada por inteiro.
// Para não barrar o carregamento de todos os documentos do administrativo,
// excluímos os documentos médicos da consulta quando o papel for administrativo.
// (direcao e pedagogia mantêm a consulta sem filtro e veem tudo.)
export async function getDocumentosComUrl(
  alunoId: string,
  papel?: UserRole
): Promise<(DocumentEntry & { url: string | null })[]> {
  if (isDemoModeEnabled()) {
    return getStoredDocumentos(alunoId).map((entry) => ({ ...entry, url: entry.dataUrl || null }))
  }

  const documentosRef = collection(
    db,
    `${ALUNOS_COLLECTION}/${alunoId}/${DOCUMENTOS_SUBCOLLECTION}`
  )
  const ref =
    papel === 'administrativo'
      ? query(documentosRef, where('tipo_documento', '!=', 'ficha_medica'))
      : documentosRef

  const snap = await getDocs(ref)
  return snap.docs.map((d) => {
      const data = d.data()
      let enviadoEmISO: string
      try {
        const ts = timestampToISO(data.enviado_em)
        enviadoEmISO = ts ?? new Date().toISOString()
      } catch {
        enviadoEmISO = new Date().toISOString()
      }
      const entry: DocumentEntry = {
        id: d.id,
        tipo: (data.tipo_documento || 'outro') as DocumentoTipo,
        dataUrl: data.data_url || '',
        nomeArquivoOriginal: data.nome_arquivo_original || 'documento',
        tipoConteudo: data.tipo_conteudo || 'application/octet-stream',
        tamanhoBytes: data.tamanho_bytes ?? 0,
        enviadoPor: data.enviado_por || '',
        enviadoEm: enviadoEmISO,
      }
      return { ...entry, url: entry.dataUrl || null }
  })
}

// Substitui um documento existente: grava o novo arquivo primeiro, depois atualiza os
// metadados no Firestore (mesmo documentoId). Não apaga o histórico antes de confirmar.
export async function substituirDocumento(
  alunoId: string,
  documentoId: string,
  file: File,
  tipo: DocumentoTipo,
  userId: string
): Promise<DocumentEntry> {
  const dataUrl = await fileToDataUrl(file)

  const agora = new Date().toISOString()
  const entry: DocumentEntry = {
    id: documentoId,
    tipo,
    dataUrl,
    nomeArquivoOriginal: file.name,
    tipoConteudo: file.type,
    tamanhoBytes: file.size,
    enviadoPor: userId,
    enviadoEm: agora,
  }

  // Modo demonstração: substitui apenas no armazenamento local
  if (isDemoModeEnabled()) {
    appendStoredDocumento(alunoId, entry)
    return entry
  }

  await confirmWrite(
    `substituir o documento ${file.name}`,
    setDoc(doc(db, `${ALUNOS_COLLECTION}/${alunoId}/${DOCUMENTOS_SUBCOLLECTION}/${documentoId}`), {
      tipo_documento: tipo,
      data_url: dataUrl,
      nome_arquivo_original: file.name,
      tipo_conteudo: file.type,
      tamanho_bytes: file.size,
      enviado_por: userId,
      enviado_em: serverTimestamp(),
      atualizado_por: userId,
      atualizado_em: serverTimestamp(),
    })
  )

  return entry
}

// Exclui um documento do Firestore (ou do armazenamento local no modo demonstração).
export async function deleteDocumento(alunoId: string, documentoId: string): Promise<void> {
  if (isDemoModeEnabled()) {
    const locais = getStoredDocumentos(alunoId).filter((d) => d.id !== documentoId)
    saveStoredDocumentos(alunoId, locais)
    return
  }

  const snap = await getDoc(doc(db, `${ALUNOS_COLLECTION}/${alunoId}/${DOCUMENTOS_SUBCOLLECTION}/${documentoId}`))
  if (snap.exists()) {
    await confirmWrite(
      'excluir o documento',
      deleteDoc(doc(db, `${ALUNOS_COLLECTION}/${alunoId}/${DOCUMENTOS_SUBCOLLECTION}/${documentoId}`))
    )
  }
}
