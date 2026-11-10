-- Servico com custo e margem: o servico aponta para uma categoria de DESPESA (de preferencia com subcategorias, por exemplo
-- uma por conta de Spotify) onde a pessoa lanca o que ele custa. A tela do servico soma a receita das cuotas dos contratos e o
-- custo dessa categoria (e das subcategorias) e mostra a margem do mes. Sem categoria de custo, o servico funciona como antes.
ALTER TABLE cliente_servicos ADD COLUMN categoria_custo_id INT UNSIGNED NULL AFTER categoria_id;
ALTER TABLE cliente_servicos ADD CONSTRAINT fk_cliente_servicos_custo FOREIGN KEY (categoria_custo_id) REFERENCES categorias (id) ON DELETE SET NULL;
