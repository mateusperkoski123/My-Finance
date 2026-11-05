-- Teste gratis passa de 3 para 7 dias (2026-11-04, em core/negocio.js TRIAL_DIAS). Quem esta testando agora ganha
-- a mesma duracao: o fim vira inicio + 7 dias. Testes da promocao (10 dias) ja sao mais longos e nao mudam.
-- Idempotente: rodar de novo nao altera nada.
UPDATE assinaturas
SET trial_fim = DATE_ADD(trial_inicio, INTERVAL 7 DAY)
WHERE status = 'trial'
  AND trial_inicio IS NOT NULL
  AND trial_fim > NOW()
  AND trial_fim < DATE_ADD(trial_inicio, INTERVAL 7 DAY)
  AND plano_id IN (SELECT id FROM planos WHERE codigo IN ('basico', 'premium', 'pro'));
