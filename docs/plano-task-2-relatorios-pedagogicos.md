# Plano 2 — Relatórios pedagógicos por tipo e período

## Escopo e diagnóstico

**Atualização da implementação:** o projeto não usa Firebase Storage. Anexos pedagógicos são persistidos no Firestore em partes; referências a Storage neste plano registram somente o diagnóstico inicial e foram substituídas por regras para metadados e chunks do Firestore.

Auditoria realizada em 10/11/2026 para planejar a implementação, sem mudanças de código e sem gravações no Firebase. A modelagem existe, mas o fluxo pedagógico continua essencialmente demonstrativo. Persistência, retomada de rascunho e consulta após novo login não podem ser consideradas entregues.

Os documentos de apresentação não rastreados encontrados no Git devem ser preservados. Não foi encontrado AGENTS.md adicional no projeto nem nos ancestrais verificados. A auditoria seguiu `/home/luizgmo/.codex/RTK.md`.

Este plano integra [o plano de execução paralela](planos-execucao-paralela.md).

## O que já existe e deve ser aproveitado

Referências de linhas correspondem ao estado auditado e podem mudar após implementação.

| Parte | Evidência | Situação |
| --- | --- | --- |
| Requisitos de registro e consulta individual | `prototipo/Documento_de_Requisitos_Fundacao_Toque.md:45` | RF02 existe, mas campos ainda são sugestões a confirmar. |
| Periodicidades diária, semestral e anual | `prototipo/Documento_de_Requisitos_Fundacao_Toque.md:62` | Previstas em RF09; aprovação operacional de regras e campos não está demonstrada. |
| Documento persistido | `modelagem.md:314` | Contempla aluno, tipo, período, evolução, dificuldades, avanços, encaminhamentos, usuário responsável, modelo/versão/respostas, status e timestamps. |
| Modelo versionado de avaliação | `modelagem.md:288`; `docs/estrutura-arquitetura-bd.md:263` | Estratégia documentada; não é necessário inventar outra coleção. |
| Modelo e relatório fictícios no seed | `scripts/seed-firestore.mjs:336` e `:351` | Úteis como fixtures; não comprovam funcionamento da aplicação. |
| Campos visuais e três tipos | `src/App.tsx:481` até `:764` | Layout reaproveitável. |
| Abas prestação de contas/pedagógico | `src/features/relatorios/RelatoriosScreen.tsx:14` e `:21` | Estrutura de navegação existente. |
| Upload e leitura de anexos reutilizáveis | `src/services/activitiesService.ts:110` e `:131` | Aceitam parentPath, inclusive `relatorios_pedagogicos/{id}/anexos`. |
| Caminho Storage dos relatórios | `storage.rules:33` | Existe, com limite abaixo de 10 MB; autorização e MIME precisam revisão. |
| Índice pedagógico | `firestore.indexes.json:52` | Cobre aluno_id, tipo_relatorio e periodo_fim DESC; cobertura das novas consultas ainda precisa de auditoria. |

## Lacunas comprovadas

1. `src/services/relatoriosService.ts` e `src/types/relatoriosPedagogicos.ts`, citados na tarefa, não existem. `src/types/relatorios.ts:1` é da prestação de contas.
2. O formulário usa aluno, profissional, datas e textos fixos em `src/App.tsx:494`.
3. saveDraft apenas altera estado e mensagem local em `src/App.tsx:529`.
4. finishReport define Concluído sem gravação em `src/App.tsx:540`.
5. A página já começa afirmando salvamento automático às 14:18, sem salvamento: `src/App.tsx:521`.
6. O seletor apresenta três alunos fictícios: `src/App.tsx:593`.
7. O resumo mantém Mariana, Turma B e primeiro semestre mesmo após alterar os campos: `src/App.tsx:637` e `:781`.
8. Datas têm apenas required; faltam validação de calendário/período, aluno existente e regras por tipo.
9. Profissional é texto livre em `src/App.tsx:629`; a modelagem exige usuario_responsavel_id.
10. O anexo guarda somente o nome do arquivo em `src/App.tsx:546`; não há upload nem vínculo persistido.
11. Histórico e downloads são estáticos e sem ações em `src/App.tsx:792`.
12. O perfil usa student.reports em `src/features/alunos/DetalheAluno.tsx:253`; `src/services/studentsService.ts:65` lê esse campo legado do documento do aluno ou retorna lista vazia, sem consultar relatorios_pedagogicos.
13. Novo relatório no perfil não transmite o aluno ao formulário: `src/App.tsx:954`.
14. Avaliação por área usa seleções fixas em `src/App.tsx:697`; o modelo provisório do seed usa textos longos em `scripts/seed-firestore.mjs:340`. Há divergência entre formulário e modelo.
15. Qualquer autenticado pode ler relatórios e criar seus metadados de anexos em `firestore.rules:119` e `:125`, mesmo se o papel não pode criar o relatório.
16. Não foram encontrados testes específicos do relatório pedagógico. Os testes existentes cobrem consolidação/PDF de prestação de contas e máscaras.

A documentação já reconhece o estágio local do formulário em `docs/plano-mostra-trabalhos.md:53`.

## Decisões pendentes da Fundação

Registrar cada decisão em tabela com data, responsável pela aprovação, decisão e impacto:

- Tipos habilitados: diário, semestral e anual; registrar qualquer exclusão.
- Campos obrigatórios para concluir e quais podem faltar em rascunho.
- Significado de data do registro: criação técnica ou data pedagógica editável.
- Diário exige início igual ao fim? Semestral segue semestre civil ou institucional? Anual exige ano civil?
- Modelo oficial de avaliação, primeira versão e tratamento dos campos de avaliação por área.
- Quem pode ser o profissional responsável; quem assina e quem redige; se podem ser pessoas diferentes.
- Quem lê, cria, edita e exclui; se relatórios concluídos podem ser reabertos e por quem.
- Anexos: formatos, tamanho, múltiplos arquivos, autorização de imagem e remoção.
- Se pode existir mais de um relatório do mesmo tipo/aluno/período.
- Se concluídos precisam preservar identificação histórica do profissional e conteúdo do formulário usado.

Até aprovação, implementar infraestrutura contra o esquema existente e identificar o modelo como provisório; não afirmar validação institucional concluída.

## Sequência de execução

### 1. Definir contratos antes da tela

- Criar `src/types/relatoriosPedagogicos.ts`.
- Tipar TipoRelatorioPedagogico, StatusRelatorioPedagogico, documento persistido, dados editáveis, resumo de histórico e metadados de anexos.
- Separar valores internos diario/semestral/anual e rascunho/concluido dos rótulos em português.
- Manter nomes Firestore conforme modelagem.md.
- Registrar decisão para observações finais, presentes somente na UI atual.
- Preservar referência e versão do modelo utilizado; não interpretar relatório antigo com o modelo ativo atual.

### 2. Criar serviço pedagógico

- Implementar criar rascunho, obter por ID, listar por aluno com paginação, atualizar rascunho, concluir e excluir conforme matriz.
- Gerar ID uma única vez e reutilizá-lo; prevenir duplicação por clique repetido.
- Gravar criado_em somente na criação e atualizado_em em cada alteração, usando timestamps do servidor.
- Persistir usuário responsável por ID; separar autor da operação se aprovado.
- Validar aluno existente no ambiente conectado, sem aceitar aluno fictício de fallback como prova de validade.
- Propagar falhas reais; permission-denied, indisponibilidade e erro de índice não podem virar salvo ou lista vazia silenciosa.
- Definir comportamento para duas pessoas editando o mesmo rascunho.
- Entregar ao subagente 5 a lista exata de consultas e ordenações.

### 3. Implementar validações compartilhadas

- Validar datas reais no formato escolhido, início menor ou igual ao fim e aluno obrigatório.
- Aplicar regras aprovadas por tipo.
- Admitir rascunho incompleto somente conforme decisão registrada.
- Exigir na conclusão todos os campos aprovados e respostas obrigatórias da versão do modelo.
- Separar erros de validação de falhas de gravação.

### 4. Extrair e conectar formulário

- Extrair PedagogicalReport de App.tsx para a feature, preservando a base visual.
- Remover valores fictícios e preencher aluno pela navegação ou seleção real.
- Resolver profissional a partir de perfil autenticado ou lista autorizada, conforme contrato do subagente 4.
- Derivar resumo dos dados efetivos.
- Suportar carregando, novo, alterado, salvando, salvo, erro e concluído persistido.
- Desabilitar submissão repetida durante gravação.
- Exibir salvo/concluído somente após confirmação da escrita no servidor; pendência offline não é conclusão confirmada.
- Preservar conteúdo em falhas e permitir nova tentativa.
- Remover falsa mensagem inicial de salvamento automático.
- Avisar sobre alterações não salvas ao sair.

### 5. Conectar anexos

- Criar relatório/rascunho primeiro para obter ID estável.
- Reutilizar uploadAnexo/getAnexosComUrl; combinar ownership caso haja extração para serviço compartilhado.
- Validar MIME e tamanho reais, alinhados às regras Storage e à UI.
- Listar metadados e abrir arquivos após recarregar ou novo login.
- Mostrar progresso/falhas individuais; permitir repetição sem duplicar anexos.
- Tratar upload concluído seguido de falha de metadados para evitar arquivos órfãos.
- Definir se conclusão aguarda uploads pendentes ou exige confirmação de descarte.
- Tratar remoção/exclusão com metadados e arquivos segundo a política aprovada.

### 6. Criar consulta e retomada

- Listar relatórios reais por aluno, tipo, período e status conforme escopo aprovado.
- Abrir rascunho pelo ID e continuar edição.
- Consultar concluído com conteúdo e anexos persistidos.
- Integrar componente próprio de histórico ao perfil; substituir dependência de student.reports.
- Transmitir alunoId ao iniciar pelo perfil.
- Não manter botões de download sem implementação. Consulta persistida atende ao histórico; exportação pedagógica só entra se confirmada no escopo.

### 7. Integrar autorização e índices

- Consumir capacidades e matriz acordadas com subagente 4.
- Alinhar autorização do relatório, subcoleção anexos e arquivo Storage.
- Verificar usuário ativo e perfil ausente; não confiar apenas no papel visual.
- Coordenar índices com subagente 5 após estabilizar consultas.

## Testes e critérios de aceite

- Para cada tipo aprovado: criar rascunho, recarregar, sair/entrar, retomar, concluir, sair/entrar e consultar o mesmo conteúdo.
- Verificar criado_em imutável e atualização posterior de atualizado_em.
- Rejeitar aluno ausente/inexistente, datas inválidas/invertidas e período incompatível com regra aprovada.
- Conclusão com campo obrigatório vazio falha; rascunho respeita permissividade aprovada.
- Simular escrita negada, rede indisponível e upload interrompido: nenhum caso produz conclusão confirmada.
- Iniciar pelo perfil correto e conferir aluno/resumo/histórico.
- Anexar imagem e PDF permitidos, consultar após novo login e sinalizar arquivo ausente sem ocultar relatório.
- Verificar que alteração do modelo não muda interpretação de relatório antigo.
- Emulator: testes positivos e negativos para ler/criar/editar/excluir relatório, metadados e arquivo por papel e para usuário inativo.
- Testar edição concorrente para impedir perda silenciosa conforme estratégia escolhida.
- Executar testes pertinentes, npm run build e lint. Homologar com Firebase Auth real, não somente modo convidado.

## Paralelismo, ownership e dependências

| Frente | Coordenação |
| --- | --- |
| Início imediato | Tipos, validações, serviço, extração da UI e casos de teste podem começar antes da aprovação final dos campos. |
| Subagente 1 | Compartilha DetalheAluno.tsx e App.tsx. Subagente 2 entrega componente de histórico e callback com alunoId; encaixe final deve ter dono acordado. |
| Subagente 3 | Compartilha RelatoriosScreen.tsx e possivelmente anexos. Preservar navegação existente e separar serviço pedagógico da consolidação de prestação de contas. |
| Subagente 4 | Dono de firestore.rules, storage.rules e matriz. Subagente 2 fornece operações, campos imutáveis e transições exigidas. |
| Subagente 5 | Dono de inventário e índices; deve receber consultas novas antes de finalizar firestore.indexes.json. |
| Validação externa | Aprovação de campos/tipos/matriz e teste de novo login/homologação não podem ser declarados feitos por inspeção local. |

## O que não precisa ser refeito

Não é necessário remodelar coleções, recriar o mecanismo básico de upload ou reconstruir as abas existentes. O principal é transformar o formulário demonstrativo em fluxo persistido, consultável e autorizado. O seed e a existência de regras/índices são bases úteis, mas não substituem validação funcional e testes de acesso.
