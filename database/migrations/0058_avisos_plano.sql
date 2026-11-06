-- Avisos de fim do teste gratis e de vencimento do plano pago (notificacao no celular e e-mail), em core/avisos_plano.js.
-- Cada aviso sai uma vez so por pessoa: a linha (user_id, tipo, referencia) e gravada antes do envio. A referencia e o
-- fim do teste ou do periodo pago, entao um teste novo ou uma renovacao geram avisos novos.
CREATE TABLE IF NOT EXISTS avisos_plano (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED     NOT NULL,
    tipo            VARCHAR(20)      NOT NULL,
    referencia      VARCHAR(20)      NOT NULL,
    push_entregues  TINYINT UNSIGNED NOT NULL DEFAULT 0,
    email_enviado   TINYINT(1)       NOT NULL DEFAULT 0,
    created_at      DATETIME         NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_avisos_plano (user_id, tipo, referencia),
    CONSTRAINT fk_avisos_plano_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
