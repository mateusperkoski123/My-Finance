const db = require('../config/db');
const { TRIAL_DIAS, CICLOS, PLANOS_VENDA } = require('../core/negocio');
const Estatisticas = require('./Estatisticas');

const SELECT_BASE = `
    SELECT a.*, p.codigo AS plano_codigo, p.nome AS plano_nome, p.preco_mensal, p.preco_anual,
           p.moeda AS plano_moeda, p.max_contas, p.rec_relatorio_anual, p.rec_exportar, p.rec_backup,
           p.rec_ia, p.rec_ia_midia, p.rec_ia_nivel2, p.rec_offline, p.ia_limite_mes,
           p.rec_estado, p.rec_estado_avancado, p.ia_midia_limite_mes,
           TIMESTAMPDIFF(HOUR, NOW(), a.trial_fim) AS horas_trial,
           DATEDIFF(a.periodo_fim, CURDATE()) AS dias_periodo,
           ps.codigo AS solicitado_codigo
    FROM assinaturas a
    JOIN planos p ON p.id = a.plano_id
    LEFT JOIN planos ps ON ps.id = a.plano_solicitado_id`;

// Estado efetivo: considera vencimento do teste e do periodo pago.
//   trial            teste em andamento (do plano escolhido, ou o antigo "Plano de Teste" de 7 dias com tudo liberado)
//   escolher         ainda nao escolheu o plano do teste (conta nova, ou o teste antigo de 7 dias terminou)
//   teste_encerrado  ja usou o teste do plano escolhido e nao contratou: so resta contratar
//   ativa / vencida / cancelada  quem ja pagou; vencida e cancelada ficam em somente leitura ate pagar de novo
function calcularEstado(a) {
    if (!a) return null;
    let status = a.status;
    let diasRestantes = null;
    if (status === 'trial') {
        if (a.horas_trial === null || a.horas_trial === undefined || a.horas_trial <= 0) status = a.plano_codigo === 'prueba' ? 'escolher' : 'teste_encerrado';
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
        // Sem acesso ao sistema: so as telas de escolher/contratar um plano (ver ROTAS_LIVRES_BLOQUEIO).
        bloqueada: status === 'escolher' || status === 'teste_encerrado',
        // Teste do plano escolhido em andamento: da para trocar o plano em teste sem reiniciar o prazo.
        teste_plano: status === 'trial' && a.plano_codigo !== 'prueba',
        plano: {
            codigo: a.plano_codigo, nome: a.plano_nome, max_contas: a.max_contas,
            rec_relatorio_anual: !!a.rec_relatorio_anual, rec_exportar: !!a.rec_exportar, rec_backup: !!a.rec_backup,
            rec_ia: !!a.rec_ia, rec_ia_midia: !!a.rec_ia_midia, rec_ia_nivel2: !!a.rec_ia_nivel2, rec_offline: !!a.rec_offline,
            rec_estado: !!a.rec_estado, rec_estado_avancado: !!a.rec_estado_avancado,
            ia_limite_mes: a.ia_limite_mes, ia_midia_limite_mes: a.ia_midia_limite_mes
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

    // Garante que todo usuario tem assinatura (conta nova = "a escolher"; admin sem linha = beta).
    static async garantir(userId, status = 'pendente') {
        let a = await this.obter(userId);
        if (a) return a;
        if (status === 'beta') await this.criarBeta(userId);
        else await this.criarPendente(userId);
        return this.obter(userId);
    }

    // Conta nova: ainda sem teste. A linha fica no Plano de Teste sem prazo (estado efetivo "escolher")
    // ate a pessoa escolher o plano que quer testar.
    static async criarPendente(userId) {
        await db.query(
            `INSERT IGNORE INTO assinaturas (user_id, plano_id, status)
             VALUES (?, (SELECT id FROM planos WHERE codigo = 'prueba'), 'trial')`,
            [userId]
        );
    }

    // Comeca o teste gratis no plano escolhido. So vale uma vez: para quem esta "a escolher"
    // (conta nova ou teste antigo de 7 dias encerrado). Devolve o plano ou null.
    static async iniciarTeste(userId, planoCodigo) {
        const plano = await this.planoPorCodigo(planoCodigo);
        if (!plano || !PLANOS_VENDA.includes(plano.codigo)) return null;
        await this.garantir(userId);
        const [r] = await db.query(
            `UPDATE assinaturas SET plano_id = ?, status = 'trial', trial_inicio = NOW(), trial_fim = DATE_ADD(NOW(), INTERVAL ? DAY)
             WHERE user_id = ? AND status = 'trial' AND (trial_fim IS NULL OR trial_fim <= NOW())
               AND plano_id = (SELECT id FROM planos WHERE codigo = 'prueba')`,
            [plano.id, TRIAL_DIAS, userId]
        );
        return r.affectedRows === 1 ? plano : null;
    }

    // Troca o plano em teste enquanto o teste do plano escolhido esta em andamento. O prazo nao reinicia.
    static async trocarPlanoTeste(userId, planoCodigo) {
        const plano = await this.planoPorCodigo(planoCodigo);
        if (!plano || !PLANOS_VENDA.includes(plano.codigo)) return null;
        const [r] = await db.query(
            `UPDATE assinaturas SET plano_id = ?
             WHERE user_id = ? AND status = 'trial' AND trial_fim > NOW()
               AND plano_id <> (SELECT id FROM planos WHERE codigo = 'prueba')`,
            [plano.id, userId]
        );
        return r.affectedRows === 1 ? plano : null;
    }

    // Menor cota de registros por foto e audio acima da atual (para indicar o plano de cima quando a cota acaba).
    static async planoComMaisMidia(limiteAtual) {
        const [rows] = await db.query(
            `SELECT codigo, ia_midia_limite_mes FROM planos
             WHERE ativo = 1 AND codigo <> 'prueba' AND rec_ia = 1 AND rec_ia_midia = 1 AND ia_midia_limite_mes > ?
             ORDER BY ia_midia_limite_mes ASC LIMIT 1`,
            [Number(limiteAtual) || 0]
        );
        return rows[0] || null;
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

    // Pedidos de plano em aberto (ainda sem pagamento registrado), do mais recente ao mais antigo, com o contato do usuario.
    static async listarPedidos() {
        const [rows] = await db.query(
            `SELECT u.id AS user_id, u.nome, u.email, u.telefone_codigo, u.telefone_numero, u.status AS user_status,
                    a.ciclo_solicitado AS ciclo, a.solicitado_em, a.status AS ass_status,
                    ps.codigo AS plano_codigo, ps.preco_mensal, ps.preco_anual, pa.codigo AS plano_atual
             FROM assinaturas a
             JOIN users u ON u.id = a.user_id
             JOIN planos ps ON ps.id = a.plano_solicitado_id
             LEFT JOIN planos pa ON pa.id = a.plano_id
             WHERE u.status <> 'arquivado'
             ORDER BY a.solicitado_em DESC, a.id DESC`);
        return rows.map((r) => ({ ...r, valor: r.ciclo === 'anual' ? r.preco_anual : r.preco_mensal }));
    }

    static async descartarPedido(userId) {
        await db.query('UPDATE assinaturas SET plano_solicitado_id = NULL, ciclo_solicitado = NULL, solicitado_em = NULL WHERE user_id = ?', [userId]);
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

    // Cortesia do admin: mais dias de teste no plano em que a pessoa esta (quem ainda nao escolheu fica com tudo liberado).
    static async estenderTrial(userId, dias) {
        await this.garantir(userId);
        await db.query(
            `UPDATE assinaturas SET status = 'trial',
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
    // ordenar: '' (pedidos de plano primeiro, depois os mais novos), 'lanc_30d' ou 'lanc_total' (quem mais registrou transacoes).
    static async listarUsuariosAdmin({ busca = '', limite = 200, arquivados = false, vence = '', ordenar = '' } = {}) {
        const like = `%${busca}%`;
        const ordem = ordenar === 'lanc_30d' ? 'lanc_30d DESC, lanc_total DESC, u.created_at DESC'
            : ordenar === 'lanc_total' ? 'lanc_total DESC, lanc_30d DESC, u.created_at DESC'
            : '(a.plano_solicitado_id IS NOT NULL) DESC, u.created_at DESC';
        const [rows] = await db.query(
            `SELECT u.id, u.nome, u.email, u.role, u.status AS user_status, u.created_at, u.ultimo_login_em,
                    CASE WHEN u.ultimo_login_em IS NULL AND u.ultimo_acesso_em IS NULL THEN NULL
                         ELSE GREATEST(COALESCE(u.ultimo_login_em, '1970-01-01 00:00:00'), COALESCE(u.ultimo_acesso_em, '1970-01-01 00:00:00')) END AS ultimo_acesso,
                    u.telefone_codigo, u.telefone_numero,
                    u.email_verificado_em, u.ia_habilitada, u.ia_nivel, u.origem, u.google_id IS NOT NULL AS via_google,
                    a.status AS ass_status, a.ciclo, a.trial_fim, a.periodo_fim, a.ciclo_solicitado,
                    p.codigo AS plano_codigo, ps.codigo AS solicitado_codigo,
                    TIMESTAMPDIFF(HOUR, NOW(), a.trial_fim) AS horas_trial,
                    DATEDIFF(a.periodo_fim, CURDATE()) AS dias_periodo,
                    COALESCE(lx.total, 0) AS lanc_total, COALESCE(lx.recentes, 0) AS lanc_30d
             FROM users u
             LEFT JOIN assinaturas a ON a.user_id = u.id
             LEFT JOIN planos p ON p.id = a.plano_id
             LEFT JOIN planos ps ON ps.id = a.plano_solicitado_id
             LEFT JOIN (${Estatisticas.transacoesPorUsuarioSql()}) lx ON lx.user_id = u.id
             WHERE (u.email LIKE ? OR u.nome LIKE ?) AND u.status ${arquivados ? '=' : '<>'} 'arquivado'
             ORDER BY ${ordem}
             LIMIT ?`, [await Estatisticas.inicioAtividade(), like, like, limite]);
        const lista = rows.map((r) => {
            // Usuario sem linha em "assinaturas" (ass_status nulo) aparece como "sem assinatura".
            const e = r.ass_status ? calcularEstado({ status: r.ass_status, plano_codigo: r.plano_codigo, horas_trial: r.horas_trial, dias_periodo: r.dias_periodo }) : null;
            return { ...r, lanc_total: Number(r.lanc_total) || 0, lanc_30d: Number(r.lanc_30d) || 0, status_efetivo: e ? e.status_efetivo : 'sem', dias_restantes: e ? e.dias_restantes : null };
        });
        // Filtro por vencimento: "ate N dias" (teste/plano pago que vence em N dias ou menos), "vencido" ou "sem vencimento".
        const n = parseInt(vence, 10);
        if (n > 0) {
            const filtrada = lista.filter((u) => u.dias_restantes !== null && u.dias_restantes <= n);
            return ordenar ? filtrada : filtrada.sort((a, b) => a.dias_restantes - b.dias_restantes);
        }
        if (vence === 'vencido') return lista.filter((u) => ['vencida', 'teste_encerrado'].includes(u.status_efetivo));
        if (vence === 'sem') return lista.filter((u) => ['beta', 'sem', 'escolher'].includes(u.status_efetivo));
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
        // escolher = ainda sem plano de teste escolhido; teste_encerrado = usou o teste e nao contratou; vencidas = ja pagou e venceu.
        const [[s]] = await db.query(
            `SELECT SUM(a.status = 'beta') beta,
                    SUM(a.status = 'trial' AND a.trial_fim > NOW()) trial,
                    SUM(a.status = 'trial' AND p.codigo = 'prueba' AND (a.trial_fim IS NULL OR a.trial_fim <= NOW())) escolher,
                    SUM(a.status = 'trial' AND p.codigo <> 'prueba' AND a.trial_fim <= NOW()) teste_encerrado,
                    SUM(a.status = 'ativa' AND a.periodo_fim < CURDATE()) vencidas,
                    SUM(a.status = 'ativa' AND a.periodo_fim >= CURDATE()) ativas,
                    SUM(a.status = 'cancelada') canceladas,
                    SUM(a.plano_solicitado_id IS NOT NULL) solicitacoes
             FROM assinaturas a JOIN planos p ON p.id = a.plano_id`);
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
