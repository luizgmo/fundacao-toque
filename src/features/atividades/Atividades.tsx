import { useEffect, useMemo, useState } from 'react'
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
import { getCategoria, isoWeekday } from '../../types/oficinas'
import type { Turma } from '../../types/turmas'
import { PERIODO_LABELS } from '../../types/turmas'
import type { UserProfile } from '../../types/auth'
import {
  MAX_FOTO_BYTES,
  createRegistroAtividade,
  deleteRegistroAtividade,
  getAnexosComUrl,
  subscribeToRegistrosAtividade,
} from '../../services/activitiesService'
import { subscribeToOficinas, subscribeToTurmaOficinas } from '../../services/oficinasService'
import { subscribeToTurmas } from '../../services/turmasService'
import { getUsuarioNome, subscribeToUsuarios } from '../../services/usuariosService'
import { useAuth } from '../auth/AuthContext'
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

  const [turmas, setTurmas] = useState<Turma[]>([])
  const [oficinas, setOficinas] = useState<Oficina[]>([])
  const [vinculos, setVinculos] = useState<TurmaOficina[]>([])
  const [usuarios, setUsuarios] = useState<UserProfile[]>([])
  const [registros, setRegistros] = useState<RegistroAtividade[]>([])
  const [loadingRegistros, setLoadingRegistros] = useState(true)

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

  // Histórico
  const [historicoTurma, setHistoricoTurma] = useState('todas')
  const [registroDetalhe, setRegistroDetalhe] = useState<RegistroAtividade | null>(null)
  const [anexosDetalhe, setAnexosDetalhe] = useState<(Anexo & { url: string | null })[]>([])
  const [loadingAnexos, setLoadingAnexos] = useState(false)
  const [registroToDelete, setRegistroToDelete] = useState<RegistroAtividade | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    const unsubs = [
      subscribeToTurmas(setTurmas),
      subscribeToOficinas(setOficinas),
      subscribeToTurmaOficinas(setVinculos),
      subscribeToUsuarios(setUsuarios),
      subscribeToRegistrosAtividade((data) => {
        setRegistros(data)
        setLoadingRegistros(false)
      }),
    ]
    return () => unsubs.forEach((unsub) => unsub())
  }, [])

  const turmasAtivas = turmas.filter((t) => t.ativo)

  const oficinasDaTurma = useMemo(
    () =>
      vinculos
        .filter((v) => v.turmaId === turmaId && v.ativo)
        .map((v) => ({ vinculo: v, oficina: oficinas.find((o) => o.id === v.oficinaId) }))
        .filter((item): item is { vinculo: TurmaOficina; oficina: Oficina } => Boolean(item.oficina))
        .sort((a, b) => a.oficina.nome.localeCompare(b.oficina.nome, 'pt-BR')),
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

  // Pré-marca as oficinas previstas para o dia da semana da data escolhida
  const oficinasPrevistas = (novaTurmaId: string, novaData: string) => {
    if (!novaTurmaId || !novaData) return []
    const dia = isoWeekday(novaData)
    return vinculos
      .filter(
        (v) => v.turmaId === novaTurmaId && v.ativo && v.horarios.some((h) => h.diaSemana === dia)
      )
      .map((v) => v.id)
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

    setSaving(true)
    try {
      const { fotosComErro } = await createRegistroAtividade(
        {
          dataAtividade,
          turmaId,
          idsTurmaOficinas,
          usuarioResponsavelId: responsavel,
          observacoesGerais: observacoes,
        },
        fotos.map((f) => f.file),
        userProfile?.uid || 'sistema'
      )

      if (fotosComErro.length > 0) {
        setFeedback({
          tone: 'warning',
          message:
            `Atividade registrada, mas ${fotosComErro.length} foto(s) não foram enviadas: ` +
            `${fotosComErro.join(', ')}. Verifique a conexão e as regras do Firestore.`,
        })
      } else {
        setFeedback({ tone: 'success', message: 'Atividade registrada com sucesso!' })
        setTimeout(() => setFeedback(null), 3500)
      }
      resetForm()
    } catch (err) {
      console.error('Erro ao registrar atividade:', err)
      setFormError('Erro ao gravar atividade no Firestore: ' + ((err as Error).message || 'Tente novamente.'))
    } finally {
      setSaving(false)
    }
  }

  const openDetalhe = async (registro: RegistroAtividade) => {
    setRegistroDetalhe(registro)
    setAnexosDetalhe([])
    if (registro.totalAnexos === 0) return
    setLoadingAnexos(true)
    try {
      setAnexosDetalhe(await getAnexosComUrl(`registros_atividade/${registro.id}`))
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
      alert('Erro ao excluir registro: ' + ((err as Error).message || 'Erro desconhecido.'))
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

          <button className="button primary atividades-submit" disabled={saving} type="submit">
            <Save size={18} /> {saving ? 'Salvando registro...' : 'Salvar registro'}
          </button>
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

          {loadingRegistros ? (
            <p className="entity-modal-empty atividades-history-empty">Carregando registros...</p>
          ) : registrosFiltrados.length === 0 ? (
            <p className="entity-modal-empty atividades-history-empty">
              Nenhuma atividade registrada ainda.
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
