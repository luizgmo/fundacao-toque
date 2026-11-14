import { useCallback, useEffect, useState } from 'react'
import type { ChangeEvent } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  Pencil,
  Save,
  ShieldCheck,
  Upload,
  X,
} from 'lucide-react'
import { useAuth } from '../auth/AuthContext'
import type { UserRole } from '../../types/auth'
import { describePersistenceError, failureMessage } from '../../lib/persistence'
import { LoadError } from '../../components/LoadError'
import {
  canEditMedicalRecord,
  getFichaMedica,
  getFichaMedicaAnexoUrl,
  salvarFichaMedica,
  MAX_FICHA_MEDICA_BYTES,
} from '../../services/medicalService'
import type {
  DadosFichaMedica,
  FichaMedica as FichaMedicaData,
  FormatoFichaMedica,
} from '../../services/medicalService'

type FormState = {
  tipos: string
  cids: string
  formato: FormatoFichaMedica
  alergias: string
  medicamentos: string
  restricoes: string
  cuidados: string
  contatoNome: string
  contatoTelefone: string
  historico: string
  observacoes: string
}

const EMPTY_FORM: FormState = {
  tipos: '',
  cids: '',
  formato: 'digital',
  alergias: '',
  medicamentos: '',
  restricoes: '',
  cuidados: '',
  contatoNome: '',
  contatoTelefone: '',
  historico: '',
  observacoes: '',
}

function formDaFicha(ficha: FichaMedicaData | null): FormState {
  const dados = ficha?.dadosFichaMedica
  return {
    tipos: ficha?.tiposDeficiencia.join(', ') ?? '',
    cids: ficha?.codigosCid.join(', ') ?? '',
    formato: ficha?.formatoFichaMedica ?? 'digital',
    alergias: dados?.alergias ?? '',
    medicamentos: dados?.medicamentos ?? '',
    restricoes: dados?.restricoesAlimentares ?? '',
    cuidados: dados?.cuidadosEspeciais ?? '',
    contatoNome: dados?.contatoEmergenciaNome ?? '',
    contatoTelefone: dados?.contatoEmergenciaTelefone ?? '',
    historico: dados?.historicoMedico ?? '',
    observacoes: dados?.observacoes ?? '',
  }
}

function dadosDoForm(form: FormState): DadosFichaMedica {
  return {
    alergias: form.alergias.trim() || undefined,
    medicamentos: form.medicamentos.trim() || undefined,
    restricoesAlimentares: form.restricoes.trim() || undefined,
    cuidadosEspeciais: form.cuidados.trim() || undefined,
    contatoEmergenciaNome: form.contatoNome.trim() || undefined,
    contatoEmergenciaTelefone: form.contatoTelefone.trim() || undefined,
    historicoMedico: form.historico.trim() || undefined,
    observacoes: form.observacoes.trim() || undefined,
  }
}

function formatarDataHora(iso?: string): string | null {
  if (!iso) return null
  const data = new Date(iso)
  if (Number.isNaN(data.getTime())) return null
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(data)
}

function formatarTamanho(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

const DETALHES: { campo: keyof DadosFichaMedica; rotulo: string }[] = [
  { campo: 'alergias', rotulo: 'Alergias' },
  { campo: 'medicamentos', rotulo: 'Medicamentos em uso' },
  { campo: 'restricoesAlimentares', rotulo: 'Restrições alimentares' },
  { campo: 'cuidadosEspeciais', rotulo: 'Cuidados especiais' },
  { campo: 'contatoEmergenciaNome', rotulo: 'Contato de emergência' },
  { campo: 'contatoEmergenciaTelefone', rotulo: 'Telefone de emergência' },
  { campo: 'historicoMedico', rotulo: 'Histórico médico' },
  { campo: 'observacoes', rotulo: 'Observações' },
]

export function FichaMedica({
  alunoId,
  papel,
}: {
  alunoId: string
  papel?: UserRole | null
}) {
  const { currentUser, userProfile } = useAuth()
  const podeEditar = canEditMedicalRecord(papel)
  const [ficha, setFicha] = useState<FichaMedicaData | null>(null)
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading')
  const [error, setError] = useState<unknown>(null)
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState<FormState>(EMPTY_FORM)
  const [arquivo, setArquivo] = useState<File | null>(null)
  const [anexoUrl, setAnexoUrl] = useState<{ caminho: string; url: string } | null>(null)
  const [anexoUrlErro, setAnexoUrlErro] = useState<{
    caminho: string
    mensagem: string
  } | null>(null)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const carregada = await getFichaMedica(alunoId)
      setFicha(carregada)
      setForm(formDaFicha(carregada))
      setStatus('ready')
    } catch (err) {
      setError(err)
      setStatus('error')
    }
  }, [alunoId])

  useEffect(() => {
    let ativo = true
    getFichaMedica(alunoId)
      .then((carregada) => {
        if (!ativo) return
        setFicha(carregada)
        setForm(formDaFicha(carregada))
        setStatus('ready')
      })
      .catch((err) => {
        if (!ativo) return
        setError(err)
        setStatus('error')
      })
    return () => {
      ativo = false
    }
  }, [alunoId])

  useEffect(() => {
    let ativo = true
    const anexo = ficha?.anexo
    if (!anexo) return () => {
      ativo = false
    }
    getFichaMedicaAnexoUrl(anexo)
      .then((url) => {
        if (ativo) setAnexoUrl({ caminho: anexo.caminhoStorage, url })
      })
      .catch((err) => {
        if (ativo) {
          setAnexoUrlErro({
            caminho: anexo.caminhoStorage,
            mensagem: describePersistenceError(err),
          })
        }
      })
    return () => {
      ativo = false
    }
  }, [ficha])

  function update<K extends keyof FormState>(campo: K, valor: FormState[K]) {
    setForm((atual) => ({ ...atual, [campo]: valor }))
  }

  const iniciarEdicao = () => {
    setForm(formDaFicha(ficha))
    setArquivo(null)
    setSaveError(null)
    setSuccess(null)
    setEditing(true)
  }

  const cancelarEdicao = () => {
    setForm(formDaFicha(ficha))
    setArquivo(null)
    setSaveError(null)
    setEditing(false)
  }

  const selecionarArquivo = (event: ChangeEvent<HTMLInputElement>) => {
    setArquivo(event.target.files?.[0] ?? null)
    setSaveError(null)
  }

  const salvar = async () => {
    const tipos = form.tipos
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean)
    if (tipos.length === 0) {
      setSaveError('Informe ao menos um tipo de deficiência.')
      return
    }
    if (form.formato === 'anexo' && !ficha?.anexo && !arquivo) {
      setSaveError('Anexe o arquivo da ficha médica.')
      return
    }
    const userId = currentUser?.uid || userProfile?.uid
    if (!userId) {
      setSaveError('Sessão expirada; entre novamente no sistema.')
      return
    }

    setSaving(true)
    setSaveError(null)
    setSuccess(null)
    try {
      const salva = await salvarFichaMedica(
        alunoId,
        {
          tiposDeficiencia: tipos,
          codigosCid: form.cids
            .split(',')
            .map((item) => item.trim())
            .filter(Boolean),
          formatoFichaMedica: form.formato,
          dadosFichaMedica: form.formato === 'digital' ? dadosDoForm(form) : null,
          anexo: form.formato === 'anexo' ? ficha?.anexo ?? null : null,
          novoAnexo: form.formato === 'anexo' ? arquivo : null,
          removerAnexo: form.formato !== 'anexo' && Boolean(ficha?.anexo),
        },
        userId
      )
      setFicha(salva)
      setForm(formDaFicha(salva))
      setArquivo(null)
      setEditing(false)
      setSuccess('Ficha médica salva no sistema.')
    } catch (err) {
      setSaveError(failureMessage(err, 'salvar a ficha médica'))
    } finally {
      setSaving(false)
    }
  }

  if (status === 'loading') {
    return <p className="student-empty">Carregando ficha médica…</p>
  }

  if (status === 'error') {
    return (
      <LoadError
        error={error}
        impact="Os dados médicos não são exibidos sem confirmação do servidor."
        onRetry={carregar}
        what="a ficha médica"
      />
    )
  }

  if (editing) {
    return (
      <div className="medical-record">
        <div className="medical-record-header">
          <div>
            <h3>Editar ficha médica</h3>
            <p>Acesso restrito à Direção e à Pedagogia.</p>
          </div>
        </div>

        {saveError && (
          <div className="medical-alert error" role="alert">
            <AlertCircle size={16} /> {saveError}
          </div>
        )}

        <div className="medical-form">
          <label className="field field-wide">
            <span>Tipos de deficiência *</span>
            <input
              onChange={(event) => update('tipos', event.target.value)}
              placeholder="Ex: TEA, Deficiência intelectual"
              value={form.tipos}
            />
            <small>Separe múltiplos tipos por vírgula.</small>
          </label>

          <label className="field field-wide">
            <span>Códigos CID</span>
            <input
              onChange={(event) => update('cids', event.target.value)}
              placeholder="Ex: F84.0, F71"
              value={form.cids}
            />
            <small>Opcional. Separe múltiplos códigos por vírgula.</small>
          </label>

          <fieldset className="medical-format">
            <legend>Formato da ficha</legend>
            <label>
              <input
                checked={form.formato === 'digital'}
                name="formato-ficha"
                onChange={() => update('formato', 'digital')}
                type="radio"
              />
              Digitada no sistema
            </label>
            <label>
              <input
                checked={form.formato === 'anexo'}
                name="formato-ficha"
                onChange={() => update('formato', 'anexo')}
                type="radio"
              />
              Anexo digitalizado
            </label>
          </fieldset>

          {form.formato === 'digital' ? (
            <div className="medical-grid">
              <label className="field">
                <span>Alergias</span>
                <textarea
                  onChange={(event) => update('alergias', event.target.value)}
                  rows={2}
                  value={form.alergias}
                />
              </label>
              <label className="field">
                <span>Medicamentos em uso</span>
                <textarea
                  onChange={(event) => update('medicamentos', event.target.value)}
                  rows={2}
                  value={form.medicamentos}
                />
              </label>
              <label className="field">
                <span>Restrições alimentares</span>
                <textarea
                  onChange={(event) => update('restricoes', event.target.value)}
                  rows={2}
                  value={form.restricoes}
                />
              </label>
              <label className="field">
                <span>Cuidados especiais</span>
                <textarea
                  onChange={(event) => update('cuidados', event.target.value)}
                  rows={2}
                  value={form.cuidados}
                />
              </label>
              <label className="field">
                <span>Contato de emergência</span>
                <input
                  onChange={(event) => update('contatoNome', event.target.value)}
                  value={form.contatoNome}
                />
              </label>
              <label className="field">
                <span>Telefone de emergência</span>
                <input
                  onChange={(event) => update('contatoTelefone', event.target.value)}
                  type="tel"
                  value={form.contatoTelefone}
                />
              </label>
              <label className="field field-wide">
                <span>Histórico médico</span>
                <textarea
                  onChange={(event) => update('historico', event.target.value)}
                  rows={3}
                  value={form.historico}
                />
              </label>
              <label className="field field-wide">
                <span>Observações</span>
                <textarea
                  onChange={(event) => update('observacoes', event.target.value)}
                  rows={2}
                  value={form.observacoes}
                />
              </label>
            </div>
          ) : (
            <div className="medical-attachment-editor">
              {ficha?.anexo && (
                <p>
                  Anexo atual: <strong>{ficha.anexo.nomeArquivo}</strong>
                </p>
              )}
              <label className="field field-wide">
                <span>{ficha?.anexo ? 'Substituir anexo' : 'Anexo da ficha *'}</span>
                <div className="upload-area">
                  <input
                    accept=".pdf,image/jpeg,image/png,image/webp"
                    onChange={selecionarArquivo}
                    type="file"
                  />
                  <span className="upload-icon">
                    <Upload size={23} />
                  </span>
                  <strong>{arquivo ? arquivo.name : 'Selecione um arquivo para anexar'}</strong>
                  <span>
                    PDF, JPG, PNG ou WEBP · máximo de{' '}
                    {Math.round(MAX_FICHA_MEDICA_BYTES / 1024 / 1024)} MB
                  </span>
                </div>
              </label>
            </div>
          )}

          <div className="medical-actions">
            <button
              className="button secondary"
              disabled={saving}
              onClick={cancelarEdicao}
              type="button"
            >
              <X size={18} /> Cancelar
            </button>
            <button
              className="button primary"
              disabled={saving}
              onClick={salvar}
              type="button"
            >
              <Save size={18} /> {saving ? 'Salvando…' : 'Salvar ficha'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!ficha) {
    return (
      <div className="medical-record">
        <div className="medical-empty">
          <ShieldCheck size={28} />
          <div>
            <strong>Nenhuma ficha médica cadastrada.</strong>
            <p>Os dados médicos ficam separados do cadastro comum do aluno.</p>
          </div>
          {podeEditar && (
            <button className="button primary" onClick={iniciarEdicao} type="button">
              <Pencil size={16} /> Cadastrar ficha médica
            </button>
          )}
        </div>
      </div>
    )
  }

  const atualizadoEm = formatarDataHora(ficha.atualizadoEm)
  const detalhes = DETALHES.map(({ campo, rotulo }) => ({
    rotulo,
    valor: ficha.dadosFichaMedica?.[campo],
  })).filter((item) => Boolean(item.valor))
  const urlDoAnexo =
    ficha.anexo && anexoUrl?.caminho === ficha.anexo.caminhoStorage ? anexoUrl.url : null
  const erroDoAnexo =
    ficha.anexo && anexoUrlErro?.caminho === ficha.anexo.caminhoStorage
      ? anexoUrlErro.mensagem
      : null

  return (
    <div className="medical-record">
      <div className="medical-record-header">
        <div>
          <h3>Ficha médica</h3>
          <p>Acesso restrito à Direção e à Pedagogia.</p>
        </div>
        {podeEditar && (
          <button className="button secondary" onClick={iniciarEdicao} type="button">
            <Pencil size={16} /> Editar ficha
          </button>
        )}
      </div>

      {success && (
        <div className="medical-alert success" role="status">
          <CheckCircle2 size={16} /> {success}
        </div>
      )}

      <section className="medical-section">
        <h4>Condições de saúde</h4>
        <div className="medical-chip-list">
          {ficha.tiposDeficiencia.map((tipo) => (
            <span className="medical-chip" key={tipo}>
              {tipo}
            </span>
          ))}
        </div>
        {ficha.codigosCid.length > 0 && (
          <p className="medical-line">
            <strong>CID:</strong> {ficha.codigosCid.join(', ')}
          </p>
        )}
      </section>

      <section className="medical-section">
        <h4>
          {ficha.formatoFichaMedica === 'anexo' ? 'Ficha anexada' : 'Ficha digitada'}
        </h4>
        {ficha.formatoFichaMedica === 'anexo' ? (
          ficha.anexo ? (
            <div className="medical-attachment">
              <FileText size={24} />
              <div>
                <strong>{ficha.anexo.nomeArquivo}</strong>
                <span>
                  {ficha.anexo.tipoConteudo} · {formatarTamanho(ficha.anexo.tamanhoBytes)}
                </span>
              </div>
              {urlDoAnexo ? (
                <a
                  className="button secondary"
                  href={urlDoAnexo}
                  rel="noopener noreferrer"
                  target="_blank"
                >
                  Abrir anexo
                </a>
              ) : erroDoAnexo ? (
                <span className="medical-line">Não foi possível abrir o anexo: {erroDoAnexo}</span>
              ) : (
                <span className="medical-line">Carregando anexo…</span>
              )}
            </div>
          ) : (
            <p className="medical-line">Nenhum anexo cadastrado.</p>
          )
        ) : detalhes.length > 0 ? (
          <div className="medical-grid">
            {detalhes.map((item) => (
              <div className="medical-field" key={item.rotulo}>
                <span>{item.rotulo}</span>
                <strong>{item.valor}</strong>
              </div>
            ))}
          </div>
        ) : (
          <p className="medical-line">Nenhum detalhe médico informado.</p>
        )}
      </section>

      <p className="medical-footer">
        {atualizadoEm ? `Atualizado em ${atualizadoEm}` : 'Data de atualização não registrada'}
        {ficha.atualizadoPor ? ` por ${ficha.atualizadoPor}` : ''}.
      </p>
    </div>
  )
}
