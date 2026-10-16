-- Modulo Compras: aviso de "provavelmente acabando" (calculado pelo historico de compras de cada produto).
-- avisar = 0: a cliente pediu para nao avisar mais deste produto (volta a 1 se ela o adicionar a uma lista de novo).
-- aviso_ate: "agora nao", esconde o aviso ate essa data. notificado_em: ultima vez que o aviso foi por notificacao
-- (evita repetir a mesma notificacao todo dia).
ALTER TABLE compras_produtos ADD COLUMN avisar TINYINT(1) NOT NULL DEFAULT 1;
ALTER TABLE compras_produtos ADD COLUMN aviso_ate DATE NULL;
ALTER TABLE compras_produtos ADD COLUMN notificado_em DATE NULL;

-- Opcao do usuario na tela de lembretes: receber o aviso de consumo por notificacao.
ALTER TABLE lembretes_config ADD COLUMN aviso_compras TINYINT(1) NOT NULL DEFAULT 0;
