# Planos de execução paralela — tarefas 1 a 5

Auditoria local em 10/11/2026. Este documento organiza a implementação futura; nesta etapa foram produzidos planos, sem alteração do código funcional, das regras ou dos índices e sem deploy. Os documentos descrevem evidências locais, não comprovam o estado publicado no Firebase.

## Planos por subagente

1. [Múltiplos responsáveis e histórico de contatos](plano-task-1-responsaveis.md).
2. [Relatórios pedagógicos por tipo e período](plano-task-2-relatorios-pedagogicos.md).
3. [Prestação de contas, frequência e fotos](plano-task-3-prestacao-contas.md).
4. [Autorização Firestore e matriz de acesso](plano-task-4-regras-firestore.md).
5. [Auditoria de consultas, índices e homologação](plano-task-5-consultas-indices.md).

Cada plano deve distinguir funcionalidade existente, lacunas verificadas, decisões institucionais, sequência de implementação e provas de aceite. Reutilizar algo não equivale a declarar a tarefa concluída.

## Situação verificada antes da implementação

| Tarefa | Existe e deve ser aproveitado | Lacuna central |
| --- | --- | --- |
| 1 | Modelagem de responsáveis em subcoleção e criação de um responsável no cadastro | Interface singular, edição desconectada da subcoleção e ocorrência sem responsável contatado |
| 2 | Requisitos, modelagem, seed, regras e índice de relatórios | Formulário pedagógico local, conclusão sem gravação e ausência do serviço e tipo citados no card |
| 3 | Seleção de frequência/fotos, consolidação, prévia, PDF, impressão, documentação e testes | Matrículas históricas, autorização de imagens, semântica dos totais e rastreabilidade |
| 4 | Regras explícitas por coleção e negação padrão | Usuário altera o próprio papel/ativo; perfil ausente ou erro pode virar direção; falta suíte de regras |
| 5 | Arquivo com 13 índices compostos e consultas existentes inspecionáveis | Falta inventário verificável e evidência de execução em homologação; novas consultas ainda serão definidas |

## Distribuição de propriedade dos arquivos

| Subagente de implementação | Arquivos sob sua responsabilidade | Interfaces a combinar |
| --- | --- | --- |
| 1 — responsáveis | Cadastro/perfil de aluno, tipos de aluno, studentsService, frequência e attendanceService | Entregar componente/área de responsáveis no perfil; receber componente de histórico do agente 2; informar campos/queries aos agentes 4 e 5 |
| 2 — pedagógico | App.tsx no fluxo pedagógico, serviço/tipos novos, RelatoriosScreen e componentes pedagógicos | Evitar editar DetalheAluno simultaneamente: entregar componente de histórico e callback com alunoId para o agente 1 integrar |
| 3 — prestação | PrestacaoContas, preview, serviço, builder, PDF, impressão, tipos e documentação da prestação | Combinar alterações de matrículas em studentsService com agente 1; combinar resolução de nomes de profissionais com agente 4 |
| 4 — autorização | firestore.rules, testes de segurança, matriz documentada e ajustes de autenticação/usuários necessários | Alinhar contratos e consultas antes de fechar regras; coordenar storage.rules dos anexos/fotos com agentes 2 e 3 |
| 5 — consultas | firestore.indexes.json, inventário, verificações de homologação e auditoria da migração | Receber consultas finais dos agentes 1–3 e restrições do agente 4; evitar modificar serviços dos demais sem combinar |

Não compartilhar edição simultânea de `package.json`, lockfile, `firebase.json` ou arquivos de configuração de testes. O integrador aplica as alterações combinadas nesses arquivos. A divisão acima vale para a implementação futura; os cinco planos foram auditados separadamente.

## Ordem de execução que permite paralelismo

### Etapa 0 — contratos e decisões

1. Registrar matriz de acesso proposta e o que já possui aprovação institucional; distinguir ausência de evidência de aprovação de uma decisão técnica.
2. Definir regra de responsável principal, tipos/campos pedagógicos, tratamento de faltas justificadas, unidade de frequência e política de imagens. Os planos individuais detalham as perguntas.
3. Fixar contratos de responsáveis, snapshot do contato, relatório/anexos, vigência da matrícula e rastreabilidade dos totais. Declarar os campos novos antes de implementar regras e índices.
4. Identificar explicitamente projeto/bucket de homologação. O fallback `fundacao-toque-dev` em `src/lib/firebase.ts` não comprova que esse seja o ambiente aprovado. A ausência de `.firebaserc` também não comprova ausência de credenciais.

Essas decisões não impedem auditoria, extração de lógica existente, preparação de testes e componentes ou implementação de contratos já confirmados. O aceite institucional fica pendente até existir registro da decisão.

### Etapa 1 — trabalho simultâneo

- Agente 1 implementa coleção de responsáveis, edição e snapshot de contatos.
- Agente 2 implementa persistência pedagógica, rascunhos, conclusão confirmada e anexos.
- Agente 3 corrige consolidação histórica, fotos e resultados compartilhados entre saídas.
- Agente 4 prepara suíte de Emulator, corrige escalada de privilégio e aplica contratos acordados à matriz.
- Agente 5 inventaria consultas atuais, audita migração e prepara o executor de consultas fictícias.

O limite desta sessão é de quatro agentes ativos incluindo o integrador: a auditoria dos cinco planos ocorre em duas ondas, com até três subagentes simultâneos. Para implementar com o mesmo limite, manter 1–3 simultâneos enquanto o integrador acompanha segurança/consultas, e depois liberar vagas para 4–5; alternativamente antecipar 4 pela gravidade da falha de papéis. Cinco frentes lógicas não significam cinco processos simultâneos disponíveis.

### Etapa 2 — integração

1. Integrar o histórico pedagógico no perfil junto dos responsáveis, sem duplicar estado ou usar `student.reports` como substituto da coleção persistida.
2. Integrar vigência de matrículas e leitura de nomes de profissionais sem reabrir a leitura indiscriminada de `usuarios`.
3. Atualizar inventário e índices para as consultas efetivamente implementadas, incluindo variações de filtros e ordenação.
4. Executar testes de regras com os mesmos caminhos e formatos escritos pelos serviços. Regras não filtram resultados: consulta e autorização precisam ser compatíveis.
5. Validar anexos nos dois níveis: metadados Firestore e arquivo Storage. Persistir metadados sem acesso ao arquivo não atende ao aceite.

### Etapa 3 — homologação e entrega

1. Executar testes locais e build com todas as mudanças integradas.
2. Aplicar regras/índices no projeto explicitamente identificado; aguardar os índices ficarem prontos.
3. Rodar consultas e fluxos com contas de cada papel e dados fictícios, guardar evidências e limpar somente os dados identificados como pertencentes ao teste.
4. Repetir os fluxos após logout/login. Cobrir responsável alterado/inativado, relatório reaberto e anexos recuperados.
5. Registrar revisão implantada, projeto, data, responsável pela validação, decisões institucionais, resultados e limitações restantes.

## Contratos que exigem coordenação

- **Responsáveis:** decidir a fonte canônica do principal e como manter unicidade sob gravações concorrentes; não confiar apenas no botão da interface. Contatos guardam ID e snapshot dos dados utilizados no momento.
- **Pedagógico:** `responsável` pelo relatório é o profissional autor/responsável, distinto do responsável familiar do aluno. Distinguir essas referências nos tipos e na interface.
- **Histórico:** não inventar vigência passada a partir de status atual. Dados legados sem datas devem ter política explícita e sinalização de cobertura incompleta.
- **Papéis:** não presumir que a documentação disponível representa matriz aprovada. Cada concessão nova deve ser rastreável à decisão correspondente.
- **Índices:** um índice existente na modelagem não prova que a consulta está implementada; Emulator e teste unitário também não comprovam disponibilidade de índice no Firestore remoto.
- **Erros:** operações de gravação devem rejeitar falhas e impedir confirmação visual falsa; não reutilizar silenciosamente cache/localStorage como prova de persistência.
- **Privacidade e anexos:** combinar autorização de metadados e arquivos, inclusive após alterações de responsáveis, autorizações de imagem e status dos usuários.

## Verificações realizadas nesta auditoria

- `rtk npm test`: **24 testes passaram**, distribuídos em dois arquivos de prestação de contas.
- `rtk npm run build`: **passou**. Há aviso de bundle acima de 500 kB; otimização do bundle é trabalho separado e não comprova os requisitos de negócio.
- Não foram executados testes de regras no Emulator, consultas remotas, migração, deploy ou validação com a Fundação nesta etapa.
- Havia arquivos não rastreados de mostra de trabalhos antes da auditoria. Eles devem ser preservados; não fazem parte destas tarefas.

## Critério de encerramento conjunto

Só encerrar os cinco cards quando cada plano tiver seus critérios técnicos satisfeitos e as decisões institucionais aplicáveis registradas. Os testes existentes e o build verde são uma linha de base: não cobrem responsáveis múltiplos, persistência pedagógica, matriz de autorização nem funcionamento dos índices em homologação.

### Cenário integrado mínimo

1. Criar aluno fictício com dois responsáveis, selecionar o principal e confirmar os dois documentos no Firestore.
2. Matricular em A, encerrar o vínculo e transferir para B com datas conhecidas; registrar chamadas antes e depois da transferência.
3. Registrar contato por falta com o responsável secundário. Alterar e depois inativar esse responsável; conferir que o contato antigo preserva destinatário e dados usados.
4. Criar rascunho pedagógico para o aluno, anexar arquivo permitido, sair/entrar, retomar e concluir. Simular uma negação de gravação e verificar que não surge conclusão falsa.
5. Gerar prestação por período anterior, posterior e cruzando a transferência. Conferir contribuição de cada sessão e política de fotos nos três formatos.
6. Repetir operações relevantes com Direção, Pedagogia, Administrativo, conta inativa e SDK sem autenticação. Registrar concessões e negações esperadas conforme matriz aprovada.
7. Executar cada variação de consulta no Firestore de homologação, com índices prontos. Guardar resultados associados à revisão testada.

### Registro de decisões e evidências

Usar uma linha por decisão e não preencher aprovador ou resultado antes da validação:

| ID | Questão | Proposta técnica | Decisão institucional | Aprovador/data | Tarefas afetadas | Teste/evidência |
| --- | --- | --- | --- | --- | --- | --- |
| D01 | Principal obrigatório e substituição | Referência canônica e operação atômica | Pendente | Pendente | 1, 4 | Concorrência e inativação |
| D02 | Campos, tipos e períodos pedagógicos | Reutilizar modelagem e RF02/RF09 | Pendente | Pendente | 2, 4, 5 | Ciclo completo por tipo |
| D03 | Justificadas e unidade de frequência | Tornar regra explícita e centralizada | Pendente | Pendente | 3 | Reconciliação manual por sessão |
| D04 | Fotos e autorização desconhecida/revogada | Filtrar antes de carregar/exportar conforme política | Pendente | Pendente | 3, 4 | Omitidas, restritas e indisponíveis |
| D05 | Matriz de papéis e dados sensíveis | Menor acesso necessário e testes por permissão | Pendente | Pendente | 1–5 | Suite Emulator e SDK |
| D06 | Legado sem vigência | Não inventar histórico; sinalizar limites | Pendente | Pendente | 1, 3, 5 | Migração idempotente e relatório histórico |

Cada entrega de subagente deve informar: arquivos alterados; contratos adicionados; migração necessária; testes executados e resultado; pendências institucionais; consultas novas/alteradas; evidências locais e remotas separadas. O integrador encerra os cards com base nessas evidências, não apenas na aparência da interface.
