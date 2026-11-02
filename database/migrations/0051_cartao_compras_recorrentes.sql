-- Compra de cartao fixa (assinatura) ou repetida (parcelas): mesma logica dos lancamentos (serie_id agrupa as
-- ocorrencias, recorrente marca as fixas). Cada ocorrencia e uma linha independente em cartao_compras, caindo na
-- fatura do mes certo pela data; nao ha "status pago/pendente" por compra, isso so existe no nivel da fatura.
ALTER TABLE cartao_compras
    ADD COLUMN serie_id VARCHAR(36) NULL AFTER id,
    ADD COLUMN recorrente TINYINT(1) NOT NULL DEFAULT 0 AFTER fatura_mes,
    ADD INDEX idx_cartao_compras_serie (serie_id);
