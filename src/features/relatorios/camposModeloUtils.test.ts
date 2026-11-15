import { describe, expect, it } from 'vitest'
import type { ModeloFormulario } from '../../types/modelosFormulario'
import {
  parseSelecao,
  toggleSelecaoAtual,
  validarCamposObrigatorios,
} from './camposModeloUtils'

const modelo: ModeloFormulario = {
  id: 'modelo-1',
  nome: 'Avaliação',
  tipo_modelo: 'avaliacao_pedagogica',
  versao: 1,
  campos: [
    { chave: 'resumo', rotulo: 'Resumo', tipo: 'texto', obrigatorio: true, opcoes: [] },
    { chave: 'areas', rotulo: 'Áreas', tipo: 'selecao', obrigatorio: true, opcoes: ['A', 'B', 'C'] },
    { chave: 'extra', rotulo: 'Extra', tipo: 'texto', obrigatorio: false, opcoes: [] },
  ],
  ativo: true,
  criado_por: 'user-1',
  criado_em: null,
  atualizado_em: null,
}

describe('camposModeloUtils', () => {
  it('lê seleções gravadas e ignora itens vazios', () => {
    expect(parseSelecao('A; B; ;C')).toEqual(['A', 'B', 'C'])
    expect(parseSelecao('')).toEqual([])
  })

  it('adiciona e remove seleções sem perder as demais respostas', () => {
    const inicial = { resumo: 'Texto', areas: 'A; B' }
    expect(toggleSelecaoAtual(inicial, 'areas', 'C')).toEqual({
      resumo: 'Texto',
      areas: 'A; B; C',
    })
    expect(toggleSelecaoAtual(inicial, 'areas', 'A')).toEqual({
      resumo: 'Texto',
      areas: 'B',
    })
  })

  it('remove a chave quando a última seleção é desmarcada', () => {
    expect(toggleSelecaoAtual({ areas: 'A' }, 'areas', 'A')).toEqual({})
  })

  it('exige campos obrigatórios de texto e de seleção', () => {
    expect(validarCamposObrigatorios(null, {})).toBeNull()
    expect(validarCamposObrigatorios(modelo, {})).toBe(
      'Preencha o campo obrigatório "Resumo".',
    )
    expect(validarCamposObrigatorios(modelo, { resumo: '  ' })).toBe(
      'Preencha o campo obrigatório "Resumo".',
    )
    expect(validarCamposObrigatorios(modelo, { resumo: 'Texto', areas: '' })).toBe(
      'Preencha o campo obrigatório "Áreas".',
    )
    expect(
      validarCamposObrigatorios(modelo, { resumo: 'Texto', areas: 'A' }),
    ).toBeNull()
  })
})
