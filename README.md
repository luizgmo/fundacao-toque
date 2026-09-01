# Protótipo — Sistema de Gestão Fundação Toque

Protótipo estático (HTML + CSS + JS) do sistema web de gestão da Fundação Toque, conforme o documento de requisitos.

## Como abrir

Não há build nem dependências locais além de CDNs (FontAwesome, Google Fonts).

### Opção 1 — Abrir direto no navegador
Dê duplo clique em `index.html`.

### Opção 2 — Servir localmente (recomendado)
Para evitar problemas com caminhos relativos, rode um servidor local:

```bash
# Python 3
python3 -m http.server 8000

# Ou PHP
php -S localhost:8000
```

Depois abra `http://localhost:8000` no navegador.

## Páginas

| Tela | Arquivo | Função |
|---|---|---|
| Login | `index.html` | Tela de login com seletor de perfil (Direção / Pedagoga / Administrativo) |
| Dashboard | `dashboard.html` | Home pós-login com KPIs, atalhos, tarefas e alertas |
| Alunos — Listar | `alunos/listar.html` | Tabela com filtros, busca e paginação |
| Alunos — Cadastrar | `alunos/cadastrar.html` | Wizard de cadastro em 5 etapas |
| Alunos — Detalhe | `alunos/detalhe.html` | Perfil completo com 6 abas (visão, relatórios, evolução, frequência, atividades, contato) |
| Turmas | `turmas.html` | Cards de turmas + modal de cadastro |
| Oficinas | `oficinas.html` | Cards de oficinas filtráveis + modal |
| Frequência | `frequencia.html` | Chamada com toggle presente/ausente + alerta de faltas recorrentes |
| Evolução | `evolucao.html` | Formulário rápido + timeline de observações |
| Atividades | `atividades.html` | Registro diário de oficinas + upload de fotos |
| Relatórios | `relatorios.html` | Filtros + mockup de PDF de prestação de contas |
| Usuários | `usuarios.html` | Tela restrita à Direção com gestão de perfis |

## Identidade visual

- **Fonte:** Roboto (Google Fonts)
- **Cor primária:** Verde Toque `#2E8B57`
- **Cor secundária (header/footer):** Verde escuro `#1F5E3D`
- **Cor de acento:** Laranja `#F39C12`
- **WhatsApp flutuante:** Verde padrão `#25D366`

As cores estão centralizadas em `assets/css/variables.css` — basta editar as variáveis para re-tematizar.

## Estrutura

```
fundacao-toque/
├── index.html
├── dashboard.html
├── turmas.html
├── oficinas.html
├── frequencia.html
├── evolucao.html
├── atividades.html
├── relatorios.html
├── usuarios.html
├── alunos/
│   ├── listar.html
│   ├── cadastrar.html
│   └── detalhe.html
└── assets/
    ├── css/
    │   ├── variables.css    ← Cores, fontes, espaçamentos
    │   ├── reset.css
    │   ├── layout.css       ← Topbar, sidebar, header, footer
    │   ├── components.css   ← Botões, cards, forms, tabela, modal, tabs, etc.
    │   └── pages.css        ← Estilos específicos por página
    ├── js/
    │   ├── menu.js          ← Toggle sidebar mobile + tabs
    │   ├── modals.js        ← Abrir/fechar modais + toast
    │   ├── interacoes.js    ← Toggle presença, wizard, upload, filtro
    │   └── footer.js        ← Injeta o rodapé padrão
    └── img/
        ├── logo.svg
        ├── logo-branca.svg
        ├── favicon.svg
        └── avatar-padrao.svg
```

## Funcionalidades interativas (apenas simulação visual)

- Login com escolha de perfil (papel salvo em `sessionStorage` para o protótipo)
- Sidebar colapsável no mobile
- Wizard de cadastro em 5 etapas
- Tabs na página de detalhe do aluno
- Toggle presente/ausente na chamada
- Modais (abrir/fechar, ESC, clique fora)
- Toast de confirmação
- Filtro de busca na tabela de alunos
- Upload simulado (arquivos fictícios)
- Alerta de faltas recorrentes (RF12)

## Não implementado (por design)

- Não há backend, banco de dados, autenticação real
- Não há validação real de formulários
- Não há LGPD funcional (apenas checkbox visual)
- Não há testes automatizados
- Não há acessibilidade avançada (WCAG AAA)
- Não há suporte a múltiplos idiomas

## Equipe

Protótipo desenvolvido pela equipe **RootTech** do IFSP Câmpus Araraquara para a disciplina de projeto de extensão, com a Fundação Toque (FUNBESCO).
