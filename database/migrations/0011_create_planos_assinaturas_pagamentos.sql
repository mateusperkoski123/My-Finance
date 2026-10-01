-- Fase 3/4: planos, assinaturas e pagamentos (independente de gateway).
-- Precos em guaranies (inteiros). Os planos podem ser editados direto nesta tabela.
CREATE TABLE IF NOT EXISTS planos (
    id                   INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    codigo               VARCHAR(30)   NOT NULL,
    nome                 VARCHAR(60)   NOT NULL,
    preco_mensal         INT UNSIGNED  NOT NULL DEFAULT 0,
    preco_anual          INT UNSIGNED  NOT NULL DEFAULT 0,
    moeda                VARCHAR(3)    NOT NULL DEFAULT 'PYG',
    max_contas           INT UNSIGNED  NULL,
    rec_relatorio_anual  TINYINT(1)    NOT NULL DEFAULT 0,
    rec_exportar         TINYINT(1)    NOT NULL DEFAULT 0,
    rec_backup           TINYINT(1)    NOT NULL DEFAULT 0,
    ordem                INT           NOT NULL DEFAULT 0,
    ativo                TINYINT(1)    NOT NULL DEFAULT 1,
    created_at           DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_planos_codigo (codigo)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Uma assinatura (a atual) por usuario. O historico fica em "pagamentos".
-- status: beta | trial | ativa | vencida | cancelada
CREATE TABLE IF NOT EXISTS assinaturas (
    id                     INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id                INT UNSIGNED  NOT NULL,
    plano_id               INT UNSIGNED  NOT NULL,
    ciclo                  VARCHAR(10)   NULL,
    status                 VARCHAR(20)   NOT NULL DEFAULT 'trial',
    trial_inicio           DATETIME      NULL,
    trial_fim              DATETIME      NULL,
    periodo_inicio         DATE          NULL,
    periodo_fim            DATE          NULL,
    plano_solicitado_id    INT UNSIGNED  NULL,
    ciclo_solicitado       VARCHAR(10)   NULL,
    solicitado_em          DATETIME      NULL,
    cancelada_em           DATETIME      NULL,
    gateway                VARCHAR(30)   NULL,
    gateway_ref            VARCHAR(100)  NULL,
    created_at             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at             DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_assinaturas_user (user_id),
    KEY idx_assinaturas_status (status),
    CONSTRAINT fk_assinaturas_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_assinaturas_plano FOREIGN KEY (plano_id) REFERENCES planos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Registro financeiro. Se o usuario excluir a conta, o pagamento permanece (sem user_id)
-- para fins contabeis.
CREATE TABLE IF NOT EXISTS pagamentos (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id        INT UNSIGNED  NULL,
    assinatura_id  INT UNSIGNED  NULL,
    plano_id       INT UNSIGNED  NULL,
    ciclo          VARCHAR(10)   NULL,
    valor          INT UNSIGNED  NOT NULL DEFAULT 0,
    moeda          VARCHAR(3)    NOT NULL DEFAULT 'PYG',
    metodo         VARCHAR(30)   NOT NULL DEFAULT 'manual',
    status         VARCHAR(20)   NOT NULL DEFAULT 'pago',
    referencia     VARCHAR(100)  NULL,
    gateway        VARCHAR(30)   NULL,
    gateway_ref    VARCHAR(100)  NULL,
    observacao     VARCHAR(255)  NULL,
    pago_em        DATETIME      NULL,
    registrado_por INT UNSIGNED  NULL,
    created_at     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_pagamentos_user (user_id),
    KEY idx_pagamentos_assinatura (assinatura_id),
    CONSTRAINT fk_pagamentos_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL,
    CONSTRAINT fk_pagamentos_assinatura FOREIGN KEY (assinatura_id) REFERENCES assinaturas (id) ON DELETE SET NULL,
    CONSTRAINT fk_pagamentos_plano FOREIGN KEY (plano_id) REFERENCES planos (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Planos iniciais. Anual = 10 x mensal (2 meses de desconto).
INSERT IGNORE INTO planos (codigo, nome, preco_mensal, preco_anual, moeda, max_contas, rec_relatorio_anual, rec_exportar, rec_backup, ordem)
VALUES ('prueba',  'Plan de Prueba', 0,     0,      'PYG', NULL, 1, 1, 1, 0);
INSERT IGNORE INTO planos (codigo, nome, preco_mensal, preco_anual, moeda, max_contas, rec_relatorio_anual, rec_exportar, rec_backup, ordem)
VALUES ('basico',  'Plan Básico',   30000, 300000,  'PYG', 3,    0, 0, 0, 1);
INSERT IGNORE INTO planos (codigo, nome, preco_mensal, preco_anual, moeda, max_contas, rec_relatorio_anual, rec_exportar, rec_backup, ordem)
VALUES ('premium', 'Plan Premium',  70000, 700000,  'PYG', NULL, 1, 1, 1, 2);
