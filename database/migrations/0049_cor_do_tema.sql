-- Cor do tema escolhida em Configuracoes > Preferencia (verde, azul ou preto). Vale junto com o tema claro/escuro.
ALTER TABLE users ADD COLUMN cor_tema VARCHAR(20) NOT NULL DEFAULT 'verde';
