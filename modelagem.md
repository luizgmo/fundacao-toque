# Modelar e criar o banco de dados no Cloud Firestore

## Objetivo

Modelar e configurar o banco de dados do sistema da Fundação Toque utilizando o Cloud Firestore, contemplando cadastro de alunos, responsáveis, turmas, oficinas, atividades, frequência, evolução pedagógica, relatórios, documentos e controle de acesso.

Por ser NoSQL, o Firestore utilizará coleções e documentos, não tabelas relacionais. Relacionamentos serão representados por IDs e coleções associativas.

## Padrões da modelagem

- Nomes de coleções e atributos em **português**, em `snake_case` e **sem acentos** (para compatibilidade e simplicidade no código).
- Datas armazenadas como `Timestamp`.
- Arquivos e fotos armazenados no Firebase Storage.
- Firestore deve armazenar somente metadados e caminhos dos arquivos.
- Dados médicos devem ficar separados dos dados cadastrais comuns.
- Documentos alteráveis devem possuir:
  - `criado_em: Timestamp`
  - `criado_por: string`
  - `atualizado_em: Timestamp`
  - `atualizado_por: string`
  - Exceção: `usuarios` (gerenciado pela Direção via Firebase Authentication) e `fichas_medicas` (1:1 com o aluno, mantém apenas `atualizado_em`/`atualizado_por`).
- IDs relacionados serão armazenados como `string`.
- Datas utilizadas frequentemente em consultas poderão ser duplicadas de forma controlada.
- **Convenção de datas:** campos que representam data pura, sem horário (`data_nascimento`, `data_chamada`, `data_atividade`, `data_registro`), serão armazenados como `string` no formato `YYYY-MM-DD`, evitando problemas de fuso horário do `Timestamp` (UTC). Campos com data e hora relevantes (`criado_em`, `contatado_em`, `enviado_em` etc.) permanecem como `Timestamp`.
- Nenhuma informação pessoal real deverá ser utilizada em testes.
- `ids_usuarios_responsaveis` presente em `oficinas`, `turma_oficinas` e `turmas`: a **fonte da verdade** é `turma_oficinas` (responsáveis pela oficina em uma turma específica). Os campos em `oficinas` e `turmas` são apenas valores padrão/herdados para exibição e não devem ser usados para controle de acesso granular.

## Coleções

| Coleção | Finalidade |
|---|---|
| `usuarios` | Usuários e perfis de acesso |
| `alunos` | Dados cadastrais dos alunos |
| `fichas_medicas` | Dados médicos e sensíveis |
| `responsaveis` | Responsáveis pelos alunos |
| `documentos_aluno` | Fichas médicas, matrículas e autorizações |
| `turmas` | Turmas da instituição |
| `oficinas` | Oficinas e atividades oferecidas |
| `turma_oficinas` | Associação entre turmas e oficinas |
| `horarios_oficinas` | Dias e horários das oficinas |
| `matriculas` | Histórico de vínculo entre alunos e turmas |
| `aluno_oficinas` | Oficinas atribuídas individualmente aos alunos |
| `registros_atividade` | Atividades realizadas diariamente |
| `anexos` | Fotos anexadas a atividades e relatórios |
| `registros_evolucao` | Observações e evolução dos alunos |
| `modelos_formulario` | Modelos versionados de avaliação |
| `relatorios_pedagogicos` | Relatórios pedagógicos |
| `sessoes_chamada` | Chamadas realizadas por dia ou oficina |
| `registros_presenca` | Presença individual dos alunos |
| `contatos_familia` | Contatos feitos em razão de faltas |
| `relatorios_gerados` | Relatórios exportados para prestação de contas |
| `configuracoes_sistema` | Configurações gerais do sistema |

## Atributos

### `usuarios/{uid}`

O ID do documento deverá ser o mesmo UID do Firebase Authentication.

```text
nome_completo: string                         obrigatório
email: string                             obrigatório
papel: string                              obrigatório
  valores: direcao | pedagogia | administrativo
ativo: boolean                           obrigatório
ultimo_login_em: Timestamp                  opcional
criado_em: Timestamp                     obrigatório
atualizado_em: Timestamp                     obrigatório
```

### `alunos/{aluno_id}`

```text
nome_completo: string                         obrigatório
nome_busca: string                       obrigatório
data_nascimento: string                        obrigatório
  formato: YYYY-MM-DD
status: string                            obrigatório
  valores: ativo | inativo
uso_imagem_autorizado: boolean             obrigatório
consentimento_imagem_em: Timestamp               opcional
caminho_foto: string                        opcional
  caminho da foto do aluno no Firebase Storage
criado_por: string                        obrigatório
criado_em: Timestamp                     obrigatório
atualizado_por: string                        obrigatório
atualizado_em: Timestamp                     obrigatório
```

`nome_busca` deve armazenar o nome normalizado, sem acentos e em letras minúsculas, para auxiliar pesquisas.

### `fichas_medicas/{aluno_id}`

Documento com o mesmo ID do aluno, formando uma relação 1:1.

```text
aluno_id: string                        obrigatório
tipos_deficiencia: array<string>           obrigatório
codigos_cid: array<string>                  opcional
formato_ficha_medica: string             opcional
  valores: anexo | digital
dados_ficha_medica: map                  opcional
atualizado_por: string                        obrigatório
atualizado_em: Timestamp                     obrigatório
```

Essa coleção deverá possuir regras de acesso mais restritivas por conter dados sensíveis.

### `responsaveis/{responsavel_id}`

```text
aluno_id: string                        obrigatório
nome_completo: string                         obrigatório
parentesco: string                     obrigatório
telefone: string                             obrigatório
telefone_alternativo: string                opcional
email: string                             opcional
principal: boolean                       obrigatório
criado_em: Timestamp                     obrigatório
atualizado_em: Timestamp                     obrigatório
criado_por: string                        obrigatório
atualizado_por: string                        obrigatório
```

Um aluno poderá possuir mais de um responsável.

### `documentos_aluno/{documento_id}`

```text
aluno_id: string                        obrigatório
tipo_documento: string                     obrigatório
  valores: ficha_medica | ficha_matricula |
           autorizacao_imagem | outra
caminho_storage: string                      obrigatório
nome_arquivo_original: string                obrigatório
tipo_conteudo: string                      obrigatório
tamanho_bytes: number                        obrigatório
enviado_por: string                       obrigatório
enviado_em: Timestamp                    obrigatório
```

O conteúdo do arquivo ficará no Firebase Storage.

### `turmas/{turma_id}`

```text
codigo: string                              obrigatório
nome: string                              obrigatório
period: string                            obrigatório
  valores: manha | tarde | integral
ids_usuarios_responsaveis: array<string>       obrigatório
data_inicio: Timestamp                     opcional
data_fim: Timestamp                       opcional
ativo: boolean                           obrigatório
criado_em: Timestamp                     obrigatório
atualizado_em: Timestamp                     obrigatório
```

### `oficinas/{oficina_id}`

```text
nome: string                              obrigatório
category: string                          obrigatório
descricao: string                       opcional
ids_usuarios_responsaveis: array<string>       obrigatório
ativo: boolean                           obrigatório
criado_em: Timestamp                     obrigatório
atualizado_em: Timestamp                     obrigatório
```

Exemplos de categoria: musicalização, dança, culinária e horta.

### `turma_oficinas/{turma_oficina_id}`

```text
turma_id: string                          obrigatório
oficina_id: string                       obrigatório
ids_usuarios_responsaveis: array<string>       obrigatório
ativo: boolean                           obrigatório
criado_em: Timestamp                     obrigatório
atualizado_em: Timestamp                     obrigatório
```

Representa o relacionamento entre uma turma e uma oficina.

### `horarios_oficinas/{horario_id}`

```text
turma_oficina_id: string                 obrigatório
dia_semana: number                           obrigatório
  valores: 1 a 7
hora_inicio: string                        obrigatório
  formato: HH:mm
hora_fim: string                          obrigatório
  formato: HH:mm
valido_de: string                        opcional
  formato: YYYY-MM-DD
valido_ate: string                       opcional
  formato: YYYY-MM-DD
ativo: boolean                           obrigatório
criado_em: Timestamp                     obrigatório
criado_por: string                        obrigatório
atualizado_em: Timestamp                     obrigatório
atualizado_por: string                        obrigatório
```

### `matriculas/{matricula_id}`

```text
aluno_id: string                        obrigatório
turma_id: string                          obrigatório
data_inicio: string                        obrigatório
  formato: YYYY-MM-DD
data_fim: string                          opcional
  formato: YYYY-MM-DD
status: string                            obrigatório
  valores: ativo | concluido | cancelado
criado_por: string                        obrigatório
criado_em: Timestamp                     obrigatório
atualizado_por: string                        obrigatório
atualizado_em: Timestamp                     obrigatório
```

A vinculação aluno-turma deve ficar nesta coleção, e não diretamente no aluno. Isso permite preservar o histórico e possibilita mais de uma matrícula ao longo do tempo.

### `aluno_oficinas/{vinculo_id}`

```text
aluno_id: string                        obrigatório
turma_oficina_id: string                 obrigatório
data_inicio: string                        obrigatório
  formato: YYYY-MM-DD
data_fim: string                          opcional
  formato: YYYY-MM-DD
status: string                            obrigatório
  valores: ativo | concluido | cancelado
nivel_suporte: string                     opcional
consideracoes_pedagogicas: string        opcional
atribuido_por: string                       obrigatório
criado_em: Timestamp                     obrigatório
atualizado_por: string                        obrigatório
atualizado_em: Timestamp                     obrigatório
```

### `registros_atividade/{registro_id}`

```text
data_atividade: string                     obrigatório
  formato: YYYY-MM-DD
turma_id: string                          obrigatório
ids_turma_oficinas: array<string>         opcional
  oficinas realizadas no dia; pode ficar vazia quando nenhuma oficina for realizada
usuario_responsavel_id: string               obrigatório
observacoes_gerais: string              opcional
criado_em: Timestamp                     obrigatório
atualizado_em: Timestamp                     obrigatório
```

Um registro diário poderá conter mais de uma oficina realizada pela turma.

### `anexos/{anexo_id}`

```text
tipo_proprietario: string                        obrigatório
  valores: registro_atividade | relatorio_pedagogico
id_proprietario: string                          obrigatório
tipo_anexo: string                   obrigatório
  valores: imagem | documento
caminho_storage: string                      obrigatório
nome_arquivo_original: string                obrigatório
tipo_conteudo: string                      obrigatório
legenda: string                           opcional
enviado_por: string                       obrigatório
enviado_em: Timestamp                    obrigatório
```

### `registros_evolucao/{registro_evolucao_id}`

```text
aluno_id: string                        obrigatório
data_registro: string                       obrigatório
  formato: YYYY-MM-DD
profissional_usuario_id: string              obrigatório
area: string                              obrigatório
  valores: cognitiva | motora | social |
           comunicacao | autonomia | outra
observacao: string                       obrigatório
criado_em: Timestamp                     obrigatório
atualizado_em: Timestamp                     obrigatório
```

### `modelos_formulario/{modelo_id}`

```text
nome: string                              obrigatório
tipo_modelo: string                     obrigatório
  valores: pedagogical_evaluation
versao: number                           obrigatório
campos: array<map>                        obrigatório
ativo: boolean                           obrigatório
criado_por: string                        obrigatório
criado_em: Timestamp                     obrigatório
```

Estrutura de cada item de `campos`:

```text
chave: string
rotulo: string
type: string
  valores: text | long_text | number | boolean | select | date
obrigatorio: boolean
opcoes: array<string>                    opcional
```

Isso permitirá adaptar o sistema quando a Fundação fornecer o formulário oficial.

### `relatorios_pedagogicos/{relatorio_id}`

```text
aluno_id: string                        obrigatório
tipo_relatorio: string                       obrigatório
  valores: diario | semestral | anual
periodo_inicio: string                      obrigatório
  formato: YYYY-MM-DD
periodo_fim: string                        obrigatório
  formato: YYYY-MM-DD
evolucao: string                         opcional
dificuldades: string                      opcional
avancos: string                          opcional
encaminhamentos: string                         opcional
usuario_responsavel_id: string               obrigatório
modelo_formulario_id: string                  opcional
modelo_formulario_versao: number             opcional
respostas: map                              opcional
status: string                            obrigatório
  valores: rascunho | concluido
criado_em: Timestamp                     obrigatório
atualizado_em: Timestamp                     obrigatório
```

Os campos sugeridos deverão ser confirmados com a Fundação.

### `sessoes_chamada/{sessao_id}`

```text
data_chamada: string                   obrigatório
  formato: YYYY-MM-DD
turma_id: string                          obrigatório
escopo: string                             obrigatório
  valores: turma | oficina
turma_oficina_id: string                 opcional
registro_atividade_id: string                opcional
registrado_por: string                       obrigatório
criado_em: Timestamp                     obrigatório
```

Quando `escopo` for `oficina`, o campo `turma_oficina_id` será obrigatório.

### `registros_presenca/{sessao_id}_{aluno_id}`

Utilizar um ID determinístico evita duas presenças para o mesmo aluno na mesma chamada.

```text
sessao_id: string                        obrigatório
aluno_id: string                        obrigatório
data_chamada: string                   obrigatório
  formato: YYYY-MM-DD
turma_id: string                          obrigatório
turma_oficina_id: string                 opcional
status: string                            obrigatório
  valores: presente | ausente | justificado
observacoes: string                             opcional
registrado_por: string                       obrigatório
criado_em: Timestamp                     obrigatório
atualizado_em: Timestamp                     obrigatório
```

A data e os IDs são repetidos propositalmente para permitir consultas sem `JOIN`.

### `contatos_familia/{contato_id}`

```text
aluno_id: string                        obrigatório
responsavel_id: string                       opcional
datas_faltas_relacionadas: array<string>      obrigatório
  datas das faltas, formato YYYY-MM-DD
contatado_em: Timestamp                   obrigatório
meio_contato: string                    obrigatório
  valores: telefone | whatsapp | email | presencial | outra
observacoes: string                             obrigatório
usuario_responsavel_id: string               obrigatório
criado_em: Timestamp                     obrigatório
```

### `relatorios_gerados/{relatorio_gerado_id}`

```text
tipo_relatorio: string                       obrigatório
  valores: acompanhamento_aluno | prestacao_contas
periodo_inicio: string                      obrigatório
  formato: YYYY-MM-DD
periodo_fim: string                        obrigatório
  formato: YYYY-MM-DD
filtros: map                              opcional
status: string                            obrigatório
  valores: processando | concluido | falhou
caminho_storage: string                      opcional
gerado_por: string                      obrigatório
gerado_em: Timestamp                   obrigatório
```

### `configuracoes_sistema/geral`

```text
modo_chamada: string                   obrigatório
  valores: diario | oficina
limite_faltas_consecutivas: number     obrigatório
atualizado_por: string                        obrigatório
atualizado_em: Timestamp                     obrigatório
```

## Relacionamentos

| Origem | Relacionamento | Destino |
|---|---:|---|
| Aluno | 1:N | Responsáveis |
| Aluno | 1:1 | Dados médicos |
| Aluno | 1:N | Documentos |
| Aluno | N:N | Turmas, por meio de `matriculas` |
| Turma | N:N | Oficinas, por meio de `turma_oficinas` |
| Aluno | N:N | Oficinas, por meio de `aluno_oficinas` |
| Turma | 1:N | Registros de atividades |
| Aluno | 1:N | Registros de evolução |
| Aluno | 1:N | Relatórios pedagógicos |
| Chamada | 1:N | Registros de presença |
| Aluno | 1:N | Contatos com a família |
| Oficina | 1:N | Horários, por meio de `turma_oficinas` |
| Registro de atividade | 1:N | Anexos, por meio de `anexos` (polimórfico) |
| Relatório pedagógico | 1:N | Anexos, por meio de `anexos` (polimórfico) |

## Índices previstos

| Coleção | Campos do índice |
|---|---|
| `alunos` | `status`, `nome_busca` |
| `matriculas` | `aluno_id`, `status` |
| `matriculas` | `turma_id`, `status` |
| `turma_oficinas` | `turma_id`, `ativo` |
| `horarios_oficinas` | `turma_oficina_id`, `ativo`, `dia_semana` |
| `registros_atividade` | `turma_id`, `data_atividade DESC` |
| `registros_evolucao` | `aluno_id`, `data_registro DESC` |
| `relatorios_pedagogicos` | `aluno_id`, `tipo_relatorio`, `periodo_fim DESC` |
| `sessoes_chamada` | `turma_id`, `data_chamada DESC` |
| `registros_presenca` | `aluno_id`, `data_chamada DESC` |
| `contatos_familia` | `aluno_id`, `contatado_em DESC` |
| `anexos` | `tipo_proprietario`, `id_proprietario`, `enviado_em DESC` |
| `responsaveis` | `aluno_id`, `principal` |
| `documentos_aluno` | `aluno_id`, `enviado_em DESC` |
| `aluno_oficinas` | `aluno_id`, `status` |
| `aluno_oficinas` | `turma_oficina_id`, `status` |
| `sessoes_chamada` | `turma_oficina_id`, `data_chamada DESC` |
| `modelos_formulario` | `tipo_modelo`, `versao DESC` |

## Critérios de aceite

- [ ] Modelagem documentada com coleções, atributos, tipos e relacionamentos.
- [ ] Firestore configurado no ambiente do projeto.
- [ ] Regras do Firestore negam acesso por padrão.
- [ ] Perfis de Direção, Pedagogia e Administrativo implementados.
- [ ] Dados médicos possuem regras mais restritivas.
- [ ] Arquivos são armazenados no Storage, e não diretamente no Firestore.
- [ ] Relacionamentos aluno-turma e turma-oficina preservam histórico.
- [ ] Não é possível duplicar a presença do aluno em uma mesma chamada.
- [ ] Índices necessários estão declarados em `firestore.indexes.json`.
- [ ] Regras de acesso possuem testes no Firebase Emulator Suite.
- [ ] Backup diário e retenção mínima de 30 dias foram avaliados e configurados no plano disponível.
- [ ] A modelagem foi validada com dados fictícios.

> **Observação:** o backup diário automatizado não deve ser considerado garantido pelo plano gratuito. É necessário validar os recursos e custos atuais do Firebase antes de fechar esse critério.

## Pontos pendentes de validação com a Fundação

- Campos definitivos do relatório pedagógico.
- Formato oficial do formulário de avaliação pedagógica.
- Formato da ficha médica: digitalizada, digitada ou ambos.
- Registro de frequência por turma/dia ou por oficina.
- Níveis utilizados para representar o grau de suporte ou dependência.
- Matriz de acesso aos dados médicos e documentos sensíveis.
- Quantidade de faltas consecutivas que deverá gerar alerta.
- Participação de terapeutas e outros profissionais no controle de acesso.
