# Indicadores do dashboard

As regras abaixo são aplicadas em `src/services/dashboardService.ts` e ficam
visíveis na própria tela do dashboard.

## Frequência média (mês corrente)

- Recorte: chamadas com `data_chamada` entre o primeiro dia do mês e hoje,
  inclusive, na data local.
- Base: todos os registros de presença dessas chamadas.
- Fórmula: `presentes + justificados` dividido pelo total de registros.
  `justificado` conta como presença; `ausente` não conta.
- Sem registros no período: o percentual aparece como `-` (consulta bem-sucedida,
  base vazia), nunca como `0%`.
- Falha de consulta: aparece `Erro`, nunca é convertida em zero.
- A tela mostra o período e a base (`presentes`, `justificadas`, registros e
  sessões) para permitir conferir o número contra as chamadas.

## Alunos com faltas recorrentes

- Base: até 200 chamadas mais recentes (`data_chamada` decrescente).
- Escopo: a sequência é calculada separadamente por turma e por vínculo de
  oficina.
- Elegibilidade: só entram registros de aluno com matrícula da turma vigente na
  data da chamada; em chamada de oficina, também é exigida participação
  (`aluno_oficinas`) vigente na data. Bases legadas sem nenhum vínculo importado
  mantêm o registro para não apagar o histórico da migração.
- A sequência considera apenas `ausente`; `presente` e `justificado` interrompem
  a sequência. Sessões em que o aluno não foi registrado não alteram a sequência.
- Alerta quando a sequência atinge o limite configurado em
  `configuracoes_sistema/geral` (ou o padrão).
- A tela mostra quantas chamadas foram lidas e o limite da janela.

## Tarefas de hoje

- Frequência: chamadas com `data_chamada` igual à data local de hoje.
- Atividades: atividades com `data_atividade` igual à data local de hoje.
- Relatórios: `status == 'concluido'` e `atualizado_em` dentro do dia local atual
  (`>= início do dia` e `< início do dia seguinte`). Relatórios concluídos em
  dias anteriores não marcam a tarefa como feita.
- Falha de verificação: tarefa aparece como `Não verificado`, não como pendente.

## Índice necessário

A consulta de relatórios concluídos hoje usa o índice composto
`relatorios_pedagogicos(status ASC, atualizado_em ASC)` declarado em
`firestore.indexes.json`.
