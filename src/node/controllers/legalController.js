const User = require('../models/User');
const Assinatura = require('../models/Assinatura');
const { textos } = require('../core/legal');
const { TERMOS_VERSAO } = require('../core/negocio');

async function precos() {
    const planos = await Assinatura.listarPlanos();
    const por = (c) => (planos.find((p) => p.codigo === c) || {}).preco_mensal || 0;
    return { basico: por('basico'), premium: por('premium') };
}

async function render(res, req, vista, secao, titulo) {
    const tx = textos(req.lang, await precos());
    res.render(vista, { title: titulo, secoes: tx[secao], aviso: tx.aviso, versao: TERMOS_VERSAO });
}

const legalController = {
    termos: (req, res) => render(res, req, 'legal/documento', 'termos', req.t('legal.termos_titulo')),
    privacidade: (req, res) => render(res, req, 'legal/documento', 'privacidade', req.t('legal.privacidade_titulo')),

    aceitarPage: async (req, res) => {
        if (req.user.termos_versao === TERMOS_VERSAO) return res.redirect('/');
        res.render('legal/aceitar', { title: req.t('legal.aceitar_titulo') });
    },

    aceitarSubmit: async (req, res) => {
        if (!req.body.aceitar_termos) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.termos_obrigatorio') };
            return res.redirect('/aceitar-termos');
        }
        await User.aceitarTermos(req.user.id);
        res.redirect('/');
    }
};

module.exports = legalController;
