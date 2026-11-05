-- Erros do servidor guardados no banco (o log da hospedagem zera a cada deploy). Erros iguais (mesma mensagem e mesmo
-- ponto do codigo) ficam numa linha so, com o numero de ocorrencias. Aparecem em Admin > Erros (models/ErroSistema.js).
CREATE TABLE IF NOT EXISTS erros_sistema (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    assinatura   CHAR(40)      NOT NULL,
    mensagem     VARCHAR(500)  NOT NULL,
    stack        TEXT          NULL,
    metodo       VARCHAR(10)   NULL,
    rota         VARCHAR(255)  NULL,
    user_id      INT UNSIGNED  NULL,
    ocorrencias  INT UNSIGNED  NOT NULL DEFAULT 1,
    primeiro_em  DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ultimo_em    DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_erros_assinatura (assinatura),
    KEY idx_erros_ultimo (ultimo_em)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
