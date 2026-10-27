-- Codigo de indicacao (a partir do plano Premium): quem indica cria um codigo; quem usa ganha 20% na primeira compra
-- (plano mensal) e quem indicou recebe credito de metade desse desconto, abatido na proxima compra pelo Pagopar.
CREATE TABLE IF NOT EXISTS codigos_indicacao (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNSIGNED NOT NULL,
    codigo     VARCHAR(20)  NOT NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_indicacao_user (user_id),
    UNIQUE KEY uq_indicacao_codigo (codigo),
    CONSTRAINT fk_indicacao_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Uso do codigo: uma linha por conta indicada (so a primeira compra conta), criada quando o pagamento e confirmado.
CREATE TABLE IF NOT EXISTS indicacoes (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo_id    INT UNSIGNED NOT NULL,
    indicador_id INT UNSIGNED NOT NULL,
    indicado_id  INT UNSIGNED NOT NULL,
    desconto     INT UNSIGNED NOT NULL,
    credito      INT UNSIGNED NOT NULL,
    created_at   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_indicacao_indicado (indicado_id),
    KEY idx_indicacoes_indicador (indicador_id),
    CONSTRAINT fk_indicacoes_codigo FOREIGN KEY (codigo_id) REFERENCES codigos_indicacao (id) ON DELETE CASCADE,
    CONSTRAINT fk_indicacoes_indicador FOREIGN KEY (indicador_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_indicacoes_indicado FOREIGN KEY (indicado_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Extrato do credito de indicacao: valor positivo = credito ganho; negativo = usado numa compra. Saldo = soma.
CREATE TABLE IF NOT EXISTS indicacao_creditos (
    id         INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id    INT UNSIGNED NOT NULL,
    valor      INT          NOT NULL,
    tipo       VARCHAR(10)  NOT NULL,
    ref_id     INT UNSIGNED NULL,
    created_at DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_creditos_user (user_id),
    CONSTRAINT fk_creditos_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- O pedido do Pagopar guarda o preco cheio, o codigo usado, o desconto e o credito abatido; "valor" continua sendo o que e cobrado.
ALTER TABLE pagopar_pedidos
    ADD COLUMN valor_original   INT UNSIGNED NULL AFTER valor,
    ADD COLUMN codigo_id        INT UNSIGNED NULL AFTER valor_original,
    ADD COLUMN desconto         INT UNSIGNED NOT NULL DEFAULT 0 AFTER codigo_id,
    ADD COLUMN credito_usado    INT UNSIGNED NOT NULL DEFAULT 0 AFTER desconto;
