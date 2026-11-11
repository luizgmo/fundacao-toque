import { describe, expect, it } from 'vitest'
import { analisarAnexos } from './anexosOrfaos'

const agora = new Date('2026-11-10T12:00:00Z')

describe('analisarAnexos', () => {
  it('não acusa nada num banco consistente', () => {
    expect(
      analisarAnexos({
        agora,
        pais: [{ path: 'registros_atividade/r1', totalAnexos: 1 }],
        anexos: [{ path: 'registros_atividade/r1/anexos/a1', status: 'disponivel', totalPartes: 2 }],
        partes: [
          { path: 'registros_atividade/r1/anexos/a1/chunks/000000' },
          { path: 'registros_atividade/r1/anexos/a1/chunks/000001' },
        ],
      })
    ).toEqual([])
  })

  it('classifica cada tipo de inconsistência com a correção adequada', () => {
    const achados = analisarAnexos({
      agora,
      pais: [
        { path: 'registros_atividade/r1', totalAnexos: 3 },
        { path: 'registros_atividade/r2', totalAnexos: 0, exclusao: { status: 'incompleta', arquivos_pendentes: ['x.jpg'] } },
        { path: 'relatorios_pedagogicos/p1' },
      ],
      anexos: [
        { path: 'registros_atividade/r1/anexos/ok', status: 'disponivel', totalPartes: 1 },
        { path: 'registros_atividade/r1/anexos/quebrado', status: 'disponivel', totalPartes: 2, nome: 'q.jpg' },
        { path: 'registros_atividade/r1/anexos/velho', status: 'enviando', totalPartes: 2, enviadoEm: '2026-11-08T12:00:00Z' },
        { path: 'registros_atividade/r1/anexos/recente', status: 'enviando', totalPartes: 2, enviadoEm: '2026-11-10T11:00:00Z' },
        { path: 'registros_atividade/sumiu/anexos/z', status: 'disponivel', totalPartes: 1 },
      ],
      partes: [
        { path: 'registros_atividade/r1/anexos/ok/chunks/000000' },
        { path: 'registros_atividade/r1/anexos/quebrado/chunks/000000' },
        { path: 'registros_atividade/r1/anexos/velho/chunks/000000' },
        { path: 'registros_atividade/sumiu/anexos/z/chunks/000000' },
        { path: 'relatorios_pedagogicos/p1/anexos/apagado/chunks/000000' },
      ],
    })
    const porTipo = Object.fromEntries(achados.map((a) => [`${a.tipo}:${a.path}`, a]))

    expect(porTipo['parte_sem_anexo:relatorios_pedagogicos/p1/anexos/apagado']).toMatchObject({
      correcao: 'apagar',
      apagar: ['relatorios_pedagogicos/p1/anexos/apagado/chunks/000000'],
    })
    expect(porTipo['anexo_sem_pai:registros_atividade/sumiu/anexos/z']).toMatchObject({
      correcao: 'apagar',
      apagar: ['registros_atividade/sumiu/anexos/z/chunks/000000', 'registros_atividade/sumiu/anexos/z'],
    })
    expect(porTipo['envio_abandonado:registros_atividade/r1/anexos/velho']).toMatchObject({ correcao: 'apagar' })
    expect(porTipo['envio_abandonado:registros_atividade/r1/anexos/recente']).toBeUndefined()
    expect(porTipo['conteudo_incompleto:registros_atividade/r1/anexos/quebrado']).toMatchObject({ correcao: 'manual' })
    // r1: ok + quebrado estão "disponivel" => 2, contador diz 3
    expect(porTipo['contador_divergente:registros_atividade/r1']).toMatchObject({ correcao: 'recontar', totalCorreto: 2 })
    expect(porTipo['exclusao_incompleta:registros_atividade/r2']).toMatchObject({ correcao: 'manual' })
    expect(achados).toHaveLength(6)
  })
})
