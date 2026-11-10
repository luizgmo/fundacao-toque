# Publicação manual no Firebase

Os comandos abaixo devem ser executados depois de revisar os dados e selecionar o projeto correto. Não coloque chaves, tokens ou senhas em arquivos do repositório.

## 1. Preparar o projeto

Na pasta `fundacao-toque-integracao`, confirme o projeto ativo com `npx firebase-tools projects:list` e autentique-se com a conta que tem permissão para publicar. Use o ID confirmado pela equipe no lugar de `ID_DO_PROJETO`.

Antes de publicar as regras restritas, prepare os documentos existentes descritos abaixo. A nova aplicação lê nomes da coleção `usuarios_publicos`; estudantes já cadastrados precisam ter os dados médicos em `ficha_medica/geral` antes de remover as cópias antigas.

## 2. Preparar os dados existentes no Console do Firestore

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

## 3. Criar a primeira conta de Direção

A tela pública de primeiro acesso foi removida. Crie o usuário no Firebase Authentication por um canal administrativo confiável e crie `usuarios/{uid}` no Firestore com `nome_completo`, `email`, `papel: "direcao"`, `ativo: true`, `criado_em` e `atualizado_em`. Crie também `usuarios_publicos/{uid}` com somente os quatro campos mínimos descritos acima. Não crie o perfil por uma sessão comum do aplicativo.

## 4. Publicar regras e índices

Com `firebase.json` apontando para os arquivos desta branch:

```bash
npx firebase-tools deploy --only firestore:rules,storage --project ID_DO_PROJETO
npx firebase-tools deploy --only firestore:indexes --project ID_DO_PROJETO
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
