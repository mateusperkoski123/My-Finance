-- Foto de perfil. A imagem fica em tabela propria (o usuario e lido a cada requisicao; a foto nao pode pesar nisso).
-- users.foto_em marca se ha foto e serve de versao para o navegador atualizar a imagem.
ALTER TABLE users ADD COLUMN foto_em DATETIME NULL;

CREATE TABLE IF NOT EXISTS usuario_fotos (
    user_id INT UNSIGNED NOT NULL PRIMARY KEY,
    mime    VARCHAR(20)  NOT NULL,
    dados   MEDIUMBLOB   NOT NULL,
    CONSTRAINT fk_usuario_fotos_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
