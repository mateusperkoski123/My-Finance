-- Ultimo acesso do usuario (data e hora). Gravado no maximo a cada 12 horas por usuario para nao sobrecarregar o banco.
ALTER TABLE users ADD COLUMN ultimo_acesso_em DATETIME NULL;
