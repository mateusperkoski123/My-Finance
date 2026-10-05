# Gestão Financeira

Sistema de gestão financeira multiusuário (Node.js + MySQL), com painel mensal,
contas, categorias e subcategorias, relatórios, assinaturas/planos, Chat IA,
Comunidade e app instalável (PWA/Capacitor) com modo offline e sincronização.
Sem integração com bancos (Open Finance).

## Stack

- Node.js + Express 4, views server-rendered em EJS (`express-ejs-layouts`)
- MySQL/MariaDB via `mysql2`, sessões em MySQL (`express-session` +
  `express-mysql-session`)
- Segurança: `helmet`, `express-rate-limit`, CSRF próprio, `bcryptjs`
- Chat IA: Anthropic Claude (`@anthropic-ai/sdk`); transcrição de áudio via
  Gemini (`@google/genai`) ou OpenAI
- E-mails com `nodemailer` (SMTP)
- Frontend: CSS próprio (tema claro/escuro), Chart.js, JS simples em
  `public/assets/js/` (offline, sync, PWA) e service worker
- i18n próprio (pt-BR / es-PY / en-US) em `src/node/core/i18n*.js`
- Produção: pm2 em cluster (`ecosystem.config.js`)

## Rodando localmente

Requisitos: Node.js 18+ e um MySQL/MariaDB acessível.

1. Instale as dependências:
   ```
   npm install
   ```
2. Copie `.env.example` para `.env` e ajuste as variáveis (veja a seção
   abaixo). O banco informado em `DB_NAME` precisa existir.
3. Inicie o servidor:
   ```
   npm start        # produção
   npm run dev      # desenvolvimento, reinicia ao salvar (node --watch)
   ```
   Ao iniciar, as migrations pendentes de `database/migrations/` são aplicadas
   automaticamente (não há comando separado).
4. Acesse `http://localhost:3000`, crie sua conta e faça login.

### Variáveis de ambiente (`.env`)

Todas estão documentadas em `.env.example`. As principais:

- `PORT`, `NODE_ENV`, `SESSION_SECRET`
- `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`
- `ADMIN_EMAILS`: e-mails que viram administradores ao iniciar
- `SMTP_*`: envio de e-mails (sem isso, aparecem só no log)
- `ANTHROPIC_API_KEY`, `IA_MODELO`, `IA_LIMITE_MENSAGENS_MES`: Chat IA
- `GEMINI_API_KEY` / `OPENAI_API_KEY`: transcrição de áudio do Chat IA

## Deploy (Hostinger, Node.js)

1. No hPanel, crie o banco MySQL e anote host/nome/usuário/senha. No servidor
   o app deve conectar em `127.0.0.1:3306`.
2. Envie o projeto (Git ou upload), sem `node_modules/` e sem `.env`.
3. Configure as variáveis de ambiente do `.env.example` no painel do app Node.js
   (`NODE_ENV=production`, credenciais do banco, `SESSION_SECRET` forte etc.).
4. Rode `npm install --omit=dev` e inicie com `server.js` (ou
   `pm2 start ecosystem.config.js --env production`).
5. **Faça backup do banco antes do primeiro deploy**: as migrations rodam
   sozinhas na inicialização (só mudanças aditivas, com trava para o pm2 em
   cluster).
6. Ative o SSL no hPanel e teste cadastro/login e o fluxo ponta a ponta.

## Estrutura

```
server.js            # entrada: Express, sessão, migrations, PWA (manifest)
ecosystem.config.js  # pm2 (cluster)
src/node/
  config/            # conexão MySQL
  controllers/       # regras de cada módulo (auth, contas, IA, admin, API do app...)
  core/              # helpers, i18n, IA, e-mail, migrator, regras de negócio
  middleware/        # auth, CSRF, i18n, conta ativa, limites
  models/            # acesso ao banco
  routes/index.js    # todas as rotas
views/               # templates EJS
public/              # CSS, JS (offline/sync/PWA), ícones e service worker
database/migrations/ # migrations SQL (aplicadas automaticamente)
docs/                # prompts e especificações de módulos
```

## Etapas do projeto

> Histórico das fases iniciais, escrito quando o sistema era PHP. Nomes como
> `App\Core\*`, `Lancamento::...` e `views/*.php` referem-se a essa versão
> antiga, já removida; a lógica equivalente hoje está em `src/node/`.

- [x] Fase 0 — Fundação: estrutura, login/cadastro, layout com as 6 abas,
      Configurações → Preferência (idioma, moeda, tema claro/escuro), sistema
      de traduções (pt-BR/es-PY/en-US) e formatação de moeda
- [x] Fase 1 — Contas Bancárias: CRUD completo, contas ilimitadas, conta
      padrão, ajustar saldo, transferência entre contas, arquivar/restaurar,
      extrato (histórico) por conta com data de criação/última modificação,
      valores em formato inteiro para moedas sem centavos (ex.: Guarani)
- [x] Fase 2 — Categorias e subcategorias: CRUD ilimitado (1 nível de
      subcategoria), cor, tipo (receita/despesa/ambas), limite de gasto
      opcional, busca e filtros, arquivar/restaurar em cascata, categorias
      de sistema (Ajuste de Saldo, Transferência Bancária) já ligadas aos
      lançamentos automáticos de Contas Bancárias
- [x] Fase 3 — Painel Inicial: navegador de mês (mês anterior/próximo/hoje ou
      intervalo customizado via data_inicio/data_fim), cards de resumo
      (saldo anterior, receitas recebidas/a receber, despesas pagas/não
      pagas, saldo disponível, saldo previsto), CRUD completo de
      lançamentos manuais (receita/despesa: conta, categoria/subcategoria,
      valor, data, status pago/pendente, "fixa" — flag informativa —,
      observações), atalho "marcar como pago", filtro por tipo e busca por
      descrição; lançamentos automáticos (ajuste/transferência, gerados em
      Contas Bancárias) aparecem na lista só para leitura, sem opção de
      editar/excluir (modal redesenhado na seção "Pós-Fase 7" abaixo;
      ordenação por valor, paginação, faixa de meses e mini gráfico lateral
      adicionados na seção "Fase 9" abaixo)
- [x] Fase 4 — Relatórios: navegador de período (reaproveita a mesma lógica
      de resolução de mês/ano ou intervalo customizado do Painel, extraída
      para `App\Core\Periodo`), gráficos donut de despesas e de receitas por
      categoria de nível superior (soma subcategorias na categoria-pai;
      lançamentos sem categoria entram como "Sem categoria") com legenda
      (cor, nome, valor, percentual, do maior pro menor), gráfico de
      frequência receitas x despesas por dia com alternância coluna/linha
      client-side (Chart.js via CDN, apenas lib de renderização, sem envio
      de dados), aba "Lançamentos pendentes" (todos os pendentes,
      independente do período navegado) e aba "Demonstrativo Financeiro"
      (total de receitas − total de despesas = resultado do período,
      detalhado por categoria de nível superior)
- [ ] Fase 5 — Aba "Divisão de Patrimônio" (placeholder — tela existe no
      menu, sem funcionalidade ainda; fora de escopo por ora)
- [x] Fase 6 — Configurações completas: sub-aba "Meu perfil" (editar nome/
      e-mail com validação de formato e de e-mail já em uso por outro
      usuário, troca de senha com conferência da senha atual e confirmação
      da nova) e sub-aba "Dados" (exportar backup completo em JSON —
      perfil sem a senha, contas, categorias e lançamentos — e importar de
      volta como "merge aditivo": cada item do arquivo vira um novo
      registro do usuário logado, com remapeamento de ids, sem duplicar
      categorias de sistema e religando pares de transferência quando os
      dois lados estão no mesmo arquivo); menu lateral de Configurações
      extraído para partial compartilhado entre as 3 sub-abas
- [x] Fase 7 — Polimento e preparação para escalar: revisão linha a linha
      de todos os Controllers e Models confirmando que toda query que toca
      contas/categorias/lançamentos filtra por `user_id` e que toda rota
      com `{id}` valida a posse do registro antes de agir sobre ele; teste
      ativo de isolamento multi-tenant (2 usuários de teste via curl —
      tentativas de ler/editar/arquivar conta e categoria alheias, criar
      lançamento usando `conta_id`/`categoria_id` de outro usuário, criar
      subcategoria com `parent_id` alheio, adulterar saldo/transferência
      de conta alheia — todas bloqueadas corretamente; nenhuma falha de
      isolamento encontrada) e de CSRF (POST sem token e com token inválido
      corretamente rejeitados); reforço de responsividade mobile em
      `app.css` (navbar do usuário, linha de categoria/subcategoria, ações
      de conta, canvas dos gráficos e cabeçalhos de página em telas
      ≲480px — a tabela de extrato e os grids principais já usavam
      `overflow-x: auto` e `auto-fill/auto-fit`, que resolviam a maior
      parte do problema); teste de fumaça ponta a ponta completo (cadastro
      → login → preferências → contas → categorias/subcategorias →
      lançamentos → dashboard → transferência → ajuste de saldo → extrato
      → relatórios (gráficos/pendentes/demonstrativo) → perfil → exportar/
      importar backup → arquivar/restaurar → excluir lançamento → logout →
      login), sem nenhum PHP Warning/Notice/Fatal error encontrado; `php -l`
      limpo em todos os arquivos do projeto

### Pós-Fase 7 — Modal de lançamento redesenhado + Demonstrativo Anual

Ajustes pedidos depois do polimento, pra aproximar o Painel Inicial e os
Relatórios do app de referência:

- **Modal de lançamento (nova/editar receita e despesa)**: campos
  reorganizados (valor em destaque, categoria + subcategoria dependentes via
  JS, data de vencimento, data de competência movida pro fim com texto de
  ajuda) e três controles viraram toggle switch (`.toggle`, componente CSS
  novo reutilizável): "não foi paga/recebida" (equivalente ao status
  pago/pendente), "receita/despesa fixa" (a antiga flag `recorrente`, sem
  mudança de comportamento) e **"repetir transação"** — esse sim com lógica
  nova de verdade: ao ativar e escolher uma quantidade (2 a 60), o sistema
  cria os lançamentos futuros automaticamente, um por mês
  (`Lancamento::criarComRepeticao()`), cada um independente (editável/
  excluível normalmente, sem vínculo entre as ocorrências).
- **Relatórios → nova aba "Demonstrativo Anual"**: tabela categoria × mês
  (Jan–Dez) do ano selecionado, com navegação por ano, categorias de nível
  superior expansíveis (clique pra revelar as subcategorias, JS puro),
  seções de Receitas e Despesas com subtotal, e linha final de Saldo mensal.
  Considera só lançamentos tipo receita/despesa (ajuste/transferência ficam
  de fora, mantendo consistência com o resto do sistema).
- Durante a implementação, dois bugs reais foram encontrados e corrigidos
  antes de considerar a fase concluída: (1) o modal de edição usava dados de
  `Lancamento::listarPorPeriodo()`, que não trazia `categoria_parent_id` —
  a subcategoria nunca vinha pré-selecionada; (2) o subtotal da tabela anual
  somava só o valor direto da categoria-pai, ignorando os lançamentos das
  subcategorias (a linha "Saldo", calculada à parte no Model, já estava
  correta — só os subtotais de seção e o total do ano estavam errados).

Fora de escopo por enquanto (propositalmente): Open Finance / bancos
conectados, importação automática de OFX, Chat IA, Comunidade, Indicar
Amigos, Metas, Investimentos, Cartão de Crédito, Limites de Gastos, planos
pagos/multi-usuário comercial (o login já é multiusuário na base — cada
conta enxerga só os próprios dados —, mas não há tela de "convidar outro
usuário" nem qualquer lógica de cobrança).

### Fase 9 — Campo de valor formatado + aproximação visual do MyFinance

Corrige um bug real (campos de valor monetário mostrando o número puro
digitado em vez de formatado) e aproxima mais o visual/comportamento do
Painel Inicial do app de referência (MyFinance), em 5 partes:

- **Parte A — Campo de valor com formatação ao vivo**: os 9 inputs de
  dinheiro do sistema (`views/contas/_modal_*`, `views/categorias/_modal_*`,
  `views/dashboard/_modal_*`) ganharam `data-money` e passaram a formatar o
  valor em tempo real enquanto o usuário digita (separador de milhar +
  símbolo da moeda), via `gfFormatarValorMoeda()`/`gfAplicarFormatacaoMoeda()`
  novas em `app.js` (preservam a posição do cursor). `App\Core\Money` ganhou
  `paraFloat()` (parser único e robusto — entende `"10000"`, `"₲ 10.000"`,
  `"R$ 1.234,56"` etc. conforme a moeda ativa) e `configParaJs()`; os 3
  `paraFloat()` privados que existiam duplicados em `ContasController`,
  `CategoriasController` e `DashboardController` foram removidos.
- **Parte B — Linha de meses no Painel Inicial**: faixa horizontal rolável
  (`.meses-tira`) acima dos cards de resumo, com uma janela de 11 meses (5
  antes + o mês navegado + 5 depois) mostrando o total de despesas de cada
  um (`Lancamento::totalDespesasMes()`) e destacando visualmente o mês
  selecionado; só aparece no modo mês/ano (não em intervalo customizado via
  data_inicio/data_fim, que não tem um "mês central" único).
- **Parte C — Mini gráfico lateral no Painel Inicial**: o Painel virou um
  layout de 2 colunas (`.painel-layout`: lista de lançamentos + um novo
  card `.painel-lateral`, colapsa pra 1 coluna abaixo de ~960px) com um
  donut Chart.js compacto no card lateral e 3 abas simplificadas (Todas/
  Receitas/Despesas — a referência tem 7, incluindo pagas/não pagas
  separadas), reaproveitando os totais que `Lancamento::resumoPeriodo()` já
  calculava, sem nenhuma query nova. A troca de aba é 100% client-side: os
  3 conjuntos de dados (valores + já formatados na moeda atual) são
  embutidos como JSON inline na página.
- **Parte D — Ordenação por valor + paginação**: lacuna do plano original da
  Fase 3, fechada agora. `Lancamento::listarPorPeriodo()` ganhou os
  parâmetros `$ordenacao` ('data'|'valor', por valor absoluto decrescente) e
  `$pagina`/`$porPagina` (30 por página, com `LIMIT`/`OFFSET` bindados como
  `PDO::PARAM_INT`); nova `Lancamento::contarPorPeriodo()` calcula o total de
  páginas com os mesmos filtros de tipo/busca. A view ganhou um toggle
  "Data"/"Valor" e um rodapé de paginação (Mostrar 30 · Total: X · ←
  Voltar · Próximo →), ambos preservando período/filtros/ordenação atuais
  nos links.
- **Parte E — Polimento visual (só CSS)**: as tags de categoria
  (`.lancamento-tag`) ganharam fundo colorido suave (`color-mix(in srgb,
  var(--cor) 18%, transparent)`) com o texto na cor cheia da categoria por
  cima, em vez de só um pontinho + texto cinza neutro; ajuste fino de
  sombra (`--shadow`, agora em 2 camadas pra mais "elevação"), raio de
  borda dos `.card` (14px → 16px) e espaçamento vertical entre cards/seções.

Dois problemas reais foram encontrados e corrigidos durante a implementação
das Partes B–E:
1. **Pegadinha clássica do PDO**: bindar `:limite`/`:offset` via
   `PDOStatement::bindValue()` e depois chamar `execute($array)` pros demais
   parâmetros no mesmo statement gera `SQLSTATE[HY093]: Invalid parameter
   number` (documentado no próprio manual do PHP — as duas formas de
   vincular parâmetro não podem ser misturadas). Corrigido bindando *todos*
   os parâmetros explicitamente e chamando `execute()` sem argumentos.
2. **Custom property de CSS não "sobe" no DOM**: a cor da categoria (`--cor`)
   era declarada inline só no `<span class="categoria-dot">` (filho); um
   `.lancamento-tag` (pai) não consegue ler `var(--cor)` de um descendente
   via CSS puro. Ajuste mínimo (mesmo valor, duplicado — não movido — para
   preservar a cor do pontinho): o atributo inline `--cor` passou a existir
   também no `<span class="lancamento-tag">`, em `views/dashboard/index.php`
   e `views/relatorios/index.php`.

## Roadmap / próximos passos sugeridos

Não implementados — apenas ideias para o usuário avaliar e priorizar
quando (e se) quiser continuar evoluindo o projeto:

- **Deploy em produção**: seguir a seção "Deploy (Hostinger, Node.js)" acima.
- **Recorrência mais robusta**: "Repetir Transação" já gera N lançamentos
  mensais de uma vez na criação, mas cada um fica independente (editar/
  excluir um não afeta os demais, e não há como "estender" a série depois
  de criada). Um vínculo entre as ocorrências (ex.: `grupo_repeticao_id`)
  permitiria editar/excluir a série toda de uma vez. O campo "fixa" segue
  sendo só uma flag informativa, sem gerar nada sozinho.
- **App mobile / PWA**: o layout já é responsivo em navegador mobile, mas
  um manifest + service worker (PWA instalável) ou um app nativo seria o
  próximo passo para uso "no bolso".
- **Multi-usuário/planos pagos de fato**: a base já isola dados por
  `user_id`, mas falta uma tela de convite/compartilhamento entre
  usuários (ex.: financas de casal) e qualquer lógica de cobrança/plano.
- **Concluir a Fase 5 (Divisão de Patrimônio)**: hoje é só um placeholder
  no menu — decidir o escopo real (patrimônio líquido, ativos/passivos,
  evolução no tempo?) e implementar.


## Assinaturas, planos e operação (versão Node)

- **Migrations automáticas:** ao iniciar, `server.js` aplica as migrations pendentes de `database/migrations`
  (tabela `migrations`, com trava para o pm2 em cluster). São só mudanças aditivas — dados existentes não são alterados.
  **Faça um backup do banco antes do primeiro deploy.**
- **Planos** (tabela `planos`, editável direto no banco): *Plan de Prueba* (grátis), *Básico* (Gs. 30.000/mês, até 3 contas)
  e *Premium* (Gs. 70.000/mês, ilimitado + demonstrativo anual, CSV e backup). Anual = 10 × mensal.
- **Usuários existentes na data da migration** viram `beta` (Plan de Prueba grátis, sem vencimento). Cadastros novos ganham
  7 dias de teste (`TRIAL_DIAS` em `src/node/core/negocio.js`). Vencido/cancelado = modo somente leitura.
- **Pagamento:** sem gateway por enquanto. O usuário solicita o plano em *Configurações > Assinatura* e o admin registra o
  pagamento em `/admin` (ativa o plano). Um gateway futuro só precisa chamar `Assinatura.ativar()`.
- **Admin:** defina `ADMIN_EMAILS` (separados por vírgula); esses usuários viram `role = admin` ao iniciar.
- **E-mails** (verificação, recuperação de senha, pedidos de plano): configure `SMTP_*`; sem isso só aparecem no log.
- **Termos/Privacidade:** textos modelo em `src/node/core/legal.js` — revisar com advogado. Mudar `TERMOS_VERSAO`
  obriga todos a aceitar novamente.

## Lembretes de vencimento (notificacao push)

Avisa, mesmo com o app fechado, as despesas que vencem no dia (e/ou 1 dia antes), com nome, valor e total a pagar.
Cada usuario ativa em **Configuracoes > Lembretes** (por aparelho), escolhe o horario (de 30 em 30 min) e quando avisar.

1. Defina no `.env` do servidor: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` (gere com `npx web-push generate-vapid-keys`, uma unica vez) e `CRON_TOKEN` (segredo qualquer).
2. O servidor ja tem um agendador interno (verifica a cada 30 minutos, em :00 e :30; desligue com `LEMBRETES_AGENDADOR=0`), entao **nao precisa de cron** enquanto o app Node estiver rodando continuamente. Opcionalmente, como reforco, crie um cron (hPanel da Hostinger ou cron-job.org) **a cada 30 minutos** (`*/30 * * * *`):
   `curl -fsS -H "x-cron-token: SEU_CRON_TOKEN" https://SEU-DOMINIO/cron/lembretes`
3. A rota e leve: so processa quem tem `proximo_envio` vencido e reserva o envio antes de mandar (sem avisos duplicados, mesmo com varias instancias).

No iPhone o push so funciona com o app instalado na tela inicial (iOS 16.4+).

### Financeiro (cobrancas por inatividade)

Mesmo agendador e mesmas chaves VAPID dos lembretes. **Fase de teste:** vem desligado para todos e so admins veem a opcao (Configuracoes > Lembretes > Financeiro) e recebem. Para liberar, ponha `FINANCEIRO_LIBERADO=todos` no `.env` e reinicie: a opcao aparece para todos e os aparelhos que se inscreverem dali em diante ja entram ligados (quem ja tinha aparelho continua desligado ate ligar). Quando ligado: por volta das 20h (hora local, `FINANCEIRO_HORA` muda), se a pessoa nao registrou nada, manda **um** push com o tom conforme os dias sem registrar (1 dia brincalhao, 2 cobrando, 3-4 dramatico, 5+ saudade; depois do 4o dia so nos dias 5, 7, 14, 21 e 28; passado 1 mes, para). Textos em `src/node/core/i18n_financeiro.js` (5 por tom, pt/es/en).
A pessoa pode **pausar 7 dias** ou **desativar** pelos botoes da notificacao (Android/desktop), pela tela `/financeiro` (iPhone) ou em Configuracoes > Lembretes. Estado em `financeiro_config`. As imagens (avatar, selo e banners) saem de `node scripts/financeiro/gerar-imagens.js`.
