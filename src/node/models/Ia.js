const db = require('../config/db');

const mesAtual = () => new Date().toISOString().slice(0, 7);

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
                `SELECT id, payload, status FROM ia_acoes WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
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
        const [rows] = await db.query('SELECT * FROM ia_acoes WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
        return rows[0] || null;
    }

    // Reserva atomica: so uma requisicao consegue passar de 'pendente' para o novo status (evita registro duplicado).
    static async reservarAcao(id, userId, novoStatus) {
        const [res] = await db.query("UPDATE ia_acoes SET status = ? WHERE id = ? AND user_id = ? AND status = 'pendente'", [novoStatus, id, userId]);
        return res.affectedRows === 1;
    }

    static async liberarAcao(id, userId) {
        await db.query("UPDATE ia_acoes SET status = 'pendente' WHERE id = ? AND user_id = ?", [id, userId]);
    }

    static async vincularLancamento(id, userId, lancamentoId) {
        await db.query('UPDATE ia_acoes SET lancamento_id = ? WHERE id = ? AND user_id = ?', [lancamentoId, id, userId]);
    }

    static cartao(acao) {
        let p = {};
        try { p = JSON.parse(acao.payload); } catch (e) { p = {}; }
        if (p.kind === 'plano') {
            return { id: acao.id, status: acao.status, plano: true, operacoes: p.operacoes || [], resultados: p.resultados || null };
        }
        return {
            id: acao.id,
            status: acao.status,
            tipo: p.tipo,
            descricao: p.descricao,
            valor: p.valor,
            conta: p.conta_nome,
            categoria: p.categoria_nome,
            data: p.data_competencia,
            pago: p.status === 'pago'
        };
    }

    // ---- Uso mensal (limite por usuario) ----
    static async uso(userId) {
        const [rows] = await db.query('SELECT mensagens, tokens_in, tokens_out FROM ia_uso WHERE user_id = ? AND mes = ?', [userId, mesAtual()]);
        return rows[0] || { mensagens: 0, tokens_in: 0, tokens_out: 0 };
    }

    static async registrarUso(userId, tokensIn, tokensOut) {
        await db.query(
            `INSERT INTO ia_uso (user_id, mes, mensagens, tokens_in, tokens_out) VALUES (?, ?, 1, ?, ?)
             ON DUPLICATE KEY UPDATE mensagens = mensagens + 1, tokens_in = tokens_in + VALUES(tokens_in), tokens_out = tokens_out + VALUES(tokens_out)`,
            [userId, mesAtual(), tokensIn, tokensOut]
        );
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
