import {
  collection,
  doc,
  getDoc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'
import { confirmWrite } from '../lib/persistence'
import { db } from '../lib/firebase'
import type {
  ModeloFormulario,
  ModeloFormularioInput,
  TipoCampo,
} from '../types/modelosFormulario'
import { TIPOS_CAMPO, VALID_TIPOS_MODELO } from '../types/modelosFormulario'

const COLLECTION = 'modelos_formulario'

function asTipoCampo(value: unknown): TipoCampo {
  const tipo = String(value || 'texto')
  return Object.prototype.hasOwnProperty.call(TIPOS_CAMPO, tipo)
    ? (tipo as TipoCampo)
    : 'texto'
}

function asModelo(id: string, data: Record<string, unknown>): ModeloFormulario {
  const campos = Array.isArray(data.campos) ? data.campos : []
  return {
    id,
    nome: String(data.nome || ''),
    tipo_modelo: String(data.tipo_modelo || 'avaliacao_pedagogica'),
    versao: typeof data.versao === 'number' ? data.versao : 1,
    campos: campos.map((c: Record<string, unknown>) => ({
      chave: String(c.chave || ''),
      rotulo: String(c.rotulo || ''),
      tipo: asTipoCampo(c.tipo),
      obrigatorio: Boolean(c.obrigatorio === true),
      opcoes: Array.isArray(c.opcoes) ? (c.opcoes as string[]).map(String) : [],
    })),
    ativo: data.ativo !== false,
    criado_por: String(data.criado_por || ''),
    criado_em: data.criado_em,
    atualizado_em: data.atualizado_em,
  }
}

export function validarModelo(input: ModeloFormularioInput): string | null {
  if (!input.nome.trim()) return 'Informe o nome do modelo.'
  if (!VALID_TIPOS_MODELO.includes(input.tipo_modelo)) return 'Tipo de modelo inválido.'
  if (!input.campos || input.campos.length === 0)
    return 'Informe ao menos um campo para o formulário.'
  const chaves: string[] = []
  for (const campo of input.campos) {
    if (!campo.chave.trim()) return 'Preencha a chave de todos os campos.'
    if (!campo.rotulo.trim()) return 'Preencha o rótulo de todos os campos.'
    if (campo.tipo === 'selecao' && (!campo.opcoes || campo.opcoes.length === 0))
      return `Informe as opções para o campo "${campo.rotulo}".`
    if (chaves.includes(campo.chave)) return `Chave duplicada: "${campo.chave}".`
    chaves.push(campo.chave)
  }
  return null
}

export async function salvarModelo(
  input: ModeloFormularioInput,
  userId: string
): Promise<string> {
  const error = validarModelo(input)
  if (error) throw new Error(error)

  const id = input.id || doc(collection(db, COLLECTION)).id
  const modeloRef = doc(db, COLLECTION, id)
  const existing = await getDoc(modeloRef)

  const payload = {
    nome: input.nome.trim(),
    tipo_modelo: input.tipo_modelo,
    versao: input.versao ?? 1,
    campos: input.campos.map((c) => ({
      chave: c.chave.trim(),
      rotulo: c.rotulo.trim(),
      tipo: c.tipo,
      obrigatorio: c.obrigatorio === true,
      opcoes: c.opcoes.map((o) => o.trim()).filter(Boolean),
    })),
    ativo: input.ativo === true,
    criado_por: userId,
    atualizado_por: userId,
    atualizado_em: serverTimestamp(),
    ...(!existing.exists() ? { criado_em: serverTimestamp() } : {}),
  }

  const operacao = existing.exists() ? 'atualizar o modelo de formulário' : 'criar o modelo de formulário'
  if (existing.exists()) {
    await confirmWrite(operacao, updateDoc(modeloRef, payload))
  } else {
    await confirmWrite(operacao, setDoc(modeloRef, payload))
  }
  return id
}

// Cria uma nova versão do modelo a partir de um existente. A versão atual fica
// preservada para que relatórios antigos continuem exibindo a estrutura com que
// foram criados.
export async function novaVersaoModelo(
  modeloId: string,
  userId: string
): Promise<string> {
  const modelo = await obterModelo(modeloId)
  if (!modelo) throw new Error('Modelo não encontrado.')
  return salvarModelo(
    {
      ...modelo,
      id: undefined,
      versao: modelo.versao + 1,
      ativo: true,
    },
    userId
  )
}

export async function obterModelo(id: string): Promise<ModeloFormulario | null> {
  const snap = await getDoc(doc(db, COLLECTION, id))
  return snap.exists() ? asModelo(snap.id, snap.data()) : null
}

export async function listarModelos(ativosApenas = false): Promise<ModeloFormulario[]> {
  // Compartilha a consulta da administração, sem exigir índice composto
  // para combinar o estado ativo com a ordenação por versão.
  const q = query(collection(db, COLLECTION), orderBy('versao', 'desc'))
  const snap = await getDocs(q)
  const modelos = snap.docs.map((item) => asModelo(item.id, item.data() as Record<string, unknown>))
  return ativosApenas ? modelos.filter((modelo) => modelo.ativo) : modelos
}

export async function listarModelosAtivos(): Promise<ModeloFormulario[]> {
  return listarModelos(true)
}

export function novoIdModelo(): string {
  return doc(collection(db, COLLECTION)).id
}
