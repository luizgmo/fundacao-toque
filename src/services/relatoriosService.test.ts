import { describe, expect, it } from 'vitest'
import { validarRelatorioPedagogico } from './relatoriosService'
import type { RelatorioPedagogicoInput } from '../types/relatoriosPedagogicos'

const valid: RelatorioPedagogicoInput = {
  aluno_id: 'aluno-1', tipo_relatorio: 'diario', periodo_inicio: '2026-02-28', periodo_fim: '2026-02-28',
  evolucao: '', dificuldades: '', avancos: '', encaminhamentos: '', observacoes_finais: '',
  usuario_responsavel_id: 'prof-1', usuario_responsavel_nome: 'Profissional', respostas: {}, status: 'rascunho',
}

describe('validarRelatorioPedagogico', () => {
  it('aceita datas válidas e conteúdo incompleto enquanto os campos institucionais não foram definidos', () => {
    expect(validarRelatorioPedagogico(valid)).toBeNull()
  })

  it('exige aluno e profissional identificados', () => {
    expect(validarRelatorioPedagogico({ ...valid, aluno_id: '' })).toContain('aluno')
    expect(validarRelatorioPedagogico({ ...valid, usuario_responsavel_id: '' })).toContain('responsável')
  })

  it('rejeita datas inválidas e períodos invertidos', () => {
    expect(validarRelatorioPedagogico({ ...valid, periodo_inicio: '2026-02-30' })).toContain('inicial válida')
    expect(validarRelatorioPedagogico({ ...valid, periodo_inicio: '2026-03-01' })).toContain('anterior ou igual')
  })
})
