-- Remove a copia de seguranca criada pela migration 0031 (users.ia_habilitada e ia_nivel de antes de a IA passar a ser
-- liberada pelo plano). Nao e mais necessaria. Em banco novo a 0031 cria a tabela e esta migration apaga em seguida.
DROP TABLE IF EXISTS bkp_0031_users_ia;
