import type {
  PrestacaoContasFiltros,
  RelatorioAlunoFrequencia,
  RelatorioAlunoRaw,
  RelatorioAnexoRaw,
  RelatorioAtividade,
  RelatorioAtividadeRaw,
  RelatorioFoto,
  RelatorioMatriculaRaw,
  RelatorioOficinaRaw,
  RelatorioPrestacaoDados,
  RelatorioSessaoRaw,
  RelatorioTurmaFrequencia,
  RelatorioTurmaOficinaRaw,
  RelatorioTurmaRaw,
  RelatorioUsuarioRaw,
  RestricaoImagemTurma,
} from '../types/relatorios'

export interface BuildPrestacaoContasInput {
  filtros: PrestacaoContasFiltros
  geradoEm: string
  turmas: RelatorioTurmaRaw[]
  alunos: RelatorioAlunoRaw[]
  matriculas: RelatorioMatriculaRaw[]
  oficinas: RelatorioOficinaRaw[]
  turmaOficinas: RelatorioTurmaOficinaRaw[]
  atividades: RelatorioAtividadeRaw[]
  anexos: RelatorioAnexoRaw[]
  sessoes: RelatorioSessaoRaw[]
  usuarios: RelatorioUsuarioRaw[]
}

type StatusPresenca = 'presente' | 'ausente' | 'justificado'

interface ContagemPresenca {
  sessoes: number
  registros: number
  presentes: number
  ausentes: number
  justificados: number
}

const STATUS_PRESENCA: StatusPresenca[] = ['presente', 'ausente', 'justificado']
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/
const UM_DIA_MS = 24 * 60 * 60 * 1000
const MAX_PERIODO_DIAS = 366

export function normalizeKey(value: string | null | undefined): string {
  return (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

function parseISODate(value: string): Date | null {
  if (!ISO_DATE_RE.test(value)) return null
  const [year, month, day] = value.split('-').map(Number)
  const date = new Date(Date.UTC(year, month - 1, day))
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null
  }
  return date
}

export function todayISO(date = new Date()): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function validatePrestacaoContasFiltros(
  filtros: PrestacaoContasFiltros,
  hoje = new Date()
): string | null {
  const inicio = parseISODate(filtros.periodoInicio)
  const fim = parseISODate(filtros.periodoFim)

  if (!inicio) return 'Informe uma data inicial válida.'
  if (!fim) return 'Informe uma data final válida.'
  if (inicio.getTime() > fim.getTime()) {
    return 'A data inicial não pode ser posterior à data final.'
  }

  const hojeISO = todayISO(hoje)
  if (filtros.periodoFim > hojeISO) {
    return 'A data final não pode estar no futuro.'
  }

  const dias = Math.floor((fim.getTime() - inicio.getTime()) / UM_DIA_MS) + 1
  if (dias > MAX_PERIODO_DIAS) {
    return `O período máximo permitido é de ${MAX_PERIODO_DIAS} dias.`
  }

  if (!['consolidado', 'atividades', 'frequencia', 'fotos'].includes(filtros.tipo)) {
    return 'Selecione um tipo de relatório válido.'
  }

  if (!Array.isArray(filtros.turmaIds)) {
    return 'Selecione turmas válidas para o relatório.'
  }

  return null
}

export function secaoAtividadesAtiva(tipo: PrestacaoContasFiltros['tipo']): boolean {
  return tipo === 'consolidado' || tipo === 'atividades'
}

export function secaoFrequenciaAtiva(tipo: PrestacaoContasFiltros['tipo']): boolean {
  return tipo === 'consolidado' || tipo === 'frequencia'
}

export function secaoFotosAtiva(filtros: PrestacaoContasFiltros): boolean {
  if (filtros.tipo === 'frequencia') return false
  if (filtros.tipo === 'fotos') return true
  return filtros.incluirFotos
}

export function formatDateBR(value: string | null | undefined): string {
  if (!value || !ISO_DATE_RE.test(value)) return value || '—'
  const [year, month, day] = value.split('-')
  return `${day}/${month}/${year}`
}

export function formatDateTimeBR(value: string | Date | null | undefined): string {
  if (!value) return '—'
  const date = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return new Intl.DateTimeFormat('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}

export function formatPercent(value: number): string {
  return `${Math.round(value)}%`
}

const PERIODO_LABELS: Record<string, string> = {
  manha: 'Manhã',
  tarde: 'Tarde',
  integral: 'Integral',
  noite: 'Noite',
}

export function formatPeriodoCurto(value: string | null | undefined): string {
  if (!value) return ''
  return PERIODO_LABELS[normalizeKey(value)] || value
}

export function formatPeriodoLabel(inicio: string, fim: string): string {
  if (inicio === fim) return formatDateBR(inicio)
  return `${formatDateBR(inicio)} a ${formatDateBR(fim)}`
}

export function buildReportFileName(filtros: PrestacaoContasFiltros): string {
  const safe = (value: string) => value.replace(/[^0-9-]/g, '')
  return `prestacao-contas_${safe(filtros.periodoInicio)}_a_${safe(filtros.periodoFim)}.pdf`
}

function statusPresenca(value: string): StatusPresenca | null {
  const key = normalizeKey(value)
  return STATUS_PRESENCA.includes(key as StatusPresenca) ? (key as StatusPresenca) : null
}

function createContagem(): ContagemPresenca {
  return { sessoes: 0, registros: 0, presentes: 0, ausentes: 0, justificados: 0 }
}

function incrementarStatus(contagem: ContagemPresenca, status: StatusPresenca) {
  contagem.registros += 1
  if (status === 'presente') contagem.presentes += 1
  else if (status === 'ausente') contagem.ausentes += 1
  else contagem.justificados += 1
}

function percentualPresenca(contagem: ContagemPresenca): number {
  if (contagem.registros === 0) return 0
  return Math.round(((contagem.presentes + contagem.justificados) / contagem.registros) * 100)
}

function isWithinPeriod(data: string, inicio: string, fim: string): boolean {
  return Boolean(data) && data >= inicio && data <= fim
}

function nomeAlunoDesconhecido(alunoId: string): string {
  const sufixo = alunoId.length > 8 ? alunoId.slice(-6) : alunoId
  return `Aluno não cadastrado (${sufixo})`
}

export function buildPrestacaoContasReport(
  input: BuildPrestacaoContasInput
): RelatorioPrestacaoDados {
  const { filtros, geradoEm } = input
  const avisos: string[] = []

  const turmas = [...input.turmas].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const turmasById = new Map(turmas.map((turma) => [turma.id, turma]))
  const turmasByKey = new Map<string, RelatorioTurmaRaw>()
  for (const turma of turmas) {
    const key = normalizeKey(turma.nome)
    if (!turmasByKey.has(key)) turmasByKey.set(key, turma)
  }

  function resolveTurma(value: string | null | undefined): RelatorioTurmaRaw | undefined {
    if (!value) return undefined
    return turmasById.get(value) || turmasByKey.get(normalizeKey(value))
  }

  // ==== Turmas selecionadas ====
  const idsSelecionados = Array.from(new Set(filtros.turmaIds.filter(Boolean)))
  const idsNaoEncontrados: string[] = []
  const turmasSelecionadas: RelatorioTurmaRaw[] = []

  if (idsSelecionados.length === 0) {
    turmasSelecionadas.push(...turmas)
  } else {
    for (const id of idsSelecionados) {
      const turma = resolveTurma(id)
      if (turma) turmasSelecionadas.push(turma)
      else idsNaoEncontrados.push(id)
    }
  }

  const turmasSelecionadasUnicas = Array.from(
    new Map(turmasSelecionadas.map((turma) => [turma.id, turma])).values()
  ).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  const idsTurmasSelecionadas = new Set(turmasSelecionadasUnicas.map((turma) => turma.id))

  if (idsNaoEncontrados.length > 0) {
    avisos.push(
      `${idsNaoEncontrados.length} turma(s) selecionada(s) não foi(ram) encontrada(s) no cadastro.`
    )
  }
  if (turmas.length === 0) {
    avisos.push('Nenhuma turma cadastrada no banco de dados.')
  }

  // ==== Alunos e vínculos ====
  const alunosById = new Map(input.alunos.map((aluno) => [aluno.id, aluno]))
  const matriculasPorTurmaDesconhecida = new Set<string>()
  const membrosPorAluno = new Map<string, Set<string>>()
  const matriculasValidasPorAluno = new Map<string, RelatorioMatriculaRaw[]>()
  const alunosComMatriculaConhecida = new Set(
    input.matriculas
      .filter((matricula) => !['cancelada', 'cancelado', 'rascunho', 'excluida', 'excluido'].includes(normalizeKey(matricula.status)))
      .map((matricula) => matricula.alunoId)
  )

  function adicionarVinculo(alunoId: string, turmaId: string) {
    if (!alunosById.has(alunoId) || !turmasById.has(turmaId)) return
    const atuais = membrosPorAluno.get(alunoId) || new Set<string>()
    atuais.add(turmaId)
    membrosPorAluno.set(alunoId, atuais)
  }

  function matriculaValidaNoPeriodo(matricula: RelatorioMatriculaRaw) {
    const status = normalizeKey(matricula.status)
    if (['cancelada', 'cancelado', 'rascunho', 'excluida', 'excluido'].includes(status)) return false
    if (matricula.dataInicioEstimada) return false
    // Sem datas, só o vínculo ativo pode ser usado como legado; não inventamos vigência.
    if (!matricula.dataInicio && !matricula.dataFim) return status === 'ativo'
    if (matricula.dataInicio && matricula.dataInicio > filtros.periodoFim) return false
    if (matricula.dataFim && matricula.dataFim < filtros.periodoInicio) return false
    return true
  }

  function matriculaValidaNaData(matricula: RelatorioMatriculaRaw, data: string) {
    const status = normalizeKey(matricula.status)
    if (['cancelada', 'cancelado', 'rascunho', 'excluida', 'excluido'].includes(status)) return false
    if (matricula.dataInicioEstimada) return false
    if (!matricula.dataInicio && !matricula.dataFim) return status === 'ativo'
    return (!matricula.dataInicio || matricula.dataInicio <= data) &&
      (!matricula.dataFim || matricula.dataFim >= data)
  }

  for (const matricula of input.matriculas) {
    if (!matriculaValidaNoPeriodo(matricula)) continue
    if (!turmasById.has(matricula.turmaId)) {
      matriculasPorTurmaDesconhecida.add(matricula.turmaId)
      continue
    }
    adicionarVinculo(matricula.alunoId, matricula.turmaId)
    const lista = matriculasValidasPorAluno.get(matricula.alunoId) || []
    lista.push(matricula)
    matriculasValidasPorAluno.set(matricula.alunoId, lista)
  }

  for (const aluno of input.alunos) {
    // Campos turma_id/turma são apenas fallback quando não há vínculo histórico.
    if (alunosComMatriculaConhecida.has(aluno.id)) continue
    const turma = resolveTurma(aluno.turmaId) || resolveTurma(aluno.turmaNome)
    if (turma) adicionarVinculo(aluno.id, turma.id)
  }

  if (input.matriculas.some((matricula) => !matricula.dataInicio && !matricula.dataFim && normalizeKey(matricula.status) === 'ativo')) {
    avisos.push('Há matrículas sem datas de vigência; os vínculos ativos legados foram tratados como vigentes no período solicitado.')
  }
  const matriculasComDataEstimada = input.matriculas.filter((matricula) => matricula.dataInicioEstimada).length
  if (matriculasComDataEstimada > 0) {
    avisos.push(`${matriculasComDataEstimada} matrícula(s) têm data de início estimada pela migração e foram excluídas da atribuição histórica por período.`)
  }

  function alunoVinculadoNaData(alunoId: string, turmaId: string, data: string) {
    const matriculasDoAluno = input.matriculas.filter((matricula) => matricula.alunoId === alunoId)
    if (matriculasDoAluno.length === 0) return membrosPorAluno.get(alunoId)?.has(turmaId) === true
    return matriculasDoAluno.some((matricula) => matricula.turmaId === turmaId && matriculaValidaNaData(matricula, data))
  }

  if (matriculasPorTurmaDesconhecida.size > 0) {
    avisos.push(
      `${matriculasPorTurmaDesconhecida.size} matrícula(s) ativa(s) aponta(m) para turma(s) não cadastrada(s).`
    )
  }

  const alunosAtivos = input.alunos
  const rosterPorTurma = new Map<string, RelatorioAlunoRaw[]>()
  const alunosAtivosSet = new Set<string>()

  for (const turma of turmasSelecionadasUnicas) {
    const roster = alunosAtivos
      .filter((aluno) => (matriculasValidasPorAluno.get(aluno.id) || []).some((matricula) => matricula.turmaId === turma.id) ||
        ((matriculasValidasPorAluno.get(aluno.id) || []).length === 0 && membrosPorAluno.get(aluno.id)?.has(turma.id)))
      .filter((aluno) => normalizeKey(aluno.status) === 'ativo' ||
        (matriculasValidasPorAluno.get(aluno.id) || []).some((matricula) => Boolean(matricula.dataInicio || matricula.dataFim)))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
    rosterPorTurma.set(turma.id, roster)
    roster.filter((aluno) => normalizeKey(aluno.status) === 'ativo').forEach((aluno) => alunosAtivosSet.add(aluno.id))
  }

  // Turmas com aluno ativo sem consentimento persistido de imagem.
  // A autorização só é válida quando `uso_imagem_autorizado` está gravado no aluno.
  const restricoesPorTurma = new Map<string, RestricaoImagemTurma>()
  for (const turma of turmasSelecionadasUnicas) {
    const alunosSemAutorizacao = (rosterPorTurma.get(turma.id) || [])
      .filter((aluno) => aluno.usoImagemAutorizado !== true)
      .map((aluno) => aluno.nome)
      .sort((a, b) => a.localeCompare(b, 'pt-BR'))
    if (alunosSemAutorizacao.length > 0) {
      restricoesPorTurma.set(turma.id, {
        turmaId: turma.id,
        turmaNome: turma.nome,
        alunosSemAutorizacao,
        fotosBloqueadas: 0,
      })
    }
  }

  // ==== Frequência ====
  const contagemPorTurma = new Map<string, ContagemPresenca>()
  const contagemPorAluno = new Map<string, ContagemPresenca>()
  const alunosComRegistro = new Set<string>()
  const alunosDesconhecidos = new Set<string>()
  let sessoesTurmaDesconhecida = 0
  let statusInvalidos = 0
  let registrosSemVinculoNaData = 0

  const sessoesValidas: { sessao: RelatorioSessaoRaw; turma: RelatorioTurmaRaw }[] = []

  for (const sessao of input.sessoes) {
    if (!isWithinPeriod(sessao.data, filtros.periodoInicio, filtros.periodoFim)) continue
    const turma = resolveTurma(sessao.turmaId)
    if (!turma) {
      sessoesTurmaDesconhecida += 1
      continue
    }
    if (!idsTurmasSelecionadas.has(turma.id)) continue

    sessoesValidas.push({ sessao, turma })

    const turmaContagem = contagemPorTurma.get(turma.id) || createContagem()
    turmaContagem.sessoes += 1
    contagemPorTurma.set(turma.id, turmaContagem)

    for (const [alunoId, statusValor] of Object.entries(sessao.presencas || {})) {
      const status = statusPresenca(statusValor)
      if (!status) {
        statusInvalidos += 1
        continue
      }
      if (!alunosById.has(alunoId)) alunosDesconhecidos.add(alunoId)

      if (alunosComMatriculaConhecida.has(alunoId) && !alunoVinculadoNaData(alunoId, turma.id, sessao.data)) {
        registrosSemVinculoNaData += 1
        continue
      }
      alunosComRegistro.add(alunoId)

      incrementarStatus(turmaContagem, status)

      const chaveAluno = `${turma.id}::${alunoId}`
      const alunoContagem = contagemPorAluno.get(chaveAluno) || createContagem()
      alunoContagem.sessoes += 1
      incrementarStatus(alunoContagem, status)
      contagemPorAluno.set(chaveAluno, alunoContagem)
    }
  }

  if (sessoesTurmaDesconhecida > 0) {
    avisos.push(
      `${sessoesTurmaDesconhecida} chamada(s) descartada(s) por turma não identificada.`
    )
  }
  if (statusInvalidos > 0) {
    avisos.push(`${statusInvalidos} status de presença inválido(s) ignorado(s).`)
  }
  if (alunosDesconhecidos.size > 0) {
    avisos.push(
      `${alunosDesconhecidos.size} aluno(s) com frequência registrada não está(ão) no cadastro.`
    )
  }
  if (registrosSemVinculoNaData > 0) {
    avisos.push(`${registrosSemVinculoNaData} registro(s) de presença não contabilizado(s): a matrícula histórica não corresponde à turma na data da chamada.`)
  }

  function montarAlunosDaTurma(turma: RelatorioTurmaRaw): RelatorioAlunoFrequencia[] {
    const roster = rosterPorTurma.get(turma.id) || []
    const alunos: RelatorioAlunoFrequencia[] = []
    const incluidos = new Set<string>()

    const montarLinha = (alunoId: string, nome: string): RelatorioAlunoFrequencia => {
      const contagem = contagemPorAluno.get(`${turma.id}::${alunoId}`) || createContagem()
      return {
        alunoId,
        alunoNome: nome,
        turmaId: turma.id,
        turmaNome: turma.nome,
        sessoes: contagem.sessoes,
        presentes: contagem.presentes,
        ausentes: contagem.ausentes,
        justificados: contagem.justificados,
        percentual: percentualPresenca(contagem),
        semRegistro: contagem.registros === 0,
      }
    }

    for (const aluno of roster) {
      alunos.push(montarLinha(aluno.id, aluno.nome))
      incluidos.add(aluno.id)
    }

    for (const chave of contagemPorAluno.keys()) {
      const [turmaId, alunoId] = chave.split('::')
      if (turmaId !== turma.id || incluidos.has(alunoId)) continue
      const aluno = alunosById.get(alunoId)
      alunos.push(montarLinha(alunoId, aluno?.nome || nomeAlunoDesconhecido(alunoId)))
      incluidos.add(alunoId)
    }

    return alunos.sort((a, b) => a.alunoNome.localeCompare(b.alunoNome, 'pt-BR'))
  }

  const turmasRelatorio: RelatorioTurmaFrequencia[] = turmasSelecionadasUnicas.map((turma) => {
    const contagem = contagemPorTurma.get(turma.id) || createContagem()
    return {
      turmaId: turma.id,
      turmaNome: turma.nome,
      turmaCodigo: turma.codigo,
      periodo: turma.periodo,
      sessoes: contagem.sessoes,
      registros: contagem.registros,
      presentes: contagem.presentes,
      ausentes: contagem.ausentes,
      justificados: contagem.justificados,
      percentual: percentualPresenca(contagem),
      alunos: montarAlunosDaTurma(turma),
    }
  })

  // ==== Atividades e fotos ====
  const oficinasById = new Map(input.oficinas.map((oficina) => [oficina.id, oficina]))
  const turmaOficinaById = new Map(
    input.turmaOficinas.map((vinculo) => [vinculo.id, vinculo])
  )
  const anexosPorAtividade = new Map<string, RelatorioAnexoRaw[]>()
  for (const anexo of input.anexos) {
    const lista = anexosPorAtividade.get(anexo.atividadeId) || []
    lista.push(anexo)
    anexosPorAtividade.set(anexo.atividadeId, lista)
  }

  const usuariosById = new Map(input.usuarios.map((usuario) => [usuario.id, usuario]))
  let atividadesTurmaDesconhecida = 0
  let vinculosOficinaAusentes = 0
  let fotosSemUrl = 0
  let fotosOmitidasPorAutorizacao = 0

  function resolverOficinas(ids: string[]): string[] {
    const nomes = new Set<string>()
    for (const id of ids) {
      const vinculo = turmaOficinaById.get(id)
      const oficina = vinculo ? oficinasById.get(vinculo.oficinaId) : oficinasById.get(id)
      if (!oficina) {
        vinculosOficinaAusentes += 1
        continue
      }
      nomes.add(oficina.nome)
    }
    return Array.from(nomes).sort((a, b) => a.localeCompare(b, 'pt-BR'))
  }

  function resolverPresencaDaAtividade(
    data: string,
    turmaId: string
  ): { presentes: number; total: number } | null {
    const sessoesDoDia = sessoesValidas.filter(
      (item) => item.sessao.data === data && item.turma.id === turmaId
    )
    if (sessoesDoDia.length === 0) return null
    const diarias = sessoesDoDia.filter((item) => item.sessao.escopo === 'turma')
    const escolhidas = diarias.length > 0 ? diarias : sessoesDoDia
    const consolidado: Record<string, string> = {}
    escolhidas
      .slice()
      .sort((a, b) => a.sessao.id.localeCompare(b.sessao.id))
      .forEach((item) => Object.assign(consolidado, item.sessao.presencas || {}))

    let presentes = 0
    let total = 0
    for (const statusValor of Object.values(consolidado)) {
      const status = statusPresenca(statusValor)
      if (!status) continue
      total += 1
      if (status === 'presente') presentes += 1
    }
    return total > 0 ? { presentes, total } : null
  }

  const atividadesRelatorio: RelatorioAtividade[] = []
  let totalOficinasRealizadas = 0
  let totalFotos = 0

  for (const atividade of input.atividades) {
    if (!isWithinPeriod(atividade.data, filtros.periodoInicio, filtros.periodoFim)) continue
    const turma = resolveTurma(atividade.turmaId)
    if (!turma) {
      atividadesTurmaDesconhecida += 1
      continue
    }
    if (!idsTurmasSelecionadas.has(turma.id)) continue

    const oficinas = resolverOficinas(atividade.idsTurmaOficinas || [])
    totalOficinasRealizadas += oficinas.length

    const rosterDaData = input.alunos.filter((aluno) => alunoVinculadoNaData(aluno.id, turma.id, atividade.data))
    const todosAutorizadosNaData = rosterDaData.length > 0 && rosterDaData.every((aluno) => aluno.usoImagemAutorizado === true)
    const fotosDaAtividade = (anexosPorAtividade.get(atividade.id) || [])
      .filter((anexo) => anexo.tipoAnexo === 'imagem')
      .sort((a, b) => a.nomeArquivo.localeCompare(b.nomeArquivo, 'pt-BR'))

    if (fotosDaAtividade.length > 0 && !todosAutorizadosNaData) {
      // Fotos de turmas com aluno sem autorização não entram na prévia, no PDF
      // nem na impressão; o bloqueio é contabilizado e exibido no relatório.
      fotosOmitidasPorAutorizacao += fotosDaAtividade.length
      let restricaoDaTurma = restricoesPorTurma.get(turma.id)
      if (!restricaoDaTurma) {
        restricaoDaTurma = {
          turmaId: turma.id,
          turmaNome: turma.nome,
          alunosSemAutorizacao: rosterDaData
            .filter((aluno) => aluno.usoImagemAutorizado !== true)
            .map((aluno) => aluno.nome)
            .sort((a, b) => a.localeCompare(b, 'pt-BR')),
          fotosBloqueadas: 0,
        }
        restricoesPorTurma.set(turma.id, restricaoDaTurma)
      }
      restricaoDaTurma.fotosBloqueadas += fotosDaAtividade.length
    }

    const fotos: RelatorioFoto[] = (todosAutorizadosNaData ? fotosDaAtividade : [])
      .map((anexo) => {
        if (!anexo.url) fotosSemUrl += 1
        return {
          id: anexo.id,
          atividadeId: atividade.id,
          data: atividade.data,
          turmaId: turma.id,
          turmaNome: turma.nome,
          oficinas,
          nomeArquivo: anexo.nomeArquivo,
          legenda: anexo.legenda,
          caminhoFirestore: anexo.caminhoFirestore,
          url: anexo.url,
        }
      })

    totalFotos += fotos.length
    atividadesRelatorio.push({
      id: atividade.id,
      data: atividade.data,
      turmaId: turma.id,
      turmaNome: turma.nome,
      oficinas,
      responsavelId: atividade.responsavelId,
      responsavelNome: usuariosById.get(atividade.responsavelId)?.nome || 'Profissional não identificado',
      observacoes: atividade.observacoes.trim(),
      presenca: resolverPresencaDaAtividade(atividade.data, turma.id),
      fotos,
    })
  }

  atividadesRelatorio.sort((a, b) => {
    if (a.data !== b.data) return a.data.localeCompare(b.data)
    return a.turmaNome.localeCompare(b.turmaNome, 'pt-BR')
  })

  if (atividadesTurmaDesconhecida > 0) {
    avisos.push(
      `${atividadesTurmaDesconhecida} atividade(s) descartada(s) por turma não identificada.`
    )
  }
  if (vinculosOficinaAusentes > 0) {
    avisos.push(
      `${vinculosOficinaAusentes} vínculo(s) de oficina não encontrado(s) foram omitidos das atividades.`
    )
  }
  if (fotosSemUrl > 0 && secaoFotosAtiva(filtros)) {
    avisos.push(
      `${fotosSemUrl} foto(s) sem conteúdo acessível no Firestore; o PDF mostrará um espaço reservado.`
    )
  }
  if (fotosOmitidasPorAutorizacao > 0 && secaoFotosAtiva(filtros)) {
    avisos.push(`${fotosOmitidasPorAutorizacao} foto(s) omitida(s): não foi possível comprovar autorização de imagem para todos os alunos vinculados à turma na data da atividade.`)
  }

  const fotosRelatorio = atividadesRelatorio
    .flatMap((atividade) => atividade.fotos)
    .sort((a, b) => {
      if (a.data !== b.data) return a.data.localeCompare(b.data)
      const turma = a.turmaNome.localeCompare(b.turmaNome, 'pt-BR')
      if (turma !== 0) return turma
      return a.nomeArquivo.localeCompare(b.nomeArquivo, 'pt-BR')
    })

  // ==== Restrições de imagem (LGPD) ====
  const todasRestricoes = Array.from(restricoesPorTurma.values())
  const restricoes = todasRestricoes.filter((item) => item.alunosSemAutorizacao.length > 0)
  const totalFotosBloqueadas = todasRestricoes.reduce(
    (soma, item) => soma + item.fotosBloqueadas,
    0
  )

  // ==== Resumo ====
  let presentes = 0
  let ausentes = 0
  let justificados = 0
  let totalSessoes = 0
  for (const turma of turmasRelatorio) {
    presentes += turma.presentes
    ausentes += turma.ausentes
    justificados += turma.justificados
    totalSessoes += turma.sessoes
  }
  const totalRegistros = presentes + ausentes + justificados
  const frequenciaMedia =
    totalRegistros > 0
      ? Math.round(((presentes + justificados) / totalRegistros) * 100)
      : 0

  const turmasComDados = new Set<string>()
  atividadesRelatorio.forEach((atividade) => turmasComDados.add(atividade.turmaId))
  sessoesValidas.forEach((item) => turmasComDados.add(item.turma.id))
  for (const turma of turmasSelecionadasUnicas) {
    if ((contagemPorTurma.get(turma.id)?.sessoes || 0) > 0) turmasComDados.add(turma.id)
  }

  return {
    filtros: { ...filtros, turmaIds: idsSelecionados },
    geradoEm,
    periodoLabel: formatPeriodoLabel(filtros.periodoInicio, filtros.periodoFim),
    resumo: {
      alunosAtendidos: alunosComRegistro.size,
      alunosAtivos: alunosAtivosSet.size,
      totalTurmas: turmasComDados.size,
      totalAtividades: atividadesRelatorio.length,
      totalOficinasRealizadas,
      totalSessoes,
      totalFotos,
      frequenciaMedia,
      presentes,
      ausentes,
      justificados,
    },
    turmas: turmasRelatorio,
    atividades: atividadesRelatorio,
    fotos: fotosRelatorio,
    fotosOmitidasPorAutorizacao,
    restricaoImagem: {
      possuiAlunoSemAutorizacao: restricoes.length > 0,
      fotosBloqueadas: totalFotosBloqueadas,
      turmas: restricoes,
    },
    avisos,
  }
}
