-- Agora que a tabela categorias existe (Fase 2), liga categoria_id de
-- lancamentos a ela. ON DELETE SET NULL: arquivar nunca apaga a categoria,
-- mas se um dia uma categoria for removida de fato, o lancamento nao some
-- junto, so fica sem categoria.
ALTER TABLE lancamentos
    ADD CONSTRAINT fk_lancamentos_categoria FOREIGN KEY (categoria_id) REFERENCES categorias (id) ON DELETE SET NULL;
