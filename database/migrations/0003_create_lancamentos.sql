-- Fase 1/3: lançamentos (ledger). "valor" e sempre guardado com sinal
-- (positivo = entra na conta, negativo = sai da conta), o que simplifica o
-- calculo de saldo (SUM(valor)) tanto para receita/despesa quanto para os
-- dois lados de uma transferencia. categoria_id fica sem FK por enquanto -
-- a tabela categorias so existe a partir da Fase 2 (a constraint e
-- adicionada em 0004_add_fk_categoria_lancamentos.sql).
CREATE TABLE IF NOT EXISTS lancamentos (
    id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id               INT UNSIGNED   NOT NULL,
    conta_id              INT UNSIGNED   NOT NULL,
    categoria_id          INT UNSIGNED   NULL,
    tipo                  ENUM('receita','despesa','transferencia','ajuste') NOT NULL,
    descricao             VARCHAR(190)   NOT NULL,
    valor                 DECIMAL(14,2)  NOT NULL,
    data_competencia      DATE           NOT NULL,
    data_pagamento        DATE           NULL,
    status                ENUM('pago','pendente') NOT NULL DEFAULT 'pago',
    recorrente            TINYINT(1)     NOT NULL DEFAULT 0,
    transferencia_par_id  INT UNSIGNED   NULL,
    observacoes           VARCHAR(500)   NULL,
    created_at            DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_lancamentos_user (user_id),
    KEY idx_lancamentos_conta (conta_id),
    KEY idx_lancamentos_categoria (categoria_id),
    KEY idx_lancamentos_data (data_competencia),
    CONSTRAINT fk_lancamentos_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_lancamentos_conta FOREIGN KEY (conta_id) REFERENCES contas (id) ON DELETE CASCADE,
    CONSTRAINT fk_lancamentos_par FOREIGN KEY (transferencia_par_id) REFERENCES lancamentos (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
