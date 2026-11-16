# Publicação manual no Firebase

Os comandos abaixo devem ser executados depois de revisar os dados e selecionar o projeto correto. Não coloque chaves, tokens ou senhas em arquivos do repositório.

## 1. Preparar o projeto

Na pasta da versão atual de `luizgmo/fundacao-toque` (`main`), confirme o projeto ativo com `npx firebase-tools projects:list` e autentique-se com a conta que tem permissão para publicar. Use o ID confirmado pela equipe no lugar de `ID_DO_PROJETO`.

O projeto `fundacao-toque` foi limpo e repovoado com dados fictícios em 10/11/2026. O cleanup removeu 27 documentos das coleções atuais/legadas conhecidas e respectivas subcoleções do app; o seed gravou 36 documentos no schema atual, incluindo `usuarios_publicos`, referências de responsável principal e fichas médicas em subcoleção. A operação usou acesso Admin REST. Anexos de atividades e relatórios são divididos em partes no Firestore. A ficha médica em formato de arquivo usa Firebase Storage, conforme `src/services/medicalService.ts` e `storage.rules`.

Se rodar novamente no futuro, o cleanup apaga **todos** os documentos nas coleções conhecidas listadas em `scripts/seed-firestore.mjs`; confirme o projeto antes de repetir.

## 2. Preparar contas de acesso

O seed cria documentos fictícios de perfil no Firestore, mas não cria contas no Firebase Authentication. Crie a primeira conta de Direção em Authentication e, usando o UID real gerado, crie `usuarios/{uid}` e `usuarios_publicos/{uid}` com os campos descritos abaixo. Depois entre e use a tela de gestão de usuários para criar as demais contas, que terão seus perfis e projeções gravados pelo sistema.

## 3. Dados para bases preexistentes

### Diretório mínimo de profissionais

Para cada documento existente `usuarios/{uid}`, crie `usuarios_publicos/{uid}` contendo somente:

```text
nome_completo: string
papel: "direcao" | "pedagogia" | "administrativo"
ativo: boolean
atualizado_em: timestamp
```

Não copie e-mail nem outros campos do perfil. A criação de novas contas pelo sistema grava a projeção automaticamente; o backfill manual é para contas que já existiam.

### Campos médicos antigos

Faça um backup/exportação do Firestore antes de editar dados existentes. Para cada `alunos/{alunoId}` que tenha `tipos_deficiencia`, `codigos_cid` ou `grau_dependencia`:

1. Converta os dados para o esquema atual de `src/services/medicalService.ts` e salve em `alunos/{alunoId}/ficha_medica/ficha` (caminho canônico atual). O documento `geral` é legado e não é lido pela tela atual. `grau_dependencia` não faz parte do esquema atual: preserve-o no backup até a equipe definir seu destino.
2. Confirme os valores no documento da ficha.
3. Apague `tipos_deficiencia`, `codigos_cid` e `grau_dependencia` do documento `alunos/{alunoId}`.

Não apague os dados do aluno antes de confirmar que foram copiados para a ficha. Faça a conferência com usuários de Direção e Pedagogia após publicar as regras. Usuários do perfil Administrativo não devem conseguir ler os campos médicos.

## 4. Publicar regras e índices

Com `firebase.json` apontando para os arquivos desta branch:

```bash
npx firebase-tools deploy --only firestore:rules --project ID_DO_PROJETO
npx firebase-tools deploy --only firestore:indexes --project ID_DO_PROJETO
npx firebase-tools deploy --only storage --project ID_DO_PROJETO
```

Confira no Console que as regras publicadas correspondem à `main` do seu repositório. O deploy no Vercel publica o aplicativo, mas **não publica regras ou índices do Firebase**.

Para o erro de “Relatórios concluídos hoje” no dashboard, o índice composto necessário já está em `firestore.indexes.json`:

- Coleção: `relatorios_pedagogicos`.
- Escopo: coleção.
- `status`: crescente.
- `atualizado_em`: crescente.

Publique os índices no mesmo projeto usado por `VITE_FIREBASE_PROJECT_ID` no Vercel e aguarde o estado **Ativado/Enabled** no Console. Um índice ausente ou em construção ainda causa falha na consulta. Esse erro é de índice; alterar as regras não o corrige.

Os índices compostos das consultas atuais foram conferidos com `npm run audit:firestore`. O campo simples `documentos.tipo_documento` é configurado em `fieldOverrides`, não na lista de índices compostos. Os índices legados de mais de um campo foram mantidos para não propor remoções sem revisar outros consumidores do banco. Preserve também qualquer índice existente usado fora deste app.

Fotos e anexos pedagógicos usam documentos Firestore em partes de até 600 KiB; documentos comuns do cadastro de alunos usam Data URL de até 500 KiB. **A ficha médica em arquivo usa Storage**: publique `storage.rules`, confirme `VITE_FIREBASE_STORAGE_BUCKET` e habilite o bucket para usar esse formato. Os formatos digitais de ficha médica ficam no Firestore, no documento `alunos/{alunoId}/ficha_medica/ficha`.

A auditoria local testa as regras versionadas; não prova quais regras/índices estão atualmente publicados no seu projeto Firebase. Não foi feito deploy no Firebase durante esta revisão.

## 5. Validar manualmente

- Entre com contas reais de teste de Direção, Pedagogia e Administrativo.
- Confirme que cada perfil consegue acessar apenas os dados previstos; tente acessar `usuarios/{outroUid}` e `ficha_medica/ficha` diretamente.
- Cadastre um aluno com dois responsáveis, mude o principal e registre contato por falta.
- Crie rascunho pedagógico, anexe arquivo, saia e entre novamente, retome e consulte.
- Gere prestação com período/turma, frequência e fotos autorizadas; compare prévia, impressão e PDF.
- Verifique no Console de índices que as consultas aceitas ficam operacionais.

Os testes do Emulator estão em `npm run test:rules`; eles não substituem a validação no projeto real. Confira anexos em relatórios pedagógicos e atividades depois de sair e entrar novamente.

## 6. Conferência local antes da publicação

```bash
npm run audit:firestore
npm test
npm run test:rules
npm run build
```

A auditoria percorre as consultas `query(...)` em `src` com filtros/ordenações declarados diretamente. As sete consultas compostas atuais estão cobertas pelos índices versionados. Consultas futuras montadas dinamicamente precisam ser incluídas na revisão. O emulador testa permissões e contratos dos documentos, mas não exige índices compostos como o banco de produção.

### Permissões alinhadas ao dashboard

`configuracoes_sistema` permite leitura aos três perfis ativos porque o limite de faltas é usado por todos no dashboard. Somente Direção continua autorizada a alterar o limite. Usuários inativos, sem perfil e anônimos não o leem.

Relatórios pedagógicos continuam restritos a Direção e Pedagogia. O dashboard Administrativo deixa de consultar essa coleção nas tarefas e nas últimas atualizações, em vez de produzir erros de permissão ou ampliar o acesso às avaliações.
