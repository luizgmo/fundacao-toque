# Publicação manual no Firebase

Os comandos abaixo devem ser executados depois de revisar os dados e selecionar o projeto correto. Não coloque chaves, tokens ou senhas em arquivos do repositório.

## 1. Preparar o projeto

Na pasta `fundacao-toque-integracao`, confirme o projeto ativo com `npx firebase-tools projects:list` e autentique-se com a conta que tem permissão para publicar. Use o ID confirmado pela equipe no lugar de `ID_DO_PROJETO`.

O projeto `fundacao-toque` foi limpo e repovoado com dados fictícios em 10/11/2026. O cleanup removeu 27 documentos das coleções atuais/legadas conhecidas e respectivas subcoleções do app; o seed gravou 36 documentos no schema atual, incluindo `usuarios_publicos`, referências de responsável principal e fichas médicas em subcoleção. A operação usou acesso Admin REST. Não foi criado nem alterado Storage.

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

1. Crie ou atualize `alunos/{alunoId}/ficha_medica/geral` e copie esses valores para os campos de mesmo nome.
2. Confirme os valores no documento da ficha.
3. Apague `tipos_deficiencia`, `codigos_cid` e `grau_dependencia` do documento `alunos/{alunoId}`.

Não apague os dados do aluno antes de confirmar que foram copiados para a ficha. Faça a conferência com usuários de Direção e Pedagogia após publicar as regras. Usuários do perfil Administrativo não devem conseguir ler os campos médicos.

## 4. Publicar regras e índices

Se o projeto ainda não tiver um bucket do Firebase Storage, **não publique `storage.rules` e não espere que uploads funcionem**. Ative/crie o bucket no Console do Firebase primeiro; isso pode exigir habilitar faturamento no projeto. Até lá, anexos pedagógicos e fotos no Storage ficam indisponíveis. Firestore e relatórios sem anexos continuam funcionando.

Com `firebase.json` apontando para os arquivos desta branch:

```bash
npx firebase-tools deploy --only firestore:rules --project ID_DO_PROJETO
npx firebase-tools deploy --only firestore:indexes --project ID_DO_PROJETO
```

Depois que o bucket existir, publique as regras de Storage separadamente:

```bash
npx firebase-tools deploy --only storage --project ID_DO_PROJETO
```

Confira no Console que as regras publicadas correspondem à branch `integration/tarefas-1-a-5`. O inventário atual não identificou necessidade de composto novo, mas o deploy publica o arquivo versionado completo; revise antes de remover qualquer índice que já exista no projeto.

## 5. Validar manualmente

- Entre com contas reais de teste de Direção, Pedagogia e Administrativo.
- Confirme que cada perfil consegue acessar apenas os dados previstos; tente acessar `usuarios/{outroUid}` e `ficha_medica/geral` diretamente.
- Cadastre um aluno com dois responsáveis, mude o principal e registre contato por falta.
- Crie rascunho pedagógico, anexe arquivo, saia e entre novamente, retome e consulte.
- Gere prestação com período/turma, frequência e fotos autorizadas; compare prévia, impressão e PDF.
- Verifique no Console de índices que as consultas aceitas ficam operacionais.

Os testes do Emulator estão em `npm run test:rules`; eles não substituem a validação no projeto real. Para configurar CORS de fotos do PDF, siga as instruções e limites em [prestacao-contas.md](prestacao-contas.md). CORS é configuração do bucket e não é aplicado pelo deploy acima.
