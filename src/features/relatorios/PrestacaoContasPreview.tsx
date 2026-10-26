import { AlertTriangle, Camera, CheckCircle2, ImageOff, Users } from 'lucide-react'
import type { RelatorioPrestacaoDados } from '../../types/relatorios'
import {
  formatDateBR,
  formatDateTimeBR,
  formatPeriodoCurto,
  secaoAtividadesAtiva,
  secaoFrequenciaAtiva,
  secaoFotosAtiva,
} from '../../lib/reportBuilder'
import './PrestacaoContas.css'

const RESUMO_ITENS: {
  label: string
  key: keyof RelatorioPrestacaoDados['resumo']
  suffix?: string
}[] = [
  { label: 'Alunos atendidos', key: 'alunosAtendidos' },
  { label: 'Alunos ativos', key: 'alunosAtivos' },
  { label: 'Turmas atendidas', key: 'totalTurmas' },
  { label: 'Oficinas realizadas', key: 'totalOficinasRealizadas' },
  { label: 'Atividades', key: 'totalAtividades' },
  { label: 'Chamadas', key: 'totalSessoes' },
  { label: 'Fotos', key: 'totalFotos' },
  { label: 'Frequência média', key: 'frequenciaMedia', suffix: '%' },
]

export function PrestacaoContasPreview({
  data,
  confirmacaoImagem = false,
}: {
  data: RelatorioPrestacaoDados
  confirmacaoImagem?: boolean
}) {
  const mostrarAtividades = secaoAtividadesAtiva(data.filtros.tipo)
  const mostrarFrequencia = secaoFrequenciaAtiva(data.filtros.tipo)
  const mostrarFotos = secaoFotosAtiva(data.filtros)

  return (
    <section aria-label="Prévia do relatório de prestação de contas" className="prestacao-preview">
      <header className="prestacao-preview-header">
        <div>
          <span className="eyebrow">Prévia do relatório</span>
          <h2>Prestação de contas · {data.periodoLabel}</h2>
          <p>
            Dados consolidados em {formatDateTimeBR(data.geradoEm)}. Revise as informações antes de
            baixar ou imprimir.
          </p>
        </div>
        <span className="status-pill success">
          <CheckCircle2 size={14} /> Dados carregados
        </span>
      </header>

      <div className="prestacao-resumo-grid">
        {RESUMO_ITENS.map((item) => (
          <article className="prestacao-resumo-card" key={item.key}>
            <strong>
              {data.resumo[item.key]}
              {item.suffix || ''}
            </strong>
            <span>{item.label}</span>
          </article>
        ))}
      </div>

      <p className="prestacao-legenda">
        Presenças: <strong>{data.resumo.presentes}</strong> · Ausências:{' '}
        <strong>{data.resumo.ausentes}</strong> · Justificadas:{' '}
        <strong>{data.resumo.justificados}</strong>. Justificativas são consideradas comparecimento
        no percentual.
      </p>

      {mostrarAtividades && (
        <section className="prestacao-secao">
          <div className="prestacao-secao-titulo">
            <h3>Atividades realizadas no período</h3>
            <span>{data.atividades.length} registro(s)</span>
          </div>

          {data.atividades.length === 0 ? (
            <div className="prestacao-vazio">Nenhuma atividade registrada no período.</div>
          ) : (
            <div className="prestacao-tabela-wrap">
              <table className="prestacao-tabela">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Turma</th>
                    <th>Oficinas</th>
                    <th className="center">Presença</th>
                    <th>Responsável</th>
                    <th className="center">Fotos</th>
                  </tr>
                </thead>
                <tbody>
                  {data.atividades.map((atividade) => (
                    <tr key={atividade.id}>
                      <td className="nowrap">{formatDateBR(atividade.data)}</td>
                      <td>{atividade.turmaNome}</td>
                      <td>{atividade.oficinas.length > 0 ? atividade.oficinas.join(' · ') : '—'}</td>
                      <td className="center">
                        {atividade.presenca
                          ? `${atividade.presenca.presentes}/${atividade.presenca.total}`
                          : '—'}
                      </td>
                      <td>{atividade.responsavelNome}</td>
                      <td className="center">{atividade.fotos.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.atividades.some((atividade) => atividade.observacoes) && (
            <div className="prestacao-descritivos">
              <h4>Registros descritivos</h4>
              {data.atividades
                .filter((atividade) => atividade.observacoes)
                .map((atividade) => (
                  <article key={atividade.id}>
                    <strong>
                      {formatDateBR(atividade.data)} · {atividade.turmaNome}
                      {atividade.oficinas.length > 0
                        ? ` · ${atividade.oficinas.join(', ')}`
                        : ''}
                    </strong>
                    <p>{atividade.observacoes}</p>
                  </article>
                ))}
            </div>
          )}
        </section>
      )}

      {mostrarFrequencia && (
        <section className="prestacao-secao">
          <div className="prestacao-secao-titulo">
            <h3>Frequência por turma</h3>
            <span>{data.turmas.length} turma(s)</span>
          </div>

          {data.turmas.length === 0 ? (
            <div className="prestacao-vazio">
              Nenhuma turma encontrada para os filtros selecionados.
            </div>
          ) : (
            <div className="prestacao-tabela-wrap">
              <table className="prestacao-tabela">
                <thead>
                  <tr>
                    <th>Turma</th>
                    <th className="center">Chamadas</th>
                    <th className="center">Presentes</th>
                    <th className="center">Ausentes</th>
                    <th className="center">Justificadas</th>
                    <th className="center">Frequência</th>
                  </tr>
                </thead>
                <tbody>
                  {data.turmas.map((turma) => (
                    <tr key={turma.turmaId}>
                      <td>
                        <strong>{turma.turmaNome}</strong>
                        {turma.periodo ? (
                          <small className="prestacao-periodo">
                            {formatPeriodoCurto(turma.periodo)}
                          </small>
                        ) : null}
                      </td>
                      <td className="center">{turma.sessoes}</td>
                      <td className="center">{turma.presentes}</td>
                      <td className="center">{turma.ausentes}</td>
                      <td className="center">{turma.justificados}</td>
                      <td className="center">
                        <span className="prestacao-percentual">{turma.percentual}%</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {data.turmas.map((turma) => (
            <details className="prestacao-turma-detalhe" key={turma.turmaId}>
              <summary>
                <span>
                  <Users size={16} /> {turma.turmaNome} — frequência por aluno
                </span>
                <span>{turma.alunos.length} aluno(s)</span>
              </summary>
              {turma.alunos.length === 0 ? (
                <div className="prestacao-vazio">Nenhum aluno vinculado a esta turma.</div>
              ) : (
                <div className="prestacao-tabela-wrap">
                  <table className="prestacao-tabela compacta">
                    <thead>
                      <tr>
                        <th>Aluno</th>
                        <th className="center">Chamadas</th>
                        <th className="center">P</th>
                        <th className="center">A</th>
                        <th className="center">J</th>
                        <th className="center">Frequência</th>
                      </tr>
                    </thead>
                    <tbody>
                      {turma.alunos.map((aluno) => (
                        <tr key={`${turma.turmaId}-${aluno.alunoId}`}>
                          <td>{aluno.alunoNome}</td>
                          <td className="center">{aluno.sessoes}</td>
                          <td className="center">{aluno.presentes}</td>
                          <td className="center">{aluno.ausentes}</td>
                          <td className="center">{aluno.justificados}</td>
                          <td className="center">
                            {aluno.semRegistro ? (
                              <span className="prestacao-sem-registro">Sem registro</span>
                            ) : (
                              <span className="prestacao-percentual">{aluno.percentual}%</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </details>
          ))}
          <p className="prestacao-legenda">
            P = presentes, A = ausentes, J = justificadas. O percentual considera presentes +
            justificadas.
          </p>
        </section>
      )}

      {mostrarFotos && (
        <section className="prestacao-secao">
          <div className="prestacao-secao-titulo">
            <h3>Registro fotográfico</h3>
            <span>
              <Camera size={15} /> {data.fotos.length} foto(s)
            </span>
          </div>

          {data.fotos.length === 0 ? (
            <div className="prestacao-vazio">Nenhuma foto anexada no período.</div>
          ) : (
            <div className="prestacao-fotos-grid">
              {data.fotos.map((foto) => (
                <figure className="prestacao-foto" key={foto.id}>
                  {foto.url ? (
                    <img
                      alt={foto.legenda || foto.nomeArquivo}
                      loading="lazy"
                      src={foto.url}
                    />
                  ) : (
                    <div className="prestacao-foto-indisponivel">
                      <ImageOff size={22} />
                      <span>Foto indisponível</span>
                    </div>
                  )}
                  <figcaption>
                    <strong>
                      {formatDateBR(foto.data)} · {foto.turmaNome}
                    </strong>
                    <span>
                      {foto.oficinas.length > 0 ? `${foto.oficinas.join(' · ')} · ` : ''}
                      {foto.legenda || foto.nomeArquivo}
                    </span>
                  </figcaption>
                </figure>
              ))}
            </div>
          )}
        </section>
      )}

      {mostrarFotos && data.restricaoImagem.possuiAlunoSemAutorizacao && (
        <section className="prestacao-alerta imagem">
          <AlertTriangle size={20} />
          <div>
            <strong>Restrição de uso de imagem (LGPD)</strong>
            <p>
              {confirmacaoImagem
                ? 'A Direção confirmou a responsabilidade pelo uso das imagens. O registro das turmas e alunos sem autorização permanece listado abaixo.'
                : 'As turmas abaixo possuem alunos sem autorização registrada para uso de imagem. A Direção deve confirmar a responsabilidade antes de gerar o PDF ou imprimir.'}
            </p>
            <ul>
              {data.restricaoImagem.turmas.map((turma) => (
                <li key={turma.turmaId}>
                  <strong>{turma.turmaNome}:</strong> {turma.alunosSemAutorizacao.join(', ')}
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {data.avisos.length > 0 && (
        <section className="prestacao-alerta avisos">
          <AlertTriangle size={20} />
          <div>
            <strong>Observações de integridade dos dados</strong>
            <ul>
              {data.avisos.map((aviso) => (
                <li key={aviso}>{aviso}</li>
              ))}
            </ul>
          </div>
        </section>
      )}
    </section>
  )
}
