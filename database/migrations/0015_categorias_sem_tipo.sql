-- Categorias deixam de ter tipo (despesa/receita): qualquer categoria serve para os dois.
-- A coluna continua existindo por compatibilidade, mas passa a ser sempre 'ambas'.
UPDATE categorias SET tipo = 'ambas' WHERE tipo <> 'ambas';
