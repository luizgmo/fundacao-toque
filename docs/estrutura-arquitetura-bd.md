# Fundação Toque — Sistema Web de Gestão

## Estrutura, Arquitetura e Banco de Dados

Equipe RootTech — IFSP Câmpus Araraquara
Disciplina de Projeto de Extensão

---

# 1. Estrutura do Projeto

O repositório do projeto está organizado da seguinte forma:

```
fundacao-toque/
├── src/                        # Aplicação web (React + TypeScript)
│   ├── lib/firebase.ts         # Configuração do SDK do Firebase
│   ├── App.tsx                 # Roteamento/telas principais
│   ├── Frequencia.tsx          # Tela de chamada e contatos por faltas
│   ├── DetalheAluno.tsx        # Perfil completo do aluno
│   └── students-data.ts        # Dados de apoio das telas
├── prototipo/                  # Protótipo estático (HTML/CSS/JS)
│   ├── alunos/                 # Listar, cadastrar e detalhar alunos
│   ├── frequencia.html         # Chamada com presente/ausente
│   ├── evolucao.html           # Registro de evolução pedagógica
│   ├── atividades.html         # Registro diário + upload de fotos
│   ├── relatorios.html         # Prestação de contas (PDF)
│   ├── usuarios.html           # Gestão de perfis (Direção)
│   └── Documento_de_Requisitos_Fundacao_Toque.md
├── scripts/
│   └── seed-firestore.mjs      # População/limpeza do banco com dados fictícios
├── firestore.rules             # Regras de segurança (controle de acesso)
├── firestore.indexes.json      # Índices compostos declarados
├── firebase.json               # Configuração do Firebase CLI
├── modelagem.md                # Documentação da modelagem do banco
└── package.json                # Dependências e scripts
```

### Telas do sistema (perfis de acesso)

| Perfil | Telas e funcionalidades |
|---|---|
| Direção | Acesso completo; gestão de usuários; relatórios de prestação de contas |
| Pedagogia | Cadastro e acompanhamento pedagógico, evolução, oficinas |
| Administrativo | Cadastro de alunos, frequência, documentação |

---

# 2. Arquitetura

## 2.1. Visão geral

A arquitetura é **serverless**, sem servidor próprio: toda a infraestrutura de backend é fornecida pela plataforma Firebase (Google Cloud). O sistema é uma aplicação web **SPA** (Single Page Application) que conversa diretamente com os serviços do Firebase pela internet.

```
┌─────────────────────────────┐
│   Navegador (equipe)        │
│   React + TypeScript (SPA)  │
└──────────────┬──────────────┘
               │ HTTPS / SDK Web
               ▼
┌─────────────────────────────────────────────┐
│                 FIREBASE                    │
│  ┌───────────────┐  ┌────────────────────┐  │
│  │ Authentication│  │ Cloud Firestore    │  │
│  │ (login/perfis)│  │ (banco NoSQL de    │  │
│  └───────────────┘  │  documentos)       │  │
│                     └────────────────────┘  │
│  ┌───────────────┐  ┌────────────────────┐  │
│  │ anexos em     │  │ Security Rules     │  │
│  │ partes no     │  │ (controle de acesso│  │
│  │ Firestore     │  │  por perfil)       │  │
│                     └────────────────────┘  │
└─────────────────────────────────────────────┘
```

## 2.2. Stack tecnológica

| Camada | Tecnologia | Função |
|---|---|---|
| Front-end | React 19 + TypeScript + Vite | Interface web responsiva (computador e tablet) |
| Autenticação | Firebase Authentication | Login com e-mail/senha; perfis de acesso |
| Banco de dados | Cloud Firestore (NoSQL, documentos) | Alunos, turmas, oficinas, frequência, evolução |
| Arquivos | Cloud Firestore | Metadados e conteúdo em partes de até 600 KiB por documento |
| Segurança | Firestore Security Rules | Permissões por perfil (negar por padrão) |
| Ferramentas | Firebase CLI + Emulator Suite | Deploy, testes de regras e desenvolvimento local |
| Seed de dados | Node.js (script próprio) | População do banco com dados fictícios (LGPD) |

## 2.3. Decisões de arquitetura

**Por que Firestore (NoSQL) e não um banco relacional?**

- Escala pequena (cerca de 5 profissionais e algumas dezenas de alunos) — as limitações de consultas do NoSQL não impactam o sistema;
- Modelagem flexível: os requisitos ainda estão em definição com a Fundação, e documentos NoSQL absorvem mudanças de campos sem migrations;
- Autenticação, banco, arquivos e controle de acesso integrados em uma única plataforma, com plano gratuito;
- Regras de segurança declarativas (Security Rules), aplicadas no servidor do Firebase, independentes do front-end.

**Padrões adotados:**

- **Negar por padrão (deny-by-default):** toda requisição é negada a menos que uma regra autorize explicitamente;
- **Dados sensíveis isolados:** a ficha médica fica em subcoleção própria, com regras mais restritivas (LGPD);
- **Dados que pertencem a um pai ficam embutidos ou em subcoleções** (ex.: presenças dentro da sessão de chamada), reduzindo o número de coleções e de consultas;
- **Datas puras como string `YYYY-MM-DD`** (evita problemas de fuso horário do Timestamp UTC) e data-hora como `Timestamp`;
- **Auditoria padronizada:** documentos alteráveis possuem `criado_em/criado_por/atualizado_em/atualizado_por`.

## 2.4. Segurança e LGPD

- Perfis de acesso: **Direção**, **Pedagogia** e **Administrativo**, definidos no campo `papel` do usuário;
- Regras de leitura/escrita distintas por coleção (ex.: apenas a Direção apaga registros e gerencia usuários);
- Ficha médica: leitura e escrita restritas a Direção e Pedagogia; anexo armazenado no Firebase Storage e metadados no Firestore;
- Nenhum dado pessoal real é usado em desenvolvimento — apenas dados fictícios;
- A ficha médica usa o Firebase Storage apenas para o anexo (PDF/JPG/PNG/WEBP, até 10 MiB), mantendo no Firestore somente metadados e o caminho do arquivo. Fotos e anexos de atividade/relatório continuam no Firestore: metadados em `anexos/{id}` e conteúdo dividido na subcoleção `chunks`, respeitando o limite de 1 MiB por documento. Documentos do cadastro de alunos são Data URLs em documentos limitados a 500 KiB.

---

# 3. Banco de Dados (Cloud Firestore)

## 3.1. Modelo de dados

Firestore é um banco **NoSQL orientado a documentos**: os dados vivem em **coleções** (pastas) que contêm **documentos** (registros), identificados por IDs. Não há tabelas, joins nem schema fixo — relacionamentos são representados por IDs e por subcoleções.

O modelo segue o princípio: **dados que só fazem sentido dentro de um pai não ganham coleção própria** — viram subcoleção (listas independentes) ou campo embutido (poucos itens, limitados ao pai).

## 3.2. Coleções e subcoleções

```
usuarios/{uid}
alunos/{aluno_id}
├── ficha_medica/{ficha}        (subcoleção 1:1 — dados sensíveis)
├── responsaveis/{responsavel_id}
└── documentos/{documento_id}
turmas/{turma_id}
oficinas/{oficina_id}
turma_oficinas/{turma_oficina_id}     (com horários embutidos)
matriculas/{matricula_id}
aluno_oficinas/{vinculo_id}
registros_atividade/{registro_id}
└── anexos/{anexo_id}
    └── chunks/{parte_id}          (conteúdo Base64 em partes <= 600 KiB)
registros_evolucao/{registro_evolucao_id}
modelos_formulario/{modelo_id}
relatorios_pedagogicos/{relatorio_id}
└── anexos/{anexo_id}
    └── chunks/{parte_id}          (conteúdo Base64 em partes <= 600 KiB)
sessoes_chamada/{sessao_id}           (com presenças embutidas)
contatos_familia/{contato_id}
relatorios_gerados/{relatorio_gerado_id}
configuracoes_sistema/geral
```

## 3.3. Principais atributos

**usuarios/{uid}** — ID igual ao UID do Firebase Authentication

```
nome_completo: string          obrigatório
email: string                  obrigatório
papel: string                  obrigatório (direcao | pedagogia | administrativo)
ativo: boolean                 obrigatório
trocar_senha: boolean          opcional (true = senha provisória criada pela Direção)
ultimo_login_em: Timestamp     opcional
criado_em / atualizado_em: Timestamp
```

**alunos/{aluno_id}**

```
nome_completo: string          obrigatório
nome_busca: string             obrigatório (sem acentos, minúsculas — auxilia busca)
data_nascimento: string        obrigatório (YYYY-MM-DD)
status: string                 obrigatório (ativo | inativo)
uso_imagem_autorizado: boolean obrigatório (LGPD)
consentimento_imagem_em: Timestamp (opcional)
caminho_foto: string           opcional (referência do arquivo no Firestore)
```

**alunos/{aluno_id}/ficha_medica/{ficha}** — subcoleção com regras restritivas

```
tipos_deficiencia: array<string>      obrigatório
codigos_cid: array<string>            opcional
formato_ficha_medica: string          opcional (anexo | digital)
dados_ficha_medica: map               opcional
```

**alunos/{aluno_id}/responsaveis/{responsavel_id}**

```
nome_completo, parentesco, telefone,
telefone_alternativo (opcional), email (opcional), principal: boolean
```

**alunos/{aluno_id}/documentos/{documento_id}**

```
tipo_documento: string        (ficha_medica | ficha_matricula | autorizacao_imagem | outro)
armazenamento: "firestore", status: enviando | disponivel, total_partes
tamanho_bytes, nome_arquivo_original, tipo_conteudo, enviado_por, enviado_em
```

**turmas/{turma_id}**

```
codigo, nome, periodo (manha | tarde | integral),
ids_usuarios_responsaveis: array<string>, data_inicio, data_fim (opcional), ativo
```

**oficinas/{oficina_id}**

```
nome, categoria (musicalizacao, danca, culinaria, horta...),
descricao (opcional), ids_usuarios_responsaveis, ativo
```

**turma_oficinas/{turma_oficina_id}** — vínculo N:N entre turma e oficina

```
turma_id, oficina_id, ids_usuarios_responsaveis, ativo
horarios: array<map>          EMBUTIDO — cada item:
  { dia_semana (1 a 7), hora_inicio (HH:mm), hora_fim, valido_de, valido_ate }
```

**matriculas/{matricula_id}** — histórico de vínculo aluno ↔ turma

```
aluno_id, turma_id, data_inicio, data_fim (opcional)
status (ativo | concluido | cancelado)
```

**aluno_oficinas/{vinculo_id}** — plano individual de oficinas do aluno

```
aluno_id, turma_oficina_id, data_inicio, data_fim (opcional)
status (ativo | concluido | cancelado)
nivel_suporte (opcional), consideracoes_pedagogicas (opcional), atribuido_por
```

**registros_atividade/{registro_id}** — registro diário por turma

```
data_atividade: string        (YYYY-MM-DD)
turma_id, ids_turma_oficinas: array<string> (opcional)
usuario_responsavel_id, observacoes_gerais (opcional)
```

**sessoes_chamada/{sessao_id}** — chamada diária ou por oficina

```
data_chamada: string          (YYYY-MM-DD)
turma_id, escopo (turma | oficina), turma_oficina_id (se oficina)
presencas: map                EMBUTIDO — { aluno_id: presente | ausente | justificado }
observacoes: map              opcional — { aluno_id: observação individual }
registrado_por
```

> As presenças ficam **embutidas na sessão**: um único documento por chamada permite montar a tela de chamada inteira com uma leitura, e torna impossível registrar a mesma presença duas vezes.

**registros_evolucao/{registro_evolucao_id}**

```
aluno_id, data_registro (YYYY-MM-DD), profissional_usuario_id, profissional_nome
area (cognitiva | motora | social | comunicacao | autonomia | outra)
observacao
criado_por, criado_em, atualizado_por, atualizado_em
```

> O lançamento é **imutável**: correções são feitas por um novo registro. O profissional e a autoria são sempre o usuário autenticado.

**modelos_formulario/{modelo_id}** — formulários versionados

```
nome, tipo_modelo (avaliacao_pedagogica), versao: number, ativo
campos: array<map> — cada item: { chave, rotulo, tipo, obrigatorio, opcoes }
```

> Como o formulário oficial da Fundação ainda será definido, os modelos são versionados e as respostas ficam gravadas como `map` no relatório — o sistema se adapta sem alteração de estrutura.

**relatorios_pedagogicos/{relatorio_id}**

```
aluno_id, tipo_relatorio (diario | semestral | anual)
periodo_inicio, periodo_fim (YYYY-MM-DD)
evolucao, dificuldades, avancos, encaminhamentos (opcionais)
usuario_responsavel_id, modelo_formulario_id + versao, respostas: map
status (rascunho | concluido)
```

**contatos_familia/{contato_id}** — contatos por faltas recorrentes

```
aluno_id, responsavel_id (opcional)
datas_faltas_relacionadas: array<string> (YYYY-MM-DD)
contatado_em: Timestamp, meio_contato (telefone | whatsapp | email | presencial | outro)
observacoes, usuario_responsavel_id
```

**relatorios_gerados/{relatorio_gerado_id}** — prestação de contas

```
tipo_relatorio (acompanhamento_aluno | prestacao_contas)
periodo_inicio, periodo_fim, filtros: map (opcional)
status (processando | concluido | falhou)
gerado_por, gerado_em
```

O PDF é gerado no navegador e não é persistido. O documento registra apenas metadados; a
regeneração reutiliza `filtros` e o período e cria um novo registro. A Direção pode ler, criar e
excluir; a atualização é restrita à transição `processando -> concluido|falhou`, sem alterar
filtros, período ou autor.

**configuracoes_sistema/geral**

```
modo_chamada (diaria | oficina)
limite_faltas_consecutivas: number   (dispara alerta à equipe)
```

## 3.4. Relacionamentos

| Origem | Relacionamento | Como é representado |
|---|---|---|
| Aluno | 1:1 | Ficha médica — subcoleção `ficha_medica` |
| Aluno | 1:N | Responsáveis — subcoleção `responsaveis` |
| Aluno | 1:N | Documentos — subcoleção `documentos` |
| Aluno | N:N | Turmas — coleção `matriculas` (preserva histórico) |
| Turma | N:N | Oficinas — coleção `turma_oficinas` (horários embutidos) |
| Aluno | N:N | Oficinas — coleção `aluno_oficinas` |
| Turma | 1:N | Registros de atividade |
| Atividade / Relatório | 1:N | Anexos — subcoleções `anexos` |
| Sessão de chamada | embutido | Presenças no map `presencas` da própria sessão |
| Aluno | 1:N | Contatos com a família |

## 3.5. Índices compostos declarados

Definidos em `firestore.indexes.json` e aplicados automaticamente no deploy:

| Coleção | Campos |
|---|---|
| alunos | status ASC, nome_busca ASC |
| matriculas | aluno_id ASC, status ASC |
| matriculas | turma_id ASC, status ASC |
| turma_oficinas | turma_id ASC, ativo ASC |
| registros_atividade | turma_id ASC, data_atividade DESC |
| registros_evolucao | aluno_id ASC, data_registro DESC |
| relatorios_pedagogicos | aluno_id ASC, tipo_relatorio ASC, periodo_fim DESC |
| sessoes_chamada | turma_id ASC, data_chamada DESC |
| sessoes_chamada | turma_oficina_id ASC, data_chamada DESC |
| contatos_familia | aluno_id ASC, contatado_em DESC |
| aluno_oficinas | aluno_id ASC, status ASC |
| aluno_oficinas | turma_oficina_id ASC, status ASC |
| modelos_formulario | tipo_modelo ASC, versao DESC |

## 3.6. Controle de acesso (Security Rules)

Arquivo `firestore.rules` — nega tudo por padrão. **A matriz abaixo é a proposta técnica em implementação e ainda requer validação formal da Fundação; não deve ser tratada como matriz aprovada nem prova das regras publicadas no Firebase.** Usuário deve ter perfil existente, papel reconhecido e `ativo == true` para acessar dados operacionais. O perfil próprio pode ser consultado para autenticação; a listagem/gestão de perfis é reservada à Direção.

| Recurso | Leitura | Escrita |
|---|---|---|
| usuarios | próprio perfil mínimo; Direção lista/consulta equipe | Direção; usuário não altera seu papel/ativo; exclusão negada |
| usuarios_publicos | diretório mínimo (nome, papel e ativo) para papéis ativos | Direção provisiona/sincroniza; exclusão negada |
| alunos | papéis ativos | Direção/Administrativo criam e excluem; três papéis atualizam |
| ficha_medica | Direção + Pedagogia | Direção/Pedagogia criam/editam; anexo no Storage; Administrativo sem acesso |
| responsáveis / documentos | papéis ativos | Direção/Administrativo |
| turmas, oficinas, turma_oficinas, matriculas | papéis ativos | Direção, Pedagogia ou Administrativo |
| aluno_oficinas | papéis ativos | Direção/Pedagogia |
| registros_atividade e anexos | papéis ativos | papéis ativos criam/atualizam atividade; exclusão e alterações de anexo reservadas à Direção |
| registros_evolucao | papéis ativos | Direção/Pedagogia criam; registros imutáveis (sem update/delete) |
| modelos_formulario | papéis ativos | Direção/Pedagogia |
| relatorios_pedagogicos e anexos | Direção/Pedagogia | Direção/Pedagogia; exclusão do relatório reservada à Direção |
| sessoes_chamada (frequência) | papéis ativos | Direção, Pedagogia ou Administrativo |
| contatos_familia | papéis ativos | três papéis criam; atualização negada para preservar histórico; exclusão Direção |
| relatorios_gerados | Direção | Direção cria/exclui; atualização só de `status`/`gerado_em` na transição `processando -> concluido\|falhou` |
| configuracoes_sistema | Direção | Direção |

Essa matriz descreve a configuração local em implementação, e não cobre ainda escopo por turma, autorização de campos individuais ou remoção física de dados médicos legados no documento `alunos`. O Firestore não mascara campos individuais de um documento autorizado para leitura. A aplicação deixou de gravar e de exibir dados médicos no cadastro comum e oculta documentos embutidos com `tipo_documento == 'ficha_medica'`, mas remover as cópias antigas ainda requer migração e validação próprias. O provisionamento da primeira conta de Direção deve ocorrer por canal confiável, fora da tela pública. Usuários já existentes precisam de um backfill confiável para `usuarios_publicos` antes de seus nomes aparecerem nos seletores; a tela atual de provisionamento grava essa projeção para novas contas.

Em 10/11/2026, o usuário aprovou que Direção e Pedagogia consultem CID, deficiência e ficha médica. A escrita da ficha também foi restrita a esses dois papéis, com anexo no Firebase Storage. Dados médicos legados duplicados no documento de `alunos` continuam legíveis no nível do Firestore por papéis ativos até a migração, embora a interface não os exiba mais.

## 3.7. População e teste do banco (seed)

O script `scripts/seed-firestore.mjs` popula o banco com **dados fictícios** (conforme LGPD, nenhum dado real), permitindo validar a modelagem e desenvolver as telas:

| Comando | Função |
|---|---|
| `npm run seed` | Popula o banco (via acesso administrativo) |
| `npm run seed:reset` | Remove apenas os documentos criados pelo seed |
| `npm run seed:cleanup` | Limpeza completa, incluindo coleções legadas e subcoleções órfãs |

O script valida o modelo ponta a ponta: alunos com ficha médica e responsáveis, turmas, oficinas com horários, matrículas, chamadas com presenças embutidas, contatos por falta, evolução, formulário versionado e relatório pedagógico.

## 3.8. Pendências de validação com a Fundação

- Campos definitivos do relatório pedagógico e formato oficial do formulário de avaliação;
- Validação formal dos campos da ficha médica (o sistema já aceita anexo digitalizado ou preenchimento digital);
- Registro de frequência por turma/dia ou por oficina;
- Níveis de suporte/dependência dos alunos;
- Matriz de acesso aos dados médicos (participação de terapeutas);
- Quantidade de faltas consecutivas que dispara alerta;
- Estratégia de backup (o plano gratuito do Firebase não inclui backup diário automático).

---

*Documento gerado a partir da modelagem oficial do projeto (`modelagem.md`) e do código-fonte do repositório.*




