const db = require('../config/db');

// Avisos de fim do teste e de vencimento do plano (regras em core/avisos_plano.js).
class AvisoPlano {
    // Quem esta perto do fim do teste ou do periodo pago, ou passou dele ha ate 3 dias.
    // min_trial e dias_periodo usam o relogio do banco, como Assinatura.calcularEstado (a faixa dentro do app).
    static async candidatos() {
        const [rows] = await db.query(
            `SELECT u.id AS user_id, u.email, u.idioma, u.pais, u.email_verificado_em, lc.fuso,
                    a.status, p.codigo AS plano_codigo,
                    TIMESTAMPDIFF(MINUTE, NOW(), a.trial_fim) AS min_trial,
                    DATEDIFF(a.periodo_fim, CURDATE()) AS dias_periodo,
                    DATE_FORMAT(a.trial_fim, '%Y-%m-%d %H:%i') AS ref_trial,
                    DATE_FORMAT(a.periodo_fim, '%Y-%m-%d') AS ref_periodo
             FROM assinaturas a
             JOIN users u ON u.id = a.user_id AND u.status = 'ativo'
             JOIN planos p ON p.id = a.plano_id
             LEFT JOIN lembretes_config lc ON lc.user_id = u.id
             WHERE (a.status = 'trial' AND p.codigo <> 'prueba'
                    AND a.trial_fim BETWEEN NOW() - INTERVAL 3 DAY AND NOW() + INTERVAL 48 HOUR)
                OR (a.status = 'ativa'
                    AND a.periodo_fim BETWEEN CURDATE() - INTERVAL 3 DAY AND CURDATE() + INTERVAL 3 DAY)`
        );
        return rows;
    }

    // Reserva o aviso antes de enviar. Devolve o id da linha, ou null se este aviso ja saiu (ou outra instancia pegou).
    static async reservar(userId, tipo, referencia) {
        const [r] = await db.query(
            'INSERT IGNORE INTO avisos_plano (user_id, tipo, referencia) VALUES (?, ?, ?)',
            [userId, tipo, referencia]
        );
        return r.affectedRows === 1 ? r.insertId : null;
    }

    static async registrarEnvio(id, { push = 0, email = false }) {
        await db.query('UPDATE avisos_plano SET push_entregues = ?, email_enviado = ? WHERE id = ?', [Math.min(push, 255), email ? 1 : 0, id]);
    }
}

module.exports = AvisoPlano;
