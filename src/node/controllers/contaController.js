const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { sendVerificationEmail } = require('../core/mailer');

const contaController = {
    index: (req, res) => {
        res.render('configuracoes/conta', {
            title: req.t('conta.titulo'),
            menuAtivo: 'conta',
            viaGoogle: !!req.user.google_id
        });
    },

    // Link enviado por e-mail (publico: o usuario pode abrir em outro navegador).
    verificarEmail: async (req, res) => {
        const ok = await User.verificarEmail(req.params.token);
        req.session.flash = { tipo: ok ? 'sucesso' : 'erro', mensagem: req.t(ok ? 'flash.email_verificado' : 'flash.email_token_invalido') };
        res.redirect(req.session.user_id ? '/' : '/login');
    },

    reenviarVerificacao: async (req, res) => {
        if (req.user.email_verificado_em) return res.redirect(req.get('Referrer') || '/');
        try {
            const token = await User.gerarTokenVerificacao(req.user.id);
            const link = `${req.protocol || 'https'}://${req.get('host')}/verificar-email/${token}`;
            // Espera o envio por no maximo 12 s: com o SMTP sem resposta a requisicao nao fica pendurada ate o proxy derrubar.
            const envio = sendVerificationEmail(req.user.email, link, req.user.idioma);
            envio.catch(() => {});
            await Promise.race([envio, new Promise((_, rej) => setTimeout(() => rej(new Error('tempo esgotado ao enviar')), 12000))]);
            req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.verificacao_reenviada') };
        } catch (err) {
            console.error('Falha ao reenviar verificacao:', err.message);
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.verificacao_falhou') };
        }
        res.redirect(req.get('Referrer') || '/');
    },

    // Exclusao definitiva da conta e de todos os dados (LGPD).
    excluir: async (req, res) => {
        const user = req.user;
        const confirmaEmail = String(req.body.confirmar_email || '').trim().toLowerCase();
        if (confirmaEmail !== String(user.email).toLowerCase()) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.excluir_email_incorreto') };
            return res.redirect('/configuracoes/conta');
        }
        // Contas criadas so com Google nao tem senha conhecida; as demais confirmam com a senha.
        if (!user.google_id) {
            if (!bcrypt.compareSync(String(req.body.senha || ''), user.senha_hash)) {
                req.session.flash = { tipo: 'erro', mensagem: req.t('flash.senha_atual_incorreta') };
                return res.redirect('/configuracoes/conta');
            }
        }
        await User.excluir(user.id);
        delete req.session.user_id;
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.conta_excluida') };
        res.redirect('/login');
    }
};

module.exports = contaController;
