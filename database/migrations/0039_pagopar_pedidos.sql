-- Pagopar: um registro por tentativa de compra de plano (o pedido criado no Pagopar e o hash para pagar).
-- estado: pendente | pago | falhou. O plano so e ativado quando o Pagopar confirma o pagamento (webhook ou retorno).
CREATE TABLE IF NOT EXISTS pagopar_pedidos (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id      INT UNSIGNED  NULL,
    plano_codigo VARCHAR(30)   NOT NULL,
    ciclo        VARCHAR(10)   NOT NULL,
    valor        INT UNSIGNED  NOT NULL,
    hash_pedido  VARCHAR(100)  NULL,
    estado       VARCHAR(12)   NOT NULL DEFAULT 'pendente',
    pago_em      DATETIME      NULL,
    created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_pagopar_hash (hash_pedido),
    KEY idx_pagopar_user (user_id),
    CONSTRAINT fk_pagopar_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
