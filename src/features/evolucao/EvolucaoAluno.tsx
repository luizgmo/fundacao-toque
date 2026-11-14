import { useMemo, useState } from 'react'
import { AlertCircle, BarChart3, CheckCircle2, Plus } from 'lucide-react'
import { LoadError } from '../../components/LoadError'
import { useQuery } from '../../lib/useSubscription'
import { failureMessage } from '../../lib/persistence'
import {
  canCreateEvolution,
  canReadEvolution,
  criarEvolucao,
  EVOLUTION_AREAS,
  EVOLUTION_AREA_LABELS,
  listarEvolucaoAluno,
  ordenarEvolucao,
} from '../../services/evolutionService'
import type { EvolutionArea, EvolucaoRegistro } from '../../services/evolutionService'
import type { UserRole } from '../../types/auth'
import { useAuth } from '../auth/AuthContext'
import './Evolucao.css'

type FiltrosEvolucao = {
  area?: string
  inicio?: string
  fim?: string
}

type Props = {
  alunoId: string
  papel?: UserRole | null
  filtros?: FiltrosEvolucao
  onRegistroCriado?: (registro: EvolucaoRegistro) => void
}

function hojeISO(): string {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60_000
  return new Date(now.getTime() - offset).toISOString().slice(0, 10)
}

function formatarData(valor: string): string {
  const [ano, mes, dia] = valor.split('-').map(Number)
  if (!ano || !mes || !dia) return valor
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long' }).format(
    new Date(ano, mes - 1, dia)
  )
}

function formatarDataHora(valor?: string): string | null {
  if (!valor) return null
  const data = new Date(valor)
  if (Number.isNaN(data.getTime())) return null
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(data)
}

export function EvolucaoAluno({ alunoId, papel, filtros, onRegistroCriado }: Props) {
  const { currentUser, userProfile } = useAuth()
  const papelAtual = papel ?? userProfile?.papel
  const podeLer = canReadEvolution(papelAtual)
  const podeCriar = canCreateEvolution(papelAtual)
  const profissionalUsuarioId = userProfile?.uid || currentUser?.uid || ''
  const profissionalNome = userProfile?.nome_completo || currentUser?.displayName || ''

  const evolucao = useQuery(() => listarEvolucaoAluno(alunoId), [], alunoId)
  const [extras, setExtras] = useState<{ alunoId: string; registros: EvolucaoRegistro[] }>({
    alunoId,
    registros: [],
  })
  const [dataRegistro, setDataRegistro] = useState(hojeISO)
  const [area, setArea] = useState<EvolutionArea>('cognitiva')
  const [observacao, setObservacao] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  const registros = useMemo(() => {
    const map = new Map(evolucao.data.map((registro) => [registro.id, registro]))
    if (extras.alunoId === alunoId) {
      extras.registros.forEach((registro) => map.set(registro.id, registro))
    }
    return ordenarEvolucao(Array.from(map.values()))
  }, [alunoId, evolucao.data, extras])

  const registrosVisiveis = useMemo(() => {
    const inicio = filtros?.inicio
    const fim = filtros?.fim
    const areaFiltro = filtros?.area
    return registros.filter((registro) => {
      if (areaFiltro && registro.area !== areaFiltro) return false
      if (inicio && registro.dataRegistro < inicio) return false
      if (fim && registro.dataRegistro > fim) return false
      return true
    })
  }, [registros, filtros])

  if (!podeLer) {
    return (
      <p className="student-empty">
        Seu perfil não tem acesso ao histórico de evolução pedagógica.
      </p>
    )
  }

  if (evolucao.status === 'loading') {
    return <p className="student-empty">Carregando evolução do aluno…</p>
  }

  if (evolucao.status === 'error') {
    return (
      <LoadError
        error={evolucao.error}
        impact="O histórico pode estar incompleto; nenhum registro vazio é exibido."
        onRetry={evolucao.retry}
        what="a evolução do aluno"
      />
    )
  }

  const registrar = async () => {
    if (!profissionalUsuarioId || !profissionalNome) {
      setSaveError('Sessão expirada; entre novamente no sistema.')
      return
    }

    setSaving(true)
    setSaveError(null)
    setSuccess(null)
    try {
      const registro = await criarEvolucao({
        alunoId,
        dataRegistro,
        profissionalUsuarioId,
        profissionalNome,
        area,
        observacao,
      })
      setExtras((atual) => ({
        alunoId,
        registros: [...(atual.alunoId === alunoId ? atual.registros : []), registro],
      }))
      setObservacao('')
      setSuccess('Registro de evolução salvo.')
      onRegistroCriado?.(registro)
    } catch (err) {
      setSaveError(failureMessage(err, 'registrar a evolução do aluno'))
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="evolucao-aluno">
      {podeCriar && (
        <section className="evolucao-form-card">
          <div className="evolucao-form-heading">
            <div>
              <h3>Registrar evolução</h3>
              <p>O profissional e a autoria são registrados com a sessão atual.</p>
            </div>
          </div>

          {saveError && (
            <div className="evolucao-alert error" role="alert">
              <AlertCircle size={16} /> {saveError}
            </div>
          )}
          {success && (
            <div className="evolucao-alert success" role="status">
              <CheckCircle2 size={16} /> {success}
            </div>
          )}

          <form
            className="evolucao-form"
            onSubmit={(event) => {
              event.preventDefault()
              void registrar()
            }}
          >
            <label className="field">
              <span>Data do registro *</span>
              <input
                onChange={(event) => setDataRegistro(event.target.value)}
                type="date"
                value={dataRegistro}
              />
            </label>

            <label className="field">
              <span>Profissional</span>
              <input readOnly value={profissionalNome || 'Sessão sem identificação'} />
            </label>

            <label className="field">
              <span>Área *</span>
              <select
                onChange={(event) => setArea(event.target.value as EvolutionArea)}
                value={area}
              >
                {EVOLUTION_AREAS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="field field-wide">
              <span>Observação *</span>
              <textarea
                maxLength={5000}
                onChange={(event) => setObservacao(event.target.value)}
                placeholder="Descreva a observação de evolução do aluno…"
                rows={4}
                value={observacao}
              />
              <small>{observacao.length}/5000 caracteres.</small>
            </label>

            <p className="evolucao-form-note">
              Os registros são imutáveis. Para corrigir uma informação, faça um novo lançamento.
            </p>

            <div className="evolucao-form-actions">
              <button className="button primary" disabled={saving} type="submit">
                <Plus size={18} /> {saving ? 'Salvando…' : 'Registrar evolução'}
              </button>
            </div>
          </form>
        </section>
      )}

      <section className="evolucao-history">
        <h3 className="evolucao-section-title">Histórico de evolução</h3>
        {registrosVisiveis.length > 0 ? (
          <div className="evolucao-timeline">
            {registrosVisiveis.map((registro) => {
              const registradoEm = formatarDataHora(registro.criadoEm)
              return (
                <article className="evolucao-timeline-item" key={registro.id}>
                  <span className="evolucao-timeline-dot">
                    <BarChart3 size={14} />
                  </span>
                  <div className="evolucao-timeline-content">
                    <div className="evolucao-timeline-header">
                      <span className="evolucao-area">
                        {EVOLUTION_AREA_LABELS[registro.area]}
                      </span>
                      <span className="evolucao-date">
                        {formatarData(registro.dataRegistro)}
                      </span>
                    </div>
                    <p className="evolucao-note">{registro.observacao}</p>
                    <p className="evolucao-author">
                      <strong>{registro.profissionalNome || 'Profissional não informado'}</strong>
                      {registradoEm ? ` · lançado em ${registradoEm}` : ''}
                    </p>
                  </div>
                </article>
              )
            })}
          </div>
        ) : (
          <p className="student-empty">
            {filtros?.area || filtros?.inicio || filtros?.fim
              ? 'Nenhum registro de evolução encontrado com os filtros informados.'
              : 'Nenhuma observação de evolução registrada ainda.'}
          </p>
        )}
      </section>
    </div>
  )
}

