const db = require('../config/db');

// Configuracao do "Financeiro" (cobrancas por inatividade). Sem registro = desligado.
class Financeiro {
    static async config(userId) {
        const [rows] = await db.query('SELECT * FROM financeiro_config WHERE user_id = ? LIMIT 1', [userId]);
        return rows[0] || { user_id: userId, ativo: 0, pausado_ate: null, fuso: null };
    }

    // Chamado quando um aparelho se inscreve: cria a linha (ligada ou nao, conforme "ativoNovo") e guarda o fuso do
    // navegador. Quem ja tem linha mantem a escolha que fez.
    static async garantir(userId, fuso, ativoNovo) {
        await db.query(
            `INSERT INTO financeiro_config (user_id, ativo, fuso) VALUES (?, ?, ?)
             ON DUPLICATE KEY UPDATE fuso = COALESCE(VALUES(fuso), fuso)`,
            [userId, ativoNovo ? 1 : 0, fuso || null]
        );
    }

    static async definirAtivo(userId, ativo) {
        await db.query(
            `INSERT INTO financeiro_config (user_id, ativo, pausado_ate) VALUES (?, ?, NULL)
             ON DUPLICATE KEY UPDATE ativo = VALUES(ativo), pausado_ate = NULL`,
            [userId, ativo ? 1 : 0]
        );
    }

    static async pausarAte(userId, ateMs) {
        await db.query(
            `INSERT INTO financeiro_config (user_id, pausado_ate) VALUES (?, ?)
             ON DUPLICATE KEY UPDATE pausado_ate = VALUES(pausado_ate)`,
            [userId, ateMs]
        );
    }

    static async retomar(userId) {
        await db.query('UPDATE financeiro_config SET pausado_ate = NULL WHERE user_id = ?', [userId]);
    }

    // Quem esta ligado, tem aparelho inscrito e com o horario vencido (ou ainda sem horario definido).
    // Fora da liberacao geral (todos = false) so admins recebem.
    static async devidos(agoraMs, todos, limite = 200) {
        const [rows] = await db.query(
            `SELECT f.*, COALESCE(f.fuso, lc.fuso) AS fuso_efetivo, u.idioma, u.role,
                    UNIX_TIMESTAMP(u.created_at) AS cadastro_ts,
                    (SELECT UNIX_TIMESTAMP(MAX(l.created_at)) FROM lancamentos l WHERE l.user_id = f.user_id) AS ultimo_ts
             FROM financeiro_config f
             JOIN users u ON u.id = f.user_id AND u.status = 'ativo'
             LEFT JOIN lembretes_config lc ON lc.user_id = f.user_id
             WHERE f.ativo = 1 AND (f.proximo_envio IS NULL OR f.proximo_envio <= ?)
               AND (u.role = 'admin' OR ?)
               AND EXISTS (SELECT 1 FROM push_inscricoes p WHERE p.user_id = f.user_id)
             ORDER BY f.proximo_envio ASC LIMIT ?`,
            [agoraMs, todos ? 1 : 0, limite]
        );
        return rows;
    }

    // Mesmos dados de devidos(), de uma pessoa so e sem filtros (usado no teste "verificar agora").
    static async paraUsuario(userId) {
        const [rows] = await db.query(
            `SELECT f.*, COALESCE(f.fuso, lc.fuso) AS fuso_efetivo, u.idioma, u.role,
                    UNIX_TIMESTAMP(u.created_at) AS cadastro_ts,
                    (SELECT UNIX_TIMESTAMP(MAX(l.created_at)) FROM lancamentos l WHERE l.user_id = f.user_id) AS ultimo_ts
             FROM financeiro_config f
             JOIN users u ON u.id = f.user_id
             LEFT JOIN lembretes_config lc ON lc.user_id = f.user_id
             WHERE f.user_id = ? LIMIT 1`,
            [userId]
        );
        return rows[0] || null;
    }

    // Reserva o envio: so uma execucao consegue trocar o proximo_envio antigo (pode ser NULL) pelo novo.
    static async reservar(userId, antigoMs, novoMs) {
        const [res] = await db.query(
            'UPDATE financeiro_config SET proximo_envio = ? WHERE user_id = ? AND ativo = 1 AND proximo_envio <=> ?',
            [novoMs, userId, antigoMs]
        );
        return res.affectedRows === 1;
    }

    static async marcarEnvio(userId, indiceMsg) {
        await db.query('UPDATE financeiro_config SET ultimo_envio_em = NOW(), ultima_msg = ? WHERE user_id = ?', [indiceMsg, userId]);
    }
}

module.exports = Financeiro;
