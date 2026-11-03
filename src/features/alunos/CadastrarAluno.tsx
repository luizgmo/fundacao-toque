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
import type { Student, StudentStatus } from './students-data'
import { createStudent, updateStudent } from '../../services/studentsService'
import type { StudentInput } from '../../services/studentsService'
import { subscribeToTurmas } from '../../services/turmasService'
import { subscribeToOficinas } from '../../services/oficinasService'
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
  const [photoName, setPhotoName] = useState('')
  const [fichaMedica, setFichaMedica] = useState('')
  const [fichaMatricula, setFichaMatricula] = useState('')
  const [lgpdImagem, setLgpdImagem] = useState(true)
  const [lgpdDados, setLgpdDados] = useState(true)
  const [draftMessage, setDraftMessage] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [firestoreTurmas, setFirestoreTurmas] = useState<Turma[]>([])
  const [firestoreOficinas, setFirestoreOficinas] = useState<Oficina[]>([])

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

  const pickFile = (setter: (name: string) => void) => (event: ChangeEvent<HTMLInputElement>) => {
    setter(event.target.files?.[0]?.name ?? '')
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

  const finishRegistration = async () => {
    if (!validateStep(1) || !validateStep(2) || !validateStep(4)) {
      return
    }
    setSaving(true)
    setSaveError(null)

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
        fichaMedica: fichaMedica || undefined,
        fichaMatricula: fichaMatricula || undefined,
        lgpdImagem,
        lgpdDados,
        status: form.status,
      }

      if (initialStudent) {
        await updateStudent(initialStudent.id, payload)
        setSubmitted(true)
        if (onSaveSuccess) onSaveSuccess(initialStudent.id)
      } else {
        const newId = await createStudent(payload)
        setSubmitted(true)
        if (onSaveSuccess) onSaveSuccess(newId)
      }
    } catch (err: any) {
      console.error('Erro ao salvar aluno:', err)
      setSaveError('Erro ao gravar dados no Firestore: ' + (err.message || 'Tente novamente.'))
    } finally {
      setSaving(false)
    }
  }

  const resetForm = () => {
    setForm(initialForm)
    setPhotoName('')
    setFichaMedica('')
    setFichaMatricula('')
    setLgpdImagem(true)
    setLgpdDados(true)
    setDraftMessage('')
    setSubmitted(false)
    setSaveError(null)
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
                <input accept="image/*" onChange={pickFile(setPhotoName)} type="file" />
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
                <h3>Responsável e contato</h3>
                <p>Dados de quem responde legalmente pelo aluno.</p>
              </div>
            </div>

            <div className="form-grid">
              <label className="field field-wide">
                <span>Nome do responsável *</span>
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

            <label className="field field-wide">
              <span>Ficha médica (PDF ou imagem)</span>
              <label className="upload-area">
                <input accept=".pdf,image/*" onChange={pickFile(setFichaMedica)} type="file" />
                <span className="upload-icon">
                  <Upload size={23} />
                </span>
                <strong>{fichaMedica || 'Selecione um arquivo para anexar'}</strong>
                <span>PDF, JPG ou PNG · máximo de 10 MB</span>
              </label>
            </label>

            <label className="field field-wide">
              <span>
                Ficha de matrícula <em>(opcional)</em>
              </span>
              <label className="upload-area">
                <input accept=".pdf,image/*" onChange={pickFile(setFichaMatricula)} type="file" />
                <span className="upload-icon">
                  <Upload size={23} />
                </span>
                <strong>{fichaMatricula || 'Selecione um arquivo para anexar'}</strong>
                <span>PDF, JPG ou PNG · máximo de 10 MB</span>
              </label>
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
                    <dd>{fichaMedica ? 'Anexada' : 'Pendente'}</dd>
                  </div>
                  <div>
                    <dt>LGPD</dt>
                    <dd>{lgpdImagem && lgpdDados ? 'Autorizado' : 'Pendente'}</dd>
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
