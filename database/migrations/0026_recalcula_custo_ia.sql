-- Recalcula o custo estimado da Claude ja gravado em ia_uso_diario com os precos calibrados no Console (US$ 1 entrada / US$ 5 saida por milhao;
-- cache: leitura 0,10 e escrita 1,25). Parte dos tokens da tabela, entao pode rodar de novo sem duplicar o ajuste.
-- A divisao entre texto e imagem mantem a proporcao ja gravada.
UPDATE ia_uso_diario
SET
    custo_imagem_micro = IF(custo_texto_micro + custo_imagem_micro > 0,
        ROUND((tok_entrada * 1 + tok_cache_leitura * 0.1 + tok_cache_escrita * 1.25 + tok_saida * 5) * custo_imagem_micro / (custo_texto_micro + custo_imagem_micro)),
        0),
    custo_texto_micro = ROUND(tok_entrada * 1 + tok_cache_leitura * 0.1 + tok_cache_escrita * 1.25 + tok_saida * 5)
        - IF(custo_texto_micro + custo_imagem_micro > 0,
            ROUND((tok_entrada * 1 + tok_cache_leitura * 0.1 + tok_cache_escrita * 1.25 + tok_saida * 5) * custo_imagem_micro / (custo_texto_micro + custo_imagem_micro)),
            0)
WHERE tok_entrada + tok_cache_leitura + tok_cache_escrita + tok_saida > 0;
