# MyERP — Arquitetura técnica (v0.1, para aprovação)

Plataforma ERP SaaS modular, multiempresa e multirrubro. Este documento transforma a especificação em arquitetura executável. **Nenhum código foi escrito.** Este arquivo mora temporariamente no repositório do My Finance; deve ser movido para `docs/` da pasta nova do MyERP.

Convenções deste documento: prosa em português; identificadores (tabelas, rotas, eventos, código) em **inglês** (decisão D0, ver seção 11).

---

## 0. Resumo executivo

- **Monólito modular** em Node (Express) + MySQL, com renderização no servidor (EJS) e uma API JSON `/api/v1` que usa os mesmos *services*. Não é microserviço, não é SPA.
- **Um banco, um esquema**, todas as tabelas de negócio com `company_id`. O isolamento é imposto por uma camada de repositório que não consegue executar consulta sem empresa, mais testes automáticos de vazamento.
- **Núcleo chama núcleo diretamente** (dentro de uma transação). **Módulos opcionais reagem a eventos.** Isso mantém consistência (venda + estoque + financeiro atômicos) sem acoplar os opcionais.
- **Módulos e rubros são definidos em código** (manifestos versionados). O banco guarda só o estado por empresa (quais módulos ligados, qual rubro, limites).
- **Planos**: dados no banco (editáveis), aplicados por um guard único.
- **Fila e agendador em MySQL** (sem Redis), compatível com a hospedagem atual. Migra para fila externa quando houver VPS.

---

## 1. ETAPA 1 — Análise da arquitetura

### 1.1 Camadas

```
┌──────────────────────────────────────────────────────────────┐
│ CONFIGURAÇÃO POR RUBRO   (manifestos: módulos, termos, seeds) │
├──────────────────────────────────────────────────────────────┤
│ MÓDULOS VERTICAIS        O1…O18 (opcionais, ligados/empresa)  │
├──────────────────────────────────────────────────────────────┤
│ NÚCLEO                   N1…N10 (sempre ligado)               │
├──────────────────────────────────────────────────────────────┤
│ MOTOR DA PLATAFORMA      eventos · jobs · workflows ·         │
│                          módulos · planos · auditoria · séries│
├──────────────────────────────────────────────────────────────┤
│ PLATAFORMA               empresas · usuários · permissões ·   │
│                          i18n · arquivos · e-mail · importação│
└──────────────────────────────────────────────────────────────┘
```

Regra de dependência (sempre de cima para baixo, nunca o contrário):
- Núcleo importa Plataforma/Motor. Núcleo **não** importa módulos opcionais.
- Módulo opcional importa a **API pública** de um serviço do núcleo (`core/<área>/index.js`) ou de outro módulo declarado em `dependsOn`. Nunca importa tabelas nem repositórios de outra área.
- Comunicação núcleo → opcional: **somente por eventos**.
- Isso será verificado por lint de dependências (dependency-cruiser) no CI.

### 1.2 Módulos e dependências

```
platform ─┬─ N1 partners
          ├─ N2 catalog ───────────────┐
          ├─ N3 stock  (←catalog)      │
          ├─ N6 finance (←partners)    │
          ├─ N4 sales  (←partners, catalog, stock, finance, series)
          ├─ N5 purchases (←partners, catalog, stock, finance)
          ├─ N7 documents (←sales, purchases, finance, series)
          ├─ N8 reports/dashboard (lê tudo, só leitura)
          ├─ N9 settings
          └─ N10 imports (←partners, catalog)

O1 full_sales    ← sales, stock(reservas)
O2 production    ← catalog, stock
O3 contracts     ← partners, catalog, finance, scheduler      → emite CONTRACT_*
O4 service_orders← partners, catalog, stock                   (O10 p/ equipamentos)
O5 pricing       ← catalog, partners
O6 fixed_costs   ← finance
O7 collections   ← finance, notifications                     (O3 opcional)
O8 online_pay    ← finance, O7 opcional                       (Pagopar)
O9 storefront    ← catalog
O10 lot_serial   ← stock, catalog
O11 adv_finance  ← finance
O12 pos          ← sales, finance
O13 fiscal       ← sales, series
O14 inventory    ← stock
O15 commissions  ← sales                                      (escuta SALE_*)
O16 multicurrency← finance, sales
O17 integrations ← tudo (API tokens, webhooks)
O18 ai           ← tudo (somente leitura no início)
```

Dependências entre módulos opcionais ficam declaradas no manifesto (`dependsOn`); o registro **recusa ativar** um módulo cujas dependências não estão ativas e **recusa desativar** um que outro ativo depende.

### 1.3 Entidades principais e seus donos

| Área | Entidades | Dono |
|---|---|---|
| Plataforma | users, companies, company_users, roles, role_permissions, invitations, company_modules, plans, plan_modules, plan_limits, subscriptions, custom_fields, document_series, audit_log, event_outbox, jobs, notifications, files, import_jobs, company_settings | platform |
| N1 | partners, partner_addresses, partner_contacts, payment_terms | core/partners |
| N2 | item_categories, units, items, item_variants | core/catalog |
| N3 | stock_locations, stock_movements, stock_balances | core/stock |
| N4 | sales, sale_items, sale_payments, sale_returns, sale_return_items, payment_methods | core/sales |
| N5 | purchases, purchase_items, purchase_extra_costs | core/purchases |
| N6 | financial_accounts, financial_categories, financial_titles, financial_transactions | core/finance |
| Módulos | ver seção 2.4 | cada módulo |

### 1.4 Fluxos principais

**Venda rápida** (transação única):
1. Valida permissões, módulo, limites do plano e a chave de idempotência.
2. Trava saldos (`SELECT … FOR UPDATE`, ordenados por id para evitar deadlock).
3. Aloca o número da série (`document_series` com `FOR UPDATE`).
4. Grava `sales`, `sale_items` (com **snapshot** de preço, IVA e custo), `sale_payments`.
5. Chama `stock.consume()` → grava `stock_movements` e atualiza `stock_balances`.
6. Chama `finance.recordSale()` → pagamento à vista vira `financial_transactions`; fiado vira `financial_titles` (a receber).
7. Grava auditoria e insere em `event_outbox` o `SALE_CREATED`. **Commit.**
8. Depois do commit, o worker entrega o evento aos módulos opcionais (comissão, notificação, cache do dashboard).

**Cancelamento/devolução**: não apaga nada; gera movimentos e transações de **estorno** (linhas novas apontando para a original) e muda o status. Evento `SALE_CANCELLED` / `SALE_RETURNED`.

**Cobrança recorrente (O3)**: o agendador roda diariamente, cria `jobs` por contrato elegível; cada job gera `financial_titles` com chave única `(company_id, origin_type, origin_id, competence)`, o que torna a geração **idempotente**.

### 1.5 O que precisa existir desde o primeiro dia

Porque é caro ou impossível mudar depois:
- Contexto de empresa em toda requisição e em todo repositório (`company_id`).
- Chaves compostas `(company_id, id)` nas FKs entre tabelas de negócio (impede referenciar dado de outra empresa).
- Auditoria, soft delete e `created_by/updated_by`.
- Dinheiro em DECIMAL, `currency` e `exchange_rate` (nulo) nos documentos.
- Variação em todo item (sempre há a variação padrão).
- Estoque como livro de movimentos (append-only) e colunas `lot_id`/`serial_id` anuláveis no movimento.
- `origin_type/origin_id` nos títulos e movimentos; `competence` nos títulos.
- Séries de documentos com campos de timbrado.
- Coluna `extra JSON` nas entidades que os rubros estendem.
- Registro de módulos, gate de plano e catálogo de permissões.
- Barramento de eventos + tabela outbox (o worker pode vir depois).
- i18n com namespaces por módulo.

### 1.6 O que NÃO construir agora (regra 12)

Só a *decisão* está tomada; nada de tabela ou tela: orçamento/pedido (O1), reservas, kits, múltiplas unidades, listas de preço, lote/série (tabelas), plano de contas, API tokens, webhooks, câmbio. Todas entram depois **por migration aditiva**, sem alterar tabelas existentes (exceto as colunas já previstas acima).

---

## 2. ETAPA 2 — Modelagem do banco

### 2.1 Convenções

- MySQL 8 / MariaDB 10.6+, `utf8mb4`, InnoDB.
- Chave primária `id BIGINT UNSIGNED AUTO_INCREMENT`. Entidades expostas pela API/URLs também têm `uuid CHAR(36)` único (D4).
- **Toda tabela de negócio**: `company_id`, `created_at`, `updated_at`, `created_by`, `updated_by`. Quando aplicável: `deleted_at` (soft delete) e `status`.
- Todo índice de negócio **começa por `company_id`**. Unicidade sempre por empresa: `UNIQUE (company_id, code)`.
- FK entre tabelas de negócio é composta: `FOREIGN KEY (company_id, partner_id) REFERENCES partners (company_id, id)`, o que exige `UNIQUE (company_id, id)` na tabela pai. Impede vínculo entre empresas mesmo com bug.
- Dinheiro: `DECIMAL(18,4)`. Quantidade: `DECIMAL(18,4)`. Cotação: `DECIMAL(18,6)`. Arredondamento na camada de domínio pelo número de casas da moeda (guarani = 0).
- Preços incluem IVA por padrão (`company_settings.prices_include_tax = true`, costume paraguaio): IVA 10% = total/11; 5% = total/21.
- Datas em UTC no banco; fuso fixo `America/Asuncion` na apresentação.
- Migrations em `database/migrations/<escopo>/NNNN_nome.sql` (escopos: `platform`, `core`, `modules/<code>`), registradas em tabela `migrations(scope, file)`. **Todas as tabelas existem para todas as empresas**; "módulo ativo" é só um indicador por empresa.

### 2.2 PLATAFORMA

| Tabela | Campos principais | Observações |
|---|---|---|
| `users` | id, uuid, name, email (único), password_hash, language, theme, status, platform_role (`user`/`admin`), email_verified_at, google_id, last_login_at, terms_version | **Sem** `company_id`: o usuário é global. `uuid` já pronto para login único futuro |
| `companies` | id, uuid, legal_name, trade_name, tax_id (RUC), country, base_currency, currency_decimals, language, rubro_code, plan_id, status, logo_file_id, deleted_at | `rubro_code` aponta para o manifesto em código |
| `company_users` | PK (company_id, user_id), role_id, status, joined_at, invited_by | Vínculo usuário↔empresa |
| `invitations` | company_id, email, role_id, token_hash, expires_at, status, invited_by | Token só em hash |
| `roles` | id, company_id (**NULL = papel de sistema**), code, name, is_system | Papéis prontos: owner, manager, seller, stock_keeper, finance |
| `role_permissions` | role_id, permission_code | Catálogo de permissões fica **em código** (cada módulo declara as suas) |
| `company_modules` | PK (company_id, module_code), enabled, source (`rubro`/`plan`/`owner`/`admin`), enabled_at, enabled_by | Estado por empresa |
| `plans` | id, code, name, price_monthly, price_yearly, currency, active, sort | Dados editáveis |
| `plan_modules` | plan_id, module_code | Módulos que o plano permite |
| `plan_limits` | plan_id, limit_key, limit_value | `max_users`, `max_items`, `max_locations`… (NULL = ilimitado) |
| `company_limit_overrides` | company_id, limit_key, limit_value | Você (admin) pode forçar por empresa |
| `subscriptions` | company_id (único), plan_id, status, trial_ends_at, period_start, period_end, requested_plan_id | **Por empresa**, não por usuário (diverge do My Finance) |
| `subscription_payments` | id, company_id, plan_id, amount, currency, method, paid_at, registered_by | Pagamento manual, sem gateway |
| `custom_fields` | id, company_id, entity, code, label, type, options JSON, required, sensitive, sort, active | Valores ficam em `extra JSON` da própria entidade. Só admin cria |
| `company_settings` | PK (company_id, key), value JSON | Chaves com namespace: `stock.allow_negative`, `tax.prices_include`, `terminology.overrides`… |
| `document_series` | id, company_id, doc_type, prefix, establishment, issue_point, stamp_number, stamp_valid_until, next_number, reset_yearly, active | Número alocado com `FOR UPDATE` na transação do documento |
| `audit_log` | id, company_id, user_id, action, entity, entity_id, before JSON, after JSON, ip, request_id, created_at | Append-only. Índice (company_id, entity, entity_id, created_at) |
| `event_outbox` | id, company_id, type, payload JSON, status, attempts, available_at, processed_at, created_at | Escrita na mesma transação do fato |
| `jobs` | id, company_id (nulo p/ globais), type, payload JSON, unique_key (único), run_at, status, reserved_until, attempts, last_error | Fila e agendamento. `unique_key` dá idempotência |
| `notifications` | id, company_id, user_id, type, title, body, read_at | In-app; push/e-mail como canais |
| `files` | id, uuid, company_id, name, mime, size, path, entity, entity_id | Logo, foto de produto. Disco por empresa |
| `import_jobs` | id, company_id, type, file_id, status, total, ok_count, error_count, errors JSON | Rastreia importações CSV |
| `sessions` | (express-mysql-session) | Sessão em MySQL, como no My Finance |

Não criar: tabela `modules` e tabela `rubros` (vivem em código), nem `permissions` (catálogo em código).

### 2.3 NÚCLEO

| Tabela | Campos principais | Notas |
|---|---|---|
| `partners` | uuid, person_type (`individual`/`company`), doc_type (`ruc`/`ci`/`other`), doc_number, name, trade_name, is_customer, is_supplier, credit_limit, default_payment_term_id, delivery_days, notes, tags JSON, extra JSON, status, deleted_at | Papéis como flags (suficiente; vira tabela se aparecer um terceiro papel). `UNIQUE (company_id, doc_type, doc_number)` quando preenchido |
| `partner_addresses` | partner_id, type (`billing`/`shipping`/`installation`/`other`), line1, line2, city, state, country, postal_code, latitude, longitude, is_primary | Vários por parceiro; `installation` serve ao provedor |
| `partner_contacts` | partner_id, name, role, phone, whatsapp, email, is_primary | |
| `payment_terms` | company_id, name, installments, interval_days, down_payment_pct | |
| `item_categories` | company_id, parent_id, name, sort | |
| `units` | company_id, code, name, decimals | Seed por empresa (un, kg, l, cx) |
| `items` | uuid, type (`product`/`service`), code, name, description, category_id, base_unit_id, tax_rate (10/5/0), tracks_stock, tracking (`none` por ora), has_variants, publish_to_catalog, photo_file_id, extra JSON, status, deleted_at | Quantidades **sempre na unidade base** (assim, múltiplas unidades depois são aditivas) |
| `item_variants` | company_id, item_id, sku, barcode, attributes JSON (`{size, color}`), sale_price, last_cost, avg_cost, is_default, status | **Todo item tem ≥1 variante.** Estoque, vendas e compras apontam para a variante. `UNIQUE (company_id, sku)` e `(company_id, barcode)` |
| `stock_locations` | company_id, name, type, is_default, status | Começa com 1 |
| `stock_movements` | id, company_id, location_id, variant_id, **quantity (assinada)**, type (`purchase_in`, `sale_out`, `adjustment`, `loss`, `return_in`, `return_out`, `transfer_in`, `transfer_out`, `reversal`), unit_cost, total_cost, origin_type, origin_id, **lot_id NULL, serial_id NULL**, reversal_of_id, occurred_at, user_id, note | **Append-only.** Nunca se edita. Índices: (company_id, variant_id, occurred_at), (company_id, origin_type, origin_id) |
| `stock_balances` | company_id, location_id, variant_id, **lot_key (0 = sem lote)**, quantity, reserved_quantity, updated_at | `UNIQUE (company_id, location_id, variant_id, lot_key)`. Mantido na mesma transação do movimento. `lot_key=0` evita o problema de `NULL` em chave única |
| `payment_methods` | company_id, code, name, kind (`cash`/`transfer`/`card`/`qr`/`credit`), settles_immediately, status | `credit` = fiado |
| `sales` | uuid, doc_type (`sale`; futuro `quote`/`order`), series_id, number, formatted_number, status (`completed`/`cancelled`/`partially_returned`/`returned`), customer_id (nulo = consumidor final), seller_id, location_id, currency, exchange_rate NULL, subtotal, discount_total, tax_total, total, notes, occurred_at, cancelled_at, cancelled_by, cancel_reason, origin_type, origin_id, idempotency_key, extra JSON | `UNIQUE (company_id, idempotency_key)`. Quote/order/sale no futuro = linhas encadeadas por `origin_*`, cada uma com sua série |
| `sale_items` | sale_id, variant_id, description (snapshot), quantity, unit_id, unit_price, discount_amount, tax_rate, tax_amount, line_total, **unit_cost (snapshot p/ margem)**, extra JSON | Tipo de linha vem do item; `extra` guarda dados de módulo |
| `sale_payments` | sale_id, payment_method_id, amount, reference | Soma ≤ total; resto = fiado → título |
| `sale_returns` / `sale_return_items` | sale_id, number, reason, total, occurred_at / return_id, sale_item_id, quantity, amount | Cancelamento total não usa estas tabelas |
| `purchases` | uuid, series_id, number, supplier_id, supplier_doc_number, status (`received`/`cancelled`), location_id, currency, exchange_rate NULL, subtotal, extra_costs_total, total, payment_term_id, occurred_at, extra JSON | Pedido/recebimento parcial depois, por `origin_*` |
| `purchase_items` | purchase_id, variant_id, quantity, unit_cost, **landed_unit_cost** (custo + rateio) | |
| `purchase_extra_costs` | purchase_id, kind (`freight`/`tax`/`other`), description, amount, allocation (`by_value`/`by_quantity`) | Rateado no recebimento |
| `financial_accounts` | company_id, name, kind (`cash`/`bank`/`card`), currency, opening_balance, status | "Caixa" é uma conta |
| `financial_categories` | company_id, parent_id, name, nature (`income`/`expense`) | Base do futuro plano de contas |
| `financial_titles` | uuid, direction (`receivable`/`payable`), partner_id, description, amount, currency, exchange_rate NULL, issue_date, due_date, **competence (CHAR(7) AAAA-MM)**, status (`open`/`partial`/`paid`/`cancelled`), installment_no, installments_total, origin_type, origin_id, category_id, doc_ref, extra JSON | `UNIQUE (company_id, origin_type, origin_id, competence, installment_no)`. "Vencido" é derivado (due_date < hoje e saldo > 0), não um status gravado |
| `financial_transactions` | id, company_id, account_id, kind (`in`/`out`), amount, currency, exchange_rate NULL, occurred_on, title_id NULL, origin_type, origin_id, method_id, reversal_of_id, user_id, note | **Livro-caixa append-only.** Baixa de título = transação com `title_id`. Pago do título = soma das transações. Estorno = transação oposta |

### 2.4 MÓDULOS (tabelas próprias; todas com `company_id` e as mesmas convenções)

| Módulo | Tabelas | Observação |
|---|---|---|
| O1 full_sales | `stock_reservations` (+ novos valores de `doc_type`/`status` em `sales`) | Sem recriar vendas |
| O2 production | `recipes`, `recipe_inputs`, `production_runs`, `kit_components` | Produção gera movimentos de consumo e entrada |
| O3 contracts | `contracts` (partner, number, status, start/end, billing_day, period, next_billing_date, address_id, extra), `contract_items` (variant, quantity, price), `contract_changes` (reajuste, pausa, cancelamento) | Job gera `financial_titles` |
| O4 service_orders | `service_orders` (number, type, status, partner, contract_id, address_id, assignee_id, priority, scheduled_at, completed_at, extra), `service_order_items`, `service_order_history` | Equipamento por série exige O10 |
| O5 pricing | `price_lists`, `price_list_items` (variant, min_qty, price, valid_from/to), coluna `partners.price_list_id` | |
| O6 fixed_costs | `fixed_costs` (name, amount, period, category_id, allocation) | |
| O7 collections | `collection_rules`, `collection_templates`, `collection_sends` (`UNIQUE (title_id, rule_id)`) | Idempotência do envio |
| O8 online_pay | `online_charges` (title_id, provider, external_ref, link, qr, status, expires_at), `webhook_events` | |
| O9 storefront | `storefront_settings` (slug único, title, whatsapp, active) | Usa `items.publish_to_catalog` |
| O10 lot_serial | `lots`, `serial_numbers`, `loans` (comodato) | Preenche `lot_id`/`serial_id` já existentes |
| O11 adv_finance | `chart_of_accounts`, `bank_statements`, `reconciliations` | |
| O12 pos | `cash_sessions` | |
| O13 fiscal | `fiscal_settings`, `fiscal_documents` | |
| O14 inventory | `inventories`, `inventory_lines` | |
| O15 commissions | `commission_rules`, `commissions` | |
| O16 multicurrency | `currencies`, `exchange_rates` | Colunas de cotação já existem nos documentos |
| O17 integrations | `api_tokens`, `webhook_endpoints`, `external_identities` | |

### 2.5 Pontos de atenção no banco

- **Crescimento**: `stock_movements`, `financial_transactions`, `audit_log` e `event_outbox` crescem sem parar. Índices por empresa agora; particionamento por mês e arquivamento depois.
- **Custo médio** guardado por variante no nível da empresa (`item_variants.avg_cost`), recalculado a cada entrada com a linha travada.
- **Concorrência**: toda gravação que mexe em saldo trava a linha. Duplo clique é coberto por `idempotency_key`.
- **JSON**: usar a coluna JSON só para dado que o núcleo não filtra; o que for filtrado ganha coluna gerada indexada.

---

## 3. ETAPA 3 — Arquitetura do backend

### 3.1 Estrutura de pastas

```
myerp/
  server.js                      # processo web + worker interno
  src/
    app.js                       # monta middlewares e rotas
    platform/
      config/ env.js
      db/ pool.js tx.js          # withTransaction(ctx, fn)
      context/ als.js            # AsyncLocalStorage: {companyId, userId, requestId, can()}
      auth/ session.js passwords.js google.js
      companies/ users/ invitations/
      permissions/ catalog.js guard.js
      modules/ registry.js gate.js loader.js
      plans/ guard.js limits.js
      rubros/ registry.js apply.js
      events/ bus.js outbox.js dispatcher.js
      jobs/ queue.js scheduler.js worker.js
      audit/ audit.js
      series/ series.js
      custom-fields/
      files/ settings/ i18n/ notifications/ pdf/ import-export/
      http/ errors.js validate.js respond.js request-id.js
      logging/ logger.js
    core/
      partners/   catalog/   stock/   sales/   purchases/
      finance/    documents/ reports/ settings/ imports/
        # cada pasta:
        #   index.js         API pública (o que os outros podem importar)
        #   domain/          regras puras, sem banco (cálculo de IVA, custo médio, máquinas de estado)
        #   repository.js    somente SQL, sempre com company_id
        #   service.js       casos de uso, transações, eventos, auditoria
        #   controller.web.js / controller.api.js   finos
        #   routes.js  validators.js  events.js  permissions.js
        #   i18n/ {pt-BR,es-PY,en-US}.js
        #   views/ *.ejs
    modules/
      contracts/ service-orders/ production/ ...   # mesma anatomia + manifest.js
    rubros/
      generic/ manifest.js
      internet-provider/ manifest.js seeds.js i18n/
  database/migrations/ platform/ core/ modules/<code>/
  public/ assets/
  tests/ unit/ integration/ tenancy/
```

### 3.2 Responsabilidades

| Camada | Pode | Não pode |
|---|---|---|
| **Controller** | ler a requisição, validar entrada, chamar 1 service, formatar saída (HTML ou JSON) | regra de negócio, SQL |
| **Service** | abrir transação, aplicar regras, chamar repositórios e serviços do núcleo, emitir eventos, auditar, checar permissão e limite | renderizar, tocar em `req/res` |
| **Repository** | SQL parametrizado; **exige o contexto** e injeta `company_id` | decidir regra |
| **Domain** | funções puras (IVA, arredondamento, custo médio, rateio, máquinas de estado) | I/O |
| **Events/Jobs** | reagir e agendar | chamar controllers |

### 3.3 Ciclo de uma requisição (ordem dos middlewares)

`request-id` → log → sessão → carrega usuário → **resolve empresa** (valida que o usuário pertence a ela) → **gate de assinatura** (bloqueado/somente leitura) → **gate de módulo** (rota de módulo desligado = 404) → **guard de permissão** → validação (zod) → controller → service. Erros viram `AppError` com `code` e são traduzidos para flash (web) ou JSON (API).

### 3.4 Segurança e isolamento (regras de ouro)

1. O repositório base **lança erro** se chamado sem `company_id` no contexto.
2. FKs compostas `(company_id, id)`.
3. A empresa ativa vem da **sessão validada**, nunca de parâmetro livre do cliente. Na API, o cabeçalho `X-Company-Id` é aceito, mas sempre conferido contra `company_users`.
4. Permissão é checada no controller (guard) **e** no service (`ctx.can()`), nunca só no front.
5. Campos sensíveis (custo, margem, senhas em campos personalizados) são removidos por serializadores conforme a permissão; senhas guardadas criptografadas.
6. Suíte `tests/tenancy` roda, para cada repositório, uma tentativa de leitura/escrita cruzada entre duas empresas e exige falha.
7. CSRF nas rotas web, rate limit em login, convites e API.

### 3.5 Eventos (modelo)

- **Núcleo → núcleo**: chamada direta de serviço dentro da transação (explícita e fácil de depurar).
- **Núcleo → módulos opcionais**: evento. Dois tipos de consumidor:
  - **Síncrono na transação** (raro; só se o módulo precisa ser atômico com o fato, ex.: reserva de estoque do O1).
  - **Assíncrono** via `event_outbox` e worker (comissão, notificação, cobrança, cache). Entrega *at-least-once*, então todo consumidor precisa ser **idempotente**.
- Cada módulo declara no manifesto o que emite e o que escuta.

| Evento | Emissor | Consumidores previstos |
|---|---|---|
| `SALE_CREATED` | sales | commissions, notifications, dashboard cache |
| `SALE_CANCELLED` / `SALE_RETURNED` | sales | commissions (estorno), notifications |
| `PURCHASE_CREATED` | purchases | notifications |
| `STOCK_UPDATED` | stock | storefront (disponibilidade), dashboard |
| `STOCK_LOW` | stock | notifications (push/e-mail) |
| `PAYMENT_CREATED` | finance | online_pay, notifications |
| `PAYMENT_OVERDUE` | job diário de finance | collections, notifications |
| `CONTRACT_CREATED` / `RENEWED` / `CANCELLED` | contracts | collections, service_orders |
| `SERVICE_ORDER_CREATED` / `COMPLETED` | service_orders | contracts (ativar), notifications |

### 3.6 Jobs e agendador

- Tabela `jobs` com reserva atômica (`UPDATE … SET reserved_until WHERE id=? AND reserved_until<NOW()`), o mesmo padrão já usado nos lembretes do My Finance, seguro com várias instâncias.
- Agendamentos recorrentes são declarados nos manifestos (cron). O agendador cria jobs com `unique_key = tipo:empresa:data` e por isso nunca duplica.
- Em VPS o `worker.js` roda como processo próprio. Em hospedagem compartilhada, roda dentro do servidor web.

### 3.7 Logging e erros

`pino` com `requestId`, `companyId`, `userId`. Hierarquia de erros: `ValidationError`, `ForbiddenError`, `NotFoundError`, `ConflictError`, `PlanLimitError`, `ModuleDisabledError`, `DomainError`. Erro inesperado: log completo e resposta genérica.

### 3.8 Manifesto de módulo (contrato)

```js
module.exports = {
  code: 'contracts',
  type: 'optional',                  // 'core' | 'optional'
  dependsOn: ['finance'],
  permissions: ['contracts.view', 'contracts.create', 'contracts.update', 'contracts.cancel'],
  menu: [{ key: 'contracts', icon: 'ph-file-text', route: '/contracts',
           permission: 'contracts.view', group: 'sales', order: 40 }],
  routes: { web: require('./routes.web'), api: require('./routes.api') },
  events: { emits: ['CONTRACT_CREATED'], listens: { SALE_CREATED: require('./events/onSale') } },
  jobs: [{ type: 'contracts.generate_billing', cron: '0 5 * * *', handler: require('./jobs/generate') }],
  migrations: __dirname + '/../../database/migrations/modules/contracts',
  i18n: require('./i18n'),
  defaultSettings: { 'contracts.billing_day': 10 },
  dashboardWidgets: [...], reports: [...]
}
```

O registro lê todos os manifestos na inicialização, valida dependências e monta rotas, menu, permissões, jobs e traduções.

---

## 4. ETAPA 4 — API inicial

### 4.1 Convenções

- Base `/api/v1`. Autenticação: cookie de sessão (web) ou `Authorization: Bearer` (futuro, O17). Empresa: sessão ou cabeçalho `X-Company-Id` (validado).
- Resposta de sucesso: `{ "data": …, "meta": { "page", "per_page", "total" } }`. Erro: `{ "error": { "code", "message", "details" } }`.
- Paginação `?page=&per_page=`, filtros por query, ordenação `?sort=-created_at`.
- POSTs que criam documentos aceitam `Idempotency-Key`.
- Request/response completos são definidos pelos schemas `zod` de cada rota (fonte única). Abaixo: contrato por endpoint (rota, objetivo, permissão, eventos) e, ao final, dois exemplos completos.

### 4.2 Endpoints

**Auth** (públicos, exceto `me`)

| Método Rota | Objetivo | Permissão | Eventos |
|---|---|---|---|
| POST `/auth/register` | criar usuário | — | — |
| POST `/auth/login` | entrar | — | — |
| POST `/auth/logout` | sair | autenticado | — |
| POST `/auth/forgot-password` · `/auth/reset-password` | recuperar senha | — | — |
| GET `/auth/verify-email/:token` | confirmar e-mail | — | — |
| GET `/auth/me` | usuário, empresa ativa, módulos, permissões | autenticado | — |
| GET `/auth/companies` | empresas do usuário | autenticado | — |
| POST `/auth/switch-company` | trocar empresa ativa | membro | — |
| POST `/invitations/:token/accept` | aceitar convite | — | `USER_JOINED` |

**Empresas e módulos**

| Método Rota | Objetivo | Permissão | Eventos |
|---|---|---|---|
| POST `/companies` | criar empresa (escolhe rubro; aplica módulos e seeds) | autenticado | `COMPANY_CREATED` |
| GET/PATCH `/companies/current` | ver/editar dados | `settings.company.view/update` | `COMPANY_UPDATED` |
| GET/PUT `/companies/current/settings` | configurações (namespaced) | `settings.company.update` | `SETTINGS_CHANGED` |
| GET `/modules` | catálogo + estado na empresa + motivo se bloqueado | `settings.modules.view` | — |
| POST `/modules/:code/enable` · `/disable` | ligar/desligar (respeita plano e dependências) | `settings.modules.manage` | `MODULE_ENABLED/DISABLED` |
| GET `/subscription` | plano, limites, uso | `settings.billing.view` | — |
| CRUD `/document-series` | séries de numeração | `settings.series.manage` | — |

**Usuários, papéis, permissões**

| Método Rota | Objetivo | Permissão | Eventos |
|---|---|---|---|
| GET `/users` | membros da empresa | `users.view` | — |
| POST `/invitations` · DELETE `/invitations/:id` | convidar/cancelar | `users.manage` | `USER_INVITED` |
| PATCH `/users/:id` | papel, status | `users.manage` | `USER_ROLE_CHANGED` |
| GET `/roles` · GET `/permissions/catalog` | papéis e catálogo | `users.view` | — |
| POST/PUT/DELETE `/roles` | papéis personalizados | `users.manage` | — |

**Parceiros**

| Método Rota | Objetivo | Permissão | Eventos |
|---|---|---|---|
| GET `/partners` | listar (filtros: cliente/fornecedor, busca, tag) | `partners.view` | — |
| POST `/partners` | criar | `partners.create` | `PARTNER_CREATED` |
| GET/PATCH/DELETE `/partners/:id` | ver/editar/arquivar | `partners.view/update/delete` | `PARTNER_UPDATED` |
| CRUD `/partners/:id/addresses` · `/contacts` | endereços e contatos | `partners.update` | — |
| GET `/partners/:id/statement` | vendas e títulos do parceiro | `partners.view` + `finance.titles.view` | — |

**Catálogo**

| Método Rota | Objetivo | Permissão | Eventos |
|---|---|---|---|
| GET `/items` | listar/buscar (código, barras, nome) | `catalog.items.view` | — |
| POST `/items` | criar (cria variante padrão); **valida limite do plano** | `catalog.items.create` | `ITEM_CREATED` |
| GET/PATCH/DELETE `/items/:id` | ver/editar/arquivar | `catalog.items.*` | `ITEM_UPDATED`, `PRICE_CHANGED` |
| CRUD `/items/:id/variants` | variantes | `catalog.items.update` | `PRICE_CHANGED` |
| POST `/items/:id/photo` | foto | `catalog.items.update` | — |
| CRUD `/item-categories` · `/units` | apoio | `catalog.items.*` | — |

Custo (`last_cost`, `avg_cost`) só aparece com `catalog.cost.view`.

**Estoque**

| Método Rota | Objetivo | Permissão | Eventos |
|---|---|---|---|
| GET `/stock/balances` | saldo por local/variante | `stock.view` | — |
| GET `/stock/movements` | extrato de movimentos | `stock.view` | — |
| POST `/stock/adjustments` | ajuste/perda manual | `stock.adjust` | `STOCK_UPDATED`, `STOCK_LOW` |
| POST `/stock/transfers` | transferir entre locais | `stock.transfer` | `STOCK_UPDATED` |
| GET `/stock/alerts` | abaixo do mínimo | `stock.view` | — |
| CRUD `/stock/locations` | locais | `stock.manage` | — |

**Vendas**

| Método Rota | Objetivo | Permissão | Eventos |
|---|---|---|---|
| POST `/sales` | venda rápida (atômica) | `sales.sales.create` | `SALE_CREATED`, `STOCK_UPDATED`, `PAYMENT_CREATED` |
| GET `/sales` | listar (o vendedor vê só as suas, salvo `sales.sales.view_all`) | `sales.sales.view` | — |
| GET `/sales/:id` | detalhe | `sales.sales.view` | — |
| POST `/sales/:id/cancel` | cancelar com estorno | `sales.sales.cancel` | `SALE_CANCELLED` |
| POST `/sales/:id/returns` | devolução parcial/total | `sales.returns.create` | `SALE_RETURNED` |
| CRUD `/payment-methods` | formas de pagamento | `sales.settings.manage` | — |

Desconto acima do limite do papel exige `sales.discount.override`.

**Compras**

| Método Rota | Objetivo | Permissão | Eventos |
|---|---|---|---|
| POST `/purchases` | registrar entrada (itens, custos extras, condição) | `purchases.create` | `PURCHASE_CREATED`, `STOCK_UPDATED` |
| GET `/purchases` · `/purchases/:id` | consultar | `purchases.view` | — |
| POST `/purchases/:id/cancel` | cancelar com estorno | `purchases.cancel` | `PURCHASE_CANCELLED` |

**Financeiro**

| Método Rota | Objetivo | Permissão | Eventos |
|---|---|---|---|
| GET `/finance/titles?direction=` | contas a receber/pagar (filtros: vencidas, parceiro, período) | `finance.titles.view` | — |
| POST `/finance/titles` | lançar título manual | `finance.titles.create` | `TITLE_CREATED` |
| POST `/finance/titles/:id/settle` | baixar (total/parcial) | `finance.titles.settle` | `PAYMENT_CREATED` |
| POST `/finance/transactions/:id/reverse` | estornar baixa | `finance.titles.reverse` | `PAYMENT_REVERSED` |
| GET/POST `/finance/cash` | caixa do dia; entrada/saída avulsa | `finance.cash.view/create` | — |
| CRUD `/finance/accounts` · `/finance/categories` | contas e categorias | `finance.settings.manage` | — |

**Documentos**

| Método Rota | Objetivo | Permissão | Eventos |
|---|---|---|---|
| GET `/documents/:type/:id.pdf` | recibo/orçamento/pedido em PDF | permissão do documento de origem | — |
| GET `/documents/:type/:id/whatsapp-link` | link `wa.me` com texto pronto | idem | — |

**Dashboard, relatórios, importação, auditoria**

| Método Rota | Objetivo | Permissão | Eventos |
|---|---|---|---|
| GET `/dashboard` | indicadores conforme o papel | autenticado | — |
| GET `/reports/sales` · `/margin` · `/stock` · `/overdue` · `/top-items` | os 5 relatórios (`?format=json/csv/xlsx/pdf`) | `reports.*.view` (margem: `reports.margin.view`) | — |
| GET `/imports/template/:type` | modelo CSV | `imports.create` | — |
| POST `/imports` · GET `/imports/:id` | importar CSV (prévia, validação, aplicar) | `imports.create` | `IMPORT_COMPLETED` |
| GET `/audit` | consultar auditoria | `audit.view` | — |

### 4.3 Exemplo — criar venda

```http
POST /api/v1/sales
Idempotency-Key: 7c1f…
{
  "customer_id": null,
  "location_id": 1,
  "items": [
    { "variant_id": 120, "quantity": "3", "unit_price": "5000", "discount_amount": "0" },
    { "variant_id": 87,  "quantity": "1", "unit_price": "12000", "discount_amount": "1000" }
  ],
  "discount_amount": "0",
  "payments": [ { "payment_method_id": 1, "amount": "20000" } ],
  "notes": ""
}
```
```json
{ "data": { "id": "b2e…", "formatted_number": "001-001-0000125", "status": "completed",
  "subtotal": "27000", "discount_total": "1000", "tax_total": "2364", "total": "26000",
  "paid": "20000", "receivable_title_id": "9f1…",
  "items": [ … ] } }
```
Eventos: `SALE_CREATED` (+ `STOCK_UPDATED`, `STOCK_LOW` se cruzar o mínimo, `PAYMENT_CREATED`). Erros: `STOCK_INSUFFICIENT` (se negativo não permitido), `DISCOUNT_LIMIT_EXCEEDED`, `PLAN_LIMIT`, `FORBIDDEN`.

### 4.4 Exemplo — criar parceiro

```json
POST /api/v1/partners
{ "person_type": "company", "doc_type": "ruc", "doc_number": "80012345-6",
  "name": "Papelería Central S.A.", "is_customer": true, "is_supplier": false,
  "credit_limit": "5000000",
  "contacts": [ { "name": "María", "whatsapp": "+595981000000", "is_primary": true } ],
  "addresses": [ { "type": "billing", "line1": "Av. España 123", "city": "Asunción", "is_primary": true } ] }
```
Resposta `201` com o parceiro completo. Erro `CONFLICT` se o documento já existe na empresa.

---

## 5. ETAPA 5 — Frontend

### 5.1 Abordagem

EJS no servidor, JavaScript simples para interações (modais, busca de itens, venda rápida), PWA instalável. As telas e a API compartilham os mesmos services. Tema claro/escuro e CSS herdados do My Finance.

### 5.2 Menu dinâmico

```
menu = ∪ (itens de menu dos manifestos)
        ∩ módulos ativos na empresa
        ∩ módulos permitidos no plano
        ∩ permissão `*.view` do usuário
agrupado e limitado a 7 entradas de primeiro nível
```
Regra de usabilidade (público 50+): no máximo 7 itens no topo; o excedente vai para "Mais". Agrupamento: **Vender · Productos · Clientes · Caja · Informes · Más (Compras, Estoque avançado, módulos) · Configurações**. O vocabulário vem de `terminology` (rubro/empresa), por exemplo "Assinantes" em vez de "Clientes" no provedor.

### 5.3 Telas do MVP

| Área | Telas |
|---|---|
| Entrada | login, cadastro, esqueci a senha, **criar empresa** (nome, país, rubro), escolher empresa, aceitar convite |
| Início | painel por papel (vendas de hoje, estoque baixo, a receber vencido, atalhos) |
| Vender | **venda rápida** (busca por nome/código/barras, teclado grande, forma de pagamento, fiado, recibo), lista de vendas, detalhe, cancelar/devolver |
| Productos | lista, formulário (com variações escondidas até ativar), categorias, unidades, importar CSV |
| Clientes e fornecedores | lista unificada com filtro, ficha (endereços, contatos, histórico), importar |
| Estoque | saldos, movimentos, ajuste/perda, alertas, locais |
| Compras | nova entrada, lista, detalhe |
| Caja / Financeiro | caixa do dia, contas a receber, contas a pagar, baixa, contas e categorias |
| Informes | 5 relatórios + exportar |
| Configurações | empresa e logo, usuários e convites, papéis, formas de pagamento, séries, regras de estoque, módulos, assinatura |
| Admin (plataforma, só você) | empresas, planos, módulos por empresa, pagamentos, campos personalizados |

### 5.4 Princípios de interface

Botões e letra grandes; uma ação principal por tela; confirmações em linguagem simples; sem siglas (SKU, DRE); estados vazios que ensinam o próximo passo; erros dizem o que fazer. Telas avançadas (variações, listas de preço, reservas) só aparecem quando o módulo ou a opção está ligada.

---

## 6. ETAPA 6 — Sistema de rubros

### 6.1 Definição (em código, versionada)

```js
module.exports = {
  code: 'internet-provider',
  name: { 'pt-BR': 'Provedor de Internet', 'es-PY': 'Proveedor de Internet', 'en-US': 'Internet Provider' },
  modules: ['contracts', 'service_orders', 'lot_serial', 'collections'],
  settings: { 'stock.allow_negative': false, 'contracts.billing_day': 10 },
  terminology: { 'partner.customer': { 'pt-BR': 'Assinante', 'es-PY': 'Abonado' },
                 'item.service': { 'pt-BR': 'Plano' } },
  seed: async (ctx) => { /* categorias, unidades, formas de pagamento, campos personalizados,
                            papéis extras (técnico), séries, local de estoque padrão */ },
  menuOrder: ['dashboard', 'customers', 'contracts', 'service_orders', 'stock', 'finance', 'reports'],
  dashboard: ['active_contracts', 'overdue_receivables', 'open_service_orders']
}
```

### 6.2 Aplicação

`RubroService.apply(companyId, rubroCode)` roda dentro de uma transação e é **idempotente**: liga os módulos do rubro (respeitando o plano; o que o plano não permite fica pendente e visível), grava configurações padrão, cria campos personalizados e dados iniciais. Trocar ou acrescentar rubro depois **só adiciona**; nunca apaga dados ou desliga o que a empresa já usa.

### 6.3 Terminologia

Resolução: configuração da empresa > rubro > dicionário padrão do idioma. As telas pedem `term('partner.customer')`, nunca o texto fixo.

### 6.4 Rubros previstos

| Rubro | Módulos | Observações |
|---|---|---|
| `generic` | — (núcleo) | Padrão |
| `internet-provider` | contracts, service_orders, lot_serial, collections | Campos personalizados do assinante (usuário de conexão etc., **sensíveis/criptografados**) |
| `snack-bar` | production, pricing, pos, inventory | |
| `stationery` | pricing, pos, lot_serial (opcional) | |

---

## 7. ETAPA 7 — Planos

```
plan  →  plan_modules (quais módulos pode ter)
      →  plan_limits  (max_users, max_items, max_locations, max_sales_month…)
company_limit_overrides  (você força um limite por empresa)
subscription (por empresa)  →  status: trial | active | past_due | cancelled
```

- **PlanGuard** é o único ponto de decisão: `planGuard.assertLimit(ctx, 'max_items')` nos services de criação e `planGuard.moduleAllowed(ctx, code)` na ativação de módulos.
- Estado efetivo da empresa = `module_enabled ∧ plan_allows ∧ subscription_ok`. Assinatura vencida = **somente leitura** (como no My Finance), nunca perda de dados.
- Rebaixar de plano nunca apaga: o excedente fica visível e bloqueia apenas novas criações.
- Nomes `STARTER / PRO / BUSINESS / ENTERPRISE` são **dados** (linhas de `plans`), não código.
- Cobrança real: fora do escopo agora; fica o registro manual de pagamento (`subscription_payments`) e a tela de admin.

---

## 8. ETAPA 8 — Roadmap (com o motivo da ordem)

Ajustei a sua ordem em dois pontos, explicados abaixo.

| # | Entrega | Por quê nesta posição |
|---|---|---|
| 1 | **Fundação**: projeto, ambiente, pool/transação, contexto (AsyncLocalStorage), erros, logs, validação, i18n com namespaces, migrator por escopo, layout, testes e lint de dependências | Tudo se apoia nisto; custa pouco agora e muito depois |
| 2 | **Autenticação** (cadastro, login, e-mail, recuperação, Google) | Pré-requisito de qualquer rota |
| 3 | **Empresas + multiempresa** (criar, trocar, isolamento, repositório base, testes de vazamento) | A regra mais importante do projeto; precisa existir antes de qualquer tabela de negócio |
| 4 | **Módulos + planos (esqueleto)**: registro, gate, `PlanGuard`, limites | **Antecipado** (você o tinha em 17): os services de criação já nascem chamando o guard e o primeiro módulo já nasce dentro do sistema |
| 5 | **Usuários, convites, papéis e permissões** | Todo serviço seguinte chama `can()` |
| 6 | **Auditoria + séries + barramento de eventos** (síncrono; outbox) | Vendas, compras e estoque precisam disso |
| 7 | **Parceiros** | Base de vendas, compras e financeiro |
| 8 | **Catálogo** | Base de estoque e vendas |
| 9 | **Estoque** | Vendas e compras movimentam estoque |
| 10 | **Financeiro** | **Antecipado** (você o tinha em 11): venda e compra geram título e caixa; construir antes evita implementar vendas "pela metade" |
| 11 | **Compras** | Alimenta estoque e custo médio; é mais simples que vendas |
| 12 | **Vendas** (venda rápida, cancelamento, devolução) | Primeiro fluxo que cruza todo o núcleo; valida a arquitetura |
| 13 | **Documentos** (PDF, recibo, link WhatsApp) | Precisa de vendas e séries |
| 14 | **Relatórios e dashboard** | Lê dados que já existem |
| 15 | **Importação CSV** | Ajuda a colocar o cliente no ar; depende de parceiros e catálogo |
| 16 | **Agendador/worker + outbox ativo** | Só é necessário quando um módulo precisar |
| 17 | **Primeiro módulo vertical** | Prova que a arquitetura aceita módulos |
| 18 | **Planos completos** (tela de admin, pagamento manual) | Cobrança vem quando há o que cobrar |
| 19 | Demais módulos, por demanda de rubro | |

**Qual será o primeiro módulo vertical?** Recomendo **O3 Contratos recorrentes**, porque exercita as três coisas mais difíceis ao mesmo tempo (agendador, eventos e financeiro idempotente) e serve a vários rubros. Se o primeiro cliente pagante for a lanchonete, a alternativa é **O2 Produção**. Decisão sua (D14).

---

## 9. ETAPA 9 — MVP

### 9.1 Entra

- Plataforma: auth, empresas e troca de empresa, convites por e-mail, papéis prontos e permissões, auditoria, séries, módulos e planos (esqueleto + limites), i18n pt/es/en, arquivos (logo, foto).
- N1 Parceiros (clientes e fornecedores, RUC/CI, endereços, contatos, limite de crédito, tags).
- N2 Catálogo (produto/serviço, categorias, unidades, IVA, códigos, foto, variação padrão).
- N3 Estoque (1+ locais, movimentos, saldos, mínimo e alerta, negativo configurável, custo médio, transferência).
- N4 Vendas (venda rápida, descontos com limite por papel, formas de pagamento, fiado, cancelamento, devolução).
- N5 Compras (entrada, custos extras rateados, conta a pagar, custo médio).
- N6 Financeiro básico (a receber, a pagar, caixa do dia, baixas, estornos).
- N7 Documentos (recibo PDF, link WhatsApp manual).
- N8 5 relatórios, painel por papel, exportar CSV/Excel/PDF.
- N9 Configurações, N10 Importação CSV (produtos, clientes, fornecedores).
- Rubro `generic`, trial e registro manual de pagamento, dump diário do banco.

### 9.2 Não entra

Todos os módulos O1–O18; orçamento/pedido/reserva; kits e múltiplas unidades; listas de preço; plano de contas, DRE, conciliação; lote/série; fiscal; WhatsApp automático; Pagopar; API pública com tokens; IA; multimoeda; offline; loja online; comissões.

### 9.3 Preparado no banco, sem interface

`sales.doc_type`/`origin_*` (orçamento/pedido), `stock_balances.reserved_quantity`, `lot_id`/`serial_id` nos movimentos, `items.tracking`, `exchange_rate` e `currency` nos documentos, `competence` e `origin_*` nos títulos, `custom_fields` e `extra JSON`, `partner_addresses.latitude/longitude`, `partners.price_list_id` (quando O5 entrar), campos de timbrado nas séries, `uuid` do usuário.

---

## 10. ETAPA 10 — Primeira implementação (proposta, após aprovação)

**Escopo da Fundação (item 1 do roadmap):**
1. Repositório novo + `package.json` (Express, EJS, mysql2, zod, pino, dotenv, helmet, express-session, express-mysql-session, nodemailer, bcryptjs, multer).
2. Estrutura de pastas da seção 3.1, vazia onde ainda não há código.
3. `platform/config`, `db/pool` e `db/tx` (`withTransaction`), **contexto por requisição** (AsyncLocalStorage), `errors`, `validate`, `logger`, `request-id`.
4. **Repositório base** que exige `company_id`, com o primeiro teste de isolamento.
5. Migrator por escopo (`platform`/`core`/`modules/*`) com trava, idempotente (evolução do runner do My Finance).
6. i18n com namespaces e a função `term()`.
7. Layout base e CSS herdados do My Finance, página `/health`, tela inicial vazia.
8. Testes (`node:test`), ESLint e dependency-cruiser configurados.
9. `.env.example`, `ecosystem.config.js` e instruções de deploy na Hostinger.

Critério de pronto: servidor sobe com banco isolado, `npm test` passa (incluindo o teste de repositório sem empresa lançando erro), lint de dependências passa.

---

## 11. Riscos e decisões arquiteturais

### 11.1 Decisões (opção · recomendação)

| # | Decisão | Opções | Recomendação |
|---|---|---|---|
| D0 | Idioma dos identificadores (tabelas, rotas, código) | Português · Inglês | **Inglês** (API pública, bibliotecas, manutenção); a interface continua pt/es/en |
| D1 | Interface | SPA (React/Vue) · EJS no servidor + API | **EJS + API** (decidido por você; reaproveita o My Finance) |
| D2 | Eventos | Tudo por evento · Núcleo direto + eventos para opcionais | **Núcleo direto + eventos nos opcionais**: consistência e depuração simples |
| D3 | Multi-tenant | Banco por empresa · Esquema por empresa · Tabelas compartilhadas com `company_id` | **Compartilhadas** + FK composta + repositório imposto + testes. Escala a milhares com índices por empresa; permite sharding por `company_id` depois |
| D4 | Identificadores | só auto-incremento · só UUID · bigint + uuid público | **bigint + uuid** nas entidades expostas |
| D5 | PDF | puppeteer (navegador) · pdfmake/pdfkit (puro Node) | **pdfmake**: leve, roda na hospedagem compartilhada |
| D6 | Fila/agendador | MySQL · Redis/BullMQ | **MySQL** agora; Redis quando houver VPS |
| D7 | Campos personalizados | EAV · coluna JSON | **JSON** (`extra`), com coluna gerada se precisar filtrar |
| D8 | Assinatura | por usuário · por empresa | **Por empresa** (quem tem 3 empresas paga por empresa) |
| D9 | Módulos/rubros | tabela no banco · manifesto em código | **Código**; o banco guarda só o estado por empresa |
| D10 | Custo médio | por local · por empresa | **Por empresa, por variante** (mais simples; transferência não altera custo) |
| D11 | Preço com IVA incluso | incluso · separado | **Incluso por padrão**, configurável por empresa |
| D12 | Validação | joi · zod | **zod** |
| D13 | Papéis | fixos · personalizáveis | **Papéis de sistema + personalizados por empresa**; sem permissão por usuário (evita bagunça) |
| D14 | Primeiro módulo vertical | O3 Contratos · O2 Produção | **O3** (prova a arquitetura); **O2** se a lanchonete for o primeiro pagante |
| D15 | Papéis do parceiro | flags · tabela | **Flags** (`is_customer`, `is_supplier`) |
| D16 | Orçamento/pedido/venda | tabelas separadas · uma tabela com `doc_type` encadeada | **Uma tabela**, documentos encadeados por `origin_*`, cada um com a sua série |

### 11.2 Riscos

| Risco | Impacto | Mitigação |
|---|---|---|
| **Vazamento entre empresas** | Crítico | Repositório que exige contexto, FK composta, suíte `tenancy` obrigatória no CI |
| **Escopo crescer antes da primeira versão** | Alto | Seção 9 como contrato; regra 12; módulos só por demanda de rubro |
| **Saldo de estoque inconsistente** (concorrência, duplo clique) | Alto | Livro append-only, trava de linha, `idempotency_key`, rotina de conferência saldo × movimentos |
| **Hospedagem compartilhada** (CPU, memória, processos) | Médio | Sem navegador para PDF, importação em lotes, worker leve; VPS quando entrar WhatsApp/fila |
| **Várias instâncias (cluster)** executando jobs duplicados | Médio | Reserva atômica e `unique_key` (padrão já provado nos lembretes) |
| **Tabelas gigantes** (movimentos, auditoria, outbox) | Médio | Índices por empresa; particionamento e arquivamento planejados |
| **Complexidade de permissões** | Médio | Catálogo em código, papéis prontos, testes por papel |
| **Interface complexa demais para 50+** | Alto | Limite de 7 itens, modo simples por padrão, módulos só aparecem se ativos, testes com usuário real |
| **Triplicar custo de i18n** (pt/es/en em tudo) | Médio | Chaves por namespace; checagem automática de chave faltando no CI |
| **Dados sensíveis em campos personalizados** (senhas de conexão do provedor) | Médio | Marcar `sensitive`, criptografar em repouso, ocultar por permissão |
| **Acoplamento entre módulos** | Alto | Lint de dependências no CI; só API pública entre módulos |
| **Termos legais / LGPD / SIFEN** | Médio | Titular e advogado depois; séries já aceitam timbrado |
| **Perda de dados** | Alto | Dump diário automático e testado; arquivar em vez de apagar |

### 11.3 Pontos que preciso que você confirme antes do código

1. D0 (inglês nos identificadores), D2, D3, D8, D14 e D16.
2. A **ordem do roadmap**, com Financeiro antes de Vendas e Planos (esqueleto) no começo.
3. O nome da pasta nova e o repositório (GitHub) para o MyERP.
