const Ia = require('../models/Ia');
const Assinatura = require('../models/Assinatura');
const iaCore = require('../core/ia');
const midia = require('../core/ia_midia');
const { validarImagem } = require('../core/uploads');
const { custoClaudeMicro, custoAudioMicro } = require('../core/ia_precos');
const { desfazerTudo, JANELA_REVERTER_SEG } = require('../core/ia_plano');
const { IA_LIMITE_PADRAO } = require('../core/negocio');

const MAX_TEXTO = 600;

// Nome curto de uma operacao do plano, para o aviso de reversao.
function nomeDaOp(op) {
    switch (op.op) {
        case 'lancamento': return op.descricao;
        case 'status': return (op.itens || []).map((i) => i.descricao).join(', ');
        case 'editar': return op.descricao_atual;
        case 'categoria_criar': return op.nome;
        case 'categoria_renomear': return op.para;
        case 'transferencia': return op.descricao || `${op.origem_nome} > ${op.destino_nome}`;
        default: return '';
    }
}

const planoDe = (req) => (req.assinatura && req.assinatura.plano) || {};
// Limite mensal de mensagens: o do plano (planos.ia_limite_mes) ou o padrao do sistema.
const limiteMesDe = (req) => planoDe(req).ia_limite_mes || IA_LIMITE_PADRAO;
// Admin sempre usa o Nivel 2 (para poder testar); os demais usam o nivel definido pelo admin (padrao 1),
// desde que o plano inclua a IA avancada.
const nivelDe = (req) => (req.ehAdmin || (Number(req.user.ia_nivel) === 2 && planoDe(req).rec_ia_nivel2) ? 2 : 1);

// Cota de registros de transacao por foto ou audio no mes (o registro por texto nao conta). Admin nao tem cota.
// Devolve null quando nao ha cota a mostrar, ou { liberada, usados, limite, esgotada, upgrade: { plano, nome, limite } | null }.
async function cotaMidia(req, uso) {
    if (req.ehAdmin) return null;
    const plano = planoDe(req);
    const limite = Number(plano.ia_midia_limite_mes) || 0;
    const liberada = Boolean(plano.rec_ia_midia);
    const nomeDoPlano = (codigo) => req.t('plano.' + codigo + '.nome');
    if (!liberada) return { liberada: false, usados: 0, limite: 0, esgotada: true, upgrade: { plano: 'premium', nome: nomeDoPlano('premium'), limite: 0 } };
    if (!limite) return null;
    const u = uso || await Ia.uso(req.user.id);
    const usados = Math.min(Number(u.registros_midia) || 0, limite);
    const esgotada = usados >= limite;
    let upgrade = null;
    if (esgotada) {
        const acima = await Assinatura.planoComMaisMidia(limite);
        if (acima) upgrade = { plano: acima.codigo, nome: nomeDoPlano(acima.codigo), limite: acima.ia_midia_limite_mes };
    }
    return { liberada: true, usados, limite, esgotada, upgrade };
}

// Texto do aviso quando a cota de foto e audio acabou (com a indicacao do plano de cima, se houver).
function textoCotaEsgotada(req, cota) {
    const partes = [req.t('ia.cota_titulo', { n: cota.limite }) + '.'];
    if (cota.upgrade) partes.push(req.t('ia.cota_upgrade', { plano: cota.upgrade.nome, m: cota.upgrade.limite }));
    else partes.push(req.t('ia.cota_volta'));
    partes.push(req.t('ia.cota_texto_livre'));
    return partes.join(' ');
}

// Grava o consumo do dia: tokens de texto, de imagem e de audio, e o custo estimado de cada parte.
async function registrarConsumo(userId, uso, { imagens = 0, stt = null, modelo = iaCore.MODELO }) {
    const u = uso || {};
    const totalEntrada = (u.entrada || 0) + (u.cacheLeitura || 0) + (u.cacheEscrita || 0);
    const custoClaude = custoClaudeMicro({ entrada: u.entrada, cacheLeitura: u.cacheLeitura, cacheEscrita: u.cacheEscrita, saida: u.saida }, modelo);
    // O custo das imagens e a fatia da entrada que elas ocuparam (proporcional aos tokens).
    const custoEntrada = custoClaude - custoClaudeMicro({ saida: u.saida }, modelo);
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
            restantes: req.ehAdmin ? null : Math.max(0, limiteMesDe(req) - uso.mensagens),
            cota: await cotaMidia(req, uso),
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
        // Foto e audio: o plano precisa incluir e a cota de registros do mes nao pode ter acabado.
        const temMidia = fotos.length > 0 || Boolean(audioArq);
        if (temMidia && !req.ehAdmin) {
            const cota = await cotaMidia(req);
            if (cota && !cota.liberada) return res.status(403).json({ sucesso: false, erro: req.t('ia.erro_plano_midia'), cota_midia: cota });
            if (cota && cota.esgotada) return res.status(429).json({ sucesso: false, erro: textoCotaEsgotada(req, cota), cota_midia: cota });
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
            if (uso.mensagens >= limiteMesDe(req)) return res.status(429).json({ sucesso: false, erro: req.t('ia.erro_limite_mes') });
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
        if (imagens.length) partes.push(`[${imagens.length > 1 ? imagens.length + ' fotos enviadas' : 'foto enviada'}]`);
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
            r = await iaCore.responder({ usuario: req.user, conversaId, historico, nivel: nivelDe(req), imagens, somenteLeitura: Boolean(req.assinatura && req.assinatura.somente_leitura && !req.ehAdmin) });
        } catch (err) {
            if (err.codigo === 'ia_nao_configurada') {
                return res.status(503).json({ sucesso: false, conversa_id: conversaId, erro: req.t('ia.erro_nao_configurada') });
            }
            console.error('Chat IA: erro ao chamar a API:', err.status || '', err.message);
            // O que ja foi gasto antes da falha (voltas da Claude e/ou transcricao do audio) tambem conta no limite e no custo.
            const parcial = err.uso || {};
            if (parcial.chamadas > 0 || stt) {
                try {
                    await Ia.registrarUso(userId, (parcial.entrada || 0) + (parcial.cacheLeitura || 0) + (parcial.cacheEscrita || 0), parcial.saida || 0);
                    await registrarConsumo(userId, parcial, { imagens: imagens.length, stt, modelo: err.modelo || iaCore.MODELO });
                } catch (e) { console.error('Chat IA: falha ao registrar consumo parcial:', e.message); }
            }
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
        await registrarConsumo(userId, r.uso, { imagens: imagens.length, stt, modelo: r.modelo });
        await Ia.tocarConversa(conversaId, userId);

        const acoes = [];
        for (const aid of r.rascunhos) {
            const a = await Ia.buscarAcao(aid, userId);
            if (!a) continue;
            acoes.push(Ia.cartao(a));
            // Cada transacao registrada a partir de uma foto ou de um audio conta na cota do mes.
            if (temMidia && !req.ehAdmin) {
                let payload = {};
                try { payload = JSON.parse(a.payload); } catch (e) { payload = {}; }
                await Ia.consumirMidia(userId, aid, Ia.registrosDaAcao(payload));
            }
        }
        res.json({
            sucesso: true, conversa_id: conversaId, titulo, transcricao,
            mensagem: { id: msgId, papel: 'assistant', texto: textoFinal, acoes },
            cota_midia: await cotaMidia(req)
        });
    },

    excluirConversa: async (req, res) => {
        await Ia.excluirConversa(parseInt(req.params.id, 10), req.user.id);
        res.json({ sucesso: true });
    },

    // Reverte o que a IA acabou de aplicar (so dentro da janela) e pergunta o que ajustar.
    reverterAcao: async (req, res) => {
        const userId = req.user.id;
        const id = parseInt(req.params.id, 10);
        const acao = await Ia.buscarAcao(id, userId);
        if (!acao) return res.status(404).json({ sucesso: false, erro: req.t('ia.erro_acao') });
        // O servidor aceita alguns segundos a mais que o contador da tela, por causa da latencia da rede.
        if (!(await Ia.reservarReversao(id, userId, JANELA_REVERTER_SEG + 5))) {
            return res.status(409).json({ sucesso: false, erro: req.t('ia.erro_reverter_fora'), cartao: Ia.cartao(await Ia.buscarAcao(id, userId)) });
        }
        try {
            const p = JSON.parse(acao.payload);
            const plano = p.kind === 'plano';
            const falhas = await desfazerTudo(userId, p.desfazer || []);
            // O que foi revertido volta para a cota de registros por foto e audio.
            await Ia.devolverMidia(userId, id);
            const resumo = (plano ? (p.operacoes || []).map(nomeDaOp) : [p.descricao]).filter(Boolean).join('; ').slice(0, 240);
            let texto = req.t('ia.revertido_msg', { resumo });
            if (falhas) texto += '\n\n' + req.t('ia.revertido_parcial', { n: falhas });
            await Ia.adicionarMensagem({ conversaId: acao.conversa_id, userId, papel: 'assistant', conteudo: texto });
            await Ia.tocarConversa(acao.conversa_id, userId);
            res.json({ sucesso: true, cartao: Ia.cartao(await Ia.buscarAcao(id, userId)), mensagem: { papel: 'assistant', texto }, cota_midia: await cotaMidia(req) });
        } catch (err) {
            await Ia.liberarReversao(id, userId);
            console.error('Chat IA: falha ao reverter:', err.message);
            res.status(500).json({ sucesso: false, erro: req.t('ia.erro_reverter') });
        }
    }
};

module.exports = iaController;
