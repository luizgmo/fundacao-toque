import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  deleteDoc,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore'
import type { RulesTestEnvironment } from '@firebase/rules-unit-testing'

const PROJECT_ID = 'fundacao-toque-rules-test'
let testEnv: RulesTestEnvironment

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  })
})

beforeEach(async () => {
  await testEnv.clearFirestore()
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore()
    await Promise.all([
      setDoc(doc(db, 'usuarios/direcao-1'), { papel: 'direcao', ativo: true, nome_completo: 'Direção' }),
      setDoc(doc(db, 'usuarios/pedagogia-1'), { papel: 'pedagogia', ativo: true, nome_completo: 'Pedagogia' }),
      setDoc(doc(db, 'usuarios/admin-1'), { papel: 'administrativo', ativo: true, nome_completo: 'Administrativo' }),
      setDoc(doc(db, 'usuarios/inativo-1'), { papel: 'direcao', ativo: false }),
      setDoc(doc(db, 'alunos/aluno-1'), { nome_completo: 'Aluno fictício', responsavel_principal_id: 'principal-1' }),
      setDoc(doc(db, 'alunos/aluno-1/responsaveis/principal-1'), { nome_completo: 'Principal', parentesco: 'Mãe', telefone: '0000', ativo: true, principal: true }),
      setDoc(doc(db, 'registros_atividade/atividade-1'), { turma_id: 'turma-1' }),
      setDoc(doc(db, 'relatorios_pedagogicos/rascunho-1'), { status: 'rascunho', aluno_id: 'aluno-1' }),
      setDoc(doc(db, 'relatorios_pedagogicos/concluido-1'), { status: 'concluido', aluno_id: 'aluno-1' }),
      setDoc(doc(db, 'contatos_familia/contato-1'), {
        aluno_id: 'aluno-1', responsavel_id: 'principal-1',
        responsavel_snapshot: { nome: 'Nome da época', contato: '0000' },
      }),
    ])
  })
})

afterAll(async () => {
  await testEnv.cleanup()
})

function firestore(uid?: string, papel?: string) {
  return uid ? testEnv.authenticatedContext(uid, { papel }).firestore() : testEnv.unauthenticatedContext().firestore()
}

describe('Firestore security rules', () => {
  it('nega acesso anônimo e perfil ausente a dados operacionais', async () => {
    await assertFails(getDoc(doc(firestore(), 'alunos/aluno-1')))
    await assertFails(getDoc(doc(firestore('sem-perfil'), 'alunos/aluno-1')))
  })

  it('nega acesso a usuários inativos e mantém leitura de aluno para papéis ativos', async () => {
    await assertFails(getDoc(doc(firestore('inativo-1'), 'alunos/aluno-1')))
    for (const uid of ['direcao-1', 'pedagogia-1', 'admin-1']) {
      await assertSucceeds(getDoc(doc(firestore(uid), 'alunos/aluno-1')))
    }
  })

  it('impede autoelevação, reativação, criação arbitrária e exclusão de perfil', async () => {
    const own = doc(firestore('pedagogia-1'), 'usuarios/pedagogia-1')
    await assertSucceeds(getDoc(own))
    await assertFails(updateDoc(own, { papel: 'direcao' }))
    await assertFails(updateDoc(own, { ativo: false }))
    await assertFails(setDoc(doc(firestore('novo-uid'), 'usuarios/novo-uid'), { papel: 'direcao', ativo: true }))
    await assertFails(deleteDoc(own))
    await assertSucceeds(setDoc(doc(firestore('direcao-1'), 'usuarios/novo-uid'), { papel: 'administrativo', ativo: true }))
  })

  it('limita responsáveis a Direção/Administrativo e protege o documento pai', async () => {
    await assertFails(setDoc(doc(firestore('admin-1'), 'alunos/aluno-1/responsaveis/forjado'), { nome_completo: 'Familiar', ativo: true, principal: true }))
    await assertFails(setDoc(doc(firestore('pedagogia-1'), 'alunos/aluno-1/responsaveis/r2'), { nome_completo: 'Familiar' }))
    await assertFails(setDoc(doc(firestore('direcao-1'), 'alunos/inexistente/responsaveis/r1'), { nome_completo: 'Familiar' }))

    const db = firestore('admin-1')
    const addSecondaryBatch = writeBatch(db)
    addSecondaryBatch.update(doc(db, 'alunos/aluno-1'), { responsavel_principal_id: 'principal-1' })
    addSecondaryBatch.set(doc(db, 'alunos/aluno-1/responsaveis/r1'), { nome_completo: 'Familiar', ativo: true, principal: false })
    await assertSucceeds(addSecondaryBatch.commit())

    const batch = writeBatch(db)
    batch.update(doc(db, 'alunos/aluno-1'), { responsavel_principal_id: 'r1' })
    batch.update(doc(db, 'alunos/aluno-1/responsaveis/principal-1'), { principal: false, ativo: false })
    batch.update(doc(db, 'alunos/aluno-1/responsaveis/r1'), { principal: true })
    await assertSucceeds(batch.commit())

    const invalidBatch = writeBatch(db)
    invalidBatch.update(doc(db, 'alunos/aluno-1'), { responsavel_principal_id: 'inexistente' })
    await assertFails(invalidBatch.commit())

    const createStudentBatch = writeBatch(db)
    createStudentBatch.set(doc(db, 'alunos/aluno-2'), { nome_completo: 'Outro aluno', responsavel_principal_id: 'principal-2' })
    createStudentBatch.set(doc(db, 'alunos/aluno-2/responsaveis/principal-2'), { nome_completo: 'Principal', ativo: true, principal: true })
    await assertSucceeds(createStudentBatch.commit())

    const invalidStudentBatch = writeBatch(db)
    invalidStudentBatch.set(doc(db, 'alunos/aluno-3'), { nome_completo: 'Sem principal', responsavel_principal_id: 'ausente' })
    await assertFails(invalidStudentBatch.commit())
  })

  it('restringe relatório e exige pai existente para metadados de anexos', async () => {
    await assertSucceeds(setDoc(doc(firestore('pedagogia-1'), 'relatorios_pedagogicos/novo'), { status: 'rascunho', aluno_id: 'aluno-1' }))
    await assertFails(setDoc(doc(firestore('admin-1'), 'relatorios_pedagogicos/negado'), { status: 'rascunho' }))
    const db = firestore('pedagogia-1')
    const attachment = doc(db, 'relatorios_pedagogicos/rascunho-1/anexos/a1')
    await assertSucceeds(setDoc(attachment, {
      enviado_por: 'pedagogia-1', armazenamento: 'firestore', status: 'enviando',
      total_partes: 1, tamanho_bytes: 10,
    }))
    await assertSucceeds(setDoc(doc(db, 'relatorios_pedagogicos/rascunho-1/anexos/a1/chunks/000000'), {
      indice: 0, conteudo_base64: 'Y29udGV1ZG8=',
    }))
    await assertSucceeds(updateDoc(attachment, { status: 'disponivel' }))
    await assertFails(setDoc(doc(db, 'relatorios_pedagogicos/inexistente/anexos/a1'), {
      enviado_por: 'pedagogia-1', armazenamento: 'firestore', status: 'enviando', total_partes: 1, tamanho_bytes: 10,
    }))
    await assertFails(setDoc(doc(firestore('admin-1'), 'relatorios_pedagogicos/rascunho-1/anexos/a2'), {
      enviado_por: 'admin-1', armazenamento: 'firestore', status: 'enviando', total_partes: 1, tamanho_bytes: 10,
    }))
    await assertFails(setDoc(doc(firestore('pedagogia-1'), 'relatorios_pedagogicos/concluido-1/anexos/a3'), {
      enviado_por: 'pedagogia-1', armazenamento: 'firestore', status: 'enviando', total_partes: 1, tamanho_bytes: 10,
    }))
  })

  it('permite criar contatos sem permitir reescrita do snapshot histórico', async () => {
    const db = firestore('pedagogia-1')
    await assertSucceeds(setDoc(doc(db, 'contatos_familia/novo'), {
      aluno_id: 'aluno-1', responsavel_id: 'principal-1',
      responsavel_snapshot: { nome: 'Principal', parentesco: 'Mãe', contato: '0000' },
    }))
    await assertFails(setDoc(doc(db, 'contatos_familia/forjado'), {
      aluno_id: 'aluno-1', responsavel_id: 'principal-1',
      responsavel_snapshot: { nome: 'Nome forjado', parentesco: 'Mãe', contato: '0000' },
    }))
    await assertFails(updateDoc(doc(db, 'contatos_familia/contato-1'), { responsavel_snapshot: { nome: 'Nome alterado' } }))
    await assertSucceeds(getDoc(doc(db, 'contatos_familia/contato-1')))
  })

})
