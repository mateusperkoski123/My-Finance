-- Chat IA: lancamentos sao registrados na hora e podem ser revertidos por alguns segundos.
-- 'confirmada' passa a significar "aplicada"; 'revertida' = desfeita pelo usuario dentro da janela.
ALTER TABLE ia_acoes
    MODIFY COLUMN status ENUM('pendente','confirmada','cancelada','revertida') NOT NULL DEFAULT 'pendente',
    ADD COLUMN aplicada_em DATETIME NULL AFTER lancamento_id;
