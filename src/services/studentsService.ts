import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { db, isFirebaseConfigured } from '../lib/firebase'
import type { Student, StudentStatus, DocumentoTipo, DocumentEntry } from '../features/alunos/students-data'
import { demoStudents } from '../features/alunos/students-data'
import { DEMO_STUDENTS_STORAGE_KEY, isDemoModeEnabled } from '../lib/demoMode'

const ALUNOS_COLLECTION = 'alunos'

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
    deficiencia:
      data.deficiencia ||
      (Array.isArray(data.tipos_deficiencia) ? data.tipos_deficiencia.join(', ') : 'Não informada'),
    cid: data.cid || (Array.isArray(data.codigos_cid) ? data.codigos_cid.join(', ') : '—'),
    status,
    observacoes: data.observacoes || '',
    responsavelNome: data.responsavel_nome || data.responsavelNome || '—',
    parentesco: data.responsavel_parentesco || data.parentesco || 'Mãe',
    telefone: data.responsavel_telefone || data.telefone || '',
    email: data.responsavel_email || data.email || '',
    oficinas: Array.isArray(data.oficinas) ? data.oficinas : [],
    grauDependencia: data.grau_dependencia || undefined,
    documentos: Array.isArray(data.documentos)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ? data.documentos.map((d: any) => ({
          id: d.id || d.name || 'doc-legacy',
          tipo: (d.tipo_documento || d.tipo || 'ficha_medica') as DocumentoTipo,
          dataUrl: d.data_url || d.dataUrl || '',
          nomeArquivoOriginal: d.nome_arquivo_original || d.nomeArquivoOriginal || d.name || 'documento',
          tipoConteudo: d.tipo_conteudo || d.tipoConteudo || 'application/octet-stream',
          tamanhoBytes: d.tamanho_bytes ?? d.tamanhoBytes ?? 0,
          enviadoPor: d.enviado_por || d.enviadoPor || 'sistema',
          enviadoEm: d.enviado_em ? new Date(d.enviado_em).toISOString() : (d.attachedAt || new Date().toISOString()),
          // Campos legados mantidos para compatibilidade com dados existentes
          name: d.name || d.nome_arquivo_original || d.nomeArquivoOriginal || undefined,
          attachedAt: d.attachedAt || undefined,
          kind: (d.kind as 'pdf' | 'lgpd') || undefined,
        }))
      : [
          {
            id: 'ficha-medica-legacy',
            tipo: 'ficha_medica' as DocumentoTipo,
            dataUrl: '',
            nomeArquivoOriginal: data.ficha_medica_nome || 'Ficha Médica',
            tipoConteudo: 'application/pdf',
            tamanhoBytes: 0,
            enviadoPor: 'sistema',
            enviadoEm: new Date().toISOString(),
          },
          ...(data.uso_imagem_autorizado
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
            : []),
        ],
    faltasConsecutivas: data.faltas_consecutivas ?? data.faltasConsecutivas ?? 0,
    frequenciaMedia: data.frequencia_media ?? data.frequenciaMedia ?? 100,
    reports: Array.isArray(data.reports) ? data.reports : [],
    evolution: Array.isArray(data.evolution) ? data.evolution : [],
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

// Persistência local de documentos (fallback quando Firestore/Storage não está acessível)
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
export function subscribeToStudents(
  onSuccess: (students: Student[]) => void,
  onError?: (error: Error) => void,
  onSource?: (source: StudentsSource) => void
) {
  if (isDemoModeEnabled()) {
    onSource?.('demo')
    onSuccess(getDemoStudents())
    return () => {}
  }

  if (!isFirebaseConfigured) {
    const error = new Error('Firebase não configurado: preencha o arquivo .env.local.')
    onError?.(error)
    onSource?.('error')
    onSuccess([])
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
      onError?.(err)
      onSource?.('error')
      onSuccess([])
    }
  )
}

// Busca aluno por ID (sem fallback fictício)
export async function getStudentById(id: string): Promise<Student | null> {
  if (isDemoModeEnabled()) {
    return getDemoStudents().find((s) => s.id === id) || null
  }
  try {
    const snap = await getDoc(doc(db, ALUNOS_COLLECTION, id))
    if (snap.exists()) {
      return docToStudent(snap.id, snap.data())
    }
  } catch (err) {
    console.warn('Erro ao buscar aluno por ID no Firestore:', err)
  }
  return null
}

export type StudentInput = {
  id?: string
  nome: string
  nascimento: string
  sexo: string
  deficiencia: string
  cid: string
  observacoes: string
  responsavelNome: string
  parentesco: string
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
  grauDependencia?: string
  fichaMedica?: string
  fichaMatricula?: string
  lgpdImagem?: boolean
  lgpdDados?: boolean
  status?: StudentStatus
}

// Criar aluno (tenta Firestore e garante persistência local imediata)
export async function createStudent(input: StudentInput): Promise<string> {
  const id =
    input.id ||
    input.nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + `-${Date.now().toString().slice(-4)}`

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
    turma: input.turmas[0] || 'Turma A',
    turmaId: input.turmaId,
    turmaTurno: input.turmaTurno || 'Manhã (8h–12h)',
    deficiencia: input.deficiencia || 'Não informada',
    cid: input.cid || '—',
    observacoes: input.observacoes || '',
    responsavelNome: input.responsavelNome,
    parentesco: input.parentesco || 'Mãe',
    telefone: input.telefonePrincipal,
    email: input.email || '',
    oficinas: input.oficinas || [],
    grauDependencia: input.grauDependencia,
    documentos: [],
    faltasConsecutivas: 0,
    frequenciaMedia: 100,
    reports: [],
    evolution: [],
    contacts: [],
    activities: [],
  }

  // Modo demonstração: grava apenas no armazenamento local, sem tocar no Firebase
  if (isDemoModeEnabled()) {
    const currentList = getDemoStudents()
    saveDemoStudents([localNewStudent, ...currentList.filter((s) => s.id !== id)])
    return id
  }

  const studentData = {
    nome_completo: input.nome,
    nome_busca: input.nome.toLowerCase(),
    data_nascimento: input.nascimento,
    sexo: input.sexo,
    status: (input.status || 'Ativo').toLowerCase(),
    uso_imagem_autorizado: Boolean(input.lgpdImagem),
    tratamento_dados_autorizado: Boolean(input.lgpdDados),
    tipos_deficiencia: input.deficiencia ? [input.deficiencia] : [],
    codigos_cid: input.cid ? [input.cid] : [],
    observacoes: input.observacoes || '',
    turma: input.turmas[0] || 'Turma A',
    turma_id: input.turmaId || null,
    turma_turno:
      input.turmaTurno ||
      (input.turmas[0]?.includes('b') ? 'Tarde (13h–17h)' : 'Manhã (8h–12h)'),
    oficinas: input.oficinas,
    responsavel_nome: input.responsavelNome,
    responsavel_parentesco: input.parentesco,
    responsavel_cpf: input.cpf || '',
    responsavel_rg: input.rg || '',
    responsavel_telefone: input.telefonePrincipal,
    responsavel_telefone_secundario: input.telefoneSecundario || '',
    responsavel_email: input.email || '',
    responsavel_endereco: input.endereco || '',
    grau_dependencia: input.grauDependencia || '',
    ficha_medica_nome: input.fichaMedica || '',
    ficha_matricula_nome: input.fichaMatricula || '',
    faltas_consecutivas: 0,
    frequencia_media: 100,
    reports: [],
    evolution: [],
    contacts: [],
    activities: [],
    criado_em: serverTimestamp(),
    atualizado_em: serverTimestamp(),
  }

  await setDoc(doc(db, ALUNOS_COLLECTION, id), studentData)
  const guardianRef = doc(collection(db, `${ALUNOS_COLLECTION}/${id}/responsaveis`))
  await setDoc(guardianRef, {
    nome_completo: input.responsavelNome,
    parentesco: input.parentesco,
    cpf: input.cpf || '',
    rg: input.rg || '',
    telefone: input.telefonePrincipal,
    telefone_alternativo: input.telefoneSecundario || null,
    email: input.email || null,
    principal: true,
    criado_em: serverTimestamp(),
  })
  const healthRef = doc(db, `${ALUNOS_COLLECTION}/${id}/ficha_medica/geral`)
  await setDoc(healthRef, {
    tipos_deficiencia: input.deficiencia ? [input.deficiencia] : [],
    codigos_cid: input.cid ? [input.cid] : [],
    anexo_nome: input.fichaMedica || null,
    grau_dependencia: input.grauDependencia || null,
    atualizado_em: serverTimestamp(),
  })

  return id
}

// Atualizar aluno
export async function updateStudent(id: string, input: Partial<StudentInput>): Promise<void> {
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
        deficiencia: input.deficiencia !== undefined ? input.deficiencia : st.deficiencia,
        cid: input.cid !== undefined ? input.cid : st.cid,
        observacoes: input.observacoes !== undefined ? input.observacoes : st.observacoes,
        responsavelNome: input.responsavelNome !== undefined ? input.responsavelNome : st.responsavelNome,
        parentesco: input.parentesco !== undefined ? input.parentesco : st.parentesco,
        telefone: input.telefonePrincipal !== undefined ? input.telefonePrincipal : st.telefone,
        email: input.email !== undefined ? input.email : st.email,
        oficinas: input.oficinas !== undefined ? input.oficinas : st.oficinas,
        grauDependencia: input.grauDependencia !== undefined ? input.grauDependencia : st.grauDependencia,
        status: input.status !== undefined ? input.status : st.status,
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
  if (input.deficiencia !== undefined) updateData.tipos_deficiencia = [input.deficiencia]
  if (input.cid !== undefined) updateData.codigos_cid = [input.cid]
  if (input.observacoes !== undefined) updateData.observacoes = input.observacoes
  if (input.turmas && input.turmas.length > 0) updateData.turma = input.turmas[0]
  if (input.turmaId !== undefined) updateData.turma_id = input.turmaId
  if (input.turmaTurno !== undefined) updateData.turma_turno = input.turmaTurno
  if (input.oficinas !== undefined) updateData.oficinas = input.oficinas
  if (input.responsavelNome !== undefined) updateData.responsavel_nome = input.responsavelNome
  if (input.parentesco !== undefined) updateData.responsavel_parentesco = input.parentesco
  if (input.cpf !== undefined) updateData.responsavel_cpf = input.cpf
  if (input.rg !== undefined) updateData.responsavel_rg = input.rg
  if (input.telefonePrincipal !== undefined) updateData.responsavel_telefone = input.telefonePrincipal
  if (input.telefoneSecundario !== undefined) updateData.responsavel_telefone_secundario = input.telefoneSecundario
  if (input.email !== undefined) updateData.responsavel_email = input.email
  if (input.endereco !== undefined) updateData.responsavel_endereco = input.endereco
  if (input.grauDependencia !== undefined) updateData.grau_dependencia = input.grauDependencia
  if (input.lgpdImagem !== undefined) updateData.uso_imagem_autorizado = input.lgpdImagem
  if (input.lgpdDados !== undefined) updateData.tratamento_dados_autorizado = input.lgpdDados
  if (input.status !== undefined) updateData.status = input.status.toLowerCase()

  await updateDoc(doc(db, ALUNOS_COLLECTION, id), updateData)
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

  await updateDoc(doc(db, ALUNOS_COLLECTION, id), {
    status: 'inativo',
    atualizado_em: serverTimestamp(),
  })
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
// Sempre persiste localmente (localStorage) como fallback para funcionar sem Firebase.
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

  // 1) Sempre grava no localStorage primeiro (funciona sem Firebase)
  appendStoredDocumento(alunoId, entry)

  // 2) Tenta gravar no Firestore quando disponível
  try {
    await setDoc(docRef, {
      tipo_documento: tipo,
      data_url: dataUrl,
      nome_arquivo_original: file.name,
      tipo_conteudo: file.type,
      tamanho_bytes: file.size,
      enviado_por: userId,
      enviado_em: serverTimestamp(),
    })
  } catch (err) {
    console.warn('[uploadDocumento] Firestore não disponível, mantido apenas localmente:', err)
    appendStoredDocumento(alunoId, entry)
    throw new Error(
      `Arquivo salvo apenas localmente (Firestore indisponível): ${(err as Error).message}`,
      { cause: err }
    )
  }

  return entry
}

// Lista os documentos de um aluno, retornando o dataUrl (base64) de cada um.
// Quando o Firestore não está acessível, lê do localStorage (persistência local).
export async function getDocumentosComUrl(
  alunoId: string
): Promise<(DocumentEntry & { url: string | null })[]> {
  if (isDemoModeEnabled()) {
    return getStoredDocumentos(alunoId).map((entry) => ({ ...entry, url: entry.dataUrl || null }))
  }
  try {
    const snap = await getDocs(collection(db, `${ALUNOS_COLLECTION}/${alunoId}/${DOCUMENTOS_SUBCOLLECTION}`))
    return snap.docs.map((d) => {
      const data = d.data()
      const entry: DocumentEntry = {
        id: d.id,
        tipo: (data.tipo_documento || 'ficha_medica') as DocumentoTipo,
        dataUrl: data.data_url || '',
        nomeArquivoOriginal: data.nome_arquivo_original || 'documento',
        tipoConteudo: data.tipo_conteudo || 'application/octet-stream',
        tamanhoBytes: data.tamanho_bytes ?? 0,
        enviadoPor: data.enviado_por || '',
        enviadoEm: data.enviado_em ? new Date(data.enviado_em).toISOString() : new Date().toISOString(),
      }
      return { ...entry, url: entry.dataUrl || null }
    })
  } catch (err) {
    console.warn('[getDocumentosComUrl] Firestore não disponível, lendo do localStorage:', err)
    const locais = getStoredDocumentos(alunoId)
    return locais.map((entry) => ({ ...entry, url: entry.dataUrl || null }))
  }
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

  // Persiste localmente
  appendStoredDocumento(alunoId, entry)

  try {
    await setDoc(doc(db, `${ALUNOS_COLLECTION}/${alunoId}/${DOCUMENTOS_SUBCOLLECTION}/${documentoId}`), {
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
  } catch (err) {
    console.warn('[substituirDocumento] Firestore não disponível:', err)
    throw new Error(
      `Falha ao gravar no Firestore: ${(err as Error).message}`,
      { cause: err }
    )
  }

  return entry
}

// Exclui um documento: remove do Firestore e do localStorage.
export async function deleteDocumento(alunoId: string, documentoId: string): Promise<void> {
  if (isDemoModeEnabled()) {
    const locais = getStoredDocumentos(alunoId).filter((d) => d.id !== documentoId)
    saveStoredDocumentos(alunoId, locais)
    return
  }

  const snap = await getDoc(doc(db, `${ALUNOS_COLLECTION}/${alunoId}/${DOCUMENTOS_SUBCOLLECTION}/${documentoId}`))
  if (snap.exists()) {
    await deleteDoc(doc(db, `${ALUNOS_COLLECTION}/${alunoId}/${DOCUMENTOS_SUBCOLLECTION}/${documentoId}`))
  }
  // Remove do localStorage também
  const current = getStoredDocumentos(alunoId)
  const updated = current.filter((d) => d.id !== documentoId)
  saveStoredDocumentos(alunoId, updated)
}
