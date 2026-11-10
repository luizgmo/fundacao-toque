# Prestação de contas (RF13)

Relatório consolidado por período para financiadores, prefeituras e editais. A tela fica na aba
**Prestação de contas** de **Relatórios** e é acessível apenas ao perfil **Direção**.

## O que o relatório consolida

- `registros_atividade` e a subcoleção `anexos` (atividades, oficinas, responsáveis, descrições e fotos);
- `sessoes_chamada` (frequência por turma e por aluno);
- `alunos`, `matriculas`, `turmas`, `turma_oficinas`, `oficinas` e `usuarios`;
- autorização de uso de imagem (`alunos.uso_imagem_autorizado`).

Justificativas entram no numerador (`presentes + justificados`) e no denominador dos registros válidos. A Fundação confirmou a manutenção dessa regra em 10/11/2026. A unidade do indicador (chamada de turma ou oficina) ainda deve ser documentada separadamente.

Matrículas com `data_inicio`/`data_fim` são avaliadas pela vigência do período, inclusive as encerradas e de alunos hoje inativos. Campos legados de turma são usados quando não há matrícula conhecida. Matrícula ativa sem datas é tratada como legado no período e sinalizada; a migração não comprova as datas históricas de entrada.

## Geração e download

O PDF é montado no navegador com `jspdf` + `jspdf-autotable` e baixado diretamente pelo navegador.
O PDF gerado não é salvo; portanto, **não existe histórico de PDFs gerados**. O relatório deve ser
baixado e arquivado pela própria Direção. As fotos das atividades são salvas no Firestore em partes,
na subcoleção `anexos/{id}/chunks`, e reconstruídas na prévia, impressão e PDF.

A opção **Imprimir** abre uma versão HTML em nova janela e também não salva arquivo no servidor.

Uma foto só é incluída quando todos os alunos com matrícula identificada na turma na data da atividade têm `uso_imagem_autorizado == true`. Sem roster histórico ou autorização comprovável, a foto é omitida antes de gerar URL de download e a prévia informa a quantidade. A Fundação confirmou a manutenção desta política conservadora em 10/11/2026; confirmação genérica da Direção não libera fotos sem autorização comprovada.

## Migração de turmas legadas

Se a coleção `turmas` estiver vazia mas existirem referências antigas em `alunos`,
`sessoes_chamada` ou `registros_atividade`, rode a migração idempotente:

```bash
# dry-run: mostra o que seria criado/atualizado, sem gravar
npm run migrate:turmas

# aplica as turmas, normaliza os vínculos e cria as matrículas ativas
APPLY=1 npm run migrate:turmas
```

O script lê os dados via Firestore REST com a conta do Firebase CLI, grava um backup parcial dos
documentos retornados pelas máscaras em `/tmp/opencode/migracao-turmas-*.json` e não cria alunos nem turmas
que não estejam referenciados nos dados existentes. Ele pode ser executado novamente sem
duplicar registros.

## Implantação

A prestação depende das permissões de leitura do Firestore e dos índices das consultas em
homologação. Os anexos ficam em documentos de até 600 KiB codificados em Base64, abaixo de
`anexos/{id}/chunks/{parte}`; cada arquivo tem metadados em `anexos/{id}`. O limite da interface é
5 MiB para fotos de atividade e 10 MiB para anexos pedagógicos. O Firestore limita cada documento a
1 MiB, então o arquivo não deve ser gravado inteiro em um único documento. Essa estratégia usa
leituras e gravações do Firestore para cada parte e não requer Storage, bucket nem CORS.

Quando um anexo está incompleto ou inacessível pelas regras, a prévia informa a indisponibilidade e
o PDF usa um espaço reservado. PDFs gerados continuam locais e não são persistidos.

## Testes

```bash
npm test
npx tsc -b
npm run build
```

Os testes unitários cobrem a consolidação, validação de período, LGPD, geração do PDF e escape do
HTML de impressão.
