const Ia = require('../models/Ia');
const Lancamento = require('../models/Lancamento');
const iaCore = require('../core/ia');

const LIMITE_MES = parseInt(process.env.IA_LIMITE_MENSAGENS_MES || '300', 10);
const MAX_TEXTO = 600;

const iaController = {
    index: async (req, res) => {
        const conversas = await Ia.listarConversas(req.user.id);
        const uso = await Ia.uso(req.user.id);
        res.render('ia/index', {
            title: req.t('ia.titulo'),
            conversas,
            restantes: req.ehAdmin ? null : Math.max(0, LIMITE_MES - uso.mensagens),
            configurada: Boolean(iaCore.obterCliente())
        });
    },

    conversa: async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const conversa = await Ia.buscarConversa(id, req.user.id);
        if (!conversa) return res.status(404).json({ sucesso: false, erro: req.t('ia.erro_conversa') });
        const mensagens = await Ia.mensagensComAcoes(id, req.user.id);
        res.json({ sucesso: true, conversa: { id: conversa.id, titulo: conversa.titulo }, mensagens });
    },

    mensagem: async (req, res) => {
        const userId = req.user.id;
        const texto = String((req.body && req.body.texto) || '').trim();
        if (!texto || texto.length > MAX_TEXTO) {
            return res.status(400).json({ sucesso: false, erro: req.t('ia.erro_texto', { n: MAX_TEXTO }) });
        }
        if (!iaCore.obterCliente()) {
            return res.status(503).json({ sucesso: false, erro: req.t('ia.erro_nao_configurada') });
        }
        if (!req.ehAdmin) {
            const uso = await Ia.uso(userId);
            if (uso.mensagens >= LIMITE_MES) return res.status(429).json({ sucesso: false, erro: req.t('ia.erro_limite_mes') });
        }

        let conversaId = req.body.conversa_id ? parseInt(req.body.conversa_id, 10) : null;
        let titulo = null;
        if (conversaId) {
            const c = await Ia.buscarConversa(conversaId, userId);
            if (!c) return res.status(404).json({ sucesso: false, erro: req.t('ia.erro_conversa') });
        } else {
            titulo = texto.slice(0, 60);
            conversaId = await Ia.criarConversa(userId, titulo);
        }

        await Ia.adicionarMensagem({ conversaId, userId, papel: 'user', conteudo: texto });
        const historico = await Ia.historicoParaIa(conversaId, userId);

        let r;
        try {
            r = await iaCore.responder({ usuario: req.user, conversaId, historico });
        } catch (err) {
            if (err.codigo === 'ia_nao_configurada') {
                return res.status(503).json({ sucesso: false, conversa_id: conversaId, erro: req.t('ia.erro_nao_configurada') });
            }
            console.error('Chat IA: erro ao chamar a API:', err.status || '', err.message);
            const ocupada = err.status === 429 || err.status === 529 || err.status >= 500;
            return res.status(502).json({ sucesso: false, conversa_id: conversaId, erro: req.t(ocupada ? 'ia.erro_ocupada' : 'ia.erro_generico') });
        }

        const marcadores = { __refusal__: 'ia.recusou', __max_tokens__: 'ia.resposta_longa', __sem_resposta__: 'ia.erro_generico' };
        const textoFinal = marcadores[r.texto] ? req.t(marcadores[r.texto]) : r.texto;
        const msgId = await Ia.adicionarMensagem({
            conversaId, userId, papel: 'assistant', conteudo: textoFinal,
            acoesIds: r.rascunhos, tokensIn: r.tokensIn, tokensOut: r.tokensOut
        });
        await Ia.registrarUso(userId, r.tokensIn, r.tokensOut);
        await Ia.tocarConversa(conversaId, userId);

        const acoes = [];
        for (const aid of r.rascunhos) {
            const a = await Ia.buscarAcao(aid, userId);
            if (a) acoes.push(Ia.cartao(a));
        }
        res.json({ sucesso: true, conversa_id: conversaId, titulo, mensagem: { id: msgId, papel: 'assistant', texto: textoFinal, acoes } });
    },

    excluirConversa: async (req, res) => {
        await Ia.excluirConversa(parseInt(req.params.id, 10), req.user.id);
        res.json({ sucesso: true });
    },

    // O lancamento so e criado aqui, depois do clique do usuario.
    confirmarAcao: async (req, res) => {
        const userId = req.user.id;
        const id = parseInt(req.params.id, 10);
        if (req.assinatura && req.assinatura.somente_leitura && !req.ehAdmin) {
            return res.status(403).json({ sucesso: false, erro: req.t('flash.somente_leitura') });
        }
        const acao = await Ia.buscarAcao(id, userId);
        if (!acao) return res.status(404).json({ sucesso: false, erro: req.t('ia.erro_acao') });
        if (!(await Ia.reservarAcao(id, userId, 'confirmada'))) {
            return res.status(409).json({ sucesso: false, erro: req.t('ia.erro_acao_ja_tratada'), cartao: Ia.cartao(await Ia.buscarAcao(id, userId)) });
        }
        try {
            const p = JSON.parse(acao.payload);
            const ids = await Lancamento.criar(userId, {
                conta_id: p.conta_id, categoria_id: p.categoria_id, subcategoria_id: null,
                tipo: p.tipo, descricao: p.descricao, valor: p.valor,
                data_competencia: p.data_competencia, status: p.status, data_pagamento: p.data_pagamento,
                observacoes: 'Registrado pelo Chat IA'
            });
            await Ia.vincularLancamento(id, userId, ids[0]);
            res.json({ sucesso: true, cartao: Ia.cartao(await Ia.buscarAcao(id, userId)) });
        } catch (err) {
            await Ia.liberarAcao(id, userId);
            console.error('Chat IA: falha ao confirmar lancamento:', err.message);
            res.status(400).json({ sucesso: false, erro: req.t(err.codigo ? 'flash.lanc_conta_categoria_invalida' : 'ia.erro_generico') });
        }
    },

    cancelarAcao: async (req, res) => {
        const userId = req.user.id;
        const id = parseInt(req.params.id, 10);
        const acao = await Ia.buscarAcao(id, userId);
        if (!acao) return res.status(404).json({ sucesso: false, erro: req.t('ia.erro_acao') });
        if (!(await Ia.reservarAcao(id, userId, 'cancelada'))) {
            return res.status(409).json({ sucesso: false, erro: req.t('ia.erro_acao_ja_tratada'), cartao: Ia.cartao(await Ia.buscarAcao(id, userId)) });
        }
        res.json({ sucesso: true, cartao: Ia.cartao(await Ia.buscarAcao(id, userId)) });
    }
};

module.exports = iaController;
