-- Opcao do usuario na tela de lembretes: avisar quando uma fatura de cartao de credito esta para vencer (hoje ou amanha).
ALTER TABLE lembretes_config ADD COLUMN aviso_cartoes TINYINT(1) NOT NULL DEFAULT 0;
