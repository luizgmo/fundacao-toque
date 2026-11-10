import { describe, expect, it } from 'vitest'
import type { RelatorioPrestacaoDados } from '../types/relatorios'
import { generatePrestacaoContasPdf } from './prestacaoContasPdf'
import { buildPrintHtml } from './prestacaoContasPrint'

const PNG_1X1 =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=='

function criarDados(
  overrides: Partial<RelatorioPrestacaoDados> = {}
): RelatorioPrestacaoDados {
  return {
    filtros: {
      periodoInicio: '2026-09-01',
      periodoFim: '2026-09-30',
      turmaIds: [],
      tipo: 'consolidado',
      incluirFotos: true,
      confirmacaoImagem: true,
    },
    geradoEm: '2026-10-25T15:30:00.000Z',
    periodoLabel: '01/09/2026 a 30/09/2026',
    resumo: {
      alunosAtendidos: 3,
      alunosAtivos: 3,
      totalTurmas: 1,
      totalAtividades: 1,
      totalOficinasRealizadas: 1,
      totalSessoes: 1,
      totalFotos: 1,
      frequenciaMedia: 67,
      presentes: 1,
      ausentes: 1,
      justificados: 1,
    },
    turmas: [
      {
        turmaId: 'turma-a',
        turmaNome: 'Turma A',
        turmaCodigo: 'A',
        periodo: 'manha',
        sessoes: 1,
        registros: 3,
        presentes: 1,
        ausentes: 1,
        justificados: 1,
        percentual: 67,
        alunos: [
          {
            alunoId: 'aluno-ana',
            alunoNome: 'Ana Souza',
            turmaId: 'turma-a',
            turmaNome: 'Turma A',
            sessoes: 1,
            presentes: 1,
            ausentes: 0,
            justificados: 0,
            percentual: 100,
            semRegistro: false,
          },
          {
            alunoId: 'aluno-bruno',
            alunoNome: 'Bruno Alves',
            turmaId: 'turma-a',
            turmaNome: 'Turma A',
            sessoes: 1,
            presentes: 0,
            ausentes: 1,
            justificados: 0,
            percentual: 0,
            semRegistro: false,
          },
          {
            alunoId: 'aluno-carla',
            alunoNome: 'Carla Oliveira',
            turmaId: 'turma-a',
            turmaNome: 'Turma A',
            sessoes: 1,
            presentes: 0,
            ausentes: 0,
            justificados: 1,
            percentual: 100,
            semRegistro: false,
          },
        ],
      },
    ],
    atividades: [
      {
        id: 'atividade-1',
        data: '2026-09-10',
        turmaId: 'turma-a',
        turmaNome: 'Turma A',
        oficinas: ['Musicalização'],
        responsavelId: 'usuario-ana',
        responsavelNome: 'Ana Profissional',
        observacoes: 'Roda de música com instrumentos de percussão.',
        presenca: { presentes: 1, total: 2 },
        fotos: [
          {
            id: 'foto-1',
            atividadeId: 'atividade-1',
            data: '2026-09-10',
            turmaId: 'turma-a',
            turmaNome: 'Turma A',
            oficinas: ['Musicalização'],
            nomeArquivo: 'roda.png',
            legenda: 'Roda de música',
            caminhoFirestore: 'registros_atividade/atividade-1/anexos/foto-1',
            url: PNG_1X1,
          },
        ],
      },
    ],
    fotos: [
      {
        id: 'foto-1',
        atividadeId: 'atividade-1',
        data: '2026-09-10',
        turmaId: 'turma-a',
        turmaNome: 'Turma A',
        oficinas: ['Musicalização'],
        nomeArquivo: 'roda.png',
        legenda: 'Roda de música',
        caminhoFirestore: 'registros_atividade/atividade-1/anexos/foto-1',
        url: PNG_1X1,
      },
    ],
    restricaoImagem: {
      possuiAlunoSemAutorizacao: true,
      turmas: [
        {
          turmaId: 'turma-a',
          turmaNome: 'Turma A',
          alunosSemAutorizacao: ['Bruno Alves'],
        },
      ],
    },
    avisos: ['1 foto(s) sem conteúdo acessível no Firestore.'],
    ...overrides,
  }
}

describe('generatePrestacaoContasPdf', () => {
  it('gera um PDF com resumo, atividades, frequência e fotos', async () => {
    const progresso: string[] = []
    const resultado = await generatePrestacaoContasPdf(criarDados(), {
      onProgress: (progress) => progresso.push(progress.mensagem),
    })

    expect(resultado.fileName).toBe('prestacao-contas_2026-09-01_a_2026-09-30.pdf')
    expect(resultado.totalPages).toBeGreaterThanOrEqual(1)
    expect(resultado.blob.size).toBeGreaterThan(1000)
    expect(resultado.fotosComErro).toBe(0)
    expect(resultado.blob.type).toBe('application/pdf')
    expect(progresso).toContain('Preparando foto 1 de 1...')
  })

  it('gera PDF enxuto quando o tipo é apenas frequência', async () => {
    const dados = criarDados({
      filtros: {
        ...criarDados().filtros,
        tipo: 'frequencia',
        incluirFotos: false,
      },
    })
    const resultado = await generatePrestacaoContasPdf(dados)

    expect(resultado.totalPages).toBeGreaterThanOrEqual(1)
    expect(resultado.blob.size).toBeGreaterThan(500)
    expect(resultado.fotosComErro).toBe(0)
  })

  it('mantém o PDF válido quando a foto não pode ser carregada', async () => {
    const dados = criarDados({
      fotos: [
        {
          ...criarDados().fotos[0],
          url: 'https://exemplo.invalid/foto-inexistente.png',
        },
      ],
    })

    await expect(generatePrestacaoContasPdf(dados)).resolves.toMatchObject({
      fotosComErro: 1,
    })
  })
})

describe('buildPrintHtml', () => {
  it('inclui as seções ativas e os dados do relatório', () => {
    const html = buildPrintHtml(criarDados())

    expect(html).toContain('Relatório de Prestação de Contas')
    expect(html).toContain('01/09/2026 a 30/09/2026')
    expect(html).toContain('Atividades realizadas no período')
    expect(html).toContain('Frequência por turma e aluno')
    expect(html).toContain('Registro fotográfico')
    expect(html).toContain('Ana Souza')
    expect(html).toContain('Roda de música')
    expect(html).toContain('Bruno Alves')
    expect(html).toContain('Manhã · 67% de frequência')
  })

  it('omite seções desativadas pelo tipo de relatório', () => {
    const html = buildPrintHtml(
      criarDados({
        filtros: {
          ...criarDados().filtros,
          tipo: 'fotos',
          incluirFotos: true,
        },
      })
    )

    expect(html).not.toContain('Atividades realizadas no período')
    expect(html).not.toContain('Frequência por turma e aluno')
    expect(html).toContain('Registro fotográfico')
  })

  it('escapa textos não confiáveis e bloqueia URL de imagem inválida', () => {
    const dados = criarDados({
      turmas: [
        {
          ...criarDados().turmas[0],
          turmaNome: '<script>alert("turma")</script>',
          alunos: [
            {
              ...criarDados().turmas[0].alunos[0],
              alunoNome: '<img src=x onerror=alert(1)>',
            },
          ],
        },
      ],
      atividades: [
        {
          ...criarDados().atividades[0],
          turmaNome: '<b>Turma</b>',
          observacoes: '<script>alert("obs")</script>',
          fotos: [],
        },
      ],
      fotos: [
        {
          ...criarDados().fotos[0],
          turmaNome: '<script>alert("foto")</script>',
          legenda: '"><script>alert("legenda")</script>',
          url: 'javascript:alert(1)',
        },
      ],
      avisos: ['<script>alert("aviso")</script>'],
    })

    const html = buildPrintHtml(dados)

    expect(html).not.toContain('<script>alert')
    expect(html).not.toContain('<img src=x')
    expect(html).not.toContain('javascript:alert')
    expect(html).toContain('&lt;script&gt;alert(&quot;turma&quot;)&lt;/script&gt;')
    expect(html).toContain('Foto indisponível')
  })

  it('exibe aviso de restrição de imagem quando houver aluno sem autorização', () => {
    const html = buildPrintHtml(criarDados())

    expect(html).toContain('Restrição de uso de imagem (LGPD)')
    expect(html).toContain('Imagens incluídas somente quando a autorização foi comprovada')
  })
})
