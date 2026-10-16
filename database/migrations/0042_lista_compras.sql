-- Modulo Compras (lista de compras): a cliente monta a lista, marca o que pegou e, ao fechar a compra,
-- o total vira um lancamento de despesa na categoria e conta que ela escolheu para a lista.
-- Liberado por usuario pelo admin (users.compras_habilitado), como o modulo Clientes.
ALTER TABLE users ADD COLUMN compras_habilitado TINYINT(1) NOT NULL DEFAULT 0;

-- Uma lista por tipo de compra (Mercado, Farmacia, Pet...). A categoria e a conta ficam guardadas na lista:
-- cada cliente tem as suas categorias, entao o vinculo e escolhido por ela, nunca deduzido pelo nome.
CREATE TABLE IF NOT EXISTS compras_listas (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id      INT UNSIGNED  NOT NULL,
    nome         VARCHAR(80)   NOT NULL,
    categoria_id INT UNSIGNED  NULL,
    conta_id     INT UNSIGNED  NULL,
    status       ENUM('ativa','arquivada') NOT NULL DEFAULT 'ativa',
    created_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at   DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_compras_listas_user (user_id, status),
    CONSTRAINT fk_compras_listas_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_compras_listas_categoria FOREIGN KEY (categoria_id) REFERENCES categorias (id) ON DELETE SET NULL,
    CONSTRAINT fk_compras_listas_conta FOREIGN KEY (conta_id) REFERENCES contas (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Produtos que a cliente ja usou: sugestoes ao digitar e ultimo preco pago (base da estimativa).
CREATE TABLE IF NOT EXISTS compras_produtos (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       INT UNSIGNED  NOT NULL,
    nome          VARCHAR(120)  NOT NULL,
    ultimo_preco  DECIMAL(14,2) NULL,
    ultima_compra DATE          NULL,
    vezes_compra  INT UNSIGNED  NOT NULL DEFAULT 0,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_compras_produtos_nome (user_id, nome),
    CONSTRAINT fk_compras_produtos_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Itens que estao na lista agora. Ao fechar a compra, os marcados saem da lista e entram no historico.
CREATE TABLE IF NOT EXISTS compras_itens (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED  NOT NULL,
    lista_id    INT UNSIGNED  NOT NULL,
    produto_id  INT UNSIGNED  NULL,
    nome        VARCHAR(120)  NOT NULL,
    preco       DECIMAL(14,2) NULL,
    marcado     TINYINT(1)    NOT NULL DEFAULT 0,
    created_at  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_compras_itens_lista (lista_id, marcado),
    CONSTRAINT fk_compras_itens_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_compras_itens_lista FOREIGN KEY (lista_id) REFERENCES compras_listas (id) ON DELETE CASCADE,
    CONSTRAINT fk_compras_itens_produto FOREIGN KEY (produto_id) REFERENCES compras_produtos (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Cada compra fechada: o total pago, a estimativa que o app tinha na hora e o lancamento gerado.
CREATE TABLE IF NOT EXISTS compras_fechamentos (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED  NOT NULL,
    lista_id        INT UNSIGNED  NOT NULL,
    lancamento_id   INT UNSIGNED  NULL,
    total           DECIMAL(14,2) NOT NULL,
    estimativa      DECIMAL(14,2) NULL,
    itens_comprados SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    data_compra     DATE          NOT NULL,
    created_at      DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_compras_fechamentos_lista (lista_id, data_compra),
    CONSTRAINT fk_compras_fechamentos_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_compras_fechamentos_lista FOREIGN KEY (lista_id) REFERENCES compras_listas (id) ON DELETE CASCADE,
    CONSTRAINT fk_compras_fechamentos_lancamento FOREIGN KEY (lancamento_id) REFERENCES lancamentos (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Uma linha por produto comprado em cada data: a base do futuro aviso de "provavelmente acabando".
CREATE TABLE IF NOT EXISTS compras_historico (
    id          INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id     INT UNSIGNED  NOT NULL,
    produto_id  INT UNSIGNED  NOT NULL,
    data_compra DATE          NOT NULL,
    preco       DECIMAL(14,2) NULL,
    KEY idx_compras_historico_produto (user_id, produto_id, data_compra),
    CONSTRAINT fk_compras_historico_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_compras_historico_produto FOREIGN KEY (produto_id) REFERENCES compras_produtos (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
