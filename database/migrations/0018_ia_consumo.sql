-- Chat IA: consumo diario por usuario (tokens de texto, imagem e audio + custo estimado) e creditos comprados.
-- Sem chave estrangeira em user_id de proposito: o historico de consumo (e o saldo de creditos) nao pode sumir quando uma conta de teste e excluida.
CREATE TABLE IF NOT EXISTS ia_uso_diario (
    user_id            INT UNSIGNED NOT NULL,
    dia                DATE NOT NULL,
    mensagens          INT UNSIGNED NOT NULL DEFAULT 0,
    tok_entrada        BIGINT UNSIGNED NOT NULL DEFAULT 0,
    tok_cache_leitura  BIGINT UNSIGNED NOT NULL DEFAULT 0,
    tok_cache_escrita  BIGINT UNSIGNED NOT NULL DEFAULT 0,
    tok_saida          BIGINT UNSIGNED NOT NULL DEFAULT 0,
    tok_imagem         BIGINT UNSIGNED NOT NULL DEFAULT 0,
    tok_audio          BIGINT UNSIGNED NOT NULL DEFAULT 0,
    imagens            INT UNSIGNED NOT NULL DEFAULT 0,
    audios             INT UNSIGNED NOT NULL DEFAULT 0,
    audio_segundos     INT UNSIGNED NOT NULL DEFAULT 0,
    custo_texto_micro  BIGINT UNSIGNED NOT NULL DEFAULT 0,
    custo_imagem_micro BIGINT UNSIGNED NOT NULL DEFAULT 0,
    custo_audio_micro  BIGINT UNSIGNED NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, dia),
    KEY idx_ia_uso_dia (dia)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS ia_creditos (
    id           INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    valor_usd    DECIMAL(10,2) NOT NULL,
    data_compra  DATE NOT NULL,
    nota         VARCHAR(120) NULL,
    created_at   DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
