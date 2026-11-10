# Plano 5 — consultas, índices Firestore e homologação

Auditoria local de 10/11/2026. Apenas este plano foi escrito: não foram alterados serviços, índices ou migração; não houve acesso ao Firebase remoto, execução de migração ou deploy. Os números de linha referem-se ao código auditado e podem mudar na implementação.

## Diagnóstico

Há 13 índices compostos declarados e um script de migração com paginação REST. Falta um inventário associado aos fluxos reais, verificação do estado publicado e execução autenticada das consultas em homologação.

As consultas atuais são muito mais simples do que a tabela de índices sugere: grande parte lê coleções inteiras e filtra no cliente. Não identifiquei uma consulta composta atual cuja ausência de índice possa ser demonstrada apenas pelo código. Isso não comprova que o ambiente remoto esteja correto, nem que as consultas novas das tarefas 1–3 estejam cobertas.

Índices automáticos normalmente atendem igualdade simples e intervalo/ordenação sobre um único campo; filtros de igualdade combinados com ordenação em outro campo podem exigir composto. A classificação abaixo pressupõe indexação automática padrão e precisa ser confirmada no projeto, inclusive quanto a exceções remotas. Fonte: [tipos de índices Firestore](https://firebase.google.com/docs/firestore/query-data/index-overview).

## Inventário completo dos serviços atuais

“Sem ordenação” significa que o código não usa `orderBy`; não promete ordem funcional. “Coleção inteira” significa ausência de filtro no servidor, não ausência de filtros posteriores na interface.

| ID | Serviço e linha | Coleção/caminho | Filtros no servidor | Ordenação/limite | Índice composto atual |
| --- | --- | --- | --- | --- | --- |
| Q01 | studentsService.ts:115–116, subscribeToStudents | alunos | Nenhum | Sem ordenação/limite | Não necessário pela forma atual |
| Q02 | studentsService.ts:146, getStudentById | alunos/{id} | Leitura direta por ID | Não aplicável | Não |
| Q03 | turmasService.ts:112–113, subscribeToTurmas | turmas | Nenhum | Ordena nome no cliente em :122 | Não |
| Q04 | oficinasService.ts:70–71, subscribeToOficinas | oficinas | Nenhum | Ordena nome no cliente em :77 | Não |
| Q05 | oficinasService.ts:241–242, subscribeToTurmaOficinas | turma_oficinas | Nenhum | Sem ordenação/limite | Não |
| Q06 | oficinasService.ts:276–277, subscribeToAlunoOficinas | aluno_oficinas | Nenhum | Sem ordenação/limite | Não |
| Q07 | usuariosService.ts:12–13, subscribeToUsuarios | usuarios | Nenhum | Ordena nome no cliente em :26 | Não; acesso precisa revisão tarefa 4 |
| Q08 | activitiesService.ts:43–46, subscribeToRegistrosAtividade | registros_atividade | Nenhum | data_atividade DESC; limit(maxItems), padrão 50 | Índice simples descendente |
| Q09 | activitiesService.ts:134, getAnexosComUrl | {parentPath}/anexos | Nenhum | Sem ordenação/limite | Não |
| Q10 | activitiesService.ts:160, deleteRegistroAtividade | {parentPath}/anexos | Nenhum | Sem ordenação/limite | Não; lê antes de excluir |
| Q11 | attendanceService.ts:77, loadSessionFromFirestore | sessoes_chamada/{cleanId} | Leitura direta por ID | Não aplicável | Não |
| Q12 | attendanceService.ts:154–156, subscribeStudentOccurrences | contatos_familia | aluno_id == studentId | Sem orderBy/limite | Igualdade simples; composto declarado ainda não utilizado |
| Q13 | prestacaoContasService.ts:149, loadTurmasParaFiltro | turmas | Nenhum | Ordena nome no cliente em :152 | Não |
| Q14 | prestacaoContasService.ts:177 | turmas | Nenhum | Sem ordenação/limite | Não |
| Q15 | prestacaoContasService.ts:178 | alunos | Nenhum | Sem ordenação/limite | Não |
| Q16 | prestacaoContasService.ts:179 | matriculas | Nenhum | Sem ordenação/limite | Não |
| Q17 | prestacaoContasService.ts:180 | oficinas | Nenhum | Sem ordenação/limite | Não |
| Q18 | prestacaoContasService.ts:181 | turma_oficinas | Nenhum | Sem ordenação/limite | Não |
| Q19 | prestacaoContasService.ts:182 | usuarios | Nenhum | Sem ordenação/limite | Não; conflito possível com tarefa 4 |
| Q20 | prestacaoContasService.ts:185–189 | registros_atividade | data_atividade >= início; <= fim | data_atividade ASC; sem limite | Índice simples ascendente no mesmo campo |
| Q21 | prestacaoContasService.ts:191–195 | sessoes_chamada | data_chamada >= início; <= fim | data_chamada ASC; sem limite | Índice simples ascendente no mesmo campo |
| Q22 | prestacaoContasService.ts:223–224 | registros_atividade/{atividadeId}/anexos | Nenhum | Sem ordenação/limite | Não; repetida para atividades elegíveis |

Q14–Q22 pertencem a `loadPrestacaoContasData`. Q09 é genérica: hoje atende atividades e pode ser reaproveitada pelo pedagógico; ler uma subcoleção de um pai específico não é uma consulta `collectionGroup`.

As consultas Q01, Q03–Q07 são listeners. O plano de homologação deve aguardar um snapshot de servidor e encerrar as assinaturas após a verificação, em vez de deixar processos ativos indefinidamente.

## Leituras fora dos serviços e caminhos ainda não implementados

| ID | Local | Consulta | Impacto |
| --- | --- | --- | --- |
| Q23 | src/features/auth/AuthContext.tsx:79 | getDoc usuarios/{uid} | Sem índice composto; testar com matriz nova e perfil ausente/inativo |
| Q24 | src/features/usuarios/GerenciarUsuarios.tsx:43–44 | Listener de usuarios inteiro | Duplicação do acesso do serviço; precisa constar no inventário e na autorização |
| M01–M06 | scripts/migrate-legacy-turmas.mjs:277–282 | listDocuments REST de turmas, alunos, sessoes_chamada, registros_atividade, matriculas, usuarios | Sem filtros/ordenação estruturada; paginação pageSize=300 e nextPageToken em :201–216; campos selecionados por máscara |

Não há consulta `collectionGroup` ou `runQuery` identificada nos serviços atuais. `registros_evolucao`, `modelos_formulario` e `relatorios_pedagogicos` possuem índices/modelagem, mas não há serviço ativo de consulta dessas coleções no fluxo auditado. O formulário pedagógico é local; sua existência visual não prova execução de consulta.

O script de seed é ferramenta de carga/limpeza, não evidência de que os fluxos aceitos executam consultas. Se for usado como fixture, auditar separadamente o modo de limpeza e o destino antes de rodá-lo; não usar reset amplo em ambiente compartilhado.

## Comparação dos 13 compostos declarados

Todos têm `queryScope: COLLECTION`; `fieldOverrides` está vazio no arquivo local (`firestore.indexes.json:109`). Isso não confirma o conjunto implantado remotamente.

| Índice e linha em firestore.indexes.json | Campos | Uso identificado na aplicação atual | Ação planejada |
| --- | --- | --- | --- |
| I01 :4 | alunos: status ASC, nome_busca ASC | Q01 lê todos; busca/status são locais | Manter sob revisão; associar à futura consulta se ela for aceita |
| I02 :12 | matriculas: aluno_id ASC, status ASC | Q16 lê todos | Não declarar necessário hoje; avaliar futura leitura por aluno |
| I03 :20 | matriculas: turma_id ASC, status ASC | Q16 lê todos | Não usar apenas status atual para relatório histórico |
| I04 :28 | turma_oficinas: turma_id ASC, ativo ASC | Q05/Q18 leem todos | Associar a eventual filtragem servidor |
| I05 :36 | registros_atividade: turma_id ASC, data_atividade DESC | Q08 ordena só data; Q20 filtra só data ASC | Não cobre automaticamente eventual turma + data ASC; decidir direção final |
| I06 :44 | registros_evolucao: aluno_id ASC, data_registro DESC | Sem consulta ativa localizada | Preservar até confirmar escopo/uso externo; não inventar serviço como parte deste card |
| I07 :52 | relatorios_pedagogicos: aluno_id ASC, tipo_relatorio ASC, periodo_fim DESC | Serviço pedagógico inexistente | Receber consultas task2; histórico todos os tipos pode precisar outro composto |
| I08 :61 | sessoes_chamada: turma_id ASC, data_chamada DESC | Q11 é ID; Q21 usa só data ASC | Avaliar direção ASC se turma passar ao servidor |
| I09 :69 | sessoes_chamada: turma_oficina_id ASC, data_chamada DESC | Sem consulta ativa com esses filtros | Manter sob revisão com filtros de frequência |
| I10 :77 | contatos_familia: aluno_id ASC, contatado_em DESC | Q12 usa só igualdade aluno | Reutilizar quando task1 acrescentar histórico cronológico |
| I11 :85 | aluno_oficinas: aluno_id ASC, status ASC | Q06 lê todos | Avaliar consultas finais por aluno |
| I12 :93 | aluno_oficinas: turma_oficina_id ASC, status ASC | Q06 lê todos | Avaliar consultas finais por oficina |
| I13 :101 | modelos_formulario: tipo_modelo ASC, versao DESC | Sem consulta ativa | Aproveitar se task2 buscar modelo por tipo e versão |

Não apagar índices só porque a aplicação atual não os usa: conferir versões ainda em uso, scripts externos e consultas da implementação nova. Classificar cada um como usado, reservado com justificativa ou candidato a remoção; remover apenas após análise do impacto.

Corrigir `modelagem.md:441`: subcoleções não “herdam as consultas do pai”, e pouca escala não dispensa um índice exigido. A necessidade depende dos campos, operadores, ordenação e escopo da consulta. Diferenciar leitura em `alunos/{id}/responsaveis` de busca em todas as subcoleções `responsaveis`. Fonte: [escopos e tipos de índices](https://firebase.google.com/docs/firestore/query-data/index-overview).

## Consultas futuras a fechar com os outros subagentes

Estas são propostas de contrato, não consultas já implementadas nem índices aprovados.

| Frente | Consulta esperada | Avaliação inicial |
| --- | --- | --- |
| Task1 responsáveis | Listar subcoleção de um aluno; opcional ativo == true | Coleção sem filtro ou igualdade simples normalmente basta; não criar composto preventivo |
| Task1 contatos | aluno_id == id + orderBy contatado_em DESC + limite/página | Reutiliza I10; testar timestamps legados ausentes e paginação |
| Task1 contatos por familiar | aluno_id == id + responsavel_id == id + ordenação | Só criar índice adicional se esse filtro entrar no escopo |
| Task2 histórico por aluno | aluno_id == id + periodo_fim DESC | Avaliar composto específico aluno_id + periodo_fim; I07 tem tipo intermediário |
| Task2 histórico por tipo | aluno_id == id + tipo_relatorio == tipo + periodo_fim DESC | I07 é candidato reutilizável |
| Task2 rascunhos | Filtros de aluno/tipo/status/autor e ordenação acordados | Enumerar somente combinações expostas; cada variante pode demandar índice distinto |
| Task2 modelos | tipo_modelo == tipo + versao DESC + limit(1), possivelmente ativo | I13 cobre a forma sem ativo; confirmar modelo efetivamente escolhido |
| Task3 prestação por turma | turma_id == id ou in ids + intervalo data ASC | I05/I08 atuais são DESC; definir ASC/DESC e medir custo antes de alterar |
| Task3 vínculos históricos | turma/aluno + sobreposição entre data_inicio/data_fim e período | Resolver estratégia para data_fim null, múltiplos intervalos e datas ausentes; não usar filtro status ativo como substituto |
| Task4 nomes profissionais | Documento mínimo/projeção ou IDs autorizados | Evitar manter leitura irrestrita de usuarios para satisfazer apenas os selects |

Se houver `in` para múltiplas turmas, validar limites atuais do operador, dividir em lotes quando necessário e deduplicar por ID; não reduzir silenciosamente a seleção do usuário. Se houver paginação, definir ordem estável e cursor coerente, especialmente para datas empatadas. Valores faltantes dos campos ordenados precisam de migração/política explícita, pois `orderBy` pode excluir documentos sem o campo. Fonte: [consultas Firestore](https://firebase.google.com/docs/firestore/query-data/queries).

## Auditoria da migração: o que reaproveitar e corrigir

Já existe dry-run padrão, `APPLY=1` explícito, paginação REST, normalização de referências e IDs determinísticos de matrícula. Não reescrever isso sem necessidade.

Pontos para verificar antes de qualquer execução:

1. **Destino:** `PROJECT_ID` vem de env e o script carrega `.env.local` (:23–46). O fallback da aplicação não identifica homologação. Registrar projeto explicitamente e impedir mistura de configurações.
2. **Credenciais:** usa OAuth de gcloud/Firebase CLI (:49–91). Esse acesso administrativo não comprova que consultas do cliente são permitidas pelas Security Rules. Homologar também com SDK e contas dos papéis.
3. **Datas inferidas:** matrícula planejada usa menor data encontrada para a turma ou hoje (:456–461). Isso não comprova a data de entrada daquele aluno. Coordenar task3 para marcar origem estimada/pendente, sem fabricar histórico institucional.
4. **Cobertura histórica:** a leitura de matrícula (:281) não inclui datas. O algoritmo não reconstrói entradas/saídas, transferências sucessivas e intervalos fechados.
5. **Backup parcial:** o arquivo salvo (:500–519) contém documentos com máscaras das leituras; não é exportação integral do banco. Documentar restauração dos campos alterados, arquivar plano/diff por ID e definir retenção/local adequado antes de aplicar.
6. **Concorrência:** chamadas POST/PATCH não têm transação conjunta e o PATCH não usa precondição de versão (:220–253). Testar reexecução após falha parcial e conflito com alterações simultâneas; usar janela controlada/precondições se necessário.
7. **Identidade da sessão:** normalizar `turma_id` no documento não altera o ID da sessão (:546–548), enquanto o cliente carrega por ID determinístico em attendanceService.ts:77. Verificar sessões antigas com ID contendo turma legada, para que não fiquem invisíveis e não sejam duplicadas.
8. **Vínculos adicionais:** script não normaliza `turma_oficinas` ou `aluno_oficinas`. Verificar referências desses documentos no conjunto fictício e definir migração complementar se realmente necessário.
9. **Dados ambíguos:** nomes/códigos equivalentes e duas matrículas ativas precisam gerar relatório de conflitos; não escolher silenciosamente o primeiro registro como evidência de consistência.
10. **Paginação:** fixture de mais de 300 documentos confirma que todos são lidos; não depender só de cenário pequeno.

## Sequência de execução

### 1. Consolidar inventário versionado

- Revisar todos os arquivos de `src/services`, chamadas diretas em componentes e scripts de manutenção.
- Associar IDs Qxx a telas/fluxos e papéis que executam cada leitura.
- Registrar também filtros locais; distinguir custo/volume de ausência de índice.
- Identificar consultas limitadas a 50 registros que podem produzir visão incompleta; Q08 não deve alimentar um relatório histórico completo por acidente.
- Receber dos agentes 1–3 as consultas finais e atualizar esta tabela após a integração.

### 2. Fechar estratégias antes de editar índices

- Manter consultas simples quando atendem ao volume e à matriz aprovada.
- Aplicar filtros no servidor quando necessários para segurança ou escala; não baixar coleção proibida e filtrar depois.
- Não “resolver índice ausente” removendo filtros e baixando tudo se isso comprometer acesso, desempenho ou completude.
- Consolidar assinaturas equivalentes apenas quando houver benefício, sem ampliar escopo desnecessariamente.
- Tornar erros de índices/permissão visíveis; callbacks que devolvem lista vazia ou dados locais não podem representar sucesso da validação.

### 3. Preparar testes locais e executor de homologação

- Criar manifesto das consultas e fixture determinística, com IDs exclusivos da execução e valores fictícios.
- Preparar executor usando as mesmas funções/fábricas de queries usadas pela aplicação, evitando testar uma consulta parecida que diverge da real.
- Validar filtros, fronteiras, ordenação, empates, páginas, resultados vazios e completos.
- No Emulator, verificar formato das queries e compatibilidade com regras; validação de índice remoto continua separada.
- Não reutilizar um script administrativo para afirmar cobertura da matriz de acesso do cliente.

### 4. Comparar estado local e remoto

Confirmar projeto homologado, banco `(default)` ou outro explicitamente configurado, edição e versão do CLI. Guardar listagem dos índices remotos antes de qualquer alteração. Documentar diferenças de direção, escopo e exceções de índice simples. O comando abaixo é exemplo operacional futuro, não foi executado nesta auditoria:

```bash
rtk proxy npx firebase-tools --version
rtk proxy npx firebase-tools firestore:indexes --project ID_HOMOLOGACAO
```

Fixar versão de `firebase-tools` no processo de implementação/CI para reprodutibilidade. A referência de [gerenciamento de índices](https://firebase.google.com/docs/firestore/query-data/indexing) documenta manutenção pelo CLI e acompanhamento da criação.

### 5. Aplicar e aguardar índices

Depois de revisar o diff e associar cada composto à consulta efetiva, executar no ambiente de homologação identificado:

```bash
rtk proxy npx firebase-tools deploy --only firestore:indexes --project ID_HOMOLOGACAO
```

Não confundir esse deploy com publicação de regras/Storage. Antes de concordar com eventual remoção sugerida pelo CLI, conferir a classificação dos índices remotos não presentes no JSON. Aguardar estado pronto no console; deploy aceito não significa construção concluída. Fonte: [índices Firestore no repositório oficial Firebase](https://github.com/firebase/agent-skills/blob/main/skills/firebase-firestore/references/standard/indexes.md) e [gerenciamento de índices](https://firebase.google.com/docs/firestore/query-data/indexing).

### 6. Homologar e registrar provas

- Executar cada Qxx e cada variação nova com usuário autorizado e consulta servida pelo servidor; desconsiderar cache como prova de disponibilidade remota.
- Confirmar IDs esperados, contagem, ordenação, paginação e inclusividade do período.
- Repetir com papéis previstos; classificar `permission-denied`, `failed-precondition`/índice, dado inválido e rede separadamente.
- Se aparecer “requires an index”, guardar consulta exata e definição sugerida, revisar a necessidade, incorporar ao JSON e repetir após o índice ficar pronto.
- Validar os fluxos na aplicação após logout/login, incluindo responsáveis/contatos, pedagógico e prestação.
- Limpar somente fixtures identificadas por manifesto da execução; não executar reset global.

## Evidências e critérios de aceite

O registro da homologação deve conter: revisão do código, projeto/banco, data/hora, versão CLI/SDK, usuário/papel de teste, ID Qxx, parâmetros sem dados pessoais reais, IDs esperados/obtidos, índice/estado quando aplicável, resultado e erro sanitizado. Não registrar tokens nem conteúdo de `.env`.

Aceite desta tarefa:

- Todas as consultas dos fluxos aceitos têm entrada no inventário, incluindo leituras diretas e subcoleções.
- Todas as variantes implementadas nas tarefas 1–3 foram auditadas após integração; telas locais não contam como consulta homologada.
- Índices locais e remotos foram comparados; diferenças restantes têm justificativa documentada.
- Todas as consultas autorizadas funcionam em homologação, sem erro de índice e com resultados corretos.
- Restrições de papel têm os resultados esperados e estão cobertas pela suíte da tarefa 4.
- Migração foi simulada com dados fictícios e provou paginação, reexecução, conflitos, referências e qualidade das datas, antes de qualquer aplicação necessária.
- Documento de deploy e evidências permanece no projeto; não afirmar “índices publicados” sem identificar a revisão e o ambiente.

## Divisão de propriedade e o que não refazer

O subagente 5 cuida de `firestore.indexes.json`, inventário, executor de homologação e ajustes aprovados do script de migração. Agentes 1–3 são donos de seus serviços; o agente 5 entrega diagnósticos/contratos e combina alterações nesses arquivos. Agente 4 é dono das regras e suíte de permissões. Integrador coordena `package.json`, lockfile e configuração Firebase.

Não é necessário criar compostos para todas as consultas simples, reconstruir a paginação da migração, transformar tudo em `collectionGroup`, implementar evolução fora do escopo ou remover os 13 índices indiscriminadamente. O essencial é ligar consulta real, acesso permitido, índice necessário e prova no ambiente homologado.

Os 24 testes e o build aprovados na auditoria geral são linha de base. Nenhum deles prova ausência de erro de índice no Firebase de homologação. Este card permanece **parcial, com validação remota pendente**.
