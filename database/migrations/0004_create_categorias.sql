-- Fase 2: categorias e subcategorias (1 nivel de profundidade: uma
-- subcategoria nao pode ter filhas). chave_sistema identifica as categorias
-- automaticas (Ajuste de Saldo, Transferencia Bancaria) usadas pelos
-- lancamentos automaticos criados em Contas Bancarias (Fase 1).
CREATE TABLE IF NOT EXISTS categorias (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       INT UNSIGNED        NOT NULL,
    parent_id     INT UNSIGNED        NULL,
    nome          VARCHAR(120)        NOT NULL,
    cor           VARCHAR(9)          NOT NULL DEFAULT '#2563eb',
    tipo          ENUM('receita','despesa','ambas') NOT NULL DEFAULT 'despesa',
    limite_gasto  DECIMAL(14,2)       NULL,
    sistema       TINYINT(1)          NOT NULL DEFAULT 0,
    chave_sistema VARCHAR(30)         NULL,
    status        ENUM('ativa','arquivada') NOT NULL DEFAULT 'ativa',
    created_at    DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME            NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_categorias_user (user_id),
    KEY idx_categorias_parent (parent_id),
    UNIQUE KEY uq_categorias_sistema (user_id, chave_sistema),
    CONSTRAINT fk_categorias_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_categorias_parent FOREIGN KEY (parent_id) REFERENCES categorias (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
