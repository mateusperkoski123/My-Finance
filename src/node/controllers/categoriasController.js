const Categoria = require('../models/Categoria');
const { parseMoeda } = require('../core/helpers');

const categoriasController = {
    index: async (req, res) => {
        const userId = req.user.id;
        const abaArquivadas = req.query.aba === 'arquivadas';
        const busca = req.query.busca || '';
        const comSubcategoria = req.query.com_subcategoria === '1';

        let arvore = await Categoria.buscarArvoreGerenciar(userId, { arquivadas: abaArquivadas, busca });
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
            cor: b.cor || '#3b82f6',
            categoria_pai_id: b.categoria_pai_id || null,
            limite_gasto: b.limite_gasto ? parseMoeda(b.limite_gasto) : null
        });

        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.categoria_criada') };
        res.redirect('/categorias');
    },

    // Criacao rapida (JSON) a partir dos modais de lancamento: categoria ou, com categoria_pai_id, subcategoria.
    criarRapida: async (req, res) => {
        const nome = String(req.body.nome || '').trim().slice(0, 100);
        if (!nome) return res.status(400).json({ sucesso: false, erro: req.t('flash.categoria_nome_obrigatorio') });
        const paiId = req.body.categoria_pai_id ? parseInt(req.body.categoria_pai_id, 10) : null;
        if (paiId) {
            const pai = await Categoria.buscarPorId(paiId, req.user.id);
            if (!pai || pai.parent_id || pai.sistema || pai.status !== 'ativa') {
                return res.status(400).json({ sucesso: false, erro: req.t('cat_rapida.erro') });
            }
        }
        const cor = /^#[0-9a-fA-F]{6}$/.test(String(req.body.cor || '')) ? req.body.cor : undefined;
        const id = await Categoria.criar(req.user.id, { nome, cor, categoria_pai_id: paiId });
        const cat = await Categoria.buscarPorId(id, req.user.id);
        return res.json({ sucesso: true, categoria: { id: cat.id, nome: cat.nome, parent_id: cat.parent_id } });
    },

    atualizar: async (req, res) => {
        const userId = req.user.id;
        const id = req.params.id;
        const b = req.body;

        await Categoria.atualizar(id, userId, {
            nome: b.nome.trim(),
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
