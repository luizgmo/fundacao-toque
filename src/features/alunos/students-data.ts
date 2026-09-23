export type StudentStatus = 'Ativo' | 'Em acompanhamento' | 'Inativo'

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
  faltaDate: string
  contactDate: string
  type: string
  responsible: string
  note: string
  reason?: string
  status?: string
}

export type DocumentEntry = {
  name: string
  attachedAt: string
  kind: 'pdf' | 'lgpd'
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
  responsavelNome: string
  parentesco: string
  telefone: string
  email: string
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

export const students: Student[] = [
  {
    id: 'lucas-oliveira-santos',
    name: 'Lucas Oliveira Santos',
    birthDate: '15/03/2008',
    sexo: 'Masculino',
    turma: 'Turma A',
    turmaTurno: 'Manhã (8h–12h)',
    deficiencia: 'Intelectual',
    cid: 'F71',
    status: 'Ativo',
    observacoes: 'Aluno participativo, gosta de atividades musicais.',
    responsavelNome: 'Maria Oliveira Santos',
    parentesco: 'Mãe',
    telefone: '(16) 99999-9999',
    email: 'maria.oliveira@email.com',
    oficinas: ['Musicalização', 'Horta/NEMA'],
    documentos: [
      { name: 'ficha_medica.pdf', attachedAt: '15/02/2026', kind: 'pdf' },
      { name: 'matricula.pdf', attachedAt: '15/02/2026', kind: 'pdf' },
      { name: 'LGPD', attachedAt: '15/02/2026', kind: 'lgpd' },
    ],
    faltasConsecutivas: 5,
    frequenciaMedia: 82,
    reports: [
      { date: '28/08/2026', title: '1º semestre 2026', summary: 'Evolução gradual na participação das atividades coletivas.' },
      { date: '18/12/2025', title: 'Relatório anual 2025', summary: 'Bom progresso na comunicação e maior autonomia nas oficinas.' },
    ],
    evolution: [
      { date: '02/09/2026', area: 'Social', note: 'Maior interação com os colegas durante a musicalização.' },
      { date: '10/07/2026', area: 'Cognitiva', note: 'Melhor organização da rotina diária.' },
    ],
    contacts: [
      { faltaDate: '28/08/2026', contactDate: '29/08/2026', type: 'Ligação telefônica', responsible: 'Roberto Mendes', note: 'Mãe informou consulta médica.' },
    ],
    activities: ['Musicalização — 02/09/2026', 'Horta/NEMA — 30/08/2026', 'Musicalização — 26/08/2026'],
  },
  {
    id: 'beatriz-santos-lima',
    name: 'Beatriz Santos Lima',
    birthDate: '22/07/2010',
    sexo: 'Feminino',
    turma: 'Turma B',
    turmaTurno: 'Tarde (13h–17h)',
    deficiencia: 'Múltipla',
    cid: 'G80',
    status: 'Ativo',
    observacoes: 'Necessita apoio para deslocamento entre salas.',
    responsavelNome: 'João Lima',
    parentesco: 'Pai',
    telefone: '(16) 98888-1234',
    email: 'joao.lima@email.com',
    oficinas: ['Dança', 'Artes'],
    documentos: [
      { name: 'ficha_medica.pdf', attachedAt: '03/03/2026', kind: 'pdf' },
      { name: 'LGPD', attachedAt: '03/03/2026', kind: 'lgpd' },
    ],
    faltasConsecutivas: 0,
    frequenciaMedia: 94,
    reports: [{ date: '10/07/2026', title: '1º semestre 2026', summary: 'Boa adaptação às oficinas de dança e artes.' }],
    evolution: [{ date: '15/06/2026', area: 'Motora', note: 'Maior firmeza nos deslocamentos com apoio.' }],
    contacts: [],
    activities: ['Dança — 01/09/2026', 'Artes — 28/08/2026'],
  },
  {
    id: 'pedro-henrique-souza',
    name: 'Pedro Henrique Souza',
    birthDate: '10/11/2005',
    sexo: 'Masculino',
    turma: 'Turma C',
    turmaTurno: 'Manhã (8h–12h)',
    deficiencia: 'Intelectual',
    cid: 'F72',
    status: 'Ativo',
    observacoes: 'Gosta de atividades esportivas e de culinária.',
    responsavelNome: 'Carla Souza',
    parentesco: 'Mãe',
    telefone: '(16) 97777-4321',
    email: 'carla.souza@email.com',
    oficinas: ['Esporte', 'Culinária'],
    documentos: [{ name: 'ficha_medica.pdf', attachedAt: '20/01/2026', kind: 'pdf' }],
    faltasConsecutivas: 0,
    frequenciaMedia: 90,
    reports: [{ date: '05/07/2026', title: '1º semestre 2026', summary: 'Bom desempenho nas atividades em grupo.' }],
    evolution: [{ date: '20/06/2026', area: 'Social', note: 'Maior liderança nas atividades esportivas.' }],
    contacts: [],
    activities: ['Esporte — 03/09/2026', 'Culinária — 27/08/2026'],
  },
  {
    id: 'fernanda-lima-costa',
    name: 'Fernanda Lima Costa',
    birthDate: '05/02/2012',
    sexo: 'Feminino',
    turma: 'Turma A',
    turmaTurno: 'Manhã (8h–12h)',
    deficiencia: 'Intelectual',
    cid: 'F70',
    status: 'Ativo',
    observacoes: 'Aluna dedicada, gosta de leitura e alfabetização.',
    responsavelNome: 'Marcos Costa',
    parentesco: 'Pai',
    telefone: '(16) 96666-5566',
    email: 'marcos.costa@email.com',
    oficinas: ['Alfabetização', 'Artes'],
    documentos: [{ name: 'ficha_medica.pdf', attachedAt: '12/02/2026', kind: 'pdf' }],
    faltasConsecutivas: 0,
    frequenciaMedia: 96,
    reports: [{ date: '02/07/2026', title: '1º semestre 2026', summary: 'Progresso consistente na alfabetização.' }],
    evolution: [{ date: '18/06/2026', area: 'Comunicação', note: 'Maior vocabulário e iniciativa para falar em grupo.' }],
    contacts: [],
    activities: ['Alfabetização — 04/09/2026', 'Artes — 29/08/2026'],
  },
  {
    id: 'gabriel-ferreira',
    name: 'Gabriel Ferreira',
    birthDate: '30/08/2009',
    sexo: 'Masculino',
    turma: 'Turma B',
    turmaTurno: 'Tarde (13h–17h)',
    deficiencia: 'Autismo (TEA)',
    cid: 'F84',
    status: 'Ativo',
    observacoes: 'Prefere rotinas previsíveis, boa adaptação à informática.',
    responsavelNome: 'Sandra Ferreira',
    parentesco: 'Mãe',
    telefone: '(16) 95555-7788',
    email: 'sandra.ferreira@email.com',
    oficinas: ['Informática', 'Musicalização'],
    documentos: [{ name: 'ficha_medica.pdf', attachedAt: '08/02/2026', kind: 'pdf' }],
    faltasConsecutivas: 1,
    frequenciaMedia: 88,
    reports: [{ date: '30/06/2026', title: '1º semestre 2026', summary: 'Boa adaptação às mudanças de rotina com apoio visual.' }],
    evolution: [{ date: '22/06/2026', area: 'Autonomia', note: 'Maior independência para seguir a rotina da oficina.' }],
    contacts: [{ faltaDate: '20/08/2026', contactDate: '21/08/2026', type: 'WhatsApp', responsible: 'Roberto Mendes', note: 'Família confirmou retorno.' }],
    activities: ['Informática — 03/09/2026', 'Musicalização — 27/08/2026'],
  },
  {
    id: 'julia-mendes-rocha',
    name: 'Júlia Mendes Rocha',
    birthDate: '18/01/2014',
    sexo: 'Feminino',
    turma: 'Turma A',
    turmaTurno: 'Manhã (8h–12h)',
    deficiencia: 'Síndrome de Down',
    cid: 'Q90',
    status: 'Ativo',
    observacoes: 'Muito sociável, adora dança e culinária.',
    responsavelNome: 'Paulo Rocha',
    parentesco: 'Pai',
    telefone: '(16) 94444-3322',
    email: 'paulo.rocha@email.com',
    oficinas: ['Dança', 'Culinária'],
    documentos: [{ name: 'ficha_medica.pdf', attachedAt: '25/01/2026', kind: 'pdf' }],
    faltasConsecutivas: 0,
    frequenciaMedia: 97,
    reports: [{ date: '28/06/2026', title: '1º semestre 2026', summary: 'Excelente participação e sociabilização.' }],
    evolution: [{ date: '10/06/2026', area: 'Social', note: 'Iniciativa para incluir colegas nas brincadeiras.' }],
    contacts: [],
    activities: ['Dança — 02/09/2026', 'Culinária — 26/08/2026'],
  },
  {
    id: 'rafael-cardoso',
    name: 'Rafael Cardoso',
    birthDate: '25/06/2007',
    sexo: 'Masculino',
    turma: 'Turma C',
    turmaTurno: 'Manhã (8h–12h)',
    deficiencia: 'Intelectual',
    cid: 'F71',
    status: 'Em acompanhamento',
    observacoes: 'Em processo de adaptação após mudança de turno.',
    responsavelNome: 'Lucia Cardoso',
    parentesco: 'Mãe',
    telefone: '(16) 93333-2211',
    email: 'lucia.cardoso@email.com',
    oficinas: ['Esporte'],
    documentos: [{ name: 'ficha_medica.pdf', attachedAt: '02/02/2026', kind: 'pdf' }],
    faltasConsecutivas: 3,
    frequenciaMedia: 71,
    reports: [{ date: '15/06/2026', title: '1º semestre 2026', summary: 'Necessita de apoio adicional na adaptação à nova turma.' }],
    evolution: [{ date: '05/06/2026', area: 'Autonomia', note: 'Ainda depende de apoio para mudanças de rotina.' }],
    contacts: [{ faltaDate: '01/09/2026', contactDate: '02/09/2026', type: 'Ligação telefônica', responsible: 'Roberto Mendes', note: 'Aguardando retorno da família.' }],
    activities: ['Esporte — 28/08/2026'],
  },
  {
    id: 'ana-clara-vieira',
    name: 'Ana Clara Vieira',
    birthDate: '09/04/2011',
    sexo: 'Feminino',
    turma: 'Turma B',
    turmaTurno: 'Tarde (13h–17h)',
    deficiencia: 'Paralisia Cerebral',
    cid: 'G80',
    status: 'Ativo',
    observacoes: 'Utiliza cadeira de rodas, participa bem das oficinas adaptadas.',
    responsavelNome: 'Roberto Vieira',
    parentesco: 'Pai',
    telefone: '(16) 92222-1100',
    email: 'roberto.vieira@email.com',
    oficinas: ['Artes', 'Musicalização'],
    documentos: [{ name: 'ficha_medica.pdf', attachedAt: '19/01/2026', kind: 'pdf' }],
    faltasConsecutivas: 0,
    frequenciaMedia: 93,
    reports: [{ date: '20/06/2026', title: '1º semestre 2026', summary: 'Boa evolução na coordenação motora fina nas artes.' }],
    evolution: [{ date: '01/06/2026', area: 'Motora', note: 'Maior precisão em atividades manuais.' }],
    contacts: [],
    activities: ['Artes — 04/09/2026', 'Musicalização — 28/08/2026'],
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

export function findStudent(id: string): Student | undefined {
  return students.find((student) => student.id === id)
}

// Memory store for dynamic interactions during session
export const initialAttendanceSessions: Record<string, AttendanceSession> = {
  '2026-09-15_Turma A_geral': {
    id: '2026-09-15_Turma A_geral',
    date: '2026-09-15',
    turmaId: 'Turma A',
    scope: 'turma',
    registeredBy: 'Ana Carolina Silva',
    registeredAt: '2026-09-15T09:30:00Z',
    records: {
      'lucas-oliveira-santos': { status: 'ausente', observation: 'Sem aviso prévio' },
      'fernanda-lima-costa': { status: 'presente', observation: '' },
      'julia-mendes-rocha': { status: 'presente', observation: '' },
    },
  },
}

export function getAttendanceSession(id: string): AttendanceSession | undefined {
  return initialAttendanceSessions[id] || initialAttendanceSessions[id.replace('_geral', '')] || initialAttendanceSessions[`${id}_geral`]
}

export function saveAttendanceSession(session: AttendanceSession) {
  initialAttendanceSessions[session.id] = session

  // Update student streak & average status dynamically
  Object.entries(session.records).forEach(([studentId, record]) => {
    const student = findStudent(studentId)
    if (student) {
      if (record.status === 'ausente') {
        student.faltasConsecutivas += 1
      } else if (record.status === 'presente') {
        student.faltasConsecutivas = 0
      }
    }
  })
}

export function addContactToStudent(
  studentId: string,
  contact: ContactEntry
) {
  const student = findStudent(studentId)
  if (student) {
    student.contacts.unshift(contact)
  }
}

