-- Add serie_id column for grouping repeated/recurring transaction series
ALTER TABLE lancamentos
    ADD COLUMN serie_id VARCHAR(36) NULL AFTER id,
    ADD INDEX idx_lancamentos_serie (serie_id);
