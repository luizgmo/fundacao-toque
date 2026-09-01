INSTITUTO FEDERAL DE EDUCAÇÃO, CIÊNCIA E TECNOLOGIA DE SÃO PAULO  
CÂMPUS ARARAQUARA

Equipe RootTech  
Cauan Cunha Mendes – AQ3031713  
João Henrique Correa Reis – AQ3029514  
Luiz Gustavo Monico – AQ302993X  
Mateus Costa da Silva – AQ3029425  
Tiago Setti Mendes – AQ3029956  
Victor Rodrigues Herculini – AQ3028968

**DOCUMENTO DE REQUISITOS**

**Sistema Web de Gestão da Fundação Toque**

Araraquara/SP — 2026

# **1\. INTRODUÇÃO**

Este documento tem como objetivo apresentar os requisitos funcionais e não funcionais do sistema web a ser desenvolvido para a Fundação Toque, instituição parceira do projeto de extensão da equipe RootTech.

Os requisitos aqui descritos foram elicitados por meio de uma entrevista e um formulário aplicado à equipe da instituição.

# **2\. OBJETIVO DO SISTEMA**

Desenvolver um sistema web que centralize o cadastro dos alunos assistidos, a organização de turmas e oficinas, o acompanhamento da evolução pedagógica de cada aluno, o controle de frequência e a geração de relatórios para prestação de contas junto a órgãos financiadores, substituindo os controles hoje feitos em pasta física e em documentos de texto (Word).

# **3\. ATORES DO SISTEMA**

Com base nas respostas coletadas, foram identificados os seguintes perfis de usuário do sistema:

* Direção — acesso completo ao sistema, incluindo relatórios de prestação de contas.  
* Pedagogas — cadastro e acompanhamento pedagógico dos alunos, registro de atividades e evolução.  
* Auxiliar administrativo — cadastro de alunos, controle de frequência e documentação.

Estima-se, inicialmente, cerca de 5 profissionais utilizando o sistema regularmente. Este número e os perfis de acesso devem ser confirmados junto à direção, incluindo a participação de terapeutas e demais educadores citados no histórico da instituição.

# **4\. REQUISITOS FUNCIONAIS**

## 4.1. Cadastro de alunos

| ID | Descrição |
| :---- | :---- |
| RF01 \-  Cadastro de alunos | O sistema deve permitir o cadastro de alunos com: nome, data de nascimento, dados do responsável e contato, tipo de deficiência e CID, ficha médica (**FOTO OU DIGITADA – CONSULTAR COM A FUNDACAO**), ficha de matrícula e autorização de uso de imagem em conformidade com a Lei Geral de Proteção de Dados Pessoais (LGPD – Lei nº 13.709/2018). Sugestão inicial (a confirmar com a instituição): tratar a ficha médica como um anexo de arquivo digitalizado (PDF ou imagem) vinculado ao cadastro do aluno.  |
| RF02 \-  Relatório pedagógico | O sistema deve permitir o registro e a consulta do relatório pedagógico de cada aluno. Os dados para o registro do relatório são: **ESPECIFICAR OS DADOS** **Sugestão inicial (a confirmar): data do registro, período avaliado, evolução pedagógica observada, dificuldades e avanços identificados, encaminhamentos e profissional responsável.** |

## 4.2. Turmas e oficinas

| ID | Descrição |
| :---- | :---- |
| RF03 \- 	  Cadastro de turmas  | O sistema deve permitir organizar os alunos em turmas. Os dados para registro de turma são: **identificação da turma, período, responsável (prof?), o que mais? alunos?**. **Sugestão (a confirmar): não incluir a lista de alunos aqui — a vinculação aluno-turma deve ser um atributo no cadastro do aluno (chave estrangeira), evitando duplicidade de dados.** |
| RF04 \-  Cadastro de oficinas/atividades | Cadastro de oficinas/atividades, com os seguintes dados: **ESPECIFICAR DADOS Sugestão inicial (a confirmar): nome da oficina, tipo/categoria (ex.: musicalização, dança, culinária, horta/NEMA, entre outras já oferecidas), profissional responsável, dias e horários, turma(s) vinculada(s).** |
| RF05 \-  Vínculo aluno-oficina | O sistema deve permitir vincular alunos a oficinas/atividades específicas dentro de cada turma, considerando o grau de dependência, o desenvolvimento cognitivo e físico do aluno. **Verificar com os responsáveis como são organizadas as oficinas dentro de cada turma. A partir daí, decidir como as oficinas serão cadastradas e como será feita a associação entre turmas-oficinas.** **Sugestão inicial (a confirmar): a associação poderá ser semanal e por turma, com o aluno vinculado a um conjunto de oficinas conforme seu plano individual, ajustável pela equipe pedagógica.** |
| RF06 \-  Anexo de fotos | O sistema deve permitir anexar fotos aos registros de atividades e relatórios. |
| RF07 \-  Registro diário de atividades por turma | O sistema deve permitir o registro diário das atividades realizadas em cada turma (ex.: "terça de manhã: musicalização e horta"). Os dados para o registro das atividades são: **ESPECIFICAR OS DADOS Sugestão inicial (a confirmar): data, turma, oficina(s) realizada(s), profissional responsável pelo registro, observações gerais (opcional).** |

## 4.3. Acompanhamento de progresso

| ID | Descrição |
| :---- | :---- |
| RF08 \-  Registro de evolução do aluno | O sistema deve permitir o registro de observações/evolução de cada aluno, de forma acessível a toda a equipe. Os dados para o registro são: **ESPECIFICAR OS DADOS Sugestão inicial (a confirmar): data do registro, profissional responsável, área avaliada (ex.: cognitiva, motora, social, comunicação) e descrição da observação.**  |
| RF09 \-  Geração de relatórios de acompanhamento | O sistema deve permitir a geração de relatórios de acompanhamento com periodicidade diária, semestral e anual. |
| RF10 \-  Formulário de avaliação pedagógica | O sistema deve utilizar como base o modelo de formulário de avaliação já adotado pela equipe da Fundação Toque. **INDICAR OS DADOS UTILIZADOS \- CONSULTAR COM A FUNDACAO Enquanto a confirmação não ocorre, sugere-se estruturar o formulário com campos genéricos (ex.: desenvolvimento cognitivo, motor, social, comunicação, autonomia), a serem ajustados após o recebimento do modelo real usado pela equipe.** |

## 4.4. Frequência

| ID | Descrição |
| :---- | :---- |
| RF11 \-  Registro de presença/frequuência | O sistema deve permitir o registro de presença (chamada) dos alunos diariamente: Os dados para o registro são: **ESPECIFICAR OS DADOS (nome do aluno, data, presente ou ausente).** |
| RF12 \-  Registro de contato por faltas | O sistema deve permitir o registro de contato realizado com a família em casos de faltas recorrentes. Sugestão inicial (a confirmar): registrar data da falta, data do contato, responsável pelo contato e observações; disparar alerta à equipe a partir de um número X de faltas consecutivas (valor de X a definir com a instituição). |

## 

## 4.5. Relatórios e prestação de contas

| ID | Descrição |
| :---- | :---- |
| RF13 \-  Relatórios de prestação de contas | O sistema deve gerar relatórios com dados de atividades realizadas, frequência dos alunos e fotos, para fins de prestação de contas à prefeitura, editais e demais financiadores. **Sugestão inicial: relatório filtrável por período, com exportação em PDF, consolidando dados já registrados nas demais funcionalidades (atividades, frequência, fotos).** |

## 4.6. Controle de acesso

| ID | Descrição |  |
| :---- | :---- | :---- |
| RF14 \-  Perfis de acesso do sistema | O sistema deve permitir a criação de perfis de acesso já definidos: Direção, Pedagogas, Administrativo. |  |

# **5\. REQUISITOS NÃO FUNCIONAIS**

| ID | Descrição |
| :---- | :---- |
| RNF01 \-  Acesso via navegador web | O sistema deve ser acessado via navegador web, sem necessidade de instalação local. |
| RNF02 \-  Interface simples e intuitiva | O sistema deve possuir interface simples e intuitiva: cadastros organizados em poucas etapas por tela, linguagem sem termos técnicos, botões e ícones grandes, compatível com uso em computador e tablet.), adequada a usuários sem conhecimento técnico avançado. |

