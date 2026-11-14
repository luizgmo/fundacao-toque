import {
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  Timestamp,
} from 'firebase/firestore'
import { deleteObject, getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { db, storage } from '../lib/firebase'
import { isDemoModeEnabled } from '../lib/demoMode'
import { confirmWrite } from '../lib/persistence'
import type { UserRole } from '../types/auth'

export type FormatoFichaMedica = 'digital' | 'anexo'

export interface DadosFichaMedica {
  alergias?: string
  medicamentos?: string
  restricoesAlimentares?: string
  cuidadosEspeciais?: string
  contatoEmergenciaNome?: string
  contatoEmergenciaTelefone?: string
  historicoMedico?: string
  observacoes?: string
}

export interface AnexoFichaMedica {
  caminhoStorage: string
  nomeArquivo: string
  tipoConteudo: string
  tamanhoBytes: number
  enviadoEm?: string
  // Presente apenas no modo demonstração, onde o arquivo fica neste navegador.
  dataUrl?: string
}

export interface FichaMedica {
  alunoId: string
  tiposDeficiencia: string[]
  codigosCid: string[]
  formatoFichaMedica: FormatoFichaMedica
  dadosFichaMedica: DadosFichaMedica | null
  anexo: AnexoFichaMedica | null
  atualizadoPor: string
  atualizadoEm?: string
}

export type SalvarFichaMedicaInput = {
  tiposDeficiencia: string[]
  codigosCid: string[]
  formatoFichaMedica: FormatoFichaMedica
  dadosFichaMedica?: DadosFichaMedica | null
  anexo?: AnexoFichaMedica | null
  novoAnexo?: File | null
  removerAnexo?: boolean
}

export const MAX_FICHA_MEDICA_BYTES = 10 * 1024 * 1024
export const TIPOS_ANEXO_FICHA_MEDICA = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
] as const

const LOCAL_STORAGE_KEY_PREFIX = 'fundacao_toque_local_ficha_medica_'

const DADOS_PARA_FIRESTORE: Record<keyof DadosFichaMedica, string> = {
  alergias: 'alergias',
  medicamentos: 'medicamentos',
  restricoesAlimentares: 'restricoes_alimentares',
  cuidadosEspeciais: 'cuidados_especiais',
  contatoEmergenciaNome: 'contato_emergencia_nome',
  contatoEmergenciaTelefone: 'contato_emergencia_telefone',
  historicoMedico: 'historico_medico',
  observacoes: 'observacoes',
}

const DADOS_DO_FIRESTORE = Object.fromEntries(
  Object.entries(DADOS_PARA_FIRESTORE).map(([camel, snake]) => [snake, camel])
) as Record<string, keyof DadosFichaMedica>

function timestampToISO(value: unknown): string | undefined {
  if (!value) return undefined
  if (typeof value === 'string') return value
  if (value instanceof Date) return value.toISOString()
  if (typeof value === 'object') {
    const withToDate = value as { toDate?: () => Date }
    if (typeof withToDate.toDate === 'function') {
      try {
        return withToDate.toDate().toISOString()
      } catch {
        return undefined
      }
    }
    const seconds = (value as { seconds?: number }).seconds
    if (typeof seconds === 'number') return new Date(seconds * 1000).toISOString()
  }
  return undefined
}

function dadosParaFirestore(dados?: DadosFichaMedica | null): Record<string, string> | null {
  if (!dados) return null
  const resultado: Record<string, string> = {}
  for (const [chave, valor] of Object.entries(dados)) {
    const campo = DADOS_PARA_FIRESTORE[chave as keyof DadosFichaMedica]
    if (campo && typeof valor === 'string' && valor.trim()) {
      resultado[campo] = valor.trim()
    }
  }
  return Object.keys(resultado).length > 0 ? resultado : null
}

function dadosDoFirestore(valor: unknown): DadosFichaMedica | null {
  if (!valor || typeof valor !== 'object') return null
  const dados: DadosFichaMedica = {}
  for (const [chave, conteudo] of Object.entries(valor)) {
    const campo = DADOS_DO_FIRESTORE[chave]
    if (campo && typeof conteudo === 'string' && conteudo.trim()) {
      dados[campo] = conteudo
    }
  }
  return Object.keys(dados).length > 0 ? dados : null
}

function anexoDoFirestore(data: Record<string, unknown>): AnexoFichaMedica | null {
  const caminhoStorage = data.anexo_caminho_storage
  if (typeof caminhoStorage !== 'string' || !caminhoStorage) return null
  return {
    caminhoStorage,
    nomeArquivo:
      typeof data.anexo_nome_arquivo === 'string' ? data.anexo_nome_arquivo : 'ficha-medica',
    tipoConteudo:
      typeof data.anexo_tipo_conteudo === 'string'
        ? data.anexo_tipo_conteudo
        : 'application/octet-stream',
    tamanhoBytes:
      typeof data.anexo_tamanho_bytes === 'number' ? data.anexo_tamanho_bytes : 0,
    enviadoEm: timestampToISO(data.anexo_enviado_em),
  }
}

function fichaDoFirestore(alunoId: string, data: Record<string, unknown>): FichaMedica {
  return {
    alunoId,
    tiposDeficiencia: Array.isArray(data.tipos_deficiencia)
      ? data.tipos_deficiencia.filter((item): item is string => typeof item === 'string')
      : [],
    codigosCid: Array.isArray(data.codigos_cid)
      ? data.codigos_cid.filter((item): item is string => typeof item === 'string')
      : [],
    formatoFichaMedica: data.formato_ficha_medica === 'anexo' ? 'anexo' : 'digital',
    dadosFichaMedica: dadosDoFirestore(data.dados_ficha_medica),
    anexo: anexoDoFirestore(data),
    atualizadoPor: typeof data.atualizado_por === 'string' ? data.atualizado_por : 'sistema',
    atualizadoEm: timestampToISO(data.atualizado_em),
  }
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = () => reject(reader.error || new Error('Falha ao ler arquivo.'))
    reader.readAsDataURL(file)
  })
}

function nomeSeguroArquivo(nome: string): string {
  const limpo = nome
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/(^-|-$)/g, '')
  return limpo || 'ficha-medica'
}

function validarArquivo(file: File): void {
  if (!TIPOS_ANEXO_FICHA_MEDICA.includes(file.type as (typeof TIPOS_ANEXO_FICHA_MEDICA)[number])) {
    throw new Error('Envie a ficha médica em PDF, JPG, PNG ou WEBP.')
  }
  if (file.size <= 0) {
    throw new Error('O arquivo da ficha médica está vazio.')
  }
  if (file.size > MAX_FICHA_MEDICA_BYTES) {
    throw new Error(
      `A ficha médica deve ter no máximo ${Math.round(MAX_FICHA_MEDICA_BYTES / 1024 / 1024)} MB.`
    )
  }
}

export function getStoredFichaMedica(alunoId: string): FichaMedica | null {
  try {
    const raw = localStorage.getItem(`${LOCAL_STORAGE_KEY_PREFIX}${alunoId}`)
    return raw ? (JSON.parse(raw) as FichaMedica) : null
  } catch {
    return null
  }
}

export function saveStoredFichaMedica(alunoId: string, ficha: FichaMedica): void {
  try {
    localStorage.setItem(`${LOCAL_STORAGE_KEY_PREFIX}${alunoId}`, JSON.stringify(ficha))
  } catch {
    // ignore
  }
}

/**
 * Consulta a ficha médica em alunos/{alunoId}/ficha_medica/ficha.
 * Apenas esse caminho canônico é lido: não há fallback para documentos legados.
 * Falhas de permissão são propagadas e nunca tratadas como "ficha vazia".
 */
export async function getFichaMedica(alunoId: string): Promise<FichaMedica | null> {
  if (isDemoModeEnabled()) {
    return getStoredFichaMedica(alunoId)
  }

  const snap = await getDoc(doc(db, 'alunos', alunoId, 'ficha_medica', 'ficha'))
  return snap.exists() ? fichaDoFirestore(alunoId, snap.data()) : null
}

/**
 * Envia o anexo para o Firebase Storage. O Firestore guarda apenas o caminho
 * e os metadados; nenhum conteúdo binário é gravado na ficha.
 */
export async function uploadAnexoFichaMedica(
  alunoId: string,
  file: File,
  userId: string
): Promise<AnexoFichaMedica> {
  validarArquivo(file)

  if (isDemoModeEnabled()) {
    return {
      caminhoStorage: `demo/alunos/${alunoId}/ficha_medica/${Date.now()}-${nomeSeguroArquivo(file.name)}`,
      nomeArquivo: file.name,
      tipoConteudo: file.type,
      tamanhoBytes: file.size,
      enviadoEm: new Date().toISOString(),
      dataUrl: await fileToDataUrl(file),
    }
  }

  const caminho = `alunos/${alunoId}/ficha_medica/${Date.now()}-${nomeSeguroArquivo(file.name)}`
  await confirmWrite(
    'enviar o anexo da ficha médica',
    uploadBytes(ref(storage, caminho), file, {
      contentType: file.type,
      customMetadata: { aluno_id: alunoId, enviado_por: userId },
    })
  )

  return {
    caminhoStorage: caminho,
    nomeArquivo: file.name,
    tipoConteudo: file.type,
    tamanhoBytes: file.size,
    enviadoEm: new Date().toISOString(),
  }
}

export async function removerAnexoFichaMedica(anexo: AnexoFichaMedica): Promise<void> {
  if (isDemoModeEnabled()) return
  try {
    await deleteObject(ref(storage, anexo.caminhoStorage))
  } catch {
    // A limpeza de um anexo antigo é best-effort: a ficha já foi confirmada.
  }
}

export async function getFichaMedicaAnexoUrl(anexo: AnexoFichaMedica): Promise<string> {
  if (anexo.dataUrl) return anexo.dataUrl
  return getDownloadURL(ref(storage, anexo.caminhoStorage))
}

/**
 * Salva a ficha médica no caminho canônico. Se um novo arquivo for enviado,
 * ele é gravado primeiro no Storage; o documento só é alterado depois. Em caso
 * de falha, o anexo recém-enviado é removido para não deixar órfãos.
 */
export async function salvarFichaMedica(
  alunoId: string,
  input: SalvarFichaMedicaInput,
  userId: string
): Promise<FichaMedica> {
  const tiposDeficiencia = input.tiposDeficiencia
    .map((item) => item.trim())
    .filter(Boolean)
  if (tiposDeficiencia.length === 0) {
    throw new Error('Informe ao menos um tipo de deficiência.')
  }

  const codigosCid = input.codigosCid.map((item) => item.trim()).filter(Boolean)
  const anexoAnterior = input.anexo ?? null
  let anexo = input.removerAnexo ? null : anexoAnterior
  let anexoEnviado: AnexoFichaMedica | null = null

  if (input.novoAnexo) {
    anexoEnviado = await uploadAnexoFichaMedica(alunoId, input.novoAnexo, userId)
    anexo = anexoEnviado
  }

  if (input.formatoFichaMedica === 'anexo' && !anexo) {
    throw new Error('Anexe o arquivo da ficha médica.')
  }

  const dadosFichaMedica =
    input.formatoFichaMedica === 'digital' ? input.dadosFichaMedica ?? null : null
  const agoraISO = new Date().toISOString()

  const fichaLocal: FichaMedica = {
    alunoId,
    tiposDeficiencia,
    codigosCid,
    formatoFichaMedica: input.formatoFichaMedica,
    dadosFichaMedica,
    anexo,
    atualizadoPor: userId,
    atualizadoEm: agoraISO,
  }

  if (isDemoModeEnabled()) {
    saveStoredFichaMedica(alunoId, fichaLocal)
    if (anexoAnterior && anexoAnterior.caminhoStorage !== anexo?.caminhoStorage) {
      await removerAnexoFichaMedica(anexoAnterior)
    }
    return fichaLocal
  }

  const payload = {
    tipos_deficiencia: tiposDeficiencia,
    codigos_cid: codigosCid,
    formato_ficha_medica: input.formatoFichaMedica,
    dados_ficha_medica: dadosParaFirestore(dadosFichaMedica),
    anexo_caminho_storage: anexo?.caminhoStorage ?? null,
    anexo_nome_arquivo: anexo?.nomeArquivo ?? null,
    anexo_tipo_conteudo: anexo?.tipoConteudo ?? null,
    anexo_tamanho_bytes: anexo?.tamanhoBytes ?? null,
    anexo_enviado_em: anexo
      ? anexo.enviadoEm
        ? Timestamp.fromDate(new Date(anexo.enviadoEm))
        : serverTimestamp()
      : null,
    atualizado_por: userId,
    atualizado_em: serverTimestamp(),
  }

  try {
    await confirmWrite(
      'salvar ficha médica',
      setDoc(doc(db, 'alunos', alunoId, 'ficha_medica', 'ficha'), payload)
    )
  } catch (err) {
    if (anexoEnviado) await removerAnexoFichaMedica(anexoEnviado)
    throw err
  }

  if (anexoAnterior && anexoAnterior.caminhoStorage !== anexo?.caminhoStorage) {
    await removerAnexoFichaMedica(anexoAnterior)
  }

  return fichaLocal
}

export function canReadMedicalRecord(papel?: UserRole | null): boolean {
  return papel === 'direcao' || papel === 'pedagogia'
}

export function canEditMedicalRecord(papel?: UserRole | null): boolean {
  return papel === 'direcao' || papel === 'pedagogia'
}
