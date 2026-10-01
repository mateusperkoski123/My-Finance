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
        const alvo = await User.findById(id);
        if (!alvo || alvo.status === 'arquivado') {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.admin_usuario_nao_encontrado') };
            return redirecionar(res);
        }
        await User.atualizarStatus(id, status);
        req.session.flash = { tipo: 'sucesso', mensagem: req.t(status === 'suspenso' ? 'flash.admin_usuario_suspenso' : 'flash.admin_usuario_reativado') };
        redirecionar(res);
    },

    // Liga/desliga o Chat IA para um usuario (admin sempre tem acesso, entao so vale para os demais).
    alternarIa: async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const ligar = req.body.ia === '1';
        const alvo = await User.findById(id);
        if (!alvo) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.admin_usuario_nao_encontrado') };
            return redirecionar(res);
        }
        await require('../models/Ia').definirHabilitada(id, ligar);
        req.session.flash = { tipo: 'sucesso', mensagem: req.t(ligar ? 'flash.admin_ia_ativada' : 'flash.admin_ia_desativada') };
        redirecionar(res);
    },

    // REVISAR (seguranca): arquivar bloqueia o acesso e tira o usuario da lista principal. Nunca vale para admin nem para si mesmo.
    arquivar: async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const alvo = await User.findById(id);
        if (id === req.user.id || (alvo && alvo.role === 'admin')) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.admin_nao_pode_si_mesmo') };
            return redirecionar(res);
        }
        if (!alvo) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.admin_usuario_nao_encontrado') };
            return redirecionar(res);
        }
        await User.atualizarStatus(id, 'arquivado');
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.admin_usuario_arquivado') };
        redirecionar(res);
    },

    arquivados: async (req, res) => {
        const busca = String(req.query.q || '').trim().slice(0, 100);
        const usuarios = await Assinatura.listarUsuariosAdmin({ busca, arquivados: true });
        res.render('admin/arquivados', { title: req.t('admin.arquivados_titulo'), usuarios, busca });
    },

    desarquivar: async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const alvo = await User.findById(id);
        if (!alvo || alvo.status !== 'arquivado') {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.admin_usuario_nao_encontrado') };
            return res.redirect('/admin/arquivados');
        }
        await User.atualizarStatus(id, 'ativo');
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.admin_usuario_desarquivado') };
        res.redirect('/admin/arquivados');
    },

    // REVISAR (seguranca): exclusao definitiva so para conta ja arquivada, nunca admin nem o proprio usuario.
    excluirDefinitivo: async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const alvo = await User.findById(id);
        if (!alvo || alvo.status !== 'arquivado' || alvo.role === 'admin' || id === req.user.id) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.admin_exclusao_negada') };
            return res.redirect('/admin/arquivados');
        }
        await User.excluir(id);
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.admin_usuario_excluido') };
        res.redirect('/admin/arquivados');
    }
};

module.exports = adminController;
