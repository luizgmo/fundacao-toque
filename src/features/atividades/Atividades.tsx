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
import type { RegistroAtividade } from '../../types/atividades'
import type { Oficina, TurmaOficina } from '../../types/oficinas'
import { getCategoria, vinculoPrevistoEm, vinculosAtivosDaTurma } from '../../types/oficinas'
import type { Turma } from '../../types/turmas'
import { PERIODO_LABELS } from '../../types/turmas'
import type { UserProfile } from '../../types/auth'
import {
  anexarFotosRegistro,
  createRegistroAtividade,
  deleteRegistroAtividade,
  novoIdRegistroAtividade,
  recalcularTotalAnexos,
  subscribeToRegistrosAtividade,
} from '../../services/activitiesService'
import type { EstadoEnvio, ResultadoEnvioFotos } from '../../services/activitiesService'
import {
  LIMITES_ANEXO,
  MAX_ARQUIVOS_POR_ENVIO,
  descartarEnvio,
  liberarUrls,
  listarAnexosComConteudo,
  novoIdAnexo,
  validarArquivo,
} from '../../services/anexosService'
import type { AnexoComConteudo } from '../../services/anexosService'
import { EstadoConteudoBadge, EstadoEnvioBadge } from '../../components/EstadoArquivo'
import { subscribeToOficinas, subscribeToTurmaOficinas } from '../../services/oficinasService'
import { subscribeToTurmas } from '../../services/turmasService'
import { getUsuarioNome, subscribeToUsuarios } from '../../services/usuariosService'
import { useAuth } from '../auth/AuthContext'
import { describePersistenceError, failureMessage } from '../../lib/persistence'
import { useSubscription } from '../../lib/useSubscription'
import { LoadError, LoadErrors } from '../../components/LoadError'
import './Atividades.css'

// Foto selecionada com ID de anexo reservado (reenvio usa o mesmo ID) e estado
type FotoSelecionada = {
  id: string
  file: File
  previewUrl: string
  estado: EstadoEnvio
  motivo?: string
}

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
  // ID reservado para o próximo registro: reutilizado se a criação precisar ser repetida
  const [registroIdReservado, setRegistroIdReservado] = useState(() => novoIdRegistroAtividade())

  // Histórico
  const [historicoTurma, setHistoricoTurma] = useState('todas')
  const [registroDetalhe, setRegistroDetalhe] = useState<RegistroAtividade | null>(null)
  const [anexosDetalhe, setAnexosDetalhe] = useState<AnexoComConteudo[]>([])
  const [corrigindoContador, setCorrigindoContador] = useState(false)
  const [detalheAviso, setDetalheAviso] = useState<string | null>(null)
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
    event.target.value = ''
    const erros = files.map((f) => validarArquivo(f, 'atividade')).filter((e): e is string => Boolean(e))
    const validas = files.filter((f) => !validarArquivo(f, 'atividade'))
    const espaco = Math.max(0, MAX_ARQUIVOS_POR_ENVIO - fotos.filter((f) => f.estado !== 'enviado').length)
    const aceitas = validas.slice(0, espaco)
    if (validas.length > aceitas.length) {
      erros.push(`Selecione no máximo ${MAX_ARQUIVOS_POR_ENVIO} fotos por envio; ${validas.length - aceitas.length} ficaram de fora.`)
    }
    setFormError(erros.length > 0 ? erros.join(' ') : null)
    setFotos((current) => [
      ...current,
      ...aceitas.map((file) => ({
        id: novoIdAnexo(),
        file,
        previewUrl: URL.createObjectURL(file),
        estado: 'aguardando' as const,
      })),
    ])
  }

  const atualizarFoto = (id: string, estado: EstadoEnvio, motivo?: string) => {
    setFotos((current) => current.map((f) => (f.id === id ? { ...f, estado, motivo } : f)))
  }

  // Remove a foto da fila. Se ela já começou a ser enviada para um registro
  // salvo, descarta também o que ficou gravado pela metade.
  const removeFoto = async (foto: FotoSelecionada) => {
    setFotos((current) => current.filter((f) => f.id !== foto.id))
    URL.revokeObjectURL(foto.previewUrl)
    if (registroPendente && foto.estado === 'falhou') {
      try {
        await descartarEnvio(`registros_atividade/${registroPendente.id}`, foto.id)
      } catch (err) {
        setFeedback({
          tone: 'warning',
          message:
            `${foto.file.name} saiu da fila, mas o envio parcial não pôde ser descartado (${describePersistenceError(err)}). ` +
            'Ele aparece como “Envio não concluído” nos detalhes do registro e pode ser descartado lá.',
        })
      }
    }
  }

  const resetForm = () => {
    fotos.forEach((f) => URL.revokeObjectURL(f.previewUrl))
    setFotos([])
    setObservacoes('')
    setIdsTurmaOficinas(oficinasPrevistas(turmaId, dataAtividade))
    setRegistroPendente(null)
    setRegistroIdReservado(novoIdRegistroAtividade())
  }

  // Todas as fotos confirmadas: limpa o formulário. Caso contrário mantém a
  // lista com o estado de cada foto e libera o reenvio só das que falharam.
  const aplicarResultadoFotos = (resultado: ResultadoEnvioFotos, registro: { id: string; label: string }) => {
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
    setRegistroPendente(registro)
    const faltando = resultado.falhas.map((f) => `${f.nome} (${f.motivo})`).join('; ')
    setFeedback({
      tone: 'warning',
      message:
        `${registro.label}: o registro está salvo, mas ${resultado.falhas.length} foto(s) não foram enviadas: ${faltando}. ` +
        'Use “Reenviar” em cada foto ou “Reenviar fotos com falha”; as já enviadas não serão duplicadas.',
    })
  }

  const reenviar = async (pendentes: FotoSelecionada[]) => {
    if (!registroPendente || pendentes.length === 0) return
    setSaving(true)
    try {
      const resultado = await anexarFotosRegistro(
        registroPendente.id,
        pendentes.map(({ id, file }) => ({ id, file })),
        userProfile?.uid || 'sistema',
        atualizarFoto
      )
      const aindaComFalha = fotos.some((f) => f.estado === 'falhou' && !pendentes.some((p) => p.id === f.id))
      aplicarResultadoFotos(
        aindaComFalha && resultado.status === 'salvo' ? { ...resultado, status: 'parcial' } : resultado,
        registroPendente
      )
    } finally {
      setSaving(false)
    }
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
      await reenviar(fotos.filter((f) => f.estado !== 'enviado'))
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
    const label = `Atividade de ${formatDateLabel(dataAtividade)} (${turmaNome(turmaId)})`
    try {
      const resultado = await createRegistroAtividade(
        registroIdReservado,
        {
          dataAtividade,
          turmaId,
          idsTurmaOficinas,
          usuarioResponsavelId: responsavel,
          observacoesGerais: observacoes,
        },
        fotos.filter((f) => f.estado !== 'enviado').map(({ id, file }) => ({ id, file })),
        userProfile?.uid || 'sistema',
        atualizarFoto
      )
      aplicarResultadoFotos(resultado, { id: resultado.id, label })
    } catch (err) {
      // O registro principal não foi confirmado: nada foi salvo e o formulário fica intacto.
      console.error('Erro ao registrar atividade:', err)
      setFormError(failureMessage(err, 'registrar a atividade'))
    } finally {
      setSaving(false)
    }
  }

  // Carrega sempre a lista real de anexos (o contador pode estar divergente)
  const openDetalhe = async (registro: RegistroAtividade) => {
    liberarUrls(anexosDetalhe)
    setRegistroDetalhe(registro)
    setAnexosDetalhe([])
    setAnexosError(null)
    setDetalheAviso(null)
    setLoadingAnexos(true)
    try {
      setAnexosDetalhe(await listarAnexosComConteudo(`registros_atividade/${registro.id}`))
    } catch (err) {
      console.warn('Erro ao carregar fotos do registro:', err)
      setAnexosError(err)
    } finally {
      setLoadingAnexos(false)
    }
  }

  const closeDetalhe = () => {
    liberarUrls(anexosDetalhe)
    setAnexosDetalhe([])
    setRegistroDetalhe(null)
  }

  const corrigirContador = async () => {
    if (!registroDetalhe) return
    setCorrigindoContador(true)
    try {
      const { antes, depois } = await recalcularTotalAnexos(registroDetalhe.id, userProfile?.uid || 'sistema')
      setRegistroDetalhe({ ...registroDetalhe, totalAnexos: depois })
      setDetalheAviso(`Contador corrigido: de ${antes} para ${depois} foto(s).`)
    } catch (err) {
      setDetalheAviso(failureMessage(err, 'corrigir o total de fotos do registro'))
    } finally {
      setCorrigindoContador(false)
    }
  }

  const descartarDoDetalhe = async (anexo: AnexoComConteudo) => {
    if (!registroDetalhe) return
    try {
      await descartarEnvio(anexo.parentPath, anexo.id)
      await openDetalhe(registroDetalhe)
    } catch (err) {
      setDetalheAviso(failureMessage(err, `descartar o envio de ${anexo.nomeArquivoOriginal}`))
    }
  }

  const handleConfirmDelete = async () => {
    if (!registroToDelete) return
    setDeleting(true)
    try {
      const resultado = await deleteRegistroAtividade(registroToDelete.id, userProfile?.uid || 'sistema')
      if (resultado.status === 'excluido') {
        setFeedback({
          tone: 'success',
          message: `Registro de atividade excluído${resultado.removidos.length ? ` com ${resultado.removidos.length} foto(s)` : ''}.`,
        })
        setTimeout(() => setFeedback(null), 3500)
      } else {
        setFeedback({
          tone: 'warning',
          message:
            'Exclusão incompleta.' +
            (resultado.removidos.length ? ` Removidos: ${resultado.removidos.join(', ')}.` : ' Nenhum arquivo foi removido.') +
            ` Não removidos (continuam ligados ao registro): ${resultado.falhas.map((f) => `${f.nome} (${f.motivo})`).join('; ')}. ` +
            'O registro ficou marcado como “Exclusão incompleta”; use “Concluir exclusão” para tentar de novo.',
        })
      }
      setRegistroToDelete(null)
    } catch (err) {
      console.error('Erro ao excluir registro:', err)
      setFeedback({ tone: 'warning', message: failureMessage(err, 'excluir o registro de atividade') })
      setRegistroToDelete(null)
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
              <input
                accept={LIMITES_ANEXO.atividade.tipos.join(',')}
                multiple
                onChange={handleSelectFotos}
                type="file"
              />
              <span className="upload-icon">
                <Upload size={23} />
              </span>
              <strong>Clique para anexar fotos</strong>
              <span>
                {LIMITES_ANEXO.atividade.descricao} · até {MAX_ARQUIVOS_POR_ENVIO} por envio
              </span>
            </label>
            {fotos.length > 0 && (
              <div className="foto-preview-grid">
                {fotos.map((foto) => (
                  <figure className={`foto-preview ${foto.estado}`} key={foto.id}>
                    <img alt={foto.file.name} src={foto.previewUrl} />
                    {foto.estado !== 'enviado' && foto.estado !== 'enviando' && (
                      <button
                        aria-label={'Remover ' + foto.file.name}
                        disabled={saving}
                        onClick={() => void removeFoto(foto)}
                        type="button"
                      >
                        <X size={14} />
                      </button>
                    )}
                    <figcaption>
                      <EstadoEnvioBadge estado={foto.estado} motivo={foto.motivo} />
                      {foto.estado === 'falhou' && registroPendente && (
                        <button
                          className="text-button foto-reenviar"
                          disabled={saving}
                          onClick={() => void reenviar([foto])}
                          type="button"
                        >
                          Reenviar
                        </button>
                      )}
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </div>

          {registroPendente && (
            <p className="entity-modal-empty">
              {registroPendente.label} já está salva. Os campos acima ficam bloqueados; apenas as
              fotos que falharam serão reenviadas para este registro, sem duplicar as já enviadas.
            </p>
          )}
          <button className="button primary atividades-submit" disabled={saving} type="submit">
            <Save size={18} />{' '}
            {registroPendente
              ? saving
                ? 'Reenviando fotos...'
                : 'Reenviar fotos com falha'
              : saving
                ? 'Salvando registro...'
                : 'Salvar registro'}
          </button>
          {registroPendente && (
            <button
              className="button secondary"
              disabled={saving}
              onClick={async () => {
                const pendentes = fotos.filter((f) => f.estado === 'falhou')
                const id = registroPendente.id
                resetForm()
                setFeedback(null)
                // Descarta o que ficou gravado pela metade para não deixar órfãos
                const falhas = (
                  await Promise.allSettled(pendentes.map((f) => descartarEnvio(`registros_atividade/${id}`, f.id)))
                ).filter((r) => r.status === 'rejected').length
                if (falhas > 0) {
                  setFeedback({
                    tone: 'warning',
                    message: `${falhas} envio(s) parcial(is) não puderam ser descartados; aparecem como “Envio não concluído” nos detalhes do registro.`,
                  })
                }
              }}
              type="button"
            >
              Concluir sem as fotos com falha
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
                    {registro.exclusao && (
                      <div className="atividade-exclusao" role="alert">
                        <AlertTriangle size={13} />
                        <span>
                          Exclusão incompleta
                          {registro.exclusao.arquivosPendentes.length > 0
                            ? `: ${registro.exclusao.arquivosPendentes.join(', ')} não foram removidos`
                            : ''}
                          .
                        </span>
                        {canDelete && (
                          <button className="text-button" onClick={() => setRegistroToDelete(registro)} type="button">
                            Concluir exclusão
                          </button>
                        )}
                      </div>
                    )}
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
        <div className="modal-backdrop" onClick={closeDetalhe}>
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
                onClick={closeDetalhe}
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
                <h4 className="atividade-modal-subtitle">
                  Fotos (
                  {loadingAnexos || anexosError
                    ? registroDetalhe.totalAnexos
                    : anexosDetalhe.filter((a) => a.status === 'disponivel').length}
                  )
                </h4>
                {detalheAviso && <p className="entity-modal-empty">{detalheAviso}</p>}
                {loadingAnexos ? (
                  <p className="entity-modal-empty">Carregando fotos...</p>
                ) : anexosError ? (
                  <LoadError
                    error={anexosError}
                    onRetry={() => void openDetalhe(registroDetalhe)}
                    what="as fotos deste registro"
                  />
                ) : (
                  <>
                    {anexosDetalhe.filter((a) => a.status === 'disponivel').length !== registroDetalhe.totalAnexos && (
                      <div className="atividade-exclusao" role="alert">
                        <AlertTriangle size={13} />
                        <span>
                          O contador do registro indica {registroDetalhe.totalAnexos} foto(s), mas há{' '}
                          {anexosDetalhe.filter((a) => a.status === 'disponivel').length} gravada(s) por completo.
                        </span>
                        <button
                          className="text-button"
                          disabled={corrigindoContador}
                          onClick={() => void corrigirContador()}
                          type="button"
                        >
                          {corrigindoContador ? 'Corrigindo…' : 'Corrigir contador'}
                        </button>
                      </div>
                    )}
                    {anexosDetalhe.length === 0 ? (
                      <p className="entity-modal-empty">Nenhuma foto anexada.</p>
                    ) : (
                      <div className="foto-gallery">
                        {anexosDetalhe.map((anexo) =>
                          anexo.conteudo.estado === 'disponivel' ? (
                            <a href={anexo.conteudo.url} key={anexo.id} rel="noreferrer" target="_blank">
                              <img alt={anexo.nomeArquivoOriginal} src={anexo.conteudo.url} />
                            </a>
                          ) : (
                            <span className="foto-indisponivel" key={anexo.id}>
                              <ImageOff size={20} />
                              {anexo.nomeArquivoOriginal}
                              <EstadoConteudoBadge conteudo={anexo.conteudo} />
                              {anexo.conteudo.estado === 'erro_leitura' && (
                                <button className="text-button" onClick={() => void openDetalhe(registroDetalhe)} type="button">
                                  Tentar novamente
                                </button>
                              )}
                              {anexo.conteudo.estado === 'envio_incompleto' &&
                                (canDelete || anexo.enviadoPor === userProfile?.uid) && (
                                  <button className="text-button" onClick={() => void descartarDoDetalhe(anexo)} type="button">
                                    Descartar envio
                                  </button>
                                )}
                            </span>
                          )
                        )}
                      </div>
                    )}
                  </>
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
