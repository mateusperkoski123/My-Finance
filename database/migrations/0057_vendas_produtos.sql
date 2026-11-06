-- Modulo Clientes: venda de produtos (com foto, estoque e custo).
-- Cada venda gera uma ou mais receitas (lancamentos) ligadas a ela por lancamentos.venda_id:
-- a vista (ja entra paga na conta) ou a cobrar em 1 ou mais parcelas (pendentes ate serem cobradas).
-- Assim elas entram no saldo, nos pendentes, nas Cobrancas e nos relatorios pela mesma regra de qualquer receita.
-- Categoria "Vendas" (receita, pai), criada na primeira venda; o id fica no usuario como o de "Servicos".
-- Categoria "Compra de mercadorias" (despesa), criada na primeira entrada de estoque que registra o gasto.
ALTER TABLE users ADD COLUMN categoria_vendas_id INT UNSIGNED NULL;
ALTER TABLE users ADD COLUMN categoria_estoque_id INT UNSIGNED NULL;

-- Produto que a pessoa vende. estoque NULL = nao controla estoque; estoque_minimo = a partir de quanto avisar.
CREATE TABLE IF NOT EXISTS cliente_produtos (
    id              INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id         INT UNSIGNED   NOT NULL,
    nome            VARCHAR(120)   NOT NULL,
    descricao       VARCHAR(500)   NULL,
    preco           DECIMAL(14,2)  NOT NULL DEFAULT 0,
    custo           DECIMAL(14,2)  NULL,
    estoque         INT            NULL,
    estoque_minimo  INT UNSIGNED   NULL,
    foto_em         DATETIME       NULL,
    status          ENUM('ativo','arquivado') NOT NULL DEFAULT 'ativo',
    created_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at      DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cliente_produtos_nome (user_id, nome),
    KEY idx_cliente_produtos_lista (user_id, status, nome),
    CONSTRAINT fk_cliente_produtos_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Foto do produto (uma por produto), no banco para sobreviver aos deploys; reduzida no navegador antes do envio.
CREATE TABLE IF NOT EXISTS cliente_produto_fotos (
    produto_id  INT UNSIGNED NOT NULL PRIMARY KEY,
    user_id     INT UNSIGNED NOT NULL,
    mime        VARCHAR(20)  NOT NULL,
    dados       MEDIUMBLOB   NOT NULL,
    KEY idx_cliente_produto_fotos_user (user_id),
    CONSTRAINT fk_cliente_produto_fotos_produto FOREIGN KEY (produto_id) REFERENCES cliente_produtos (id) ON DELETE CASCADE,
    CONSTRAINT fk_cliente_produto_fotos_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Venda para um cliente. numero = sequencia propria de cada usuario (Venda #1, #2...).
-- custo_total soma so os itens com custo; itens_sem_custo diz se o lucro da venda pode ser calculado.
CREATE TABLE IF NOT EXISTS cliente_vendas (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id          INT UNSIGNED   NOT NULL,
    numero           INT UNSIGNED   NOT NULL,
    cliente_id       INT UNSIGNED   NOT NULL,
    conta_id         INT UNSIGNED   NOT NULL,
    data_venda       DATE           NOT NULL,
    total            DECIMAL(14,2)  NOT NULL,
    custo_total      DECIMAL(14,2)  NOT NULL DEFAULT 0,
    itens_sem_custo  SMALLINT UNSIGNED NOT NULL DEFAULT 0,
    resumo           VARCHAR(160)   NOT NULL,
    forma            ENUM('avista','prazo') NOT NULL DEFAULT 'avista',
    parcelas         SMALLINT UNSIGNED NOT NULL DEFAULT 1,
    observacoes      VARCHAR(500)   NULL,
    status           ENUM('ativa','cancelada') NOT NULL DEFAULT 'ativa',
    cancelada_em     DATE           NULL,
    serie_id         CHAR(36)       NULL,
    created_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_cliente_vendas_numero (user_id, numero),
    KEY idx_cliente_vendas_data (user_id, data_venda),
    KEY idx_cliente_vendas_cliente (cliente_id),
    CONSTRAINT fk_cliente_vendas_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_cliente_vendas_cliente FOREIGN KEY (cliente_id) REFERENCES clientes (id) ON DELETE CASCADE,
    CONSTRAINT fk_cliente_vendas_conta FOREIGN KEY (conta_id) REFERENCES contas (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Itens da venda: nome, preco e custo do momento da venda (mudar o produto depois nao altera vendas antigas).
-- O item e um produto (produto_id) ou um servico vendido avulso (servico_id; custo 0, sem estoque).
CREATE TABLE IF NOT EXISTS cliente_venda_itens (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    venda_id     INT UNSIGNED   NOT NULL,
    produto_id   INT UNSIGNED   NULL,
    servico_id   INT UNSIGNED   NULL,
    nome         VARCHAR(120)   NOT NULL,
    quantidade   INT UNSIGNED   NOT NULL,
    preco_unit   DECIMAL(14,2)  NOT NULL,
    custo_unit   DECIMAL(14,2)  NULL,
    KEY idx_cliente_venda_itens_venda (venda_id),
    KEY idx_cliente_venda_itens_produto (produto_id),
    KEY idx_cliente_venda_itens_servico (servico_id),
    CONSTRAINT fk_cliente_venda_itens_venda FOREIGN KEY (venda_id) REFERENCES cliente_vendas (id) ON DELETE CASCADE,
    CONSTRAINT fk_cliente_venda_itens_produto FOREIGN KEY (produto_id) REFERENCES cliente_produtos (id) ON DELETE SET NULL,
    CONSTRAINT fk_cliente_venda_itens_servico FOREIGN KEY (servico_id) REFERENCES cliente_servicos (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Historico do estoque: cada mudanca de unidades (estoque inicial, entrada/reposicao, venda, devolucao, ajuste manual).
-- quantidade com sinal; saldo = estoque logo depois do movimento. A entrada pode ter gerado um gasto (lancamento_id).
CREATE TABLE IF NOT EXISTS cliente_estoque_movimentos (
    id             INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id        INT UNSIGNED   NOT NULL,
    produto_id     INT UNSIGNED   NOT NULL,
    tipo           ENUM('inicial','entrada','venda','devolucao','ajuste') NOT NULL,
    quantidade     INT            NOT NULL,
    saldo          INT            NULL,
    custo_unit     DECIMAL(14,2)  NULL,
    venda_id       INT UNSIGNED   NULL,
    lancamento_id  INT UNSIGNED   NULL,
    observacao     VARCHAR(200)   NULL,
    created_at     DATETIME       NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_estoque_mov_produto (produto_id, id),
    KEY idx_estoque_mov_user (user_id),
    CONSTRAINT fk_estoque_mov_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_estoque_mov_produto FOREIGN KEY (produto_id) REFERENCES cliente_produtos (id) ON DELETE CASCADE,
    CONSTRAINT fk_estoque_mov_venda FOREIGN KEY (venda_id) REFERENCES cliente_vendas (id) ON DELETE SET NULL,
    CONSTRAINT fk_estoque_mov_lancamento FOREIGN KEY (lancamento_id) REFERENCES lancamentos (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- As parcelas usam a mesma coluna cuota_num dos contratos (1, 2, 3...).
ALTER TABLE lancamentos ADD COLUMN venda_id INT UNSIGNED NULL;
ALTER TABLE lancamentos ADD INDEX idx_lancamentos_venda (venda_id, data_competencia);
ALTER TABLE lancamentos ADD CONSTRAINT fk_lancamentos_venda FOREIGN KEY (venda_id) REFERENCES cliente_vendas (id) ON DELETE SET NULL;
