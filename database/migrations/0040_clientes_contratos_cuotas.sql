-- Modulo Clientes: clientes que pagam cuotas (mensalidades) por servicos contratados.
-- Cada cuota e um lancamento de receita (pendente ate ser paga), ligado ao contrato por lancamentos.contrato_id;
-- assim ela entra nos pendentes, no saldo previsto e nos relatorios pela mesma regra de qualquer receita.
-- O modulo e liberado por usuario pelo admin (users.clientes_habilitado), como o Chat IA.
ALTER TABLE users ADD COLUMN clientes_habilitado TINYINT(1) NOT NULL DEFAULT 0;
-- Categoria "Servicos" (a pai); cada servico vendido e uma subcategoria dela.
ALTER TABLE users ADD COLUMN categoria_servicos_id INT UNSIGNED NULL;

CREATE TABLE IF NOT EXISTS cliente_servicos (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED   NOT NULL,
    nome            VARCHAR(120)   NOT NULL,
    valor_padrao    DECIMAL(14,2)  NOT NULL DEFAULT 0,
    dia_vencimento  TINYINT UNSIGNED NULL,
    categoria_id    INT UNSIGNED   NULL,
    status          ENUM('ativo','arquivado') NOT NULL DEFAULT 'ativo',
    created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cliente_servicos_nome (user_id, nome),
    CONSTRAINT fk_cliente_servicos_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_cliente_servicos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS clientes (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       INT UNSIGNED  NOT NULL,
    nome          VARCHAR(150)  NOT NULL,
    celular       VARCHAR(40)   NULL,
    cedula        VARCHAR(40)   NULL,
    ruc           VARCHAR(40)   NULL,
    email         VARCHAR(190)  NULL,
    observacoes   VARCHAR(1000) NULL,
    status        ENUM('ativo','inativo') NOT NULL DEFAULT 'ativo',
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_clientes_lista (user_id, status, nome),
    KEY idx_clientes_cedula (user_id, cedula),
    CONSTRAINT fk_clientes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Um contrato = um servico de um cliente (o cliente pode ter varios, ate do mesmo servico).
-- prazo_meses/cuotas_total nulos = sem prazo (as cuotas sao geradas com antecedencia e renovadas sozinhas).
CREATE TABLE IF NOT EXISTS cliente_contratos (
    id                    INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id               INT UNSIGNED   NOT NULL,
    cliente_id            INT UNSIGNED   NOT NULL,
    servico_id            INT UNSIGNED   NOT NULL,
    conta_id              INT UNSIGNED   NOT NULL,
    valor                 DECIMAL(14,2)  NOT NULL,
    periodicidade         ENUM('mensal','anual') NOT NULL DEFAULT 'mensal',
    prazo_meses           SMALLINT UNSIGNED NULL,
    cuotas_total          SMALLINT UNSIGNED NULL,
    dia_vencimento        TINYINT UNSIGNED NOT NULL,
    data_inicio           DATE           NOT NULL,
    status                ENUM('ativo','cancelado') NOT NULL DEFAULT 'ativo',
    cancelado_em          DATE           NULL,
    motivo_cancelamento   VARCHAR(255)   NULL,
    serie_id              CHAR(36)       NOT NULL,
    created_at            DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at            DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_contratos_cliente (user_id, cliente_id),
    KEY idx_contratos_status (user_id, status),
    CONSTRAINT fk_contratos_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_contratos_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON DELETE CASCADE,
    CONSTRAINT fk_contratos_servico FOREIGN KEY (servico_id) REFERENCES cliente_servicos (id) ON DELETE CASCADE,
    CONSTRAINT fk_contratos_conta FOREIGN KEY (conta_id) REFERENCES contas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

ALTER TABLE lancamentos ADD COLUMN contrato_id INT UNSIGNED NULL;
ALTER TABLE lancamentos ADD COLUMN cuota_num SMALLINT UNSIGNED NULL;
ALTER TABLE lancamentos ADD INDEX idx_lancamentos_contrato (contrato_id, data_competencia);
ALTER TABLE lancamentos ADD CONSTRAINT fk_lancamentos_contrato FOREIGN KEY (contrato_id) REFERENCES cliente_contratos (id) ON DELETE SET NULL;

-- Aviso de vencimento dos clientes ("hoje vencem N clientes"), opcional, no mesmo horario dos lembretes.
ALTER TABLE lembretes_config ADD COLUMN aviso_clientes TINYINT(1) NOT NULL DEFAULT 0;

-- Planilha enviada e ja validada, esperando a confirmacao do usuario (guardada aqui, nao na sessao: sao centenas de linhas).
CREATE TABLE IF NOT EXISTS cliente_importacoes (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    arquivo     VARCHAR(120) NOT NULL,
    dados       MEDIUMTEXT   NOT NULL,
    created_at  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_cliente_importacoes_user (user_id, created_at),
    CONSTRAINT fk_cliente_importacoes_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
