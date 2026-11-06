// Modulo Clientes: produtos (com foto, custo e estoque) e vendas de produtos para os clientes.
const Venda = require('../models/Venda');
const Cliente = require('../models/Cliente');
const Conta = require('../models/Conta');
const regras = require('../core/vendas_regras');
const { periodoDoMes } = require('../core/clientes_regras');
const { validarImagem } = require('../core/uploads');
const { dimensoesImagem } = require('../core/ia_midia');
const { dataValida, hojeLocal, toLocalYMD } = require('../core/helpers');
const { caminhoLocal } = require('../middleware/authMiddleware');

const POR_PAGINA = 30;
const ESTADOS = ['todas', 'recebidas', 'a_receber', 'canceladas'];
// A tela ja reduz a foto (lado maior 900 px, JPEG); isto e so o teto do que fica guardado no banco.
const FOTO_MAX_BYTES = 1536 * 1024;

const hoje = () => toLocalYMD(hojeLocal());
const inteiro = (v, padrao = 0) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : padrao; };

function avisar(req, tipo, mensagem) {
    req.session.flash = { tipo, mensagem };
}

// Volta para a pagina de origem (so enderecos do proprio modulo), senao para o padrao.
function voltarPara(req, padrao) {
    const v = caminhoLocal(req.body && req.body.voltar);
    return v && (v === '/clientes' || v.startsWith('/clientes/') || v.startsWith('/clientes?')) ? v : padrao;
}

function paginar(total, pagina) {
    const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
    return { pagina: Math.min(Math.max(1, pagina), paginas), paginas, total };
}

// Foto enviada no formulario do produto: null (nenhuma), { erro } ou { mime, dados }. Tipo conferido pelos bytes
// (so JPEG, PNG e WebP: nada de SVG/HTML/GIF).
function lerFoto(arquivo) {
    if (!arquivo || !arquivo.buffer || !arquivo.buffer.length) return null;
    const r = validarImagem(arquivo.buffer, arquivo.mimetype, FOTO_MAX_BYTES);
    if (!r.ok) return { erro: arquivo.buffer.length > FOTO_MAX_BYTES ? 'foto_grande' : 'foto_tipo' };
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(r.mime)) return { erro: 'foto_tipo' };
    const d = dimensoesImagem(arquivo.buffer);
    if (d && (d.w < 16 || d.h < 16 || d.w > 4096 || d.h > 4096)) return { erro: 'foto_tipo' };
    return { mime: r.mime, dados: arquivo.buffer };
}

const vendasController = {
    // ---------- Produtos ----------
    produtos: async (req, res) => {
        const arquivados = req.query.aba === 'arquivados';
        const q = String(req.query.q || '').trim().slice(0, 80);
        const estoque = req.query.estoque === 'baixo' ? 'baixo' : '';
        const [produtos, totais] = await Promise.all([
            Venda.listarProdutos(req.user.id, { arquivados, q, estoque }),
            Venda.totaisEstoque(req.user.id)
        ]);
        res.render('clientes/produtos', {
            title: req.t('produtos.titulo'), menuAtivo: 'clientes', aba: 'produtos',
            produtos, totais, arquivados, q, estoque, situacaoEstoque: regras.situacaoEstoque
        });
    },

    _salvarProduto: async (req, res, id) => {
        const v = regras.dadosProduto(req.body);
        if (!v.ok) { avisar(req, 'erro', req.t('produtos.erro_' + v.erro)); return res.redirect('/clientes/produtos'); }
        const foto = lerFoto(req.file);
        if (foto && foto.erro) { avisar(req, 'erro', req.t('produtos.erro_' + foto.erro)); return res.redirect('/clientes/produtos'); }
        const r = id ? await Venda.atualizarProduto(req.user.id, id, v.dados) : await Venda.criarProduto(req.user.id, v.dados);
        if (r.naoEncontrado) return res.status(404).render('404', { title: req.t('erro404.titulo') });
        if (r.duplicado) { avisar(req, 'erro', req.t('produtos.erro_duplicado')); return res.redirect('/clientes/produtos'); }
        const produtoId = id || r.id;
        if (foto) await Venda.salvarFoto(req.user.id, produtoId, foto.mime, foto.dados);
        else if (id && req.body.remover_foto === '1') await Venda.removerFoto(req.user.id, produtoId);
        avisar(req, 'sucesso', req.t(id ? 'produtos.flash_atualizado' : 'produtos.flash_criado'));
        res.redirect('/clientes/produtos');
    },

    criarProduto: (req, res) => vendasController._salvarProduto(req, res, 0),
    atualizarProduto: (req, res) => vendasController._salvarProduto(req, res, inteiro(req.params.id)),

    arquivarProduto: async (req, res) => {
        const arquivar = req.body.acao !== 'restaurar';
        await Venda.definirStatusProduto(req.user.id, inteiro(req.params.id), arquivar ? 'arquivado' : 'ativo');
        avisar(req, 'sucesso', req.t(arquivar ? 'produtos.flash_arquivado' : 'produtos.flash_restaurado'));
        res.redirect(arquivar ? '/clientes/produtos' : '/clientes/produtos?aba=arquivados');
    },

    // Foto do produto: so do proprio usuario. A URL muda (?v=) quando a foto muda.
    foto: async (req, res) => {
        const f = await Venda.obterFoto(req.user.id, inteiro(req.params.id));
        if (!f) return res.status(404).end();
        res.setHeader('Content-Type', f.mime);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Content-Disposition', 'inline');
        res.setHeader('Cache-Control', 'private, max-age=604800');
        res.send(f.dados);
    },

    // ---------- Vendas ----------
    vendas: async (req, res) => {
        const h = hoje();
        const periodo = periodoDoMes(req.query.mes, h);
        const estado = ESTADOS.includes(req.query.estado) ? req.query.estado : 'todas';
        const q = String(req.query.q || '').trim().slice(0, 80);
        const filtro = { inicio: periodo.inicio, fim: periodo.fim, estado, q };
        const pedida = inteiro(req.query.pagina, 1);
        const [resumo, top, primeira, estoque] = await Promise.all([
            Venda.resumoPeriodo(req.user.id, periodo.inicio, periodo.fim),
            Venda.maisVendidos(req.user.id, periodo.inicio, periodo.fim),
            Venda.listarVendas(req.user.id, filtro, pedida, POR_PAGINA),
            Venda.totaisEstoque(req.user.id)
        ]);
        const pag = paginar(primeira.total, pedida);
        const lista = pag.pagina === pedida ? primeira : await Venda.listarVendas(req.user.id, filtro, pag.pagina, POR_PAGINA);
        const base = { mes: periodo.mes, estado: estado === 'todas' ? '' : estado, q };
        const link = (extra = {}) => {
            const p = new URLSearchParams();
            Object.entries({ ...base, ...extra }).forEach(([k, v]) => { if (v !== '' && v !== null && v !== undefined) p.set(k, v); });
            const s = p.toString();
            return '/clientes/vendas' + (s ? `?${s}` : '');
        };
        res.render('clientes/vendas', {
            title: req.t('vendas.titulo'), menuAtivo: 'clientes', aba: 'vendas',
            periodo, resumo, top, estoque, vendas: lista.vendas, filtro: { estado, q }, hoje: h, ...pag, link
        });
    },

    novaVenda: async (req, res) => {
        const clienteId = inteiro(req.query.cliente);
        const [cliente, produtos, contas] = await Promise.all([
            clienteId ? Cliente.buscarCliente(clienteId, req.user.id) : null,
            Venda.listarProdutos(req.user.id),
            Conta.buscarPorUsuario(req.user.id, false)
        ]);
        res.render('clientes/venda_nova', {
            title: req.t('vendas.nova'), menuAtivo: 'clientes', aba: 'vendas',
            cliente: cliente && cliente.status === 'ativo' ? cliente : null, produtos, contas, hoje: hoje(),
            maxParcelas: regras.MAX_PARCELAS, maxItens: regras.MAX_ITENS
        });
    },

    criarVenda: async (req, res) => {
        const b = req.body;
        const clienteId = inteiro(b.cliente_id);
        const volta = '/clientes/vendas/nova' + (clienteId ? `?cliente=${clienteId}` : '');
        if (!clienteId) { avisar(req, 'erro', req.t('vendas.erro_cliente')); return res.redirect(volta); }
        const itens = regras.validarItens(b.itens_json);
        if (!itens.ok) { avisar(req, 'erro', req.t('vendas.erro_' + itens.erro, { max: regras.MAX_ITENS })); return res.redirect(volta); }
        const dataVenda = dataValida(b.data) ? b.data : hoje();
        const pg = regras.validarPagamento({ forma: b.forma, parcelas: b.parcelas, vencimento: b.vencimento, entrada: b.entrada, dataVenda });
        if (!pg.ok) { avisar(req, 'erro', req.t('vendas.erro_' + pg.erro, { max: regras.MAX_PARCELAS })); return res.redirect(volta); }
        try {
            const r = await Venda.criarVenda(req.user.id, {
                clienteId, contaId: inteiro(b.conta_id), dataVenda, itens: itens.itens, pagamento: pg.dados,
                observacoes: String(b.observacoes || '').trim().slice(0, 500)
            });
            avisar(req, 'sucesso', req.t(pg.dados.forma === 'avista' ? 'vendas.flash_criada_avista' : 'vendas.flash_criada_prazo', { n: r.numero, parcelas: r.parcelas }));
            res.redirect(`/clientes/vendas/${r.id}`);
        } catch (err) {
            if (!err.codigo) throw err;
            const msg = err.codigo === 'estoque'
                ? req.t('vendas.erro_estoque', { lista: err.faltam.map((f) => `${f.nome} (${f.disponivel})`).join(', ') })
                : req.t('vendas.erro_' + err.codigo);
            avisar(req, 'erro', msg);
            res.redirect(volta);
        }
    },

    detalhe: async (req, res) => {
        const venda = await Venda.buscarVenda(inteiro(req.params.id), req.user.id);
        if (!venda) return res.status(404).render('404', { title: req.t('erro404.titulo') });
        res.render('clientes/venda', {
            title: req.t('vendas.venda_n', { n: venda.numero }), menuAtivo: 'clientes', aba: 'vendas', venda, hoje: hoje()
        });
    },

    cancelar: async (req, res) => {
        const id = inteiro(req.params.id);
        const r = await Venda.cancelarVenda(req.user.id, id, { apagarRecebidas: req.body.apagar_recebidas === '1' });
        if (r.naoEncontrado) avisar(req, 'erro', req.t('vendas.erro_cancelar'));
        else if (r.mantidas) avisar(req, 'sucesso', req.t('vendas.flash_cancelada_mantidas', { n: r.mantidas }));
        else avisar(req, 'sucesso', req.t('vendas.flash_cancelada'));
        res.redirect(voltarPara(req, `/clientes/vendas/${id}`));
    },

    // Busca de clientes da tela de venda (nome, cedula, RUC ou celular).
    buscarClientes: async (req, res) => {
        const clientes = await Venda.buscarClientes(req.user.id, req.query.q);
        res.json({ clientes: clientes.map((c) => ({ id: c.id, nome: c.nome, detalhe: c.cedula || c.celular || '' })) });
    }
};

module.exports = vendasController;
