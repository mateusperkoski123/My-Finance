const db = require('../config/db');
const Assinatura = require('./Assinatura');

// Codigo de indicacao: quem usa ganha DESCONTO_PERCENTUAL na primeira compra (plano mensal) e quem indicou recebe
// como credito metade desse desconto, abatido na proxima compra pelo Pagopar.
const DESCONTO_PERCENTUAL = 20;
const PLANOS_COM_CODIGO = ['premium', 'pro'];
// O credito nunca zera a cobranca: o Pagopar precisa de um valor a pagar.
const VALOR_MINIMO = 5000;

const normalizar = (texto) => String(texto || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const formatoValido = (codigo) => codigo.length >= 4 && codigo.length <= 20;

// Quem pode ter codigo: Premium e Pro (em teste ou pagos) e o admin. Plano vencido/cancelado/sem plano nao.
function podeTerCodigo(assinatura, ehAdmin) {
    if (ehAdmin) return true;
    return Boolean(assinatura && PLANOS_COM_CODIGO.includes(assinatura.plano_codigo) && ['trial', 'ativa', 'beta'].includes(assinatura.status_efetivo));
}

const Indicacao = {
    DESCONTO_PERCENTUAL,
    PLANOS_COM_CODIGO,
    normalizar,
    podeTerCodigo,

    async doUsuario(userId) {
        const [rows] = await db.query('SELECT * FROM codigos_indicacao WHERE user_id = ? LIMIT 1', [userId]);
        return rows[0] || null;
    },

    // Cria o codigo (um por usuario). Devolve { codigo } ou { erro: 'formato' | 'existe' | 'ja_tem' }.
    async criar(userId, texto) {
        const codigo = normalizar(texto);
        if (!formatoValido(codigo)) return { erro: 'formato' };
        if (await this.doUsuario(userId)) return { erro: 'ja_tem' };
        try {
            await db.query('INSERT INTO codigos_indicacao (user_id, codigo) VALUES (?, ?)', [userId, codigo]);
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') return { erro: (await this.doUsuario(userId)) ? 'ja_tem' : 'existe' };
            throw err;
        }
        return { codigo };
    },

    async saldo(userId) {
        const [[r]] = await db.query('SELECT COALESCE(SUM(valor), 0) AS saldo FROM indicacao_creditos WHERE user_id = ?', [userId]);
        return Math.max(0, Number(r.saldo));
    },

    // Dados da tela: codigo, quantas pessoas usaram, credito acumulado e o total ja ganho.
    async resumo(userId) {
        const [codigo, saldo] = await Promise.all([this.doUsuario(userId), this.saldo(userId)]);
        const [[r]] = await db.query('SELECT COUNT(*) AS usos, COALESCE(SUM(credito), 0) AS ganho FROM indicacoes WHERE indicador_id = ?', [userId]);
        return { codigo: codigo ? codigo.codigo : null, usos: Number(r.usos), ganho: Number(r.ganho), saldo };
    },

    // Confere se o codigo digitado vale para esta compra. Devolve { codigoId, desconto } ou { erro }.
    // Erros: invalido | propria | so_mensal | ja_comprou.
    async avaliar(userId, texto, plano, ciclo) {
        const codigo = normalizar(texto);
        const [rows] = await db.query('SELECT * FROM codigos_indicacao WHERE codigo = ? LIMIT 1', [codigo]);
        const c = rows[0];
        if (!c) return { erro: 'invalido' };
        if (c.user_id === userId) return { erro: 'propria' };
        const [[dono]] = await db.query("SELECT role, status FROM users WHERE id = ?", [c.user_id]);
        if (!dono || dono.status !== 'ativo') return { erro: 'invalido' };
        if (!podeTerCodigo(await Assinatura.obter(c.user_id), dono.role === 'admin')) return { erro: 'invalido' };
        if (ciclo !== 'mensal') return { erro: 'so_mensal' };
        const [[pagou]] = await db.query("SELECT COUNT(*) AS n FROM pagamentos WHERE user_id = ? AND status = 'pago'", [userId]);
        const [[usou]] = await db.query('SELECT COUNT(*) AS n FROM indicacoes WHERE indicado_id = ?', [userId]);
        if (Number(pagou.n) > 0 || Number(usou.n) > 0) return { erro: 'ja_comprou' };
        const desconto = Math.round(Number(plano.preco_mensal) * DESCONTO_PERCENTUAL / 100);
        return { codigoId: c.id, desconto };
    },

    // Quanto do credito pode abater desta compra (a cobranca final nao cai abaixo de VALOR_MINIMO).
    async creditoParaUsar(userId, valorAposDesconto) {
        const saldo = await this.saldo(userId);
        return Math.max(0, Math.min(saldo, valorAposDesconto - VALOR_MINIMO));
    },

    // Chamado quando o pagamento do pedido e confirmado (uma unica vez por pedido): baixa o credito usado
    // e, se o pedido tinha codigo, registra a indicacao e credita metade do desconto a quem indicou.
    async confirmarPagamento(pedido) {
        const usado = Number(pedido.credito_usado) || 0;
        if (usado > 0) {
            const baixa = Math.min(usado, await this.saldo(pedido.user_id));
            if (baixa > 0) await db.query("INSERT INTO indicacao_creditos (user_id, valor, tipo, ref_id) VALUES (?, ?, 'uso', ?)", [pedido.user_id, -baixa, pedido.id]);
        }
        const desconto = Number(pedido.desconto) || 0;
        if (!pedido.codigo_id || desconto <= 0) return;
        const [[c]] = await db.query('SELECT user_id FROM codigos_indicacao WHERE id = ?', [pedido.codigo_id]);
        if (!c) return;
        const credito = Math.floor(desconto / 2);
        const [r] = await db.query(
            'INSERT IGNORE INTO indicacoes (codigo_id, indicador_id, indicado_id, desconto, credito) VALUES (?, ?, ?, ?, ?)',
            [pedido.codigo_id, c.user_id, pedido.user_id, desconto, credito]
        );
        if (r.affectedRows === 1 && credito > 0) {
            await db.query("INSERT INTO indicacao_creditos (user_id, valor, tipo, ref_id) VALUES (?, ?, 'indicacao', ?)", [c.user_id, credito, r.insertId]);
        }
    }
};

module.exports = Indicacao;
