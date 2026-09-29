-- Fase 0: usuarios e suas preferencias (idioma, moeda, tema).
CREATE TABLE IF NOT EXISTS users (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    nome          VARCHAR(120)        NOT NULL,
    email         VARCHAR(190)        NOT NULL,
    senha_hash    VARCHAR(255)        NOT NULL,
    idioma        VARCHAR(10)         NOT NULL DEFAULT 'pt-BR',
    moeda         VARCHAR(10)         NOT NULL DEFAULT 'PYG',
    tema          VARCHAR(10)         NOT NULL DEFAULT 'claro',
    created_at    DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_users_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
