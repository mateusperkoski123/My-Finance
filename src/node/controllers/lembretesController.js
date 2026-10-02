const crypto = require('crypto');
const Lembrete = require('../models/Lembrete');
const push = require('../core/push');
const lembretes = require('../core/lembretes');

const HORARIOS = Array.from({ length: 48 }, (_, i) => `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 ? '30' : '00'}`);

function tokenValido(recebido) {
    const esperado = process.env.CRON_TOKEN || '';
    if (!esperado || !recebido) return false;
    const a = crypto.createHash('sha256').update(String(recebido)).digest();
    const b = crypto.createHash('sha256').update(esperado).digest();
    return crypto.timingSafeEqual(a, b);
}

const lembretesController = {
    // Tela de configuracao (Configuracoes > Lembretes).
    index: async (req, res) => {
        const config = await Lembrete.config(req.user.id);
        const aparelhos = await Lembrete.inscricoes(req.user.id);
        res.render('configuracoes/lembretes', {
            title: req.t('lembrete.titulo'),
            menuAtivo: 'lembretes',
            horarios: HORARIOS,
            pushDisponivel: push.disponivel(),
            chavePublica: push.chavePublica,
            totalAparelhos: aparelhos.length,
            config: config || { ativo: 0, hora: '08:00', aviso_dia: 1, aviso_antes: 0, fuso: lembretes.FUSO_PADRAO }
        });
    },

    salvar: async (req, res) => {
        const ativo = req.body.ativo === '1';
        const hora = String(req.body.hora || '');
        const avisoDia = req.body.aviso_dia === '1';
        const avisoAntes = req.body.aviso_antes === '1';
        const fuso = lembretes.fusoValido(req.body.fuso) ? req.body.fuso : lembretes.FUSO_PADRAO;
        const voltar = (mensagem) => {
            req.session.flash = mensagem;
            return res.redirect('/configuracoes/lembretes');
        };

        if (!lembretes.horaValida(hora)) return voltar({ tipo: 'erro', mensagem: req.t('lembrete.horario_invalido') });
        if (ativo && !avisoDia && !avisoAntes) return voltar({ tipo: 'erro', mensagem: req.t('lembrete.escolha_quando') });

        await Lembrete.salvarConfig(req.user.id, {
            ativo, hora, avisoDia, avisoAntes, fuso,
            proximoEnvio: lembretes.proximoEnvio(hora, fuso)
        });
        voltar({ tipo: 'sucesso', mensagem: req.t('lembrete.salvo') });
    },

    // O navegador envia a inscricao (endpoint + chaves) depois de o usuario permitir notificacoes.
    inscrever: async (req, res) => {
        const s = req.body && req.body.subscription;
        const chaves = s && s.keys;
        if (!s || typeof s.endpoint !== 'string' || !/^https:\/\//.test(s.endpoint) || s.endpoint.length > 2000
            || !chaves || typeof chaves.p256dh !== 'string' || typeof chaves.auth !== 'string') {
            return res.status(400).json({ sucesso: false });
        }
        await Lembrete.inscrever(req.user.id, {
            endpoint: s.endpoint,
            p256dh: chaves.p256dh.slice(0, 255),
            auth: chaves.auth.slice(0, 255),
            nome: String(req.get('user-agent') || '').slice(0, 120)
        });
        res.json({ sucesso: true });
    },

    desinscrever: async (req, res) => {
        const endpoint = req.body && req.body.endpoint;
        if (typeof endpoint === 'string') await Lembrete.removerPorEndpoint(req.user.id, endpoint);
        res.json({ sucesso: true });
    },

    testar: async (req, res) => {
        const entregues = await lembretes.enviarParaUsuario(req.user.id, {
            title: req.t('lembrete.teste_titulo'),
            body: req.t('lembrete.teste_corpo'),
            url: '/lembretes/vencimentos',
            tag: 'teste-lembrete'
        });
        res.json({ sucesso: entregues > 0 });
    },

    // Tela aberta ao tocar na notificacao: nome e valor de cada despesa e o total a pagar.
    vencimentos: async (req, res) => {
        const config = await Lembrete.config(req.user.id);
        const fuso = (config && config.fuso) || lembretes.FUSO_PADRAO;
        const hoje = lembretes.dataLocalYMD(Date.now(), fuso);
        const pedida = String(req.query.data || '');
        const data = /^\d{4}-\d{2}-\d{2}$/.test(pedida) ? pedida : hoje;
        const despesas = await Lembrete.despesasDoDia(req.user.id, data);
        const total = despesas.reduce((s, d) => s + Number(d.valor), 0);
        let titulo = req.t('lembrete.venc_data', { data: res.locals.formatDate(data, 'DD/MM/YYYY') });
        if (data === hoje) titulo = req.t('lembrete.venc_hoje');
        else if (data === lembretes.somarDias(hoje, 1)) titulo = req.t('lembrete.venc_amanha');
        res.render('lembretes/vencimentos', { title: req.t('lembrete.venc_titulo'), cabecalho: titulo, data, despesas, total });
    },

    // Chamado pelo cron externo a cada 30 minutos. Autenticado por CRON_TOKEN (header x-cron-token ou ?token=).
    cron: async (req, res) => {
        if (!tokenValido(req.get('x-cron-token') || req.query.token)) return res.status(403).json({ sucesso: false });
        try {
            res.json(Object.assign({ sucesso: true }, await lembretes.processarDevidos()));
        } catch (err) {
            console.error('Falha no cron de lembretes:', err);
            res.status(500).json({ sucesso: false });
        }
    }
};

module.exports = lembretesController;
