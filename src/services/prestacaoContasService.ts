import { collection, getDocs, orderBy, query, where } from 'firebase/firestore'
import type { DocumentData } from 'firebase/firestore'
import { getDownloadURL, ref } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import {
  buildPrestacaoContasReport,
  normalizeKey,
  secaoFotosAtiva,
  validatePrestacaoContasFiltros,
} from '../lib/reportBuilder'
import type {
  PrestacaoContasFiltros,
  RelatorioAlunoRaw,
  RelatorioAnexoRaw,
  RelatorioAtividadeRaw,
  RelatorioMatriculaRaw,
  RelatorioOficinaRaw,
  RelatorioPrestacaoDados,
  RelatorioSessaoRaw,
  RelatorioTurmaOficinaRaw,
  RelatorioTurmaRaw,
  RelatorioUsuarioRaw,
} from '../types/relatorios'

const ALUNOS_COLLECTION = 'alunos'
const TURMAS_COLLECTION = 'turmas'
const MATRICULAS_COLLECTION = 'matriculas'
const OFICINAS_COLLECTION = 'oficinas'
const TURMA_OFICINAS_COLLECTION = 'turma_oficinas'
const ATIVIDADES_COLLECTION = 'registros_atividade'
const SESSOES_COLLECTION = 'sessoes_chamada'
const USUARIOS_COLLECTION = 'usuarios'

const QUERY_CONCURRENCY = 5

function stringValue(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

function arrayOfStrings(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function objectRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object') return {}
  const result: Record<string, string> = {}
  for (const [key, item] of Object.entries(value)) {
    if (typeof item === 'string') result[key] = item
  }
  return result
}

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length)
  let nextIndex = 0
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (nextIndex < items.length) {
      const current = nextIndex
      nextIndex += 1
      results[current] = await mapper(items[current], current)
    }
  })
  await Promise.all(workers)
  return results
}

function mapTurma(id: string, data: DocumentData): RelatorioTurmaRaw {
  return {
    id,
    nome: stringValue(data.nome, 'Turma sem nome'),
    codigo: stringValue(data.codigo),
    periodo: stringValue(data.periodo) || stringValue(data.period),
    ativo: data.ativo !== false,
  }
}

function mapAluno(id: string, data: DocumentData): RelatorioAlunoRaw {
  return {
    id,
    nome: stringValue(data.nome_completo, 'Aluno sem nome'),
    status: stringValue(data.status),
    turmaId: stringValue(data.turma_id) || null,
    turmaNome: stringValue(data.turma) || null,
    usoImagemAutorizado: data.uso_imagem_autorizado === true,
  }
}

function mapMatricula(data: DocumentData): RelatorioMatriculaRaw {
  return {
    alunoId: stringValue(data.aluno_id),
    turmaId: stringValue(data.turma_id),
    status: stringValue(data.status),
  }
}

function mapOficina(id: string, data: DocumentData): RelatorioOficinaRaw {
  return {
    id,
    nome: stringValue(data.nome, 'Oficina sem nome'),
    categoria: stringValue(data.categoria),
  }
}

function mapTurmaOficina(id: string, data: DocumentData): RelatorioTurmaOficinaRaw {
  return {
    id,
    turmaId: stringValue(data.turma_id),
    oficinaId: stringValue(data.oficina_id),
    ativo: data.ativo !== false,
  }
}

function mapAtividade(id: string, data: DocumentData): RelatorioAtividadeRaw {
  return {
    id,
    data: stringValue(data.data_atividade),
    turmaId: stringValue(data.turma_id),
    idsTurmaOficinas: arrayOfStrings(data.ids_turma_oficinas),
    responsavelId: stringValue(data.usuario_responsavel_id),
    observacoes: stringValue(data.observacoes_gerais),
  }
}

function mapSessao(id: string, data: DocumentData): RelatorioSessaoRaw {
  return {
    id,
    data: stringValue(data.data_chamada),
    turmaId: stringValue(data.turma_id),
    escopo: data.escopo === 'oficina' ? 'oficina' : 'turma',
    turmaOficinaId: stringValue(data.turma_oficina_id) || null,
    oficinaNome: stringValue(data.oficina_nome) || null,
    presencas: objectRecord(data.presencas),
    observacoes: objectRecord(data.observacoes),
  }
}

function mapUsuario(id: string, data: DocumentData): RelatorioUsuarioRaw {
  return {
    id,
    nome: stringValue(data.nome_completo, 'Profissional sem nome'),
  }
}

// Turmas com pelo menos um aluno ativo sem consentimento persistido de imagem.
// Usado para evitar baixar do Storage fotos que não poderão ser incluídas.
function calcularTurmasSemAutorizacao(
  turmas: RelatorioTurmaRaw[],
  alunos: RelatorioAlunoRaw[],
  matriculas: RelatorioMatriculaRaw[]
): Set<string> {
  const turmasById = new Map(turmas.map((turma) => [turma.id, turma]))
  const turmasByNome = new Map<string, RelatorioTurmaRaw>()
  for (const turma of turmas) {
    const key = normalizeKey(turma.nome)
    if (!turmasByNome.has(key)) turmasByNome.set(key, turma)
  }
  const resolverTurma = (value: string | null | undefined) => {
    if (!value) return undefined
    return turmasById.get(value) || turmasByNome.get(normalizeKey(value))
  }

  const membrosPorTurma = new Map<string, Set<string>>()
  const adicionarVinculo = (turmaId: string, alunoId: string) => {
    const atuais = membrosPorTurma.get(turmaId) || new Set<string>()
    atuais.add(alunoId)
    membrosPorTurma.set(turmaId, atuais)
  }

  const alunosById = new Map(alunos.map((aluno) => [aluno.id, aluno]))

  for (const matricula of matriculas) {
    if (normalizeKey(matricula.status) !== 'ativo') continue
    if (!turmasById.has(matricula.turmaId)) continue
    if (!alunosById.has(matricula.alunoId)) continue
    adicionarVinculo(matricula.turmaId, matricula.alunoId)
  }

  for (const aluno of alunos) {
    if (normalizeKey(aluno.status) !== 'ativo') continue
    const turma = resolverTurma(aluno.turmaId) || resolverTurma(aluno.turmaNome)
    if (turma) adicionarVinculo(turma.id, aluno.id)
  }

  const bloqueadas = new Set<string>()
  for (const [turmaId, membros] of membrosPorTurma) {
    for (const alunoId of membros) {
      if (alunosById.get(alunoId)?.usoImagemAutorizado !== true) {
        bloqueadas.add(turmaId)
        break
      }
    }
  }
  return bloqueadas
}

export async function loadTurmasParaFiltro(): Promise<RelatorioTurmaRaw[]> {
  try {
    const snapshot = await getDocs(collection(db, TURMAS_COLLECTION))
    return snapshot.docs
      .map((item) => mapTurma(item.id, item.data()))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  } catch (error) {
    console.warn('Erro ao carregar turmas para o relatório:', error)
    throw new Error(
      'Não foi possível carregar as turmas. Verifique a conexão e as permissões do Firestore.',
      { cause: error }
    )
  }
}

export async function loadPrestacaoContasData(
  filtros: PrestacaoContasFiltros
): Promise<RelatorioPrestacaoDados> {
  const validation = validatePrestacaoContasFiltros(filtros)
  if (validation) throw new Error(validation)

  try {
    const [
      turmasSnapshot,
      alunosSnapshot,
      matriculasSnapshot,
      oficinasSnapshot,
      turmaOficinasSnapshot,
      usuariosSnapshot,
    ] = await Promise.all([
      getDocs(collection(db, TURMAS_COLLECTION)),
      getDocs(collection(db, ALUNOS_COLLECTION)),
      getDocs(collection(db, MATRICULAS_COLLECTION)),
      getDocs(collection(db, OFICINAS_COLLECTION)),
      getDocs(collection(db, TURMA_OFICINAS_COLLECTION)),
      getDocs(collection(db, USUARIOS_COLLECTION)),
    ])

    const atividadesQuery = query(
      collection(db, ATIVIDADES_COLLECTION),
      where('data_atividade', '>=', filtros.periodoInicio),
      where('data_atividade', '<=', filtros.periodoFim),
      orderBy('data_atividade', 'asc')
    )
    const sessoesQuery = query(
      collection(db, SESSOES_COLLECTION),
      where('data_chamada', '>=', filtros.periodoInicio),
      where('data_chamada', '<=', filtros.periodoFim),
      orderBy('data_chamada', 'asc')
    )

    const [atividadesSnapshot, sessoesSnapshot] = await Promise.all([
      getDocs(atividadesQuery),
      getDocs(sessoesQuery),
    ])

    const turmas = turmasSnapshot.docs.map((item) => mapTurma(item.id, item.data()))
    const alunos = alunosSnapshot.docs.map((item) => mapAluno(item.id, item.data()))
    const matriculas = matriculasSnapshot.docs.map((item) => mapMatricula(item.data()))
    const oficinas = oficinasSnapshot.docs.map((item) => mapOficina(item.id, item.data()))
    const turmaOficinas = turmaOficinasSnapshot.docs.map((item) =>
      mapTurmaOficina(item.id, item.data())
    )
    const usuarios = usuariosSnapshot.docs.map((item) => mapUsuario(item.id, item.data()))
    const atividades = atividadesSnapshot.docs.map((item) => mapAtividade(item.id, item.data()))
    const sessoes = sessoesSnapshot.docs.map((item) => mapSessao(item.id, item.data()))

    const turmasBloqueadas = calcularTurmasSemAutorizacao(turmas, alunos, matriculas)
    const turmaIdPorReferencia = new Map<string, string>()
    for (const turma of turmas) {
      turmaIdPorReferencia.set(turma.id, turma.id)
      const key = normalizeKey(turma.nome)
      if (!turmaIdPorReferencia.has(key)) turmaIdPorReferencia.set(key, turma.id)
    }
    const resolverTurmaId = (value: string) =>
      turmaIdPorReferencia.get(value) || turmaIdPorReferencia.get(normalizeKey(value)) || value

    const deveCarregarUrls = secaoFotosAtiva(filtros)
    const anexos: RelatorioAnexoRaw[] = []
    let anexosComFalha = 0

    const anexosPorAtividade = await mapWithConcurrency(
      atividades,
      QUERY_CONCURRENCY,
      async (atividade) => {
        try {
          const anexosSnapshot = await getDocs(
            collection(db, `${ATIVIDADES_COLLECTION}/${atividade.id}/anexos`)
          )
          return await Promise.all(
            anexosSnapshot.docs.map(async (anexoDoc): Promise<RelatorioAnexoRaw> => {
              const data = anexoDoc.data()
              const tipoAnexo = data.tipo_anexo === 'documento' ? 'documento' : 'imagem'
              const caminhoStorage = stringValue(data.caminho_storage)
              let url: string | null = null
              const turmaBloqueada = turmasBloqueadas.has(
                resolverTurmaId(atividade.turmaId)
              )

              if (
                deveCarregarUrls &&
                !turmaBloqueada &&
                tipoAnexo === 'imagem' &&
                caminhoStorage
              ) {
                try {
                  url = await getDownloadURL(ref(storage, caminhoStorage))
                } catch (error) {
                  console.warn('Não foi possível obter a URL da foto do relatório:', error)
                }
              }

              return {
                id: anexoDoc.id,
                atividadeId: atividade.id,
                tipoAnexo,
                caminhoStorage,
                nomeArquivo: stringValue(data.nome_arquivo_original, 'foto'),
                legenda: stringValue(data.legenda),
                url,
              }
            })
          )
        } catch (error) {
          anexosComFalha += 1
          console.warn('Não foi possível carregar os anexos da atividade:', atividade.id, error)
          return []
        }
      }
    )

    anexosPorAtividade.forEach((lista) => anexos.push(...lista))

    const relatorio = buildPrestacaoContasReport({
      filtros,
      geradoEm: new Date().toISOString(),
      turmas,
      alunos,
      matriculas,
      oficinas,
      turmaOficinas,
      atividades,
      anexos,
      sessoes,
      usuarios,
    })

    if (anexosComFalha > 0) {
      relatorio.avisos.push(
        `${anexosComFalha} atividade(s) não puderam ter as fotos carregadas do Storage.`
      )
    }

    return relatorio
  } catch (error) {
    console.warn('Erro ao montar dados da prestação de contas:', error)
    if (error instanceof Error && error.message.startsWith('A data')) throw error
    if (error instanceof Error && error.message.startsWith('Informe')) throw error
    if (error instanceof Error && error.message.startsWith('O período')) throw error
    if (error instanceof Error && error.message.startsWith('Selecione')) throw error
    throw new Error(
      'Não foi possível carregar os dados do relatório. Verifique a conexão e as permissões do Firestore.',
      { cause: error }
    )
  }
}
