-- Modulo Chat IA: liberacao por usuario, conversas, mensagens, rascunhos de lancamento (confirmados pelo usuario) e uso mensal.
ALTER TABLE users ADD COLUMN ia_habilitada TINYINT(1) NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS ia_conversas (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    titulo      VARCHAR(120) NOT NULL DEFAULT '',
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_ia_conv_user (user_id, updated_at),
    CONSTRAINT fk_ia_conv_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ia_mensagens (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    conversa_id INT UNSIGNED NOT NULL,
    user_id     INT UNSIGNED NOT NULL,
    papel       ENUM('user','assistant') NOT NULL,
    conteudo    TEXT NOT NULL,
    acoes_ids   VARCHAR(255) NULL,
    tokens_in   INT UNSIGNED NOT NULL DEFAULT 0,
    tokens_out  INT UNSIGNED NOT NULL DEFAULT 0,
    created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_ia_msg_conv (conversa_id, id),
    CONSTRAINT fk_ia_msg_conv FOREIGN KEY (conversa_id) REFERENCES ia_conversas (id) ON DELETE CASCADE,
    CONSTRAINT fk_ia_msg_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ia_acoes (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       INT UNSIGNED NOT NULL,
    conversa_id   INT UNSIGNED NOT NULL,
    payload       TEXT NOT NULL,
    status        ENUM('pendente','confirmada','cancelada') NOT NULL DEFAULT 'pendente',
    lancamento_id INT UNSIGNED NULL,
    created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_ia_acoes_user (user_id, status),
    CONSTRAINT fk_ia_acoes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_ia_acoes_conv FOREIGN KEY (conversa_id) REFERENCES ia_conversas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ia_uso (
    user_id    INT UNSIGNED NOT NULL,
    mes        CHAR(7) NOT NULL,
    mensagens  INT UNSIGNED NOT NULL DEFAULT 0,
    tokens_in  BIGINT UNSIGNED NOT NULL DEFAULT 0,
    tokens_out BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, mes),
    CONSTRAINT fk_ia_uso_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
