const Assinatura = require('../models/Assinatura');
const { fmt } = require('../core/legal');
const { recursosDoPlano } = require('../core/planos_recursos');
const { sendPlanRequestNotice } = require('../core/mailer');

const assinaturaController = {
    index: async (req, res) => {
        const [planos, pagamentos] = await Promise.all([
            Assinatura.listarPlanos(),
            Assinatura.historicoPagamentos(req.user.id)
        ]);
        res.render('assinatura/index', {
            title: req.t('assinatura.titulo'),
            menuAtivo: 'assinatura',
            planos,
            pagamentos,
            fmt,
            recursosDoPlano
        });
    },

    solicitar: async (req, res) => {
        const { plano, ciclo } = req.body;
        const solicitado = await Assinatura.solicitar(req.user.id, plano, ciclo);
        if (!solicitado) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.plano_invalido') };
            return res.redirect('/assinatura');
        }
        // Aviso ao admin; falha de e-mail nao pode quebrar o pedido.
        try {
            await sendPlanRequestNotice({
                usuario: req.user, plano: solicitado.nome, ciclo,
                link: `${req.protocol || 'https'}://${req.get('host')}/admin`
            });
        } catch (err) {
            console.error('Falha ao avisar admin sobre pedido de plano:', err.message);
        }
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.pedido_registrado') };
        res.redirect('/assinatura');
    }
};

module.exports = assinaturaController;
