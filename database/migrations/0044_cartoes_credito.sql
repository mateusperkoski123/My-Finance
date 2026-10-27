-- Modulo Cartao de credito: o cartao pertence a uma conta (que paga a fatura e define a moeda). As compras ficam
-- fora do saldo e dos relatorios ate a fatura ser paga; ao pagar, cada compra vira um lancamento de despesa na
-- conta do cartao (categoria preservada) e o saldo cai. Sem parcelamento.
CREATE TABLE IF NOT EXISTS cartoes (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED  NOT NULL,
    conta_id        INT UNSIGNED  NOT NULL,
    nome            VARCHAR(80)   NOT NULL,
    bandeira        VARCHAR(30)   NOT NULL DEFAULT '',
    limite_total    DECIMAL(14,2) NOT NULL DEFAULT 0,
    dia_fechamento  TINYINT UNSIGNED NOT NULL DEFAULT 1,
    dia_vencimento  TINYINT UNSIGNED NOT NULL DEFAULT 10,
    status          ENUM('ativo','arquivado') NOT NULL DEFAULT 'ativo',
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_cartoes_user (user_id, status),
    CONSTRAINT fk_cartoes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_cartoes_conta FOREIGN KEY (conta_id) REFERENCES contas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Compras no cartao. fatura_mes = mes (YYYY-MM) em que a fatura FECHA; lancamento_id so e preenchido quando a fatura e paga.
CREATE TABLE IF NOT EXISTS cartao_compras (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       INT UNSIGNED  NOT NULL,
    cartao_id     INT UNSIGNED  NOT NULL,
    categoria_id  INT UNSIGNED  NULL,
    descricao     VARCHAR(190)  NOT NULL,
    valor         DECIMAL(14,2) NOT NULL,
    data_compra   DATE          NOT NULL,
    fatura_mes    CHAR(7)       NOT NULL,
    lancamento_id INT UNSIGNED  NULL,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_cartao_compras_fatura (cartao_id, fatura_mes),
    KEY idx_cartao_compras_user (user_id),
    CONSTRAINT fk_cartao_compras_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_cartao_compras_cartao FOREIGN KEY (cartao_id) REFERENCES cartoes (id) ON DELETE CASCADE,
    CONSTRAINT fk_cartao_compras_categoria FOREIGN KEY (categoria_id) REFERENCES categorias (id) ON DELETE SET NULL,
    CONSTRAINT fk_cartao_compras_lancamento FOREIGN KEY (lancamento_id) REFERENCES lancamentos (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Uma linha por fatura PAGA (a fatura em aberto e calculada pelas compras). O UNIQUE impede pagar a mesma fatura duas vezes.
CREATE TABLE IF NOT EXISTS cartao_faturas (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED  NOT NULL,
    cartao_id   INT UNSIGNED  NOT NULL,
    mes         CHAR(7)       NOT NULL,
    total       DECIMAL(14,2) NOT NULL,
    pago_em     DATE          NOT NULL,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cartao_faturas (cartao_id, mes),
    CONSTRAINT fk_cartao_faturas_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_cartao_faturas_cartao FOREIGN KEY (cartao_id) REFERENCES cartoes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
