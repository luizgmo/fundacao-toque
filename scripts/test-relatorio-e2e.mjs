/**
 * Teste E2E do Relatório Pedagógico — Fundação Toque
 *
 * Fluxo: login (Auth) -> cria relatorio_pedagogicos/rel_TESTE_* ->
 *        lê de volta e confere campo a campo -> envia anexo ao Storage +
 *        subcoleção anexos -> roda as leituras do dashboard ->
 *        APAGA todos os rastros -> logout.
 *
 * Credenciais via ambiente (NUNCA hardcoded):
 *   $env:TEST_EMAIL="..."; $env:TEST_PASSWORD="..."; node scripts/test-relatorio-e2e.mjs
 *
 * Dados 100% fictícios, prefixo __TESTE_E2E__.
 */
import { readFileSync } from 'node:fs'
import { initializeApp } from 'firebase/app'
import { getAuth, signInWithEmailAndPassword, signOut } from 'firebase/auth'
import {
  collection, deleteDoc, doc, getDoc, getDocs, limit,
  query, serverTimestamp, setDoc, where,
} from 'firebase/firestore'
import { getFirestore } from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes, getStorage } from 'firebase/storage'

function loadEnv() {
  try {
    const raw = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    for (const line of raw.split('\n')) {
      const match = line.match(/^\s*([\w.]+)\s*=\s*(.*)?\s*$/)
      if (match && process.env[match[1]] === undefined) process.env[match[1]] = (match[2] ?? '').trim()
    }
  } catch { /* ignore */ }
}
loadEnv()

const EMAIL = process.env.TEST_EMAIL
const PASSWORD = process.env.TEST_PASSWORD
if (!EMAIL || !PASSWORD) {
  console.error('FAIL: informe TEST_EMAIL e TEST_PASSWORD no ambiente.')
  process.exit(2)
}

const results = []
function check(name, ok, detail = '') {
  results.push({ name, ok })
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`)
}

const app = initializeApp({
  apiKey: process.env.VITE_FIREBASE_API_KEY,
  authDomain: process.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: process.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.VITE_FIREBASE_APP_ID,
})
const auth = getAuth(app)
const db = getFirestore(app)
const storage = getStorage(app)

const stamp = Date.now().toString().slice(-6)
const TEST_ID = `rel_TESTE_E2E_${stamp}`
let anexoStoragePath = null
let anexoDocId = null
let tempAlunoId = null

async function cleanup() {
  // Apaga anexo (Storage + subcoleção), relatório e aluno temporário — melhor esforço
  try {
    if (anexoStoragePath) await deleteObject(ref(storage, anexoStoragePath)).catch(() => {})
    if (anexoDocId) await deleteDoc(doc(db, `relatorios_pedagogicos/${TEST_ID}/anexos`, anexoDocId)).catch(() => {})
    await deleteDoc(doc(db, 'relatorios_pedagogicos', TEST_ID)).catch(() => {})
    if (tempAlunoId) await deleteDoc(doc(db, 'alunos', tempAlunoId)).catch(() => {})
  } catch { /* ignore */ }
}

try {
  // 1. Login
  const cred = await signInWithEmailAndPassword(auth, EMAIL, PASSWORD)
  const uid = cred.user.uid
  check('1. Login no Firebase Auth', true, `uid=${uid}`)

  // 2. Perfil / papel (espelha o AuthContext: cria doc próprio se não existir)
  let perfilSnap = await getDoc(doc(db, 'usuarios', uid))
  if (!perfilSnap.exists()) {
    await setDoc(doc(db, 'usuarios', uid), {
      nome_completo: EMAIL.split('@')[0],
      email: EMAIL, papel: 'direcao', ativo: true,
      criado_em: serverTimestamp(), atualizado_em: serverTimestamp(),
    })
    perfilSnap = await getDoc(doc(db, 'usuarios', uid))
    console.log('     doc usuarios/{uid} criado (igual ao primeiro login no app)')
  }
  const papel = perfilSnap.exists() ? perfilSnap.data().papel : '(sem doc em usuarios)'
  check('2. Perfil lido em usuarios/{uid}', perfilSnap.exists(), `papel=${papel}`)
  check('2b. Papel permite salvar relatório (direcao|pedagogia)', papel === 'direcao' || papel === 'pedagogia', `papel=${papel}`)

  // 3. Busca um aluno real; se o banco estiver vazio, cria um temporário
  const alunosSnap = await getDocs(query(collection(db, 'alunos'), limit(5)))
  check('3. Leitura de alunos (lista do select)', true, `${alunosSnap.size} aluno(s) na amostra`)
  let alunoId, alunoNome
  if (alunosSnap.empty) {
    tempAlunoId = `aluno_TESTE_E2E_${stamp}`
    await setDoc(doc(db, 'alunos', tempAlunoId), {
      nome_completo: '__TESTE_E2E__ Aluno', nome_busca: '__teste_e2e__ aluno',
      data_nascimento: '2015-01-01', status: 'ativo', uso_imagem_autorizado: false,
      criado_por: uid, criado_em: serverTimestamp(),
      atualizado_por: uid, atualizado_em: serverTimestamp(),
    })
    alunoId = tempAlunoId
    alunoNome = '__TESTE_E2E__ Aluno (temporário)'
    console.log(`     Banco vazio: aluno temporário criado (${alunoId})`)
  } else {
    const alunoDoc = alunosSnap.docs[0]
    alunoId = alunoDoc.id
    alunoNome = alunoDoc.data().nome_completo || '(sem nome)'
  }
  console.log(`     Aluno usado: ${alunoNome} (${alunoId})`)

  // 4. Cria relatório — MESMO formato que relatoriosService.saveRelatorio grava
  const input = {
    aluno_id: alunoId,
    tipo_relatorio: 'semestral',
    periodo_inicio: '2026-01-01',
    periodo_fim: '2026-06-30',
    evolucao: '__TESTE_E2E__ evolucao observada',
    dificuldades: '__TESTE_E2E__ dificuldades',
    avancos: '__TESTE_E2E__ avancos',
    encaminhamentos: '__TESTE_E2E__ encaminhamentos',
    usuario_responsavel_id: uid,
    usuario_responsavel_nome: '__TESTE_E2E__ Responsavel',
    modelo_formulario_id: null,
    modelo_formulario_versao: null,
    respostas: {
      avaliacao_por_area: { cognitivo: 'Em evolução', motor: 'Adequado', social: 'Em evolução', comunicacao: 'Em evolução', autonomia: 'Necessita apoio' },
      observacoes_finais: '__TESTE_E2E__ obs finais',
    },
    status: 'rascunho',
    criado_por: uid,
    criado_em: serverTimestamp(),
    atualizado_por: uid,
    atualizado_em: serverTimestamp(),
  }
  await setDoc(doc(db, 'relatorios_pedagogicos', TEST_ID), input)
  check('4. CREATE relatorios_pedagogicos/' + TEST_ID, true)

  // 5. Lê de volta e confere campo a campo
  const back = await getDoc(doc(db, 'relatorios_pedagogicos', TEST_ID))
  check('5. READ do documento criado', back.exists())
  const d = back.data() || {}
  const esperado = {
    aluno_id: alunoId, tipo_relatorio: 'semestral', periodo_inicio: '2026-01-01',
    periodo_fim: '2026-06-30', status: 'rascunho', usuario_responsavel_id: uid,
  }
  let camposOk = true
  for (const [k, v] of Object.entries(esperado)) {
    if (d[k] !== v) { camposOk = false; console.log(`     campo divergente: ${k} esperado=${v} lido=${d[k]}`) }
  }
  const areaOk = d.respostas?.avaliacao_por_area?.cognitivo === 'Em evolução'
    && d.respostas?.observacoes_finais === '__TESTE_E2E__ obs finais'
  check('5b. Campos conferem com o enviado (inclui respostas.*)', camposOk && areaOk)

  // 6. Atualiza para concluído (mesmo que o botão Finalizar faz)
  const { updateDoc } = await import('firebase/firestore')
  await updateDoc(doc(db, 'relatorios_pedagogicos', TEST_ID), { status: 'concluido', atualizado_por: uid, atualizado_em: serverTimestamp() })
  const back2 = (await getDoc(doc(db, 'relatorios_pedagogicos', TEST_ID))).data()
  check('6. UPDATE status -> concluido', back2.status === 'concluido')

  // 7. Query por aluno (a mesma do histórico da tela)
  const hist = await getDocs(query(collection(db, 'relatorios_pedagogicos'), where('aluno_id', '==', alunoId)))
  check('7. Query where(aluno_id) do histórico', hist.docs.some((x) => x.id === TEST_ID), `${hist.size} doc(s) do aluno`)

  // 8. Anexo (pulado com SKIP_STORAGE=1 — projeto sem Storage)
  if (process.env.SKIP_STORAGE === '1') {
    check('8. Upload anexo', true, 'pulado (projeto sem Storage)')
  } else {
  const png1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64')
  const file = new File([png1x1], 'teste_e2e.png', { type: 'image/png' })
  const { doc: docFn, collection: colFn, setDoc: setDocFn } = await import('firebase/firestore')
  const anexoRef = docFn(colFn(db, `relatorios_pedagogicos/${TEST_ID}/anexos`))
  anexoDocId = anexoRef.id
  anexoStoragePath = `relatorios_pedagogicos/${TEST_ID}/${anexoRef.id}_teste_e2e.png`
  await uploadBytes(ref(storage, anexoStoragePath), file, { contentType: 'image/png' })
  await setDocFn(anexoRef, {
    tipo_anexo: 'imagem', caminho_storage: anexoStoragePath,
    nome_arquivo_original: 'teste_e2e.png', tipo_conteudo: 'image/png',
    legenda: null, enviado_por: uid, enviado_em: serverTimestamp(),
  })
  const url = await getDownloadURL(ref(storage, anexoStoragePath))
  check('8. Upload anexo + metadados + download URL', typeof url === 'string' && url.startsWith('https://'))
  }

  // 9. Leituras do dashboard com este usuário
  const [nAlunos, nTurmas, nOficinas, nSessoes] = await Promise.all([
    getDocs(query(collection(db, 'alunos'), where('status', '==', 'ativo'))),
    getDocs(query(collection(db, 'turmas'), where('ativo', '==', true))),
    getDocs(query(collection(db, 'oficinas'), where('ativo', '==', true))),
    getDocs(query(collection(db, 'sessoes_chamada'), limit(5))),
  ])
  check('9. Leituras do dashboard (alunos/turmas/oficinas/sessoes)', true,
    `alunos=${nAlunos.size} turmas=${nTurmas.size} oficinas=${nOficinas.size} sessoes(amostra)=${nSessoes.size}`)
} catch (err) {
  check('ERRO inesperado', false, `${err.code || ''} ${err.message || err}`.trim())
} finally {
  await cleanup()
  // Confirma que o teste não deixou rastro
  const resto = await getDoc(doc(db, 'relatorios_pedagogicos', TEST_ID)).catch(() => null)
  const restoAluno = tempAlunoId ? await getDoc(doc(db, 'alunos', tempAlunoId)).catch(() => null) : null
  check('10. Limpeza: docs de teste apagados', (!resto || !resto.exists()) && (!restoAluno || !restoAluno.exists()))
  await signOut(auth).catch(() => {})
}

const falhas = results.filter((r) => !r.ok).length
console.log(`\nRESUMO: ${results.length - falhas}/${results.length} verificações PASS`)
process.exit(falhas === 0 ? 0 : 1)
