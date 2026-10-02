-- Planos Basico / Premium / Pro: recursos de IA e app por plano, novos precos e limites.
-- Idempotente: erros de "coluna ja existe" sao ignorados e os UPDATE/INSERT IGNORE podem rodar de novo.
ALTER TABLE planos ADD COLUMN rec_ia TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE planos ADD COLUMN rec_ia_midia TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE planos ADD COLUMN rec_ia_nivel2 TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE planos ADD COLUMN rec_offline TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE planos ADD COLUMN ia_limite_mes INT UNSIGNED NULL;

-- Plano de Teste: tudo liberado (como antes). O limite de mensagens segue o padrao do sistema.
UPDATE planos SET rec_ia = 1, rec_ia_midia = 1, rec_ia_nivel2 = 1, rec_offline = 1, ia_limite_mes = NULL WHERE codigo = 'prueba';

-- Basico: Gs. 25.000, 2 contas, sem IA, sem offline, sem demonstrativo anual/exportacao/backup.
UPDATE planos SET preco_mensal = 25000, preco_anual = 250000, max_contas = 2,
    rec_relatorio_anual = 0, rec_exportar = 0, rec_backup = 0,
    rec_ia = 0, rec_ia_midia = 0, rec_ia_nivel2 = 0, rec_offline = 0, ia_limite_mes = NULL
WHERE codigo = 'basico';

-- Premium: Gs. 45.000, 3 contas, IA por texto (300 msgs/mes), offline, demonstrativo anual; sem exportacao/backup.
UPDATE planos SET preco_mensal = 45000, preco_anual = 450000, max_contas = 3,
    rec_relatorio_anual = 1, rec_exportar = 0, rec_backup = 0,
    rec_ia = 1, rec_ia_midia = 0, rec_ia_nivel2 = 0, rec_offline = 1, ia_limite_mes = 300
WHERE codigo = 'premium';

-- Pro: Gs. 80.000, contas ilimitadas, tudo do Premium + foto/audio, IA avancada, exportacao/backup, 600 msgs/mes.
INSERT IGNORE INTO planos (codigo, nome, preco_mensal, preco_anual, moeda, max_contas, rec_relatorio_anual, rec_exportar, rec_backup, ordem)
VALUES ('pro', 'Plan Pro', 80000, 800000, 'PYG', NULL, 1, 1, 1, 3);
UPDATE planos SET preco_mensal = 80000, preco_anual = 800000, max_contas = NULL,
    rec_relatorio_anual = 1, rec_exportar = 1, rec_backup = 1,
    rec_ia = 1, rec_ia_midia = 1, rec_ia_nivel2 = 1, rec_offline = 1, ia_limite_mes = 600
WHERE codigo = 'pro';
