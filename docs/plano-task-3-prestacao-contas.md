# Plano 3 — prestação de contas, frequência e fotos

Auditoria pelo subagente da tarefa 3, consolidada em 10/11/2026. Este plano não declara homologação nem aprovação institucional. Coordenação: [execução paralela](planos-execucao-paralela.md).

**Atualização da implementação:** o projeto não usa Firebase Storage nem CORS de bucket. Fotos e anexos são persistidos no Firestore em partes; referências a URLs/Storage abaixo descrevem a auditoria inicial e foram substituídas.

## Diagnóstico

**Parcialmente entregue, com base extensa a preservar.** A descrição do card está desatualizada quanto às opções desabilitadas: frequência e fotos já estão disponíveis. O trabalho restante concentra-se em histórico de matrículas, política de imagens, semântica dos indicadores e rastreabilidade. Não reconstruir o módulo.

## O que já existe e não precisa ser refeito

| Recurso | Evidência na raiz do repositório | Aproveitamento |
| --- | --- | --- |
| RF13 com atividades, frequência, fotos e período | `prototipo/Documento_de_Requisitos_Fundacao_Toque.md:78` | Manter o escopo; redução exige decisão documentada |
| Tipos consolidado, atividades, frequência e fotos habilitados | `src/types/relatorios.ts:3`, `:181`; `src/features/relatorios/PrestacaoContas.tsx:381` | Não abrir tarefa para habilitar algo já disponível |
| Datas, presets e múltiplas turmas | `src/features/relatorios/PrestacaoContas.tsx:358`, `:395`, `:414` | Manter e testar combinações |
| Validação de datas reais, início≤fim, futuro e limite de 366 dias | `src/lib/reportBuilder.ts:78` | Reusar validação; confirmar regra de limite com instituição |
| Toggle de fotos com coerência por tipo | `src/features/relatorios/PrestacaoContas.tsx:480`; `src/lib/reportBuilder.ts:120` | Estado bloqueado em tipos específicos não significa recurso ausente |
| Consultas por intervalo inclusivo | `src/services/prestacaoContasService.ts:185`, `:191` | Reusar e auditar eficiência após contrato final |
| Anexos reais/URLs Storage e concorrência limitada | `src/services/prestacaoContasService.ts:218` | Ajustar autorização antes de obter URLs |
| Consolidação comum | `src/lib/reportBuilder.ts:201` | Manter uma única fonte para as saídas |
| Funções comuns para seções | `src/features/relatorios/PrestacaoContasPreview.tsx:35`; `src/lib/prestacaoContasPdf.ts:642`; `src/lib/prestacaoContasPrint.ts:334` | Não criar agregação paralela para PDF |
| Fórmula com justificadas e explicação | `src/lib/reportBuilder.ts:187`, `:570`; preview `:233`; PDF `:222`, `:422`; impressão `:227` | Já implementada; falta comprovar aprovação institucional |
| PDF com paginação, progresso, cache e placeholder | `src/lib/prestacaoContasPdf.ts:427`, `:593`, `:642` | Evoluir sem substituir |
| Escape de HTML e validação de URLs na impressão | `src/lib/prestacaoContasPrint.ts:28` | Preservar proteções |
| Manual com Storage/CORS e ausência de histórico de PDFs | `docs/prestacao-contas.md:16`, `:45` | Corrigir afirmações específicas, sem reescrever do zero |

## Lacunas verificadas

### Matrículas e turma histórica

`RelatorioMatriculaRaw` tem somente aluno/turma/status (`src/types/relatorios.ts:127`). O mapeamento ignora início/fim (`src/services/prestacaoContasService.ts:91`), embora previstos em `modelagem.md:200`.

O builder seleciona matrículas atualmente ativas (`src/lib/reportBuilder.ts:261`) e soma a turma atual do aluno (`:270`) mesmo quando há matrícula, em vez de usar fallback somente quando necessário. Isso pode duplicar a atribuição em transferências. O roster exclui alunos hoje inativos (`:281`), embora possam ter participado no período histórico.

### Fotos e autorização

Todas as imagens das atividades entram no resultado (`src/lib/reportBuilder.ts:479`). Os metadados não associam fotos aos alunos retratados (`src/types/relatorios.ts:47`, `:155`). O alerta de autorização usa o roster atual da turma (`src/lib/reportBuilder.ts:543`), insuficiente para provar autorização da imagem histórica.

O checkbox da Direção permite exportar as imagens (`src/features/relatorios/PrestacaoContas.tsx:508`), sem aprovação institucional dessa exceção localizada na auditoria. URLs são obtidas antes da avaliação de autorização (`src/services/prestacaoContasService.ts:233`) e a prévia pode renderizar imagens antes da confirmação. A política deve agir sobre o conjunto comum de fotos elegíveis.

### Indicadores e origem dos totais

A frequência percorre sessões de turma e oficina (`src/lib/reportBuilder.ts:303`), enquanto a atividade prioriza a chamada diária (`:436`). Um aluno/dia pode contribuir várias vezes conforme unidade adotada.

`alunosAtendidos` considera aluno com qualquer status válido, inclusive ausências/justificativas (`:324`, `:587`). Presenças sem vínculo válido também podem ser contadas; ausência de registro não vira automaticamente ausência. Essas escolhas precisam ser nomeadas e aprovadas.

O resultado agregado não preserva a contribuição detalhada por sessão/matrícula (`src/types/relatorios.ts:93`). Avisos de órfãos não bastam para reconciliar cada total.

### Disponibilidade de fotos entre formatos

O PDF sinaliza falha de download/decodificação. Prévia e impressão não substituem de forma equivalente toda URL que falha depois de renderizada. A impressão aguarda eventos com timeout de cinco segundos (`src/lib/prestacaoContasPrint.ts:666`), mas isso não gera automaticamente mensagem visível no lugar da imagem.

O fetch do PDF não tem timeout (`src/lib/prestacaoContasPdf.ts:593`). A mensagem em `baixarPdf` sugere imprimir para obter conteúdo completo, algo que não pode garantir se o arquivo está indisponível.

### Documentação

`docs/prestacao-contas.md:13` descreve prioridade de matrícula que o builder não implementa efetivamente. A afirmação em `:47` sobre não precisar de índices/regras novos deve ser reavaliada após tarefas 4/5.

## Decisões institucionais pendentes

**Decisões recebidas em 10/11/2026:** manter a fórmula que inclui faltas justificadas no numerador e denominador e omitir fotos sem autorização comprovável. Essas duas políticas estão aprovadas para implementação.

Registrar proposta, aprovador, data e versão da regra:

- A unidade do indicador continua pendente: sessão, aluno-dia ou oficina? Como tratar chamadas de turma e oficina no mesmo dia?
- A unidade é sessão, aluno-dia ou oficina? Como tratar chamadas de turma e oficina no mesmo dia?
- “Atendido” significa presença efetiva ou aluno com qualquer registro?
- Registro sem vínculo histórico é excluído do indicador oficial ou mantido com sinalização?
- A omissão de imagem sem autorização comprovável está aprovada. Ainda falta definir como registrar autorização histórica por aluno ou por turma.
- Haverá marcação individual dos alunos na foto ou política conservadora por turma histórica?
- Para autorização desconhecida, revogada ou sem vigência histórica, manter a omissão; o valor atual sozinho não comprova autorização passada.
- O limite de 366 dias atende às prestações reais?

Sem resposta ainda é possível preparar datas de matrícula, rastreabilidade, tratamento de falhas e testes. Não escolher silenciosamente uma política institucional definitiva.

## Sequência de implementação

### 1. Contratos e fixture de referência

- Registrar as decisões no manual ou em decisão vinculada.
- Criar fixture com duas turmas, transferência no meio do período, aluno hoje inativo, matrículas encerradas/canceladas, chamadas diárias e de oficina, fotos permitidas/restritas e arquivo inexistente.
- Calcular manualmente os totais esperados com IDs de origem antes de alterar o algoritmo.
- Compartilhar schemas e consultas com agentes 4/5.

### 2. Vínculo histórico

- Acrescentar ID da matrícula e datas de início/fim aos tipos e mapeamento.
- Resolver vínculo na data da sessão/atividade e por sobreposição no intervalo do resumo.
- Considerar matrículas encerradas válidas no período; não depender do status atual do aluno.
- Definir fronteiras de transferência para evitar atribuição dupla no mesmo dia.
- Usar turma legada somente quando não houver histórico utilizável; sinalizar a origem e a cobertura limitada.
- Não inventar datas históricas. Coordenar com agente 5 a migração que atualmente pode inferir início pela turma, não pelo aluno.
- Conferir se o fluxo de alteração de turma mantém matrículas. Combinar proprietário único para alterações em `studentsService.ts` com agente 1.

### 3. Indicadores rastreáveis

- Centralizar unidade, numerador e denominador aprovados em função comum.
- Separar ou deduplicar escopos turma/oficina segundo decisão documentada.
- Tratar “sem registro” de forma explícita.
- Preservar sessão, aluno, turma, data, matrícula e status contribuinte.
- Disponibilizar detalhamento na prévia e referências/apêndice nos formatos exportados.
- Separar fotos encontradas, elegíveis, omitidas por autorização e indisponíveis.
- Sinalizar sobreposição de matrículas, referências órfãs, datas inválidas e registros sem vínculo.

### 4. Fotos elegíveis

- Se houver controle individual aprovado, adaptar metadados e cadastro de anexos para participantes/autorização.
- Se adotada política conservadora por turma histórica, documentar seu alcance e limitações.
- Classificar elegibilidade antes de buscar URL ou binário.
- Substituir o checkbox genérico por comportamento compatível com a política aprovada.
- Se houver exceção formal, registrar autor, data, justificativa, fotos abrangidas e versão da política.
- Entregar o mesmo conjunto elegível a prévia, PDF e impressão.

### 5. Filtros e consistência da prévia

- Preservar os quatro tipos, período e turmas já disponíveis.
- Se exigidas combinações livres, usar seções explícitas e tipos como presets, evitando controles contraditórios.
- Filtrar atividades/turmas antes de percorrer anexos.
- Evitar que resposta assíncrona de filtro antigo substitua resultado novo.
- Exportar o snapshot de filtros/dados efetivamente revisado na prévia.

### 6. Exportação e documentação

- Adicionar placeholder visível na prévia e impressão para falha posterior de imagem.
- Adicionar timeout no PDF sem invalidar todo o relatório.
- Corrigir mensagens que prometem imagens completas na impressão.
- Documentar limitações reais: resize até 1.400 px, JPEG qualidade 0,82 quando convertido, legenda de até três linhas no PDF, consumo de memória e ausência de arquivo histórico de PDFs.
- Explicar que HTML pode mostrar imagem que o PDF não consegue obter por CORS. O registro deve continuar representado com aviso; não prometer disponibilidade binária idêntica.
- Manter instruções Storage/CORS com projeto/bucket e domínios corretos; esclarecer que deploy Firebase não configura CORS.
- Atualizar requisitos de regras/índices depois da integração.

## Testes de aceite

1. Transferência A→B: períodos anterior/posterior mostram turma correta; período cruzado distribui sessões pela data.
2. Aluno hoje inativo e matrícula encerrada continuam no relatório histórico pertinente.
3. Matrícula válida prevalece sobre turma legada divergente; falta de histórico é identificada.
4. Limites inclusivos respeitam período sem incluir registros externos.
5. Se aprovada a regra atual, P=2/A=1/J=1 produz 75% nos três formatos.
6. Turma/oficina no mesmo dia seguem a unidade aprovada sem duplicação silenciosa.
7. Cada total reconcilia com a lista de contribuições/IDs de origem.
8. Combinações de conteúdo/turma/período geram mesmos filtros e registros em prévia, PDF e impressão.
9. Imagem não autorizada/desconhecida segue política e é sinalizada, sem download prematuro quando proibido.
10. URL ausente, arquivo removido, 403, CORS e timeout deixam relatório utilizável com aviso preciso.
11. Alteração de filtros durante carregamento não libera exportação obsoleta.
12. Nomes/legendas maliciosos continuam escapados na impressão.

## Propriedade e dependências

- Agente 3: tela, preview, serviço, builder, tipos, PDF, impressão, testes e manual da prestação.
- Agente 1: combinar manutenção de matrículas no serviço de alunos; não editar esse arquivo simultaneamente.
- Agente 4: leitura das coleções, projeção mínima de profissionais e Storage. O serviço lê `usuarios` inteiro em `src/services/prestacaoContasService.ts:182`; não reabrir acesso indiscriminado para manter nomes.
- Agente 5: consultas finais por período/turma/vigência e evidência dos índices; não inferir necessidade apenas pelo modelo.
- Compartilhados a coordenar: `activitiesService.ts`, migração, arquivos de pacote/configuração.

Histórico de PDFs não era exigido por este card. O escopo foi ampliado explicitamente em 11/11/2026: `relatorios_gerados` agora guarda metadados e permite regeração/download, mas o arquivo continua sem ser armazenado.

## Verificação executada e limites

O subagente executou `rtk npm test -- src/lib/reportBuilder.test.ts src/lib/prestacaoContasPdf.test.ts`: 24 testes passaram em dois arquivos. O integrador também executou suíte completa e build com sucesso. Não houve teste remoto, deploy, migração, gravação ou validação institucional. Testes existentes não comprovam os cenários históricos e de autorização ainda faltantes.
