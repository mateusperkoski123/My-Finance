const User = require('../models/User');
const Assinatura = require('../models/Assinatura');
const { textos } = require('../core/legal');
const { versaoTermos } = require('../core/negocio');
const { normalizarPais, PAIS_PADRAO } = require('../core/paises');

async function precos() {
    const planos = await Assinatura.listarPlanos();
    const por = (c) => (planos.find((p) => p.codigo === c) || {}).preco_mensal || 0;
    return { basico: por('basico'), premium: por('premium'), pro: por('pro') };
}

// Os Termos seguem a lei do pais da conta (nao o idioma). Visitante: o pais escolhido no cadastro (?pais=), ou o da sessao.
function paisDe(req) {
    if (req.user) return normalizarPais(req.user.pais) || PAIS_PADRAO;
    const pedido = normalizarPais(req.query.pais);
    if (pedido && req.session) req.session.pais = pedido;
    return pedido || normalizarPais(req.session && req.session.pais) || PAIS_PADRAO;
}

async function render(res, req, vista, secao, titulo) {
    const pais = paisDe(req);
    const tx = textos(req.lang, await precos(), pais);
    res.render(vista, { title: titulo, secoes: tx[secao], aviso: tx.aviso, versao: versaoTermos(pais) });
}

const legalController = {
    termos: (req, res) => render(res, req, 'legal/documento', 'termos', req.t('legal.termos_titulo')),
    privacidade: (req, res) => render(res, req, 'legal/documento', 'privacidade', req.t('legal.privacidade_titulo')),

    aceitarPage: async (req, res) => {
        if (req.user.termos_versao === versaoTermos(req.user.pais)) return res.redirect('/');
        res.render('legal/aceitar', { title: req.t('legal.aceitar_titulo') });
    },

    aceitarSubmit: async (req, res) => {
        if (!req.body.aceitar_termos) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.termos_obrigatorio') };
            return res.redirect('/aceitar-termos');
        }
        await User.aceitarTermos(req.user.id, req.user.pais);
        res.redirect('/');
    }
};

module.exports = legalController;
