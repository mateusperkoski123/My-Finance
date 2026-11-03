-- Pais da conta (independente do idioma): define a moeda inicial, o fuso do "hoje", o DDI sugerido e a versao dos Termos
-- e da Politica de Privacidade (lei do pais). Contas existentes ficam no Paraguai, o mercado em que o sistema comecou.
ALTER TABLE users ADD COLUMN pais CHAR(2) NOT NULL DEFAULT 'PY';
