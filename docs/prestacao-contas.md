# Prestação de contas (RF13)

Relatório consolidado por período para financiadores, prefeituras e editais. A tela fica na aba
**Prestação de contas** de **Relatórios** e é acessível apenas ao perfil **Direção**.

## O que o relatório consolida

- `registros_atividade` e a subcoleção `anexos` (atividades, oficinas, responsáveis, descrições e fotos);
- `sessoes_chamada` (frequência por turma e por aluno);
- `alunos`, `matriculas`, `turmas`, `turma_oficinas`, `oficinas` e `usuarios`;
- autorização de uso de imagem (`alunos.uso_imagem_autorizado`).

Justificativas contam como comparecimento no percentual de frequência. Vínculos por matrícula ativa
têm prioridade, com fallback para `alunos.turma_id` e `alunos.turma` em dados legados.

## Geração e download

O PDF é montado no navegador com `jspdf` + `jspdf-autotable` e baixado diretamente pelo navegador.
Nenhum arquivo é enviado ao Storage nem gravado no Firestore; portanto, **não existe histórico de
PDFs gerados**. O relatório deve ser baixado e arquivado pela própria Direção.

A opção **Imprimir** abre uma versão HTML em nova janela e também não salva arquivo no servidor.

Se as turmas selecionadas tiverem alunos sem autorização de uso de imagem, a prévia é exibida com
alerta e o PDF/impressão ficam bloqueados até a confirmação explícita da Direção.

## Migração de turmas legadas

Se a coleção `turmas` estiver vazia mas existirem referências antigas em `alunos`,
`sessoes_chamada` ou `registros_atividade`, rode a migração idempotente:

```bash
# dry-run: mostra o que seria criado/atualizado, sem gravar
npm run migrate:turmas

# aplica as turmas, normaliza os vínculos e cria as matrículas ativas
APPLY=1 npm run migrate:turmas
```

O script lê os dados via Firestore REST com a conta do Firebase CLI, grava um backup dos
documentos lidos em `/tmp/opencode/migracao-turmas-*.json` e não cria alunos nem turmas
que não estejam referenciados nos dados existentes. Ele pode ser executado novamente sem
duplicar registros.

## Implantação

A prestação de contas **não exige regras nem índices novos** no Firestore e funciona em plano
gratuito sem Cloud Storage. O PDF é gerado localmente e baixado pelo navegador.

As fotos de atividades continuam vindo do Storage, quando o bucket existir. Nesse caso:

1. publique as regras do Storage:

   ```bash
   firebase deploy --only storage
   ```

2. configure o CORS do bucket para permitir que o PDF baixe as fotos diretamente:

   ```bash
   gcloud storage buckets update gs://SEU_BUCKET --cors-file=storage.cors.json
   # alternativa:
   gsutil cors set storage.cors.json gs://SEU_BUCKET

   # conferência
   gsutil cors get gs://SEU_BUCKET
   ```

   O CORS não é aplicado pelo `firebase deploy`. Antes de produção, troque `"origin": ["*"]`
   no `storage.cors.json` pelo domínio da aplicação.

   Sem Storage ou sem CORS, o PDF continua sendo gerado: as fotos que não puderem ser baixadas
   aparecem como “Foto indisponível”, com aviso no relatório. A opção **Imprimir** exibe as fotos
   normalmente quando as URLs estão acessíveis.

## Testes

```bash
npm test
npx tsc -b
npm run build
```

Os testes unitários cobrem a consolidação, validação de período, LGPD, geração do PDF e escape do
HTML de impressão.
