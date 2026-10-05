const db = require('../config/db');

// Mes de uso no mesmo fuso do consumo diario (hojeUso), para o limite mensal reiniciar na virada local.
const mesAtual = () => require('../core/ia_precos').hojeUso().slice(0, 7);

// Toda consulta filtra por user_id: um usuario nunca enxerga conversas, rascunhos ou uso de outro.
class Ia {
    static async listarConversas(userId, limite = 50) {
        const [rows] = await db.query(
            'SELECT id, titulo, updated_at FROM ia_conversas WHERE user_id = ? ORDER BY updated_at DESC, id DESC LIMIT ?',
            [userId, limite]
        );
        return rows;
    }

    static async buscarConversa(id, userId) {
        const [rows] = await db.query('SELECT * FROM ia_conversas WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
        return rows[0] || null;
    }

    static async criarConversa(userId, titulo) {
        const [res] = await db.query('INSERT INTO ia_conversas (user_id, titulo) VALUES (?, ?)', [userId, String(titulo || '').slice(0, 120)]);
        return res.insertId;
    }

    static async excluirConversa(id, userId) {
        await db.query('DELETE FROM ia_conversas WHERE id = ? AND user_id = ?', [id, userId]);
    }

    static async tocarConversa(id, userId) {
        await db.query('UPDATE ia_conversas SET updated_at = NOW() WHERE id = ? AND user_id = ?', [id, userId]);
    }

    static async adicionarMensagem({ conversaId, userId, papel, conteudo, acoesIds = [], tokensIn = 0, tokensOut = 0 }) {
        const [res] = await db.query(
            'INSERT INTO ia_mensagens (conversa_id, user_id, papel, conteudo, acoes_ids, tokens_in, tokens_out) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [conversaId, userId, papel, conteudo, acoesIds.length ? acoesIds.join(',') : null, tokensIn, tokensOut]
        );
        return res.insertId;
    }

    // Ultimas mensagens (texto) para dar contexto a IA.
    static async historicoParaIa(conversaId, userId, limite = 24) {
        const [rows] = await db.query(
            'SELECT papel, conteudo FROM ia_mensagens WHERE conversa_id = ? AND user_id = ? ORDER BY id DESC LIMIT ?',
            [conversaId, userId, limite]
        );
        return rows.reverse();
    }

    static async mensagensComAcoes(conversaId, userId) {
        const [msgs] = await db.query(
            'SELECT id, papel, conteudo, acoes_ids, created_at FROM ia_mensagens WHERE conversa_id = ? AND user_id = ? ORDER BY id ASC',
            [conversaId, userId]
        );
        const ids = msgs.flatMap((m) => (m.acoes_ids ? m.acoes_ids.split(',').map(Number) : []));
        const mapa = {};
        if (ids.length) {
            const [acoes] = await db.query(
                `SELECT id, payload, status, TIMESTAMPDIFF(MICROSECOND, aplicada_em, NOW()) AS idade_us FROM ia_acoes WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
                [userId, ...ids]
            );
            acoes.forEach((a) => { mapa[a.id] = this.cartao(a); });
        }
        return msgs.map((m) => ({
            id: m.id,
            papel: m.papel,
            texto: m.conteudo,
            criada_em: m.created_at,
            acoes: (m.acoes_ids ? m.acoes_ids.split(',').map(Number) : []).map((i) => mapa[i]).filter(Boolean)
        }));
    }

    // ---- Rascunhos de lancamento (so viram lancamento quando o usuario confirma) ----
    static async criarAcao({ userId, conversaId, payload }) {
        const [res] = await db.query('INSERT INTO ia_acoes (user_id, conversa_id, payload) VALUES (?, ?, ?)', [userId, conversaId, JSON.stringify(payload)]);
        return res.insertId;
    }

    static async buscarAcao(id, userId) {
        const [rows] = await db.query('SELECT *, TIMESTAMPDIFF(MICROSECOND, aplicada_em, NOW()) AS idade_us FROM ia_acoes WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
        return rows[0] || null;
    }

    // Acao ja aplicada: a janela de reversao conta a partir daqui.
    static async criarAcaoAplicada({ userId, conversaId, payload }) {
        const [res] = await db.query(
            "INSERT INTO ia_acoes (user_id, conversa_id, payload, status, aplicada_em) VALUES (?, ?, ?, 'confirmada', NOW())",
            [userId, conversaId, JSON.stringify(payload)]
        );
        return res.insertId;
    }

    // Reserva atomica: so uma requisicao reverte (e so dentro da janela, com folga para a latencia da rede).
    static async reservarReversao(id, userId, janelaSeg) {
        const [res] = await db.query(
            "UPDATE ia_acoes SET status = 'revertida' WHERE id = ? AND user_id = ? AND status = 'confirmada' AND aplicada_em >= NOW() - INTERVAL ? SECOND",
            [id, userId, janelaSeg]
        );
        return res.affectedRows === 1;
    }

    // Se desfazer falhar por completo, a acao volta a valer (o usuario pode tentar de novo dentro da janela).
    static async liberarReversao(id, userId) {
        await db.query("UPDATE ia_acoes SET status = 'confirmada' WHERE id = ? AND user_id = ? AND status = 'revertida'", [id, userId]);
    }

    // Segundos que ainda restam para reverter (0 = fora da janela).
    static restante(acao, janelaSeg) {
        if (acao.status !== 'confirmada' || acao.idade_us == null) return 0;
        const dec = janelaSeg - Number(acao.idade_us) / 1e6;
        return dec > 0 ? Math.ceil(dec) : 0;
    }

    static cartao(acao) {
        const { JANELA_REVERTER_SEG } = require('../core/ia_plano');
        let p = {};
        try { p = JSON.parse(acao.payload); } catch (e) { p = {}; }
        const restante = this.restante(acao, JANELA_REVERTER_SEG);
        if (p.kind === 'plano') {
            return { id: acao.id, status: acao.status, restante, plano: true, operacoes: p.operacoes || [], resultados: p.resultados || null };
        }
        return {
            id: acao.id,
            status: acao.status,
            restante,
            tipo: p.tipo,
            descricao: p.descricao,
            valor: p.valor,
            conta: p.conta_nome,
            moeda: p.moeda || null,
            categoria: p.categoria_nome,
            data: p.data_competencia,
            pago: p.status === 'pago'
        };
    }

    // ---- Uso mensal (limite por usuario) ----
    static async uso(userId) {
        const [rows] = await db.query('SELECT mensagens, tokens_in, tokens_out, registros_midia FROM ia_uso WHERE user_id = ? AND mes = ?', [userId, mesAtual()]);
        return rows[0] || { mensagens: 0, tokens_in: 0, tokens_out: 0, registros_midia: 0 };
    }

    // ---- Cota mensal de registros de transacao por foto ou audio (planos.ia_midia_limite_mes) ----
    // Quantas transacoes (lancamentos e transferencias) uma acao aplicada pela IA registrou.
    static registrosDaAcao(payload) {
        const p = payload || {};
        if (p.kind === 'plano') {
            return (p.operacoes || []).filter((o, i) => (o.op === 'lancamento' || o.op === 'transferencia')
                && !(p.resultados && p.resultados[i] && p.resultados[i].ok === false)).length;
        }
        return p.tipo ? 1 : 0;
    }

    // Soma n registros na cota do mes e anota na acao quanto ela consumiu (para devolver se for revertida).
    static async consumirMidia(userId, acaoId, n) {
        if (!(n > 0)) return;
        await db.query(
            `INSERT INTO ia_uso (user_id, mes, mensagens, tokens_in, tokens_out, registros_midia) VALUES (?, ?, 0, 0, 0, ?)
             ON DUPLICATE KEY UPDATE registros_midia = registros_midia + VALUES(registros_midia)`,
            [userId, mesAtual(), n]
        );
        await db.query('UPDATE ia_acoes SET midia_registros = ? WHERE id = ? AND user_id = ?', [n, acaoId, userId]);
    }

    // Reversao: devolve a cota o que a acao tinha consumido (uma vez so).
    static async devolverMidia(userId, acaoId) {
        const [[a]] = await db.query('SELECT midia_registros FROM ia_acoes WHERE id = ? AND user_id = ?', [acaoId, userId]);
        const n = a ? Number(a.midia_registros) || 0 : 0;
        if (!n) return 0;
        const [r] = await db.query('UPDATE ia_acoes SET midia_registros = 0 WHERE id = ? AND user_id = ? AND midia_registros = ?', [acaoId, userId, n]);
        if (r.affectedRows !== 1) return 0;
        await db.query('UPDATE ia_uso SET registros_midia = IF(registros_midia > ?, registros_midia - ?, 0) WHERE user_id = ? AND mes = ?', [n, n, userId, mesAtual()]);
        return n;
    }

    static async registrarUso(userId, tokensIn, tokensOut) {
        await db.query(
            `INSERT INTO ia_uso (user_id, mes, mensagens, tokens_in, tokens_out) VALUES (?, ?, 1, ?, ?)
             ON DUPLICATE KEY UPDATE mensagens = mensagens + 1, tokens_in = tokens_in + VALUES(tokens_in), tokens_out = tokens_out + VALUES(tokens_out)`,
            [userId, mesAtual(), tokensIn, tokensOut]
        );
    }

    // ---- Consumo (tokens de texto / imagem / audio e custo estimado), por usuario e por dia ----
    static async registrarUsoDetalhado(userId, u) {
        const dia = require('../core/ia_precos').hojeUso();
        await db.query(
            `INSERT INTO ia_uso_diario (user_id, dia, mensagens, tok_entrada, tok_cache_leitura, tok_cache_escrita, tok_saida, tok_imagem, tok_audio,
                                        imagens, audios, audio_segundos, custo_texto_micro, custo_imagem_micro, custo_audio_micro)
             VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE mensagens = mensagens + 1, tok_entrada = tok_entrada + VALUES(tok_entrada),
                tok_cache_leitura = tok_cache_leitura + VALUES(tok_cache_leitura), tok_cache_escrita = tok_cache_escrita + VALUES(tok_cache_escrita),
                tok_saida = tok_saida + VALUES(tok_saida), tok_imagem = tok_imagem + VALUES(tok_imagem), tok_audio = tok_audio + VALUES(tok_audio),
                imagens = imagens + VALUES(imagens), audios = audios + VALUES(audios), audio_segundos = audio_segundos + VALUES(audio_segundos),
                custo_texto_micro = custo_texto_micro + VALUES(custo_texto_micro), custo_imagem_micro = custo_imagem_micro + VALUES(custo_imagem_micro),
                custo_audio_micro = custo_audio_micro + VALUES(custo_audio_micro)`,
            [userId, dia, u.entrada || 0, u.cacheLeitura || 0, u.cacheEscrita || 0, u.saida || 0, u.tokImagem || 0, u.tokAudio || 0,
                u.imagens || 0, u.audios || 0, u.audioSegundos || 0, u.custoTexto || 0, u.custoImagem || 0, u.custoAudio || 0]
        );
    }

    // Expressoes SQL das metricas (p = prefixo da tabela). texto = tudo que a Claude leu/escreveu menos a parte das imagens.
    static metricas(p = '') {
        return `SUM(${p}tok_entrada + ${p}tok_cache_leitura + ${p}tok_cache_escrita + ${p}tok_saida - ${p}tok_imagem) AS tok_texto,
                SUM(${p}tok_imagem) AS tok_imagem, SUM(${p}tok_audio) AS tok_audio,
                SUM(${p}tok_entrada + ${p}tok_cache_leitura + ${p}tok_cache_escrita + ${p}tok_saida + ${p}tok_audio) AS tok_total,
                SUM(${p}mensagens) AS mensagens, SUM(${p}imagens) AS imagens, SUM(${p}audios) AS audios, SUM(${p}audio_segundos) AS audio_segundos,
                SUM(${p}custo_texto_micro) AS custo_texto, SUM(${p}custo_imagem_micro) AS custo_imagem, SUM(${p}custo_audio_micro) AS custo_audio,
                SUM(${p}custo_texto_micro + ${p}custo_imagem_micro + ${p}custo_audio_micro) AS custo_total`;
    }

    // Mapa user_id -> metricas desde a data (YYYY-MM-DD) ou do inicio de tudo.
    static async consumoPorUsuario(desde = null) {
        const [rows] = await db.query(
            `SELECT user_id, ${this.metricas()} FROM ia_uso_diario ${desde ? 'WHERE dia >= ?' : ''} GROUP BY user_id`,
            desde ? [desde] : []
        );
        const mapa = {};
        rows.forEach((r) => { mapa[r.user_id] = r; });
        return mapa;
    }

    static async serieDiaria(desde, ate) {
        const [rows] = await db.query(
            `SELECT DATE_FORMAT(dia, '%Y-%m-%d') AS dia, ${this.metricas()} FROM ia_uso_diario WHERE dia BETWEEN ? AND ? GROUP BY dia ORDER BY dia`,
            [desde, ate]
        );
        return rows;
    }

    static async totalPeriodo(desde, ate = null) {
        const [rows] = await db.query(
            `SELECT ${this.metricas()} FROM ia_uso_diario WHERE dia >= ? ${ate ? 'AND dia <= ?' : ''}`,
            ate ? [desde, ate] : [desde]
        );
        return rows[0];
    }

    static async usuariosNoPeriodo(desde) {
        const [rows] = await db.query(
            `SELECT u.user_id, COALESCE(us.nome, '-') AS nome, COALESCE(us.email, '(removido)') AS email, ${this.metricas('u.')}
             FROM ia_uso_diario u LEFT JOIN users us ON us.id = u.user_id WHERE u.dia >= ? GROUP BY u.user_id, us.nome, us.email`,
            [desde]
        );
        return rows;
    }

    // ---- Creditos comprados (informados manualmente: a Anthropic nao expoe o saldo pela API) ----
    static async listarCreditos() {
        const [rows] = await db.query("SELECT id, valor_usd, DATE_FORMAT(data_compra, '%Y-%m-%d') AS data_compra, nota FROM ia_creditos ORDER BY data_compra DESC, id DESC");
        return rows;
    }

    static async adicionarCredito(valorUsd, dataCompra, nota) {
        await db.query('INSERT INTO ia_creditos (valor_usd, data_compra, nota) VALUES (?, ?, ?)', [valorUsd, dataCompra, nota ? String(nota).slice(0, 120) : null]);
    }

    static async excluirCredito(id) {
        await db.query('DELETE FROM ia_creditos WHERE id = ?', [id]);
    }

    static async definirNivel(userId, nivel) {
        await db.query('UPDATE users SET ia_nivel = ? WHERE id = ?', [nivel === 2 ? 2 : 1, userId]);
    }

    static async salvarPayload(id, userId, payload) {
        await db.query('UPDATE ia_acoes SET payload = ? WHERE id = ? AND user_id = ?', [JSON.stringify(payload), id, userId]);
    }

    static async definirHabilitada(userId, habilitada) {
        await db.query('UPDATE users SET ia_habilitada = ? WHERE id = ?', [habilitada ? 1 : 0, userId]);
    }
}

module.exports = Ia;
