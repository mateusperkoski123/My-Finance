const db = require('../config/db');

// Foto de perfil do usuario (uma por usuario), guardada no banco para sobreviver a novos deploys.
class FotoPerfil {
    static async obter(userId) {
        const [rows] = await db.query('SELECT mime, dados FROM usuario_fotos WHERE user_id = ? LIMIT 1', [userId]);
        return rows[0] || null;
    }

    static async salvar(userId, mime, dados) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query(
                'INSERT INTO usuario_fotos (user_id, mime, dados) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE mime = VALUES(mime), dados = VALUES(dados)',
                [userId, mime, dados]
            );
            await conn.query('UPDATE users SET foto_em = NOW() WHERE id = ?', [userId]);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    static async remover(userId) {
        await db.query('DELETE FROM usuario_fotos WHERE user_id = ?', [userId]);
        await db.query('UPDATE users SET foto_em = NULL WHERE id = ?', [userId]);
    }
}

module.exports = FotoPerfil;
