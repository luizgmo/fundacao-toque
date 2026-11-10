import { useMemo, useState } from 'react'
import type { FormEvent } from 'react'
import { AlertCircle, AlertTriangle, CalendarClock, Link2, Plus, Trash2, X } from 'lucide-react'
import type { HorarioOficina, Oficina, TurmaOficina } from '../../types/oficinas'
import {
  DIAS_SEMANA,
  MAX_HORARIOS_POR_VINCULO,
  validarHorarios,
  validarResponsaveisVinculo,
  vinculoDoPar,
} from '../../types/oficinas'
import type { Turma } from '../../types/turmas'
import type { UserProfile } from '../../types/auth'
import { inativarVinculo, salvarVinculo } from '../../services/oficinasService'
import { failureMessage } from '../../lib/persistence'
import type { LoadStatus } from '../../lib/useSubscription'
import './Oficinas.css'

// Contexto de abertura: a partir de uma turma (escolhe a oficina), de uma
// oficina (escolhe a turma) ou de um vínculo existente (edição).
export type VinculoModalAlvo =
  | { tipo: 'novo-na-turma'; turmaId: string }
  | { tipo: 'novo-na-oficina'; oficinaId: string }
  | { tipo: 'editar'; vinculo: TurmaOficina }

type HorarioForm = {
  key: number
  diaSemana: number
  horaInicio: string
  horaFim: string
  validoDe: string
  validoAte: string
}

let nextKey = 1
const novoHorario = (base?: Partial<HorarioOficina>): HorarioForm => ({
  key: nextKey++,
  diaSemana: base?.diaSemana ?? 0,
  horaInicio: base?.horaInicio ?? '',
  horaFim: base?.horaFim ?? '',
  validoDe: base?.validoDe ?? '',
  validoAte: base?.validoAte ?? '',
})

type Props = {
  alvo: VinculoModalAlvo
  turmas: Turma[]
  oficinas: Oficina[]
  vinculos: TurmaOficina[]
  usuarios: UserProfile[]
  // Status combinado das fontes necessárias (turmas, oficinas, vínculos, equipe):
  // sem os vínculos atuais carregados não dá para saber se o par já existe.
  dadosStatus: LoadStatus
  participantesAtivos?: (vinculoId: string) => number
  userId: string
  onClose: () => void
  onSaved: (mensagem: string) => void
}

function formatDataBR(data?: string) {
  if (!data) return ''
  const [y, m, d] = data.split('-')
  return `${d}/${m}/${y}`
}

export function VinculoModal({
  alvo,
  turmas,
  oficinas,
  vinculos,
  usuarios,
  dadosStatus,
  participantesAtivos,
  userId,
  onClose,
  onSaved,
}: Props) {
  const inicial = alvo.tipo === 'editar' ? alvo.vinculo : null
  const [turmaId, setTurmaId] = useState(
    alvo.tipo === 'editar' ? alvo.vinculo.turmaId : alvo.tipo === 'novo-na-turma' ? alvo.turmaId : ''
  )
  const [oficinaId, setOficinaId] = useState(
    alvo.tipo === 'editar' ? alvo.vinculo.oficinaId : alvo.tipo === 'novo-na-oficina' ? alvo.oficinaId : ''
  )
  const [responsaveis, setResponsaveis] = useState<string[]>(inicial?.idsUsuariosResponsaveis || [])
  const [horarios, setHorarios] = useState<HorarioForm[]>(
    inicial && inicial.horarios.length > 0 ? inicial.horarios.map((h) => novoHorario(h)) : [novoHorario()]
  )
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmandoInativacao, setConfirmandoInativacao] = useState(false)

  const turma = turmas.find((t) => t.id === turmaId)
  const oficina = oficinas.find((o) => o.id === oficinaId)
  // Vínculo já gravado para o par escolhido (ativo ou inativo)
  const existente = turmaId && oficinaId ? vinculoDoPar(vinculos, turmaId, oficinaId) : undefined
  const duplicaAtivo = alvo.tipo !== 'editar' && existente?.ativo === true
  const reativando = existente?.ativo === false

  const ativosPorPar = useMemo(
    () => new Set(vinculos.filter((v) => v.ativo).map((v) => `${v.turmaId}|${v.oficinaId}`)),
    [vinculos]
  )

  // Ao escolher o par, parte do vínculo inativo (se houver) ou dos responsáveis padrão da oficina
  const prefill = (novaTurmaId: string, novaOficinaId: string) => {
    if (!novaTurmaId || !novaOficinaId) return
    const anterior = vinculoDoPar(vinculos, novaTurmaId, novaOficinaId)
    if (anterior && !anterior.ativo) {
      setResponsaveis(anterior.idsUsuariosResponsaveis)
      setHorarios(anterior.horarios.length > 0 ? anterior.horarios.map((h) => novoHorario(h)) : [novoHorario()])
      return
    }
    if (responsaveis.length === 0) {
      setResponsaveis(oficinas.find((o) => o.id === novaOficinaId)?.idsUsuariosResponsaveis || [])
    }
  }

  const updateHorario = (key: number, patch: Partial<HorarioForm>) => {
    setHorarios((current) => current.map((h) => (h.key === key ? { ...h, ...patch } : h)))
  }

  const toggleResponsavel = (uid: string) => {
    setResponsaveis((current) => (current.includes(uid) ? current.filter((id) => id !== uid) : [...current, uid]))
  }

  const toHorarios = (): HorarioOficina[] =>
    horarios.map((h) => ({
      diaSemana: h.diaSemana,
      horaInicio: h.horaInicio,
      horaFim: h.horaFim,
      validoDe: h.validoDe || undefined,
      validoAte: h.validoAte || undefined,
    }))

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setError(null)
    if (dadosStatus !== 'ready') {
      setError('Os vínculos, turmas e oficinas atuais ainda não foram carregados (ou falharam). Recarregue-os antes de salvar.')
      return
    }
    if (!turmaId || !oficinaId) {
      setError('Selecione a turma e a oficina.')
      return
    }
    if (duplicaAtivo) {
      setError('Esta oficina já tem um vínculo ativo nesta turma. Edite o vínculo existente.')
      return
    }
    const validacao = validarResponsaveisVinculo(responsaveis) || validarHorarios(toHorarios())
    if (validacao) {
      setError(validacao)
      return
    }

    setSaving(true)
    try {
      const { acao } = await salvarVinculo(
        { turmaId, oficinaId, idsUsuariosResponsaveis: responsaveis, horarios: toHorarios() },
        vinculos,
        userId
      )
      const verbo = acao === 'criado' ? 'criado' : acao === 'reativado' ? 'reativado' : 'atualizado'
      onSaved(`Vínculo ${oficina?.nome} — ${turma?.nome} ${verbo} e confirmado no banco de dados.`)
      onClose()
    } catch (err) {
      console.error('Erro ao salvar vínculo:', err)
      setError(failureMessage(err, 'salvar o vínculo'))
    } finally {
      setSaving(false)
    }
  }

  const handleInativar = async () => {
    if (!inicial) return
    setSaving(true)
    setError(null)
    try {
      await inativarVinculo(inicial.id, userId)
      onSaved(`Vínculo ${oficina?.nome} — ${turma?.nome} inativado. O histórico de chamadas e atividades foi preservado.`)
      onClose()
    } catch (err) {
      console.error('Erro ao inativar vínculo:', err)
      setError(failureMessage(err, 'inativar o vínculo'))
      setConfirmandoInativacao(false)
    } finally {
      setSaving(false)
    }
  }

  // Turmas/oficinas oferecidas: ativas, marcando as que já têm vínculo ativo
  const turmasOpcoes = turmas.filter((t) => t.ativo || t.id === turmaId)
  const oficinasOpcoes = oficinas.filter((o) => o.ativo || o.id === oficinaId)
  const qtdParticipantes = inicial && participantesAtivos ? participantesAtivos(inicial.id) : 0

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-container oficina-modal vinculo-modal" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <div className="modal-title-group">
            <Link2 className="modal-icon" size={22} />
            <div>
              <h3>{alvo.tipo === 'editar' ? 'Editar vínculo turma-oficina' : 'Novo vínculo turma-oficina'}</h3>
              <p>Responsáveis e horários semanais desta oficina nesta turma.</p>
            </div>
          </div>
          <button aria-label="Fechar" className="icon-button modal-close" onClick={onClose} type="button">
            <X size={20} />
          </button>
        </header>

        <form className="modal-form" onSubmit={handleSubmit}>
          {error && (
            <div className="modal-error-banner" role="alert">
              <AlertCircle size={18} /> {error}
            </div>
          )}

          <div className="modal-grid">
            <label className="field">
              <span>Turma *</span>
              <select
                disabled={alvo.tipo !== 'novo-na-oficina'}
                onChange={(e) => {
                  setTurmaId(e.target.value)
                  prefill(e.target.value, oficinaId)
                }}
                required
                value={turmaId}
              >
                <option value="">Selecione</option>
                {turmasOpcoes.map((t) => {
                  const jaVinculada = alvo.tipo === 'novo-na-oficina' && ativosPorPar.has(`${t.id}|${oficinaId}`)
                  return (
                    <option disabled={jaVinculada} key={t.id} value={t.id}>
                      {t.nome}
                      {jaVinculada ? ' (já vinculada)' : ''}
                    </option>
                  )
                })}
              </select>
            </label>
            <label className="field">
              <span>Oficina *</span>
              <select
                disabled={alvo.tipo !== 'novo-na-turma'}
                onChange={(e) => {
                  setOficinaId(e.target.value)
                  prefill(turmaId, e.target.value)
                }}
                required
                value={oficinaId}
              >
                <option value="">Selecione</option>
                {oficinasOpcoes.map((o) => {
                  const jaVinculada = alvo.tipo === 'novo-na-turma' && ativosPorPar.has(`${turmaId}|${o.id}`)
                  return (
                    <option disabled={jaVinculada} key={o.id} value={o.id}>
                      {o.nome}
                      {jaVinculada ? ' (já vinculada)' : ''}
                    </option>
                  )
                })}
              </select>
            </label>

            {duplicaAtivo && (
              <div className="vinculo-aviso field-wide" role="alert">
                <AlertTriangle size={16} /> Já existe um vínculo ativo desta oficina nesta turma. Feche e use
                “Editar” no vínculo existente.
              </div>
            )}
            {reativando && existente && (
              <div className="vinculo-aviso field-wide">
                <AlertTriangle size={16} /> Este vínculo foi inativado
                {existente.inativadoEm ? ` em ${formatDataBR(existente.inativadoEm)}` : ''}. Salvar vai reativá-lo
                com os dados abaixo; os registros antigos continuam ligados a ele.
              </div>
            )}

            <div className="field field-wide">
              <span>Responsáveis neste vínculo *</span>
              <small>Quem conduz esta oficina nesta turma. Pré-preenchido com os responsáveis padrão da oficina.</small>
              {usuarios.length === 0 ? (
                <small>Nenhum profissional cadastrado em Equipe / Autores.</small>
              ) : (
                <div className="chip-checkbox-grid compact">
                  {usuarios
                    .filter((u) => u.ativo !== false || responsaveis.includes(u.uid))
                    .map((u) => (
                      <label className={'chip-checkbox' + (responsaveis.includes(u.uid) ? ' checked' : '')} key={u.uid}>
                        <input
                          checked={responsaveis.includes(u.uid)}
                          onChange={() => toggleResponsavel(u.uid)}
                          type="checkbox"
                        />
                        <span>{u.nome_completo}</span>
                      </label>
                    ))}
                </div>
              )}
            </div>

            <div className="field field-wide">
              <span>Horários semanais *</span>
              <small>
                Um item por dia da semana. A vigência é opcional: use “até” para encerrar um horário antigo e
                cadastre o novo “a partir de”, sem perder o histórico.
              </small>
              <div className="vinculo-horarios">
                {horarios.map((h, index) => (
                  <div className="vinculo-horario-row" key={h.key}>
                    <label className="field">
                      <span>Dia</span>
                      <select
                        aria-label={`Dia do horário ${index + 1}`}
                        onChange={(e) => updateHorario(h.key, { diaSemana: Number(e.target.value) })}
                        value={h.diaSemana}
                      >
                        <option value={0}>Selecione</option>
                        {DIAS_SEMANA.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="field">
                      <span>Início</span>
                      <input
                        onChange={(e) => updateHorario(h.key, { horaInicio: e.target.value })}
                        type="time"
                        value={h.horaInicio}
                      />
                    </label>
                    <label className="field">
                      <span>Fim</span>
                      <input
                        onChange={(e) => updateHorario(h.key, { horaFim: e.target.value })}
                        type="time"
                        value={h.horaFim}
                      />
                    </label>
                    <label className="field">
                      <span>Válido de</span>
                      <input
                        onChange={(e) => updateHorario(h.key, { validoDe: e.target.value })}
                        type="date"
                        value={h.validoDe}
                      />
                    </label>
                    <label className="field">
                      <span>Válido até</span>
                      <input
                        onChange={(e) => updateHorario(h.key, { validoAte: e.target.value })}
                        type="date"
                        value={h.validoAte}
                      />
                    </label>
                    <button
                      aria-label={`Remover horário ${index + 1}`}
                      className="icon-button danger vinculo-horario-remove"
                      disabled={horarios.length === 1}
                      onClick={() => setHorarios((current) => current.filter((x) => x.key !== h.key))}
                      title="Remover horário"
                      type="button"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
              <button
                className="button secondary vinculo-add-horario"
                disabled={horarios.length >= MAX_HORARIOS_POR_VINCULO}
                onClick={() => {
                  const ultimo = horarios[horarios.length - 1]
                  // Repete o horário do último item para agilizar vários dias no mesmo horário
                  setHorarios((current) => [
                    ...current,
                    novoHorario({ horaInicio: ultimo?.horaInicio, horaFim: ultimo?.horaFim }),
                  ])
                }}
                type="button"
              >
                <Plus size={16} /> Adicionar horário
              </button>
            </div>
          </div>

          {confirmandoInativacao && inicial && (
            <div className="vinculo-aviso danger" role="alert">
              <AlertTriangle size={16} />
              <div>
                <strong>Inativar o vínculo {oficina?.nome} — {turma?.nome}?</strong>
                <p>
                  Ele deixa de aparecer na chamada e no registro de atividades. Chamadas, atividades e participantes já
                  registrados continuam no histórico.
                  {qtdParticipantes > 0 &&
                    ` ${qtdParticipantes} aluno(s) participante(s) permanecem registrados no vínculo inativo.`}
                </p>
                <div className="vinculo-aviso-actions">
                  <button className="button secondary" disabled={saving} onClick={() => setConfirmandoInativacao(false)} type="button">
                    Voltar
                  </button>
                  <button className="button danger" disabled={saving} onClick={handleInativar} type="button">
                    {saving ? 'Inativando...' : 'Confirmar inativação'}
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="modal-form-actions">
            {inicial?.ativo && !confirmandoInativacao && (
              <button
                className="button secondary danger-text vinculo-inativar"
                disabled={saving}
                onClick={() => setConfirmandoInativacao(true)}
                type="button"
              >
                <CalendarClock size={16} /> Inativar vínculo
              </button>
            )}
            <button className="button secondary" onClick={onClose} type="button">
              Cancelar
            </button>
            <button className="button primary" disabled={saving || duplicaAtivo || dadosStatus !== 'ready'} type="submit">
              {saving
                ? 'Salvando...'
                : dadosStatus === 'loading'
                  ? 'Carregando dados…'
                  : reativando
                    ? 'Reativar vínculo'
                    : alvo.tipo === 'editar'
                      ? 'Salvar vínculo'
                      : 'Criar vínculo'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
