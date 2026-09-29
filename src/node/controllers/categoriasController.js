const Categoria = require('../models/Categoria');
const { parseMoeda } = require('../core/helpers');

const categoriasController = {
    index: async (req, res) => {
        const userId = req.user.id;
        const abaArquivadas = req.query.aba === 'arquivadas';
        const busca = req.query.busca || '';
        const comSubcategoria = req.query.com_subcategoria === '1';

        let arvore = await Categoria.buscarArvore(userId, abaArquivadas, busca);
        if (comSubcategoria) {
            arvore = arvore.filter(c => c.subcategorias && c.subcategorias.length > 0);
        }

        const categoriasNormais = arvore.filter(c => !c.e_sistema);
        const categoriasSistema = arvore.filter(c => c.e_sistema);

        res.render('categorias/index', {
            title: req.t('pages.categorias.titulo'),
            categorias: categoriasNormais,
            sistema: categoriasSistema,
            abaArquivadas,
            filtros: { busca, com_subcategoria: comSubcategoria }
        });
    },

    criar: async (req, res) => {
        const userId = req.user.id;
        const b = req.body;
        if (!b.nome || !b.nome.trim()) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.categoria_nome_obrigatorio') };
            return res.redirect('/categorias');
        }

        await Categoria.criar(userId, {
            nome: b.nome.trim(),
            tipo: b.tipo || 'ambas',
            cor: b.cor || '#3b82f6',
            categoria_pai_id: b.categoria_pai_id || null,
            limite_gasto: b.limite_gasto ? parseMoeda(b.limite_gasto) : null
        });

        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.categoria_criada') };
        res.redirect('/categorias');
    },

    atualizar: async (req, res) => {
        const userId = req.user.id;
        const id = req.params.id;
        const b = req.body;

        await Categoria.atualizar(id, userId, {
            nome: b.nome.trim(),
            tipo: b.tipo || undefined,
            cor: b.cor,
            limite_gasto: b.limite_gasto ? parseMoeda(b.limite_gasto) : null
        });

        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.categoria_atualizada') };
        res.redirect('/categorias');
    },

    arquivar: async (req, res) => {
        const userId = req.user.id;
        const id = req.params.id;
        await Categoria.arquivar(id, userId);
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.categoria_arquivada') };
        res.redirect('/categorias');
    },

    restaurar: async (req, res) => {
        const userId = req.user.id;
        const id = req.params.id;
        await Categoria.restaurar(id, userId);
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.categoria_restaurada') };
        res.redirect('/categorias?aba=arquivadas');
    }
};

module.exports = categoriasController;
