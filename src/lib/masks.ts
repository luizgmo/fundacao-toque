/**
 * Utilitários de Máscaras de Entrada para Formulários
 * Fundação Toque
 */

export function unmask(value: string = ''): string {
  return value.replace(/\D/g, '')
}

/**
 * Máscara para CPF: 000.000.000-00
 */
export function maskCPF(value: string = ''): string {
  const digits = unmask(value).slice(0, 11)
  if (!digits) return ''
  if (digits.length <= 3) return digits
  if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`
  if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`
  return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`
}

/**
 * Máscara para Telefone / Celular: (00) 0000-0000 ou (00) 00000-0000
 */
export function maskPhone(value: string = ''): string {
  const digits = unmask(value).slice(0, 11)
  if (!digits) return ''
  if (digits.length <= 2) return `(${digits}`
  if (digits.length <= 6) return `(${digits.slice(0, 2)}) ${digits.slice(2)}`
  if (digits.length <= 10) {
    return `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
  }
  return `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7, 11)}`
}

/**
 * Máscara para RG: 00.000.000-X (aceita dígito ou X no final)
 */
export function maskRG(value: string = ''): string {
  const clean = value.replace(/[^0-9a-zA-Z]/g, '').slice(0, 9).toUpperCase()
  if (!clean) return ''
  if (clean.length <= 2) return clean
  if (clean.length <= 5) return `${clean.slice(0, 2)}.${clean.slice(2)}`
  if (clean.length <= 8) return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5)}`
  return `${clean.slice(0, 2)}.${clean.slice(2, 5)}.${clean.slice(5, 8)}-${clean.slice(8, 9)}`
}

/**
 * Formatação para CID: letras e números em caixa alta com ponto opcional (ex: F71, F84.0)
 */
export function maskCID(value: string = ''): string {
  return value.toUpperCase().replace(/[^A-Z0-9.]/g, '').slice(0, 8)
}

/**
 * Máscara de data DD/MM/AAAA para campos de texto
 */
export function maskDate(value: string = ''): string {
  const digits = unmask(value).slice(0, 8)
  if (!digits) return ''
  if (digits.length <= 2) return digits
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`
}
