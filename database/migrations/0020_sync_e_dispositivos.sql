-- Migration 0020: dispositivos do app, operacoes de sincronizacao, exclusoes e client_id nas tabelas sincronizadas (Fase 2/3)

CREATE TABLE IF NOT EXISTS dispositivos (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id        INT UNSIGNED NOT NULL,
    token_hash     VARCHAR(64) NOT NULL,
    nome           VARCHAR(100) NOT NULL,
    plataforma     VARCHAR(50) NOT NULL DEFAULT 'web_pwa',
    ultimo_uso_em  DATETIME NULL,
    expira_em      DATETIME NULL,
    revogado_em    DATETIME NULL,
    created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_disp_user (user_id),
    UNIQUE KEY uq_disp_hash (token_hash),
    CONSTRAINT fk_disp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS sync_operacoes (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    op_id          CHAR(36) NOT NULL,
    user_id        INT UNSIGNED NOT NULL,
    resultado      TEXT NULL,
    aplicada_em    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_sync_op_user (user_id, op_id),
    KEY idx_sync_op_user (user_id),
    CONSTRAINT fk_sync_op_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Exclusoes (as tabelas principais apagam de verdade; o app descobre o que sumiu por aqui)
CREATE TABLE IF NOT EXISTS sync_exclusoes (
    id          BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    tabela      VARCHAR(20) NOT NULL,
    registro_id INT UNSIGNED NOT NULL,
    client_id   CHAR(36) NULL,
    excluido_em DATETIME(3) NOT NULL,
    KEY idx_sync_excl_user (user_id, id),
    CONSTRAINT fk_sync_excl_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Colunas de sincronizacao para lancamentos
ALTER TABLE lancamentos ADD COLUMN client_id CHAR(36) NULL;
ALTER TABLE lancamentos MODIFY COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
ALTER TABLE lancamentos ADD UNIQUE KEY uq_lancamentos_client (user_id, client_id);
ALTER TABLE lancamentos ADD KEY idx_lancamentos_updated (user_id, updated_at);

-- Colunas de sincronizacao para contas
ALTER TABLE contas ADD COLUMN client_id CHAR(36) NULL;
ALTER TABLE contas MODIFY COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
ALTER TABLE contas ADD UNIQUE KEY uq_contas_client (user_id, client_id);
ALTER TABLE contas ADD KEY idx_contas_updated (user_id, updated_at);

-- Colunas de sincronizacao para categorias
ALTER TABLE categorias ADD COLUMN client_id CHAR(36) NULL;
ALTER TABLE categorias MODIFY COLUMN updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3);
ALTER TABLE categorias ADD UNIQUE KEY uq_categorias_client (user_id, client_id);
ALTER TABLE categorias ADD KEY idx_categorias_updated (user_id, updated_at);
