-- Niveis de plano (Basico / Premium / Pro), cota de registros por foto e audio e IA liberada pelo plano.
-- Idempotente: erros de "coluna ja existe" sao ignorados e os UPDATE podem rodar de novo.

-- Demonstrativo financeiro (resultado, categorias e comparativo) e a parte avancada (fluxo de caixa, por conta,
-- comparar com o ano passado ou com datas escolhidas).
ALTER TABLE planos ADD COLUMN rec_estado TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE planos ADD COLUMN rec_estado_avancado TINYINT(1) NOT NULL DEFAULT 0;
-- Registros de transacao por foto ou audio por mes (NULL = sem cota). Registro por texto nao conta aqui.
ALTER TABLE planos ADD COLUMN ia_midia_limite_mes INT UNSIGNED NULL;
ALTER TABLE ia_uso ADD COLUMN registros_midia INT UNSIGNED NOT NULL DEFAULT 0;
-- Quantos registros da cota cada acao da IA consumiu (devolvidos se o usuario reverter).
ALTER TABLE ia_acoes ADD COLUMN midia_registros SMALLINT UNSIGNED NOT NULL DEFAULT 0;

-- Plano de Teste antigo (7 dias, tudo liberado): continua com tudo ate terminar.
UPDATE planos SET rec_estado = 1, rec_estado_avancado = 1, ia_midia_limite_mes = 30 WHERE codigo = 'prueba';
-- Basico: ganha o demonstrativo anual; o demonstrativo financeiro passa a ser do Premium e do Pro.
UPDATE planos SET rec_relatorio_anual = 1, rec_estado = 0, rec_estado_avancado = 0, ia_midia_limite_mes = NULL WHERE codigo = 'basico';
-- Premium: demonstrativo financeiro e IA por foto e audio com 10 registros por mes.
UPDATE planos SET rec_estado = 1, rec_estado_avancado = 0, rec_ia_midia = 1, ia_midia_limite_mes = 10 WHERE codigo = 'premium';
-- Pro: tudo, com 30 registros por foto e audio por mes (3 vezes o Premium).
UPDATE planos SET rec_estado = 1, rec_estado_avancado = 1, rec_ia_midia = 1, ia_midia_limite_mes = 30 WHERE codigo = 'pro';

-- Chat IA liberado pelo plano: deixa de depender de o admin ligar usuario por usuario (o admin ainda pode desligar
-- alguem). O nivel avancado vale para quem tem plano com rec_ia_nivel2.
-- Antes de mudar, guarda quem estava com a IA ligada e em que nivel (para poder voltar atras se for preciso).
CREATE TABLE IF NOT EXISTS bkp_0031_users_ia AS SELECT id, ia_habilitada, ia_nivel FROM users;
ALTER TABLE users MODIFY COLUMN ia_habilitada TINYINT(1) NOT NULL DEFAULT 1;
UPDATE users SET ia_habilitada = 1;
ALTER TABLE users MODIFY COLUMN ia_nivel TINYINT UNSIGNED NOT NULL DEFAULT 2;
UPDATE users SET ia_nivel = 2;
