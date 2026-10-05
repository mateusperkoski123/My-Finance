-- Moeda por conta (Guarani, Real, Dolar...) e cotacao nas transferencias entre moedas diferentes.
-- Ate aqui a moeda era uma preferencia unica do usuario; as contas que ja existem ficam com a moeda que ele escolheu,
-- entao nada muda na tela de quem usa uma moeda so. Em lancamentos, "cotacao" so e preenchida nas duas pernas de uma
-- transferencia de cambio (valor de cada perna ja fica na moeda da respectiva conta).
ALTER TABLE contas ADD COLUMN moeda VARCHAR(3) NOT NULL DEFAULT 'PYG' AFTER nome;

UPDATE contas c JOIN users u ON u.id = c.user_id
   SET c.moeda = u.moeda
 WHERE u.moeda IN ('PYG', 'BRL', 'USD', 'EUR', 'ARS');

ALTER TABLE lancamentos ADD COLUMN cotacao DECIMAL(18,6) NULL;
