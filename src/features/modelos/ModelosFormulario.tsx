import { useCallback, useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import {
  AlertCircle,
  FileText,
  Pencil,
  Copy,
  Archive,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react'
import {
  salvarModelo,
  listarModelos,
  obterModelo,
  novoIdModelo,
  validarModelo,
} from '../../services/modelosService'
import type { ModeloFormularioInput, CampoFormulario, TipoCampo } from '../../types/modelosFormulario'
import { TIPOS_CAMPO } from '../../types/modelosFormulario'
import { useAuth } from '../auth/AuthContext'
import { describePersistenceError, failureMessage } from '../../lib/persistence'
import './ModelosFormulario.css'

const emptyInput: ModeloFormularioInput = {
  nome: '',
  tipo_modelo: 'avaliacao_pedagogica',
  versao: 1,
  campos: [],
  ativo: true,
  criado_por: '',
}

export function ModelosFormulario() {
  const { userProfile } = useAuth()
  const userId = userProfile?.uid || ''
  const papel = userProfile?.papel

  const [modelos, setModelos] = useState<ModeloFormularioInput[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState<ModeloFormularioInput>({ ...emptyInput })
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const data = await listarModelos()
      setModelos(data.map((m) => ({ ...m, id: m.id })))
    } catch (cause) {
      setError(describePersistenceError(cause))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    listarModelos()
      .then((data) => {
        if (!cancelled) setModelos(data.map((m) => ({ ...m, id: m.id })))
      })
      .catch((cause) => {
        if (!cancelled) setError(describePersistenceError(cause))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const resetForm = () => {
    setShowForm(false)
    setForm({ ...emptyInput })
    setFormError(null)
    setEditingId(null)
  }

  const novoModelo = () => {
    resetForm()
    setMessage(null)
    setError(null)
    setForm({ ...emptyInput, id: novoIdModelo(), campos: [] })
    setShowForm(true)
  }

  useEffect(() => {
    if (!showForm) return
    const previousFocus = document.activeElement as HTMLElement | null
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !saving) setShowForm(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
      previousFocus?.focus()
    }
  }, [showForm, saving])

  const addCampo = () => {
    setForm((current) => ({
      ...current,
      campos: [...current.campos, { ...emptyCampo }],
    }))
  }

  const removeCampo = (index: number) => {
    setForm((current) => {
      const next = [...current.campos]
      next.splice(index, 1)
      return { ...current, campos: next }
    })
  }

  const updateCampo = (index: number, field: keyof CampoFormulario, value: unknown) => {
    setForm((current) => {
      const next = [...current.campos]
      next[index] = { ...next[index], [field]: value }
      return { ...current, campos: next }
    })
  }

  const toggleCampoOpcao = (campoIndex: number, opcaoIndex: number) => {
    setForm((current) => {
      const campo = { ...current.campos[campoIndex] }
      const next = [...campo.opcoes]
      next.splice(opcaoIndex, 1)
      campo.opcoes = next
      const campos = [...current.campos]
      campos[campoIndex] = campo
      return { ...current, campos }
    })
  }

  const addCampoOpcao = (campoIndex: number) => {
    setForm((current) => {
      const campo = { ...current.campos[campoIndex] }
      campo.opcoes = [...campo.opcoes, '']
      const campos = [...current.campos]
      campos[campoIndex] = campo
      return { ...current, campos }
    })
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setFormError(null)
    setError(null)

    const validation = validarModelo(form)
    if (validation) {
      setFormError(validation)
      return
    }

    setSaving(true)
    try {
      const id = await salvarModelo(form, userId)
      setModelos((current) => {
        const existente = current.findIndex((m) => m.id === id || m.id === form.id)
        const entrada = { ...form, id }
        if (existente >= 0) {
          const next = [...current]
          next[existente] = entrada
          return next
        }
        return [entrada, ...current]
      })
      setMessage(`Modelo "${form.nome.trim()}" salvo com sucesso.`)
      resetForm()
    } catch (cause) {
      setFormError(failureMessage(cause, 'salvar o modelo de formulário'))
    } finally {
      setSaving(false)
    }
  }

  const editarModelo = (modelo: ModeloFormularioInput) => {
    setEditingId(modelo.id || null)
    setForm({ ...modelo, campos: modelo.campos.map((campo) => ({ ...campo, opcoes: [...campo.opcoes] })) })
    setFormError(null)
    setShowForm(true)
  }

  const excluirModelo = async (id: string) => {
    if (!window.confirm('Tem certeza que deseja excluir este modelo?')) return
    // A exclusão física só faz sentido para modelos não usados por relatórios.
    // Como o Firestore não impõe integridade referencial, inativamos em vez de excluir.
    setError(null)
    try {
      const modelo = await obterModelo(id)
      if (!modelo) throw new Error('Modelo não encontrado.')
      await salvarModelo({ ...modelo, id, ativo: false }, userId)
      setModelos((current) =>
        current.map((m) => (m.id === id ? { ...m, ativo: false } : m))
      )
      setMessage('Modelo inativado com sucesso.')
    } catch (cause) {
      setError(failureMessage(cause, 'inativar o modelo'))
    }
  }

  const reativarModelo = async (id: string) => {
    setError(null)
    try {
      const modelo = await obterModelo(id)
      if (!modelo) throw new Error('Modelo não encontrado.')
      await salvarModelo({ ...modelo, id, ativo: true }, userId)
      setModelos((current) =>
        current.map((m) => (m.id === id ? { ...m, ativo: true } : m))
      )
      setMessage('Modelo reativado com sucesso.')
    } catch (cause) {
      setError(failureMessage(cause, 'reativar o modelo'))
    }
  }

  const novaVersao = async (id: string) => {
    setError(null)
    try {
      const modelo = await obterModelo(id)
      if (!modelo) throw new Error('Modelo não encontrado.')
      const novoId = await salvarModelo(
        { ...modelo, id: undefined, versao: modelo.versao + 1, ativo: true },
        userId
      )
      await load()
      setMessage(`Nova versão criada (ID ${novoId}).`)
    } catch (cause) {
      setError(failureMessage(cause, 'criar nova versão do modelo'))
    }
  }

  const modelosAtivos = modelos.filter((modelo) => modelo.ativo).length
  const isGestor = papel === 'direcao' || papel === 'pedagogia'

  return (
    <div className="page-container modelos-page">
      <div className="report-page-heading">
        <div>
          <span className="eyebrow">Administração &amp; Governança</span>
          <h2>Modelos de Formulário</h2>
          <p>Defina os campos usados pela equipe nas avaliações pedagógicas dos alunos.</p>
        </div>
        <div className="report-heading-actions">
          {isGestor && (
            <button className="button primary" onClick={novoModelo} type="button">
              <Plus size={18} /> Novo modelo
            </button>
          )}
        </div>
      </div>

      {!isGestor && (
        <div className="privacy-note" role="status">
          <AlertCircle size={18} />
          <p>Somente Direção e Pedagogia podem gerenciar modelos de formulário.</p>
        </div>
      )}

      {error && <div className="modal-error-banner">{error}</div>}
      {message && <p className="save-feedback">{message}</p>}

      <div className="modelos-section-heading">
        <div><h3>Modelos cadastrados</h3><p>Selecione um modelo ativo em Relatórios → Pedagógico para preencher a avaliação.</p></div>
        {!loading && <span className="entity-tag primary">{modelosAtivos} {modelosAtivos === 1 ? 'ativo' : 'ativos'} · {modelos.length} no total</span>}
      </div>

      {loading ? (
        <p className="entity-modal-empty">Carregando modelos…</p>
      ) : modelos.length === 0 ? (
        <div className="entity-empty form-card"><FileText size={32} /><strong>Nenhum modelo cadastrado</strong><span>Crie o primeiro modelo para padronizar as avaliações da equipe.</span>{isGestor && <button className="button primary" onClick={novoModelo} type="button"><Plus size={16} /> Novo modelo</button>}</div>
      ) : (
        <div className="entity-grid modelos-list">
          {modelos.map((m) => {
            const ativo = m.ativo !== false
            return (
              <article
                className={`entity-card modelo-card ${ativo ? '' : 'inactive'}`}
                key={m.id || m.nome}
              >
                <div className="entity-card-top">
                  <span className="entity-icon" aria-hidden="true"><FileText size={22} /></span>
                  <div className="entity-card-title">
                    <span className="entity-code">Avaliação pedagógica · versão {m.versao}</span>
                    <h3>{m.nome}</h3>
                  </div>
                  <span className={`modelo-status ${ativo ? 'ativo' : 'inativo'}`}>
                    {ativo ? 'Ativo' : 'Inativo'}
                  </span>
                </div>
                <div className="modelo-card-body">
                  <div className="modelo-fields-heading"><strong>{m.campos.length} {m.campos.length === 1 ? 'campo' : 'campos'} no formulário</strong><span>* Obrigatório</span></div>
                  <ul className="modelo-campos">
                    {m.campos.map((c) => (
                      <li key={c.chave || c.rotulo}>
                        <strong>{c.rotulo}{c.obrigatorio && <span className="modelo-required"> *</span>}</strong>
                        <span>{TIPOS_CAMPO[c.tipo]}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="entity-actions modelo-card-actions">
                  {isGestor && (
                    <>
                      <button
                        className="button secondary"
                        onClick={() => editarModelo(m)}
                        type="button"
                      >
                        <Pencil size={15} /> Editar
                      </button>
                      {ativo ? (
                        <>
                          <button
                            className="button secondary"
                            onClick={() => novaVersao(m.id as string)}
                            type="button"
                          >
                            <Copy size={15} /> Nova versão
                          </button>
                          <button
                            className="button danger"
                            onClick={() => excluirModelo(m.id as string)}
                            type="button"
                          >
                            <Archive size={15} /> Inativar
                          </button>
                        </>
                      ) : (
                        <button
                          className="button secondary"
                          onClick={() => reativarModelo(m.id as string)}
                          type="button"
                        >
                          Reativar
                        </button>
                      )}
                    </>
                  )}
                </div>
              </article>
            )
          })}
        </div>
      )}

      {showForm && (
        <div className="modal-backdrop" onClick={() => { if (!saving) resetForm() }}>
          <div aria-labelledby="modelo-modal-title" aria-modal="true" className="modal-container modelo-modal" role="dialog" onClick={(e) => e.stopPropagation()}>
            <header className="modal-header">
              <div className="modal-title-group">
                <Save className="modal-icon" size={22} />
                <div>
                  <h3 id="modelo-modal-title">{editingId ? 'Editar modelo' : 'Novo modelo de formulário'}</h3>
                  <p>Configure os campos que comporão o formulário pedagógico.</p>
                </div>
              </div>
              <button
                aria-label="Fechar"
                className="icon-button modal-close"
                onClick={resetForm}
                disabled={saving}
                type="button"
              >
                <X size={20} />
              </button>
            </header>

            {!isGestor && (
              <div className="modal-error-banner">
                <AlertCircle size={18} />
                <p>Sem permissão para salvar modelos.</p>
              </div>
            )}

            {formError && (
              <div className="modal-error-banner">{formError}</div>
            )}

            <form className="modal-form" onSubmit={handleSubmit}>
              <fieldset disabled={saving} className="modelo-editor-fieldset">
              <div className="modal-grid">
                <label className="field field-wide">
                  <span>Nome do modelo *</span>
                  <input
                    autoFocus
                    disabled={!isGestor}
                    onChange={(e) => setForm((current) => ({ ...current, nome: e.target.value }))}
                    placeholder="Ex: Avaliação Pedagógica Semestral"
                    required
                    value={form.nome}
                  />
                </label>

                <label className="field">
                  <span>Tipo de modelo *</span>
                  <select
                    disabled={!isGestor}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, tipo_modelo: e.target.value }))
                    }
                    value={form.tipo_modelo}
                  >
                    <option value="avaliacao_pedagogica">Avaliação pedagógica</option>
                  </select>
                </label>

                <section className="modelo-editor-fields field-wide" aria-labelledby="modelo-campos-title">
                  <div className="modelo-editor-heading"><h4 id="modelo-campos-title">Campos do formulário</h4><p>Adicione as perguntas que a equipe deverá responder.</p></div>
                  <div className="campos-lista">
                    {form.campos.length === 0 && <p className="entity-modal-empty">Nenhum campo adicionado. Use “Adicionar campo” para começar.</p>}
                    {form.campos.map((campo, index) => (
                      <div
                        className="campo-item"
                        key={index}
                      >
                        <div className="campo-grid">
                          <label className="field field-wide">
                            <span>Chave *</span>
                            <input
                              disabled={!isGestor}
                              onChange={(e) =>
                                updateCampo(index, 'chave', e.target.value)
                              }
                              required
                              placeholder="ex: observacao_geral"
                              value={campo.chave}
                            />
                          </label>
                          <label className="field field-wide">
                            <span>Rótulo *</span>
                            <input
                              disabled={!isGestor}
                              onChange={(e) =>
                                updateCampo(index, 'rotulo', e.target.value)
                              }
                              placeholder="Ex: Observação geral"
                              required
                              value={campo.rotulo}
                            />
                          </label>
                          <label className="field">
                            <span>Tipo *</span>
                            <select
                              disabled={!isGestor}
                              onChange={(e) =>
                                updateCampo(index, 'tipo', e.target.value as TipoCampo)
                              }
                              value={campo.tipo}
                            >
                              {Object.entries(TIPOS_CAMPO).map(([valor, rotulo]) => (
                                <option key={valor} value={valor}>
                                  {rotulo}
                                </option>
                              ))}
                            </select>
                          </label>
                          <label className="toggle-check campo-obrigatorio">
                            <span>Obrigatório</span>
                            <input
                              disabled={!isGestor}
                              checked={campo.obrigatorio === true}
                              onChange={() =>
                                updateCampo(index, 'obrigatorio', !campo.obrigatorio)
                              }
                              type="checkbox"
                            />
                          </label>
                        </div>
                        {campo.tipo === 'selecao' && (
                          <div className="campo-opcoes">
                            <span className="campo-opcoes-label">Opções</span>
                            {campo.opcoes.map((opcao, opIndex) => (
                              <div className="campo-opcao-row" key={opIndex}>
                                <input
                                  disabled={!isGestor}
                                  onChange={(e) => {
                                    const campoAtual = { ...form.campos[index] }
                                    const opcoes = [...campoAtual.opcoes]
                                    opcoes[opIndex] = e.target.value
                                    campoAtual.opcoes = opcoes
                                    const campos = [...form.campos]
                                    campos[index] = campoAtual
                                    setForm((current) => ({ ...current, campos }))
                                  }}
                                  value={opcao}
                                />
                                <button
                                  className="button secondary"
                                  onClick={() => toggleCampoOpcao(index, opIndex)}
                                  type="button"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            ))}
                            <button
                              className="button secondary"
                              disabled={!isGestor}
                              onClick={() => addCampoOpcao(index)}
                              type="button"
                            >
                              <Plus size={14} /> Adicionar opção
                            </button>
                          </div>
                        )}
                        <button
                          className="button danger campo-remover"
                          disabled={!isGestor}
                          onClick={() => removeCampo(index)}
                          type="button"
                        >
                          <Trash2 size={16} /> Remover campo
                        </button>
                      </div>
                    ))}
                    <button
                      className="button secondary"
                      disabled={!isGestor}
                      onClick={addCampo}
                      type="button"
                    >
                      <Plus size={16} /> Adicionar campo
                    </button>
                  </div>
                </section>

                <label className="toggle-check field-wide">
                  <input
                    disabled={!isGestor}
                    checked={form.ativo === true}
                    onChange={(e) =>
                      setForm((current) => ({ ...current, ativo: e.target.checked }))
                    }
                    type="checkbox"
                  />
                  <span>Modelo ativo (disponível para novos relatórios)</span>
                </label>
              </div>

              <div className="modal-form-actions">
                <button className="button secondary" onClick={resetForm} type="button">
                  Cancelar
                </button>
                <button
                  className="button primary"
                  disabled={saving || !isGestor}
                  type="submit"
                >
                  {saving ? 'Salvando...' : 'Salvar modelo'}
                </button>
              </div>
              </fieldset>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

const emptyCampo: CampoFormulario = {
  chave: '',
  rotulo: '',
  tipo: 'texto',
  obrigatorio: false,
  opcoes: [],
}
