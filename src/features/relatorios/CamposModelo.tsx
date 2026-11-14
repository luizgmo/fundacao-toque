import { useState } from 'react'
import type { ModeloFormulario, CampoFormulario } from '../../types/modelosFormulario'

type CamposModeloProps = {
  modelo: ModeloFormulario | null
  respostas: Record<string, string>
  onChange: (respostas: Record<string, string>) => void
  disabled?: boolean
  className?: string
}

export function CamposModelo({
  modelo,
  respostas,
  onChange,
  disabled = false,
  className,
}: CamposModeloProps) {
  const [selecoes, setSelecoes] = useState<Record<string, string[]>>({})

  const toggleSelecao = (chave: string, valor: string) => {
    setSelecoes((current) => {
      const next = [...(current[chave] || [])]
      const idx = next.indexOf(valor)
      const atualizado = idx >= 0 ? next.filter((_, i) => i !== idx) : [...next, valor]
      const respostasAtualizadas = { ...respostas }
      if (atualizado.length) respostasAtualizadas[chave] = atualizado.join('; ')
      else delete respostasAtualizadas[chave]
      onChange(respostasAtualizadas)
      return { ...current, [chave]: atualizado }
    })
  }

  const handleChange = (chave: string, valor: string) => {
    onChange({ ...respostas, [chave]: valor })
    if (selecoes[chave]) {
      setSelecoes((current) => {
        const next = { ...current }
        delete next[chave]
        return next
      })
    }
  }

  if (!modelo || modelo.campos.length === 0) {
    return (
      <div className={`campos-modelo ${className || ''}`}>
        <p className="campos-modelo-vazio">
          Este modelo não possui campos configurados.
        </p>
      </div>
    )
  }

  return (
    <div className={`campos-modelo ${className || ''}`}>
      <section className="form-card">
        <div className="form-card-heading">
          <span className="form-heading-icon">📋</span>
          <div>
            <h3>Campos do modelo: {modelo.nome}</h3>
            <p>Preencha os campos configurados no modelo de formulário.</p>
          </div>
        </div>
        {modelo.campos.map((campo) => {
          const valor = respostas[campo.chave] || ''
          const obrigatorio = campo.obrigatorio === true
          const preenchido = valor.trim().length > 0
          return (
            <div
              className={`campo-modelo-item ${obrigatorio && !preenchido ? 'incompleto' : ''}`}
              key={campo.chave}
            >
              <label className="field field-wide">
                <span>
                  {campo.rotulo}{obrigatorio && ' *'}
                </span>
                {campo.tipo === 'texto_longo' ? (
                  <textarea
                    disabled={disabled}
                    onChange={(e) => handleChange(campo.chave, e.target.value)}
                    rows={3}
                    value={valor}
                  />
                ) : campo.tipo === 'selecao' ? (
                  <div className="selecao-opcoes">
                    {campo.opcoes.map((opcao) => {
                      const selecionado = (selecoes[campo.chave] || []).includes(opcao)
                      return (
                        <label className="selecao-item" key={opcao}>
                          <input
                            checked={selecionado}
                            disabled={disabled}
                            onChange={() => toggleSelecao(campo.chave, opcao)}
                            type="checkbox"
                          />
                          {opcao}
                        </label>
                      )
                    })}
                  </div>
                ) : campo.tipo === 'booleano' ? (
                  <div className="booleano-opcoes">
                    <label className="booleano-item">
                      <input
                        checked={valor === 'sim'}
                        disabled={disabled}
                        onChange={() => handleChange(campo.chave, 'sim')}
                        type="radio"
                        name={`booleano-${campo.chave}`}
                      />
                      Sim
                    </label>
                    <label className="booleano-item">
                      <input
                        checked={valor === 'nao'}
                        disabled={disabled}
                        onChange={() => handleChange(campo.chave, 'nao')}
                        type="radio"
                        name={`booleano-${campo.chave}`}
                      />
                      Não
                    </label>
                  </div>
                ) : campo.tipo === 'data' ? (
                  <input
                    disabled={disabled}
                    onChange={(e) => handleChange(campo.chave, e.target.value)}
                    type="date"
                    value={valor}
                  />
                ) : campo.tipo === 'numero' ? (
                  <input
                    disabled={disabled}
                    onChange={(e) => handleChange(campo.chave, e.target.value)}
                    type="number"
                    value={valor}
                  />
                ) : (
                  <input
                    disabled={disabled}
                    onChange={(e) => handleChange(campo.chave, e.target.value)}
                    type="text"
                    value={valor}
                  />
                )}
                {!preenchido && obrigatorio && (
                  <span className="campo-obrigatorio-aviso">Campo obrigatório.</span>
                )}
              </label>
            </div>
          )
        })}
      </section>
    </div>
  )
}

export function validarCamposObrigatorios(
  modelo: ModeloFormulario | null,
  respostas: Record<string, string>,
  selecoes: Record<string, string[]>
): string | null {
  if (!modelo) return null
  for (const campo of modelo.campos) {
    if (campo.obrigatorio === true) {
      const valor = respostas[campo.chave]
      const preenchidoTexto = valor && valor.trim().length > 0
      const preenchidoSelecao =
        campo.tipo === 'selecao' && (selecoes[campo.chave] || []).length > 0
      if (!preenchidoTexto && !preenchidoSelecao) {
        return `Preencha o campo obrigatório "${campo.rotulo}".`
      }
    }
  }
  return null
}

export type { CampoFormulario }
