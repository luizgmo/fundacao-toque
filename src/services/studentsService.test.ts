import { describe, expect, it } from 'vitest'
import { docToStudent } from './studentsService'

describe('docToStudent · consentimento de imagem', () => {
  it('lê a autorização e a data do consentimento persistidas no aluno', () => {
    const student = docToStudent('aluno-1', {
      nome_completo: 'Aluno Teste',
      status: 'ativo',
      uso_imagem_autorizado: true,
      consentimento_imagem_em: { seconds: 1767225600, nanoseconds: 0 },
      tratamento_dados_autorizado: true,
    })

    expect(student.usoImagemAutorizado).toBe(true)
    expect(student.consentimentoImagemEm).toBe('2026-01-01T00:00:00.000Z')
    expect(student.tratamentoDadosAutorizado).toBe(true)
  })

  it('não infere consentimento quando os campos não estão persistidos', () => {
    const student = docToStudent('aluno-2', {
      nome_completo: 'Aluno Teste',
      status: 'ativo',
    })

    expect(student.usoImagemAutorizado).toBe(false)
    expect(student.consentimentoImagemEm).toBeUndefined()
    expect(student.tratamentoDadosAutorizado).toBe(false)
  })

  it('aceita data de consentimento em ISO', () => {
    const student = docToStudent('aluno-3', {
      nome_completo: 'Aluno Teste',
      status: 'ativo',
      uso_imagem_autorizado: true,
      consentimento_imagem_em: '2026-05-04T10:00:00.000Z',
    })

    expect(student.consentimentoImagemEm).toBe('2026-05-04T10:00:00.000Z')
  })
})
