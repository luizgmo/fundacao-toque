import { readFileSync } from 'node:fs'
import { afterAll, beforeAll, beforeEach, describe, it } from 'vitest'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
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
      setDoc(doc(db, 'alunos/aluno-1/documentos/ficha-medica'), { tipo_documento: 'ficha_medica', data_url: 'data:application/pdf;base64,AA==', tamanho_bytes: 1 }),
      setDoc(doc(db, 'alunos/aluno-1/documentos/matricula'), { tipo_documento: 'ficha_matricula', data_url: 'data:application/pdf;base64,AA==', tamanho_bytes: 1 }),
      setDoc(doc(db, 'registros_atividade/atividade-1'), { turma_id: 'turma-1' }),
      setDoc(doc(db, 'turmas/turma-1'), { nome: 'Turma 1', ativo: true }),
      setDoc(doc(db, 'oficinas/oficina-1'), { nome: 'Oficina 1', ativo: true }),
      setDoc(doc(db, 'turma_oficinas/turma-1__oficina-1'), {
        turma_id: 'turma-1', oficina_id: 'oficina-1', ids_usuarios_responsaveis: ['pedagogia-1'], ativo: true,
        horarios: [{ dia_semana: 2, hora_inicio: '08:00', hora_fim: '09:00' }],
      }),
      setDoc(doc(db, 'turma_oficinas/legado-sem-horario'), {
        turma_id: 'turma-1', oficina_id: 'oficina-legada', ids_usuarios_responsaveis: [], ativo: true, horarios: [],
      }),
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

// Metadados válidos de um anexo de 10 bytes (1 parte), como o app grava
function metadadosAnexo(uid: string, extra: Record<string, unknown> = {}) {
  return {
    tipo_anexo: 'imagem', armazenamento: 'firestore', status: 'enviando', total_partes: 1, tamanho_bytes: 10,
    nome_arquivo_original: 'foto.jpg', tipo_conteudo: 'image/jpeg', legenda: null, enviado_por: uid,
    enviado_em: serverTimestamp(),
    ...extra,
  }
}

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

  it('restringe documentos médicos à Direção e Pedagogia', async () => {
    await assertSucceeds(getDoc(doc(firestore('direcao-1'), 'alunos/aluno-1/documentos/ficha-medica')))
    await assertSucceeds(getDoc(doc(firestore('pedagogia-1'), 'alunos/aluno-1/documentos/ficha-medica')))
    await assertFails(getDoc(doc(firestore('admin-1'), 'alunos/aluno-1/documentos/ficha-medica')))
    await assertSucceeds(getDoc(doc(firestore('admin-1'), 'alunos/aluno-1/documentos/matricula')))
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
    await assertSucceeds(setDoc(attachment, metadadosAnexo('pedagogia-1', { tipo_conteudo: 'application/pdf', tipo_anexo: 'documento' })))
    await assertSucceeds(setDoc(doc(db, 'relatorios_pedagogicos/rascunho-1/anexos/a1/chunks/000000'), {
      indice: 0, conteudo_base64: 'Y29udGV1ZG8=',
    }))
    await assertSucceeds(updateDoc(attachment, { status: 'disponivel' }))
    await assertFails(setDoc(doc(db, 'relatorios_pedagogicos/inexistente/anexos/a1'), metadadosAnexo('pedagogia-1')))
    await assertFails(setDoc(doc(firestore('admin-1'), 'relatorios_pedagogicos/rascunho-1/anexos/a2'), metadadosAnexo('admin-1')))
    await assertFails(setDoc(doc(firestore('pedagogia-1'), 'relatorios_pedagogicos/concluido-1/anexos/a3'), metadadosAnexo('pedagogia-1')))
    // No rascunho, quem enviou pode excluir o próprio anexo já disponível
    await assertSucceeds(deleteDoc(doc(db, 'relatorios_pedagogicos/rascunho-1/anexos/a1/chunks/000000')))
    await assertSucceeds(deleteDoc(attachment))
  })

  describe('anexos de registros de atividade', () => {
    const registro = 'registros_atividade/atividade-1'
    const anexoPath = `${registro}/anexos/f1`

    it('valida tipo, tamanho, partes e nome no cliente e nas regras', async () => {
      const db = firestore('pedagogia-1')
      await assertSucceeds(setDoc(doc(db, anexoPath), metadadosAnexo('pedagogia-1')))
      for (const invalido of [
        { tipo_conteudo: 'application/pdf', tipo_anexo: 'documento' }, // PDF não é foto de atividade
        { tipo_conteudo: 'image/gif' },
        { tamanho_bytes: 5 * 1024 * 1024 + 1, total_partes: 9 },
        { tamanho_bytes: 700000, total_partes: 1 }, // total_partes inconsistente
        { tipo_anexo: 'documento' },
        { status: 'disponivel' },
        { nome_arquivo_original: 'x'.repeat(201) },
        { extra: true },
      ]) {
        await assertFails(setDoc(doc(db, `${registro}/anexos/invalido`), metadadosAnexo('pedagogia-1', invalido)))
      }
      // parte com ID fora do padrão, índice divergente ou acima do total
      await assertFails(setDoc(doc(db, `${anexoPath}/chunks/0`), { indice: 0, conteudo_base64: 'AA==' }))
      await assertFails(setDoc(doc(db, `${anexoPath}/chunks/000001`), { indice: 0, conteudo_base64: 'AA==' }))
      await assertFails(setDoc(doc(db, `${anexoPath}/chunks/000001`), { indice: 1, conteudo_base64: 'AA==' }))
      // só quem iniciou o envio grava partes
      await assertFails(setDoc(doc(firestore('admin-1'), `${anexoPath}/chunks/000000`), { indice: 0, conteudo_base64: 'AA==' }))
      await assertSucceeds(setDoc(doc(db, `${anexoPath}/chunks/000000`), { indice: 0, conteudo_base64: 'AA==' }))
    })

    it('concluir o envio exige +1 em total_anexos no mesmo batch, uma única vez', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore()
        await updateDoc(doc(adminDb, registro), { total_anexos: 2 })
        await setDoc(doc(adminDb, anexoPath), { ...metadadosAnexo('pedagogia-1'), enviado_em: new Date() })
      })
      const db = firestore('pedagogia-1')
      await assertFails(updateDoc(doc(db, anexoPath), { status: 'disponivel' }))
      const errado = writeBatch(db)
      errado.update(doc(db, anexoPath), { status: 'disponivel' })
      errado.update(doc(db, registro), { total_anexos: 4 })
      await assertFails(errado.commit())
      const certo = writeBatch(db)
      certo.update(doc(db, anexoPath), { status: 'disponivel' })
      certo.update(doc(db, registro), { total_anexos: 3 })
      await assertSucceeds(certo.commit())
      // segunda conclusão (reenvio) não passa
      const repetido = writeBatch(db)
      repetido.update(doc(db, anexoPath), { status: 'disponivel' })
      repetido.update(doc(db, registro), { total_anexos: 4 })
      await assertFails(repetido.commit())
    })

    it('excluir anexo disponível exige -1 no contador; registro em exclusão não recebe anexos', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore()
        await updateDoc(doc(adminDb, registro), { total_anexos: 1 })
        await setDoc(doc(adminDb, anexoPath), { ...metadadosAnexo('pedagogia-1'), status: 'disponivel', enviado_em: new Date() })
      })
      const direcao = firestore('direcao-1')
      await assertFails(deleteDoc(doc(firestore('pedagogia-1'), anexoPath)))
      await assertFails(deleteDoc(doc(direcao, anexoPath)))
      const batch = writeBatch(direcao)
      batch.delete(doc(direcao, anexoPath))
      batch.update(doc(direcao, registro), { total_anexos: 0 })
      await assertSucceeds(batch.commit())

      await updateDoc(doc(firestore('admin-1'), registro), { exclusao: { status: 'incompleta' } })
      await assertFails(setDoc(doc(firestore('pedagogia-1'), `${registro}/anexos/f2`), metadadosAnexo('pedagogia-1')))
    })
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

  it('restringe relatórios gerados à Direção e preserva filtros após a criação', async () => {
    const relatorio = {
      tipo_relatorio: 'prestacao_contas',
      status: 'processando',
      gerado_por: 'direcao-1',
      periodo_inicio: '2026-01-01',
      periodo_fim: '2026-01-31',
      filtros: { tipo: 'geral', turmaIds: [], incluirFotos: true },
      gerado_em: serverTimestamp(),
    }

    await assertFails(
      setDoc(doc(firestore('pedagogia-1'), 'relatorios_gerados/pedagogia'), relatorio)
    )
    await assertFails(
      setDoc(doc(firestore('direcao-1'), 'relatorios_gerados/forjado'), {
        ...relatorio,
        gerado_por: 'pedagogia-1',
      })
    )
    await assertFails(
      setDoc(doc(firestore('direcao-1'), 'relatorios_gerados/concluido-direto'), {
        ...relatorio,
        status: 'concluido',
      })
    )

    const db = firestore('direcao-1')
    await assertSucceeds(setDoc(doc(db, 'relatorios_gerados/r1'), relatorio))
    await assertFails(getDoc(doc(firestore('pedagogia-1'), 'relatorios_gerados/r1')))

    await assertFails(
      updateDoc(doc(db, 'relatorios_gerados/r1'), { periodo_fim: '2026-02-28' })
    )
    await assertFails(
      updateDoc(doc(db, 'relatorios_gerados/r1'), {
        status: 'concluido',
        gerado_em: serverTimestamp(),
        gerado_por: 'pedagogia-1',
      })
    )
    await assertSucceeds(
      updateDoc(doc(db, 'relatorios_gerados/r1'), {
        status: 'concluido',
        gerado_em: serverTimestamp(),
      })
    )
    await assertFails(
      updateDoc(doc(db, 'relatorios_gerados/r1'), {
        status: 'processando',
        gerado_em: serverTimestamp(),
      })
    )
  })

  describe('turma_oficinas', () => {
    const vinculo = (extra: Record<string, unknown> = {}) => ({
      turma_id: 'turma-1', oficina_id: 'oficina-1', ids_usuarios_responsaveis: ['pedagogia-1'], ativo: true,
      horarios: [{ dia_semana: 7, hora_inicio: '08:00', hora_fim: '09:30', valido_de: '2026-02-01', valido_ate: '2026-12-31' }],
      ...extra,
    })

    beforeEach(async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await deleteDoc(doc(context.firestore(), 'turma_oficinas/turma-1__oficina-1'))
      })
    })

    it('cria vínculo válido apenas com o ID determinístico turma__oficina', async () => {
      const db = firestore('admin-1')
      await assertSucceeds(setDoc(doc(db, 'turma_oficinas/turma-1__oficina-1'), vinculo()))
      await assertFails(setDoc(doc(db, 'turma_oficinas/outro-id'), vinculo()))
    })

    it('exige turma e oficina existentes', async () => {
      const db = firestore('admin-1')
      await assertFails(setDoc(doc(db, 'turma_oficinas/turma-x__oficina-1'), vinculo({ turma_id: 'turma-x' })))
    })

    it('rejeita horários fora do formato da modelagem', async () => {
      const db = firestore('admin-1')
      const ref = doc(db, 'turma_oficinas/turma-1__oficina-1')
      const h = { dia_semana: 1, hora_inicio: '08:00', hora_fim: '09:00' }
      await assertFails(setDoc(ref, vinculo({ horarios: [] })))
      await assertFails(setDoc(ref, vinculo({ horarios: [{ ...h, dia_semana: 0 }] })))
      await assertFails(setDoc(ref, vinculo({ horarios: [{ ...h, dia_semana: 8 }] })))
      await assertFails(setDoc(ref, vinculo({ horarios: [{ ...h, hora_inicio: '8:00' }] })))
      await assertFails(setDoc(ref, vinculo({ horarios: [{ ...h, hora_fim: '24:00' }] })))
      await assertFails(setDoc(ref, vinculo({ horarios: [{ ...h, hora_inicio: '09:00', hora_fim: '09:00' }] })))
      await assertFails(setDoc(ref, vinculo({ horarios: [{ ...h, valido_de: '2026-05-01', valido_ate: '2026-04-30' }] })))
      await assertFails(setDoc(ref, vinculo({ horarios: [h, { ...h, dia_semana: 3, hora_fim: '07:00' }] })))
      await assertFails(setDoc(ref, vinculo({ ids_usuarios_responsaveis: [] })))
      await assertSucceeds(setDoc(ref, vinculo({ horarios: [h, { ...h, dia_semana: 3 }] })))
    })

    it('permite inativar (inclusive vínculo antigo sem horário), mas não apagar nem trocar o par', async () => {
      const db = firestore('pedagogia-1')
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), 'turma_oficinas/turma-1__oficina-1'), vinculo())
      })
      const ref = doc(db, 'turma_oficinas/turma-1__oficina-1')
      await assertFails(updateDoc(ref, { oficina_id: 'outra' }))
      await assertFails(deleteDoc(ref))
      await assertSucceeds(updateDoc(ref, { ativo: false, inativado_em: '2026-11-10' }))
      await assertSucceeds(updateDoc(doc(db, 'turma_oficinas/legado-sem-horario'), { ativo: false }))
    })
  })


  describe('sessoes_chamada', () => {
    const geral = (extra: Record<string, unknown> = {}) => ({
      data_chamada: '2026-11-10', turma_id: 'turma-1', escopo: 'turma', turma_oficina_id: null,
      presencas: { 'aluno-1': 'presente', 'aluno-2': 'justificado' }, observacoes: { 'aluno-2': 'Atestado' },
      registrado_por: 'Pedagogia', versao: 1,
      ...extra,
    })
    const oficina = (extra: Record<string, unknown> = {}) =>
      geral({ escopo: 'oficina', turma_oficina_id: 'turma-1__oficina-1', ...extra })

    it('cria a sessão geral e a de oficina como documentos distintos com ID determinístico', async () => {
      const db = firestore('admin-1')
      await assertSucceeds(setDoc(doc(db, 'sessoes_chamada/2026-11-10_turma-1_geral'), geral()))
      await assertSucceeds(setDoc(doc(db, 'sessoes_chamada/2026-11-10_turma-1_turma-1__oficina-1'), oficina()))
      await assertFails(setDoc(doc(db, 'sessoes_chamada/chamada-aleatoria'), geral()))
      await assertFails(setDoc(doc(db, 'sessoes_chamada/2026-11-10_turma-1_geral-2'), geral()))
    })

    it('rejeita contexto inconsistente e status desconhecido', async () => {
      const db = firestore('admin-1')
      const id = 'sessoes_chamada/2026-11-10_turma-1_geral'
      await assertFails(setDoc(doc(db, id), geral({ turma_oficina_id: 'turma-1__oficina-1' })))
      await assertFails(setDoc(doc(db, id), geral({ presencas: { 'aluno-1': 'atrasado' } })))
      await assertFails(setDoc(doc(db, id), geral({ versao: 2 })))
      await assertFails(setDoc(doc(db, 'sessoes_chamada/2026-11-10_turma-x_geral'), geral({ turma_id: 'turma-x' })))
      // vínculo de outra turma não serve para a chamada desta turma
      await assertFails(setDoc(doc(db, 'sessoes_chamada/2026-11-10_turma-1_legado-sem-horario'),
        oficina({ turma_oficina_id: 'legado-sem-horario', turma_id: 'turma-2' })))
    })

    it('exige vínculo ativo da mesma turma para criar chamada de oficina', async () => {
      const db = firestore('admin-1')
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await updateDoc(doc(context.firestore(), 'turma_oficinas/turma-1__oficina-1'), { ativo: false })
      })
      await assertFails(setDoc(doc(db, 'sessoes_chamada/2026-11-10_turma-1_turma-1__oficina-1'), oficina()))
    })

    it('atualiza só com a versão seguinte e sem mudar o contexto; apagar só a Direção', async () => {
      const ref = 'sessoes_chamada/2026-11-10_turma-1_geral'
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await setDoc(doc(context.firestore(), ref), geral())
      })
      const db = firestore('pedagogia-1')
      await assertFails(setDoc(doc(db, ref), geral({ versao: 1 })))
      await assertFails(setDoc(doc(db, ref), geral({ versao: 3 })))
      await assertFails(setDoc(doc(db, ref), geral({ versao: 2, data_chamada: '2026-11-11' })))
      await assertFails(setDoc(doc(db, ref), oficina({ versao: 2 })))
      await assertSucceeds(setDoc(doc(db, ref), geral({ versao: 2, presencas: { 'aluno-1': 'ausente' } })))
      await assertFails(deleteDoc(doc(db, ref)))
      await assertSucceeds(deleteDoc(doc(firestore('direcao-1'), ref)))
    })

    it('aceita atualizar sessão antiga sem campo versao', async () => {
      const ref = 'sessoes_chamada/legada'
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const { versao: _versao, ...semVersao } = geral()
        void _versao
        await setDoc(doc(context.firestore(), ref), semVersao)
      })
      await assertSucceeds(setDoc(doc(firestore('admin-1'), ref), geral({ versao: 1 })))
    })
  })

})
