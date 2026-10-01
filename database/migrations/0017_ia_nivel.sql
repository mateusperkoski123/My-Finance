-- Chat IA: nivel por usuario (1 = consultar e criar lancamento com confirmacao; 2 = tambem editar, marcar pago, categorias e transferencias).
ALTER TABLE users ADD COLUMN ia_nivel TINYINT UNSIGNED NOT NULL DEFAULT 1;
