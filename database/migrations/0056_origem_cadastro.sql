-- Origem do cadastro: etiquetas utm_* do link de divulgacao (ex.: ?utm_source=whatsapp&utm_campaign=grupo-x),
-- gravadas quando a conta e criada (core/origem.js). Alimentam o funil do admin (Admin > Funil).
-- Um ALTER por coluna: se uma ja existir, o erro "ja existe" e ignorado sem impedir as outras.
ALTER TABLE users ADD COLUMN utm_source VARCHAR(60) NULL;
ALTER TABLE users ADD COLUMN utm_medium VARCHAR(60) NULL;
ALTER TABLE users ADD COLUMN utm_campaign VARCHAR(80) NULL;
ALTER TABLE users ADD INDEX idx_users_utm_source (utm_source);
