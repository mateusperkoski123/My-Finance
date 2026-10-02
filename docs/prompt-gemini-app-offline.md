# Prompt para o Gemini — App instalável (PWA) + Capacitor com modo offline e sincronização

> Copie tudo abaixo da linha e cole no Gemini, com o repositório aberto. Antes, peça que ele leia `GEMINI.md` e `README.md`.

---

## Papel e contexto

Você é um engenheiro sênior full-stack. Trabalhe no repositório **MyFinance / Gestão Financeira** (Node 20 + Express + EJS + MySQL, multi-tenant, três idiomas pt-BR / es-PY / en-US, tema claro/escuro, hospedado na Hostinger com deploy automático pelo GitHub, branch `main`).

**Objetivo:** transformar o sistema em um **aplicativo de celular** que funcione **offline** para as operações do dia a dia e **sincronize** com o servidor quando houver internet. Faça em 4 fases, **uma de cada vez, com testes ao final de cada fase**. Não avance para a fase seguinte com testes falhando.

Quem vai revisar o seu trabalho é outro engenheiro (Claude), que executará seus testes, revisará o código e corrigirá o que for necessário. **Seja honesto**: tudo que você não tiver conseguido testar, implementar ou que for suposição deve ir numa seção **REVISAR** no relatório final. Não invente resultados de teste.

## Regras gerais do projeto (obrigatórias)

1. **Não quebre nada que já funciona.** O site web continua igual para quem usa o navegador. Rode todos os testes existentes em `scratch/` que não exigem servidor externo (`test_admin_ia.js`, `test_admin_massa.js`, `test_cadastro.js`, `test_comunidade.js`, `test_ia*.js`, `test_security_isolation.js`) e `node scratch/check_i18n.js` antes e depois. `scratch/` é ignorado pelo git; os testes novos podem ficar lá. Os bancos de teste usam MariaDB local na porta 3307, usuário `root`, sem senha.
2. **Segurança multi-tenant:** toda consulta filtra por `user_id`. Nunca confie em `user_id` vindo do cliente. Validar e sanitizar tudo no servidor (tipos, tamanhos, datas, valores). Valores monetários são `DECIMAL(14,2)`; no cliente use **inteiros em centavos** para evitar erro de ponto flutuante.
3. **Migrations:** novos arquivos em `database/migrations/NNNN_nome.sql` (a próxima é a `0020`). Elas rodam sozinhas no start (`src/node/core/migrator.js`). Os comandos são separados por `;` seguido de quebra de linha, então **não use ponto-e-vírgula dentro de strings**. Use `IF NOT EXISTS` onde possível. Nunca altere migrations antigas.
4. **Idiomas:** todo texto visível novo vai nas três línguas. As chaves extras ficam em arrays `[pt, es, en]` em `src/node/core/i18n_extra.js` (ou em um arquivo novo `i18n_app.js` mesclado em `src/node/core/i18n.js`). Em espanhol use voseo (“tenés”, “registrá”). O script `scratch/check_i18n.js` valida chaves e compila todas as views EJS e **deve passar**. Textos usados no JavaScript do cliente também precisam de tradução (o service worker e o JS de sync recebem o dicionário por um objeto injetado no layout).
5. **Estilo de código:** siga o estilo vizinho (comentários em português, nomes em português do domínio, `db.query` do `mysql2`, models em `src/node/models/`, controllers em `src/node/controllers/`, rotas em `src/node/routes/index.js`). Não adicione bibliotecas pesadas. Prefira JS puro no cliente (o projeto não tem bundler). Se precisar de IndexedDB, escreva um wrapper pequeno próprio ou use uma lib minúscula servida localmente em `public/assets/js/vendor/` (não use CDN, o app tem que funcionar offline).
6. **Segredos:** nunca grave chaves, senhas ou tokens no código. Use `process.env` e documente em `.env.example`.
7. **CSRF e sessão:** o site usa sessão por cookie + token CSRF. A API do app usa **token próprio** (fase 2) e fica isolada desses mecanismos, sem enfraquecer o CSRF das rotas web. Mantenha `helmet`, rate limits e `express-rate-limit` ativos; crie um limitador próprio para a API de sync.
8. **Commits:** não faça commit nem push. Entregue as alterações no working tree e eu (Claude) reviso e publico.

## Mapa do sistema atual (leia antes de mexer)

- `src/node/models/Lancamento.js`, `Conta.js`, `Categoria.js`, `User.js`: regras de negócio.
- Tabela `lancamentos`: `valor` é **com sinal** (positivo entra na conta, negativo sai). Tipos: `receita`, `despesa`, `transferencia`, `ajuste`. Status `pago` ou `pendente`. Uma **transferência são dois lançamentos** ligados por `transferencia_par_id` (perna de saída e de entrada). Há também campos de série (fixo = 24 meses, repetir = N parcelas) criados em migrations posteriores. **Leia as migrations 0003, 0004, 0013 e `Lancamento.js` para ver os nomes exatos antes de projetar a sincronização.**
- Saldo de conta = `saldo_inicial` + soma dos `valor` pagos (confirme no código).
- O Chat IA (`core/ia.js`, `ia_plano.js`) já executa “criar lançamento”, “marcar pago/recebido”, “transferir” via models: **reaproveite a mesma lógica** em vez de duplicar regras.
- `public/manifest.webmanifest` já existe (básico) e `views/layout.ejs` já o referencia. Não há service worker.
- Admin controla acessos (`users.status`, assinatura `status_efetivo`: beta/trial/ativa/vencida/cancelada). Contas suspensas, arquivadas ou com assinatura vencida em modo somente leitura **não podem gravar** pela API do app: respeite as mesmas regras do `contaMiddleware`.

---

## FASE 1 — PWA instalável (sem alterar o comportamento do site)

1. Completar o `manifest.webmanifest`: `id`, `start_url` com `?source=pwa`, `display: standalone`, `orientation: portrait`, `theme_color` e `background_color` coerentes com o tema, ícones 192/512 e um **maskable** separado (gerar a partir dos existentes se possível; se não der, deixar em REVISAR), `shortcuts` (Novo gasto, Nova receita, Contas), `categories: ["finance"]`. O `lang` e o `name` não devem ficar fixos em pt-BR se isso for contornável.
2. Criar o **service worker** em `/service-worker.js` (servido na raiz com `Service-Worker-Allowed` correto e `Cache-Control: no-cache` no próprio arquivo). Estratégias:
   - *Precache* do “app shell”: CSS, JS, fontes/ícones locais, página `/offline`.
   - Arquivos estáticos versionados: **cache-first**; versionar por um número de build (`APP_VERSION` em `process.env.APP_VERSION || versão do package.json`) e limpar caches antigos em `activate`.
   - Páginas HTML autenticadas: **network-first** com fallback para a última versão em cache e depois para `/offline`. **Nunca** coloque em cache respostas de `/login`, `/logout`, `/admin*`, `/ia*`, `/assinatura*`, `/api/*` (com exceção das rotas de sync da fase 2) nem respostas com `Set-Cookie`. Ao fazer **logout**, apagar os caches de dados do usuário.
3. Página `/offline` (view EJS leve, nos 3 idiomas) explicando que o app está sem conexão e o que ainda dá para fazer.
4. Registrar o service worker no `views/layout.ejs` com tratamento de atualização: quando houver versão nova, mostrar um aviso discreto “Nova versão disponível — Atualizar”.
5. Indicador de conexão (online/offline) na barra superior, acessível (texto para leitores de tela), nos 3 idiomas.
6. Botão/instrução “Instalar app”: capturar `beforeinstallprompt` (Android/Chrome) e, no iOS Safari, mostrar instruções de “Adicionar à Tela de Início”. Mostrar uma vez e permitir dispensar (guardar a escolha em `localStorage`, dentro de try/catch).
7. Meta tags: `theme-color`, `apple-mobile-web-app-capable`, `apple-touch-icon`, `viewport-fit=cover` e respeito à *safe area* (`env(safe-area-inset-*)`) nos elementos fixos.

**Testes da fase 1** (script `scratch/test_pwa.js`): manifest válido (campos obrigatórios, ícones existem), service worker responde 200 com o `Content-Type` certo, lista do precache só contém arquivos que existem, rotas sensíveis não são cacheadas (teste a função que decide a estratégia), `/offline` renderiza nos 3 idiomas. Se possível, teste em navegador real com `puppeteer-core` + Edge (`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`, há um exemplo em `scratch/test_select_all.js`): carregar o site logado, colocar o navegador offline (`page.setOfflineMode(true)`) e confirmar que a página inicial e `/offline` abrem.

---

## FASE 2 — API de sincronização + cópia local (leitura offline)

### Servidor

1. **Autenticação do app por token:**
   - Tabela `dispositivos` (`id`, `user_id`, `token_hash` (SHA-256 do token), `nome`, `plataforma`, `ultimo_uso_em`, `revogado_em`, `created_at`).
   - `POST /api/app/login` (e-mail + senha, com o mesmo rate limit e as mesmas verificações do login web: conta ativa, não suspensa, e-mail verificado se aplicável) devolve um token aleatório de 32 bytes (mostrado **uma única vez**; só o hash vai para o banco) com validade configurável. `POST /api/app/logout` revoga. Opcional: login com Google reaproveitando o fluxo existente (deixe em REVISAR se não fizer).
   - Middleware `exigirToken` que carrega o usuário, ignora CSRF **apenas nessas rotas** e aplica as mesmas regras de conta (suspensa, assinatura somente leitura para escrita).
   - Tela em Configurações para **ver e revogar dispositivos** (3 idiomas).
2. **Colunas de sincronização** (migration `0020`):
   - `client_id CHAR(36) NULL` com índice **único por `(user_id, client_id)`** em `lancamentos`, `contas` e `categorias`. Registros antigos ficam com `NULL`.
   - `deleted_at DATETIME NULL` (exclusão lógica) onde a exclusão existir, para o app saber o que apagar. Ajuste as consultas existentes para ignorar `deleted_at IS NOT NULL` **sem mudar o resultado atual do site**.
   - Garantir `updated_at` indexado `(user_id, updated_at)` para a consulta incremental.
3. **`GET /api/app/sync?since=<cursor>`**: devolve contas, categorias e lançamentos alterados desde o cursor, mais `cursor` novo (use `updated_at` + `id` para não perder registros com o mesmo instante; documente a escolha) e uma flag `completo` se for a primeira carga. Paginação por lotes (ex.: 500). Janela inicial: lançamentos de **12 meses atrás até 24 meses à frente** (cobre séries fixas), configurável.
4. Também devolver **dados de referência**: idioma, moeda/formatação, tema, fuso, estado da assinatura (`status_efetivo`, `dias_restantes`, modo somente leitura), versão mínima do app aceita (`APP_VERSAO_MINIMA`).
5. Nada de dados de outros usuários, de Comunidade, de Admin ou do Chat IA nessa API.

### Cliente (cópia local)

1. Wrapper de **IndexedDB** (`public/assets/js/app-db.js`) com stores `contas`, `categorias`, `lancamentos`, `meta` (cursor, usuário, última sincronização) e `fila` (fase 3). Versionamento do esquema com migração de versão.
2. `public/assets/js/app-sync.js`: primeira carga completa, depois sincronização incremental ao abrir o app, ao voltar a ficar online (`online` event) e a cada X minutos com o app em primeiro plano. Mostrar “Última sincronização às HH:mm”.
3. **Telas de leitura offline** usando a cópia local: saldo das contas, lista de lançamentos do mês, pendentes a pagar/receber. Decisão de arquitetura (justifique no relatório): ou renderizar essas telas no cliente a partir do IndexedDB quando offline, ou manter o HTML do servidor quando online e cair no modo cliente só offline. **Evite duplicar a lógica de cálculo**: coloque as funções de saldo/filtro em um módulo puro (`public/assets/js/app-regras.js`) que possa ser testado em Node.
4. Ao fazer logout, **apagar o IndexedDB** do usuário. Ao trocar de usuário, nunca misturar dados.

**Testes da fase 2** (`scratch/test_app_sync.js`, servidor real + MariaDB): login do app (ok, senha errada, conta suspensa, rate limit), token revogado deixa de funcionar, sync incremental devolve só o alterado, exclusão lógica aparece como removido, isolamento entre usuários (usuário B nunca vê dados do A, nem com `client_id` de A), registros com o mesmo `updated_at` não se perdem entre páginas, módulo `app-regras.js` calcula os mesmos saldos que o SQL do servidor em um conjunto de dados de exemplo (compare os dois).

---

## FASE 3 — Escrita offline com fila e sincronização

Operações suportadas **offline**: (a) criar receita/despesa única (paga ou pendente), (b) marcar um lançamento pendente como pago/recebido (com data), (c) transferir entre contas, (d) editar descrição, valor, categoria e data de um lançamento próprio, (e) criar categoria simples. **Fora desta fase:** excluir em massa, séries fixo/repetir (veja o item 6), Chat IA, Comunidade, Admin.

1. **Fila de operações (outbox)** no IndexedDB: cada item tem `op_id` (UUID), `tipo`, `payload`, `criado_em`, `tentativas`, `estado` (`pendente`, `enviando`, `erro`, `aplicada`) e `ordem`. A UI mostra um selo “pendente de sincronizar” nos lançamentos afetados e um contador no topo, com opção de ver e **descartar** uma operação com erro.
2. **Atualização otimista local:** ao registrar offline, grave o lançamento no IndexedDB com um `client_id` novo (UUID v4) e recalcule saldos locais pelo módulo `app-regras.js`.
3. **`POST /api/app/sync/push`**: recebe um lote de operações **em ordem**. Para cada uma o servidor:
   - valida (dono da conta/categoria, valor > 0, data válida, conta não arquivada, assinatura permite escrita);
   - aplica **reaproveitando os métodos dos models** (`Lancamento.criar`, marcar pago, transferência etc.), nunca SQL duplicado;
   - é **idempotente**: se `(user_id, client_id)` ou `op_id` já foi aplicado, devolve o resultado anterior sem duplicar (tabela `sync_operacoes` com `op_id`, `user_id`, `resultado`, `aplicada_em`);
   - roda cada operação em **transação**; uma transferência cria as duas pernas de forma atômica;
   - devolve por operação `{op_id, estado: 'ok'|'rejeitada'|'conflito', id_servidor, motivo}`.
4. **Conflitos:** regra “o servidor vence, mas nunca em silêncio”. Se o lançamento foi alterado no servidor depois da versão que o app tinha (`base_updated_at`), a operação de edição vira `conflito`, e o app mostra uma tela simples com as duas versões para o usuário escolher (manter a minha / manter a do servidor). “Marcar como pago” de algo já pago não é erro: trate como sucesso idempotente.
5. **Reconciliação:** depois do push, o app faz pull incremental e substitui os registros locais provisórios pelos do servidor (mapeando `client_id` → `id`). Saldos exibidos passam a ser os do servidor.
6. **Séries fixo/repetir offline:** guarde a *intenção* como uma operação `criar_serie` com os mesmos parâmetros do formulário atual; o **servidor gera a série** reutilizando a lógica existente; localmente mostre apenas a primeira parcela como provisória. Se isso ficar complicado ou arriscado, **não implemente** e deixe em REVISAR com a proposta.
7. **Re-tentativa:** backoff exponencial, respeitar `Retry-After` do limitador, parar a fila na primeira falha de rede (para manter a ordem) mas **não** parar por uma rejeição de validação (marca erro e segue). Use *Background Sync* (`sync` event) quando o navegador suportar, e a abertura do app como alternativa.
8. **Relógio do aparelho:** nunca confie na hora do celular para decidir conflitos; use apenas `updated_at` do servidor. A data de competência é a escolhida pelo usuário.

**Testes da fase 3** (`scratch/test_app_push.js`, servidor real): criar lançamento via push (ok, repetido com o mesmo `op_id` não duplica, mesmo `client_id` com `op_id` diferente não duplica), marcar como pago (idempotente), transferência atômica (se a segunda perna falhar, nenhuma é gravada), conta de outro usuário é rejeitada, valor negativo/zero/NaN/string absurda é rejeitado, conta arquivada e assinatura vencida rejeitam escrita, edição com `base_updated_at` antigo gera conflito, lote com uma operação inválida não impede as demais, saldos do servidor batem com os calculados localmente pelo `app-regras.js` após a reconciliação. Simule **rede caindo no meio do lote** reenviando o mesmo lote e confirme que não há duplicidade. Se possível, um teste ponta a ponta no navegador (puppeteer): ficar offline, registrar 2 despesas e 1 transferência, voltar online e conferir no banco.

---

## FASE 4 — Capacitor (app Android/iOS) e segurança no aparelho

1. Adicionar **Capacitor** (`@capacitor/core`, `@capacitor/cli`, `@capacitor/android`; iOS apenas configurado, já que o build exige macOS). Pasta `app-mobile/` com `capacitor.config.ts`, `appId` (ex.: `com.myfinance.app`; deixe fácil de trocar), `appName`. Decisão de arquitetura (justifique): o app carrega o **site hospedado** (`server.url`) com o service worker/IndexedDB, **ou** empacota o `public/` e fala com a API. Recomendação inicial: carregar o site hospedado com `allowNavigation` restrito ao domínio e ao de pagamento, mantendo uma única base de código. Documente prós e contras.
2. Plugins: `@capacitor/app` (botão voltar), `@capacitor/network` (estado online), `@capacitor/splash-screen`, `@capacitor/status-bar`, `@capacitor/preferences` e **armazenamento seguro** do token (Keychain/Keystore, por exemplo `capacitor-secure-storage-plugin` — verifique que a lib é mantida e anote em REVISAR), `@capacitor/camera` e acesso ao microfone para o Chat IA (hoje já funciona pelo navegador; só garantir as permissões declaradas), `@capacitor/push-notifications` **somente como ganchos**, sem enviar nada ainda (deixe em REVISAR).
3. **Bloqueio do app:** PIN de 4–6 dígitos e/ou biometria (`@capgo/capacitor-native-biometric` ou equivalente mantido) ao abrir e após X minutos em segundo plano. O PIN guarda-se como hash com sal no armazenamento seguro, com limite de tentativas e opção “sair e apagar dados locais” após muitas falhas. Configurável em Configurações (nos 3 idiomas).
4. **Privacidade na troca de apps:** esconder o conteúdo no seletor de apps recentes (flag `FLAG_SECURE` opcional no Android) e, no web, desfocar ao perder o foco se o bloqueio estiver ativo.
5. Ícones e splash gerados a partir de `public/assets/icons/` (scripts com `@capacitor/assets`), cores do tema, orientação retrato.
6. Documentação em `docs/app-mobile.md` (em português): como gerar o APK/AAB de teste, como assinar, o que é preciso para a Play Store e para a App Store (contas, política de privacidade, descrição dos dados coletados, classificação), e uma checklist de publicação. **Não é necessário publicar nada.**
7. **Política de privacidade e termos:** liste (sem alterar os textos jurídicos finais) o que o app coleta e envia para terceiros (Anthropic, Google/Gemini, OpenAI opcional; áudio e fotos do Chat IA) para que eu atualize os documentos.

**Testes da fase 4:** o que for possível em Node/navegador (módulo de PIN: hash, limite de tentativas, bloqueio; configuração do Capacitor válida; `allowNavigation` correto). Build nativo e testes em aparelho **não** precisam ser feitos por você: liste na seção REVISAR exatamente o que precisa ser testado num celular real.

---

## Critérios de qualidade

- Acessibilidade: alvos de toque ≥ 44 px, contraste WCAG AA nos dois temas, `aria-label` nos botões de ícone, foco visível.
- Desempenho: o app shell abre offline em < 2 s; a primeira sincronização não bloqueia a interface (indicador de progresso).
- Nenhuma chamada a CDN em tempo de execução (tudo servido localmente, para funcionar offline).
- Nenhum dado financeiro em `localStorage` (use IndexedDB); `localStorage` só para preferências leves, sempre em `try/catch`.
- Logs sem dados sensíveis (sem tokens, senhas, valores).
- Variáveis de ambiente novas documentadas em `.env.example` (ex.: `APP_VERSION`, `APP_VERSAO_MINIMA`, `APP_TOKEN_DIAS`, `SYNC_LOTE_MAX`).

## Entrega esperada ao final de cada fase

1. Lista de arquivos criados e alterados.
2. Como rodar os testes novos e o **resultado real** da execução (cole a saída).
3. Decisões de arquitetura tomadas e por quê.
4. Seção **REVISAR**: o que ficou incerto, não testado, simplificado ou fora do escopo.
5. Confirmação de que os testes antigos e o `check_i18n.js` continuam passando (cole a saída).

Se alguma instrução conflitar com o código real, **siga o código real, explique a diferença e continue**. Se faltar informação decisiva, escolha a opção mais segura e conservadora e registre em REVISAR em vez de parar.
