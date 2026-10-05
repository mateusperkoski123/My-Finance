-- "Financeiro": notificacoes de cobranca por inatividade (quem fica dias sem registrar movimentos).
-- Nasce DESLIGADO (ativo = 0): na fase de teste so admins podem ligar; depois, com FINANCEIRO_LIBERADO=todos no .env,
-- os aparelhos novos entram ligados. ativo = 0 tambem e a opcao "nao incomodar mais".
-- pausado_ate e proximo_envio sao instantes UTC em milissegundos (epoch), como em lembretes_config.
CREATE TABLE IF NOT EXISTS financeiro_config (
    user_id         INT UNSIGNED    NOT NULL PRIMARY KEY,
    ativo           TINYINT(1)      NOT NULL DEFAULT 0,
    pausado_ate     BIGINT UNSIGNED NULL,
    fuso            VARCHAR(64)     NULL,
    proximo_envio   BIGINT UNSIGNED NULL,
    ultimo_envio_em DATETIME        NULL,
    ultima_msg      TINYINT UNSIGNED NULL,
    updated_at      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_financeiro_proximo (ativo, proximo_envio),
    CONSTRAINT fk_financeiro_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
