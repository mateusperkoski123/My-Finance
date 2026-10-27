-- Limites de gastos por mes (tela "Limites de gastos", do Premium em diante).
-- categoria_id = 0 e o limite geral do mes; os demais sao limites de categoria/subcategoria. O limite vale do mes
-- gravado em diante, ate existir outra linha mais nova; valor 0 = "sem limite a partir deste mes". Onde nao ha nenhuma
-- linha, vale o limite_gasto antigo da propria categoria.
CREATE TABLE IF NOT EXISTS limites_mensais (
    id            INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id       INT UNSIGNED  NOT NULL,
    categoria_id  INT UNSIGNED  NOT NULL DEFAULT 0,
    ano_mes       CHAR(7)       NOT NULL,
    valor         DECIMAL(14,2) NOT NULL DEFAULT 0,
    created_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uq_limites_mensais (user_id, categoria_id, ano_mes),
    CONSTRAINT fk_limites_mensais_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
