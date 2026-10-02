-- Indices para o painel de estatisticas do admin (contagens por data de criacao). Idempotente.
ALTER TABLE lancamentos ADD KEY idx_lancamentos_created (created_at);
ALTER TABLE users ADD KEY idx_users_created (created_at);
ALTER TABLE pagamentos ADD KEY idx_pagamentos_pago_em (pago_em);
