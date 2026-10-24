const Categoria = require('../models/Categoria');
const { parseMoeda, corValida } = require('../core/helpers');

const nomeDe = (b) => (typeof b.nome === 'string' ? b.nome.trim().slice(0, 120) : '');
// Limite de gasto mensal: vazio, zero ou negativo = sem limite.
const limiteDe = (b) => { const v = b.limite_gasto ? parseMoeda(b.limite_gasto) : 0; return v > 0 ? v : null; };

const { hojeLocal, toLocalYMD } = require('../core/helpers');

const pad = (n) => String(n).padStart(2, '0');
// Mes a partir de 'YYYY-MM' (ou o atual): { chave, ano, numero } com a aritmetica de meses feita em UTC.
function mesDe(pedido, hojeYmd) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(pedido || ''));
    let ano = +hojeYmd.slice(0, 4), numero = +hojeYmd.slice(5, 7);
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 2000 && +m[1] <= 2100) { ano = +m[1]; numero = +m[2]; }
    return { ano, numero };
}
const somarMes = (ano, numero, n) => { const d = new Date(Date.UTC(ano, numero - 1 + n, 1)); return { ano: d.getUTCFullYear(), numero: d.getUTCMonth() + 1 }; };
const chaveMes = (m) => `${m.ano}-${pad(m.numero)}`;
const ultimoDia = (m) => new Date(Date.UTC(m.ano, m.numero, 0)).getUTCDate();

const categoriasController = {
    // Tela de uma categoria/subcategoria: o que ja foi processado e o que falta no mes, historico mensal, mes anterior e previsao.
    detalhe: async (req, res) => {
        const id = parseInt(req.params.id, 10);
        if (!Number.isFinite(id)) return res.redirect('/categorias');
        const hoje = toLocalYMD(hojeLocal());
        const sel = mesDe(req.query.mes, hoje);
        // Historico: 5 meses antes do escolhido ate o mes seguinte (a previsao).
        const meses = [];
        for (let i = -5; i <= 1; i++) meses.push(somarMes(sel.ano, sel.numero, i));
        const primeiro = meses[0], ultimo = meses[meses.length - 1];
        const d = await Categoria.detalhe(req.user.id, id, {
            inicio: `${chaveMes(primeiro)}-01`, fim: `${chaveMes(ultimo)}-${pad(ultimoDia(ultimo))}`,
            mesInicio: `${chaveMes(sel)}-01`, mesFim: `${chaveMes(sel)}-${pad(ultimoDia(sel))}`,
            moeda: String(req.query.moeda || '')
        });
        if (!d || d.categoria.sistema) return res.redirect('/categorias');

        const historico = meses.map((m) => {
            const chave = chaveMes(m);
            const linha = { chave, ano: m.ano, numero: m.numero, gasto_pago: 0, gasto_pend: 0, rec_pago: 0, rec_pend: 0 };
            d.totais.filter((t) => t.ym === chave).forEach((t) => {
                const campo = (t.tipo === 'despesa' ? 'gasto_' : 'rec_') + (t.status === 'pago' ? 'pago' : 'pend');
                linha[campo] += parseFloat(t.total) || 0;
            });
            linha.gasto = linha.gasto_pago + linha.gasto_pend;
            linha.rec = linha.rec_pago + linha.rec_pend;
            return linha;
        });
        const maximo = Math.max(1, ...historico.map((h) => Math.max(h.gasto, h.rec)));
        const aoLado = (m) => chaveMes(m);
        const ant = somarMes(sel.ano, sel.numero, -1), prox = somarMes(sel.ano, sel.numero, 1);

        res.render('categorias/detalhe', {
            title: d.categoria.nome, menuAtivo: 'categorias',
            categoria: d.categoria, pai: d.pai, subs: d.subs, moedas: d.moedas, moedaSel: d.moeda,
            lancamentos: d.lancamentos, historico, maximo, hoje,
            mes: { ...sel, chave: chaveMes(sel), anterior: aoLado(ant), proximo: aoLado(prox), atual: hoje.slice(0, 7) },
            atual: historico[5], anterior: historico[4], proximoMes: historico[6]
        });
    },
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
        const nome = nomeDe(b);
        if (!nome) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.categoria_nome_obrigatorio') };
            return res.redirect('/categorias');
        }

        try {
            await Categoria.criar(userId, {
                nome,
                cor: corValida(b.cor) ? b.cor : '#3b82f6',
                categoria_pai_id: b.categoria_pai_id || null,
                // Orcamento (limite por categoria) faz parte do Demonstrativo Financeiro (Premium e Pro).
                limite_gasto: req.pode('rec_estado') ? limiteDe(b) : null
            });
        } catch (err) {
            if (err.codigo !== 'categoria_duplicada') throw err;
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.categoria_duplicada') };
            return res.redirect('/categorias');
        }

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
        // Ja existe com esse nome: usa a existente (o modal seleciona a categoria em vez de criar uma repetida).
        const existente = await Categoria.buscarPorNome(req.user.id, nome, paiId);
        const id = existente ? existente.id : await Categoria.criar(req.user.id, { nome, cor, categoria_pai_id: paiId });
        const cat = await Categoria.buscarPorId(id, req.user.id);
        return res.json({ sucesso: true, categoria: { id: cat.id, nome: cat.nome, parent_id: cat.parent_id } });
    },

    atualizar: async (req, res) => {
        const userId = req.user.id;
        const id = req.params.id;
        const b = req.body;
        const nome = nomeDe(b);
        const atual = await Categoria.buscarPorId(id, userId);
        if (!nome || !atual || atual.sistema) {
            req.session.flash = { tipo: 'erro', mensagem: req.t(nome ? 'flash.generico_erro' : 'flash.categoria_nome_obrigatorio') };
            return res.redirect('/categorias');
        }

        // So confere quando o nome muda: quem ja tem repetidas de antes ainda consegue editar cor e limite.
        if (nome.trim() !== String(atual.nome).trim() && await Categoria.buscarPorNome(userId, nome, atual.parent_id, atual.id)) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.categoria_duplicada') };
            return res.redirect('/categorias');
        }

        // Cor e limite: o formulario da subcategoria so envia o nome; o que nao vem fica como estava.
        await Categoria.atualizar(id, userId, {
            nome,
            cor: corValida(b.cor) ? b.cor : atual.cor,
            limite_gasto: b.limite_gasto !== undefined && req.pode('rec_estado') ? limiteDe(b) : atual.limite_gasto
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
