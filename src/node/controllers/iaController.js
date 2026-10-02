const Ia = require('../models/Ia');
const Lancamento = require('../models/Lancamento');
const iaCore = require('../core/ia');
const midia = require('../core/ia_midia');
const { validarImagem } = require('../core/uploads');
const { custoClaudeMicro, custoAudioMicro } = require('../core/ia_precos');
const { executarPlano } = require('../core/ia_plano');

const LIMITE_MES = parseInt(process.env.IA_LIMITE_MENSAGENS_MES || '300', 10);
const MAX_TEXTO = 600;

// Admin sempre usa o Nivel 2 (para poder testar); os demais usam o nivel definido pelo admin (padrao 1).
const nivelDe = (req) => (req.ehAdmin || Number(req.user.ia_nivel) === 2 ? 2 : 1);

// Grava o consumo do dia: tokens de texto, de imagem e de audio, e o custo estimado de cada parte.
async function registrarConsumo(userId, uso, { imagens = 0, stt = null }) {
    const u = uso || {};
    const totalEntrada = (u.entrada || 0) + (u.cacheLeitura || 0) + (u.cacheEscrita || 0);
    const custoClaude = custoClaudeMicro({ entrada: u.entrada, cacheLeitura: u.cacheLeitura, cacheEscrita: u.cacheEscrita, saida: u.saida }, iaCore.MODELO);
    // O custo das imagens e a fatia da entrada que elas ocuparam (proporcional aos tokens).
    const custoEntrada = custoClaude - custoClaudeMicro({ saida: u.saida }, iaCore.MODELO);
    const custoImagem = totalEntrada > 0 ? Math.round(custoEntrada * Math.min(1, (u.tokImagem || 0) / totalEntrada)) : 0;
    await Ia.registrarUsoDetalhado(userId, {
        entrada: u.entrada, cacheLeitura: u.cacheLeitura, cacheEscrita: u.cacheEscrita, saida: u.saida,
        tokImagem: u.tokImagem || 0, tokAudio: stt ? stt.tokens : 0,
        imagens, audios: stt ? 1 : 0, audioSegundos: stt ? stt.segundos : 0,
        custoTexto: custoClaude - custoImagem, custoImagem, custoAudio: stt ? (stt.custoMicro != null ? stt.custoMicro : custoAudioMicro(stt.segundos, stt.modelo)) : 0
    });
}

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

    // Aceita JSON (so texto) ou multipart (texto + ate 3 fotos + 1 audio). Fotos e audio ficam so em memoria: nada e salvo.
    mensagem: async (req, res) => {
        const userId = req.user.id;
        const body = req.body || {};
        const textoDigitado = String(body.texto || '').trim();
        const arquivos = req.files || {};
        const fotos = arquivos.imagens || [];
        const audioArq = (arquivos.audio || [])[0];

        if (textoDigitado.length > MAX_TEXTO) {
            return res.status(400).json({ sucesso: false, erro: req.t('ia.erro_texto', { n: MAX_TEXTO }) });
        }
        if (!textoDigitado && !fotos.length && !audioArq) {
            return res.status(400).json({ sucesso: false, erro: req.t('ia.erro_vazio') });
        }
        if (fotos.length > midia.MAX_IMAGENS) {
            return res.status(400).json({ sucesso: false, erro: req.t('ia.erro_foto_max', { n: midia.MAX_IMAGENS }) });
        }

        // Validacao das fotos pelo conteudo real (nao pelo mimetype informado).
        const imagens = [];
        for (const f of fotos) {
            const v = validarImagem(f.buffer, f.mimetype, midia.MAX_BYTES_IMAGEM);
            if (!v.ok) return res.status(400).json({ sucesso: false, erro: req.t(v.motivo === 'flash.comunidade_imagem_grande' ? 'ia.erro_imagem_grande' : 'ia.erro_imagem') });
            imagens.push({ mime: v.mime, base64: f.buffer.toString('base64'), tokens: midia.tokensImagem(f.buffer) });
        }
        let tipoAudio = null;
        if (audioArq) {
            tipoAudio = midia.tipoAudio(audioArq.buffer);
            if (!tipoAudio || audioArq.size > midia.MAX_BYTES_AUDIO) {
                return res.status(400).json({ sucesso: false, erro: req.t('ia.erro_audio_invalido') });
            }
            if (!midia.sttConfigurado()) {
                return res.status(503).json({ sucesso: false, erro: req.t('ia.erro_stt_nao_configurada') });
            }
        }

        if (!iaCore.obterCliente()) {
            return res.status(503).json({ sucesso: false, erro: req.t('ia.erro_nao_configurada') });
        }
        if (!req.ehAdmin) {
            const uso = await Ia.uso(userId);
            if (uso.mensagens >= LIMITE_MES) return res.status(429).json({ sucesso: false, erro: req.t('ia.erro_limite_mes') });
        }

        // Audio -> texto (a API da Claude nao recebe audio).
        let transcricao = null;
        let stt = null;
        if (audioArq) {
            try {
                const segCliente = Math.min(Math.max(parseInt(body.audio_seg, 10) || 0, 0), midia.MAX_SEGUNDOS_AUDIO);
                stt = await midia.transcrever({ buffer: audioArq.buffer, tipo: tipoAudio, segundos: segCliente, idioma: req.user.idioma });
                transcricao = stt.texto;
            } catch (err) {
                console.error('Chat IA: falha na transcricao:', err.codigo || '', err.message);
                return res.status(502).json({ sucesso: false, erro: req.t('ia.erro_stt') });
            }
            if (!transcricao) return res.status(422).json({ sucesso: false, erro: req.t('ia.erro_audio_vazio') });
        }

        // Texto que a Claude recebe (e que fica no historico). As fotos nao entram no historico, so um marcador.
        const partes = [];
        if (imagens.length) partes.push('📷'.repeat(imagens.length));
        if (textoDigitado) partes.push(textoDigitado);
        if (transcricao) partes.push(`[${req.t('ia.transcricao_rotulo')}] ${transcricao}`);
        let texto = partes.join(' ');
        if (imagens.length && !textoDigitado && !transcricao) texto += ' ' + req.t('ia.texto_padrao_foto');

        let conversaId = body.conversa_id ? parseInt(body.conversa_id, 10) : null;
        let titulo = null;
        if (conversaId) {
            const c = await Ia.buscarConversa(conversaId, userId);
            if (!c) return res.status(404).json({ sucesso: false, erro: req.t('ia.erro_conversa') });
        } else {
            titulo = (textoDigitado || transcricao || req.t('ia.texto_padrao_foto')).slice(0, 60);
            conversaId = await Ia.criarConversa(userId, titulo);
        }

        await Ia.adicionarMensagem({ conversaId, userId, papel: 'user', conteudo: texto });
        const historico = await Ia.historicoParaIa(conversaId, userId);

        let r;
        try {
            r = await iaCore.responder({ usuario: req.user, conversaId, historico, nivel: nivelDe(req), imagens });
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
        await registrarConsumo(userId, r.uso, { imagens: imagens.length, stt });
        await Ia.tocarConversa(conversaId, userId);

        const acoes = [];
        for (const aid of r.rascunhos) {
            const a = await Ia.buscarAcao(aid, userId);
            if (a) acoes.push(Ia.cartao(a));
        }
        res.json({ sucesso: true, conversa_id: conversaId, titulo, transcricao, mensagem: { id: msgId, papel: 'assistant', texto: textoFinal, acoes } });
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
            if (p.kind === 'plano') {
                // Plano do Nivel 2: so executa se o usuario ainda estiver no Nivel 2.
                if (nivelDe(req) !== 2) {
                    await Ia.liberarAcao(id, userId);
                    return res.status(403).json({ sucesso: false, erro: req.t('ia.erro_indisponivel') });
                }
                const resultados = await executarPlano(userId, p.operacoes);
                if (!resultados.some((r) => r.ok)) {
                    await Ia.liberarAcao(id, userId);
                    return res.status(400).json({ sucesso: false, erro: resultados.map((r) => r.erro).filter(Boolean).slice(0, 3).join(' | ') || req.t('ia.erro_generico') });
                }
                await Ia.salvarPayload(id, userId, { ...p, resultados });
                return res.json({ sucesso: true, cartao: Ia.cartao(await Ia.buscarAcao(id, userId)) });
            }
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
