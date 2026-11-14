/**
 * Migra referências legadas de turma para documentos reais em `turmas`.
 *
 * O app antigo criava "Turma A/B/C" apenas no localStorage. Atividades,
 * chamadas e alunos acabaram gravando IDs/nomes que não existem no Firestore.
 * Este script:
 *   1. cria as turmas reais referenciadas pelos dados existentes;
 *   2. normaliza `turma_id` de alunos, chamadas, atividades e matrículas;
 *   3. cria matrículas ativas para os alunos vinculados.
 *
 * É idempotente: pode ser executado novamente sem duplicar dados.
 *
 * Uso:
 *   node scripts/migrate-legacy-turmas.mjs            # dry-run
 *   APPLY=1 node scripts/migrate-legacy-turmas.mjs    # grava no Firestore
 *
 * Requer login do Firebase CLI (ou gcloud) na conta dona do projeto.
 */
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

function loadEnv() {
  for (const file of ['.env.local', '.env']) {
    try {
      const raw = readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
      for (const line of raw.split('\n')) {
        const match = line.match(/^\s*([\w.]+)\s*=\s*(.*)?\s*$/)
        if (match && process.env[match[1]] === undefined) {
          process.env[match[1]] = (match[2] ?? '').replace(/^(['"])(.*)\1$/, '$2')
        }
      }
    } catch {
      // Arquivo opcional; valores podem vir do ambiente.
    }
  }
}

loadEnv()

const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID
if (!PROJECT_ID) {
  throw new Error('VITE_FIREBASE_PROJECT_ID não configurado.')
}

const APPLY = process.env.APPLY === '1'
if (APPLY && !process.env.MIGRATION_BACKUP_DIR) {
  throw new Error('Defina MIGRATION_BACKUP_DIR para um destino seguro antes de aplicar a migração.')
}
const BASE_URL = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`
const FB_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const FB_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

async function getAccessToken() {
  try {
    const token = execSync('gcloud auth print-access-token', {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
    if (token) return token
  } catch {
    // gcloud indisponível: tenta o token do Firebase CLI.
  }

  const configPath = path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json')
  let refreshToken
  try {
    const config = JSON.parse(readFileSync(configPath, 'utf8'))
    refreshToken = config?.tokens?.refresh_token
  } catch {
    // tratado abaixo
  }
  if (!refreshToken) {
    throw new Error(
      'Não foi possível obter token admin. Faça login com:\n  npx firebase-tools login'
    )
  }

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
  const json = await res.json()
  if (!res.ok) throw new Error(`Falha ao renovar token: ${JSON.stringify(json)}`)
  return json.access_token
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
    for (const [key, item] of Object.entries(value)) fields[key] = toFirestoreValue(item)
    return { mapValue: { fields } }
  }
  throw new Error(`Tipo não suportado: ${typeof value}`)
}

function toFields(data) {
  const fields = {}
  for (const [key, value] of Object.entries(data)) fields[key] = toFirestoreValue(value)
  return fields
}

function readValue(value) {
  if (!value) return null
  if ('stringValue' in value) return value.stringValue
  if ('booleanValue' in value) return value.booleanValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('nullValue' in value) return null
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(readValue)
  return null
}

function normalizeKey(value) {
  return String(value ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function slugify(value) {
  return normalizeKey(value).replace(/\s+/g, '-')
}

function normalizePeriod(value) {
  const key = normalizeKey(value)
  if (key.includes('tarde')) return 'tarde'
  if (key.includes('integral')) return 'integral'
  if (key.includes('manha')) return 'manha'
  return null
}

function titleCase(value) {
  return value
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ')
}

const KNOWN_CLASSES = [
  {
    id: 'turma-a-manha',
    nome: 'Turma A',
    codigo: 'TURMA-A',
    periodo: 'manha',
    keys: ['turma a', 'turma a manha', 'turma-a', 'turma-a-manha'],
  },
  {
    id: 'turma-b-tarde',
    nome: 'Turma B',
    codigo: 'TURMA-B',
    periodo: 'tarde',
    keys: ['turma b', 'turma b tarde', 'turma-b', 'turma-b-tarde'],
  },
  {
    id: 'turma-c-integral',
    nome: 'Turma C',
    codigo: 'TURMA-C',
    periodo: 'integral',
    keys: ['turma c', 'turma c integral', 'turma-c', 'turma-c-integral'],
  },
  {
    id: 'turma-d',
    nome: 'Turma D',
    codigo: 'TURMA-D',
    periodo: 'integral',
    keys: ['turma d', 'turma d integral', 'turma-d', 'turma-d-integral'],
  },
]

const IGNORED_CLASS_VALUES = new Set([
  '',
  'turma removida',
  'sem turma',
  'todas',
  'todas as turmas',
])

class FirestoreRest {
  constructor(token) {
    this.token = token
    this.headers = {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    }
  }

  async list(collectionName, fields) {
    const docs = []
    let pageToken
    do {
      const params = new URLSearchParams({ pageSize: '300' })
      if (pageToken) params.set('pageToken', pageToken)
      fields.forEach((field) => params.append('mask.fieldPaths', field))

      const res = await fetch(`${BASE_URL}/${collectionName}?${params}`, { headers: this.headers })
      const json = await res.json()
      if (!res.ok) {
        throw new Error(`Erro ao ler ${collectionName}: ${json.error?.message || res.status}`)
      }
      docs.push(...(json.documents ?? []))
      pageToken = json.nextPageToken
    } while (pageToken)
    return docs
  }

  async create(collectionName, documentId, data) {
    const params = new URLSearchParams({ documentId })
    const res = await fetch(`${BASE_URL}/${collectionName}?${params}`, {
      method: 'POST',
      headers: this.headers,
      body: JSON.stringify({ fields: toFields(data) }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(
        `Erro ao criar ${collectionName}/${documentId}: ${json.error?.message || res.status}`
      )
    }
    return json
  }

  async update(collectionName, documentId, data) {
    const params = new URLSearchParams()
    Object.keys(data).forEach((field) => params.append('updateMask.fieldPaths', field))
    const res = await fetch(`${BASE_URL}/${collectionName}/${documentId}?${params}`, {
      method: 'PATCH',
      headers: this.headers,
      body: JSON.stringify({ fields: toFields(data) }),
    })
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      throw new Error(
        `Erro ao atualizar ${collectionName}/${documentId}: ${json.error?.message || res.status}`
      )
    }
    return json
  }
}

function dateValue(value) {
  const text = String(value ?? '').trim()
  return /^\d{4}-\d{2}-\d{2}/.test(text) ? text.slice(0, 10) : null
}

function minDate(current, candidate) {
  if (!candidate) return current
  if (!current) return candidate
  return candidate < current ? candidate : current
}

function todayISO() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

async function main() {
  const token = await getAccessToken()
  const db = new FirestoreRest(token)

  const [turmaDocs, alunoDocs, sessaoDocs, atividadeDocs, matriculaDocs, usuarioDocs] =
    await Promise.all([
      db.list('turmas', ['nome', 'codigo', 'periodo', 'period', 'ativo']),
      db.list('alunos', ['turma', 'turma_id', 'turma_turno', 'status']),
      db.list('sessoes_chamada', ['turma_id', 'data_chamada']),
      db.list('registros_atividade', ['turma_id', 'data_atividade']),
      db.list('matriculas', ['aluno_id', 'turma_id', 'status']),
      db.list('usuarios', ['papel', 'ativo']),
    ])

  const existingTurmas = turmaDocs.map((doc) => ({
    id: doc.name.split('/').pop(),
    nome: readValue(doc.fields?.nome) || '',
    codigo: readValue(doc.fields?.codigo) || '',
    periodo: readValue(doc.fields?.periodo) || readValue(doc.fields?.period) || '',
  }))

  const turmasById = new Map(existingTurmas.map((turma) => [turma.id, turma]))
  const turmasByKey = new Map()
  for (const turma of existingTurmas) {
    for (const value of [turma.id, turma.nome, turma.codigo]) {
      const key = normalizeKey(value)
      if (key && !turmasByKey.has(key)) turmasByKey.set(key, turma)
    }
  }

  const usuarios = usuarioDocs.map((doc) => ({
    id: doc.name.split('/').pop(),
    papel: readValue(doc.fields?.papel) || '',
    ativo: readValue(doc.fields?.ativo) !== false,
  }))
  const ativos = usuarios.filter((usuario) => usuario.ativo)
  const direcao = ativos.filter((usuario) => usuario.papel === 'direcao')
  const responsaveis = (direcao.length > 0 ? direcao : ativos).map((usuario) => usuario.id)
  const ator = responsaveis[0] || 'migracao'

  const plannedClasses = new Map()
  const skippedReferences = new Set()
  const minDateByClass = new Map()

  function ensurePlannedClass(spec) {
    const byId = turmasById.get(spec.id)
    if (byId) return byId

    const byName = turmasByKey.get(normalizeKey(spec.nome))
    if (byName) return byName

    if (plannedClasses.has(spec.id)) return plannedClasses.get(spec.id)

    const planned = {
      ...spec,
      exists: false,
      dataInicio: null,
    }
    plannedClasses.set(spec.id, planned)
    return planned
  }

  function resolveClass(value, periodHint) {
    const raw = String(value ?? '').trim()
    const key = normalizeKey(raw)
    if (IGNORED_CLASS_VALUES.has(key)) return null

    const byId = turmasById.get(raw)
    if (byId) return byId

    const byKey = turmasByKey.get(key)
    if (byKey) return byKey

    const known = KNOWN_CLASSES.find((item) => item.keys.includes(key))
    if (known) return ensurePlannedClass(known)

    if (!key.startsWith('turma')) {
      skippedReferences.add(raw)
      return null
    }

    const match = raw.match(/^turma\s*[-_ ]?\s*([a-z0-9]+)(?:\s*[-_ ]\s*(manha|tarde|integral))?$/i)
    if (match) {
      const letter = match[1].toUpperCase()
      const periodo =
        normalizePeriod(match[2]) || normalizePeriod(periodHint) || normalizePeriod(raw) || 'manha'
      const id = /[-_]/.test(raw) ? slugify(raw) : `turma-${match[1].toLowerCase()}`
      return ensurePlannedClass({
        id,
        nome: `Turma ${letter}`,
        codigo: `TURMA-${letter}`,
        periodo,
      })
    }

    const nome = titleCase(raw)
    return ensurePlannedClass({
      id: slugify(raw),
      nome,
      codigo: `TURMA-${slugify(raw).toUpperCase()}`,
      periodo: normalizePeriod(periodHint) || 'manha',
    })
  }

  function recordClassDate(turma, date) {
    if (!turma) return
    const current = minDateByClass.get(turma.id) || null
    minDateByClass.set(turma.id, minDate(current, dateValue(date)))
  }

  const alunoUpdates = []
  const sessaoUpdates = []
  const atividadeUpdates = []
  const matriculaUpdates = []
  const matriculasEncerrar = []
  const matriculasPlanejadas = []
  const activeEnrollmentDocsByStudent = new Map()
  const activePairs = new Set()

  for (const doc of matriculaDocs) {
    const id = doc.name.split('/').pop()
    const alunoId = readValue(doc.fields?.aluno_id) || ''
    const turmaId = readValue(doc.fields?.turma_id) || ''
    const status = normalizeKey(readValue(doc.fields?.status))
    const turma = resolveClass(turmaId)
    if (turma && turma.id !== turmaId) {
      matriculaUpdates.push({ id, turmaId: turma.id })
    }
    if (turma && status === 'ativo' && alunoId) {
      activePairs.add(`${alunoId}::${turma.id}`)
      const current = activeEnrollmentDocsByStudent.get(alunoId) || []
      current.push({ id, turmaId: turma.id })
      activeEnrollmentDocsByStudent.set(alunoId, current)
    }
  }

  const alunoTurma = new Map()

  for (const doc of alunoDocs) {
    const id = doc.name.split('/').pop()
    const turmaId = readValue(doc.fields?.turma_id) || ''
    const turmaNome = readValue(doc.fields?.turma) || ''
    const turmaTurno = readValue(doc.fields?.turma_turno) || ''
    const status = normalizeKey(readValue(doc.fields?.status)) || 'ativo'

    const turma = resolveClass(turmaId, turmaTurno) || resolveClass(turmaNome, turmaTurno)
    if (!turma) continue

    alunoTurma.set(id, { turma, status })
    if (turma.id !== turmaId) {
      alunoUpdates.push({ id, turmaId: turma.id })
    }
  }

  for (const doc of sessaoDocs) {
    const id = doc.name.split('/').pop()
    const turmaId = readValue(doc.fields?.turma_id) || ''
    const turma = resolveClass(turmaId)
    if (!turma) continue
    recordClassDate(turma, readValue(doc.fields?.data_chamada))
    if (turma.id !== turmaId) {
      sessaoUpdates.push({ id, turmaId: turma.id })
    }
  }

  for (const doc of atividadeDocs) {
    const id = doc.name.split('/').pop()
    const turmaId = readValue(doc.fields?.turma_id) || ''
    const turma = resolveClass(turmaId)
    if (!turma) continue
    recordClassDate(turma, readValue(doc.fields?.data_atividade))
    if (turma.id !== turmaId) {
      atividadeUpdates.push({ id, turmaId: turma.id })
    }
  }

  for (const [alunoId, { turma, status }] of alunoTurma) {
    if (status !== 'ativo') continue
    const activeForStudent = activeEnrollmentDocsByStudent.get(alunoId) || []
    for (const enrollment of activeForStudent) {
      if (enrollment.turmaId !== turma.id) {
        matriculasEncerrar.push({ id: enrollment.id })
        activePairs.delete(`${alunoId}::${enrollment.turmaId}`)
      }
    }
    if (activePairs.has(`${alunoId}::${turma.id}`)) continue
    const id = `matricula-${alunoId}-${turma.id}`.slice(0, 1400)
    matriculasPlanejadas.push({
      id,
      alunoId,
      turmaId: turma.id,
      dataInicio: minDateByClass.get(turma.id) || todayISO(),
      dataInicioEstimativa: true,
      origemDataInicio: minDateByClass.has(turma.id)
        ? 'menor_data_atividade_turma'
        : 'data_execucao_migracao',
    })
  }

  for (const turma of plannedClasses.values()) {
    turma.dataInicio = minDateByClass.get(turma.id) || null
  }

  console.log(`Projeto: ${PROJECT_ID}`)
  console.log(`Modo: ${APPLY ? 'APLICAR' : 'DRY-RUN (nada será gravado)'}`)
  console.log('')
  console.log(`Turmas existentes: ${existingTurmas.length}`)
  console.log(`Turmas a criar: ${plannedClasses.size}`)
  for (const turma of plannedClasses.values()) {
    console.log(
      `  + ${turma.id} | ${turma.nome} | ${turma.periodo} | início ${turma.dataInicio || 'não definido'}`
    )
  }
  console.log(`Alunos a atualizar: ${alunoUpdates.length}`)
  console.log(`Chamadas a normalizar: ${sessaoUpdates.length}`)
  console.log(`Atividades a normalizar: ${atividadeUpdates.length}`)
  console.log(`Matriculas ativas a encerrar: ${matriculasEncerrar.length}`)
  console.log(`Matrículas a normalizar: ${matriculaUpdates.length}`)
  console.log(`Matrículas a criar: ${matriculasPlanejadas.length}`)
  for (const item of matriculasEncerrar) {
    console.log(`  - Encerrar matricula ${item.id}`)
  }
  for (const item of matriculasPlanejadas) {
    console.log(`  + ${item.alunoId} -> ${item.turmaId} | inicio ${item.dataInicio} | estimada (${item.origemDataInicio})`)
  }  if (skippedReferences.size > 0) {
    console.log('Referências ignoradas (não parecem turma):')
    for (const value of skippedReferences) console.log(`  - ${value || '(vazio)'}`)
  }

  if (!APPLY) {
    console.log('')
    console.log('Dry-run concluído. Rode com APPLY=1 para gravar.')
    return
  }

  const backupDir = process.env.MIGRATION_BACKUP_DIR
  mkdirSync(backupDir, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupDir, `migracao-turmas-${stamp}.json`)
  writeFileSync(
    backupPath,
    JSON.stringify(
      {
        projeto: PROJECT_ID,
        geradoEm: new Date().toISOString(),
        turmas: turmaDocs,
        alunos: alunoDocs,
        sessoes: sessaoDocs,
        atividades: atividadeDocs,
        matriculas: matriculaDocs,
      },
      null,
      2
    )
  )
  console.log(`\nBackup dos documentos lidos: ${backupPath}`)

  const now = new Date()

  for (const turma of plannedClasses.values()) {
    await db.create('turmas', turma.id, {
      codigo: turma.codigo,
      nome: turma.nome,
      periodo: turma.periodo,
      period: turma.periodo,
      ids_usuarios_responsaveis: responsaveis,
      data_inicio: turma.dataInicio,
      data_fim: null,
      ativo: true,
      criado_por: ator,
      criado_em: now,
      atualizado_por: ator,
      atualizado_em: now,
    })
    console.log(`Turma criada: ${turma.id} (${turma.nome})`)
  }

  for (const item of alunoUpdates) {
    await db.update('alunos', item.id, { turma_id: item.turmaId })
  }
  if (alunoUpdates.length > 0) console.log(`Alunos atualizados: ${alunoUpdates.length}`)

  for (const item of sessaoUpdates) {
    await db.update('sessoes_chamada', item.id, { turma_id: item.turmaId })
  }
  if (sessaoUpdates.length > 0) console.log(`Chamadas normalizadas: ${sessaoUpdates.length}`)

  for (const item of atividadeUpdates) {
    await db.update('registros_atividade', item.id, { turma_id: item.turmaId })
  }
  if (atividadeUpdates.length > 0) console.log(`Atividades normalizadas: ${atividadeUpdates.length}`)

  for (const item of matriculaUpdates) {
    await db.update('matriculas', item.id, { turma_id: item.turmaId })
  }
  if (matriculaUpdates.length > 0) console.log(`Matrículas normalizadas: ${matriculaUpdates.length}`)

  for (const item of matriculasEncerrar) {
    await db.update('matriculas', item.id, {
      status: 'concluido',
      data_fim: todayISO(),
      atualizado_por: ator,
      atualizado_em: now,
    })
  }
  if (matriculasEncerrar.length > 0) {
    console.log(`Matriculas encerradas: ${matriculasEncerrar.length}`)
  }

  for (const item of matriculasPlanejadas) {
    await db.create('matriculas', item.id, {
      aluno_id: item.alunoId,
      turma_id: item.turmaId,
      data_inicio: item.dataInicio,
      data_inicio_estimativa: item.dataInicioEstimativa,
      origem_data_inicio: item.origemDataInicio,
      data_fim: null,
      status: 'ativo',
      criado_por: ator,
      criado_em: now,
      atualizado_por: ator,
      atualizado_em: now,
    })
    console.log(
      `Matrícula criada: ${item.alunoId} -> ${item.turmaId} (início estimado: ${item.dataInicio}; origem: ${item.origemDataInicio})`
    )
  }

  console.log('\nMigração concluída.')
}

main().catch((error) => {
  console.error('\nFalha na migração:', error instanceof Error ? error.message : error)
  process.exitCode = 1
})
