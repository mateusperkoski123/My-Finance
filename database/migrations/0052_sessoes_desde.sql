-- Momento (epoch em ms) a partir do qual as sessoes do usuario valem. Trocar ou redefinir a senha grava o instante:
-- sessoes abertas antes disso (outro navegador, alguem que tinha a senha antiga) sao encerradas no proximo acesso.
ALTER TABLE users ADD COLUMN sessoes_desde BIGINT UNSIGNED NULL;
