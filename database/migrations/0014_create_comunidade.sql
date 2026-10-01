-- Modulo Comunidade: sugestoes e erros enviados pelos usuarios.
CREATE TABLE IF NOT EXISTS comunidade_posts (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    user_id          INT UNSIGNED  NULL,
    categoria        VARCHAR(20)   NOT NULL DEFAULT 'sugestao',
    titulo           VARCHAR(120)  NOT NULL,
    descricao        TEXT          NOT NULL,
    esperado         VARCHAR(1000) NULL,
    contexto_url     VARCHAR(255)  NULL,
    contexto_ua      VARCHAR(255)  NULL,
    status           VARCHAR(20)   NOT NULL DEFAULT 'novo',
    oculto           TINYINT(1)    NOT NULL DEFAULT 0,
    votos            INT UNSIGNED  NOT NULL DEFAULT 0,
    comentarios      INT UNSIGNED  NOT NULL DEFAULT 0,
    resolvido_em     DATETIME      NULL,
    created_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    KEY idx_com_posts_categoria (categoria),
    KEY idx_com_posts_status (status),
    KEY idx_com_posts_votos (votos),
    KEY idx_com_posts_data (created_at),
    KEY idx_com_posts_user (user_id),
    CONSTRAINT fk_com_posts_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comunidade_votos (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    post_id          INT UNSIGNED NOT NULL,
    user_id          INT UNSIGNED NOT NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_com_votos_post_user (post_id, user_id),
    CONSTRAINT fk_com_votos_post FOREIGN KEY (post_id) REFERENCES comunidade_posts (id) ON DELETE CASCADE,
    CONSTRAINT fk_com_votos_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comunidade_importancia (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    post_id          INT UNSIGNED NOT NULL,
    user_id          INT UNSIGNED NOT NULL,
    nivel            TINYINT UNSIGNED NOT NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_com_imp_post_user (post_id, user_id),
    CONSTRAINT fk_com_imp_post FOREIGN KEY (post_id) REFERENCES comunidade_posts (id) ON DELETE CASCADE,
    CONSTRAINT fk_com_imp_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comunidade_inscricoes (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    post_id          INT UNSIGNED NOT NULL,
    user_id          INT UNSIGNED NOT NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_com_insc_post_user (post_id, user_id),
    CONSTRAINT fk_com_insc_post FOREIGN KEY (post_id) REFERENCES comunidade_posts (id) ON DELETE CASCADE,
    CONSTRAINT fk_com_insc_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comunidade_comentarios (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    post_id          INT UNSIGNED NOT NULL,
    user_id          INT UNSIGNED NULL,
    corpo            TEXT         NOT NULL,
    da_equipe        TINYINT(1)   NOT NULL DEFAULT 0,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_com_coment_post (post_id),
    CONSTRAINT fk_com_coment_post FOREIGN KEY (post_id) REFERENCES comunidade_posts (id) ON DELETE CASCADE,
    CONSTRAINT fk_com_coment_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comunidade_anexos (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    post_id          INT UNSIGNED NULL,
    comentario_id    INT UNSIGNED NULL,
    user_id          INT UNSIGNED NULL,
    nome_original    VARCHAR(190) NOT NULL,
    mime             VARCHAR(50)  NOT NULL,
    tamanho          INT UNSIGNED NOT NULL,
    dados            MEDIUMBLOB   NOT NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_com_anexos_post (post_id),
    KEY idx_com_anexos_comentario (comentario_id),
    CONSTRAINT fk_com_anexos_post FOREIGN KEY (post_id) REFERENCES comunidade_posts (id) ON DELETE CASCADE,
    CONSTRAINT fk_com_anexos_comentario FOREIGN KEY (comentario_id) REFERENCES comunidade_comentarios (id) ON DELETE CASCADE,
    CONSTRAINT fk_com_anexos_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE TABLE IF NOT EXISTS comunidade_atividades (
    id               INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    post_id          INT UNSIGNED NOT NULL,
    user_id          INT UNSIGNED NULL,
    tipo             VARCHAR(20)  NOT NULL,
    detalhe          VARCHAR(255) NULL,
    created_at       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_com_ativ_post (post_id),
    CONSTRAINT fk_com_ativ_post FOREIGN KEY (post_id) REFERENCES comunidade_posts (id) ON DELETE CASCADE,
    CONSTRAINT fk_com_ativ_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
