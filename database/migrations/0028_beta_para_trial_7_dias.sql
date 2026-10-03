-- Encerra o acesso gratuito sem vencimento (status beta): quem esta em "Prueba gratuita" passa a "En prueba"
-- com 7 dias a partir da aplicacao desta migration. Administradores continuam como estao.
UPDATE assinaturas a
JOIN users u ON u.id = a.user_id
SET a.status = 'trial',
    a.trial_inicio = NOW(),
    a.trial_fim = DATE_ADD(NOW(), INTERVAL 7 DAY)
WHERE a.status = 'beta' AND u.role <> 'admin';
