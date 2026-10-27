const db = require('../config/db');

// Limites de gastos por mes. categoria_id = 0 e o limite geral do mes. O limite vale do mes gravado em diante, ate
// existir outra linha mais nova (valor 0 = sem limite a partir dali). Sem nenhuma linha, vale o limite_gasto da categoria.
const GERAL = 0;

class Limite {
    static get GERAL() { return GERAL; }

    // Todas as linhas do usuario ate um mes (YYYY-MM), das mais antigas para as mais novas.
    static async linhasAte(userId, anoMes) {
        const [rows] = await db.query(
            'SELECT categoria_id, ano_mes, valor FROM limites_mensais WHERE user_id = ? AND ano_mes <= ? ORDER BY ano_mes ASC',
            [userId, anoMes]
        );
        return rows.map((r) => ({ categoria_id: Number(r.categoria_id), ano_mes: r.ano_mes, valor: parseFloat(r.valor) || 0 }));
    }

    // Limite em vigor de uma categoria (ou do geral) num mes, a partir das linhas de linhasAte. Devolve null se nao ha limite.
    static valorEm(linhas, categoriaId, anoMes, padrao = null) {
        let achou = null;
        for (const l of linhas) {
            if (l.categoria_id === Number(categoriaId) && l.ano_mes <= anoMes) achou = l; // as linhas vem em ordem de mes
        }
        if (achou) return achou.valor > 0 ? achou.valor : null;
        const p = parseFloat(padrao);
        return p > 0 ? p : null;
    }

    // Define o limite a partir de um mes (valor vazio ou 0 remove). Depois alinha o limite_gasto da categoria ao do mes atual,
    // que e o que o Demonstrativo e a tela de Categorias leem.
    static async definir(userId, categoriaId, anoMes, valor, mesAtual) {
        const v = valor > 0 ? valor : 0;
        await db.query(
            `INSERT INTO limites_mensais (user_id, categoria_id, ano_mes, valor) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE valor = VALUES(valor)`,
            [userId, categoriaId, anoMes, v]
        );
        if (categoriaId === GERAL) return;
        const linhas = await this.linhasAte(userId, mesAtual);
        // Mes futuro sem nenhuma linha ate hoje: o limite atual da categoria continua como esta.
        if (!linhas.some((l) => l.categoria_id === categoriaId)) return;
        const atual = this.valorEm(linhas, categoriaId, mesAtual, null);
        await db.query('UPDATE categorias SET limite_gasto = ?, updated_at = NOW(3) WHERE id = ? AND user_id = ?', [atual, categoriaId, userId]);
    }
}

module.exports = Limite;
