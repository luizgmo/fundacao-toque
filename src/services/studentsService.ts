import {
  collection,
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
} from 'firebase/firestore'
import { db } from '../lib/firebase'
import type { Student, StudentStatus } from '../features/alunos/students-data'
import { students as fallbackStudents } from '../features/alunos/students-data'

const ALUNOS_COLLECTION = 'alunos'

// Converte documento Firestore para a interface Student da UI
export function docToStudent(id: string, data: any): Student {
  // Converte data de YYYY-MM-DD para DD/MM/AAAA se necessário
  let formattedBirth = data.data_nascimento || data.birthDate || ''
  if (formattedBirth && formattedBirth.includes('-')) {
    const [y, m, d] = formattedBirth.split('-')
    if (y && m && d) formattedBirth = `${d}/${m}/${y}`
  }

  // Mapeia status
  let status: StudentStatus = 'Ativo'
  const rawStatus = (data.status || '').toLowerCase()
  if (rawStatus === 'inativo' || rawStatus === 'inativa') status = 'Inativo'
  else if (rawStatus.includes('acompanhamento')) status = 'Em acompanhamento'

  return {
    id,
    name: data.nome_completo || data.name || 'Sem nome',
    birthDate: formattedBirth,
    sexo: data.sexo || 'Não informado',
    turma: data.turma || 'Turma A',
    turmaTurno: data.turma_turno || data.turmaTurno || 'Manhã (8h–12h)',
    deficiencia:
      data.deficiencia ||
      (Array.isArray(data.tipos_deficiencia) ? data.tipos_deficiencia.join(', ') : 'Não informada'),
    cid: data.cid || (Array.isArray(data.codigos_cid) ? data.codigos_cid.join(', ') : '—'),
    status,
    observacoes: data.observacoes || '',
    responsavelNome: data.responsavel_nome || data.responsavelNome || '—',
    parentesco: data.responsavel_parentesco || data.parentesco || 'Mãe',
    telefone: data.responsavel_telefone || data.telefone || '',
    email: data.responsavel_email || data.email || '',
    oficinas: Array.isArray(data.oficinas) ? data.oficinas : [],
    documentos: Array.isArray(data.documentos)
      ? data.documentos
      : [
          {
            name: data.ficha_medica_nome || 'Ficha Médica',
            attachedAt: 'Conforme cadastro',
            kind: 'pdf' as const,
          },
          ...(data.uso_imagem_autorizado
            ? [{ name: 'LGPD Autorizada', attachedAt: 'Conforme cadastro', kind: 'lgpd' as const }]
            : []),
        ],
    faltasConsecutivas: data.faltas_consecutivas ?? data.faltasConsecutivas ?? 0,
    frequenciaMedia: data.frequencia_media ?? data.frequenciaMedia ?? 100,
    reports: Array.isArray(data.reports) ? data.reports : [],
    evolution: Array.isArray(data.evolution) ? data.evolution : [],
    contacts: Array.isArray(data.contacts) ? data.contacts : [],
    activities: Array.isArray(data.activities) ? data.activities : [],
  }
}

// Inscrição em tempo real com fallback para dados locais
export function subscribeToStudents(
  onSuccess: (students: Student[]) => void,
  onError?: (error: Error) => void
) {
  const colRef = collection(db, ALUNOS_COLLECTION)
  return onSnapshot(
    colRef,
    (snapshot) => {
      if (snapshot.empty) {
        // Se a coleção estiver vazia no banco, usa a lista padrão para demonstração
        onSuccess(fallbackStudents)
      } else {
        const list: Student[] = []
        snapshot.forEach((docSnap) => {
          list.push(docToStudent(docSnap.id, docSnap.data()))
        })
        onSuccess(list)
      }
    },
    (err) => {
      console.warn('Erro ao escutar Firestore alunos, usando fallback:', err)
      if (onError) onError(err)
      else onSuccess(fallbackStudents)
    }
  )
}

// Busca aluno por ID
export async function getStudentById(id: string): Promise<Student | null> {
  try {
    const snap = await getDoc(doc(db, ALUNOS_COLLECTION, id))
    if (snap.exists()) {
      return docToStudent(snap.id, snap.data())
    }
  } catch (err) {
    console.warn('Erro ao buscar aluno por ID no Firestore:', err)
  }
  const fallback = fallbackStudents.find((s) => s.id === id)
  return fallback || null
}

export type StudentInput = {
  id?: string
  nome: string
  nascimento: string
  sexo: string
  deficiencia: string
  cid: string
  observacoes: string
  responsavelNome: string
  parentesco: string
  cpf?: string
  rg?: string
  telefonePrincipal: string
  telefoneSecundario?: string
  email?: string
  endereco?: string
  turmas: string[]
  oficinas: string[]
  grauDependencia?: string
  fichaMedica?: string
  fichaMatricula?: string
  lgpdImagem?: boolean
  lgpdDados?: boolean
}

// Criar aluno no Firestore
export async function createStudent(input: StudentInput): Promise<string> {
  const id =
    input.id ||
    input.nome
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)/g, '') + `-${Date.now().toString().slice(-4)}`

  const studentData = {
    nome_completo: input.nome,
    nome_busca: input.nome.toLowerCase(),
    data_nascimento: input.nascimento,
    sexo: input.sexo,
    status: 'ativo',
    uso_imagem_autorizado: Boolean(input.lgpdImagem),
    tratamento_dados_autorizado: Boolean(input.lgpdDados),
    tipos_deficiencia: input.deficiencia ? [input.deficiencia] : [],
    codigos_cid: input.cid ? [input.cid] : [],
    observacoes: input.observacoes || '',
    turma: input.turmas[0] || 'Turma A',
    turma_turno: input.turmas[0]?.includes('b') ? 'Tarde (13h–17h)' : 'Manhã (8h–12h)',
    oficinas: input.oficinas,
    responsavel_nome: input.responsavelNome,
    responsavel_parentesco: input.parentesco,
    responsavel_cpf: input.cpf || '',
    responsavel_rg: input.rg || '',
    responsavel_telefone: input.telefonePrincipal,
    responsavel_telefone_secundario: input.telefoneSecundario || '',
    responsavel_email: input.email || '',
    responsavel_endereco: input.endereco || '',
    grau_dependencia: input.grauDependencia || '',
    ficha_medica_nome: input.fichaMedica || '',
    ficha_matricula_nome: input.fichaMatricula || '',
    faltas_consecutivas: 0,
    frequencia_media: 100,
    reports: [],
    evolution: [],
    contacts: [],
    activities: [],
    criado_em: serverTimestamp(),
    atualizado_em: serverTimestamp(),
  }

  await setDoc(doc(db, ALUNOS_COLLECTION, id), studentData)

  // Grava também nas subcoleções conforme modelagem.md
  try {
    const guardianRef = doc(collection(db, `${ALUNOS_COLLECTION}/${id}/responsaveis`))
    await setDoc(guardianRef, {
      nome_completo: input.responsavelNome,
      parentesco: input.parentesco,
      cpf: input.cpf || '',
      rg: input.rg || '',
      telefone: input.telefonePrincipal,
      telefone_alternativo: input.telefoneSecundario || null,
      email: input.email || null,
      principal: true,
      criado_em: serverTimestamp(),
    })

    const healthRef = doc(db, `${ALUNOS_COLLECTION}/${id}/ficha_medica/geral`)
    await setDoc(healthRef, {
      tipos_deficiencia: input.deficiencia ? [input.deficiencia] : [],
      codigos_cid: input.cid ? [input.cid] : [],
      anexo_nome: input.fichaMedica || null,
      grau_dependencia: input.grauDependencia || null,
      atualizado_em: serverTimestamp(),
    })
  } catch (subErr) {
    console.warn('Subcoleções adicionais não gravadas:', subErr)
  }

  return id
}

// Atualizar aluno no Firestore
export async function updateStudent(id: string, input: Partial<StudentInput>): Promise<void> {
  const updateData: Record<string, any> = {
    atualizado_em: serverTimestamp(),
  }

  if (input.nome !== undefined) {
    updateData.nome_completo = input.nome
    updateData.nome_busca = input.nome.toLowerCase()
  }
  if (input.nascimento !== undefined) updateData.data_nascimento = input.nascimento
  if (input.sexo !== undefined) updateData.sexo = input.sexo
  if (input.deficiencia !== undefined) updateData.tipos_deficiencia = [input.deficiencia]
  if (input.cid !== undefined) updateData.codigos_cid = [input.cid]
  if (input.observacoes !== undefined) updateData.observacoes = input.observacoes
  if (input.turmas && input.turmas.length > 0) {
    updateData.turma = input.turmas[0]
  }
  if (input.oficinas !== undefined) updateData.oficinas = input.oficinas
  if (input.responsavelNome !== undefined) updateData.responsavel_nome = input.responsavelNome
  if (input.parentesco !== undefined) updateData.responsavel_parentesco = input.parentesco
  if (input.cpf !== undefined) updateData.responsavel_cpf = input.cpf
  if (input.rg !== undefined) updateData.responsavel_rg = input.rg
  if (input.telefonePrincipal !== undefined) updateData.responsavel_telefone = input.telefonePrincipal
  if (input.telefoneSecundario !== undefined) {
    updateData.responsavel_telefone_secundario = input.telefoneSecundario
  }
  if (input.email !== undefined) updateData.responsavel_email = input.email
  if (input.endereco !== undefined) updateData.responsavel_endereco = input.endereco
  if (input.grauDependencia !== undefined) updateData.grau_dependencia = input.grauDependencia
  if (input.lgpdImagem !== undefined) updateData.uso_imagem_autorizado = input.lgpdImagem
  if (input.lgpdDados !== undefined) updateData.tratamento_dados_autorizado = input.lgpdDados

  await updateDoc(doc(db, ALUNOS_COLLECTION, id), updateData)
}

// Excluir aluno no Firestore
export async function deleteStudent(id: string): Promise<void> {
  await deleteDoc(doc(db, ALUNOS_COLLECTION, id))
}
