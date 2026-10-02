const db = require('../config/db');
const crypto = require('crypto');

class Dispositivo {
    static hashToken(token) {
        return crypto.createHash('sha256').update(String(token)).digest('hex');
    }

    static async criar({ userId, token, nome, plataforma = 'web_pwa' }) {
        const tokenHash = this.hashToken(token);
        const [res] = await db.query(
            `INSERT INTO dispositivos (user_id, token_hash, nome, plataforma, ultimo_uso_em, expira_em)
             VALUES (?, ?, ?, ?, NOW(), DATE_ADD(NOW(), INTERVAL ? DAY))`,
            [userId, tokenHash, nome || 'Dispositivo Móvel', plataforma, this.diasValidade()]
        );
        return { id: res.insertId, user_id: userId, nome, plataforma };
    }

    static async buscarPorToken(token) {
        if (!token) return null;
        const tokenHash = this.hashToken(token);
        const [rows] = await db.query(
            `SELECT * FROM dispositivos WHERE token_hash = ? AND revogado_em IS NULL AND (expira_em IS NULL OR expira_em > NOW()) LIMIT 1`,
            [tokenHash]
        );
        return rows[0] || null;
    }

    // Validade do token em dias (APP_TOKEN_DIAS, padrao 90). Renovada a cada uso (expiracao deslizante).
    static diasValidade() {
        return Math.min(Math.max(parseInt(process.env.APP_TOKEN_DIAS, 10) || 90, 1), 365);
    }

    static async atualizarUltimoUso(id) {
        await db.query(`UPDATE dispositivos SET ultimo_uso_em = NOW(), expira_em = DATE_ADD(NOW(), INTERVAL ? DAY) WHERE id = ?`, [this.diasValidade(), id]);
    }

    static async revogar(id, userId) {
        const [res] = await db.query(
            `UPDATE dispositivos SET revogado_em = NOW() WHERE id = ? AND user_id = ? AND revogado_em IS NULL`,
            [id, userId]
        );
        return res.affectedRows > 0;
    }

    static async listarPorUsuario(userId) {
        const [rows] = await db.query(
            `SELECT id, nome, plataforma, ultimo_uso_em, revogado_em, created_at
             FROM dispositivos
             WHERE user_id = ?
             ORDER BY id DESC`,
            [userId]
        );
        return rows;
    }
}

module.exports = Dispositivo;
