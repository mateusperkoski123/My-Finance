-- Lembretes de vencimento por notificacao push (Web Push): um registro por aparelho e a configuracao de cada usuario.
-- proximo_envio e um instante UTC em milissegundos (epoch); o cron externo envia quem tem proximo_envio <= agora.
CREATE TABLE IF NOT EXISTS push_inscricoes (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       INT UNSIGNED NOT NULL,
    endpoint_hash CHAR(64)     NOT NULL,
    endpoint      TEXT         NOT NULL,
    chave_p256dh  VARCHAR(255) NOT NULL,
    chave_auth    VARCHAR(255) NOT NULL,
    nome          VARCHAR(120) NULL,
    created_at    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultimo_envio_em DATETIME   NULL,
    UNIQUE KEY uq_push_endpoint (endpoint_hash),
    KEY idx_push_user (user_id),
    CONSTRAINT fk_push_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS lembretes_config (
    user_id        INT UNSIGNED NOT NULL PRIMARY KEY,
    ativo          TINYINT(1)   NOT NULL DEFAULT 0,
    hora           CHAR(5)      NOT NULL DEFAULT '08:00',
    aviso_dia      TINYINT(1)   NOT NULL DEFAULT 1,
    aviso_antes    TINYINT(1)   NOT NULL DEFAULT 0,
    fuso           VARCHAR(64)  NOT NULL DEFAULT 'America/Asuncion',
    proximo_envio  BIGINT UNSIGNED NULL,
    ultimo_envio_em DATETIME    NULL,
    updated_at     DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_lembretes_proximo (ativo, proximo_envio),
    CONSTRAINT fk_lembretes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
