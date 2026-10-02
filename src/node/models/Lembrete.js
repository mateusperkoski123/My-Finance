const db = require('../config/db');
const crypto = require('crypto');

const MAX_APARELHOS = 10;

class Lembrete {
    static async config(userId) {
        const [rows] = await db.query('SELECT * FROM lembretes_config WHERE user_id = ? LIMIT 1', [userId]);
        return rows[0] || null;
    }

    static async salvarConfig(userId, { ativo, hora, avisoDia, avisoAntes, fuso, proximoEnvio }) {
        await db.query(
            `INSERT INTO lembretes_config (user_id, ativo, hora, aviso_dia, aviso_antes, fuso, proximo_envio)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE ativo = VALUES(ativo), hora = VALUES(hora), aviso_dia = VALUES(aviso_dia),
                aviso_antes = VALUES(aviso_antes), fuso = VALUES(fuso), proximo_envio = VALUES(proximo_envio)`,
            [userId, ativo ? 1 : 0, hora, avisoDia ? 1 : 0, avisoAntes ? 1 : 0, fuso, ativo ? proximoEnvio : null]
        );
    }

    // Quem esta com o horario vencido (proximo_envio <= agora), com idioma e moeda da conta.
    static async devidos(agoraMs, limite = 200) {
        const [rows] = await db.query(
            `SELECT c.*, u.idioma, u.moeda FROM lembretes_config c
             JOIN users u ON u.id = c.user_id AND u.status = 'ativo'
             WHERE c.ativo = 1 AND c.proximo_envio IS NOT NULL AND c.proximo_envio <= ?
             ORDER BY c.proximo_envio ASC LIMIT ?`,
            [agoraMs, limite]
        );
        return rows;
    }

    // Reserva o envio: so uma execucao do cron consegue trocar o proximo_envio antigo pelo novo (evita aviso duplicado).
    static async reservar(userId, antigoMs, novoMs) {
        const [res] = await db.query(
            'UPDATE lembretes_config SET proximo_envio = ?, ultimo_envio_em = NOW() WHERE user_id = ? AND ativo = 1 AND proximo_envio = ?',
            [novoMs, userId, antigoMs]
        );
        return res.affectedRows === 1;
    }

    static async inscricoes(userId) {
        const [rows] = await db.query('SELECT * FROM push_inscricoes WHERE user_id = ? ORDER BY id', [userId]);
        return rows;
    }

    static hashEndpoint(endpoint) {
        return crypto.createHash('sha256').update(String(endpoint)).digest('hex');
    }

    // Registra (ou atualiza) o aparelho. O mesmo endpoint passa a pertencer ao usuario que acabou de entrar.
    static async inscrever(userId, { endpoint, p256dh, auth, nome }) {
        const hash = this.hashEndpoint(endpoint);
        const [existe] = await db.query('SELECT id FROM push_inscricoes WHERE endpoint_hash = ? LIMIT 1', [hash]);
        if (!existe.length) {
            const [[n]] = await db.query('SELECT COUNT(*) AS n FROM push_inscricoes WHERE user_id = ?', [userId]);
            if (n.n >= MAX_APARELHOS) {
                await db.query('DELETE FROM push_inscricoes WHERE user_id = ? ORDER BY id ASC LIMIT ?', [userId, n.n - MAX_APARELHOS + 1]);
            }
        }
        await db.query(
            `INSERT INTO push_inscricoes (user_id, endpoint_hash, endpoint, chave_p256dh, chave_auth, nome)
             VALUES (?, ?, ?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), chave_p256dh = VALUES(chave_p256dh),
                chave_auth = VALUES(chave_auth), nome = VALUES(nome)`,
            [userId, hash, endpoint, p256dh, auth, nome || null]
        );
    }

    static async removerPorEndpoint(userId, endpoint) {
        await db.query('DELETE FROM push_inscricoes WHERE user_id = ? AND endpoint_hash = ?', [userId, this.hashEndpoint(endpoint)]);
    }

    static async removerPorId(id) {
        await db.query('DELETE FROM push_inscricoes WHERE id = ?', [id]);
    }

    static async marcarEnviada(id) {
        await db.query('UPDATE push_inscricoes SET ultimo_envio_em = NOW() WHERE id = ?', [id]);
    }

    // Despesas pendentes (contas ativas) com vencimento na data. Transferencias ficam de fora.
    static async despesasDoDia(userId, dataYMD) {
        const [rows] = await db.query(
            `SELECT l.id, l.descricao, ABS(l.valor) AS valor, cb.nome AS conta_nome
             FROM lancamentos l
             JOIN contas cb ON cb.id = l.conta_id AND cb.status = 'ativa'
             WHERE l.user_id = ? AND l.tipo = 'despesa' AND l.status = 'pendente' AND l.data_competencia = ?
             ORDER BY ABS(l.valor) DESC, l.id ASC`,
            [userId, dataYMD]
        );
        return rows;
    }
}

module.exports = Lembrete;
