-- Ajustes da sincronizacao do app para bancos que ja tinham a versao anterior da migration 0020 (idempotente: erros de "ja existe" sao ignorados).
ALTER TABLE dispositivos ADD COLUMN expira_em DATETIME NULL;
ALTER TABLE dispositivos ADD UNIQUE KEY uq_disp_hash (token_hash);

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
