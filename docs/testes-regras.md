# Testes de regras no Firebase Emulator Suite

## Comando

```bash
npm ci
npm run test:rules
```

O script `test:rules` sobe os emuladores de Auth (`9099`), Firestore (`8080`) e
Storage (`9199`) definidos em `firebase.json` e executa as suítes de regras com
`vitest` em série (`--no-file-parallelism`), porque cada suíte limpa os dados do
emulador.

Pré-requisitos: Java disponível no `PATH` e dependências instaladas. Na primeira
execução o `firebase-tools` pode baixar os binários dos emuladores.

## O que é coberto

- `tests/firestore/rules.test.ts`: usuários fictícios de Direção, Pedagogia,
  Administrativo, inativo, sem perfil e convidado não autenticado; negação de
  escrita operacional para convidado/sem perfil; ficha médica; documentos e
  autorização de imagem; usuários; evolução; chamadas; vínculos turma-oficina;
  relatórios gerados; e contrato imutável de `contatos_familia`.
- `tests/storage/rules.test.ts`: ficha médica no Storage, incluindo leitura,
  envio, exclusão, metadados do aluno/usuário, existência do aluno, tipo de
  conteúdo e limite de 10 MB.

Os contextos autenticados do `@firebase/rules-unit-testing` simulam o token do
usuário e gravam o documento `usuarios/{uid}` no Firestore de teste. O emulador
de Auth fica ativo no mesmo comando para manter o ambiente completo, embora as
regras dependam do perfil no Firestore, não de usuários criados via Auth Admin.

## Resultado esperado

O comando encerra com código `0` e mostra as suítes de Firestore e Storage
aprovadas. Falhas indicam regra permissiva demais ou fixture/teste desatualizado.
