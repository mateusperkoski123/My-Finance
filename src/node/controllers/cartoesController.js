const Cartao = require('../models/Cartao');
const Conta = require('../models/Conta');
const Compra = require('../models/Compra');
const fatura = require('../core/cartao_fatura');
const { dataValida, parseMoeda, hojeLocal, toLocalYMD } = require('../core/helpers');

const hoje = () => toLocalYMD(hojeLocal());
const inteiro = (v) => { const n = parseInt(v, 10); return Number.isFinite(n) && n > 0 ? n : 0; };
const avisar = (req, tipo, mensagem) => { req.session.flash = { tipo, mensagem }; };

async function cartaoDoUsuario(req, res) {
    const cartao = await Cartao.buscar(inteiro(req.params.id), req.user.id);
    if (!cartao) res.status(404).render('404', { title: req.t('erro404.titulo') });
    return cartao;
}

const dadosCartao = (b) => ({
    nome: String(b.nome || '').trim(), bandeira: b.bandeira, conta_id: inteiro(b.conta_id),
    limite_total: parseMoeda(b.limite_total), dia_fechamento: b.dia_fechamento, dia_vencimento: b.dia_vencimento
});

// Limite de cartoes ativos do plano (Basico 1, Premium 3, Pro 6). Vale para criar e restaurar; admin nao tem limite.
async function atingiuLimite(req) {
    const max = req.assinatura && req.assinatura.plano ? req.assinatura.plano.max_cartoes : null;
    if (req.ehAdmin || max === null || max === undefined) return null;
    return (await Cartao.totalAtivos(req.user.id)) >= max ? max : null;
}

const cartoesController = {
    index: async (req, res) => {
        const arquivados = req.query.aba === 'arquivados';
        const [cartoes, contas, limite] = await Promise.all([Cartao.listar(req.user.id, arquivados), Conta.buscarPorUsuario(req.user.id, false), atingiuLimite(req)]);
        res.render('cartoes/index', { title: req.t('cartoes.titulo'), menuAtivo: 'cartoes', cartoes, contas, arquivados, limite });
    },

    criar: async (req, res) => {
        const d = dadosCartao(req.body);
        if (!d.nome) { avisar(req, 'erro', req.t('cartoes.erro_nome')); return res.redirect('/cartoes'); }
        const max = await atingiuLimite(req);
        if (max) { avisar(req, 'erro', req.t('cartoes.erro_limite', { n: max })); return res.redirect('/cartoes'); }
        try {
            const id = await Cartao.criar(req.user.id, d);
            avisar(req, 'sucesso', req.t('cartoes.flash_criado'));
            res.redirect(`/cartoes/${id}`);
        } catch (err) {
            if (!err.codigo) throw err;
            avisar(req, 'erro', req.t('cartoes.erro_conta'));
            res.redirect('/cartoes');
        }
    },

    atualizar: async (req, res) => {
        const id = inteiro(req.params.id);
        const d = dadosCartao(req.body);
        if (!d.nome) { avisar(req, 'erro', req.t('cartoes.erro_nome')); return res.redirect('/cartoes'); }
        try {
            const ok = await Cartao.atualizar(id, req.user.id, d);
            avisar(req, ok ? 'sucesso' : 'erro', req.t(ok ? 'cartoes.flash_salvo' : 'cartoes.erro_cartao'));
        } catch (err) {
            if (!err.codigo) throw err;
            avisar(req, 'erro', req.t('cartoes.erro_conta'));
        }
        res.redirect(req.body.voltar === 'fatura' ? `/cartoes/${id}` : '/cartoes');
    },

    arquivar: async (req, res) => {
        const restaurar = req.body.acao === 'restaurar';
        const max = restaurar ? await atingiuLimite(req) : null;
        if (max) { avisar(req, 'erro', req.t('cartoes.erro_limite', { n: max })); return res.redirect('/cartoes?aba=arquivados'); }
        const ok = await Cartao.definirStatus(inteiro(req.params.id), req.user.id, !restaurar);
        avisar(req, ok ? 'sucesso' : 'erro', req.t(!ok ? 'cartoes.erro_cartao' : restaurar ? 'cartoes.flash_restaurado' : 'cartoes.flash_arquivado'));
        res.redirect(restaurar ? '/cartoes?aba=arquivados' : '/cartoes');
    },

    // Fatura de um mes (por padrao a que esta aberta agora) com as compras e o pagamento.
    fatura: async (req, res) => {
        const cartao = await cartaoDoUsuario(req, res);
        if (!cartao) return;
        const mes = fatura.mesValido(req.query.mes) ? req.query.mes : await Cartao.mesDeNovaCompra(cartao, hoje());
        const [f, categorias, contas] = await Promise.all([
            Cartao.fatura(cartao, req.user.id, mes), Compra.categoriasDespesa(req.user.id), Conta.buscarPorUsuario(req.user.id, false)
        ]);
        const [[usadoRow]] = await require('../config/db').query(
            `SELECT COALESCE(SUM(cc.valor), 0) AS usado FROM cartao_compras cc
             LEFT JOIN cartao_faturas fa ON fa.cartao_id = cc.cartao_id AND fa.mes = cc.fatura_mes
             WHERE cc.cartao_id = ? AND fa.id IS NULL`, [cartao.id]
        );
        res.render('cartoes/fatura', {
            title: cartao.nome, menuAtivo: 'cartoes', cartao, fatura: f, categorias, contas, usado: Number(usadoRow.usado),
            mesAnterior: fatura.somarMeses(mes, -1), mesSeguinte: fatura.somarMeses(mes, 1), hoje: hoje()
        });
    },

    adicionarCompra: async (req, res) => {
        const cartao = await cartaoDoUsuario(req, res);
        if (!cartao) return;
        const valor = parseMoeda(req.body.valor);
        const descricao = String(req.body.descricao || '').trim();
        const data = dataValida(req.body.data) ? req.body.data : hoje();
        if (!descricao || !(valor > 0)) { avisar(req, 'erro', req.t('cartoes.erro_compra')); return res.redirect(`/cartoes/${cartao.id}`); }
        let mes;
        try {
            mes = (await Cartao.criarCompra(req.user.id, cartao, { descricao, valor, data, categoria_id: inteiro(req.body.categoria_id) || null })).mes;
            avisar(req, 'sucesso', req.t('cartoes.flash_compra'));
        } catch (err) {
            if (!err.codigo) throw err;
            avisar(req, 'erro', req.t('cartoes.erro_categoria'));
        }
        res.redirect(`/cartoes/${cartao.id}${mes ? `?mes=${mes}` : ''}`);
    },

    editarCompra: async (req, res) => {
        const cartao = await cartaoDoUsuario(req, res);
        if (!cartao) return;
        const valor = parseMoeda(req.body.valor);
        const descricao = String(req.body.descricao || '').trim();
        const data = dataValida(req.body.data) ? req.body.data : hoje();
        const voltar = (mes) => res.redirect(`/cartoes/${cartao.id}${mes ? `?mes=${mes}` : ''}`);
        if (!descricao || !(valor > 0)) { avisar(req, 'erro', req.t('cartoes.erro_compra')); return voltar(fatura.mesValido(req.body.mes) ? req.body.mes : null); }
        let mes = null;
        try {
            mes = await Cartao.atualizarCompra(inteiro(req.params.compraId), cartao, req.user.id, { descricao, valor, data, categoria_id: inteiro(req.body.categoria_id) || null });
            avisar(req, mes ? 'sucesso' : 'erro', req.t(mes ? 'cartoes.flash_compra_salva' : 'cartoes.erro_compra_paga'));
        } catch (err) {
            if (!err.codigo) throw err;
            avisar(req, 'erro', req.t('cartoes.erro_categoria'));
        }
        voltar(mes || (fatura.mesValido(req.body.mes) ? req.body.mes : null));
    },

    excluirCompra: async (req, res) => {
        const cartao = await cartaoDoUsuario(req, res);
        if (!cartao) return;
        const ok = await Cartao.excluirCompra(inteiro(req.params.compraId), cartao.id, req.user.id);
        avisar(req, ok ? 'sucesso' : 'erro', req.t(ok ? 'cartoes.flash_compra_excluida' : 'cartoes.erro_compra_paga'));
        res.redirect(`/cartoes/${cartao.id}${fatura.mesValido(req.body.mes) ? `?mes=${req.body.mes}` : ''}`);
    },

    pagar: async (req, res) => {
        const cartao = await cartaoDoUsuario(req, res);
        if (!cartao) return;
        const mes = fatura.mesValido(req.body.mes) ? req.body.mes : null;
        const voltar = `/cartoes/${cartao.id}${mes ? `?mes=${mes}` : ''}`;
        if (!mes) { avisar(req, 'erro', req.t('cartoes.erro_fatura')); return res.redirect(voltar); }
        try {
            await Cartao.pagar(req.user.id, cartao, mes, dataValida(req.body.data) ? req.body.data : hoje());
            avisar(req, 'sucesso', req.t('cartoes.flash_paga'));
        } catch (err) {
            if (!err.codigo) throw err;
            avisar(req, 'erro', req.t(err.codigo === 'fatura_paga' ? 'cartoes.erro_ja_paga' : 'cartoes.erro_vazia'));
        }
        res.redirect(voltar);
    },

    desfazerPagamento: async (req, res) => {
        const cartao = await cartaoDoUsuario(req, res);
        if (!cartao) return;
        const mes = fatura.mesValido(req.body.mes) ? req.body.mes : null;
        const ok = mes ? await Cartao.desfazerPagamento(req.user.id, cartao, mes) : false;
        avisar(req, ok ? 'sucesso' : 'erro', req.t(ok ? 'cartoes.flash_desfeito' : 'cartoes.erro_fatura'));
        res.redirect(`/cartoes/${cartao.id}${mes ? `?mes=${mes}` : ''}`);
    }
};

module.exports = cartoesController;
