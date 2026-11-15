import { beforeEach, describe, expect, it, vi } from 'vitest'

const firestore = vi.hoisted(() => ({
  getDocs: vi.fn(),
}))

vi.mock('../lib/firebase', () => ({ db: {}, isFirebaseConfigured: true }))
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, ...segments: string[]) => ({ path: segments.join('/') }),
  doc: (_db: unknown, ...segments: string[]) => ({ id: segments[segments.length - 1], path: segments.join('/') }),
  query: (ref: { path: string }, ...constraints: unknown[]) => ({ path: ref.path, constraints }),
  where: (field: string, op: string, value: unknown) => ({ field, op, value }),
  orderBy: (field: string, direction: string) => ({ field, direction }),
  limit: (value: number) => ({ limit: value }),
  getDocs: firestore.getDocs,
  getDoc: vi.fn(),
  onSnapshot: vi.fn(),
  setDoc: vi.fn(),
  updateDoc: vi.fn(),
  deleteDoc: vi.fn(),
  writeBatch: vi.fn(),
  serverTimestamp: vi.fn(),
  increment: vi.fn(),
  arrayUnion: vi.fn(),
  arrayRemove: vi.fn(),
}))

import {
  getAlunosFaltasRecorrentes,
  getDashboardMetrics,
  getTarefasDeHoje,
  getUltimasAtualizacoes,
} from './dashboardService'

type Consulta = { path: string; constraints: unknown[] }

function docSnapshot(id: string, data: Record<string, unknown>) {
  return { id, data: () => data }
}

function snapshot(docs: Record<string, unknown>[] = []) {
  return {
    size: docs.length,
    docs: docs.map((data, index) => docSnapshot(String(index), data)),
    forEach: (callback: (doc: ReturnType<typeof docSnapshot>) => void) => {
      docs.forEach((data, index) => callback(docSnapshot(String(index), data)))
    },
  }
}

function hojeLocalISO(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().split('T')[0]
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('dashboard: indicadores conferíveis', () => {
  it('calcula a frequência do mês corrente e conta justificadas como presença', async () => {
    let consulta: Consulta | undefined
    firestore.getDocs.mockImplementation(async (q: Consulta) => {
      if (q.path === 'sessoes_chamada') {
        consulta = q
        return snapshot([
          { presencas: { a: 'presente', b: 'justificado', c: 'ausente' } },
          { presencas: { d: 'presente' } },
        ])
      }
      return snapshot()
    })

    const metrics = await getDashboardMetrics()
    const hoje = hojeLocalISO()
    const inicioMes = `${hoje.slice(0, 7)}-01`

    expect(metrics.frequenciaMedia.ok && metrics.frequenciaMedia.valor).toMatchObject({
      percentual: 75,
      presentes: 2,
      justificados: 1,
      ausentes: 1,
      registros: 4,
      sessoes: 2,
      periodo: { inicio: inicioMes, fim: hoje },
    })
    expect(consulta?.constraints).toEqual(
      expect.arrayContaining([
        { field: 'data_chamada', op: '>=', value: inicioMes },
        { field: 'data_chamada', op: '<=', value: hoje },
      ]),
    )
  })

  it('devolve base vazia (não zero) quando o mês não tem chamadas', async () => {
    firestore.getDocs.mockResolvedValue(snapshot())

    const metrics = await getDashboardMetrics()

    expect(metrics.frequenciaMedia.ok && metrics.frequenciaMedia.valor).toMatchObject({
      percentual: null,
      presentes: 0,
      justificados: 0,
      ausentes: 0,
      registros: 0,
      sessoes: 0,
    })
  })

  it('só marca relatórios concluídos hoje como tarefa feita', async () => {
    let consulta: Consulta | undefined
    firestore.getDocs.mockImplementation(async (q: Consulta) => {
      if (q.path === 'relatorios_pedagogicos') {
        consulta = q
        return snapshot()
      }
      return snapshot([{ ok: true }])
    })

    const tarefas = await getTarefasDeHoje()
    expect(tarefas[2].titulo).toBe('Relatórios concluídos hoje (0)')
    expect(tarefas[2].feito).toBe(false)

    const onde = (consulta?.constraints ?? []).filter(
      (item): item is { field: string; op: string; value: unknown } =>
        Boolean(item && typeof item === 'object' && 'field' in item),
    )
    expect(onde).toEqual(
      expect.arrayContaining([{ field: 'status', op: '==', value: 'concluido' }]),
    )
    const intervalo = onde.filter((item) => item.field === 'atualizado_em')
    expect(intervalo.map((item) => item.op)).toEqual(['>=', '<'])
    intervalo.forEach((item) => expect(item.value).toBeInstanceOf(Date))
  })

  it('ignora faltas de aluno que não tem matrícula vigente na turma da chamada', async () => {
    const docsPorColecao: Record<string, Record<string, unknown>[]> = {
      sessoes_chamada: [
        {
          data_chamada: '2026-11-01',
          turma_id: 'turma-1',
          escopo: 'turma',
          presencas: { 'aluno-1': 'ausente', 'aluno-2': 'ausente' },
        },
        {
          data_chamada: '2026-11-02',
          turma_id: 'turma-1',
          escopo: 'turma',
          presencas: { 'aluno-1': 'ausente', 'aluno-2': 'ausente' },
        },
      ],
      matriculas: [
        {
          aluno_id: 'aluno-1',
          turma_id: 'turma-1',
          data_inicio: '2026-01-01',
          data_fim: null,
          status: 'ativo',
        },
        {
          aluno_id: 'aluno-2',
          turma_id: 'turma-2',
          data_inicio: '2026-01-01',
          data_fim: null,
          status: 'ativo',
        },
      ],
      aluno_oficinas: [],
      alunos: [
        { nome_completo: 'Aluno 1', turma: 'Turma 1' },
        { nome_completo: 'Aluno 2', turma: 'Turma 2' },
      ],
      turmas: [{ nome: 'Turma 1' }],
      oficinas: [],
      turma_oficinas: [],
    }
    firestore.getDocs.mockImplementation(async (q: Consulta) => snapshot(docsPorColecao[q.path] ?? []))

    const resultado = await getAlunosFaltasRecorrentes(5, 2)

    expect(resultado.alertas.map((alerta) => alerta.alunoId)).toEqual(['aluno-1'])
    expect(resultado.janela).toEqual({ sessoesLidas: 2, limiteSessoes: 200 })
  })

  it('zera a sequência quando há presença ou justificativa entre as faltas', async () => {
    const docsPorColecao: Record<string, Record<string, unknown>[]> = {
      sessoes_chamada: [
        {
          data_chamada: '2026-11-01',
          turma_id: 'turma-1',
          escopo: 'turma',
          presencas: { 'aluno-1': 'ausente' },
        },
        {
          data_chamada: '2026-11-02',
          turma_id: 'turma-1',
          escopo: 'turma',
          presencas: { 'aluno-1': 'justificado' },
        },
        {
          data_chamada: '2026-11-03',
          turma_id: 'turma-1',
          escopo: 'turma',
          presencas: { 'aluno-1': 'ausente' },
        },
      ],
      matriculas: [
        {
          aluno_id: 'aluno-1',
          turma_id: 'turma-1',
          data_inicio: '2026-01-01',
          data_fim: null,
          status: 'ativo',
        },
      ],
      aluno_oficinas: [],
      alunos: [{ nome_completo: 'Aluno 1', turma: 'Turma 1' }],
      turmas: [{ nome: 'Turma 1' }],
      oficinas: [],
      turma_oficinas: [],
    }
    firestore.getDocs.mockImplementation(async (q: Consulta) => snapshot(docsPorColecao[q.path] ?? []))

    const resultado = await getAlunosFaltasRecorrentes(5, 2)

    expect(resultado.alertas).toEqual([])
  })

  it('mantém faltas da base legada quando não há matrícula importada', async () => {
    const docsPorColecao: Record<string, Record<string, unknown>[]> = {
      sessoes_chamada: [
        {
          data_chamada: '2026-11-01',
          turma_id: 'turma-legada',
          escopo: 'turma',
          presencas: { 'aluno-legado': 'ausente' },
        },
        {
          data_chamada: '2026-11-02',
          turma_id: 'turma-legada',
          escopo: 'turma',
          presencas: { 'aluno-legado': 'ausente' },
        },
      ],
      matriculas: [],
      aluno_oficinas: [],
      alunos: [{ nome_completo: 'Aluno Legado', turma: 'Turma Legada' }],
      turmas: [{ nome: 'Turma Legada' }],
      oficinas: [],
      turma_oficinas: [],
    }
    firestore.getDocs.mockImplementation(async (q: Consulta) => snapshot(docsPorColecao[q.path] ?? []))

    const resultado = await getAlunosFaltasRecorrentes(5, 2)

    expect(resultado.alertas.map((alerta) => alerta.alunoId)).toEqual(['aluno-legado'])
  })

  it('ignora falta de oficina quando a participação terminou antes da chamada', async () => {
    const docsPorColecao: Record<string, Record<string, unknown>[]> = {
      sessoes_chamada: [
        {
          data_chamada: '2026-11-01',
          turma_id: 'turma-1',
          escopo: 'oficina',
          turma_oficina_id: 'vinculo-1',
          presencas: { 'aluno-1': 'ausente', 'aluno-2': 'ausente' },
        },
        {
          data_chamada: '2026-11-02',
          turma_id: 'turma-1',
          escopo: 'oficina',
          turma_oficina_id: 'vinculo-1',
          presencas: { 'aluno-1': 'ausente', 'aluno-2': 'ausente' },
        },
      ],
      matriculas: [
        {
          aluno_id: 'aluno-1',
          turma_id: 'turma-1',
          data_inicio: '2026-01-01',
          data_fim: null,
          status: 'ativo',
        },
        {
          aluno_id: 'aluno-2',
          turma_id: 'turma-1',
          data_inicio: '2026-01-01',
          data_fim: null,
          status: 'ativo',
        },
      ],
      aluno_oficinas: [
        {
          aluno_id: 'aluno-1',
          turma_oficina_id: 'vinculo-1',
          data_inicio: '2026-01-01',
          data_fim: '2026-10-01',
          status: 'concluido',
        },
        {
          aluno_id: 'aluno-2',
          turma_oficina_id: 'vinculo-1',
          data_inicio: '2026-01-01',
          data_fim: null,
          status: 'ativo',
        },
      ],
      alunos: [
        { nome_completo: 'Aluno 1', turma: 'Turma 1' },
        { nome_completo: 'Aluno 2', turma: 'Turma 1' },
      ],
      turmas: [{ nome: 'Turma 1' }],
      oficinas: [{ nome: 'Oficina 1' }],
      turma_oficinas: [{ oficina_id: 'oficina-1' }],
    }
    firestore.getDocs.mockImplementation(async (q: Consulta) => snapshot(docsPorColecao[q.path] ?? []))

    const resultado = await getAlunosFaltasRecorrentes(5, 2)

    expect(resultado.alertas.map((alerta) => alerta.alunoId)).toEqual(['aluno-2'])
  })

  it('ordena as últimas atualizações pela data real e usa o calendário local', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date(2026, 10, 15, 23, 30))
    const antigo = new Date(2026, 10, 15, 21, 0)
    const recente = new Date(2026, 10, 15, 22, 0)
    try {
      firestore.getDocs.mockImplementation(async (q: Consulta) => {
        if (q.path === 'registros_atividade') {
          return snapshot([
            {
              data_atividade: '2026-11-14',
              atualizado_em: { toDate: () => antigo },
              usuario_responsavel_nome: 'Equipe',
            },
          ])
        }
        if (q.path === 'sessoes_chamada') {
          return snapshot([
            {
              data_chamada: '2026-11-15',
              atualizado_em: { toDate: () => recente },
              registrado_por: 'Pedagogia',
            },
          ])
        }
        return snapshot()
      })

      const { items } = await getUltimasAtualizacoes(2)

      expect(items.map((item) => item.id)).toEqual(['ses_0', 'reg_0'])
      expect(items[0].horario).toContain('Hoje')
    } finally {
      vi.useRealTimers()
    }
  })
})
