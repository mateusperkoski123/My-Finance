-- Plano Premium: limite de contas bancarias ativas sobe de 3 para 4.
UPDATE planos SET max_contas = 4 WHERE codigo = 'premium';

-- Aviso para a comunidade (Admin > Novidades), como RASCUNHO: revise e publique.
INSERT INTO comunidade_novidades (tipo, titulo_pt, titulo_es, titulo_en, texto_pt, texto_es, texto_en)
VALUES ('melhoria',
  'Plano Premium agora com 4 contas', 'Plan Premium ahora con 4 cuentas', 'Premium plan now with 4 accounts',
  'O plano Premium agora permite até 4 contas bancárias ativas (antes eram 3), sem custo adicional. Quem já é Premium já pode cadastrar a nova conta.',
  'El plan Premium ahora permite hasta 4 cuentas bancarias activas (antes eran 3), sin costo adicional. Quienes ya son Premium ya pueden registrar la nueva cuenta.',
  'The Premium plan now allows up to 4 active bank accounts (it was 3), at no extra cost. Current Premium members can already add the new account.');
