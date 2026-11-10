import { useMemo, useState } from 'react'
import type { ChangeEvent, FormEvent } from 'react'
import {
  AlertCircle,
  AlertTriangle,
  BookOpenCheck,
  Camera,
  CheckCircle2,
  Eye,
  History,
  ImageOff,
  Save,
  Trash2,
  Upload,
  UserRoundCheck,
  X,
} from 'lucide-react'
import type { RegistroAtividade, Anexo } from '../../types/atividades'
import type { Oficina, TurmaOficina } from '../../types/oficinas'
import { getCategoria, vinculoPrevistoEm, vinculosAtivosDaTurma } from '../../types/oficinas'
import type { Turma } from '../../types/turmas'
import { PERIODO_LABELS } from '../../types/turmas'
import type { UserProfile } from '../../types/auth'
import {
  MAX_FOTO_BYTES,
  anexarFotosRegistro,
  createRegistroAtividade,
  deleteRegistroAtividade,
  getAnexosComUrl,
  subscribeToRegistrosAtividade,
} from '../../services/activitiesService'
import { subscribeToOficinas, subscribeToTurmaOficinas } from '../../services/oficinasService'
import { subscribeToTurmas } from '../../services/turmasService'
import { getUsuarioNome, subscribeToUsuarios } from '../../services/usuariosService'
import { useAuth } from '../auth/AuthContext'
import { failureMessage } from '../../lib/persistence'
import { useSubscription } from '../../lib/useSubscription'
import { LoadError, LoadErrors } from '../../components/LoadError'
import type { ResultadoPersistencia } from '../../lib/persistence'
import './Atividades.css'

type FotoSelecionada = { file: File; previewUrl: string }

function todayISO() {
  const now = new Date()
  const offset = now.getTimezoneOffset() * 60000
  return new Date(now.getTime() - offset).toISOString().split('T')[0]
}

function formatDateLabel(dateStr: string) {
  const [y, m, d] = dateStr.split('-')
  const formatted = `${d}/${m}/${y}`
  const today = todayISO()
  const yesterday = new Date(Date.now() - 86400000 - new Date().getTimezoneOffset() * 60000)
    .toISOString()
    .split('T')[0]
  if (dateStr === today) return `Hoje — ${formatted}`
  if (dateStr === yesterday) return `Ontem — ${formatted}`
  return formatted
}

export function Atividades() {
  const { userProfile } = useAuth()
  const canDelete = userProfile?.papel === 'direcao'

  // Estados separados de carregando / erro / dados para cada fonte.
  const turmasSub = useSubscription<Turma[]>(subscribeToTurmas, [])
  const oficinasSub = useSubscription<Oficina[]>(subscribeToOficinas, [])
  const vinculosSub = useSubscription<TurmaOficina[]>(subscribeToTurmaOficinas, [])
  const usuariosSub = useSubscription<UserProfile[]>(subscribeToUsuarios, [])
  const registrosSub = useSubscription<RegistroAtividade[]>(
    (onData, onError) => subscribeToRegistrosAtividade(onData, onError),
    []
  )
  const turmas = turmasSub.data
  const oficinas = oficinasSub.data
  const vinculos = vinculosSub.data
  const usuarios = usuariosSub.data
  const registros = registrosSub.data

  // Formulário
  const [turmaId, setTurmaId] = useState('')
  const [dataAtividade, setDataAtividade] = useState(todayISO)
  const [idsTurmaOficinas, setIdsTurmaOficinas] = useState<string[]>([])
  const [responsavelId, setResponsavelId] = useState(userProfile?.uid || '')
  const [observacoes, setObservacoes] = useState('')
  const [fotos, setFotos] = useState<FotoSelecionada[]>([])
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'warning'; message: string } | null>(
    null
  )
  // Registro já gravado cujas fotos não foram todas enviadas. Enquanto existir,
  // o envio do formulário reenvia apenas as fotos pendentes para este registro.
  const [registroPendente, setRegistroPendente] = useState<{ id: string; label: string } | null>(null)

  // Histórico
  const [historicoTurma, setHistoricoTurma] = useState('todas')
  const [registroDetalhe, setRegistroDetalhe] = useState<RegistroAtividade | null>(null)
  const [anexosDetalhe, setAnexosDetalhe] = useState<(Anexo & { url: string | null })[]>([])
  const [loadingAnexos, setLoadingAnexos] = useState(false)
  const [anexosError, setAnexosError] = useState<unknown>(null)
  const [registroToDelete, setRegistroToDelete] = useState<RegistroAtividade | null>(null)
  const [deleting, setDeleting] = useState(false)


  const turmasAtivas = turmas.filter((t) => t.ativo)

  // Só vínculos ativos (com oficina ativa) recebem novos registros; os ids
  // gravados em ids_turma_oficinas são os turma_oficina_id desses vínculos.
  const oficinasDaTurma = useMemo(
    () => vinculosAtivosDaTurma(vinculos, oficinas, turmaId),
    [vinculos, oficinas, turmaId]
  )

  const registrosFiltrados = useMemo(
    () =>
      historicoTurma === 'todas' ? registros : registros.filter((r) => r.turmaId === historicoTurma),
    [registros, historicoTurma]
  )

  const turmaNome = (id: string) => turmas.find((t) => t.id === id)?.nome || 'Turma removida'

  const oficinaDoVinculo = (vinculoId: string) => {
    const vinculo = vinculos.find((v) => v.id === vinculoId)
    return vinculo ? oficinas.find((o) => o.id === vinculo.oficinaId) : undefined
  }

  // Pré-marca as oficinas previstas para o dia da semana da data escolhida,
  // respeitando a vigência de cada horário
  const oficinasPrevistas = (novaTurmaId: string, novaData: string) => {
    if (!novaTurmaId || !novaData) return []
    return vinculosAtivosDaTurma(vinculos, oficinas, novaTurmaId)
      .filter(({ vinculo }) => vinculoPrevistoEm(vinculo, novaData))
      .map(({ vinculo }) => vinculo.id)
  }

  const handleTurmaChange = (value: string) => {
    setTurmaId(value)
    setIdsTurmaOficinas(oficinasPrevistas(value, dataAtividade))
  }

  const handleDataChange = (value: string) => {
    setDataAtividade(value)
    setIdsTurmaOficinas(oficinasPrevistas(turmaId, value))
  }

  const toggleOficina = (vinculoId: string) => {
    setIdsTurmaOficinas((current) =>
      current.includes(vinculoId) ? current.filter((id) => id !== vinculoId) : [...current, vinculoId]
    )
  }

  const handleSelectFotos = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || [])
    const invalidas = files.filter((f) => !f.type.startsWith('image/') || f.size > MAX_FOTO_BYTES)
    const validas = files.filter((f) => f.type.startsWith('image/') && f.size <= MAX_FOTO_BYTES)

    setFormError(
      invalidas.length > 0
        ? `${invalidas.length} arquivo(s) ignorado(s): envie apenas imagens JPG ou PNG de até 5 MB.`
        : null
    )
    setFotos((current) => [
      ...current,
      ...validas.map((file) => ({ file, previewUrl: URL.createObjectURL(file) })),
    ])
    event.target.value = ''
  }

  const removeFoto = (index: number) => {
    setFotos((current) => {
      URL.revokeObjectURL(current[index].previewUrl)
      return current.filter((_, i) => i !== index)
    })
  }

  const resetForm = () => {
    fotos.forEach((f) => URL.revokeObjectURL(f.previewUrl))
    setFotos([])
    setObservacoes('')
    setIdsTurmaOficinas(oficinasPrevistas(turmaId, dataAtividade))
    setRegistroPendente(null)
  }

  // Mantém no formulário apenas as fotos que falharam e informa o que foi persistido.
  const aplicarResultadoFotos = (
    resultado: ResultadoPersistencia,
    registro: { id: string; label: string },
    enviadasAntes: FotoSelecionada[]
  ) => {
    if (resultado.status === 'salvo') {
      resetForm()
      setFeedback({
        tone: 'success',
        message:
          resultado.enviados.length > 0
            ? `${registro.label}: registro e ${resultado.enviados.length} foto(s) gravados no sistema.`
            : `${registro.label}: registro gravado no sistema.`,
      })
      setTimeout(() => setFeedback(null), 3500)
      return
    }

    const indicesComFalha = new Set(
      resultado.falhas.map((f) => f.indice).filter((i): i is number => i !== undefined)
    )
    enviadasAntes.forEach((foto, index) => {
      if (!indicesComFalha.has(index)) URL.revokeObjectURL(foto.previewUrl)
    })
    const pendentes = enviadasAntes.filter((_, index) => indicesComFalha.has(index))
    if (pendentes.length > 0) {
      setFotos(pendentes)
      setRegistroPendente(registro)
    } else {
      // Nenhum arquivo a reenviar (ex.: só o contador falhou): o registro está
      // gravado, então o formulário é limpo para não duplicá-lo num novo envio.
      setFotos([])
      setObservacoes('')
      setIdsTurmaOficinas(oficinasPrevistas(turmaId, dataAtividade))
      setRegistroPendente(null)
    }

    const enviadas = resultado.enviados.length
      ? ` Fotos gravadas: ${resultado.enviados.join(', ')}.`
      : ' Nenhuma foto foi gravada.'
    const faltando = resultado.falhas.map((f) => `${f.nome} (${f.motivo})`).join('; ')
    setFeedback({
      tone: 'warning',
      message:
        `${registro.label}: o registro da atividade está salvo, mas o envio ficou incompleto.` +
        `${enviadas} Não enviadas: ${faltando}.` +
        (pendentes.length > 0
          ? ' As fotos pendentes continuam no formulário: use “Reenviar fotos pendentes”.'
          : ''),
    })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setFeedback(null)

    if (!turmaId) {
      setFormError('Selecione a turma.')
      return
    }
    if (dataAtividade > todayISO()) {
      setFormError('Não é possível registrar atividades em datas futuras.')
      return
    }
    const responsavel = responsavelId || userProfile?.uid
    if (!responsavel) {
      setFormError('Selecione o profissional responsável pelo registro.')
      return
    }

    if (registroPendente) {
      setSaving(true)
      const enviadasAntes = fotos
      try {
        const resultado = await anexarFotosRegistro(
          registroPendente.id,
          enviadasAntes.map((f) => f.file),
          userProfile?.uid || 'sistema'
        )
        aplicarResultadoFotos(resultado, registroPendente, enviadasAntes)
      } finally {
        setSaving(false)
      }
      return
    }

    // Um vínculo pode ter sido inativado enquanto o formulário estava aberto:
    // novos registros só podem referenciar vínculos ativos da turma.
    const idsDisponiveis = new Set(oficinasDaTurma.map(({ vinculo }) => vinculo.id))
    const indisponiveis = idsTurmaOficinas.filter((id) => !idsDisponiveis.has(id))
    if (indisponiveis.length > 0) {
      setIdsTurmaOficinas((current) => current.filter((id) => idsDisponiveis.has(id)))
      setFormError(
        `${indisponiveis.length} oficina(s) marcada(s) não estão mais ativas nesta turma e foram desmarcadas. Confira e salve novamente.`
      )
      return
    }

    setSaving(true)
    const enviadasAntes = fotos
    const label = `Atividade de ${formatDateLabel(dataAtividade)} (${turmaNome(turmaId)})`
    try {
      const resultado = await createRegistroAtividade(
        {
          dataAtividade,
          turmaId,
          idsTurmaOficinas,
          usuarioResponsavelId: responsavel,
          observacoesGerais: observacoes,
        },
        enviadasAntes.map((f) => f.file),
        userProfile?.uid || 'sistema'
      )
      aplicarResultadoFotos(resultado, { id: resultado.id, label }, enviadasAntes)
    } catch (err) {
      // O registro principal não foi confirmado: nada foi salvo e o formulário fica intacto.
      console.error('Erro ao registrar atividade:', err)
      setFormError(failureMessage(err, 'registrar a atividade'))
    } finally {
      setSaving(false)
    }
  }

  const openDetalhe = async (registro: RegistroAtividade) => {
    setRegistroDetalhe(registro)
    setAnexosDetalhe([])
    setAnexosError(null)
    if (registro.totalAnexos === 0) return
    setLoadingAnexos(true)
    try {
      setAnexosDetalhe(await getAnexosComUrl(`registros_atividade/${registro.id}`))
    } catch (err) {
      console.warn('Erro ao carregar fotos do registro:', err)
      setAnexosError(err)
    } finally {
      setLoadingAnexos(false)
    }
  }

  const handleConfirmDelete = async () => {
    if (!registroToDelete) return
    setDeleting(true)
    try {
      await deleteRegistroAtividade(registroToDelete.id)
      setFeedback({ tone: 'success', message: 'Registro de atividade excluído.' })
      setTimeout(() => setFeedback(null), 3500)
      setRegistroToDelete(null)
    } catch (err) {
      console.error('Erro ao excluir registro:', err)
      alert(failureMessage(err, 'excluir o registro de atividade'))
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="page-container atividades-page">
      <div className="report-page-heading">
        <div>
          <span className="eyebrow">Pedagógico</span>
          <h2>Registro diário de atividades</h2>
          <p>Registre as oficinas realizadas em cada turma e anexe fotos das atividades.</p>
        </div>
      </div>

      <LoadErrors
        impact="As opções de turma, oficina e responsável do formulário podem estar incompletas."
        sources={[
          { what: 'as turmas', ...turmasSub },
          { what: 'as oficinas', ...oficinasSub },
          { what: 'os vínculos turma-oficina', ...vinculosSub },
          { what: 'a equipe', ...usuariosSub },
        ]}
      />

      {feedback && (
        <div className={'feedback-banner ' + feedback.tone}>
          {feedback.tone === 'success' ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
          <span>{feedback.message}</span>
        </div>
      )}

      <div className="atividades-layout">
        <form className="form-card atividades-form" onSubmit={handleSubmit}>
          <div className="form-card-heading">
            <span className="form-heading-icon">
              <BookOpenCheck size={21} />
            </span>
            <div>
              <h3>Registrar atividade</h3>
              <p>Ex.: “terça de manhã: musicalização e horta”.</p>
            </div>
          </div>

          {formError && (
            <div className="modal-error-banner atividades-error">
              <AlertCircle size={18} /> {formError}
            </div>
          )}

          <fieldset disabled={Boolean(registroPendente)} style={{ display: 'contents' }}>
          <div className="atividades-form-grid">
            <label className="field">
              <span>Turma *</span>
              <select onChange={(e) => handleTurmaChange(e.target.value)} required value={turmaId}>
                <option value="">Selecione</option>
                {turmasAtivas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} — {PERIODO_LABELS[t.periodo]}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              <span>Data *</span>
              <input
                max={todayISO()}
                onChange={(e) => handleDataChange(e.target.value)}
                required
                type="date"
                value={dataAtividade}
              />
            </label>
          </div>

          <div className="field">
            <span>Oficinas realizadas</span>
            <small>
              As oficinas previstas para o dia da semana já vêm marcadas. Ajuste conforme o que
              aconteceu.
            </small>
            {!turmaId ? (
              <p className="entity-modal-empty">Selecione a turma para ver as oficinas vinculadas.</p>
            ) : oficinasDaTurma.length === 0 ? (
              <p className="entity-modal-empty">
                Nenhuma oficina vinculada a esta turma. Vincule oficinas na tela{' '}
                <strong>Oficinas</strong>.
              </p>
            ) : (
              <div className="chip-checkbox-grid compact">
                {oficinasDaTurma.map(({ vinculo, oficina }) => (
                  <label
                    className={
                      'chip-checkbox' + (idsTurmaOficinas.includes(vinculo.id) ? ' checked' : '')
                    }
                    key={vinculo.id}
                  >
                    <input
                      checked={idsTurmaOficinas.includes(vinculo.id)}
                      onChange={() => toggleOficina(vinculo.id)}
                      type="checkbox"
                    />
                    <span>
                      {getCategoria(oficina.categoria).emoji} {oficina.nome}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          <label className="field">
            <span>Profissional responsável pelo registro *</span>
            <select
              onChange={(e) => setResponsavelId(e.target.value)}
              value={responsavelId || userProfile?.uid || ''}
            >
              {usuarios.length === 0 && userProfile && (
                <option value={userProfile.uid}>{userProfile.nome_completo}</option>
              )}
              {usuarios.map((u) => (
                <option key={u.uid} value={u.uid}>
                  {u.nome_completo}
                </option>
              ))}
            </select>
          </label>

          <label className="field">
            <span>
              Observações gerais <em>(opcional)</em>
            </span>
            <textarea
              onChange={(e) => setObservacoes(e.target.value)}
              placeholder="Descreva como foi a atividade, destaques, ocorrências..."
              rows={4}
              value={observacoes}
            />
          </label>
          </fieldset>

          <div className="field">
            <span>
              Fotos da atividade <em>(opcional)</em>
            </span>
            <label className="upload-area atividades-upload">
              <input accept="image/*" multiple onChange={handleSelectFotos} type="file" />
              <span className="upload-icon">
                <Upload size={23} />
              </span>
              <strong>Clique para anexar fotos</strong>
              <span>JPG ou PNG · até 5 MB cada</span>
            </label>
            {fotos.length > 0 && (
              <div className="foto-preview-grid">
                {fotos.map((foto, index) => (
                  <figure className="foto-preview" key={foto.previewUrl}>
                    <img alt={foto.file.name} src={foto.previewUrl} />
                    <button
                      aria-label={'Remover ' + foto.file.name}
                      onClick={() => removeFoto(index)}
                      type="button"
                    >
                      <X size={14} />
                    </button>
                  </figure>
                ))}
              </div>
            )}
          </div>

          {registroPendente && (
            <p className="entity-modal-empty">
              {registroPendente.label} já está salva. Os campos acima ficam bloqueados; apenas as
              fotos pendentes serão reenviadas para este registro.
            </p>
          )}
          <button className="button primary atividades-submit" disabled={saving} type="submit">
            <Save size={18} />{' '}
            {registroPendente
              ? saving
                ? 'Reenviando fotos...'
                : 'Reenviar fotos pendentes'
              : saving
                ? 'Salvando registro...'
                : 'Salvar registro'}
          </button>
          {registroPendente && (
            <button
              className="button secondary"
              disabled={saving}
              onClick={() => {
                resetForm()
                setFeedback(null)
              }}
              type="button"
            >
              Concluir sem as fotos pendentes
            </button>
          )}
        </form>

        <section className="section-card atividades-history">
          <div className="section-card-header">
            <h2>
              <History size={18} /> Histórico recente
            </h2>
            <select
              aria-label="Filtrar histórico por turma"
              className="atividades-history-filter"
              onChange={(e) => setHistoricoTurma(e.target.value)}
              value={historicoTurma}
            >
              <option value="todas">Todas as turmas</option>
              {turmas.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.nome}
                </option>
              ))}
            </select>
          </div>

          {registrosSub.status === 'loading' ? (
            <p className="entity-modal-empty atividades-history-empty">Carregando registros...</p>
          ) : registrosSub.status === 'error' ? (
            <LoadError error={registrosSub.error} onRetry={registrosSub.retry} what="o histórico de atividades" />
          ) : registrosFiltrados.length === 0 ? (
            <p className="entity-modal-empty atividades-history-empty">
              {registros.length === 0
                ? 'Nenhuma atividade registrada ainda.'
                : 'Nenhuma atividade registrada para esta turma.'}
            </p>
          ) : (
            <div className="atividades-timeline">
              {registrosFiltrados.map((registro) => (
                <article className="atividade-item" key={registro.id}>
                  <small className="atividade-date">{formatDateLabel(registro.dataAtividade)}</small>
                  <div className="atividade-card">
                    <div className="atividade-card-header">
                      <strong>{turmaNome(registro.turmaId)}</strong>
                      <div className="students-table-actions">
                        <button
                          aria-label="Ver detalhes do registro"
                          onClick={() => openDetalhe(registro)}
                          title="Ver detalhes e fotos"
                          type="button"
                        >
                          <Eye size={15} />
                        </button>
                        {canDelete && (
                          <button
                            aria-label="Excluir registro"
                            className="danger"
                            onClick={() => setRegistroToDelete(registro)}
                            title="Excluir registro"
                            type="button"
                          >
                            <Trash2 size={15} />
                          </button>
                        )}
                      </div>
                    </div>
                    <div className="entity-tags">
                      {registro.idsTurmaOficinas.length === 0 ? (
                        <span className="entity-tag muted">Nenhuma oficina realizada</span>
                      ) : (
                        registro.idsTurmaOficinas.map((id) => {
                          const oficina = oficinaDoVinculo(id)
                          return (
                            <span className="entity-tag primary" key={id}>
                              {oficina
                                ? `${getCategoria(oficina.categoria).emoji} ${oficina.nome}`
                                : 'Oficina removida'}
                            </span>
                          )
                        })
                      )}
                    </div>
                    <p className="atividade-meta">
                      <UserRoundCheck size={13} />{' '}
                      {getUsuarioNome(usuarios, registro.usuarioResponsavelId)}
                      <span aria-hidden="true">·</span>
                      <Camera size={13} /> {registro.totalAnexos}{' '}
                      {registro.totalAnexos === 1 ? 'foto' : 'fotos'}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* Modal Detalhes do Registro */}
      {registroDetalhe && (
        <div className="modal-backdrop" onClick={() => setRegistroDetalhe(null)}>
          <div className="modal-container atividade-modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <div className="modal-title-group">
                <BookOpenCheck className="modal-icon" size={22} />
                <div>
                  <h3>{turmaNome(registroDetalhe.turmaId)}</h3>
                  <p>{formatDateLabel(registroDetalhe.dataAtividade)}</p>
                </div>
              </div>
              <button
                aria-label="Fechar"
                className="icon-button modal-close"
                onClick={() => setRegistroDetalhe(null)}
                type="button"
              >
                <X size={20} />
              </button>
            </header>

            <div className="modal-form">
              <dl className="report-summary">
                <div>
                  <dt>Oficinas</dt>
                  <dd>
                    {registroDetalhe.idsTurmaOficinas.length === 0
                      ? '—'
                      : registroDetalhe.idsTurmaOficinas
                          .map((id) => oficinaDoVinculo(id)?.nome || 'Oficina removida')
                          .join(', ')}
                  </dd>
                </div>
                <div>
                  <dt>Responsável</dt>
                  <dd>{getUsuarioNome(usuarios, registroDetalhe.usuarioResponsavelId)}</dd>
                </div>
              </dl>

              <div>
                <h4 className="atividade-modal-subtitle">Observações gerais</h4>
                <p className="atividade-modal-text">
                  {registroDetalhe.observacoesGerais || 'Sem observações.'}
                </p>
              </div>

              <div>
                <h4 className="atividade-modal-subtitle">Fotos ({registroDetalhe.totalAnexos})</h4>
                {loadingAnexos ? (
                  <p className="entity-modal-empty">Carregando fotos...</p>
                ) : anexosError ? (
                  <LoadError
                    error={anexosError}
                    onRetry={() => void openDetalhe(registroDetalhe)}
                    what="as fotos deste registro"
                  />
                ) : anexosDetalhe.length === 0 ? (
                  <p className="entity-modal-empty">Nenhuma foto anexada.</p>
                ) : (
                  <div className="foto-gallery">
                    {anexosDetalhe.map((anexo) =>
                      anexo.url ? (
                        <a href={anexo.url} key={anexo.id} rel="noreferrer" target="_blank">
                          <img alt={anexo.nomeArquivoOriginal} src={anexo.url} />
                        </a>
                      ) : (
                        <span className="foto-indisponivel" key={anexo.id}>
                          <ImageOff size={20} />
                          {anexo.nomeArquivoOriginal}
                        </span>
                      )
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirmação de Exclusão */}
      {registroToDelete && (
        <div className="modal-backdrop" onClick={() => setRegistroToDelete(null)}>
          <div className="modal-container confirm-modal" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <div className="modal-title-group">
                <AlertTriangle className="modal-icon danger" size={22} />
                <div>
                  <h3 className="danger-text">Excluir Registro</h3>
                  <p>Ação irreversível no banco de dados</p>
                </div>
              </div>
              <button
                aria-label="Fechar"
                className="icon-button modal-close"
                onClick={() => setRegistroToDelete(null)}
                type="button"
              >
                <X size={20} />
              </button>
            </header>
            <div className="confirm-modal-body">
              <p>
                Excluir o registro de <strong>{turmaNome(registroToDelete.turmaId)}</strong> em{' '}
                <strong>{formatDateLabel(registroToDelete.dataAtividade)}</strong>?
              </p>
              <p className="confirm-modal-hint">
                As fotos anexadas também serão removidas do armazenamento.
              </p>
            </div>
            <div className="confirm-modal-footer">
              <button
                className="button secondary"
                onClick={() => setRegistroToDelete(null)}
                type="button"
              >
                Cancelar
              </button>
              <button
                className="button danger"
                disabled={deleting}
                onClick={handleConfirmDelete}
                type="button"
              >
                <Trash2 size={16} />
                {deleting ? 'Excluindo...' : 'Sim, Excluir Registro'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
