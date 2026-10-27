-- Codigo de desconto (indicacao) digitado na criacao da conta: fica guardado e ja vem preenchido na compra do primeiro plano.
-- Apagado quando a compra com o codigo e paga.
ALTER TABLE users ADD COLUMN codigo_desconto VARCHAR(20) NULL;
