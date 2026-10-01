-- Fase 2: seguranca, LGPD e papeis. Somente colunas novas, todas com DEFAULT/NULL
-- (nenhum dado existente e alterado).
ALTER TABLE users ADD COLUMN role VARCHAR(20) NOT NULL DEFAULT 'usuario';
ALTER TABLE users ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'ativo';
ALTER TABLE users ADD COLUMN ultimo_login_em DATETIME NULL;
ALTER TABLE users ADD COLUMN email_verificado_em DATETIME NULL;
ALTER TABLE users ADD COLUMN email_verif_token VARCHAR(64) NULL;
ALTER TABLE users ADD COLUMN termos_aceitos_em DATETIME NULL;
ALTER TABLE users ADD COLUMN termos_versao VARCHAR(20) NULL;
ALTER TABLE users ADD COLUMN politica_aceita_em DATETIME NULL;
ALTER TABLE users ADD COLUMN origem VARCHAR(30) NOT NULL DEFAULT 'web';
-- Quem ja existe neste momento e um testador (beta): fica gratis no "Plan de Prueba".
UPDATE users SET origem = 'beta' WHERE origem = 'web';
-- Tokens de recuperacao antigos estavam em texto puro; passam a ser guardados com hash,
-- entao os pendentes sao invalidados (o usuario so precisa pedir o link de novo).
UPDATE users SET reset_token = NULL, reset_expires = NULL;
