import type { ModeloFormulario } from '../../types/modelosFormulario'
import { parseSelecao, toggleSelecaoAtual } from './camposModeloUtils'

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
  const toggleSelecao = (chave: string, valor: string) => {
    onChange(toggleSelecaoAtual(respostas, chave, valor))
  }

  const handleChange = (chave: string, valor: string) => {
    onChange({ ...respostas, [chave]: valor })
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
                      const selecionado = parseSelecao(valor).includes(opcao)
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
