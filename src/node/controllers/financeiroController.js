const Financeiro = require('../models/Financeiro');
const User = require('../models/User');
const financeiro = require('../core/financeiro');
const lembretes = require('../core/lembretes');
const { t } = require('../core/i18n');

const VOLTAR_PERMITIDO = ['/financeiro', '/configuracoes/lembretes'];

const financeiroController = {
    // Tela aberta ao tocar na notificacao (e a unica forma de usar os botoes no iPhone, que nao mostra botoes na notificacao).
    index: async (req, res) => {
        if (!financeiro.liberadoPara(req.user)) return res.redirect('/');
        const config = await Financeiro.config(req.user.id);
        const tom = financeiro.TONS.includes(req.query.tom) ? req.query.tom : null;
        const indice = parseInt(req.query.m, 10);
        const dias = Math.min(Math.max(parseInt(req.query.n, 10) || 1, 1), 999);
        const mensagem = tom && indice >= 1 && indice <= financeiro.MENSAGENS_POR_TOM ? financeiro.texto(tom, indice, dias, req.lang) : null;
        const pausadoAte = config.pausado_ate && Number(config.pausado_ate) > Date.now() ? Number(config.pausado_ate) : null;
        res.render('financeiro/index', {
            title: req.t('financeiro.pagina_titulo'),
            tom: tom || 'brincalhao',
            mensagem,
            ativo: !!config.ativo,
            pausadoAte
        });
    },

    // Envia agora, para os aparelhos da propria pessoa, um exemplo do tom escolhido (para testar o visual e os botoes).
    testar: async (req, res) => {
        const tom = String(req.body.tom || '');
        if (!financeiro.liberadoPara(req.user) || !financeiro.TONS.includes(tom)) return res.status(400).json({ sucesso: false });
        const dias = { brincalhao: 1, cobrando: 2, dramatico: 3, saudade: 5 }[tom];
        const indice = 1 + Math.floor(Math.random() * financeiro.MENSAGENS_POR_TOM);
        const entregues = await lembretes.enviarParaUsuario(req.user.id, financeiro.montarNotificacao({
            userId: req.user.id, tom, indice, dias, idioma: req.lang
        }));
        res.json({ sucesso: entregues > 0 });
    },

    // Teste do admin: roda a checagem real da inatividade agora e explica o resultado (enviou ou por que nao enviou).
    verificar: async (req, res) => {
        if (!financeiro.liberadoPara(req.user)) return res.status(400).json({ sucesso: false });
        const r = await financeiro.verificarAgora(req.user.id);
        res.json({ sucesso: r.motivo === 'enviado', motivo: r.motivo, mensagem: req.t('financeiro.verif_' + r.motivo, { n: r.dias }) });
    },

    // Botoes da tela e da configuracao: pausar, retomar, desativar e reativar.
    configurar: async (req, res) => {
        if (!financeiro.liberadoPara(req.user)) return res.redirect('/');
        const acao = String(req.body.acao || '');
        const voltar = VOLTAR_PERMITIDO.includes(req.body.voltar) ? req.body.voltar : '/financeiro';
        const respostas = {
            pausar: async () => { await financeiro.pausar(req.user.id); return 'financeiro.flash_pausado'; },
            retomar: async () => { await Financeiro.retomar(req.user.id); return 'financeiro.flash_retomado'; },
            desativar: async () => { await Financeiro.definirAtivo(req.user.id, false); return 'financeiro.flash_desativado'; },
            ativar: async () => { await Financeiro.definirAtivo(req.user.id, true); return 'financeiro.flash_ativado'; }
        };
        if (!respostas[acao]) return res.redirect(voltar);
        const chave = await respostas[acao]();
        req.session.flash = { tipo: 'sucesso', mensagem: req.t(chave) };
        res.redirect(voltar);
    },

    // Botoes dentro da propria notificacao: o service worker nao tem sessao, entao a acao vem com um token assinado.
    acaoNotificacao: async (req, res) => {
        const userId = financeiro.validarToken(req.body && req.body.token);
        const acao = req.body && req.body.acao;
        const user = userId && (acao === 'pausar' || acao === 'desativar') ? await User.findById(userId) : null;
        if (!user) {
            const idioma = userId ? (await User.findById(userId) || {}).idioma : req.lang;
            return res.status(400).json({ sucesso: false, titulo: t('financeiro.nome', {}, idioma), mensagem: t('financeiro.resp_expirada', {}, idioma) });
        }
        if (acao === 'pausar') await financeiro.pausar(user.id);
        else await Financeiro.definirAtivo(user.id, false);
        res.json({
            sucesso: true,
            titulo: t('financeiro.nome', {}, user.idioma),
            mensagem: t(acao === 'pausar' ? 'financeiro.resp_pausado' : 'financeiro.resp_desativado', {}, user.idioma)
        });
    }
};

module.exports = financeiroController;
