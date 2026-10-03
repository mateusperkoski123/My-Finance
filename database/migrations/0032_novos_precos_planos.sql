-- Novos precos mensais (Gs., sem IVA): Basico 29.990, Premium 49.990, Pro 84.990.
-- O anual continua sendo 10 vezes o mensal (2 meses gratis). Quem ja pagou nao muda: o historico de pagamentos
-- guarda o valor de cada pagamento; o novo preco vale para os proximos pedidos.
UPDATE planos SET preco_mensal = 29990, preco_anual = 299900 WHERE codigo = 'basico';
UPDATE planos SET preco_mensal = 49990, preco_anual = 499900 WHERE codigo = 'premium';
UPDATE planos SET preco_mensal = 84990, preco_anual = 849900 WHERE codigo = 'pro';
