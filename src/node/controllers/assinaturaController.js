const Assinatura = require('../models/Assinatura');
const User = require('../models/User');
const telefone = require('../core/telefone');
const { fmt } = require('../core/legal');
const { recursosDoPlano } = require('../core/planos_recursos');
const { sendPlanRequestNotice } = require('../core/mailer');
const { TRIAL_DIAS, PLANOS_VENDA } = require('../core/negocio');
const { caminhoLocal } = require('../middleware/authMiddleware');

// Caminho local para voltar depois de trocar o plano em teste (nunca um endereco externo).
const voltarLocal = (v) => (caminhoLocal(v) && !String(v).startsWith('/teste') ? v : '/assinatura');

const assinaturaController = {
    // Teste gratis: a pessoa escolhe o plano que quer testar (uma vez so) e usa esse plano por TRIAL_DIAS dias.
    escolherTeste: async (req, res) => {
        const ass = req.assinatura;
        if (!ass || ass.status_efetivo !== 'escolher') return res.redirect(req.ehAdmin ? '/' : '/assinatura');
        const planos = (await Assinatura.listarPlanos()).filter((p) => PLANOS_VENDA.includes(p.codigo));
        const sugerido = planos.some((p) => p.codigo === req.session.plano_teste) ? req.session.plano_teste : 'premium';
        res.render('assinatura/escolher', {
            title: req.t('teste.titulo', { dias: TRIAL_DIAS }),
            planos,
            sugerido,
            fmt,
            recursosDoPlano,
            // Quem terminou o teste antigo de 7 dias ve um texto diferente de quem acabou de criar a conta.
            veioDoTesteAntigo: Boolean(ass.trial_fim)
        });
    },

    iniciarTeste: async (req, res) => {
        const plano = await Assinatura.iniciarTeste(req.user.id, String(req.body.plano || ''));
        if (!plano) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.teste_indisponivel') };
            return res.redirect('/assinatura');
        }
        delete req.session.plano_teste;
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.teste_iniciado', { plano: req.t('plano.' + plano.codigo + '.nome'), dias: TRIAL_DIAS }) };
        res.redirect('/');
    },

    // Durante o teste a pessoa pode passar a testar outro plano; o prazo continua o mesmo.
    trocarTeste: async (req, res) => {
        const voltar = voltarLocal(req.body.voltar);
        const plano = await Assinatura.trocarPlanoTeste(req.user.id, String(req.body.plano || ''));
        if (!plano) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.teste_troca_indisponivel') };
            return res.redirect('/assinatura');
        }
        const dias = req.assinatura ? req.assinatura.dias_restantes : null;
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.teste_trocado', { plano: req.t('plano.' + plano.codigo + '.nome'), dias: dias || 1 }) };
        res.redirect(voltar);
    },

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
            recursosDoPlano,
            paises: telefone.PAISES,
            idiomaTel: telefone.idiomaCurto(req.lang || req.session.idioma)
        });
    },

    solicitar: async (req, res) => {
        const { plano, ciclo } = req.body;
        // O telefone e obrigatorio: e por ele que entramos em contato para fechar a contratacao.
        const tel = telefone.normalizar(req.body.telefone_codigo, req.body.telefone_numero);
        if (!tel) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.telefone_invalido') };
            return res.redirect('/assinatura');
        }
        const solicitado = await Assinatura.solicitar(req.user.id, plano, ciclo);
        if (!solicitado) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.plano_invalido') };
            return res.redirect('/assinatura');
        }
        await User.salvarTelefone(req.user.id, tel.codigo, tel.numero);
        // Aviso ao admin; falha de e-mail nao pode quebrar o pedido.
        try {
            await sendPlanRequestNotice({
                usuario: req.user, plano: solicitado.nome, ciclo, telefone: telefone.formatar(tel.codigo, tel.numero),
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
