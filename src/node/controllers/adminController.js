const Assinatura = require('../models/Assinatura');
const User = require('../models/User');
const { fmt } = require('../core/legal');

const redirecionar = (res) => res.redirect('/admin');

const adminController = {
    index: async (req, res) => {
        const busca = String(req.query.q || '').trim().slice(0, 100);
        const [metricas, usuarios, planos] = await Promise.all([
            Assinatura.metricas(),
            Assinatura.listarUsuariosAdmin({ busca }),
            Assinatura.listarPlanos()
        ]);
        res.render('admin/index', { title: req.t('admin.titulo'), metricas, usuarios, planos, busca, fmt });
    },

    // Registra um pagamento recebido (transferencia, Tigo Money, etc.) e ativa o plano.
    registrarPagamento: async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const { plano, ciclo, metodo, referencia } = req.body;
        try {
            await Assinatura.ativar(id, plano, ciclo, {
                metodo: String(metodo || 'manual').slice(0, 30),
                referencia: referencia ? String(referencia).slice(0, 100) : null,
                registradoPor: req.user.id
            });
            req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.admin_plano_ativado') };
        } catch (err) {
            console.error('Admin: erro ao ativar plano:', err.message);
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.plano_invalido') };
        }
        redirecionar(res);
    },

    estenderTrial: async (req, res) => {
        const dias = Math.min(Math.max(parseInt(req.body.dias, 10) || 7, 1), 365);
        await Assinatura.estenderTrial(parseInt(req.params.id, 10), dias);
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.admin_trial_estendido', { dias }) };
        redirecionar(res);
    },

    cancelar: async (req, res) => {
        await Assinatura.cancelar(parseInt(req.params.id, 10));
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.admin_assinatura_cancelada') };
        redirecionar(res);
    },

    alterarStatus: async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const status = req.body.status === 'suspenso' ? 'suspenso' : 'ativo';
        if (id === req.user.id) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.admin_nao_pode_si_mesmo') };
            return redirecionar(res);
        }
        await User.atualizarStatus(id, status);
        req.session.flash = { tipo: 'sucesso', mensagem: req.t(status === 'suspenso' ? 'flash.admin_usuario_suspenso' : 'flash.admin_usuario_reativado') };
        redirecionar(res);
    }
};

module.exports = adminController;
