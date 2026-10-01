-- Fase 2: auditoria de acessos (suporte e deteccao de abuso).
CREATE TABLE IF NOT EXISTS login_logs (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED  NULL,
    email       VARCHAR(190)  NULL,
    ip          VARCHAR(45)   NULL,
    user_agent  VARCHAR(255)  NULL,
    sucesso     TINYINT(1)    NOT NULL DEFAULT 1,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_login_logs_user (user_id),
    KEY idx_login_logs_data (created_at),
    CONSTRAINT fk_login_logs_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
