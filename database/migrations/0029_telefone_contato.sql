-- Telefone de contato do usuario (pedido pela tela de planos, para o admin falar com quem quer contratar).
-- Codigo do pais (ex.: +595) e numero (so digitos, sem zero inicial) ficam separados para o seletor de pais.
ALTER TABLE users ADD COLUMN telefone_codigo VARCHAR(6) NULL;
ALTER TABLE users ADD COLUMN telefone_numero VARCHAR(20) NULL;
