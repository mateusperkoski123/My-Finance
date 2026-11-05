// Admin > Funil (de onde vem quem cria conta e quem paga) e Admin > Erros (erros do servidor guardados no banco).
const Funil = require('../models/Funil');
const ErroSistema = require('../models/ErroSistema');

module.exports = {
    funil: async (req, res) => {
        const dias = Funil.PERIODOS.includes(Number(req.query.dias)) ? Number(req.query.dias) : 30;
        res.render('admin/funil', { title: req.t('admin.titulo'), f: await Funil.resumo(dias), periodos: Funil.PERIODOS, etapas: Funil.ETAPAS });
    },

    erros: async (req, res) => {
        res.render('admin/erros', { title: req.t('admin.titulo'), erros: await ErroSistema.listar(), diasGuardados: ErroSistema.DIAS_GUARDADOS });
    },

    apagarErro: async (req, res) => {
        await ErroSistema.apagar(parseInt(req.params.id, 10));
        res.redirect('/admin/erros');
    },

    limparErros: async (req, res) => {
        await ErroSistema.limpar();
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.erros_limpos') };
        res.redirect('/admin/erros');
    }
};
