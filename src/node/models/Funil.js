// Funil de vendas (Admin > Funil): das contas criadas no periodo, quantas escolheram o plano de teste, registraram algo,
// pediram um plano e pagaram, agrupadas pela origem do link de divulgacao (users.utm_source / utm_campaign).
// So numeros agregados; o admin nao aparece.
const db = require('../config/db');

const PERIODOS = [7, 30, 90, 365];
const ETAPAS = ['cadastros', 'testes', 'ativos', 'pediram', 'pagaram'];

async function resumo(dias) {
    const [rows] = await db.query(
        `SELECT COALESCE(NULLIF(u.utm_source, ''), '') AS origem, COALESCE(u.utm_campaign, '') AS campanha,
                COUNT(*) AS cadastros,
                SUM(a.trial_inicio IS NOT NULL) AS testes,
                SUM(EXISTS (SELECT 1 FROM lancamentos l JOIN categorias c ON c.id = l.categoria_id AND c.sistema = 0 WHERE l.user_id = u.id)
                    OR EXISTS (SELECT 1 FROM cartao_compras cc WHERE cc.user_id = u.id)) AS ativos,
                SUM(a.solicitado_em IS NOT NULL
                    OR EXISTS (SELECT 1 FROM pagopar_pedidos pp WHERE pp.user_id = u.id)
                    OR EXISTS (SELECT 1 FROM pagamentos p WHERE p.user_id = u.id)) AS pediram,
                SUM(EXISTS (SELECT 1 FROM pagamentos p WHERE p.user_id = u.id AND p.status = 'pago')
                    OR EXISTS (SELECT 1 FROM pagopar_pedidos pp WHERE pp.user_id = u.id AND pp.estado = 'pago')) AS pagaram
         FROM users u
         LEFT JOIN assinaturas a ON a.user_id = u.id
         WHERE u.created_at >= NOW() - INTERVAL ? DAY AND u.role <> 'admin'
         GROUP BY origem, campanha
         ORDER BY cadastros DESC, origem, campanha`,
        [dias]
    );
    const grupos = rows.map((r) => {
        const g = { origem: r.origem, campanha: r.campanha };
        ETAPAS.forEach((e) => { g[e] = Number(r[e]) || 0; });
        return g;
    });
    const total = { origem: null, campanha: null };
    ETAPAS.forEach((e) => { total[e] = grupos.reduce((s, g) => s + g[e], 0); });
    return { dias, grupos, total };
}

module.exports = { resumo, PERIODOS, ETAPAS };
