import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import { doc, setDoc } from 'firebase/firestore'
import { deleteObject, getBytes, ref, updateMetadata, uploadBytes } from 'firebase/storage'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'

const PROJECT_ID = 'fundacao-toque-rules-test'
const CAMINHO = 'alunos/aluno-1/ficha_medica/ficha.pdf'
let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
    storage: { rules: readFileSync('storage.rules', 'utf8') },
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.clearStorage()
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'usuarios/direcao-1'), { papel: 'direcao', ativo: true }),
      setDoc(doc(db, 'usuarios/pedagogia-1'), { papel: 'pedagogia', ativo: true }),
      setDoc(doc(db, 'usuarios/admin-1'), { papel: 'administrativo', ativo: true }),
      setDoc(doc(db, 'usuarios/inativo-1'), { papel: 'direcao', ativo: false }),
      setDoc(doc(db, 'alunos/aluno-1'), { nome_completo: 'Aluno fictício' }),
    ])
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46])

function storage(uid?: string) {
  return uid
    ? testEnv.authenticatedContext(uid).storage()
    : testEnv.unauthenticatedContext().storage()
}

function metadados(uid: string, extra: Record<string, string> = {}) {
  return {
    contentType: 'application/pdf',
    customMetadata: {
      aluno_id: 'aluno-1',
      enviado_por: uid,
      ...extra,
    },
  }
}

async function enviar(uid: string, caminho = CAMINHO, extra: Record<string, string> = {}) {
  return uploadBytes(ref(storage(uid), caminho), pdf, metadados(uid, extra))
}

describe('Storage security rules: ficha médica', () => {
  it('permite leitura, envio e exclusão apenas para Direção e Pedagogia', async () => {
    await assertSucceeds(enviar('direcao-1'))
    await assertSucceeds(enviar('pedagogia-1', 'alunos/aluno-1/ficha_medica/pedagogia.pdf'))

    await assertFails(enviar('admin-1', 'alunos/aluno-1/ficha_medica/admin.pdf'))
    await assertFails(enviar('inativo-1', 'alunos/aluno-1/ficha_medica/inativo.pdf'))
    await assertFails(enviar('sem-perfil', 'alunos/aluno-1/ficha_medica/sem-perfil.pdf'))
    await assertFails(
      uploadBytes(ref(storage(), 'alunos/aluno-1/ficha_medica/anonimo.pdf'), pdf, metadados('anonimo')),
    )

    await assertSucceeds(getBytes(ref(storage('direcao-1'), CAMINHO)))
    await assertSucceeds(getBytes(ref(storage('pedagogia-1'), CAMINHO)))
    await assertFails(getBytes(ref(storage('admin-1'), CAMINHO)))
    await assertFails(getBytes(ref(storage(), CAMINHO)))

    await assertFails(
      updateMetadata(ref(storage('direcao-1'), CAMINHO), {
        customMetadata: { aluno_id: 'aluno-1', enviado_por: 'direcao-1' },
      }),
    )

    await assertFails(deleteObject(ref(storage('admin-1'), CAMINHO)))
    await assertSucceeds(deleteObject(ref(storage('pedagogia-1'), CAMINHO)))
  })

  it('exige metadados do próprio usuário, aluno existente, tipo e tamanho permitidos', async () => {
    await assertFails(enviar('direcao-1', CAMINHO, { aluno_id: 'aluno-2' }))
    await assertFails(enviar('direcao-1', CAMINHO, { enviado_por: 'pedagogia-1' }))
    await assertFails(
      uploadBytes(ref(storage('direcao-1'), 'alunos/aluno-2/ficha_medica/ficha.pdf'), pdf, metadados('direcao-1')),
    )
    await assertFails(
      uploadBytes(ref(storage('direcao-1'), CAMINHO), pdf, {
        ...metadados('direcao-1'),
        contentType: 'image/gif',
      }),
    )
    await assertFails(
      uploadBytes(ref(storage('direcao-1'), CAMINHO), new Uint8Array(0), metadados('direcao-1')),
    )
    await assertFails(
      uploadBytes(
        ref(storage('direcao-1'), CAMINHO),
        new Uint8Array(10 * 1024 * 1024 + 1),
        metadados('direcao-1'),
      ),
    )
    await assertSucceeds(
      uploadBytes(ref(storage('direcao-1'), 'alunos/aluno-1/ficha_medica/foto.png'), pdf, {
        ...metadados('direcao-1'),
        contentType: 'image/png',
      }),
    )
  })

  it('nega escrita em caminhos fora da ficha médica', async () => {
    await assertFails(
      uploadBytes(ref(storage('direcao-1'), 'alunos/aluno-1/documentos/ficha.pdf'), pdf, metadados('direcao-1')),
    )
    await assertFails(
      uploadBytes(ref(storage('direcao-1'), 'publico/ficha.pdf'), pdf, metadados('direcao-1')),
    )
  })
})
