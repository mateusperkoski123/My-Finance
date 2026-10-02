const db = require('../config/db');
const { TRIAL_DIAS, CICLOS } = require('../core/negocio');

const SELECT_BASE = `
    SELECT a.*, p.codigo AS plano_codigo, p.nome AS plano_nome, p.preco_mensal, p.preco_anual,
           p.moeda AS plano_moeda, p.max_contas, p.rec_relatorio_anual, p.rec_exportar, p.rec_backup,
           p.rec_ia, p.rec_ia_midia, p.rec_ia_nivel2, p.rec_offline, p.ia_limite_mes,
           TIMESTAMPDIFF(HOUR, NOW(), a.trial_fim) AS horas_trial,
           DATEDIFF(a.periodo_fim, CURDATE()) AS dias_periodo,
           ps.codigo AS solicitado_codigo
    FROM assinaturas a
    JOIN planos p ON p.id = a.plano_id
    LEFT JOIN planos ps ON ps.id = a.plano_solicitado_id`;

// Estado efetivo: considera vencimento de trial/periodo pago.
function calcularEstado(a) {
    if (!a) return null;
    let status = a.status;
    let diasRestantes = null;
    if (status === 'trial') {
        if (a.horas_trial === null || a.horas_trial <= 0) status = 'vencida';
        else diasRestantes = Math.max(1, Math.ceil(a.horas_trial / 24));
    } else if (status === 'ativa') {
        if (a.dias_periodo === null || a.dias_periodo < 0) status = 'vencida';
        else diasRestantes = a.dias_periodo;
    }
    const somenteLeitura = status === 'vencida' || status === 'cancelada';
    return {
        ...a,
        status_efetivo: status,
        dias_restantes: diasRestantes,
        somente_leitura: somenteLeitura,
        plano: {
            codigo: a.plano_codigo, nome: a.plano_nome, max_contas: a.max_contas,
            rec_relatorio_anual: !!a.rec_relatorio_anual, rec_exportar: !!a.rec_exportar, rec_backup: !!a.rec_backup,
            rec_ia: !!a.rec_ia, rec_ia_midia: !!a.rec_ia_midia, rec_ia_nivel2: !!a.rec_ia_nivel2, rec_offline: !!a.rec_offline,
            ia_limite_mes: a.ia_limite_mes
        }
    };
}

class Assinatura {
    static async listarPlanos() {
        const [rows] = await db.query('SELECT * FROM planos WHERE ativo = 1 ORDER BY ordem');
        return rows;
    }

    static async planoPorCodigo(codigo) {
        const [rows] = await db.query('SELECT * FROM planos WHERE codigo = ? AND ativo = 1 LIMIT 1', [codigo]);
        return rows[0] || null;
    }

    static async obter(userId) {
        const [rows] = await db.query(`${SELECT_BASE} WHERE a.user_id = ? LIMIT 1`, [userId]);
        return calcularEstado(rows[0]);
    }

    // Garante que todo usuario tem assinatura (cadastro novo = trial; legado sem linha = beta).
    static async garantir(userId, status = 'trial') {
        let a = await this.obter(userId);
        if (a) return a;
        if (status === 'beta') await this.criarBeta(userId);
        else await this.iniciarTrial(userId);
        return this.obter(userId);
    }

    static async iniciarTrial(userId) {
        await db.query(
            `INSERT IGNORE INTO assinaturas (user_id, plano_id, status, trial_inicio, trial_fim)
             VALUES (?, (SELECT id FROM planos WHERE codigo = 'prueba'), 'trial', NOW(), DATE_ADD(NOW(), INTERVAL ? DAY))`,
            [userId, TRIAL_DIAS]
        );
    }

    static async criarBeta(userId) {
        await db.query(
            `INSERT IGNORE INTO assinaturas (user_id, plano_id, status, trial_inicio, periodo_inicio)
             VALUES (?, (SELECT id FROM planos WHERE codigo = 'prueba'), 'beta', NOW(), CURDATE())`,
            [userId]
        );
    }

    // O usuario pede um plano; o acesso nao muda ate o pagamento ser registrado.
    static async solicitar(userId, planoCodigo, ciclo) {
        const plano = await this.planoPorCodigo(planoCodigo);
        if (!plano || plano.codigo === 'prueba' || !CICLOS.includes(ciclo)) return null;
        await this.garantir(userId);
        await db.query(
            'UPDATE assinaturas SET plano_solicitado_id = ?, ciclo_solicitado = ?, solicitado_em = NOW() WHERE user_id = ?',
            [plano.id, ciclo, userId]
        );
        return plano;
    }

    // Registra um pagamento e ativa/renova o plano. Serve para registro manual hoje e para
    // gateways amanha (o webhook so precisa chamar esta funcao).
    static async ativar(userId, planoCodigo, ciclo, { metodo = 'manual', referencia = null, valor = null, observacao = null, registradoPor = null, gateway = null, gatewayRef = null } = {}) {
        const plano = await this.planoPorCodigo(planoCodigo);
        if (!plano || plano.codigo === 'prueba' || !CICLOS.includes(ciclo)) throw new Error('Plano ou ciclo invalido.');
        await this.garantir(userId);
        const meses = ciclo === 'anual' ? 12 : 1;
        const preco = ciclo === 'anual' ? plano.preco_anual : plano.preco_mensal;
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            // A ordem dos SET importa: periodo_* usam o status/periodo_fim anteriores.
            await conn.query(
                `UPDATE assinaturas SET
                    periodo_inicio = IF(status = 'ativa' AND periodo_fim >= CURDATE(), periodo_inicio, CURDATE()),
                    periodo_fim = DATE_ADD(IF(status = 'ativa' AND periodo_fim >= CURDATE(), periodo_fim, CURDATE()), INTERVAL ? MONTH),
                    plano_id = ?, ciclo = ?, status = 'ativa', cancelada_em = NULL,
                    plano_solicitado_id = NULL, ciclo_solicitado = NULL, solicitado_em = NULL,
                    gateway = COALESCE(?, gateway), gateway_ref = COALESCE(?, gateway_ref)
                 WHERE user_id = ?`,
                [meses, plano.id, ciclo, gateway, gatewayRef, userId]
            );
            const [[ass]] = await conn.query('SELECT id FROM assinaturas WHERE user_id = ?', [userId]);
            await conn.query(
                `INSERT INTO pagamentos (user_id, assinatura_id, plano_id, ciclo, valor, moeda, metodo, status, referencia, gateway, gateway_ref, observacao, pago_em, registrado_por)
                 VALUES (?, ?, ?, ?, ?, ?, ?, 'pago', ?, ?, ?, ?, NOW(), ?)`,
                [userId, ass.id, plano.id, ciclo, valor !== null ? valor : preco, plano.moeda, metodo, referencia, gateway, gatewayRef, observacao, registradoPor]
            );
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    static async estenderTrial(userId, dias) {
        await this.garantir(userId);
        await db.query(
            `UPDATE assinaturas SET status = 'trial', plano_id = (SELECT id FROM planos WHERE codigo = 'prueba'),
                trial_inicio = COALESCE(trial_inicio, NOW()),
                trial_fim = DATE_ADD(GREATEST(NOW(), COALESCE(trial_fim, NOW())), INTERVAL ? DAY), cancelada_em = NULL
             WHERE user_id = ? AND status IN ('trial', 'vencida', 'cancelada')`,
            [dias, userId]
        );
    }

    static async cancelar(userId) {
        await db.query("UPDATE assinaturas SET status = 'cancelada', cancelada_em = NOW() WHERE user_id = ?", [userId]);
    }

    static async historicoPagamentos(userId) {
        const [rows] = await db.query(
            `SELECT pg.*, p.codigo AS plano_codigo FROM pagamentos pg LEFT JOIN planos p ON p.id = pg.plano_id
             WHERE pg.user_id = ? ORDER BY pg.created_at DESC LIMIT 50`, [userId]);
        return rows;
    }

    // ---- Admin ----
    static async listarUsuariosAdmin({ busca = '', limite = 200, arquivados = false, vence = '' } = {}) {
        const like = `%${busca}%`;
        const [rows] = await db.query(
            `SELECT u.id, u.nome, u.email, u.role, u.status AS user_status, u.created_at, u.ultimo_login_em,
                    CASE WHEN u.ultimo_login_em IS NULL AND u.ultimo_acesso_em IS NULL THEN NULL
                         ELSE GREATEST(COALESCE(u.ultimo_login_em, '1970-01-01 00:00:00'), COALESCE(u.ultimo_acesso_em, '1970-01-01 00:00:00')) END AS ultimo_acesso,
                    u.email_verificado_em, u.ia_habilitada, u.ia_nivel, u.origem, u.google_id IS NOT NULL AS via_google,
                    a.status AS ass_status, a.ciclo, a.trial_fim, a.periodo_fim, a.ciclo_solicitado,
                    p.codigo AS plano_codigo, ps.codigo AS solicitado_codigo,
                    TIMESTAMPDIFF(HOUR, NOW(), a.trial_fim) AS horas_trial,
                    DATEDIFF(a.periodo_fim, CURDATE()) AS dias_periodo
             FROM users u
             LEFT JOIN assinaturas a ON a.user_id = u.id
             LEFT JOIN planos p ON p.id = a.plano_id
             LEFT JOIN planos ps ON ps.id = a.plano_solicitado_id
             WHERE (u.email LIKE ? OR u.nome LIKE ?) AND u.status ${arquivados ? '=' : '<>'} 'arquivado'
             ORDER BY (a.plano_solicitado_id IS NOT NULL) DESC, u.created_at DESC
             LIMIT ?`, [like, like, limite]);
        const lista = rows.map((r) => {
            const e = calcularEstado({ status: r.ass_status, horas_trial: r.horas_trial, dias_periodo: r.dias_periodo });
            return { ...r, status_efetivo: e ? e.status_efetivo : 'sem', dias_restantes: e ? e.dias_restantes : null };
        });
        // Filtro por vencimento: "ate N dias" (teste/plano pago que vence em N dias ou menos), "vencido" ou "sem vencimento".
        const n = parseInt(vence, 10);
        if (n > 0) {
            return lista.filter((u) => u.dias_restantes !== null && u.dias_restantes <= n).sort((a, b) => a.dias_restantes - b.dias_restantes);
        }
        if (vence === 'vencido') return lista.filter((u) => u.status_efetivo === 'vencida');
        if (vence === 'sem') return lista.filter((u) => ['beta', 'sem'].includes(u.status_efetivo));
        return lista;
    }

    static async metricas() {
        const [[u]] = await db.query(
            `SELECT COUNT(*) total,
                    SUM(created_at >= DATE_SUB(NOW(), INTERVAL 7 DAY)) novos_7d,
                    SUM(created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)) novos_30d,
                    SUM(status = 'suspenso') suspensos
             FROM users WHERE status <> 'arquivado'`);
        const [[{ arquivados }]] = await db.query(`SELECT COUNT(*) AS arquivados FROM users WHERE status = 'arquivado'`);
        const [[s]] = await db.query(
            `SELECT SUM(status = 'beta') beta,
                    SUM(status = 'trial' AND trial_fim > NOW()) trial,
                    SUM((status = 'trial' AND trial_fim <= NOW()) OR (status = 'ativa' AND periodo_fim < CURDATE())) vencidas,
                    SUM(status = 'ativa' AND periodo_fim >= CURDATE()) ativas,
                    SUM(status = 'cancelada') canceladas,
                    SUM(plano_solicitado_id IS NOT NULL) solicitacoes
             FROM assinaturas`);
        const [[mrr]] = await db.query(
            `SELECT COALESCE(SUM(IF(a.ciclo = 'anual', p.preco_anual / 12, p.preco_mensal)), 0) AS mrr
             FROM assinaturas a JOIN planos p ON p.id = a.plano_id
             WHERE a.status = 'ativa' AND a.periodo_fim >= CURDATE()`);
        const [porPlano] = await db.query(
            `SELECT p.codigo, COUNT(*) total FROM assinaturas a JOIN planos p ON p.id = a.plano_id
             WHERE a.status = 'ativa' AND a.periodo_fim >= CURDATE() GROUP BY p.codigo`);
        const [[rec]] = await db.query(
            `SELECT COALESCE(SUM(valor), 0) AS total FROM pagamentos
             WHERE status = 'pago' AND pago_em >= DATE_FORMAT(NOW(), '%Y-%m-01')`);
        return { usuarios: { ...u, arquivados: Number(arquivados) }, assinaturas: s, mrr: Math.round(mrr.mrr), porPlano, receitaMes: Number(rec.total) };
    }
}

Assinatura.calcularEstado = calcularEstado;
module.exports = Assinatura;
