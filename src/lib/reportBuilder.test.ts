import { describe, expect, it } from 'vitest'
import type {
  PrestacaoContasFiltros,
  RelatorioAlunoRaw,
  RelatorioAnexoRaw,
  RelatorioAtividadeRaw,
  RelatorioMatriculaRaw,
  RelatorioOficinaRaw,
  RelatorioSessaoRaw,
  RelatorioTurmaOficinaRaw,
  RelatorioTurmaRaw,
  RelatorioUsuarioRaw,
} from '../types/relatorios'
import {
  buildPrestacaoContasReport,
  buildReportFileName,
  formatDateBR,
  formatDateTimeBR,
  formatPercent,
  formatPeriodoCurto,
  secaoAtividadesAtiva,
  secaoFotosAtiva,
  secaoFrequenciaAtiva,
  validatePrestacaoContasFiltros,
} from './reportBuilder'
import type { BuildPrestacaoContasInput } from './reportBuilder'

const HOJE = new Date('2026-10-25T12:00:00')

const filtrosBase: PrestacaoContasFiltros = {
  periodoInicio: '2026-09-01',
  periodoFim: '2026-09-30',
  turmaIds: [],
  tipo: 'consolidado',
  incluirFotos: true,
}

const turmas: RelatorioTurmaRaw[] = [
  { id: 'turma-a', nome: 'Turma A', codigo: 'A', periodo: 'manha', ativo: true },
  { id: 'turma-b', nome: 'Turma B', codigo: 'B', periodo: 'tarde', ativo: true },
  { id: 'turma-c', nome: 'Turma C', codigo: 'C', periodo: 'integral', ativo: false },
]

const alunos: RelatorioAlunoRaw[] = [
  {
    id: 'aluno-ana',
    nome: 'Ana Souza',
    status: 'ativo',
    turmaId: 'turma-a',
    turmaNome: 'Turma A',
    usoImagemAutorizado: true,
  },
  {
    id: 'aluno-bruno',
    nome: 'Bruno Alves',
    status: 'Ativo',
    turmaId: 'turma-a',
    turmaNome: 'Turma A',
    usoImagemAutorizado: false,
  },
  {
    id: 'aluno-carla',
    nome: 'Carla Oliveira',
    status: 'ativo',
    turmaId: null,
    turmaNome: null,
    usoImagemAutorizado: true,
  },
  {
    id: 'aluno-diego',
    nome: 'Diego Lima',
    status: 'inativo',
    turmaId: 'turma-a',
    turmaNome: 'Turma A',
    usoImagemAutorizado: true,
  },
  {
    id: 'aluno-eva',
    nome: 'Eva Martins',
    status: 'ativo',
    turmaId: null,
    turmaNome: null,
    usoImagemAutorizado: true,
  },
]

const matriculas: RelatorioMatriculaRaw[] = [
  { alunoId: 'aluno-ana', turmaId: 'turma-a', status: 'ativo' },
  { alunoId: 'aluno-bruno', turmaId: 'turma-a', status: 'ativo' },
  { alunoId: 'aluno-carla', turmaId: 'turma-b', status: 'ativo' },
  { alunoId: 'aluno-diego', turmaId: 'turma-a', status: 'ativo' },
]

const oficinas: RelatorioOficinaRaw[] = [
  { id: 'oficina-musica', nome: 'Musicalização', categoria: 'musicalizacao' },
  { id: 'oficina-danca', nome: 'Dança', categoria: 'danca' },
]

const turmaOficinas: RelatorioTurmaOficinaRaw[] = [
  { id: 'cw-musica-a', turmaId: 'turma-a', oficinaId: 'oficina-musica', ativo: true },
  { id: 'cw-danca-b', turmaId: 'turma-b', oficinaId: 'oficina-danca', ativo: true },
]

const atividades: RelatorioAtividadeRaw[] = [
  {
    id: 'atividade-1',
    data: '2026-09-10',
    turmaId: 'turma-a',
    idsTurmaOficinas: ['cw-musica-a'],
    responsavelId: 'usuario-ana',
    observacoes: '  Roda de música com instrumentos de percussão.  ',
  },
  {
    id: 'atividade-2',
    data: '2026-09-11',
    turmaId: 'turma-b',
    idsTurmaOficinas: ['cw-danca-b'],
    responsavelId: 'usuario-bruno',
    observacoes: '',
  },
  {
    id: 'atividade-3',
    data: '2026-09-12',
    turmaId: 'turma-inexistente',
    idsTurmaOficinas: ['cw-musica-a'],
    responsavelId: 'usuario-ana',
    observacoes: 'Turma removida',
  },
  {
    id: 'atividade-4',
    data: '2026-10-01',
    turmaId: 'turma-a',
    idsTurmaOficinas: ['cw-musica-a'],
    responsavelId: 'usuario-ana',
    observacoes: 'Fora do período',
  },
]

const anexos: RelatorioAnexoRaw[] = [
  {
    id: 'foto-1',
    atividadeId: 'atividade-1',
    tipoAnexo: 'imagem',
    caminhoFirestore: 'registros_atividade/atividade-1/anexos/foto-1',
    nomeArquivo: 'roda.jpg',
    legenda: 'Roda de música',
    url: 'https://exemplo.test/foto-1.jpg',
  },
  {
    id: 'foto-2',
    atividadeId: 'atividade-1',
    tipoAnexo: 'imagem',
    caminhoFirestore: 'registros_atividade/atividade-1/anexos/foto-2',
    nomeArquivo: 'instrumentos.jpg',
    legenda: '',
    url: null,
  },
  {
    id: 'documento-1',
    atividadeId: 'atividade-1',
    tipoAnexo: 'documento',
    caminhoFirestore: 'registros_atividade/atividade-1/anexos/plano',
    nomeArquivo: 'plano.pdf',
    legenda: '',
    url: 'https://exemplo.test/plano.pdf',
  },
  {
    id: 'foto-3',
    atividadeId: 'atividade-2',
    tipoAnexo: 'imagem',
    caminhoFirestore: 'registros_atividade/atividade-2/anexos/foto-3',
    nomeArquivo: 'danca.jpg',
    legenda: 'Aquecimento',
    url: 'https://exemplo.test/foto-3.jpg',
  },
  {
    id: 'foto-4',
    atividadeId: 'atividade-4',
    tipoAnexo: 'imagem',
    caminhoFirestore: 'registros_atividade/atividade-4/anexos/foto-4',
    nomeArquivo: 'fora.jpg',
    legenda: '',
    url: 'https://exemplo.test/foto-4.jpg',
  },
]

const sessoes: RelatorioSessaoRaw[] = [
  {
    id: 'sessao-1',
    data: '2026-09-10',
    turmaId: 'turma-a',
    escopo: 'turma',
    presencas: { 'aluno-ana': 'presente', 'aluno-bruno': 'ausente' },
    observacoes: {},
  },
  {
    id: 'sessao-2',
    data: '2026-09-10',
    turmaId: 'turma-a',
    escopo: 'oficina',
    turmaOficinaId: 'cw-musica-a',
    presencas: { 'aluno-ana': 'presente' },
    observacoes: {},
  },
  {
    id: 'sessao-3',
    data: '2026-09-11',
    turmaId: 'turma-b',
    escopo: 'turma',
    presencas: { 'aluno-carla': 'presente', 'aluno-bruno': 'justificado' },
    observacoes: {},
  },
  {
    id: 'sessao-4',
    data: '2026-09-12',
    turmaId: 'turma-inexistente',
    escopo: 'turma',
    presencas: { 'aluno-ana': 'presente' },
    observacoes: {},
  },
  {
    id: 'sessao-5',
    data: '2026-10-01',
    turmaId: 'turma-a',
    escopo: 'turma',
    presencas: { 'aluno-ana': 'presente' },
    observacoes: {},
  },
]

const usuarios: RelatorioUsuarioRaw[] = [
  { id: 'usuario-ana', nome: 'Ana Profissional' },
  { id: 'usuario-bruno', nome: 'Bruno Profissional' },
]

function criarInput(overrides: Partial<BuildPrestacaoContasInput> = {}): BuildPrestacaoContasInput {
  return {
    filtros: { ...filtrosBase, ...(overrides.filtros || {}) },
    geradoEm: '2026-10-25T15:30:00.000Z',
    turmas,
    alunos,
    matriculas,
    oficinas,
    turmaOficinas,
    atividades,
    anexos,
    sessoes,
    usuarios,
    ...overrides,
  }
}

describe('buildPrestacaoContasReport', () => {
  it('consolida atividades, frequência e fotos do período', () => {
    const relatorio = buildPrestacaoContasReport(criarInput())

    expect(relatorio.periodoLabel).toBe('01/09/2026 a 30/09/2026')
    expect(relatorio.resumo).toMatchObject({
      alunosAtendidos: 3,
      alunosAtivos: 3,
      totalTurmas: 2,
      totalAtividades: 2,
      totalOficinasRealizadas: 2,
      totalSessoes: 3,
      totalFotos: 1,
      frequenciaMedia: 75,
      presentes: 3,
      ausentes: 1,
      justificados: 0,
    })
  })

  it('calcula frequência por turma e por aluno, contando justificados como comparecimento', () => {
    const relatorio = buildPrestacaoContasReport(criarInput())
    const turmaA = relatorio.turmas.find((turma) => turma.turmaId === 'turma-a')
    const turmaB = relatorio.turmas.find((turma) => turma.turmaId === 'turma-b')
    const turmaC = relatorio.turmas.find((turma) => turma.turmaId === 'turma-c')

    expect(turmaA).toMatchObject({
      sessoes: 2,
      registros: 3,
      presentes: 2,
      ausentes: 1,
      justificados: 0,
      percentual: 67,
    })
    expect(turmaA?.alunos).toEqual([
      expect.objectContaining({ alunoNome: 'Ana Souza', sessoes: 2, presentes: 2, percentual: 100 }),
      expect.objectContaining({ alunoNome: 'Bruno Alves', sessoes: 1, ausentes: 1, percentual: 0 }),
    ])

    expect(turmaB).toMatchObject({
      sessoes: 1,
      registros: 1,
      presentes: 1,
      ausentes: 0,
      justificados: 0,
      percentual: 100,
    })
    expect(turmaB?.alunos).toEqual([
      expect.objectContaining({ alunoNome: 'Carla Oliveira', presentes: 1, percentual: 100 }),
    ])

    expect(turmaC).toMatchObject({ sessoes: 0, registros: 0, percentual: 0 })
    expect(turmaC?.alunos).toEqual([])
  })

  it('usa a chamada diária para a presença da atividade e ignora chamadas de oficina', () => {
    const relatorio = buildPrestacaoContasReport(criarInput())
    const atividade1 = relatorio.atividades.find((atividade) => atividade.id === 'atividade-1')
    const atividade2 = relatorio.atividades.find((atividade) => atividade.id === 'atividade-2')

    expect(atividade1?.presenca).toEqual({ presentes: 1, total: 2 })
    expect(atividade2?.presenca).toEqual({ presentes: 1, total: 2 })
    expect(atividade1?.observacoes).toBe('Roda de música com instrumentos de percussão.')
    expect(atividade1?.responsavelNome).toBe('Ana Profissional')
    expect(atividade1?.oficinas).toEqual(['Musicalização'])
  })

  it('conta fotos pelos anexos reais e omite fotos de turma sem autorização', () => {
    const relatorio = buildPrestacaoContasReport(criarInput())
    const atividade1 = relatorio.atividades.find((atividade) => atividade.id === 'atividade-1')

    expect(relatorio.resumo.totalFotos).toBe(1)
    expect(atividade1?.fotos).toHaveLength(0)
    expect(relatorio.fotos.map((foto) => foto.id)).toEqual(['foto-3'])
    expect(relatorio.fotosOmitidasPorAutorizacao).toBe(2)
    expect(relatorio.restricaoImagem.fotosBloqueadas).toBe(2)
    expect(relatorio.avisos).toContain(
      '2 foto(s) omitida(s): não foi possível comprovar autorização de imagem para todos os alunos vinculados à turma na data da atividade.'
    )
  })

  it('ordena atividades por data e ignora registros de turma inexistente ou fora do período', () => {
    const relatorio = buildPrestacaoContasReport(criarInput())
    expect(relatorio.atividades.map((atividade) => atividade.id)).toEqual([
      'atividade-1',
      'atividade-2',
    ])
  })

  it('detecta alunos sem autorização de uso de imagem por turma', () => {
    const relatorio = buildPrestacaoContasReport(criarInput())

    expect(relatorio.restricaoImagem.possuiAlunoSemAutorizacao).toBe(true)
    expect(relatorio.restricaoImagem.turmas).toEqual([
      {
        turmaId: 'turma-a',
        turmaNome: 'Turma A',
        alunosSemAutorizacao: ['Bruno Alves'],
        fotosBloqueadas: 2,
      },
    ])
  })

  it('inclui fotos quando todos os alunos ativos têm autorização persistida', () => {
    const relatorio = buildPrestacaoContasReport(
      criarInput({
        alunos: alunos.map((aluno) =>
          aluno.id === 'aluno-bruno'
            ? { ...aluno, usoImagemAutorizado: true }
            : aluno
        ),
      })
    )

    expect(relatorio.restricaoImagem.possuiAlunoSemAutorizacao).toBe(false)
    expect(relatorio.restricaoImagem.fotosBloqueadas).toBe(0)
    expect(relatorio.resumo.totalFotos).toBe(3)
    expect(relatorio.fotos.map((foto) => foto.id)).toEqual(['foto-2', 'foto-1', 'foto-3'])
  })

  it('filtra por turma selecionada', () => {
    const relatorio = buildPrestacaoContasReport(
      criarInput({ filtros: { ...filtrosBase, turmaIds: ['turma-b'] } })
    )

    expect(relatorio.atividades.map((atividade) => atividade.id)).toEqual(['atividade-2'])
    expect(relatorio.turmas.map((turma) => turma.turmaId)).toEqual(['turma-b'])
    expect(relatorio.resumo).toMatchObject({
      totalAtividades: 1,
      totalFotos: 1,
      totalSessoes: 1,
      alunosAtendidos: 1,
      totalTurmas: 1,
      frequenciaMedia: 100,
    })
    expect(relatorio.restricaoImagem.possuiAlunoSemAutorizacao).toBe(false)
  })

  it('resolve turma pelo nome para dados legados de chamada e atividade', () => {
    const relatorio = buildPrestacaoContasReport(
      criarInput({
        atividades: [
          {
            ...atividades[0],
            turmaId: 'Turma A',
          },
        ],
        sessoes: [
          {
            ...sessoes[0],
            turmaId: 'Turma A',
          },
        ],
      })
    )

    expect(relatorio.atividades).toHaveLength(1)
    expect(relatorio.turmas.find((turma) => turma.turmaId === 'turma-a')?.sessoes).toBe(1)
    expect(relatorio.avisos).not.toContain(
      '1 atividade(s) descartada(s) por turma não identificada.'
    )
  })

  it('mantém a contagem de fotos sem emitir aviso de URL quando a seção de fotos está desativada', () => {
    const relatorio = buildPrestacaoContasReport(
      criarInput({ filtros: { ...filtrosBase, tipo: 'frequencia', incluirFotos: false } })
    )

    expect(relatorio.resumo.totalFotos).toBe(1)
    expect(relatorio.avisos.some((aviso) => aviso.includes('foto(s) sem arquivo'))).toBe(false)
  })

  it('emite avisos de integridade para turma inexistente, chamada órfã e fotos omitidas', () => {
    const relatorio = buildPrestacaoContasReport(criarInput())

    expect(relatorio.avisos).toEqual(
      expect.arrayContaining([
        '1 atividade(s) descartada(s) por turma não identificada.',
        '1 chamada(s) descartada(s) por turma não identificada.',
        '1 registro(s) de presença não contabilizado(s): a matrícula histórica não corresponde à turma na data da chamada.',
        '2 foto(s) omitida(s): não foi possível comprovar autorização de imagem para todos os alunos vinculados à turma na data da atividade.',
      ])
    )
  })

  it('usa vigência histórica das matrículas, sem somar turma atual nem aluno hoje inativo', () => {
    const relatorio = buildPrestacaoContasReport(criarInput({
      alunos: [
        { ...alunos[0], status: 'inativo', turmaId: 'turma-b' },
        { ...alunos[1], status: 'inativo', turmaId: 'turma-b' },
      ],
      matriculas: [
        { id: 'm-antiga', alunoId: 'aluno-ana', turmaId: 'turma-a', status: 'encerrada', dataInicio: '2026-01-01', dataFim: '2026-09-15' },
        { id: 'm-atual', alunoId: 'aluno-ana', turmaId: 'turma-b', status: 'ativo', dataInicio: '2026-09-16' },
      ],
      sessoes: [
        { ...sessoes[0], data: '2026-09-10', turmaId: 'turma-a', presencas: { 'aluno-ana': 'presente' } },
        { ...sessoes[0], id: 'sessao-transf', data: '2026-09-20', turmaId: 'turma-b', presencas: { 'aluno-ana': 'presente' } },
      ],
      atividades: [],
      anexos: [],
    }))

    expect(relatorio.turmas.find((turma) => turma.turmaId === 'turma-a')?.alunos[0]).toMatchObject({ alunoId: 'aluno-ana', sessoes: 1 })
    expect(relatorio.turmas.find((turma) => turma.turmaId === 'turma-b')?.alunos[0]).toMatchObject({ alunoId: 'aluno-ana', sessoes: 1 })
    expect(relatorio.turmas.find((turma) => turma.turmaId === 'turma-b')?.alunos.some((aluno) => aluno.alunoId === 'aluno-bruno')).toBe(false)
  })

  it('avisa quando uma turma selecionada não existe', () => {
    const relatorio = buildPrestacaoContasReport(
      criarInput({ filtros: { ...filtrosBase, turmaIds: ['turma-fantasma'] } })
    )

    expect(relatorio.turmas).toEqual([])
    expect(relatorio.avisos).toContain(
      '1 turma(s) selecionada(s) não foi(ram) encontrada(s) no cadastro.'
    )
  })

  it('inclui alunos ativos sem registro de chamada como "sem registro"', () => {
    const relatorio = buildPrestacaoContasReport(
      criarInput({
        sessoes: [
          {
            id: 'sessao-a',
            data: '2026-09-10',
            turmaId: 'turma-a',
            escopo: 'turma',
            presencas: { 'aluno-ana': 'presente' },
            observacoes: {},
          },
        ],
      })
    )
    const turmaA = relatorio.turmas.find((turma) => turma.turmaId === 'turma-a')
    const bruno = turmaA?.alunos.find((aluno) => aluno.alunoId === 'aluno-bruno')

    expect(bruno).toMatchObject({ semRegistro: true, sessoes: 0, percentual: 0 })
    expect(turmaA).toMatchObject({ registros: 1, percentual: 100 })
  })

  it('usa o nome da turma como fallback quando o turma_id do aluno está desatualizado', () => {
    const relatorio = buildPrestacaoContasReport(
      criarInput({
        alunos: [
          ...alunos,
          {
            id: 'aluno-fallback',
            nome: 'Fernanda Rocha',
            status: 'ativo',
            turmaId: 'turma-removida',
            turmaNome: 'Turma B',
            usoImagemAutorizado: true,
          },
        ],
      })
    )
    const turmaB = relatorio.turmas.find((turma) => turma.turmaId === 'turma-b')

    expect(turmaB?.alunos.map((aluno) => aluno.alunoNome)).toContain('Fernanda Rocha')
    expect(relatorio.resumo.alunosAtivos).toBe(4)
  })
})

describe('validatePrestacaoContasFiltros', () => {
  it('aceita um período válido de até 366 dias', () => {
    expect(validatePrestacaoContasFiltros(filtrosBase, HOJE)).toBeNull()
    expect(
      validatePrestacaoContasFiltros(
        { ...filtrosBase, periodoInicio: '2025-01-01', periodoFim: '2026-01-01' },
        HOJE
      )
    ).toBeNull()
  })

  it('rejeita datas inválidas, invertidas, futuras e períodos longos', () => {
    expect(
      validatePrestacaoContasFiltros({ ...filtrosBase, periodoInicio: '' }, HOJE)
    ).toBe('Informe uma data inicial válida.')
    expect(
      validatePrestacaoContasFiltros(
        { ...filtrosBase, periodoInicio: '2026-09-31' },
        HOJE
      )
    ).toBe('Informe uma data inicial válida.')
    expect(
      validatePrestacaoContasFiltros(
        { ...filtrosBase, periodoInicio: '2026-09-30', periodoFim: '2026-09-01' },
        HOJE
      )
    ).toBe('A data inicial não pode ser posterior à data final.')
    expect(
      validatePrestacaoContasFiltros({ ...filtrosBase, periodoFim: '2026-10-26' }, HOJE)
    ).toBe('A data final não pode estar no futuro.')
    expect(
      validatePrestacaoContasFiltros(
        { ...filtrosBase, periodoInicio: '2025-01-01', periodoFim: '2026-01-02' },
        HOJE
      )
    ).toBe('O período máximo permitido é de 366 dias.')
  })
})

describe('helpers de relatório', () => {
  it('formata datas, percentuais e nome do arquivo', () => {
    expect(formatDateBR('2026-09-10')).toBe('10/09/2026')
    expect(formatDateBR('')).toBe('—')
    expect(formatPercent(79.6)).toBe('80%')
    expect(formatPeriodoCurto('manha')).toBe('Manhã')
    expect(formatPeriodoCurto('Tarde')).toBe('Tarde')
    expect(formatPeriodoCurto('')).toBe('')
    expect(formatDateTimeBR('2026-10-25T15:30:00.000Z')).toMatch(/25\/10\/2026/)
    expect(buildReportFileName(filtrosBase)).toBe(
      'prestacao-contas_2026-09-01_a_2026-09-30.pdf'
    )
  })

  it('define as seções exibidas por tipo de relatório', () => {
    expect(secaoAtividadesAtiva('consolidado')).toBe(true)
    expect(secaoAtividadesAtiva('atividades')).toBe(true)
    expect(secaoAtividadesAtiva('frequencia')).toBe(false)
    expect(secaoFrequenciaAtiva('atividades')).toBe(false)
    expect(secaoFrequenciaAtiva('frequencia')).toBe(true)
    expect(secaoFotosAtiva({ ...filtrosBase, tipo: 'fotos', incluirFotos: false })).toBe(true)
    expect(secaoFotosAtiva({ ...filtrosBase, tipo: 'frequencia', incluirFotos: true })).toBe(false)
    expect(secaoFotosAtiva({ ...filtrosBase, tipo: 'consolidado', incluirFotos: false })).toBe(false)
  })
})
