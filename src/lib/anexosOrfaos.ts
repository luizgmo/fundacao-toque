// Análise de anexos inconsistentes (usada por scripts/anexos-orfaos.mjs).
// Módulo puro, sem Firebase: recebe o que foi lido do banco e devolve os
// achados com a correção indicada. Sem imports para o Node conseguir carregar
// este arquivo .ts diretamente (type stripping).

export type PaiResumo = {
  path: string // registros_atividade/{id} ou relatorios_pedagogicos/{id}
  totalAnexos?: number // só registros de atividade
  exclusao?: { status?: string; arquivos_pendentes?: string[] } | null
}

export type AnexoResumo = {
  path: string // {pai}/anexos/{id}
  status?: string
  totalPartes?: number
  nome?: string
  enviadoEm?: string // ISO
}

export type ParteResumo = { path: string } // {pai}/anexos/{id}/chunks/{n}

export type TipoAchado =
  | 'anexo_sem_pai'
  | 'parte_sem_anexo'
  | 'envio_abandonado'
  | 'conteudo_incompleto'
  | 'contador_divergente'
  | 'exclusao_incompleta'

export type Achado = {
  tipo: TipoAchado
  path: string
  descricao: string
  // apagar: remove o documento e as partes listadas; recontar: grava total_anexos;
  // manual: precisa de decisão humana (o script só informa)
  correcao: 'apagar' | 'recontar' | 'manual'
  apagar?: string[]
  totalCorreto?: number
}

const PAIS_COM_ANEXOS = ['registros_atividade', 'relatorios_pedagogicos']

function paiDoAnexo(anexoPath: string) {
  return anexoPath.split('/').slice(0, -2).join('/')
}

function anexoDaParte(partePath: string) {
  return partePath.split('/').slice(0, -2).join('/')
}

export function analisarAnexos(entrada: {
  pais: PaiResumo[]
  anexos: AnexoResumo[]
  partes: ParteResumo[]
  agora: Date
  horasEnvioAbandonado?: number
}): Achado[] {
  const horas = entrada.horasEnvioAbandonado ?? 24
  const pais = new Map(entrada.pais.map((p) => [p.path, p]))
  const anexos = entrada.anexos.filter((a) => PAIS_COM_ANEXOS.includes(a.path.split('/')[0]))
  const anexoPaths = new Set(anexos.map((a) => a.path))
  const partesPorAnexo = new Map<string, string[]>()
  entrada.partes.forEach((p) => {
    const anexo = anexoDaParte(p.path)
    partesPorAnexo.set(anexo, [...(partesPorAnexo.get(anexo) || []), p.path])
  })
  const achados: Achado[] = []

  // Partes cujo anexo não existe mais (metadados apagados antes do conteúdo)
  partesPorAnexo.forEach((partes, anexo) => {
    if (!PAIS_COM_ANEXOS.includes(anexo.split('/')[0]) || anexoPaths.has(anexo)) return
    achados.push({
      tipo: 'parte_sem_anexo',
      path: anexo,
      descricao: `${partes.length} parte(s) de conteúdo sem os metadados do anexo`,
      correcao: 'apagar',
      apagar: partes,
    })
  })

  anexos.forEach((anexo) => {
    const partes = partesPorAnexo.get(anexo.path) || []
    const nome = anexo.nome ? ` (${anexo.nome})` : ''
    if (!pais.has(paiDoAnexo(anexo.path))) {
      achados.push({
        tipo: 'anexo_sem_pai',
        path: anexo.path,
        descricao: `anexo${nome} de um registro/relatório que não existe mais`,
        correcao: 'apagar',
        apagar: [...partes, anexo.path],
      })
      return
    }
    if (anexo.status !== 'disponivel') {
      const enviadoEm = anexo.enviadoEm ? new Date(anexo.enviadoEm) : null
      const idadeHoras = enviadoEm ? (entrada.agora.getTime() - enviadoEm.getTime()) / 3_600_000 : Infinity
      if (idadeHoras >= horas) {
        achados.push({
          tipo: 'envio_abandonado',
          path: anexo.path,
          descricao: `envio${nome} não concluído há ${Number.isFinite(idadeHoras) ? Math.floor(idadeHoras) + ' h' : 'tempo desconhecido'} (${partes.length}/${anexo.totalPartes ?? '?'} partes)`,
          correcao: 'apagar',
          apagar: [...partes, anexo.path],
        })
      }
      return
    }
    if (partes.length !== anexo.totalPartes) {
      achados.push({
        tipo: 'conteudo_incompleto',
        path: anexo.path,
        descricao: `arquivo${nome} marcado como disponível com ${partes.length} de ${anexo.totalPartes ?? '?'} partes; excluir no app e enviar de novo`,
        correcao: 'manual',
      })
    }
  })

  entrada.pais.forEach((pai) => {
    if (pai.exclusao) {
      achados.push({
        tipo: 'exclusao_incompleta',
        path: pai.path,
        descricao: `exclusão ${pai.exclusao.status || 'iniciada'} e não concluída` +
          (pai.exclusao.arquivos_pendentes?.length ? ` (pendentes: ${pai.exclusao.arquivos_pendentes.join(', ')})` : '') +
          '; use “Concluir exclusão” no app',
        correcao: 'manual',
      })
    }
    if (!pai.path.startsWith('registros_atividade/')) return
    const disponiveis = anexos.filter((a) => paiDoAnexo(a.path) === pai.path && a.status === 'disponivel').length
    if ((pai.totalAnexos ?? 0) !== disponiveis) {
      achados.push({
        tipo: 'contador_divergente',
        path: pai.path,
        descricao: `total_anexos = ${pai.totalAnexos ?? 0}, mas há ${disponiveis} arquivo(s) disponível(is)`,
        correcao: 'recontar',
        totalCorreto: disponiveis,
      })
    }
  })

  return achados
}
