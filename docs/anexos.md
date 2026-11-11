# Anexos: envio, reenvio, exclusão e órfãos

Fotos de **registros de atividade** e arquivos de **relatórios pedagógicos** ficam no próprio Firestore (não há Firebase Storage no projeto):

```text
{pai}/anexos/{anexo_id}                    metadados (status, total_partes, tamanho_bytes, tipo_conteudo…)
{pai}/anexos/{anexo_id}/chunks/{000000…}   conteúdo em partes base64 de até 600 KB
```

`{pai}` é `registros_atividade/{id}` ou `relatorios_pedagogicos/{id}`. O código está em `src/services/anexosService.ts`.

## Limites (cliente e regras)

| Pai | Tipos | Tamanho máximo |
|---|---|---|
| Registro de atividade | JPG, PNG, WebP | 5 MB |
| Relatório pedagógico | PDF, JPG, PNG, WebP | 10 MB |

- O cliente confere o tipo declarado, o tamanho, o nome (até 200 caracteres) e a assinatura binária do arquivo. Um `.exe` renomeado para `.jpg` é recusado.
- No máximo 10 arquivos por envio.
- As regras repetem os limites e exigem metadados completos: `total_partes = ceil(tamanho / 600 KB)`, partes com ID `000000…` igual ao `indice` e gravadas apenas por quem iniciou o envio.

## Envio e reenvio

1. Ao selecionar o arquivo, a tela **reserva o ID do anexo**. O registro de atividade também tem o ID reservado antes da primeira tentativa.
2. O envio grava os metadados (`status: enviando`), depois as partes e, por fim, num **mesmo batch**, troca o status para `disponivel` e soma +1 em `total_anexos`.
3. Reenviar usa o mesmo ID:
   - Se o anexo já está `disponivel`, não grava nada. Isso cobre o caso de uma confirmação que se perdeu.
   - Se ficou `enviando`, grava só as partes que faltam.
4. A tela mostra cada arquivo como **Aguardando envio**, **Enviando…**, **Enviado** ou **Falhou: motivo**, com "Reenviar" e "Remover". Remover um arquivo que falhou descarta o que ficou gravado pela metade.

**Contador:** as regras só aceitam a troca para `disponivel` com `total_anexos` +1 no mesmo batch, e a remoção de um anexo disponível com −1. Assim, o contador conta apenas arquivos completos e não sobe duas vezes para o mesmo anexo. Se ainda assim divergir (dados antigos), os detalhes do registro mostram o aviso e o botão **Corrigir contador**.

## Leitura

Cada arquivo exibido tem um estado explícito, nunca um "sem anexo" silencioso:

| Estado | O que significa | O que fazer |
|---|---|---|
| Disponível | todas as partes conferem com o tamanho original | abrir o arquivo |
| Envio não concluído | `status: enviando` | reenviar ou "Descartar envio" |
| Arquivo incompleto | marcado disponível, mas faltam partes ou o tamanho difere | excluir e enviar de novo |
| Não foi possível carregar | erro de rede ou de permissão (o motivo é exibido) | "Tentar novamente" |

## Exclusão

- **Registro de atividade (Direção):**
  - Antes de começar, o registro recebe `exclusao: { status: 'em_andamento' }`.
  - Cada arquivo é removido de forma independente: primeiro as partes e, por último, os metadados, junto com −1 no contador.
  - Se algum arquivo falhar, ele **continua ligado ao registro** e não fica órfão. O registro passa a `exclusao.status = 'incompleta'`, com a lista de `arquivos_pendentes`.
  - O histórico mostra "Exclusão incompleta" e o botão **Concluir exclusão**, que repete o processo.
  - O registro só é apagado quando todos os arquivos saíram.
  - Enquanto há exclusão em andamento, as regras não aceitam anexos novos no registro.
- **Relatório pedagógico (rascunho):**
  - Quem enviou o arquivo, ou a Direção, pode excluí-lo. A tela informa se ele saiu ou se continua na lista.
  - Excluir o rascunho mantém o relatório se algum anexo não sair.

## Localizar e corrigir órfãos

```bash
npm run anexos:orfaos                 # dry-run: lista os achados
APPLY=1 npm run anexos:orfaos         # aplica as correções automáticas
HORAS=6 npm run anexos:orfaos         # limite para "envio abandonado" (padrão: 24 h)
```

O script usa o acesso de administrador (login do Firebase CLI ou do gcloud), igual aos outros scripts. Para o emulador, defina `FIRESTORE_EMULATOR_HOST`.

| Achado | Correção com `APPLY=1` |
|---|---|
| `parte_sem_anexo`: partes cujo anexo não existe | apaga as partes |
| `anexo_sem_pai`: anexo de registro ou relatório apagado | apaga as partes e o anexo |
| `envio_abandonado`: `enviando` há mais de `HORAS` | apaga as partes e o anexo |
| `contador_divergente`: `total_anexos` ≠ disponíveis | regrava `total_anexos` |
| `conteudo_incompleto`: disponível sem todas as partes | **manual**: excluir no app e enviar de novo |
| `exclusao_incompleta`: exclusão interrompida | **manual**: "Concluir exclusão" no app |

O script lê só os campos necessários, sem baixar o conteúdo das partes, e é idempotente. A análise fica em `src/lib/anexosOrfaos.ts`, coberta por testes.

Sugestão: rodar o dry-run uma vez por semana e o `APPLY=1` depois de conferir a lista.
