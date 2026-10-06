-- "Financeiro" (cobrancas por inatividade) liberado para todos: liga para quem ja tinha configuracao e cria a linha
-- (ligada) de todo mundo que ja tem aparelho inscrito. Quem pausou mantem a pausa.
INSERT INTO financeiro_config (user_id, ativo)
SELECT DISTINCT p.user_id, 1 FROM push_inscricoes p
ON DUPLICATE KEY UPDATE ativo = 1;

UPDATE financeiro_config SET ativo = 1 WHERE ativo = 0;
