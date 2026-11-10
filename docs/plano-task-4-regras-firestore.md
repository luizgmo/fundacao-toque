# Plano 4 — corrigir autorização Firestore e comprovar a matriz

Auditoria local em 10/11/2026. Nenhuma regra, código funcional, dado remoto ou deploy foi alterado nesta etapa. Este plano não representa aprovação institucional da matriz e não comprova quais regras estão publicadas atualmente.

**Atualização da implementação:** não existe uso de Firebase Storage no projeto. As regras de anexos e conteúdo binário ficam integralmente em `firestore.rules`, com conteúdo dividido em chunks Firestore.

## Diagnóstico

**A tarefa precisa ser executada.** A negação padrão e a divisão por coleções já existem, mas há escalada de privilégio pelo próprio usuário, ausência de bloqueio por `ativo`, acesso excessivo por autenticação simples e divergências entre regras, documentação e serviços. Não há suíte automatizada de Security Rules localizada no repositório.

Prioridade de execução: corrigir primeiro o ciclo de criação/carregamento de perfis e a integridade de `usuarios`. Sem isso, a separação por papel das demais coleções pode ser contornada.

## O que existe e deve ser reaproveitado

| Item | Evidência local | Como aproveitar |
| --- | --- | --- |
| Regras Firestore v2 com negação padrão | `firestore.rules:1–9` | Preservar a estrutura e tornar explícitas as exceções aprovadas |
| Três papéis reconhecidos | `firestore.rules:11–36`, `src/types/auth.ts` | Preservar nomes internos e validar o enum |
| Separação da ficha médica em subcoleção | `firestore.rules:51–55` | Preservar fronteira sensível, eliminando duplicações que a contornam |
| Regras por aluno/responsável/documento | `firestore.rules:45–68` | Evoluir permissões e invariantes com a tarefa 1 |
| Regras das coleções operacionais e pedagógicas | `firestore.rules:70–153` | Revisar operação por operação; não substituir por um `allow` genérico |
| Storage com negação padrão e caminhos de anexos | `storage.rules:6–37` | Coordenar com metadados Firestore; não presumir que a proteção de um cobre o outro |
| Tabela de acesso existente | `docs/estrutura-arquitetura-bd.md:342–360` | Usar como ponto de comparação, não como aprovação comprovada |
| Atores definidos nos requisitos | `prototipo/Documento_de_Requisitos_Fundacao_Toque.md:28–36` | Base para levar conflitos e limites à Fundação |
| Gestão de autores usando Auth secundário | `src/features/auth/AuthContext.tsx:201–222` | Preservar a sessão de quem cria a conta; restringir a criação do perfil no banco |

## Lacunas verificadas e implicações

1. **Escalada de privilégio por SDK.** `firestore.rules:41–42` permite ao autenticado criar, atualizar e excluir seu próprio documento sem limitar campos. Pode definir `papel: direcao`, reativar-se ou apagar/recriar o perfil. Bloquear apenas a edição da tela não resolve.
2. **Bootstrap público de Direção.** `AuthContext.tsx:176–196` cria conta e grava perfil Direção. O formulário de primeiro acesso está exposto em `LoginScreen.tsx:63–96`. O código não limita o bootstrap a uma única conta ou a um convite confiável. Fechar a regra de criação própria exige substituir esse caminho por provisionamento confiável; esconder a aba não basta.
3. **Perfil ausente/erro concede Direção na UI.** `AuthContext.tsx:86` usa Direção como fallback; `:89–106` cria perfil Direção quando não existe; `:108–116` assume Direção em erro. Deve falhar sem concessão de capacidades. Com regras corretas isso não concede acesso remoto por si só, mas continua apresentando fluxo e estado incorretos.
4. **Usuário inativo continua autorizado.** Funções em `firestore.rules:12–36` não verificam `ativo`; leituras com `isSignedIn()` nem exigem documento de usuário ou papel reconhecido. Contas sem perfil e papéis inválidos acessam várias coleções. Storage também não verifica ativo (`storage.rules:11–18`).
5. **Leitura ampla de usuários.** `firestore.rules:40` libera toda a coleção. `usuariosService.ts:12–24` assina nomes, e-mails, papéis e ativo; `prestacaoContasService.ts:182` também lê a coleção para nomes. Firestore não oculta campos individuais na leitura de um documento: para disponibilizar só nomes, separar uma projeção autorizada ou denormalizar o nome estritamente necessário.
6. **Documentação diverge do comportamento.** `docs/estrutura-arquitetura-bd.md:348` descreve escrita de usuários apenas por Direção, mas as regras permitem autoedição. A tabela também agrupa criar/atualizar/excluir e não explicita nuances de anexos e relatórios.
7. **Proteção médica contornada pela duplicação.** `studentsService.ts:253–254` grava `tipos_deficiencia` e `codigos_cid` no documento público de aluno; `:270` grava `grau_dependencia`. Embora `ficha_medica` tenha leitura restrita, o mesmo conteúdo pode ser lido em `alunos` por qualquer autenticado (`firestore.rules:47`). É necessário rever armazenamento e migrar campos sensíveis conforme matriz aprovada. Nomes de documentos médicos também podem revelar informações e precisam classificação.
8. **Cadastro administrativo produz gravação parcial.** `studentsService.ts:284–305` grava aluno, responsável e ficha médica em sequência; Administrativo não pode criar a ficha nas regras atuais. O erro é absorvido em `:311`. Decidir quem preenche a ficha e separar ou coordenar operações, sem abrir escrita médica incidentalmente para contornar o erro.
9. **Aluno pode ser alterado por qualquer autenticado.** `firestore.rules:49` não limita papel, campos ou autoria. Alteração de consentimentos, turma, indicadores e campos sensíveis não deve herdar permissão genérica.
10. **Anexos pedagógicos têm permissão mais ampla que o relatório.** `firestore.rules:121` restringe criação/edição a Direção/Pedagogia, mas `:127` aceita metadado de anexo de qualquer autenticado. `storage.rules:35` também permite upload por qualquer autenticado e não verifica MIME, apesar do comentário mencionar fotos/PDF.
11. **Anexos não verificam existência/acesso ao pai.** Regras atuais permitem caminhos sob relatório ou atividade inexistentes e não acompanham estado de conclusão do relatório. Validar pai, propriedade e ciclo de vida conforme os contratos das tarefas 2/3.
12. **Atividades/evolução são abertas a qualquer autenticado para criar/alterar.** `firestore.rules:97` e `:110`; falta confirmar participação do Administrativo, autoria, eventual atribuição a turma e campos imutáveis.
13. **Histórico pode ser reescrito sem restrição de campos.** Contatos permitem atualização a todos os três papéis (`:141`) e não preservam snapshot, autor ou aluno imutável. Regras da tarefa 1 devem proteger o registro histórico conforme política aprovada.
14. **Faltam contratos e validação de conteúdo.** Não há listas de campos, tipos, valores de status, datas, referências, auditoria ou transições válidas. O objetivo é validar invariantes relevantes, sem duplicar indiscriminadamente toda a UI nas regras.
15. **Troca de senha não exige a concessão atual.** Não localizei `updatePassword`, campo de troca obrigatória ou fluxo de troca de senha em `src`. O login/criação usa Firebase Authentication. Não manter atualização própria genérica em Firestore sob essa justificativa. Se surgir um marcador funcional, aprovar o nome/semântica e permitir somente a transição autorizada, com timestamp associado quando necessário; nunca armazenar a senha no documento.
16. **Testes de segurança ausentes.** `package.json` contém Vitest, mas não `@firebase/rules-unit-testing`, comandos de Emulator ou testes de regras. `firebase.json` aponta os arquivos, sem configuração de Emulator. Os dois testes existentes são de prestação de contas/PDF. Não localizei artefato identificável como Card 25: vinculá-lo na documentação ao criar a suíte, sem afirmar que está concluído.

## Decisões institucionais pendentes

- Confirmar matriz por operação e escopo: todos os alunos ou apenas turmas atribuídas; papel sozinho ou também autoria.
- Confirmar quem lê CID, deficiências, grau de dependência, ficha digitalizada, contatos e documentos de autorização.
- Confirmar se Pedagogia pode criar aluno, editar cadastro, turmas, oficinas e matrículas. Os atores nos requisitos e as regras atuais não são suficientes para decidir todos esses detalhes.
- Confirmar que Administrativo consulta/edita frequência e contatos e quais dados pedagógicos pode consultar.
- Confirmar edição/reabertura/exclusão de relatório concluído e conservação do histórico de contatos.
- Definir inativação versus exclusão de matrículas, responsáveis, usuários e registros usados em relatórios históricos.
- Definir campos de configuração legíveis por cada papel; segredos não devem estar em documentos legíveis pelo cliente.
- Definir quem provisiona primeira Direção e novas contas. Não atribuir essa capacidade a qualquer cadastro Auth.
- Definir eventual autopreenchimento do próprio nome e marcador de troca de senha. A necessidade não foi demonstrada no código atual.

Registrar pessoa aprovadora, data, versão e fonte de cada decisão. As medidas de impedir autoatribuição de privilégio e rejeitar perfis inativos/ausentes podem ser preparadas imediatamente; concessões de negócio não confirmadas precisam continuar identificadas como propostas.

## Matriz proposta para discussão — NÃO APROVADA

Legenda: L=ler; C=criar; U=atualizar; X=excluir; I=inativar. Todas as concessões abaixo exigem perfil existente, papel válido e `ativo == true`. Conta sem autenticação, sem perfil, papel inválido ou inativa não acessa dados operacionais. A leitura do próprio estado mínimo para explicar bloqueio pode ser uma exceção expressa, sem leitura de terceiros.

| Recurso | Direção | Pedagogia | Administrativo | Condição a fechar |
| --- | --- | --- | --- | --- |
| Próprio `usuarios/{uid}` | L; U de campos próprios aprovados | L; U somente de campos próprios aprovados | L; U somente de campos próprios aprovados | Nenhum papel se autopromove ou se reativa pela exceção de autoedição; ação administrativa separada |
| Outros usuários/perfis completos | L/C/U/I | Negado | Negado | Evitar exclusão que destrua referência de autoria; bootstrap confiável |
| Diretório mínimo de profissionais | L | L | L conforme necessidade | Projeção separada de nome/ID elegível, sem abrir perfil completo |
| Cadastro de aluno sem dados médicos | L/C/U/I | L; U pedagógico aprovado; C a confirmar | L/C/U/I cadastral | Definir campos e se exclusão física pode existir |
| Responsáveis | L/C/U/I | L para acompanhamento/contato | L/C/U/I | Principal e relacionamento com aluno coordenados com tarefa 1 |
| Documentos cadastrais | L/C/U/X conforme retenção | L apenas categorias necessárias | L/C/U/X cadastral | Separar categoria médica; conteúdo sensível não pode vazar em metadados amplos |
| Ficha e documentos médicos | L/C/U | L | Negado por padrão proposto | Escrita de terapeutas/Pedagogia e retenção ainda dependem da Fundação |
| Turmas/oficinas/turma_oficinas | L/C/U/I | L/C/U/I se aprovado | L; escrita a confirmar | Regras atuais permitem escrita a todos; não tratar proposta como aprovação |
| Matrículas | L/C/U/I | L; manutenção a confirmar | L/C/U/I | Vigência e referência histórica protegidas; exclusão a confirmar |
| Aluno-oficinas | L/C/U/I | L/C/U/I | L; escrita a confirmar | Confirmar papel administrativo |
| Atividades e anexos | L/C/U/X | L/C/U; X a confirmar | L; C/U a confirmar | Pai existente, autoria/atribuição e elegibilidade de imagem |
| Evolução | L/C/U/X | L/C/U | Negado por padrão proposto | Leitura administrativa precisa de aprovação expressa |
| Relatórios pedagógicos/anexos | L/C/U/X | L/C/U conforme status | Negado por padrão proposto | Reabertura, autoria e exclusão conforme tarefa 2 |
| Modelos pedagógicos | L/C/U; desativar/versionar | L/C/U se aprovado | Negado por padrão proposto | Versão usada em relatório não deve mudar retroativamente |
| Sessões de frequência | L/C/U | L/C/U | L/C/U | Exclusão/correções históricas a confirmar; usar status/retificação se adotado |
| Contatos familiares | L/C; retificação controlada | L/C; retificação controlada | L/C; retificação controlada | Snapshot e autor imutáveis; exclusão só se política permitir |
| Prestação/relatórios gerados | L/C/U/X | Negado por padrão proposto | Negado por padrão proposto | Nomes necessários resolvidos pelo diretório mínimo; tarefa 3 |
| Configurações | L/C/U/X | L de subconjunto aprovado | L de subconjunto aprovado | Separar documentos por audiência se necessário |

Essa matriz é deliberadamente uma proposta revisável: não aplicar restrições novas de negócio silenciosamente. A matriz definitiva deve separar `get`, `list`, `create`, `update` e `delete`, campos permitidos e escopo por recurso.

## Sequência detalhada para o subagente 4

1. **Fechar contrato e evidência de aprovação.** Transformar a tabela acima em linhas identificadas por permissão, incluindo campos, autoria, status e escopo. Relacionar cada linha aos requisitos, à decisão da Fundação e aos testes correspondentes. Registrar divergências sem escolher automaticamente a implementação mais permissiva.
2. **Preparar suíte de Emulator.** Adicionar dependências/configuração e comando próprio de testes de regras, coordenando `package.json`, lockfile e `firebase.json` com o integrador. Usar projeto de teste explícito; configurar fixtures com regras desabilitadas apenas no preparo; testar operações com SDK cliente autenticado, nunca Admin SDK como prova de autorização.
3. **Fechar `usuarios` e bootstrap em conjunto.** Permitir leitura própria e gestão aprovada pela Direção ativa. Negar criação própria arbitrária e mudanças próprias de papel/ativo. Estabelecer procedimento confiável de provisionamento inicial e recuperação. Alterar AuthContext para perfil ausente, papel inválido ou erro não conceder Direção. Tratar conta Auth criada e perfil negado como falha pendente de provisionamento, sem falso sucesso.
4. **Aplicar condição de usuário autorizado.** Criar helpers seguros para autenticação, existência, ativo e enum. Usar esses helpers em todas as permissões; decidir exceção mínima de leitura própria do inativo. Cobrir conta desativada enquanto ainda possui token Auth válido. Não depender apenas da tela de login.
5. **Reorganizar exposição mínima.** Ajustar selects/serviço de usuários e nomes históricos usados por atividades/relatórios. Se criar diretório, definir quem escreve e como sincroniza; não permitir que o próprio usuário falsifique papel/eligibilidade por outro caminho. Separar dados sensíveis do aluno e retirar duplicações após migração segura/verificada. Durante transição, documentar que a fronteira ainda está incompleta.
6. **Aplicar matriz coleção por coleção.** Separar operações de criação, atualização e exclusão. Validar campos conhecidos, tipos/status necessários, autoria, criação imutável e referência ao pai quando pertinente. Não permitir trocar aluno/pai de histórico nem sobrescrever snapshot para acompanhar o cadastro atual.
7. **Integrar contratos das tarefas 1–3.** Validar referências de responsáveis e principal com operação atômica viável; transições e modelo versionado do pedagógico; matrículas históricas e metadados de autorização de imagem. Limites de verificações entre documentos exigem desenho explícito: não declarar unicidade global do principal apenas porque cada documento tem booleano válido.
8. **Alinhar Storage.** Aplicar papéis/ativo, existência/acesso ao pai e limites/tipos aprovados. Testar leitura, upload, substituição e exclusão separadamente. Verificar efeito de URLs de download compartilháveis; não prometer revogação de acesso a um arquivo já baixado ou URL previamente concedida apenas por mudar um checkbox. Definir estratégia de acesso de acordo com política aprovada.
9. **Revisar consumidores e falhas.** Atualizar queries incompatíveis com leitura restrita, com tarefa 5. Corrigir serviços que convertem `permission-denied` em sucesso/cache confirmado, sem ampliar regras só para silenciar erro. Validar cadastro administrativo sem escrita médica não autorizada.
10. **Publicar com evidência.** Após suíte integrada, executar no projeto de homologação explicitamente indicado, conferir versão publicada e rodar cenários por papel. Registrar revisão das regras, matriz, comandos, projeto, resultado e data. Planejar reversão para versão anterior conhecida sem abrir acesso genérico.

## Cobertura automatizada exigida — Card 25

O teste deve derivar da matriz definitiva. Para cada linha/recurso, gerar casos para Direção, Pedagogia e Administrativo ativos, mais anônimo, perfil ausente, inativo e papel inválido. Executar `get`, `list`, `create`, `update` e `delete` quando aplicáveis, com fixtures válidas para impedir que uma negação causada por dado malformado mascare concessão indevida de papel.

| Grupo | Casos que precisam existir |
| --- | --- |
| Escalada de privilégio | Próprio update de papel, ativo, campos extras, replace integral, create arbitrário e delete/recreate negados; escrita em outro usuário negada a não Direção; administração legítima testada separadamente |
| Perfil e sessão | Sem Auth, sem perfil, papel inexistente e `ativo:false`; token ainda válido após inativação; erro de perfil na UI sem concessão de Direção |
| Autoedição aprovada | Atualização somente dos campos explicitamente permitidos passa; junto com papel/ativo falha; criação/auditoria preservadas |
| Cadastro e dados médicos | CRUD conforme papel; leitura direta da ficha negada quando necessário; verificar que documento `alunos` e metadados amplos não contêm duplicações médicas após migração |
| Responsáveis | Outro aluno/pai, ID inexistente, principal inválido, troca concorrente, inativação e auditoria; validar invariantes da operação atômica adotada |
| Documentos e anexos | Metadado e arquivo por papel; pai ausente/proibido; MIME/tamanho; upload, overwrite, delete e acesso após inativação |
| Turmas/oficinas/vínculos | Cada concessão de create/update/delete ou inativação; referências/datas e alterações históricas proibidas |
| Atividades/evolução | Autor e turma quando necessários, tentativa de trocar autor/aluno, atualização de campos proibidos e exclusão |
| Relatório pedagógico | Rascunho→concluído, conclusão inválida, reabertura e edição de concluído; troca de aluno/modelo/autor; anexos com as mesmas capacidades do pai |
| Frequência | Papéis e escopo de turma/oficina; formato de presença, auditoria e correção/exclusão conforme política |
| Contato familiar | Responsável do aluno, snapshot e autor; tentativa de alterar retrospectivamente destinatário/dados históricos; contato legado conforme compatibilidade |
| Modelos/configurações | Versionamento usado por relatório; acesso por audiência; escrita sem privilégio |
| Listagens reais | Executar queries dos serviços com contas adequadas; negar listagem ampla quando a matriz só permite próprio doc ou escopo específico |
| Caminhos não declarados | Coleção/subcoleção desconhecida e tentativas de criar caminhos alternativos continuam negadas |

Além da suíte paramétrica, criar testes explícitos de regressão para os ataques de autoelevação identificados. Registrar mapeamento `ID da permissão → teste(s) → resultado`; nenhuma célula pode ficar apenas com “coberto por esconder botão”.

## Critérios de aceite

- Um Administrativo não consegue promover-se, reativar-se, excluir/recriar perfil privilegiado ou criar Direção por primeiro acesso, mesmo chamando o SDK diretamente.
- Usuários inativos/ausentes/inválidos não acessam dados operacionais conforme a matriz; tratamento do próprio estado mínimo é explícito.
- Seletores de profissional e prestação continuam funcionando sem leitura indiscriminada de perfis completos.
- Fronteira de dados médicos protege também as duplicações e os arquivos, e não somente a subcoleção nominal.
- Cada concessão e cada negação da matriz possui teste automatizado correspondente; suíte passa no Emulator com o código integrado.
- Matriz publicada descreve exatamente as regras implantadas e identifica versão/data/projeto; homologação por papel está registrada.
- Metadados e arquivos são acessíveis ou negados de forma consistente; alterações proibidas não aparecem como sucesso na interface.

## Paralelismo, dependências e o que não precisa refazer

- **Pode começar já:** inventário da matriz, testes de regressão de `usuarios`, helper de ativo, desenho de bootstrap e diretório mínimo. Não esperar todas as telas ficarem prontas para atacar escalada de privilégio.
- **Tarefa 1:** fornecer contrato de responsáveis/principal/snapshot; combinar migração médica e alterações em `studentsService.ts` com seu proprietário.
- **Tarefa 2:** fornecer schema, transições, autor/modelo e fluxo dos anexos; alterações em Storage e rules ficam com este subagente.
- **Tarefa 3:** fornecer política de imagem e fontes consultadas; alinhar nomes de profissionais e vínculos históricos antes de restringir consultas.
- **Tarefa 5:** validar queries sob regras finais. Regras não filtram documentos automaticamente; consultas precisam demonstrar o escopo autorizado quando a política exige.
- Não refazer autenticação Firebase, estrutura de coleções, divisão por papéis ou negação padrão. Completar autorização e provisionamento; alterações de layout sem impacto em capacidades não pertencem ao plano.
- Não criar permissão Firestore para troca de senha sem necessidade demonstrada; o fluxo atual não a utiliza.
- A suíte local existente tem 24 testes de prestação e build aprovado na auditoria geral; isso não substitui testes de regras nem confirma o ambiente remoto.

## Limites desta auditoria

Foram examinados arquivos locais e documentação disponível. Não foram usados SDK contra dados reais, Emulator, deploy, credenciais administrativas, migração ou homologação. A matriz proposta deve ser revisada pela Fundação; não há evidência local suficiente para declará-la aprovada.
