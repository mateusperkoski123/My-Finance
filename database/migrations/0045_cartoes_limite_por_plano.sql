-- Cartoes de credito ativos por plano: Basico 1, Premium 3, Pro 6 (NULL = sem limite, usado no plano de teste antigo).
-- Idempotente: erro de "coluna ja existe" e ignorado e os UPDATE podem rodar de novo.
ALTER TABLE planos ADD COLUMN max_cartoes INT UNSIGNED NULL;

UPDATE planos SET max_cartoes = 1 WHERE codigo = 'basico';
UPDATE planos SET max_cartoes = 3 WHERE codigo = 'premium';
UPDATE planos SET max_cartoes = 6 WHERE codigo = 'pro';
