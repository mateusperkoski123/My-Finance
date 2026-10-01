-- Fase 3: todo usuario que ja existe vira testador gratis ("Plan de Prueba", status beta,
-- sem data de vencimento). Nao cobra nem bloqueia ninguem.
INSERT INTO assinaturas (user_id, plano_id, status, trial_inicio, periodo_inicio)
SELECT u.id, (SELECT id FROM planos WHERE codigo = 'prueba'), 'beta', NOW(), CURDATE()
FROM users u
WHERE NOT EXISTS (SELECT 1 FROM assinaturas a WHERE a.user_id = u.id);
