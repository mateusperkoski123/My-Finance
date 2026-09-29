# Gestão Financeira

Sistema pessoal de gestão financeira (PHP + MySQL), inspirado na lógica de
visualização de um app de referência (painel mensal, contas, categorias e
subcategorias, relatórios), **sem nenhuma integração com terceiros** (sem
Open Finance, sem bancos conectados, sem IA). Construído em etapas — veja a
lista de fases mais abaixo.

## Stack

- PHP 8.1+ (sem framework), PDO + MySQL/MariaDB
- Autoload PSR-4 via Composer (`App\` → `src/`)
- Frontend server-rendered (views PHP) + CSS próprio com suporte a tema
  claro/escuro + Chart.js (a partir da Fase 4, para os relatórios, via CDN)
- Sem JS framework: um `app.js` simples (modais, toggles) + i18n próprio
  (pt-BR/es-PY/en-US) via `t()` e `lang/*.php`

## Rodando localmente (XAMPP)

1. Inicie **Apache** e **MySQL** pelo painel do XAMPP.
   - Nesta máquina de desenvolvimento o MySQL do XAMPP expõe a porta
     `3307` (não a `3306` padrão) — por isso existe `config/config.local.php`
     sobrescrevendo só a porta. Se o seu MySQL estiver na porta padrão,
     apague esse arquivo (ou ajuste-o) e nada mais muda.
2. Instale as dependências (gera a pasta `vendor/` e o autoload):
   ```
   composer install
   ```
3. Rode as migrations (cria o banco `gestao_financeira` automaticamente e
   aplica as tabelas — idempotente, seguro rodar de novo a qualquer momento
   para conferir que não há migration pendente):
   ```
   php database/migrate.php
   ```
4. Sirva a aplicação. Duas opções:
   - **Servidor embutido do PHP** (mais rápido para desenvolvimento/testes):
     ```
     php -S localhost:8000 -t public
     ```
   - **Apache do XAMPP**: aponte o *virtual host* (ou o document root
     padrão) para a pasta `public/` deste projeto. O `public/.htaccess`
     já reescreve toda requisição que não for um arquivo/pasta existente
     para `index.php` (front controller); confirme que o `mod_rewrite`
     está habilitado no Apache.
5. Acesse `http://localhost:8000` (ou o host configurado no Apache), crie
   sua conta e faça login.

Credenciais do banco: editar `config/config.php` (valores versionados, os
mesmos para todo mundo que clonar o projeto) ou criar
`config/config.local.php` (ignorado pelo git) para sobrescrever só o que
for diferente no seu ambiente — host/porta/usuário/senha do MySQL, sem
tocar no arquivo principal.

## Deploy futuro (Hostinger)

Ainda não foi feito deploy em produção — isto é só um roteiro de alto
nível para quando o usuário decidir publicar o projeto. Nenhum destes
passos foi executado ou automatizado por este projeto:

1. No painel da Hostinger (hPanel), criar um banco de dados MySQL e anotar
   host/nome do banco/usuário/senha gerados.
2. Subir os arquivos do projeto para o servidor (Git deploy, FTP/SFTP, ou
   o gerenciador de arquivos do hPanel) — **exceto** `config/config.local.php`
   (que é só local) e, idealmente, sem a pasta `vendor/` se for possível
   rodar Composer no servidor.
3. Apontar o *document root* do domínio/subdomínio para a pasta `public/`
   do projeto (nunca para a raiz do projeto — os outros diretórios,
   como `src/` e `config/`, não devem ficar acessíveis publicamente).
4. Garantir o autoload do Composer no servidor: rodar
   `composer install --no-dev --optimize-autoloader` por SSH, se disponível
   no plano de hospedagem, **ou** subir a pasta `vendor/` já gerada
   localmente junto com o restante dos arquivos (a aplicação não funciona
   sem ela, já que todo o autoload de classes depende dela).
5. Criar `config/config.local.php` no servidor com as credenciais de
   produção do banco (host/porta/usuário/senha da Hostinger) e, se for o
   caso, `'ambiente' => 'production'` em `config/config.php` (ou via
   override) para desligar a exibição detalhada de erros.
6. Rodar `php database/migrate.php` uma vez no servidor (via SSH ou cron
   job avulso do hPanel) para criar as tabelas em produção.
7. Testar login/cadastro, HTTPS (a Hostinger oferece SSL grátis — habilitar
   no hPanel) e o fluxo ponta a ponta antes de divulgar o link.

## Estrutura

```
public/        # document root (front controller + assets)
src/Core/      # infraestrutura (DB, Router, Auth, View, Csrf, Flash, I18n, Money, Periodo)
src/Controllers/
src/Models/
views/         # templates PHP
lang/          # traducoes pt-BR / es-PY / en-US
database/      # migrations + script de execucao (migrate.php)
config/        # configuracao da aplicacao
```

## Etapas do projeto

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

- **Deploy em produção**: seguir o roteiro da seção "Deploy futuro
  (Hostinger)" acima e colocar o app no ar de verdade.
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
