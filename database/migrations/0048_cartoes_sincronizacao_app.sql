-- Cartoes de credito no app (sincronizacao): client_id (registro criado sem internet) e updated_at com milissegundos para o pull
-- incremental, como nas demais tabelas sincronizadas (0020). Idempotente: "coluna/indice ja existe" e ignorado.
ALTER TABLE cartoes ADD COLUMN client_id CHAR(36) NULL;
ALTER TABLE cartoes ADD KEY idx_cartoes_sync (user_id, updated_at, id);

ALTER TABLE cartao_compras ADD COLUMN client_id CHAR(36) NULL;
ALTER TABLE cartao_compras ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
ALTER TABLE cartao_compras ADD UNIQUE KEY uq_cartao_compras_client (user_id, client_id);
ALTER TABLE cartao_compras ADD KEY idx_cartao_compras_sync (user_id, updated_at, id);

ALTER TABLE cartao_faturas ADD COLUMN client_id CHAR(36) NULL;
ALTER TABLE cartao_faturas ADD COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
ALTER TABLE cartao_faturas ADD KEY idx_cartao_faturas_sync (user_id, updated_at, id);
