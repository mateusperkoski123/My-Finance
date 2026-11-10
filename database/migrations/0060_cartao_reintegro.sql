-- Reintegro (cashback) do cartao: o cartao devolve uma porcentagem da compra, que abate da fatura.
-- cartoes.reintegro_pct = porcentagem configurada no cartao (0 = sem reintegro).
-- cartao_compras.reintegro_pct / reintegro_valor = o que foi aplicado em CADA compra (guardado na compra para que mudar
-- a porcentagem do cartao depois nao altere compras antigas). O valor a pagar da compra e valor - reintegro_valor.
ALTER TABLE cartoes
    ADD COLUMN reintegro_pct DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER limite_total;

ALTER TABLE cartao_compras
    ADD COLUMN reintegro_pct DECIMAL(5,2) NOT NULL DEFAULT 0 AFTER valor,
    ADD COLUMN reintegro_valor DECIMAL(14,2) NOT NULL DEFAULT 0 AFTER reintegro_pct;
