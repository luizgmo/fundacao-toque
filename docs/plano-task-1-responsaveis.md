# Plano 1 — múltiplos responsáveis e histórico de contatos

Auditoria de código realizada em 10/11/2026. Este documento planeja a implementação; não declara os fluxos homologados nem decisões institucionais aprovadas. Coordenação: [planos de execução paralela](planos-execucao-paralela.md).

## Diagnóstico

**Parcialmente implementado.** A estrutura 1:N já existe, mas cadastro, edição, perfil e contatos ainda usam um responsável singular. Não é necessário criar outra coleção raiz.

Nenhum código ou dado foi alterado na auditoria. O estado inicial do Git continha documentos não rastreados da Mostra, que devem ser preservados. Foram seguidas as instruções fornecidas e `/home/luizgmo/.codex/RTK.md`.

## O que já existe e deve ser aproveitado

Referências abaixo são relativas à raiz do repositório e correspondem ao código auditado.

| Item | Evidência | Avaliação |
| --- | --- | --- |
| Modelagem 1:N | `modelagem.md:106`, `modelagem.md:119` | Caminho `alunos/{alunoId}/responsaveis/{responsavelId}` já previsto. |
| Campos do responsável | `modelagem.md:109` | Nome, parentesco, telefone, alternativo, e-mail, principal e auditoria definidos. |
| Destinatário do contato | `modelagem.md:367` | `responsavel_id` previsto como opcional, ainda sem uso no serviço. |
| Criação da subcoleção | `src/services/studentsService.ts:285` | Cadastro tenta criar um responsável, com `principal: true`. |
| Contato persistido | `src/services/attendanceService.ts:123`, `:150` | Gravação em `contatos_familia` e assinatura por aluno existentes. |
| Histórico no perfil | `src/features/alunos/DetalheAluno.tsx:56`, `:337` | Consulta Firestore e linha do tempo existentes. |
| Índice do histórico | `firestore.indexes.json:77` | `aluno_id ASC + contatado_em DESC` já previsto. |
| Dados fictícios | `scripts/seed-firestore.mjs:234` | Dois responsáveis, cada um de um aluno diferente, com auditoria. Ampliar. |

## Lacunas e defeitos encontrados

1. **Cadastro singular:** `src/features/alunos/CadastrarAluno.tsx:71`, `:235`, `:299` e `:532` mantêm um bloco, sem adicionar/remover ou escolher principal.
2. **Tipo singular:** `src/features/alunos/students-data.ts:31` contém apenas nome, parentesco, telefone e e-mail singulares; faltam coleção tipada e identificação do principal.
3. **Leitura ignora a subcoleção:** `src/services/studentsService.ts:17` e `:144` leem campos duplicados em `alunos`. Responsáveis inseridos na subcoleção não aparecem.
4. **Edição diverge fontes:** `src/services/studentsService.ts:367` atualiza campos do aluno, mas não o responsável criado em `:285`.
5. **Reabertura perde campos:** `src/features/alunos/CadastrarAluno.tsx:138` inicializa CPF/RG vazios e `:141` telefone secundário vazio. O payload pode apagar valores anteriores. Carregar alternativo e preservar dados adicionais existentes.
6. **Perfil singular:** `src/features/alunos/DetalheAluno.tsx:184` mostra um responsável, sem distintivo de principal ou telefone alternativo.
7. **Contato sem destinatário:** `src/features/frequencia/Frequencia.tsx:278` envia aluno e profissional autor; `:867` mostra o responsável singular sem seletor.
8. **Pessoas diferentes no contrato:** `SaveOccurrenceInput`, em `src/services/attendanceService.ts:111`, usa `responsible` como `usuario_responsavel`. Separar o profissional autor (`usuario_responsavel_id`) do familiar (`responsavel_id`).
9. **Sem snapshot histórico:** `src/services/attendanceService.ts:127` não grava nome, parentesco ou dado utilizado do familiar naquele momento. Referência isolada não preserva histórico.
10. **Confirmação falsa:** `src/services/studentsService.ts:311`, `:383` e `src/services/attendanceService.ts:142` capturam falhas e retornam sucesso. `src/features/frequencia/Frequencia.tsx:302` confirma gravação Firestore mesmo quando negada.
11. **Criação parcial:** `src/services/studentsService.ts:284` grava aluno, responsável e ficha médica separadamente. Uma falha intermediária deixa cadastro parcial. Administrativo pode criar aluno/responsável, mas a regra atual de ficha médica só permite escrita à Direção (`firestore.rules:53`); coordenar com tarefa 4.
12. **Integridade não validada no banco:** `firestore.rules:58` controla papel, mas não formato, auditoria, principal ou histórico imutável. Estado ativo do familiar não está definido.
13. **Histórico pode ficar antigo:** `src/features/alunos/DetalheAluno.tsx:57` só aplica listas não vazias. Corrigir resultados vazios e limpeza ao trocar aluno.
14. **Testes insuficientes:** existem Vitest e testes de relatório/PDF/máscaras; não foram localizados testes específicos de responsáveis ou contatos.

## Decisões a registrar com a Fundação

**Decisão recebida do usuário em 10/11/2026:** todo aluno deve ter exatamente um responsável principal ativo; inativar o principal exige escolher substituto na mesma operação. Implementar e validar essa regra. Isso aprova a regra de negócio, mas não torna a prevenção concorrente entre clientes verdadeira automaticamente.

- Definir se todo aluno exige exatamente um principal ativo ou se zero é permitido em situações específicas. A tarefa condiciona a obrigatoriedade à regra institucional; não foi encontrada configuração implementada.
- Definir se principal significa prioridade de contato, responsabilidade legal ou ambos.
- Definir se inativar principal exige substituição na mesma operação.
- Definir exclusão definitiva versus inativação. Recomendação técnica: inativar registros persistidos e permitir remover linhas novas ainda não salvas.
- Aprovar quem consulta, cadastra, edita e inativa familiares na matriz da tarefa 4.
- Definir se ocorrência/tentativa sem contato efetivo pode ser salva sem destinatário. Diferenciar do contato realizado.
- Definir registro do canal e valor efetivamente usado: telefone principal, alternativo ou e-mail.
- Para contatos legados sem familiar identificado, apresentar “Responsável não identificado no registro original”, sem atribuir o principal atual retroativamente.

Esses pontos são pendências de validação, não aprovações obtidas pela auditoria.

## Execução pelo subagente 1

### 1. Fixar contrato com responsáveis pelas tarefas 4 e 5

- Criar `Responsavel`/`ResponsavelInput`: ID, nome, parentesco, telefone, alternativo, e-mail, principal, ativo e auditoria.
- Estender modelagem com estado ativo e metadados de inativação, conforme decisão aprovada.
- Fonte canônica implementada como `responsavel_principal_id` no aluno, mantida no mesmo batch dos indicadores da subcoleção.
- As regras da tarefa 4 validam com `getAfter` que a referência aponta para responsável ativo e principal; cada documento de responsável precisa concordar com o ID canônico. Manter os testes de troca concorrente na suíte Emulator.

### 2. Implementar serviço de responsáveis

- Listar/assinar, criar, editar, inativar e trocar principal.
- Utilizar IDs estáveis e operações idempotentes.
- Usar transação/batch para troca de principal e sincronização das projeções necessárias.
- Preencher criação/atualização e respectivos autores; preservar auditoria de criação.
- Propagar falhas para UI. Se cache local for mantido, distinguir pendência de persistência confirmada.

### 3. Compatibilizar legado

- Ler primeiro a subcoleção como fonte dos responsáveis.
- Adaptar cadastros que só possuem campos singulares e preparar migração controlada/idempotente.
- Inventariar divergências entre campos antigos e subcoleção; não criar pessoas duplicadas automaticamente.
- Não atribuir destinatário a contatos históricos por inferência do principal atual.
- Enquanto telas dependem de campos singulares de `Student`, derivá-los do principal; não manter duas fontes editáveis.
- Preparar simulação, relatório de conflitos e reexecução segura da migração.

### 4. Completar cadastro e edição

- Trocar estado singular por lista com IDs estáveis.
- Adicionar incluir, editar, remover linha nova e inativar persistido.
- Selecionar principal por rádio exclusivo.
- Impedir inativação do principal obrigatório sem substituição.
- Validar campos de cada pessoa e principal conforme política institucional.
- Carregar telefone alternativo; preservar CPF/RG/endereço existentes se não forem editados neste escopo.
- Atualizar revisão do wizard para listar todos e destacar o principal.
- Finalizar somente após gravação confirmada.

### 5. Completar perfil

- Assinar subcoleção por aluno e encerrar assinatura na troca/desmontagem.
- Listar ativos e disponibilizar consulta de inativos conforme regra aprovada.
- Identificar “Principal” com texto acessível além de cor.
- Exibir nome, parentesco, telefone, alternativo e e-mail.
- Tratar carregamento, vazio, erro e ausência de principal com dados reais.

### 6. Completar contato por falta

- Carregar familiares elegíveis no modal e oferecer seletor de destinatário.
- Pré-selecionar principal como conveniência visível, permitindo troca.
- Separar ID do profissional autor de ID do familiar contatado.
- Persistir `responsavel_id` e snapshot de nome, parentesco e canal/valor utilizado; somente dados necessários ao histórico.
- Guardar instante canônico e faltas em `YYYY-MM-DD`; formatar na apresentação.
- Validar que destinatário pertence ao aluno e está elegível no momento da gravação.
- Só adicionar contato confirmado ao histórico após sucesso Firestore.
- Exibir snapshot histórico mesmo após edição/inativação do familiar.
- Incluir ID persistido em `ContactEntry` para chaves e deduplicação.
- Ordenar por `contatado_em DESC`, reutilizando índice existente.
- Corrigir lista vazia e limpeza de estado ao trocar aluno.

### 7. Documentar e integrar

- Atualizar modelagem e instruções do fluxo.
- Enviar schemas, auditoria e invariantes ao subagente 4, responsável pelas regras e suíte de autorização.
- Enviar consultas finais ao subagente 5; evitar índices especulativos antes de fechar filtros/ordenações.
- Ampliar fixtures com três familiares no mesmo aluno, um inativo e contatos com snapshots.
- Não executar seed/reset contra ambiente real como forma de validação.

## Testes e critérios de aceite

1. Criar aluno com dois responsáveis; abrir nova sessão autenticada e confirmar ambos persistidos.
2. Editar nome, telefones e e-mail de um; reabrir e verificar valores sem alterar outro.
3. Adicionar terceiro e trocar principal; confirmar exatamente um principal ativo quando exigido.
4. Disputar duas trocas de principal concorrentes; preservar integridade.
5. Inativar secundário; não oferecê-lo em novos contatos, mantendo registros anteriores.
6. Impedir inativação/remoção de principal obrigatório sem substituição e sem gravação parcial.
7. Testar política aprovada para aluno sem principal quando permitido.
8. Registrar contato com familiar secundário; verificar ID familiar, snapshot e ID do profissional no documento.
9. Alterar o familiar e consultar contato anterior; manter nome/dado de contato histórico.
10. Exibir desconhecimento explícito em contato legado sem destinatário.
11. Negar gravação no Emulator; manter formulário, mostrar erro e não confirmar sucesso.
12. Testar via SDK papéis permitidos/proibidos, usuário inativo e não autenticado; suíte da tarefa 4.
13. Validar consulta ordenada e índice em homologação; evidência da tarefa 5.
14. Executar `rtk npm test` e `rtk npm run build` após implementação, além das verificações de integração necessárias.

## Trabalho que não precisa ser refeito

Não criar outra coleção raiz; não reconstruir modal e linha do tempo do zero; não duplicar o índice de contatos; não apagar campos legados antes da compatibilização. Evoluir estrutura e componentes existentes.

## Limites da auditoria

Foram inspecionados código, modelagem, regras, índices e fixtures. Não foram executadas gravações, suíte Emulator ou consultas em homologação nesta subtarefa. Presença de arquivos não comprova comportamento em produção ou índices publicados.
