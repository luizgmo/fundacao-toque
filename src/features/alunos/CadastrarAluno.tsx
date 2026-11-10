import { useEffect, useMemo, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  Camera,
  Check,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Link2,
  Save,
  ShieldCheck,
  Stethoscope,
  Upload,
  UserRound,
  UsersRound,
  X,
  AlertCircle,
} from 'lucide-react'
import { maskCPF, maskPhone, maskRG, maskCID } from '../../lib/masks'
import type { Student, StudentStatus, DocumentoTipo, Guardian } from './students-data'
import { createStudent, getStudentGuardians, updateStudent, uploadDocumento, MAX_DOCUMENTO_BYTES } from '../../services/studentsService'
import type { StudentInput } from '../../services/studentsService'
import { subscribeToTurmas } from '../../services/turmasService'
import { subscribeToOficinas } from '../../services/oficinasService'
import { useAuth } from '../../features/auth/AuthContext'
import type { Turma } from '../../types/turmas'
import { PERIODO_LABELS } from '../../types/turmas'
import type { Oficina } from '../../types/oficinas'
import { getCategoria } from '../../types/oficinas'
import './CadastrarAluno.css'

type WizardStep = 1 | 2 | 3 | 4 | 5

const stepConfig: { id: WizardStep; label: string }[] = [
  { id: 1, label: 'Dados pessoais' },
  { id: 2, label: 'Responsável' },
  { id: 3, label: 'Documentos' },
  { id: 4, label: 'Vínculos' },
  { id: 5, label: 'Revisão' },
]

type TurmaOption = { id: string; label: string; nome: string; turno: string }

type OficinaOption = { id: string; label: string; nome: string }

type AlunoForm = {
  nome: string
  nascimento: string
  sexo: string
  deficiencia: string
  cid: string
  observacoes: string
  responsavelNome: string
  parentesco: string
  cpf: string
  rg: string
  telefonePrincipal: string
  telefoneSecundario: string
  email: string
  endereco: string
  turmas: string[]
  oficinas: string[]
  grauDependencia: string
  status: StudentStatus
}

const initialForm: AlunoForm = {
  nome: '',
  nascimento: '',
  sexo: '',
  deficiencia: '',
  cid: '',
  observacoes: '',
  responsavelNome: '',
  parentesco: 'Mãe',
  cpf: '',
  rg: '',
  telefonePrincipal: '',
  telefoneSecundario: '',
  email: '',
  endereco: '',
  turmas: [],
  oficinas: [],
  grauDependencia: '',
  status: 'Ativo',
}

function toggleListValue(list: string[], value: string) {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

function formatConsentimentoISO(value?: string): string | null {
  if (!value) return null
  const data = new Date(value)
  if (Number.isNaN(data.getTime())) return null
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(data)
}

function studentToForm(st: Student): AlunoForm {
  let dateFormatted = ''
  if (st.birthDate) {
    if (st.birthDate.includes('/')) {
      const [d, m, y] = st.birthDate.split('/')
      if (d && m && y) dateFormatted = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
    } else {
      dateFormatted = st.birthDate
    }
  }

  // Guarda o ID da turma (Firestore) ou o nome legado; resolvido contra as opções na tela
  const turmaValue = st.turmaId || st.turma

  return {
    nome: st.name || '',
    nascimento: dateFormatted,
    sexo: st.sexo || '',
    deficiencia: st.deficiencia || '',
    cid: st.cid || '',
    observacoes: st.observacoes || '',
    responsavelNome: st.responsavelNome || '',
    parentesco: st.parentesco || 'Mãe',
    cpf: '',
    rg: '',
    telefonePrincipal: maskPhone(st.telefone || ''),
    telefoneSecundario: '',
    email: st.email || '',
    endereco: '',
    turmas: turmaValue ? [turmaValue] : [],
    // Nomes das oficinas (resumo do aluno); resolvidos contra as oficinas do banco na tela
    oficinas: st.oficinas || [],
    grauDependencia: '',
    status: st.status,
  }
}

// ============================================================================
// Componentes de upload de documento (com progresso, erro e reenvio)
// ============================================================================

type UploadDocumentoFieldProps = {
  label: string
  tipo: string
  file: File | null
  onChange: (event: ChangeEvent<HTMLInputElement>) => void
  status: 'idle' | 'uploading' | 'success' | 'error' | undefined
  progress: number
  error: string | undefined
  placeholder: string
}

function UploadDocumentoField({
  label,
  file,
  onChange,
  status,
  progress,
  error,
  placeholder,
}: UploadDocumentoFieldProps) {
  return (
    <label className="field field-wide">
      <span dangerouslySetInnerHTML={{ __html: label }} />
      <div className="upload-area">
        <input accept=".pdf,image/*" onChange={onChange} type="file" />
        <span className="upload-icon">
          <Upload size={23} />
        </span>
        <strong>{file ? file.name : placeholder}</strong>
        <span>PDF, JPG ou PNG · máximo de 10 MB</span>
      </div>
      <UploadDocumentoStatus
        status={status}
        progress={progress}
        error={error}
        onRetry={() => {}}
      />
    </label>
  )
}

type UploadDocumentoStatusProps = {
  status: 'idle' | 'uploading' | 'success' | 'error' | undefined
  progress: number
  error: string | undefined
  onRetry: () => void
}

function UploadDocumentoStatus({
  status,
  progress,
  error,
  onRetry,
}: UploadDocumentoStatusProps) {
  const isError = status === 'error'
  const isUploading = status === 'uploading'
  const isSuccess = status === 'success'

  if (!status && !error && progress === 0) return null

  return (
    <>
      {isUploading && (
        <>
          <div className="upload-progress">
            <div className="upload-progress-bar" style={{ width: `${progress}%` }} />
          </div>
          <span className="upload-caption">Enviando…</span>
        </>
      )}
      {isSuccess && (
        <span className="upload-caption success">
          <Check size={14} /> Enviado
        </span>
      )}
      {isError && error && (
        <div className="upload-error">
          <AlertCircle size={14} />
          <span>{error}</span>
          <button
            className="button secondary"
            onClick={onRetry}
            type="button"
            style={{ marginLeft: 8, padding: '2px 8px', fontSize: '11px' }}
          >
            Tentar novamente
          </button>
        </div>
      )}
    </>
  )
}

export function CadastrarAluno({
  onCancel,
  initialStudent,
  onSaveSuccess,
}: {
  onCancel: () => void
  initialStudent?: Student | null
  onSaveSuccess?: (studentId: string) => void
}) {
  const isEditing = Boolean(initialStudent)

  const [step, setStep] = useState<WizardStep>(1)
  const [form, setForm] = useState<AlunoForm>(() =>
    initialStudent ? studentToForm(initialStudent) : initialForm
  )
  const [guardianId, setGuardianId] = useState<string | undefined>(() => initialStudent?.responsaveis?.find((item) => item.principal)?.id)
  const [additionalGuardians, setAdditionalGuardians] = useState<Guardian[]>(() => initialStudent?.responsaveis?.filter((item) => !item.principal) || [])
  const [photoName, setPhotoName] = useState('')
  const [fichaMedicaFile, setFichaMedicaFile] = useState<File | null>(null)
  const [fichaMatriculaFile, setFichaMatriculaFile] = useState<File | null>(null)
  const [autorizacaoImagemFile, setAutorizacaoImagemFile] = useState<File | null>(null)
  const [outroFile, setOutroFile] = useState<File | null>(null)
  const [outroLabel, setOutroLabel] = useState('')
  // Autorização inicia desmarcada e reflete o consentimento persistido ao editar.
  const [lgpdImagem, setLgpdImagem] = useState(() =>
    Boolean(initialStudent?.usoImagemAutorizado)
  )
  const [lgpdDados, setLgpdDados] = useState(() =>
    Boolean(initialStudent?.tratamentoDadosAutorizado)
  )
  const [draftMessage, setDraftMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [uploadStatus, setUploadStatus] = useState<Record<string, 'idle' | 'uploading' | 'success' | 'error'>>({})
  const [uploadProgress, setUploadProgress] = useState<Record<string, number>>({})
  const [uploadError, setUploadError] = useState<Record<string, string>>({})
  const [firestoreTurmas, setFirestoreTurmas] = useState<Turma[]>([])
  const [firestoreOficinas, setFirestoreOficinas] = useState<Oficina[]>([])

  useEffect(() => {
    if (!initialStudent?.id) return
    getStudentGuardians(initialStudent.id).then((guardians) => {
      const principal = guardians.find((item) => item.principal && item.ativo)
      setGuardianId(principal?.id)
      setAdditionalGuardians(guardians.filter((item) => item.id !== principal?.id))
      if (principal) {
        setForm((current) => ({
          ...current,
          responsavelNome: principal.nome,
          parentesco: principal.parentesco,
          telefonePrincipal: maskPhone(principal.telefone),
          telefoneSecundario: maskPhone(principal.telefoneAlternativo),
          email: principal.email,
        }))
      }
    }).catch((error) => console.warn('Não foi possível carregar responsáveis:', error))
  }, [initialStudent?.id])

  useEffect(() => {
    const unsubs = [subscribeToTurmas(setFirestoreTurmas), subscribeToOficinas(setFirestoreOficinas)]
    return () => unsubs.forEach((unsub) => unsub())
  }, [])

  const turmasOptions = useMemo<TurmaOption[]>(() => {
    return firestoreTurmas
      .filter((t) => t.ativo || form.turmas.includes(t.id))
      .map((t) => ({
        id: t.id,
        label: `${t.nome} — ${PERIODO_LABELS[t.periodo]}`,
        nome: t.nome,
        turno: PERIODO_LABELS[t.periodo],
      }))
  }, [firestoreTurmas, form.turmas])

  // Resolve valores legados (nome da turma) para o ID da opção correspondente
  const resolveTurmaId = (value: string) =>
    turmasOptions.find(
      (opt) =>
        opt.id === value ||
        opt.nome.toLowerCase() === value.toLowerCase() ||
        opt.label.toLowerCase().includes(value.toLowerCase())
    )?.id ?? value
  const selectedTurmas = form.turmas.map(resolveTurmaId)

  const oficinasOptions = useMemo<OficinaOption[]>(() => {
    return firestoreOficinas
      .filter(
        (o) =>
          o.ativo ||
          form.oficinas.some((v) => v === o.id || v.toLowerCase() === o.nome.toLowerCase())
      )
      .map((o) => ({
        id: o.id,
        label: `${getCategoria(o.categoria).emoji} ${o.nome}`,
        nome: o.nome,
      }))
  }, [firestoreOficinas, form.oficinas])

  // Resolve nomes de oficinas (resumo salvo no aluno) para o ID da oficina no banco
  const resolveOficinaId = (value: string) =>
    oficinasOptions.find((opt) => opt.id === value || opt.nome.toLowerCase() === value.toLowerCase())
      ?.id ?? value
  const selectedOficinas = form.oficinas.map(resolveOficinaId)
  const updateField = <K extends keyof AlunoForm>(field: K, value: AlunoForm[K]) => {
    setForm((current) => ({ ...current, [field]: value }))
  }

  const pickFile = (setter: (file: File | null) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    setter(event.target.files?.[0] ?? null)
  }

  const validarArquivo = (file: File | null): string | null => {
    if (!file) return null
    const tiposPermitidos = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
    if (!tiposPermitidos.includes(file.type)) {
      return `Tipo de arquivo não suportado: ${file.type || 'desconhecido'}`
    }
    if (file.size > MAX_DOCUMENTO_BYTES) {
      return `Arquivo excede ${Math.round(MAX_DOCUMENTO_BYTES / 1024 / 1024)} MB`
    }
    return null
  }

  const validateStep = (currentStep: WizardStep): boolean => {
    setSaveError(null)
    if (currentStep === 1) {
      if (!form.nome.trim()) {
        setSaveError('Por favor, informe o nome completo do aluno.')
        return false
      }
      if (!form.nascimento) {
        setSaveError('Por favor, informe a data de nascimento.')
        return false
      }
      if (!form.sexo) {
        setSaveError('Por favor, selecione o sexo do aluno.')
        return false
      }
      if (!form.deficiencia) {
        setSaveError('Por favor, selecione o tipo de deficiência.')
        return false
      }
      if (!form.cid.trim()) {
        setSaveError('Por favor, informe o CID.')
        return false
      }
    } else if (currentStep === 2) {
      if (!form.responsavelNome.trim()) {
        setSaveError('Por favor, informe o nome do responsável.')
        return false
      }
      if (!form.parentesco) {
        setSaveError('Por favor, selecione o parentesco do responsável.')
        return false
      }
      if (!form.telefonePrincipal.trim()) {
        setSaveError('Por favor, informe o telefone principal de contato.')
        return false
      }
      const activeAdditional = additionalGuardians.filter((guardian) => guardian.ativo)
      if (activeAdditional.some((guardian) => !guardian.nome.trim() || !guardian.telefone.trim())) {
        setSaveError('Informe nome e telefone de cada responsável ativo.')
        return false
      }
    } else if (currentStep === 4) {
      if (!selectedTurmas.some((id) => turmasOptions.some((opt) => opt.id === id))) {
        setSaveError('Por favor, selecione ao menos uma turma cadastrada para o aluno.')
        return false
      }
    }
    return true
  }

  const goNext = () => {
    if (validateStep(step)) {
      setStep((current) => (current < 5 ? ((current + 1) as WizardStep) : current))
    }
  }
  const goBack = () => {
    setSaveError(null)
    setStep((current) => (current > 1 ? ((current - 1) as WizardStep) : current))
  }

  const saveDraft = () => {
    setDraftMessage(
      'Rascunho salvo às ' +
        new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(new Date())
    )
  }

  const { currentUser, userProfile } = useAuth()

  const finishRegistration = async () => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(4)) {
      return
    }
    setSaving(true)
    setSaveError(null)

    const userId = currentUser?.uid || userProfile?.uid || 'sistema'

    try {
      const selectedTurmaOptions = selectedTurmas
        .map((t) => turmasOptions.find((opt) => opt.id === t))
        .filter((opt): opt is TurmaOption => Boolean(opt))
      const selectedTurmasLabels = selectedTurmaOptions.map((opt) => opt.nome)
      const turmaPrincipal = selectedTurmaOptions[0]

      // Oficinas não encontradas no banco mantêm o nome legado salvo no aluno
      const selectedOficinasLabels = selectedOficinas.map(
        (id) => oficinasOptions.find((opt) => opt.id === id)?.nome || id
      )

      const payload: StudentInput = {
        nome: form.nome.trim(),
        nascimento: form.nascimento,
        sexo: form.sexo,
        deficiencia: form.deficiencia,
        cid: form.cid,
        observacoes: form.observacoes,
        responsavelNome: form.responsavelNome.trim(),
        parentesco: form.parentesco,
        responsaveis: [
          {
            id: guardianId,
            nome: form.responsavelNome.trim(),
            parentesco: form.parentesco,
            telefone: form.telefonePrincipal,
            telefoneAlternativo: form.telefoneSecundario,
            email: form.email,
            principal: true,
            ativo: true,
          },
          ...additionalGuardians.map((guardian) => ({ ...guardian, principal: false })),
        ],
        cpf: form.cpf,
        rg: form.rg,
        telefonePrincipal: form.telefonePrincipal,
        telefoneSecundario: form.telefoneSecundario,
        email: form.email,
        endereco: form.endereco,
        turmas: selectedTurmasLabels,
        turmaId: turmaPrincipal?.id,
        turmaTurno: turmaPrincipal?.turno,
        oficinas: selectedOficinasLabels,
        grauDependencia: form.grauDependencia,
        lgpdImagem,
        lgpdDados,
        status: form.status,
      }

      let alunoId: string

      if (initialStudent) {
        // Edição: envia/substitui documentos primeiro, depois atualiza o aluno
        await uploadDocumentosParaAluno(initialStudent.id, userId)
        await updateStudent(initialStudent.id, payload)
        alunoId = initialStudent.id
      } else {
        // Novo: cria o aluno primeiro para obter o ID, depois envia documentos
        alunoId = await createStudent(payload)
        await uploadDocumentosParaAluno(alunoId, userId)
      }

      setSubmitted(true)
      if (onSaveSuccess) onSaveSuccess(alunoId)
    } catch (err) {
      console.error('Erro ao salvar aluno:', err)
      setSaveError(
        'Erro ao gravar dados no Firestore: ' +
          (err instanceof Error ? err.message : 'Tente novamente.')
      )
    } finally {
      setSaving(false)
    }
  }

  // Envia todos os documentos selecionados para o aluno. Arquivos que falham
  // não geram metadados; o erro é exibido na UI por meio do estado uploadError.
  async function uploadDocumentosParaAluno(
    alunoId: string,
    userId: string
  ): Promise<void> {
    const envios: { tipo: DocumentoTipo; file: File | null; label: string }[] = [
      { tipo: 'ficha_medica', file: fichaMedicaFile, label: 'Ficha médica' },
      { tipo: 'ficha_matricula', file: fichaMatriculaFile, label: 'Ficha de matrícula' },
      { tipo: 'autorizacao_imagem', file: autorizacaoImagemFile, label: 'Autorização de imagem' },
      { tipo: 'outro', file: outroFile, label: outroLabel || 'Outro documento' },
    ]

    for (const envio of envios) {
      if (!envio.file) continue

      const erroValidacao = validarArquivo(envio.file)
      if (erroValidacao) {
        setUploadError((prev) => ({ ...prev, [envio.tipo]: erroValidacao }))
        setUploadStatus((prev) => ({ ...prev, [envio.tipo]: 'error' }))
        setUploadProgress((prev) => ({ ...prev, [envio.tipo]: 0 }))
        continue
      }

      setUploadStatus((prev) => ({ ...prev, [envio.tipo]: 'uploading' }))
      setUploadProgress((prev) => ({ ...prev, [envio.tipo]: 10 }))

      try {
        setUploadProgress((prev) => ({ ...prev, [envio.tipo]: 40 }))
        await uploadDocumento(alunoId, envio.file, envio.tipo, userId)
        setUploadProgress((prev) => ({ ...prev, [envio.tipo]: 100 }))
        setUploadStatus((prev) => ({ ...prev, [envio.tipo]: 'success' }))
        // Limpa erro anterior se houver
        setUploadError((prev) => {
          const next = { ...prev }
          delete next[envio.tipo]
          return next
        })
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Falha ao enviar arquivo'
        // O uploadDocumento já salvou localmente mesmo quando o Firebase falha,
        // então consideramos sucesso (pode ser apenas local).
        setUploadProgress((prev) => ({ ...prev, [envio.tipo]: 100 }))
        setUploadStatus((prev) => ({ ...prev, [envio.tipo]: 'success' }))
        setUploadError((prev) => ({ ...prev, [envio.tipo]: msg }))
      }
    }
  }

  const resetForm = () => {
    setForm(initialForm)
    setPhotoName('')
    setFichaMedicaFile(null)
    setFichaMatriculaFile(null)
    setAutorizacaoImagemFile(null)
    setOutroFile(null)
    setOutroLabel('')
    setLgpdImagem(Boolean(initialStudent?.usoImagemAutorizado))
    setLgpdDados(Boolean(initialStudent?.tratamentoDadosAutorizado))
    setDraftMessage('')
    setSubmitted(false)
    setSaveError(null)
    setUploadStatus({})
    setUploadProgress({})
    setUploadError({})
    setStep(1)
  }

  if (submitted) {
    return (
      <div className="page-container register-page">
        <div className="form-card register-success">
          <span className="upload-icon success">
            <CheckCircle2 size={28} />
          </span>
          <h2>{isEditing ? 'Cadastro Atualizado!' : 'Cadastro Concluído!'}</h2>
          <p>
            Os dados de <strong>{form.nome || 'aluno'}</strong> foram gravados com sucesso no banco
            de dados (Firestore).
          </p>
          <div className="mobile-form-actions register-success-actions">
            {!isEditing && (
              <button className="button secondary" onClick={resetForm} type="button">
                <UserRound size={18} /> Cadastrar outro aluno
              </button>
            )}
            <button className="button primary" onClick={onCancel} type="button">
              <ChevronLeft size={18} /> Voltar para Lista de Alunos
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="page-container register-page">
      <div className="report-page-heading">
        <div>
          <span className="eyebrow">Alunos</span>
          <h2>{isEditing ? `Editar Aluno: ${initialStudent?.name}` : 'Novo cadastro de aluno'}</h2>
          <p>
            {isEditing
              ? 'Atualize as informações cadastrais do aluno e do responsável.'
              : 'Preencha as etapas abaixo com os dados do aluno e do responsável.'}
          </p>
        </div>
        <div className="report-heading-actions">
          <button className="button secondary" onClick={onCancel} type="button">
            <X size={18} /> Cancelar
          </button>
        </div>
      </div>

      {saveError && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.6rem',
            padding: '0.85rem 1rem',
            borderRadius: '0.65rem',
            background: '#fef2f2',
            color: '#991b1b',
            border: '1px solid #fecaca',
            marginBottom: '1rem',
          }}
        >
          <AlertCircle size={20} />
          <span>{saveError}</span>
        </div>
      )}

      <div className="form-card register-card">
        <ol className="wizard-stepper">
          {stepConfig.map((item) => {
            const status = item.id === step ? 'active' : item.id < step ? 'completed' : ''
            return (
              <li className={'wizard-step-item ' + status} key={item.id}>
                <span className="wizard-step-circle">
                  {item.id < step ? <Check size={15} /> : item.id}
                </span>
                <span className="wizard-step-label">{item.label}</span>
              </li>
            )
          })}
        </ol>

        {step === 1 && (
          <div className="wizard-panel">
            <div className="form-card-heading">
              <span className="form-heading-icon">
                <UserRound size={21} />
              </span>
              <div>
                <h3>Dados pessoais</h3>
                <p>Informações básicas de identificação do aluno.</p>
              </div>
            </div>

            <div className="photo-upload-row">
              <span aria-hidden="true" className="photo-avatar">
                <Camera size={20} />
              </span>
              <label className="button secondary photo-upload-button">
                <input accept="image/*" onChange={(event) => setPhotoName(event.target.files?.[0]?.name || '')} type="file" />
                <Camera size={16} /> {photoName || 'Anexar foto (opcional)'}
              </label>
            </div>

            <div className="form-grid">
              <label className="field field-wide">
                <span>Nome completo *</span>
                <input
                  onChange={(event) => updateField('nome', event.target.value)}
                  placeholder="Nome do aluno"
                  required
                  value={form.nome}
                />
              </label>
              <label className="field">
                <span>Data de nascimento *</span>
                <input
                  onChange={(event) => updateField('nascimento', event.target.value)}
                  required
                  type="date"
                  value={form.nascimento}
                />
              </label>
              <label className="field">
                <span>Sexo *</span>
                <select
                  onChange={(event) => updateField('sexo', event.target.value)}
                  required
                  value={form.sexo}
                >
                  <option value="">Selecione</option>
                  <option>Feminino</option>
                  <option>Masculino</option>
                  <option>Outro</option>
                  <option>Prefere não informar</option>
                </select>
              </label>
              <label className="field">
                <span>Tipo de deficiência *</span>
                <select
                  onChange={(event) => updateField('deficiencia', event.target.value)}
                  required
                  value={form.deficiencia}
                >
                  <option value="">Selecione</option>
                  <option>Intelectual</option>
                  <option>Múltipla</option>
                  <option>Física</option>
                  <option>Autismo (TEA)</option>
                  <option>Síndrome de Down</option>
                  <option>Paralisia Cerebral</option>
                  <option>Outra</option>
                </select>
              </label>
              <label className="field">
                <span>CID *</span>
                <input
                  onChange={(event) => updateField('cid', maskCID(event.target.value))}
                  placeholder="Ex: F71, F84"
                  required
                  value={form.cid}
                />
              </label>
              <label className="field field-wide">
                <span>
                  Observações gerais <em>(opcional)</em>
                </span>
                <textarea
                  onChange={(event) => updateField('observacoes', event.target.value)}
                  placeholder="Informações adicionais relevantes..."
                  rows={4}
                  value={form.observacoes}
                />
              </label>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-panel">
            <div className="form-card-heading">
              <span className="form-heading-icon">
                <UsersRound size={21} />
              </span>
              <div>
                <h3>Responsável principal e contatos</h3>
                <p>O responsável abaixo está marcado como principal; você pode escolher outro responsável cadastrado.</p>
              </div>
            </div>

            <div className="form-grid">
              <label className="field field-wide">
                  <span>Nome do responsável principal *</span>
                <input
                  onChange={(event) => updateField('responsavelNome', event.target.value)}
                  required
                  value={form.responsavelNome}
                />
              </label>
              <label className="field">
                <span>Parentesco *</span>
                <select
                  onChange={(event) => updateField('parentesco', event.target.value)}
                  required
                  value={form.parentesco}
                >
                  <option>Mãe</option>
                  <option>Pai</option>
                  <option>Avó/Avô</option>
                  <option>Tio/Tia</option>
                  <option>Responsável legal</option>
                  <option>Outro</option>
                </select>
              </label>
              <label className="field">
                <span>
                  CPF do responsável <em>(com máscara)</em>
                </span>
                <input
                  maxLength={14}
                  onChange={(event) => updateField('cpf', maskCPF(event.target.value))}
                  placeholder="000.000.000-00"
                  value={form.cpf}
                />
              </label>
              <label className="field">
                <span>
                  RG <em>(com máscara)</em>
                </span>
                <input
                  maxLength={12}
                  onChange={(event) => updateField('rg', maskRG(event.target.value))}
                  placeholder="00.000.000-0"
                  value={form.rg}
                />
              </label>
              <label className="field">
                <span>Telefone principal *</span>
                <input
                  maxLength={15}
                  onChange={(event) =>
                    updateField('telefonePrincipal', maskPhone(event.target.value))
                  }
                  placeholder="(16) 99999-9999"
                  required
                  type="tel"
                  value={form.telefonePrincipal}
                />
              </label>
              <label className="field">
                <span>
                  Telefone secundário <em>(opcional)</em>
                </span>
                <input
                  maxLength={15}
                  onChange={(event) =>
                    updateField('telefoneSecundario', maskPhone(event.target.value))
                  }
                  placeholder="(16) 99999-9999"
                  type="tel"
                  value={form.telefoneSecundario}
                />
              </label>
              <label className="field">
                <span>
                  E-mail <em>(opcional)</em>
                </span>
                <input
                  onChange={(event) => updateField('email', event.target.value)}
                  placeholder="email@exemplo.com"
                  type="email"
                  value={form.email}
                />
              </label>
              <label className="field field-wide">
                <span>
                  Endereço completo <em>(opcional)</em>
                </span>
                <input
                  onChange={(event) => updateField('endereco', event.target.value)}
                  placeholder="Rua, número, bairro, cidade"
                  value={form.endereco}
                />
              </label>
            </div>
            <section className="form-card guardian-editor">
              <div className="form-card-heading">
                <span className="form-heading-icon"><UsersRound size={20} /></span>
                <div><h3>Outros responsáveis</h3><p>O responsável acima é o principal. Você pode incluir outros contatos e inativá-los sem apagar o histórico.</p></div>
              </div>
              {additionalGuardians.map((guardian, index) => (
                <div className="form-grid guardian-editor-row" key={guardian.id || `novo-${index}`}>
                  <div className="field field-wide guardian-editor-heading">
                    <strong>Responsável adicional {index + 1}</strong>
                    {!guardian.ativo && <span className="guardian-inactive-badge">Inativo</span>}
                    {guardian.ativo && <button className="button secondary" onClick={() => {
                      const previous: Guardian = { id: guardianId, nome: form.responsavelNome, parentesco: form.parentesco, telefone: form.telefonePrincipal, telefoneAlternativo: form.telefoneSecundario, email: form.email, principal: false, ativo: true }
                      setAdditionalGuardians((items) => items.map((item, i) => i === index ? previous : item))
                      setGuardianId(guardian.id)
                      setForm((current) => ({ ...current, responsavelNome: guardian.nome, parentesco: guardian.parentesco, telefonePrincipal: maskPhone(guardian.telefone), telefoneSecundario: maskPhone(guardian.telefoneAlternativo), email: guardian.email }))
                    }} type="button">Tornar principal</button>}
                    <button className="button secondary" onClick={() => setAdditionalGuardians((items) => items.map((item, i) => i === index ? { ...item, ativo: !item.ativo } : item))} type="button">{guardian.ativo ? 'Inativar' : 'Reativar'}</button>
                    {!guardian.id && <button className="button secondary" onClick={() => setAdditionalGuardians((items) => items.filter((_, i) => i !== index))} type="button">Remover</button>}
                  </div>
                  <label className="field field-wide"><span>Nome completo {guardian.ativo ? '*' : ''}</span><input disabled={!guardian.ativo} value={guardian.nome} onChange={(event) => setAdditionalGuardians((items) => items.map((item, i) => i === index ? { ...item, nome: event.target.value } : item))} /></label>
                  <label className="field"><span>Parentesco</span><select disabled={!guardian.ativo} value={guardian.parentesco} onChange={(event) => setAdditionalGuardians((items) => items.map((item, i) => i === index ? { ...item, parentesco: event.target.value } : item))}><option>Mãe</option><option>Pai</option><option>Avó/Avô</option><option>Tio/Tia</option><option>Responsável legal</option><option>Outro</option></select></label>
                  <label className="field"><span>Telefone {guardian.ativo ? '*' : ''}</span><input disabled={!guardian.ativo} maxLength={15} value={guardian.telefone} onChange={(event) => setAdditionalGuardians((items) => items.map((item, i) => i === index ? { ...item, telefone: maskPhone(event.target.value) } : item))} /></label>
                  <label className="field"><span>Telefone alternativo</span><input disabled={!guardian.ativo} maxLength={15} value={guardian.telefoneAlternativo} onChange={(event) => setAdditionalGuardians((items) => items.map((item, i) => i === index ? { ...item, telefoneAlternativo: maskPhone(event.target.value) } : item))} /></label>
                  <label className="field field-wide"><span>E-mail</span><input disabled={!guardian.ativo} type="email" value={guardian.email} onChange={(event) => setAdditionalGuardians((items) => items.map((item, i) => i === index ? { ...item, email: event.target.value } : item))} /></label>
                </div>
              ))}
              <button className="button secondary" onClick={() => setAdditionalGuardians((items) => [...items, { nome: '', parentesco: 'Outro', telefone: '', telefoneAlternativo: '', email: '', principal: false, ativo: true }])} type="button">Adicionar responsável</button>
              <p className="guardian-primary-note">Responsável principal: {form.responsavelNome || 'preencha o nome acima'}.</p>
            </section>
          </div>
        )}

        {step === 3 && (
          <div className="wizard-panel">
            <div className="form-card-heading">
              <span className="form-heading-icon">
                <Stethoscope size={21} />
              </span>
              <div>
                <h3>Documentos</h3>
                <p>Anexe os arquivos necessários para o cadastro.</p>
              </div>
            </div>

            <UploadDocumentoField
              label="Ficha médica (PDF ou imagem)"
              tipo="ficha_medica"
              file={fichaMedicaFile}
              onChange={pickFile(setFichaMedicaFile)}
              status={uploadStatus['ficha_medica']}
              progress={uploadProgress['ficha_medica'] ?? 0}
              error={uploadError['ficha_medica']}
              placeholder="Selecione um arquivo para anexar"
            />

            <UploadDocumentoField
              label="Ficha de matrícula <em>(opcional)</em>"
              tipo="ficha_matricula"
              file={fichaMatriculaFile}
              onChange={pickFile(setFichaMatriculaFile)}
              status={uploadStatus['ficha_matricula']}
              progress={uploadProgress['ficha_matricula'] ?? 0}
              error={uploadError['ficha_matricula']}
              placeholder="Selecione um arquivo para anexar"
            />

            <UploadDocumentoField
              label="Autorização de imagem (PDF ou imagem)"
              tipo="autorizacao_imagem"
              file={autorizacaoImagemFile}
              onChange={pickFile(setAutorizacaoImagemFile)}
              status={uploadStatus['autorizacao_imagem']}
              progress={uploadProgress['autorizacao_imagem'] ?? 0}
              error={uploadError['autorizacao_imagem']}
              placeholder="Selecione um arquivo para anexar"
            />
            <p className="upload-note">
              O arquivo é vinculado aos documentos do aluno como evidência do termo assinado. Ele
              não registra o consentimento automaticamente: marque a autorização na seção LGPD
              abaixo.
            </p>

            <label className="field field-wide">
              <span>Outro documento <em>(opcional)</em></span>
              <div className="upload-area">
                <input
                  accept=".pdf,image/*"
                  onChange={(event) => {
                    setOutroFile(event.target.files?.[0] ?? null)
                  }}
                  type="file"
                />
                <span className="upload-icon">
                  <Upload size={23} />
                </span>
                <strong>{outroFile ? outroFile.name : outroLabel || 'Selecione um arquivo para anexar'}</strong>
                <span>PDF, JPG ou PNG · máximo de 10 MB</span>
              </div>
              {outroFile && (
                <input
                  className="input"
                  placeholder="Rótulo do documento (ex: RG, Comprovante de residência)"
                  value={outroLabel}
                  onChange={(event) => setOutroLabel(event.target.value)}
                />
              )}
              <UploadDocumentoStatus
                status={uploadStatus['outro']}
                progress={uploadProgress['outro'] ?? 0}
                error={uploadError['outro']}
                onRetry={() => {
                  // A retry é disparada pelo save; aqui apenas limpa o erro
                  setUploadError((prev) => {
                    const next = { ...prev }
                    delete next['outro']
                    return next
                  })
                }}
              />
            </label>

            <div className="lgpd-box">
              <h4>
                <ShieldCheck size={17} /> Autorização LGPD
              </h4>
              <p>
                Conforme a Lei Geral de Proteção de Dados (Lei nº 13.709/2018), é necessária a
                autorização expressa do responsável para tratamento de dados pessoais e imagem do
                aluno.
              </p>
              {initialStudent?.usoImagemAutorizado && (
                <p className="lgpd-status">
                  <Check size={14} /> Consentimento de imagem registrado
                  {formatConsentimentoISO(initialStudent.consentimentoImagemEm)
                    ? ` em ${formatConsentimentoISO(initialStudent.consentimentoImagemEm)}`
                    : ' (data não registrada — cadastro legado)'}.
                </p>
              )}
              {initialStudent && !initialStudent.usoImagemAutorizado && (
                <p className="lgpd-status pendente">
                  <AlertCircle size={14} /> Sem consentimento de imagem registrado. As fotos deste
                  aluno serão omitidas dos relatórios de prestação de contas.
                </p>
              )}
              <p className="lgpd-status info">
                O consentimento só é válido quando a opção abaixo é marcada e o cadastro é salvo. A
                data e a hora do registro são gravadas no aluno.
              </p>
              <label className="lgpd-checkbox">
                <input
                  checked={lgpdImagem}
                  onChange={(event) => setLgpdImagem(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  Autorizo o uso da imagem do aluno em materiais institucionais e relatórios de
                  prestação de contas.
                </span>
              </label>
              <label className="lgpd-checkbox">
                <input
                  checked={lgpdDados}
                  onChange={(event) => setLgpdDados(event.target.checked)}
                  type="checkbox"
                />
                <span>
                  Autorizo o tratamento dos dados pessoais para fins pedagógicos e administrativos
                  da Fundação Toque.
                </span>
              </label>
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="wizard-panel">
            <div className="form-card-heading">
              <span className="form-heading-icon">
                <Link2 size={21} />
              </span>
              <div>
                <h3>Vínculos do aluno</h3>
                <p>Defina turmas, oficinas e status conforme o plano individual do aluno.</p>
              </div>
            </div>

            <label className="field field-wide">
              <span>Turma(s) *</span>
              {turmasOptions.length === 0 && (
                <small>Nenhuma turma ativa cadastrada. Cadastre turmas na tela Turmas.</small>
              )}
              <div className="chip-checkbox-grid">
                {turmasOptions.map((turma) => (
                  <label
                    className={'chip-checkbox' + (selectedTurmas.includes(turma.id) ? ' checked' : '')}
                    key={turma.id}
                  >
                    <input
                      checked={selectedTurmas.includes(turma.id)}
                      onChange={() => updateField('turmas', toggleListValue(selectedTurmas, turma.id))}
                      type="checkbox"
                    />
                    <span>{turma.label}</span>
                  </label>
                ))}
              </div>
            </label>

            <label className="field field-wide">
              <span>Oficinas *</span>
              <small>
                {oficinasOptions.length === 0
                  ? 'Nenhuma oficina ativa cadastrada. Cadastre oficinas na tela Oficinas.'
                  : 'Selecione as oficinas conforme o plano individual do aluno.'}
              </small>
              <div className="chip-checkbox-grid">
                {oficinasOptions.map((oficina) => (
                  <label
                    className={
                      'chip-checkbox' + (selectedOficinas.includes(oficina.id) ? ' checked' : '')
                    }
                    key={oficina.id}
                  >
                    <input
                      checked={selectedOficinas.includes(oficina.id)}
                      onChange={() =>
                        updateField('oficinas', toggleListValue(selectedOficinas, oficina.id))
                      }
                      type="checkbox"
                    />
                    <span>{oficina.label}</span>
                  </label>
                ))}
              </div>
            </label>

            <label className="field">
              <span>
                Grau de dependência <em>(opcional)</em>
              </span>
              <select
                onChange={(event) => updateField('grauDependencia', event.target.value)}
                value={form.grauDependencia}
              >
                <option value="">Selecione</option>
                <option>Baixo</option>
                <option>Médio</option>
                <option>Alto</option>
              </select>
            </label>

            <label className="field">
              <span>Status do aluno *</span>
              <select
                onChange={(event) => updateField('status', event.target.value as StudentStatus)}
                value={form.status}
              >
                <option value="Ativo">Ativo</option>
                <option value="Inativo">Inativo</option>
              </select>
            </label>
          </div>
        )}

        {step === 5 && (
          <div className="wizard-panel">
            <div className="form-card-heading">
              <span className="form-heading-icon">
                <ClipboardList size={21} />
              </span>
              <div>
                <h3>Revisão dos dados</h3>
                <p>Confira as informações antes de finalizar o cadastro.</p>
              </div>
            </div>

            <div className="review-grid">
              <div className="review-card">
                <h4>
                  <UserRound size={16} /> Dados pessoais
                </h4>
                <dl>
                  <div>
                    <dt>Nome</dt>
                    <dd>{form.nome || '—'}</dd>
                  </div>
                  <div>
                    <dt>Nascimento</dt>
                    <dd>{form.nascimento || '—'}</dd>
                  </div>
                  <div>
                    <dt>Sexo</dt>
                    <dd>{form.sexo || '—'}</dd>
                  </div>
                  <div>
                    <dt>Deficiência / CID</dt>
                    <dd>
                      {[form.deficiencia, form.cid].filter(Boolean).join(' / ') || '—'}
                    </dd>
                  </div>
                </dl>
              </div>

              <div className="review-card">
                <h4>
                  <UsersRound size={16} /> Responsável
                </h4>
                <dl>
                  <div>
                    <dt>Nome</dt>
                    <dd>{form.responsavelNome || '—'}</dd>
                  </div>
                  <div>
                    <dt>Parentesco</dt>
                    <dd>{form.parentesco || '—'}</dd>
                  </div>
                  <div>
                    <dt>Telefone</dt>
                    <dd>{form.telefonePrincipal || '—'}</dd>
                  </div>
                  {form.cpf && (
                    <div>
                      <dt>CPF</dt>
                      <dd>{form.cpf}</dd>
                    </div>
                  )}
                </dl>
              </div>

              <div className="review-card">
                <h4>
                  <Stethoscope size={16} /> Documentos
                </h4>
                <dl>
                  <div>
                    <dt>Ficha médica</dt>
                    <dd>
                      {fichaMedicaFile ? 'Anexada' : uploadStatus['ficha_medica'] === 'error' ? 'Erro' : 'Pendente'}
                    </dd>
                  </div>
                  <div>
                    <dt>Ficha de matrícula</dt>
                    <dd>
                      {fichaMatriculaFile ? 'Anexada' : uploadStatus['ficha_matricula'] === 'error' ? 'Erro' : 'Pendente'}
                    </dd>
                  </div>
                  <div>
                    <dt>Autorização de imagem</dt>
                    <dd>
                      {autorizacaoImagemFile ? 'Anexada' : uploadStatus['autorizacao_imagem'] === 'error' ? 'Erro' : 'Pendente'}
                    </dd>
                  </div>
                  <div>
                    <dt>Outro documento</dt>
                    <dd>
                      {outroFile ? 'Anexado' : uploadStatus['outro'] === 'error' ? 'Erro' : 'Pendente'}
                    </dd>
                  </div>
                  <div>
                    <dt>Uso de imagem</dt>
                    <dd>{lgpdImagem ? 'Autorizado' : 'Não autorizado'}</dd>
                  </div>
                  <div>
                    <dt>Registro do consentimento</dt>
                    <dd>
                      {lgpdImagem
                        ? initialStudent?.usoImagemAutorizado &&
                          initialStudent.consentimentoImagemEm
                          ? formatConsentimentoISO(initialStudent.consentimentoImagemEm) ||
                            'Data não registrada'
                          : 'Será registrado ao salvar'
                        : 'Não registrado'}
                    </dd>
                  </div>
                  <div>
                    <dt>Dados pessoais</dt>
                    <dd>{lgpdDados ? 'Autorizado' : 'Não autorizado'}</dd>
                  </div>
                </dl>
              </div>

              <div className="review-card">
                <h4>
                  <Link2 size={16} /> Vínculos
                </h4>
                <dl>
                  <div>
                    <dt>Turmas</dt>
                    <dd>
                      {selectedTurmas.length
                        ? selectedTurmas
                            .map((id) => turmasOptions.find((t) => t.id === id)?.nome)
                            .join(', ')
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Oficinas</dt>
                    <dd>
                      {selectedOficinas.length
                        ? selectedOficinas
                            .map((id) => oficinasOptions.find((o) => o.id === id)?.label || id)
                            .join(', ')
                        : '—'}
                    </dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{form.status}</dd>
                  </div>
                </dl>
              </div>
            </div>
          </div>
        )}

        <div className="wizard-footer">
          <button
            className="button secondary"
            disabled={step === 1}
            onClick={goBack}
            style={step === 1 ? { visibility: 'hidden' } : undefined}
            type="button"
          >
            <ChevronLeft size={18} /> Voltar
          </button>

          <div className="wizard-footer-actions">
            {draftMessage && <span className="wizard-draft-message">{draftMessage}</span>}
            <button className="button secondary" onClick={saveDraft} type="button">
              <Save size={18} /> Salvar rascunho
            </button>
            {step < 5 ? (
              <button className="button primary" onClick={goNext} type="button">
                Próximo <ChevronRight size={18} />
              </button>
            ) : (
              <button
                className="button primary"
                disabled={saving}
                onClick={finishRegistration}
                type="button"
              >
                <CheckCircle2 size={18} />{' '}
                {saving
                  ? 'Salvando no Banco...'
                  : isEditing
                  ? 'Salvar Alterações'
                  : 'Finalizar Cadastro'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
