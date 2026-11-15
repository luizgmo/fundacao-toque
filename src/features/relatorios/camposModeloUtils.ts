import type { ModeloFormulario } from '../../types/modelosFormulario'

export function parseSelecao(valor: string): string[] {
  return valor
    .split(';')
    .map((item) => item.trim())
    .filter(Boolean)
}

export function toggleSelecaoAtual(
  respostas: Record<string, string>,
  chave: string,
  valor: string,
): Record<string, string> {
  const atuais = parseSelecao(respostas[chave] || '')
  const atualizadas = atuais.includes(valor)
    ? atuais.filter((item) => item !== valor)
    : [...atuais, valor]
  const proximas = { ...respostas }
  if (atualizadas.length > 0) proximas[chave] = atualizadas.join('; ')
  else delete proximas[chave]
  return proximas
}

export function validarCamposObrigatorios(
  modelo: ModeloFormulario | null,
  respostas: Record<string, string>,
): string | null {
  if (!modelo) return null
  for (const campo of modelo.campos) {
    if (campo.obrigatorio !== true) continue
    const valor = respostas[campo.chave]
    if (!valor || valor.trim().length === 0) {
      return `Preencha o campo obrigatório "${campo.rotulo}".`
    }
  }
  return null
}
