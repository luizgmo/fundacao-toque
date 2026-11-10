import { describe, expect, it } from 'vitest'
import {
  formatHorarios,
  validarHorarios,
  validarResponsaveisVinculo,
  vinculoDoPar,
  vinculoPrevistoEm,
  vinculosAtivosDaTurma,
} from './oficinas'
import type { HorarioOficina, Oficina, TurmaOficina } from './oficinas'

const h = (extra: Partial<HorarioOficina> = {}): HorarioOficina => ({
  diaSemana: 1,
  horaInicio: '08:00',
  horaFim: '09:00',
  ...extra,
})

const vinculo = (extra: Partial<TurmaOficina> = {}): TurmaOficina => ({
  id: 'turma-a__oficina-1',
  turmaId: 'turma-a',
  oficinaId: 'oficina-1',
  idsUsuariosResponsaveis: ['u1'],
  ativo: true,
  horarios: [h()],
  ...extra,
})

const oficina = (id: string, extra: Partial<Oficina> = {}): Oficina => ({
  id,
  nome: id,
  categoria: 'outra',
  descricao: '',
  idsUsuariosResponsaveis: [],
  ativo: true,
  ...extra,
})

describe('validarHorarios', () => {
  it('aceita horários válidos, incluindo domingo (7) e vigência', () => {
    expect(validarHorarios([h(), h({ diaSemana: 7, validoDe: '2026-02-01', validoAte: '2026-12-31' })])).toBeNull()
  })

  it.each([
    ['sem horários', []],
    ['dia 0', [h({ diaSemana: 0 })]],
    ['dia 8', [h({ diaSemana: 8 })]],
    ['hora fora de HH:mm', [h({ horaInicio: '8:00' })]],
    ['hora 24:00', [h({ horaFim: '24:00' })]],
    ['início igual ao fim', [h({ horaInicio: '09:00', horaFim: '09:00' })]],
    ['início depois do fim', [h({ horaInicio: '10:00', horaFim: '09:00' })]],
    ['data inexistente', [h({ validoDe: '2026-02-30' })]],
    ['vigência invertida', [h({ validoDe: '2026-06-01', validoAte: '2026-05-31' })]],
    ['sobreposição no mesmo dia', [h(), h({ horaInicio: '08:30', horaFim: '10:00' })]],
  ])('rejeita %s', (_nome, horarios) => {
    expect(validarHorarios(horarios)).not.toBeNull()
  })

  it('permite o mesmo horário no mesmo dia quando as vigências não se cruzam', () => {
    expect(
      validarHorarios([h({ validoAte: '2026-06-30' }), h({ validoDe: '2026-07-01', horaInicio: '08:30' })])
    ).toBeNull()
  })
})

describe('validarResponsaveisVinculo', () => {
  it('exige ao menos um responsável', () => {
    expect(validarResponsaveisVinculo([])).not.toBeNull()
    expect(validarResponsaveisVinculo(['u1'])).toBeNull()
  })
})

describe('vínculos para novos registros', () => {
  it('lista só vínculos ativos da turma com oficina ativa', () => {
    const vinculos = [
      vinculo(),
      vinculo({ id: 'inativo', oficinaId: 'oficina-2', ativo: false }),
      vinculo({ id: 'oficina-inativa', oficinaId: 'oficina-3' }),
      vinculo({ id: 'outra-turma', turmaId: 'turma-b' }),
    ]
    const oficinas = [oficina('oficina-1'), oficina('oficina-2'), oficina('oficina-3', { ativo: false })]
    expect(vinculosAtivosDaTurma(vinculos, oficinas, 'turma-a').map((x) => x.vinculo.id)).toEqual([
      'turma-a__oficina-1',
    ])
  })

  it('prevê a oficina pelo dia da semana e pela vigência', () => {
    const v = vinculo({ horarios: [h({ diaSemana: 2, validoDe: '2026-11-01', validoAte: '2026-11-30' })] })
    expect(vinculoPrevistoEm(v, '2026-11-10')).toBe(true) // terça
    expect(vinculoPrevistoEm(v, '2026-11-11')).toBe(false) // quarta
    expect(vinculoPrevistoEm(v, '2026-12-01')).toBe(false) // terça, fora da vigência
  })

  it('encontra o vínculo do par mesmo com ID fora do padrão, preferindo o ativo', () => {
    const vinculos = [
      vinculo({ id: 'legado', ativo: false, inativadoEm: '2026-01-10' }),
      vinculo({ id: 'seed-cw-1' }),
    ]
    expect(vinculoDoPar(vinculos, 'turma-a', 'oficina-1')?.id).toBe('seed-cw-1')
    expect(vinculoDoPar([vinculos[0]], 'turma-a', 'oficina-1')?.id).toBe('legado')
    expect(vinculoDoPar(vinculos, 'turma-a', 'oficina-9')).toBeUndefined()
  })
})

describe('formatHorarios', () => {
  it('agrupa dias com o mesmo horário e mostra horários diferentes e vigência', () => {
    expect(
      formatHorarios([
        h({ diaSemana: 3 }),
        h({ diaSemana: 1 }),
        h({ diaSemana: 5, horaInicio: '14:00', horaFim: '15:30', validoAte: '2026-06-30' }),
      ])
    ).toBe('Seg/Qua 08:00–09:00 · Sex 14:00–15:30 (até 30/06/2026)')
  })
})
