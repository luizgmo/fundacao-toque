import { describe, expect, it, vi } from 'vitest'

vi.mock('../../lib/firebase', () => ({ db: {}, isFirebaseConfigured: true }))

import { alunosDaChamada, alunosElegiveis, hojeLocalISO, montarPresencas, sessaoChamadaId } from './chamada'
import type { Student } from '../alunos/students-data'
import type { AlunoOficina } from '../../types/oficinas'
import type { Turma } from '../../types/turmas'

const aluno = (id: string, extra: Partial<Student> = {}) =>
  ({ id, name: id, turma: 'Turma A', turmaId: 'turma-a', status: 'Ativo', ...extra }) as Student

const turma = { id: 'turma-a', nome: 'Turma A' } as Turma

const participa = (alunoId: string, extra: Partial<AlunoOficina> = {}): AlunoOficina => ({
  id: `${alunoId}__v1`,
  alunoId,
  turmaOficinaId: 'turma-a__oficina-1',
  dataInicio: '2026-01-01',
  status: 'ativo',
  nivelSuporte: '',
  consideracoesPedagogicas: '',
  ...extra,
})

describe('sessaoChamadaId', () => {
  it('é determinístico e separa chamada geral de chamada de oficina', () => {
    const geral = sessaoChamadaId({ data: '2026-11-10', turmaId: 'turma-a', escopo: 'turma' })
    const oficina = sessaoChamadaId({
      data: '2026-11-10',
      turmaId: 'turma-a',
      escopo: 'oficina',
      turmaOficinaId: 'turma-a__oficina-1',
    })
    expect(geral).toBe('2026-11-10_turma-a_geral')
    expect(oficina).toBe('2026-11-10_turma-a_turma-a__oficina-1')
    expect(sessaoChamadaId({ data: '2026-11-10', turmaId: 'turma-a', escopo: 'turma' })).toBe(geral)
  })

  it('ignora o vínculo na chamada geral e exige vínculo na de oficina', () => {
    expect(sessaoChamadaId({ data: '2026-11-10', turmaId: 'turma-a', escopo: 'turma', turmaOficinaId: 'x' })).toBe(
      '2026-11-10_turma-a_geral'
    )
    expect(() => sessaoChamadaId({ data: '2026-11-10', turmaId: 'turma-a', escopo: 'oficina' })).toThrow()
    expect(() => sessaoChamadaId({ data: '10/11/2026', turmaId: 'turma-a', escopo: 'turma' })).toThrow()
  })
})

describe('hojeLocalISO', () => {
  it('usa a data local, não UTC', () => {
    const noite = new Date(2026, 10, 10, 23, 30) // 10/11 às 23h30 no fuso local
    expect(hojeLocalISO(noite)).toBe('2026-11-10')
  })
})

describe('alunosElegiveis', () => {
  const students = [aluno('ana'), aluno('bia'), aluno('caio', { status: 'Inativo' }), aluno('davi', { turmaId: 'turma-b' })]

  it('chamada geral: alunos ativos da turma', () => {
    const ids = alunosElegiveis({ students, turma, escopo: 'turma', alunoOficinas: [], data: '2026-11-10' }).map((s) => s.id)
    expect(ids).toEqual(['ana', 'bia'])
  })

  it('chamada de oficina: só participantes do vínculo vigentes na data', () => {
    const alunoOficinas = [
      participa('ana'),
      participa('bia', { status: 'cancelado', dataFim: '2026-11-01' }),
      participa('caio'), // inativo
      participa('davi'), // outra turma
      participa('ana', { id: 'outra', turmaOficinaId: 'turma-a__oficina-2' }),
    ]
    const params = { students, turma, escopo: 'oficina' as const, turmaOficinaId: 'turma-a__oficina-1', alunoOficinas }
    expect(alunosElegiveis({ ...params, data: '2026-11-10' }).map((s) => s.id)).toEqual(['ana'])
    // antes do cancelamento a Bia ainda participava
    expect(alunosElegiveis({ ...params, data: '2026-10-20' }).map((s) => s.id)).toEqual(['ana', 'bia'])
    // antes do início ninguém participava
    expect(alunosElegiveis({ ...params, data: '2025-12-31' })).toEqual([])
  })
})

describe('reabrir e salvar a chamada', () => {
  it('lista elegíveis e quem já consta na sessão salva', () => {
    const lista = alunosDaChamada([aluno('bia')], [aluno('ana', { turmaId: 'turma-b' }), aluno('bia')], {
      ana: { status: 'ausente', observation: '' },
    })
    expect(lista.map((x) => [x.student.id, x.elegivel])).toEqual([
      ['ana', false],
      ['bia', true],
    ])
  })

  it('grava todos os elegíveis (independente da busca) e preserva registros salvos de não elegíveis', () => {
    const salvos = {
      ana: { status: 'ausente' as const, observation: 'Faltou' },
      saiu: { status: 'justificado' as const, observation: 'Transferido' },
    }
    const naTela = {
      ana: { status: 'justificado' as const, observation: ' Atestado ' },
      bia: { status: 'ausente' as const, observation: '' },
    }
    expect(montarPresencas([aluno('ana'), aluno('bia'), aluno('caio')], naTela, salvos)).toEqual({
      ana: { status: 'justificado', observation: 'Atestado' },
      bia: { status: 'ausente', observation: '' },
      caio: { status: 'presente', observation: '' },
      saiu: { status: 'justificado', observation: 'Transferido' },
    })
  })
})
