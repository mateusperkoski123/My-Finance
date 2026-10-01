-- Fase 5: indice composto para o painel/relatorios continuarem rapidos com muitos lancamentos.
ALTER TABLE lancamentos ADD INDEX idx_lancamentos_user_data_status (user_id, data_competencia, status);
