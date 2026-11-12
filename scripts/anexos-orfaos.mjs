/**
 * Localiza (e opcionalmente corrige) anexos inconsistentes guardados no Firestore.
 *
 * Verifica, em registros_atividade e relatorios_pedagogicos:
 *   - parte_sem_anexo      partes de conteúdo cujo anexo não existe        -> apaga as partes
 *   - anexo_sem_pai        anexo de registro/relatório que não existe      -> apaga anexo e partes
 *   - envio_abandonado     anexo "enviando" há mais de HORAS (padrão 24 h) -> apaga anexo e partes
 *   - contador_divergente  total_anexos ≠ arquivos disponíveis             -> regrava total_anexos
 *   - conteudo_incompleto  anexo "disponivel" sem todas as partes          -> só informa (excluir no app e reenviar)
 *   - exclusao_incompleta  registro com exclusão interrompida              -> só informa (“Concluir exclusão” no app)
 *
 * Uso:
 *   npm run anexos:orfaos                          # dry-run: só lista
 *   APPLY=1 npm run anexos:orfaos                  # aplica as correções automáticas
 *   HORAS=6 npm run anexos:orfaos                  # muda o limite de envio abandonado
 *   FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 ...     # roda contra o emulador
 *
 * Requer login do Firebase CLI (ou gcloud) na conta dona do projeto, exceto no emulador.
 * É idempotente: rodar de novo depois de aplicar não encontra os mesmos itens.
 */
import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { analisarAnexos } from '../src/lib/anexosOrfaos.ts'

function loadEnv() {
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*([\w.]+)\s*=\s*(.*)?\s*$/)
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = match[2] ?? ''
    }
  } catch {
    // sem .env.local: usa as variáveis de ambiente
  }
}

loadEnv()

const EMULATOR = process.env.FIRESTORE_EMULATOR_HOST
const PROJECT_ID = process.env.VITE_FIREBASE_PROJECT_ID || process.env.GCLOUD_PROJECT
if (!PROJECT_ID) throw new Error('VITE_FIREBASE_PROJECT_ID (ou GCLOUD_PROJECT) não configurado.')
const APPLY = process.env.APPLY === '1'
const HORAS = Number(process.env.HORAS || 24)
const ROOT = `projects/${PROJECT_ID}/databases/(default)/documents`
const BASE_URL = EMULATOR ? `http://${EMULATOR}/v1/${ROOT}` : `https://firestore.googleapis.com/v1/${ROOT}`
const FB_CLIENT_ID = '563584335869-fgrhgmd47bqnekij5i8b5pr03ho849e6.apps.googleusercontent.com'
const FB_CLIENT_SECRET = 'j9iVZfS8kkCEFUPaAeJV0sAi'

async function getAccessToken() {
  if (EMULATOR) return 'owner'
  try {
    const token = execSync('gcloud auth print-access-token', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
    if (token) return token
  } catch {
    // tenta o Firebase CLI
  }
  let refreshToken
  try {
    const config = JSON.parse(readFileSync(path.join(os.homedir(), '.config', 'configstore', 'firebase-tools.json'), 'utf8'))
    refreshToken = config?.tokens?.refresh_token
  } catch {
    // tratado abaixo
  }
  if (!refreshToken) throw new Error('Não foi possível obter token admin. Faça login com:\n  npx firebase-tools login')
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

const token = await getAccessToken()
const headers = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }

function readValue(value) {
  if (!value) return null
  if ('stringValue' in value) return value.stringValue
  if ('integerValue' in value) return Number(value.integerValue)
  if ('doubleValue' in value) return value.doubleValue
  if ('booleanValue' in value) return value.booleanValue
  if ('timestampValue' in value) return value.timestampValue
  if ('nullValue' in value) return null
  if ('arrayValue' in value) return (value.arrayValue.values ?? []).map(readValue)
  if ('mapValue' in value) {
    return Object.fromEntries(Object.entries(value.mapValue.fields ?? {}).map(([k, v]) => [k, readValue(v)]))
  }
  return null
}

const relPath = (name) => name.slice(name.indexOf('/documents/') + '/documents/'.length)

// Consulta paginada (coleção ou collection group) lendo só os campos pedidos:
// as partes têm até ~800 KB de conteúdo, que não precisa ser baixado aqui.
async function consultar(collectionId, allDescendants, fields) {
  const docs = []
  let cursor = null
  for (;;) {
    const structuredQuery = {
      from: [{ collectionId, allDescendants }],
      select: { fields: fields.map((fieldPath) => ({ fieldPath })) },
      orderBy: [{ field: { fieldPath: '__name__' } }],
      limit: 500,
      ...(cursor ? { startAt: { values: [{ referenceValue: cursor }], before: false } } : {}),
    }
    const res = await fetch(`${BASE_URL}:runQuery`, { method: 'POST', headers, body: JSON.stringify({ structuredQuery }) })
    const json = await res.json()
    if (!res.ok) throw new Error(`Falha ao consultar ${collectionId}: ${JSON.stringify(json)}`)
    const page = json.filter((r) => r.document).map((r) => r.document)
    docs.push(...page)
    if (page.length < 500) break
    cursor = page[page.length - 1].name
  }
  return docs.map((d) => ({
    path: relPath(d.name),
    data: Object.fromEntries(Object.entries(d.fields ?? {}).map(([k, v]) => [k, readValue(v)])),
  }))
}

async function apagar(docPath) {
  const res = await fetch(`${BASE_URL}/${docPath}`, { method: 'DELETE', headers })
  if (!res.ok) throw new Error(`Falha ao apagar ${docPath}: ${res.status} ${await res.text()}`)
}

async function gravarTotal(docPath, total) {
  const res = await fetch(`${BASE_URL}/${docPath}?updateMask.fieldPaths=total_anexos&currentDocument.exists=true`, {
    method: 'PATCH',
    headers,
    body: JSON.stringify({ fields: { total_anexos: { integerValue: String(total) } } }),
  })
  if (!res.ok) throw new Error(`Falha ao corrigir ${docPath}: ${res.status} ${await res.text()}`)
}

async function main() {
  console.log(`Projeto: ${PROJECT_ID}${EMULATOR ? ` (emulador ${EMULATOR})` : ''} · modo: ${APPLY ? 'APLICAR' : 'dry-run'}`)
  const [registros, relatorios, anexos, partes] = await Promise.all([
    consultar('registros_atividade', false, ['total_anexos', 'exclusao']),
    consultar('relatorios_pedagogicos', false, ['status']),
    consultar('anexos', true, ['status', 'total_partes', 'nome_arquivo_original', 'enviado_em']),
    consultar('chunks', true, ['indice']),
  ])

  const achados = analisarAnexos({
    agora: new Date(),
    horasEnvioAbandonado: HORAS,
    pais: [
      ...registros.map((r) => ({ path: r.path, totalAnexos: r.data.total_anexos ?? 0, exclusao: r.data.exclusao })),
      ...relatorios.map((r) => ({ path: r.path })),
    ],
    anexos: anexos.map((a) => ({
      path: a.path,
      status: a.data.status,
      totalPartes: a.data.total_partes,
      nome: a.data.nome_arquivo_original,
      enviadoEm: a.data.enviado_em,
    })),
    partes: partes.map((p) => ({ path: p.path })),
  })

  console.log(
    `Lidos: ${registros.length} registro(s), ${relatorios.length} relatório(s), ${anexos.length} anexo(s), ${partes.length} parte(s).`
  )
  if (achados.length === 0) {
    console.log('✅ Nenhuma inconsistência encontrada.')
    return
  }

  for (const a of achados) {
    console.log(`- [${a.tipo}] ${a.path}: ${a.descricao} → ${a.correcao}`)
  }

  if (!APPLY) {
    console.log(`\n${achados.length} achado(s). Rode com APPLY=1 para aplicar as correções automáticas (apagar/recontar).`)
    return
  }

  let corrigidos = 0
  let falhas = 0
  for (const a of achados) {
    try {
      if (a.correcao === 'apagar') {
        // partes antes dos metadados: uma falha no meio não cria novos órfãos invisíveis
        for (const p of a.apagar ?? []) await apagar(p)
        corrigidos += 1
      } else if (a.correcao === 'recontar') {
        await gravarTotal(a.path, a.totalCorreto)
        corrigidos += 1
      }
    } catch (err) {
      falhas += 1
      console.error(`  ✗ ${a.path}: ${err.message}`)
    }
  }
  const manuais = achados.filter((a) => a.correcao === 'manual').length
  console.log(`\nCorrigidos: ${corrigidos} · falhas: ${falhas} · exigem ação manual: ${manuais}.`)
  if (falhas > 0) process.exitCode = 1
}

main().catch((err) => {
  console.error(err)
  process.exitCode = 1
})
