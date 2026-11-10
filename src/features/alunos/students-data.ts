export type StudentStatus = 'Ativo' | 'Inativo'

export type ReportEntry = {
  date: string
  title: string
  summary: string
}

export type EvolutionEntry = {
  date: string
  area: string
  note: string
}

export type ContactEntry = {
  id?: string
  faltaDate: string
  contactDate: string
  type: string
  responsible: string
  note: string
  reason?: string
  status?: string
  guardianId?: string
  guardianName?: string
  guardianRelationship?: string
  guardianContact?: string
}

export type Guardian = {
  id?: string
  nome: string
  parentesco: string
  telefone: string
  telefoneAlternativo: string
  email: string
  principal: boolean
  ativo: boolean
}

export type DocumentoTipo = 'ficha_medica' | 'ficha_matricula' | 'autorizacao_imagem' | 'outro'

export type DocumentEntry = {
  id: string
  tipo: DocumentoTipo
  // dataUrl armazena o arquivo em base64 (DataURL) dentro do Firestore, evitando custo do Storage
  dataUrl: string
  nomeArquivoOriginal: string
  tipoConteudo: string
  tamanhoBytes: number
  enviadoPor: string
  enviadoEm: string
  // Campos legados (dados existentes antes desta refatoração)
  name?: string
  attachedAt?: string
  kind?: 'pdf' | 'lgpd'
}

export type Student = {
  id: string
  name: string
  birthDate: string
  sexo: string
  turma: string
  turmaId?: string
  turmaTurno: string
  deficiencia: string
  cid: string
  status: StudentStatus
  observacoes: string
  /** Consentimento persistido do responsável para uso de imagem (LGPD). */
  usoImagemAutorizado: boolean
  /** Data/hora ISO em que o consentimento de imagem foi registrado. */
  consentimentoImagemEm?: string
  /** Consentimento persistido para tratamento de dados pessoais (LGPD). */
  tratamentoDadosAutorizado: boolean
  responsavelNome: string
  parentesco: string
  telefone: string
  email: string
  responsaveis?: Guardian[]
  oficinas: string[]
  grauDependencia?: string
  documentos: DocumentEntry[]
  faltasConsecutivas: number
  frequenciaMedia: number
  reports: ReportEntry[]
  evolution: EvolutionEntry[]
  contacts: ContactEntry[]
  activities: string[]
}

export function calculateAge(birthDate: string): number {
  const [day, month, year] = birthDate.split('/').map(Number)
  const birth = new Date(year, month - 1, day)
  const today = new Date()
  let age = today.getFullYear() - birth.getFullYear()
  const hasHadBirthdayThisYear =
    today.getMonth() > birth.getMonth() ||
    (today.getMonth() === birth.getMonth() && today.getDate() >= birth.getDate())
  if (!hasHadBirthdayThisYear) age -= 1
  return age
}

// ---------------------------------------------------------------------------
// Dados fictícios usados SOMENTE no modo demonstração (login de convidado).
// Não são fallback de leitura: o fluxo real nunca exibe esta lista.
// Nomes, contatos e documentos são genéricos e não pertencem a pessoas reais.
// ---------------------------------------------------------------------------
export const demoStudents: Student[] = [
  {
    id: 'demo-aluno-1',
    name: 'Aluno Exemplo 01',
    birthDate: '01/01/2010',
    sexo: 'Não informado',
    turma: 'Turma Exemplo A',
    turmaTurno: 'Manhã (8h–12h)',
    deficiencia: 'Exemplo',
    cid: 'Exemplo',
    status: 'Ativo',
    observacoes: 'Registro fictício criado apenas para demonstração.',
    usoImagemAutorizado: true,
    consentimentoImagemEm: '2026-01-10T13:00:00.000Z',
    tratamentoDadosAutorizado: true,
    responsavelNome: 'Responsável Exemplo 01',
    parentesco: 'Responsável',
    telefone: '(00) 00000-0000',
    email: 'exemplo01@exemplo.test',
    oficinas: ['Oficina Exemplo A', 'Oficina Exemplo B'],
    documentos: [],
    faltasConsecutivas: 1,
    frequenciaMedia: 80,
    reports: [
      { date: '01/06/2026', title: 'Relatório de exemplo', summary: 'Conteúdo fictício de demonstração.' },
    ],
    evolution: [
      { date: '01/06/2026', area: 'Exemplo', note: 'Observação fictícia de demonstração.' },
    ],
    contacts: [],
    activities: ['Oficina Exemplo A — 01/06/2026'],
  },
  {
    id: 'demo-aluno-2',
    name: 'Aluno Exemplo 02',
    birthDate: '02/02/2011',
    sexo: 'Não informado',
    turma: 'Turma Exemplo B',
    turmaTurno: 'Tarde (13h–17h)',
    deficiencia: 'Exemplo',
    cid: 'Exemplo',
    status: 'Ativo',
    observacoes: 'Registro fictício criado apenas para demonstração.',
    usoImagemAutorizado: true,
    consentimentoImagemEm: '2026-02-12T14:30:00.000Z',
    tratamentoDadosAutorizado: true,
    responsavelNome: 'Responsável Exemplo 02',
    parentesco: 'Responsável',
    telefone: '(00) 00000-0000',
    email: 'exemplo02@exemplo.test',
    oficinas: ['Oficina Exemplo B'],
    documentos: [],
    faltasConsecutivas: 0,
    frequenciaMedia: 90,
    reports: [],
    evolution: [],
    contacts: [],
    activities: ['Oficina Exemplo B — 02/06/2026'],
  },
  {
    id: 'demo-aluno-3',
    name: 'Aluno Exemplo 03',
    birthDate: '03/03/2012',
    sexo: 'Não informado',
    turma: 'Turma Exemplo A',
    turmaTurno: 'Manhã (8h–12h)',
    deficiencia: 'Exemplo',
    cid: 'Exemplo',
    status: 'Ativo',
    observacoes: 'Registro fictício criado apenas para demonstração.',
    usoImagemAutorizado: false,
    tratamentoDadosAutorizado: true,
    responsavelNome: 'Responsável Exemplo 03',
    parentesco: 'Responsável',
    telefone: '(00) 00000-0000',
    email: 'exemplo03@exemplo.test',
    oficinas: ['Oficina Exemplo C'],
    documentos: [],
    faltasConsecutivas: 4,
    frequenciaMedia: 70,
    reports: [],
    evolution: [],
    contacts: [],
    activities: [],
  },
  {
    id: 'demo-aluno-4',
    name: 'Aluno Exemplo 04',
    birthDate: '04/04/2013',
    sexo: 'Não informado',
    turma: 'Turma Exemplo C',
    turmaTurno: 'Tarde (13h–17h)',
    deficiencia: 'Exemplo',
    cid: 'Exemplo',
    status: 'Inativo',
    observacoes: 'Registro fictício criado apenas para demonstração.',
    usoImagemAutorizado: true,
    consentimentoImagemEm: '2026-03-05T10:15:00.000Z',
    tratamentoDadosAutorizado: true,
    responsavelNome: 'Responsável Exemplo 04',
    parentesco: 'Responsável',
    telefone: '(00) 00000-0000',
    email: 'exemplo04@exemplo.test',
    oficinas: [],
    documentos: [],
    faltasConsecutivas: 0,
    frequenciaMedia: 100,
    reports: [],
    evolution: [],
    contacts: [],
    activities: [],
  },
]

export type AttendanceStatus = 'presente' | 'ausente' | 'justificado'

export type DailyAttendanceRecord = {
  studentId: string
  date: string
  status: AttendanceStatus
  observation: string
  turmaId: string
  oficina?: string
}

export type AttendanceSession = {
  id: string
  date: string
  turmaId: string
  scope: 'turma' | 'oficina'
  oficinaName?: string
  registeredBy: string
  registeredAt: string
  records: Record<string, { status: AttendanceStatus; observation: string }>
}

// Sessões fictícias do modo demonstração (nunca usadas como fallback real).
export const demoAttendanceSessions: Record<string, AttendanceSession> = {
  '2026-06-01_demo-turma-a_geral': {
    id: '2026-06-01_demo-turma-a_geral',
    date: '2026-06-01',
    turmaId: 'demo-turma-a',
    scope: 'turma',
    registeredBy: 'Demonstração',
    registeredAt: '2026-06-01T09:30:00Z',
    records: {
      'demo-aluno-1': { status: 'ausente', observation: 'Registro fictício.' },
      'demo-aluno-3': { status: 'presente', observation: '' },
    },
  },
}

export function findDemoStudent(id: string): Student | undefined {
  return demoStudents.find((student) => student.id === id)
}

export function saveAttendanceSession(session: AttendanceSession) {
  demoAttendanceSessions[session.id] = session

  // Atualiza a sequência de faltas apenas nos dados fictícios de demonstração.
  Object.entries(session.records).forEach(([studentId, record]) => {
    const student = findDemoStudent(studentId)
    if (student) {
      if (record.status === 'ausente') {
        student.faltasConsecutivas += 1
      } else if (record.status === 'presente') {
        student.faltasConsecutivas = 0
      }
    }
  })
}

export function addContactToStudent(studentId: string, contact: ContactEntry) {
  const student = findDemoStudent(studentId)
  if (student) {
    student.contacts.unshift(contact)
  }
}
