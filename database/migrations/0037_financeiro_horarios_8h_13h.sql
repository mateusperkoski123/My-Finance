-- Financeiro: agora envia as 8h e as 13h (antes 20h). Limpa o horario ja agendado para recalcular no proximo ciclo.
UPDATE financeiro_config SET proximo_envio = NULL;
