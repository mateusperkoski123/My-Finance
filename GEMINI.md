# Gestão Financeira - Documentação do Projeto

Este documento detalha os principais aspectos do projeto **Gestão Financeira**, servindo como base de conhecimento (Knowledge Base) para o contexto do sistema.

## Principais Recursos

- **Gestão de Contas Bancárias**: Criação ilimitada de contas, transferências entre contas e ajustes manuais de saldo. O sistema também oferece extrato detalhado por conta.
- **Categorias e Subcategorias**: Classificação de receitas e despesas com suporte a hierarquia (1 nível de subcategoria), aplicação de cores personalizadas e possibilidade de arquivamento em cascata.
- **Controle de Lançamentos**: Inserção de receitas e despesas de forma avulsa ou parcelada/repetida. Ocorrências geram registros independentes para edição posterior.
- **Dashboards e Gráficos**: Painel inicial interativo para o mês corrente/selecionado com resumos rápidos (saldo, receitas, despesas). Gráficos (Chart.js) visuais de distribuição por categoria e frequência de caixa.
- **Relatórios Gerenciais**: Demonstrativo financeiro mensal e anual estruturado em formato de planilha.
- **Backup e Restauração**: Exportação dos dados financeiros do usuário (contas, lançamentos, categorias) via JSON e importação/mesclagem inteligente na mesma conta.
- **Segurança e Perfil**: Isolamento de dados multi-tenant, atualização de perfil (e-mail, senha) e proteção CSRF nativa.

## Regras de Negócios

1. **Isolamento de Tenant (Multi-Usuário)**: Todo acesso a dados (leitura, escrita e exclusão) deve obrigatoriamente validar o `user_id`. O sistema bloqueia manipulações de IDs pertencentes a terceiros.
2. **Lançamentos de Sistema Automáticos**: Transferências de contas ou ajustes de saldo criam lançamentos sistêmicos em background (read-only) nas listagens. O usuário não pode editá-los diretamente através do painel de lançamentos.
3. **Repetição de Transações**: Ao marcar a opção "Repetir Transação", o sistema processa e registra todos os meses futuros de imediato, em registros desvinculados entre si.
4. **Hierarquia e Saldos de Categoria**: Nos relatórios agregados, o saldo ou montante de uma categoria superior incorpora automaticamente o montante de suas respectivas subcategorias associadas.
5. **Categorias do Sistema**: "Ajuste de Saldo" e "Transferência Bancária" são criadas pelo sistema e protegidas contra deleções e não devem se duplicar após processos de importação.
6. **Conta Predeterminada Obrigatória**: Sempre deve existir ao menos uma conta bancária ativa com `conta_padrao = 1`. Caso a conta padrão seja excluída ou arquivada, outra conta ativa é promovida automaticamente a padrão.
7. **Prevenção de Erros 503 & Integridade de Schemas**: Toda consulta SQL nos controllers/models deve validar os nomes exatos das colunas da tabela MySQL (ex. `l.categoria_id` com join hierárquico em `categorias` via `c.parent_id`). Antes de realizar deploy, a skill `verificacao-sistema` (`node scratch/debug_503.js` e `node scratch/full_system_sweep.js`) deve ser executada para garantir 0 erros 503.

## Páginas (Telas do Sistema)

- **Painel Inicial**: Visão geral mensal (navegação por abas), resumo de totais e listagem dos últimos lançamentos (com paginação e ordenação por valor ou data).
- **Contas Bancárias**: Listagem das contas, saldo atual, opção de arquivar/restaurar e botão de transferência rápida. Modal de extrato individual.
- **Categorias**: Tabela de categorias e subcategorias com status de tipo (receita/despesa/ambos) e limite de gastos.
- **Relatórios**:
  - *Visão Geral*: Gráficos de Receitas vs Despesas (por dia e categoria).
  - *Lançamentos Pendentes*: Agrupamento de todas as contas a pagar/receber abertas no sistema.
  - *Demonstrativo*: Visão tabular contábil (Mensal e Anual) do resultado do período.
- **Divisão de Patrimônio** *(Fase 5 - Placeholder)*: Área reservada para evolução de patrimônio líquido (ativos/passivos).
- **Configurações**: Gerenciamento de idioma, formatação de moeda (suporte a números inteiros vs centavos), personalização do tema (Dark/Light), gestão da conta (perfil) e exportação/importação (Dados).

## Tecnologia Utilizada

- **Backend**: PHP 8.1+ (sem utilização de frameworks). MVC manual (Controllers, Models, Views).
- **Banco de Dados**: MySQL / MariaDB via PDO. Migrations nativas em `database/migrate.php`.
- **Autoloading & Setup**: Composer (PSR-4) mapendo `App\` para `src/`.
- **Frontend / View Layer**: PHP Templates Server-Rendered.
- **Estilização e Interatividade**: Vanilla CSS (com variáveis para os temas) e Vanilla JavaScript (sem React/Vue etc.).
- **Gráficos**: Chart.js carregado via CDN.
- **Servidor Web**: Compatível com Apache (htaccess para rotas) ou PHP Built-in server para dev.

## Design System

O projeto possui seu próprio padrão visual desenhado do zero:
- **Layout Responsivo (Mobile-First)**:
  - **Breakpoint Principal**: `768px` (`@media (max-width: 768px)`).
  - **Padrão de Navegação**:
    - *Desktop*: Menu superior fixo (`.navbar__links`).
    - *Mobile*: Barra de navegação inferior fixa de 60px (`.mobile-bottom-nav`) para rápido acesso com o polegar + gaveta de navegação completa (`.drawer-panel`).
  - **Padrão de Cards**: Tabelas complexas e grids muti-colunas (extratos, lançamentos, contas bancárias) se transformam automaticamente em Cards verticais de 1 coluna em dispositivos móveis.
  - **Padrão de Modais (Bottom Sheet)**: Em telas móveis, modais atuam como *Bottom Sheets* (deslizando do rodapé, ocupando a largura total da tela com border-radius superior de 20px e botões empilhados de 44px).
  - **Touch Targets & Teclado Financeiro**: Todos os botões e inputs no mobile possuem altura mínima de toque de `44px`. Campos financeiros utilizam `inputmode="decimal"` ou `inputmode="numeric"` para acionamento direto do teclado numérico no celular sem quebrar a formatação em tempo real do `app.js`.
  - **Tabelas Contábeis Sticky**: O Demonstrativo Financeiro contábil utiliza contêiner com rolagem horizontal (`overflow-x: auto`) e fixa a primeira coluna (`position: sticky; left: 0`) para preservar a visualização das categorias ao rolar os meses.
- **Tematização**: Suporte nativo a Tema Claro e Tema Escuro implementado puramente via variáveis CSS (Custom Properties como `--shadow` e `--cor`).
- **Componentes Base**: 
  - *Cards (`.card`)*: Elevação e separação de conteúdo (16px border-radius, duas camadas de sombra).
  - *Toggles (`.toggle`)*: Switches elegantes via CSS puro em substituição a checkboxes nativos.
  - *Tags Coloridas (`.lancamento-tag`)*: Combinação do `color-mix(in srgb)` para renderização de cores suaves de fundo das categorias aliada a fontes legíveis.
- **Formatadores Inteligentes**: Inputs financeiros (`data-money`) e rotinas de JavaScript (`gfFormatarValorMoeda`) que formatam, em tempo real e de acordo com a moeda, os inputs na tela enquanto mantêm o cursor no local exato de digitação.
