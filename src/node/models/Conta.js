const db = require('../config/db');

class Conta {
    static async buscarPorUsuario(userId, incluirArquivadas = false) {
        const sql = incluirArquivadas
            ? `SELECT c.*,
                      (SELECT COUNT(*) FROM lancamentos l2 WHERE l2.conta_id = c.id) AS total_lancamentos,
                      c.saldo_inicial + COALESCE((
                          SELECT SUM(l.valor) FROM lancamentos l
                          WHERE l.conta_id = c.id AND l.user_id = c.user_id AND l.status = 'pago'
                      ), 0) AS saldo_atual
               FROM contas c
               WHERE c.user_id = ?
               ORDER BY c.conta_padrao DESC, c.nome ASC`
            : `SELECT c.*,
                      (SELECT COUNT(*) FROM lancamentos l2 WHERE l2.conta_id = c.id) AS total_lancamentos,
                      c.saldo_inicial + COALESCE((
                          SELECT SUM(l.valor) FROM lancamentos l
                          WHERE l.conta_id = c.id AND l.user_id = c.user_id AND l.status = 'pago'
                      ), 0) AS saldo_atual
               FROM contas c
               WHERE c.user_id = ? AND c.status = 'ativa'
               ORDER BY c.conta_padrao DESC, c.nome ASC`;
        const [rows] = await db.query(sql, [userId]);
        return rows;
    }

    static async buscarPorId(id, userId) {
        const [rows] = await db.query(
            `SELECT c.*,
                    c.saldo_inicial + COALESCE((
                        SELECT SUM(l.valor) FROM lancamentos l
                        WHERE l.conta_id = c.id AND l.user_id = c.user_id AND l.status = 'pago'
                    ), 0) AS saldo_atual
             FROM contas c
             WHERE c.id = ? AND c.user_id = ? LIMIT 1`,
            [id, userId]
        );
        return rows[0] || null;
    }

    static async buscarPadrao(userId) {
        const [rows] = await db.query(
            `SELECT c.*,
                    c.saldo_inicial + COALESCE((
                        SELECT SUM(l.valor) FROM lancamentos l
                        WHERE l.conta_id = c.id AND l.user_id = c.user_id AND l.status = 'pago'
                    ), 0) AS saldo_atual
             FROM contas c
             WHERE c.user_id = ? AND c.conta_padrao = 1 AND c.status = 'ativa' LIMIT 1`,
            [userId]
        );
        return rows[0] || null;
    }

    static async garantirContaPadrao(userId) {
        const [padrao] = await db.query(
            "SELECT id FROM contas WHERE user_id = ? AND status = 'ativa' AND conta_padrao = 1 LIMIT 1",
            [userId]
        );
        if (!padrao || padrao.length === 0) {
            const [primeira] = await db.query(
                "SELECT id FROM contas WHERE user_id = ? AND status = 'ativa' ORDER BY id ASC LIMIT 1",
                [userId]
            );
            if (primeira && primeira.length > 0) {
                await db.query("UPDATE contas SET conta_padrao = 1 WHERE id = ?", [primeira[0].id]);
            }
        }
    }

    static async criar(userId, { nome, tipo, saldo_inicial, cor, conta_padrao = 0, e_padrao = 0 }) {
        conta_padrao = conta_padrao || e_padrao;
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [existentes] = await conn.query("SELECT id FROM contas WHERE user_id = ? AND status = 'ativa'", [userId]);
            const serPadrao = conta_padrao || (existentes.length === 0);
            if (serPadrao) {
                await conn.query('UPDATE contas SET conta_padrao = 0 WHERE user_id = ?', [userId]);
            }
            const [res] = await conn.query(
                `INSERT INTO contas (user_id, nome, tipo, saldo_inicial, cor, conta_padrao, status, created_at, updated_at) 
                 VALUES (?, ?, ?, ?, ?, ?, 'ativa', NOW(), NOW())`,
                [userId, nome, tipo || 'corrente', parseFloat(saldo_inicial) || 0, cor || '#2563eb', serPadrao ? 1 : 0]
            );
            await conn.commit();
            await this.garantirContaPadrao(userId);
            return res.insertId;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    static async atualizar(id, userId, { nome, tipo, cor, conta_padrao = 0, e_padrao = 0 }) {
        conta_padrao = conta_padrao || e_padrao;
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            if (conta_padrao) {
                await conn.query('UPDATE contas SET conta_padrao = 0 WHERE user_id = ?', [userId]);
            }
            await conn.query(
                'UPDATE contas SET nome = ?, tipo = ?, cor = ?, conta_padrao = IF(?, 1, conta_padrao), updated_at = NOW() WHERE id = ? AND user_id = ?',
                [nome, tipo, cor, conta_padrao ? 1 : 0, id, userId]
            );
            await conn.commit();
            await this.garantirContaPadrao(userId);
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    static async arquivar(id, userId) {
        await db.query("UPDATE contas SET status = 'arquivada', conta_padrao = 0, updated_at = NOW() WHERE id = ? AND user_id = ?", [id, userId]);
        await this.garantirContaPadrao(userId);
    }

    static async restaurar(id, userId) {
        await db.query("UPDATE contas SET status = 'ativa', updated_at = NOW() WHERE id = ? AND user_id = ?", [id, userId]);
        await this.garantirContaPadrao(userId);
    }

    static async excluir(id, userId) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query('DELETE FROM lancamentos WHERE conta_id = ? AND user_id = ?', [id, userId]);
            await conn.query('DELETE FROM contas WHERE id = ? AND user_id = ?', [id, userId]);
            await conn.commit();
            await this.garantirContaPadrao(userId);
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    static async definirPadrao(id, userId) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query('UPDATE contas SET conta_padrao = 0 WHERE user_id = ?', [userId]);
            await conn.query('UPDATE contas SET conta_padrao = 1 WHERE id = ? AND user_id = ?', [id, userId]);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    static async calcularSaldos(userId) {
        return this.buscarPorUsuario(userId, true);
    }

    static async extrato(id, userId) {
        const [rows] = await db.query(
            `SELECT l.*, c.nome as categoria_nome
             FROM lancamentos l
             LEFT JOIN categorias c ON l.categoria_id = c.id
             WHERE l.conta_id = ? AND l.user_id = ?
             ORDER BY l.data_competencia DESC, l.id DESC`,
            [id, userId]
        );
        return rows;
    }
}

module.exports = Conta;
