-- Fase 1: contas bancarias/carteiras do usuario. Numero de contas ilimitado.
CREATE TABLE IF NOT EXISTS contas (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       INT UNSIGNED        NOT NULL,
    nome          VARCHAR(120)        NOT NULL,
    tipo          VARCHAR(30)         NOT NULL DEFAULT 'corrente',
    cor           VARCHAR(9)          NOT NULL DEFAULT '#2563eb',
    saldo_inicial DECIMAL(14,2)       NOT NULL DEFAULT 0,
    conta_padrao  TINYINT(1)          NOT NULL DEFAULT 0,
    status        ENUM('ativa','arquivada') NOT NULL DEFAULT 'ativa',
    created_at    DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_contas_user (user_id),
    CONSTRAINT fk_contas_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
