/**
 * Seed do Firestore — Fundação Toque
 *
 * Firestore não possui DDL: coleções são criadas no primeiro write.
 * Este script popula o banco com dados fictícios para validar a
 * modelagem de modelagem.md (critério de aceite).
 *
 * Uso:
 *   - Contra o projeto real:  npm run seed
 *   - Contra o emulador:      npx firebase-tools emulators:start
 *                             e depois  SEED_TARGET=emulator npm run seed
 *
 * ATENÇÃO: nenhum dado pessoal real deve ser usado (LGPD).
 */
import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import {
  collection, connectFirestoreEmulator, deleteDoc, doc, getFirestore, setDoc,
} from 'firebase/firestore'

// Lê o .env.local sem depender do Vite
function loadEnv() {
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*([\w.]+)\s*=\s*(.*)?\s*$/)
      if (match && process.env[match[1]] === undefined) {
        process.env[match[1]] = match[2] ?? ''
      }
    }
  } catch {
    console.warn('.env.local não encontrado — usando variáveis de ambiente existentes.')
  }
}

loadEnv()

const useEmulator = process.env.SEED_TARGET === 'emulator'
const useRest = process.env.SEED_TARGET === 'rest'

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
})

const db = getFirestore(app)
if (useEmulator) connectFirestoreEmulator(db, 'localhost', 8080)

// ---------------------------------------------------------------------------
// Modo REST (SEED_TARGET=rest): grava via Firestore REST API autenticado com
// a SUA conta Google do projeto (gcloud), que ignora as security rules.
// Requisito: npx firebase-tools login (ou gcloud auth application-default login)
// ---------------------------------------------------------------------------
const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID
const FIRESTORE_BASE = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`

let cachedToken = null

const FB_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const FB_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'
// Credenciais públicas do Firebase CLI (embutidas no código-fonte aberto do firebase-tools)

async function tokenFromFirebaseCli() {
  const { readFileSync } = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json')
  const config = JSON.parse(readFileSync(configPath, 'utf8'))
  const refreshToken = config?.tokens?.refresh_token
  if (!refreshToken) return null
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: FB_CLIENT_ID,
      client_secret: FB_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  })
  if (!res.ok) return null
  const json = await res.json()
  return json.access_token ?? null
}

async function getAccessToken() {
  if (cachedToken) return cachedToken
  const { execSync } = await import('node:child_process')
  try {
    cachedToken = execSync('gcloud auth print-access-token', { encoding: 'utf8' }).trim()
    if (cachedToken) return cachedToken
  } catch {
    // gcloud não instalado — cai para o token do Firebase CLI
  }
  cachedToken = await tokenFromFirebaseCli()
  if (cachedToken) return cachedToken
  throw new Error(
    'Não foi possível obter token de acesso admin. Faça login primeiro:\n' +
    '  npx firebase-tools login\n' +
    '(deve ser a mesma conta Google dona do projeto no Firebase)',
  )
}

function toFirestoreValue(value) {
  if (value === null || value === undefined) return { nullValue: null }
  if (typeof value === 'boolean') return { booleanValue: value }
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value }
  }
  if (typeof value === 'string') return { stringValue: value }
  if (value instanceof Date) return { timestampValue: value.toISOString() }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toFirestoreValue) } }
  if (typeof value === 'object') {
    const fields = {}
    for (const [k, v] of Object.entries(value)) fields[k] = toFirestoreValue(v)
    return { mapValue: { fields } }
  }
  throw new Error(`Tipo não suportado no seed REST: ${typeof value}`)
}

async function restWrite(collectionName, documentId, data) {
  const token = await getAccessToken()
  const fields = {}
  for (const [k, v] of Object.entries(data)) fields[k] = toFirestoreValue(v)
  const url = `${FIRESTORE_BASE}/${collectionName}/${documentId}`
  const res = await fetch(url, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields }),
  })
  if (!res.ok) {
    const body = await res.text()
    throw new Error(`REST ${res.status} em ${collectionName}/${documentId}: ${body}`)
  }
}

async function restDelete(collectionName, documentId) {
  const token = await getAccessToken()
  const url = `${FIRESTORE_BASE}/${collectionName}/${documentId}`
  const res = await fetch(url, { method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` } })
  if (!res.ok && res.status !== 404) {
    throw new Error(`REST DELETE ${res.status} em ${collectionName}/${documentId}`)
  }
}

async function writeDoc(collectionName, documentId, data) {
  if (useRest) return restWrite(collectionName, documentId, data)
  await setDoc(doc(db, collectionName, documentId), data)
}

async function removeDoc(collectionName, documentId) {
  if (useRest) return restDelete(collectionName, documentId)
  await deleteDoc(doc(db, collectionName, documentId))
}

// ==== IDs fixos usados nas referências entre coleções ====
const DIRECTION_UID = 'seed-uid-direcao'
const PEDAGOGUE_UID = 'seed-uid-pedagogia'
const ADMIN_UID = 'seed-uid-admin'
const USER_1 = 'seed-uid-pedagogia-2'

const CLASS_A = 'seed-turma-manha-1'
const CLASS_B = 'seed-turma-tarde-1'
const WORKSHOP_MUSIC = 'seed-oficina-musicalizacao'
const WORKSHOP_DANCE = 'seed-oficina-danca'
const WORKSHOP_GARDEN = 'seed-oficina-horta'
const CW_MUSIC_A = 'seed-cw-music-manha'
const CW_GARDEN_A = 'seed-cw-horta-manha'
const CW_DANCE_B = 'seed-cw-dance-tarde'
const STUDENT_1 = 'seed-student-ana'
const STUDENT_2 = 'seed-student-bruno'
const STUDENT_3 = 'seed-student-carla'
const GUARDIAN_1 = 'seed-guardian-1'
const GUARDIAN_2 = 'seed-guardian-2'
const SESSION_1 = 'seed-session-manha-1'
const SESSION_2 = 'seed-session-horta-1'
const TEMPLATE_1 = 'seed-template-avaliacao-v1'

function now() {
  return new Date()
}
// ==== PARTE 2: usuários, alunos, saúde ====
const usuarios = {
  [DIRECTION_UID]: { nome_completo: 'Maria Silva (Direção)', email: 'direcao@exemplo.com', papel: 'direcao', ativo: true, ultimo_login_em: null, criado_em: now(), atualizado_em: now() },
  [PEDAGOGUE_UID]: { nome_completo: 'Joana Souza (Pedagoga)', email: 'pedagoga@exemplo.com', papel: 'pedagogia', ativo: true, ultimo_login_em: null, criado_em: now(), atualizado_em: now() },
  [ADMIN_UID]: { nome_completo: 'Carlos Lima (Administrativo)', email: 'admin@exemplo.com', papel: 'administrativo', ativo: true, ultimo_login_em: null, criado_em: now(), atualizado_em: now() },
  [USER_1]: { nome_completo: 'Rita Ferreira (Pedagoga)', email: 'pedagoga2@exemplo.com', papel: 'pedagogia', ativo: true, ultimo_login_em: null, criado_em: now(), atualizado_em: now() },
}
const usuariosPublicos = Object.fromEntries(
  Object.entries(usuarios).map(([id, user]) => [id, {
    nome_completo: user.nome_completo,
    papel: user.papel,
    ativo: user.ativo,
    atualizado_em: user.atualizado_em,
  }])
)

const alunos = {
  [STUDENT_1]: {
    nome_completo: 'Ana Souza Pereira', nome_busca: 'ana souza pereira',
    data_nascimento: '2015-03-12', status: 'ativo', uso_imagem_autorizado: true,
    consentimento_imagem_em: now(), caminho_foto: null,
    responsavel_principal_id: GUARDIAN_1,
    criado_por: ADMIN_UID, criado_em: now(), atualizado_por: ADMIN_UID, atualizado_em: now(),
  },
  [STUDENT_2]: {
    nome_completo: 'Bruno Alves Santos', nome_busca: 'bruno alves santos',
    data_nascimento: '2013-07-25', status: 'ativo', uso_imagem_autorizado: false,
    consentimento_imagem_em: null, caminho_foto: null,
    responsavel_principal_id: GUARDIAN_2,
    criado_por: ADMIN_UID, criado_em: now(), atualizado_por: ADMIN_UID, atualizado_em: now(),
  },
  [STUDENT_3]: {
    nome_completo: 'Carla Oliveira Costa', nome_busca: 'carla oliveira costa',
    data_nascimento: '2016-11-02', status: 'ativo', uso_imagem_autorizado: true,
    consentimento_imagem_em: now(), caminho_foto: null,
    criado_por: ADMIN_UID, criado_em: now(), atualizado_por: ADMIN_UID, atualizado_em: now(),
  },
}

const healthRecords = {
  [STUDENT_1]: {
    tipos_deficiencia: ['TEA'], codigos_cid: ['F84.0'],
    formato_ficha_medica: 'digital',
    dados_ficha_medica: { allergies: 'Nenhuma relatada', medications: 'Não informado' },
    atualizado_por: DIRECTION_UID, atualizado_em: now(),
  },
  [STUDENT_2]: {
    tipos_deficiencia: ['Deficiência intelectual'], codigos_cid: ['F70'],
    formato_ficha_medica: 'anexo', dados_ficha_medica: null,
    atualizado_por: DIRECTION_UID, atualizado_em: now(),
  },
}
// Subcoleções do aluno: paths completos dos documentos (aluno_id é implícito no caminho)
const fichasMedicasPaths = {
  [STUDENT_1]: `alunos/${STUDENT_1}/ficha_medica`,
  [STUDENT_2]: `alunos/${STUDENT_2}/ficha_medica`,
}
// ==== PARTE 3: responsáveis, turmas, oficinas e vínculos ====
const responsaveis = {
  [GUARDIAN_1]: {
    nome_completo: 'Fernanda Souza Pereira', parentesco: 'mae',
    telefone: '+5516999990001', telefone_alternativo: null, email: 'fernanda@exemplo.com',
    principal: true, criado_por: ADMIN_UID, criado_em: now(), atualizado_por: ADMIN_UID, atualizado_em: now(),
  },
  [GUARDIAN_2]: {
    nome_completo: 'Marcos Alves', parentesco: 'pai',
    telefone: '+5516999990002', telefone_alternativo: null, email: null,
    principal: true, criado_por: ADMIN_UID, criado_em: now(), atualizado_por: ADMIN_UID, atualizado_em: now(),
  },
}
// Subcoleções de responsáveis: paths completos dos documentos
const responsaveisPaths = {
  [GUARDIAN_1]: `alunos/${STUDENT_1}/responsaveis`,
  [GUARDIAN_2]: `alunos/${STUDENT_2}/responsaveis`,
}

const turmas = {
  [CLASS_A]: {
    codigo: 'TUR-M1', nome: 'Manhã — Grupo 1', periodo: 'manha',
    ids_usuarios_responsaveis: [PEDAGOGUE_UID], data_inicio: '2026-02-01', data_fim: null,
    ativo: true, criado_por: ADMIN_UID, criado_em: now(), atualizado_por: ADMIN_UID, atualizado_em: now(),
  },
  [CLASS_B]: {
    codigo: 'TUR-T1', nome: 'Tarde — Grupo 1', periodo: 'tarde',
    ids_usuarios_responsaveis: [USER_1], data_inicio: '2026-02-01', data_fim: null,
    ativo: true, criado_por: ADMIN_UID, criado_em: now(), atualizado_por: ADMIN_UID, atualizado_em: now(),
  },
}

const oficinas = {
  [WORKSHOP_MUSIC]: { nome: 'Musicalização', categoria: 'musicalizacao', descricao: 'Oficina de música e ritmo', ids_usuarios_responsaveis: [PEDAGOGUE_UID], ativo: true, criado_por: ADMIN_UID, criado_em: now(), atualizado_por: ADMIN_UID, atualizado_em: now() },
  [WORKSHOP_DANCE]: { nome: 'Dança', categoria: 'danca', descricao: 'Oficina de dança e movimento', ids_usuarios_responsaveis: [USER_1], ativo: true, criado_por: ADMIN_UID, criado_em: now(), atualizado_por: ADMIN_UID, atualizado_em: now() },
  [WORKSHOP_GARDEN]: { nome: 'Horta (NEMA)', categoria: 'horta', descricao: 'Cuidado com a horta', ids_usuarios_responsaveis: [PEDAGOGUE_UID], ativo: true, criado_por: ADMIN_UID, criado_em: now(), atualizado_por: ADMIN_UID, atualizado_em: now() },
}

// Horários ficam EMBUTIDOS em turma_oficinas (sem coleção própria)
const classWorkshops = {
  [CW_MUSIC_A]: { turma_id: CLASS_A, oficina_id: WORKSHOP_MUSIC, ids_usuarios_responsaveis: [PEDAGOGUE_UID], ativo: true, horarios: [{ dia_semana: 2, hora_inicio: '08:00', hora_fim: '09:00', valido_de: '2026-02-01', valido_ate: null }], criado_por: ADMIN_UID, criado_em: now(), atualizado_por: ADMIN_UID, atualizado_em: now() },
  [CW_GARDEN_A]: { turma_id: CLASS_A, oficina_id: WORKSHOP_GARDEN, ids_usuarios_responsaveis: [PEDAGOGUE_UID], ativo: true, horarios: [{ dia_semana: 4, hora_inicio: '09:00', hora_fim: '10:00', valido_de: '2026-02-01', valido_ate: null }], criado_por: ADMIN_UID, criado_em: now(), atualizado_por: ADMIN_UID, atualizado_em: now() },
  [CW_DANCE_B]: { turma_id: CLASS_B, oficina_id: WORKSHOP_DANCE, ids_usuarios_responsaveis: [USER_1], ativo: true, horarios: [{ dia_semana: 3, hora_inicio: '14:00', hora_fim: '15:00', valido_de: '2026-02-01', valido_ate: null }], criado_por: ADMIN_UID, criado_em: now(), atualizado_por: ADMIN_UID, atualizado_em: now() },
}

const matriculas = {
  'seed-enroll-ana-a': { aluno_id: STUDENT_1, turma_id: CLASS_A, data_inicio: '2026-02-01', data_fim: null, status: 'ativo', criado_por: ADMIN_UID, criado_em: now(), atualizado_por: ADMIN_UID, atualizado_em: now() },
  'seed-enroll-carla-a': { aluno_id: STUDENT_3, turma_id: CLASS_A, data_inicio: '2026-02-01', data_fim: null, status: 'ativo', criado_por: ADMIN_UID, criado_em: now(), atualizado_por: ADMIN_UID, atualizado_em: now() },
  'seed-enroll-bruno-b': { aluno_id: STUDENT_2, turma_id: CLASS_B, data_inicio: '2026-02-01', data_fim: null, status: 'ativo', criado_por: ADMIN_UID, criado_em: now(), atualizado_por: ADMIN_UID, atualizado_em: now() },
}

const assignments = {
  'seed-assign-ana-music': { aluno_id: STUDENT_1, turma_oficina_id: CW_MUSIC_A, data_inicio: '2026-02-01', data_fim: null, status: 'ativo', nivel_suporte: 'moderado', consideracoes_pedagogicas: 'Acompanhamento próximo nas atividades em grupo', atribuido_por: PEDAGOGUE_UID, criado_em: now(), atualizado_por: PEDAGOGUE_UID, atualizado_em: now() },
  'seed-assign-bruno-dance': { aluno_id: STUDENT_2, turma_oficina_id: CW_DANCE_B, data_inicio: '2026-02-01', data_fim: null, status: 'ativo', nivel_suporte: null, consideracoes_pedagogicas: null, atribuido_por: USER_1, criado_em: now(), atualizado_por: USER_1, atualizado_em: now() },
}
// ==== PARTE 4: atividades, frequência, evolução, relatórios e configurações ====
const activityRecords = {
  'seed-activity-2026-09-14': {
    data_atividade: '2026-09-14', turma_id: CLASS_A,
    ids_turma_oficinas: [CW_MUSIC_A, CW_GARDEN_A],
    usuario_responsavel_id: PEDAGOGUE_UID,
    observacoes_gerais: 'Manhã: musicalização com instrumentos de percussão e rega da horta.',
    criado_em: now(), atualizado_em: now(),
  },
}

// Presenças EMBUTIDAS na sessão: map presencas[aluno_id] — impossível duplicar presença
const attendanceSessions = {
  [SESSION_1]: {
    data_chamada: '2026-09-14', turma_id: CLASS_A, escopo: 'turma',
    turma_oficina_id: null, registro_atividade_id: null,
    presencas: {
      [STUDENT_1]: 'presente',
      [STUDENT_3]: 'ausente',
    },
    observacoes: {},
    registrado_por: ADMIN_UID, criado_em: now(), atualizado_em: now(),
  },
  [SESSION_2]: {
    data_chamada: '2026-09-14', turma_id: CLASS_A, escopo: 'oficina',
    turma_oficina_id: CW_GARDEN_A, registro_atividade_id: null,
    presencas: {
      [STUDENT_1]: 'presente',
    },
    observacoes: {},
    registrado_por: ADMIN_UID, criado_em: now(), atualizado_em: now(),
  },
}

const familyContacts = {
  'seed-contact-1': {
    aluno_id: STUDENT_3, responsavel_id: null,
    datas_faltas_relacionadas: ['2026-09-14'],
    contatado_em: now(), meio_contato: 'telefone',
    observacoes: 'Responsável informou consulta médica; falta justificada.',
    usuario_responsavel_id: ADMIN_UID, criado_em: now(),
  },
}

const progressEntries = {
  'seed-progress-1': { aluno_id: STUDENT_1, data_registro: '2026-09-14', profissional_usuario_id: PEDAGOGUE_UID, area: 'social', observacao: 'Interagiu bem com os colegas na oficina de música.', criado_em: now(), atualizado_em: now() },
}

const formTemplates = {
  [TEMPLATE_1]: {
    nome: 'Avaliação Pedagógica (modelo provisório)', tipo_modelo: 'avaliacao_pedagogica',
    versao: 1, ativo: true,
    campos: [
      { chave: 'cognitiva', rotulo: 'Desenvolvimento cognitivo', tipo: 'texto_longo', obrigatorio: true, opcoes: null },
      { chave: 'motora', rotulo: 'Desenvolvimento motor', tipo: 'texto_longo', obrigatorio: true, opcoes: null },
      { chave: 'social', rotulo: 'Desenvolvimento social', tipo: 'texto_longo', obrigatorio: true, opcoes: null },
      { chave: 'comunicacao', rotulo: 'Comunicação', tipo: 'texto_longo', obrigatorio: true, opcoes: null },
      { chave: 'autonomia', rotulo: 'Autonomia', tipo: 'texto_longo', obrigatorio: false, opcoes: null },
    ],
    criado_por: DIRECTION_UID, criado_em: now(),
  },
}

const pedagogicalReports = {
  'seed-report-1': {
    aluno_id: STUDENT_1, tipo_relatorio: 'diario',
    periodo_inicio: '2026-09-14', periodo_fim: '2026-09-14',
    evolucao: 'Boa participação nas oficinas.', dificuldades: null,
    avancos: 'Iniciou interação espontânea com colegas.', encaminhamentos: null,
    usuario_responsavel_id: PEDAGOGUE_UID, modelo_formulario_id: TEMPLATE_1, modelo_formulario_versao: 1,
    respostas: { cognitiva: 'Atenta às atividades', motora: 'Coordenação adequada', social: 'Interagiu bem', comunicacao: 'Comunicativa', autonomia: null },
    status: 'concluido',
    criado_em: now(), atualizado_em: now(),
  },
}

const systemSettings = {
  geral: { modo_chamada: 'diaria', limite_faltas_consecutivas: 3, atualizado_por: DIRECTION_UID, atualizado_em: now() },
}
// ==== PARTE 5: execução ====
// Cada entrada: [caminho da coleção (pode ser subcoleção), {id: dados}]
const TARGETS = [
  ['usuarios', usuarios],
  ['usuarios_publicos', usuariosPublicos],
  ['alunos', alunos],
  [fichasMedicasPaths[STUDENT_1], { ficha: healthRecords[STUDENT_1] }],
  [fichasMedicasPaths[STUDENT_2], { ficha: healthRecords[STUDENT_2] }],
  [responsaveisPaths[GUARDIAN_1], { [GUARDIAN_1]: responsaveis[GUARDIAN_1] }],
  [responsaveisPaths[GUARDIAN_2], { [GUARDIAN_2]: responsaveis[GUARDIAN_2] }],
  ['turmas', turmas],
  ['oficinas', oficinas],
  ['turma_oficinas', classWorkshops],
  ['matriculas', matriculas],
  ['aluno_oficinas', assignments],
  ['registros_atividade', activityRecords],
  ['sessoes_chamada', attendanceSessions],
  ['contatos_familia', familyContacts],
  ['registros_evolucao', progressEntries],
  ['modelos_formulario', formTemplates],
  ['relatorios_pedagogicos', pedagogicalReports],
  ['configuracoes_sistema', systemSettings],
]

async function restListDocs(collectionPath) {
  const token = await getAccessToken()
  const url = `${FIRESTORE_BASE}/${collectionPath}?pageSize=300`
  const res = await fetch(url, { headers: { 'Authorization': `Bearer ${token}` } })
  if (!res.ok) return []
  const json = await res.json()
  return (json.documents ?? []).map((d) => d.name.split('/documents/')[1])
}

// Coleções legadas (inglês) e nomes que deixaram de existir no topo
const LEGACY_COLLECTIONS = [
  'users', 'students', 'student_health_records', 'guardians', 'student_documents',
  'classes', 'workshops', 'class_workshops', 'workshop_schedules', 'enrollments',
  'student_workshop_assignments', 'activity_records', 'attachments',
  'progress_entries', 'form_templates', 'pedagogical_reports',
  'attendance_sessions', 'attendance_records', 'family_contacts',
  'generated_reports', 'system_settings',
  'fichas_medicas', 'documentos_aluno', 'horarios_oficinas', 'registros_presenca',
]

// Coleções atuais (dados de seed antigos têm campos desatualizados — limpar tudo)
const CURRENT_COLLECTIONS = [
  'usuarios', 'usuarios_publicos', 'alunos', 'turmas', 'oficinas', 'turma_oficinas', 'matriculas',
  'aluno_oficinas', 'registros_atividade', 'sessoes_chamada',
  'contatos_familia', 'registros_evolucao', 'modelos_formulario',
  'relatorios_pedagogicos', 'configuracoes_sistema',
]

async function wipeCollection(path) {
  const docs = await restListDocs(path)
  for (const docPath of docs) {
    const token = await getAccessToken()
    const res = await fetch(`${FIRESTORE_BASE}/${docPath}`, {
      method: 'DELETE', headers: { 'Authorization': `Bearer ${token}` },
    })
    if (!res.ok && res.status !== 404) {
      throw new Error(`REST DELETE ${res.status} em ${docPath}`)
    }
    console.log(`🗑 ${docPath}`)
  }
  return docs.length
}

async function cleanup() {
  let total = 0
  for (const c of LEGACY_COLLECTIONS) {
    total += await wipeCollection(c)
  }
  for (const c of CURRENT_COLLECTIONS) {
    total += await wipeCollection(c)
  }
  // Subcoleções dos alunos não são apagadas em cascata — tratar explicitamente
  const alunos = await restListDocs('alunos')
  for (const docPath of alunos) {
    const alunoId = docPath.split('/')[1]
    total += await wipeCollection(`alunos/${alunoId}/ficha_medica`)
    total += await wipeCollection(`alunos/${alunoId}/responsaveis`)
    total += await wipeCollection(`alunos/${alunoId}/documentos`)
  }
  console.log(`✅ Cleanup concluído (${total} documentos apagados).`)
}

async function main() {
  const mode = process.argv[2] ?? 'seed'
  const targetLabel = useEmulator
    ? 'EMULADOR (localhost:8080)'
    : useRest
      ? `PROJETO REAL via REST ADMIN (${process.env.VITE_FIREBASE_PROJECT_ID})`
      : `PROJETO REAL via SDK CLIENTE (${process.env.VITE_FIREBASE_PROJECT_ID})`

  console.log(`Alvo: ${targetLabel}`)
  if (!useEmulator && !useRest) {
    console.warn('⚠️ Sem autenticação, o SDK cliente respeitará as security rules (deny-all) e falhará com PERMISSION_DENIED.')
    console.warn('   Use SEED_TARGET=emulator (local) ou SEED_TARGET=rest (acesso admin ao projeto real).')
  }

  if (mode === 'cleanup') {
    if (!useRest) {
      console.error('❌ O modo cleanup usa acesso admin via REST. Rode com SEED_TARGET=rest (ou use o emulador: SEED_TARGET=emulator).')
      process.exit(1)
    }
    console.log('🧹 Cleanup: apagando TODOS os dados (coleções legadas, atuais e subcoleções dos alunos)...')
    await cleanup()
    return
  }

  if (mode === 'reset') {
    console.log('🧹 Modo reset: apagando documentos seed-* ...')
    let deleted = 0
    for (const [collectionName, docs] of TARGETS) {
      for (const id of Object.keys(docs)) {
        await removeDoc(collectionName, id)
        console.log(`🗑 ${collectionName}/${id}`)
        deleted++
      }
    }
    console.log(`✅ Reset concluído (${deleted} documentos apagados).`)
    console.log('ℹ️ Coleções vazias deixam de aparecer no Console — não há "tabela" a mais para remover.')
    return
  }

  if (mode !== 'seed') {
    console.error(`Modo desconhecido: "${mode}". Use "seed" (padrão) ou "reset".`)
    process.exit(1)
  }

  console.log('🌱 Semeando dados fictícios...')
  for (const [collectionName, docs] of TARGETS) {
    for (const [id, data] of Object.entries(docs)) {
      await writeDoc(collectionName, id, data)
      console.log(`✔ ${collectionName}/${id}`)
    }
  }
  console.log(`✅ Seed concluído (${TARGETS.reduce((n, [, d]) => n + Object.keys(d).length, 0)} documentos).`)
  console.log('⚠️ Observação: o seed NÃO cria usuários no Firebase Authentication — isso exige o Admin SDK. Crie os usuários pelo Console (Authentication > Users) com os mesmos e-mails do seed.')
}

main().catch((err) => {
  console.error('❌ Falha no seed:', err)
  process.exit(1)
})




