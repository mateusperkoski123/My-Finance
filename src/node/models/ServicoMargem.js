// Custo e margem de um servico do modulo Clientes.
// Receita = cuotas (lancamentos de receita) dos contratos do servico. Custo = despesas da categoria de custo do servico
// (`cliente_servicos.categoria_custo_id`) e das subcategorias dela, pagas e pendentes. So entra a moeda dos contratos do servico
// (moedas diferentes nao se somam). Contas arquivadas continuam entrando: o custo e a receita existem mesmo que a conta tenha sido guardada.
const db = require('../config/db');

const ND = '%Y-%m-%d';
const chaveMes = (ano, mes) => `${ano}-${String(mes).padStart(2, '0')}`;
const num = (v) => parseFloat(v) || 0;

// Primeiro e ultimo dia do mes (ano, mes 1-12), em texto YYYY-MM-DD.
function limitesDoMes(ano, mes) {
    const ultimo = new Date(ano, mes, 0).getDate();
    return { inicio: `${chaveMes(ano, mes)}-01`, fim: `${chaveMes(ano, mes)}-${String(ultimo).padStart(2, '0')}` };
}

// Os `n` meses que terminam em (ano, mes), do mais antigo ao mais novo.
function ultimosMeses(ano, mes, n) {
    const lista = [];
    for (let i = n - 1; i >= 0; i--) {
        const d = new Date(ano, mes - 1 - i, 1);
        lista.push({ ano: d.getFullYear(), mes: d.getMonth() + 1, chave: chaveMes(d.getFullYear(), d.getMonth() + 1) });
    }
    return lista;
}

class ServicoMargem {
    // `servico` ja vem de Cliente.buscarServico (do proprio usuario). `hoje` em YYYY-MM-DD (para marcar o que esta atrasado).
    static async detalhe(userId, servico, { ano, mes, hoje }) {
        const meses = ultimosMeses(ano, mes, 6);
        const janela = { inicio: limitesDoMes(meses[0].ano, meses[0].mes).inicio, fim: limitesDoMes(ano, mes).fim };
        const atual = limitesDoMes(ano, mes);
        const anterior = meses[meses.length - 2];

        // Moeda do servico = a da conta do primeiro contrato (sem contrato nenhum, nao filtra).
        const [[m]] = await db.query(
            `SELECT cb.moeda FROM cliente_contratos k JOIN contas cb ON cb.id = k.conta_id
             WHERE k.user_id = ? AND k.servico_id = ? ORDER BY k.id LIMIT 1`, [userId, servico.id]);
        const moeda = m ? m.moeda : null;
        const filtroMoeda = moeda ? ' AND cb.moeda = ?' : '';
        const parMoeda = moeda ? [moeda] : [];

        // Receita por mes (ultimos 6 meses)
        const [rec] = await db.query(
            `SELECT DATE_FORMAT(l.data_competencia, '%Y-%m') AS ym, COUNT(DISTINCT l.contrato_id) AS clientes,
                    COALESCE(SUM(l.valor), 0) AS total,
                    COALESCE(SUM(CASE WHEN l.status = 'pago' THEN l.valor ELSE 0 END), 0) AS recebido
             FROM lancamentos l
             JOIN cliente_contratos k ON k.id = l.contrato_id AND k.servico_id = ?
             JOIN contas cb ON cb.id = l.conta_id
             WHERE l.user_id = ? AND l.tipo = 'receita' AND l.data_competencia BETWEEN ? AND ?${filtroMoeda}
             GROUP BY ym`,
            [servico.id, userId, janela.inicio, janela.fim, ...parMoeda]
        );
        const recPorMes = new Map(rec.map((r) => [r.ym, r]));

        // Custo por mes (ultimos 6 meses): a categoria de custo e as subcategorias dela
        let cusPorMes = new Map();
        let itens = [];
        if (servico.categoria_custo_id) {
            const [cus] = await db.query(
                `SELECT DATE_FORMAT(l.data_competencia, '%Y-%m') AS ym, COALESCE(SUM(ABS(l.valor)), 0) AS total,
                        COALESCE(SUM(CASE WHEN l.status = 'pago' THEN ABS(l.valor) ELSE 0 END), 0) AS pago
                 FROM lancamentos l
                 JOIN categorias c ON c.id = l.categoria_id
                 JOIN contas cb ON cb.id = l.conta_id
                 WHERE l.user_id = ? AND l.tipo = 'despesa' AND (c.id = ? OR c.parent_id = ?) AND l.data_competencia BETWEEN ? AND ?${filtroMoeda}
                 GROUP BY ym`,
                [userId, servico.categoria_custo_id, servico.categoria_custo_id, janela.inicio, janela.fim, ...parMoeda]
            );
            cusPorMes = new Map(cus.map((r) => [r.ym, r]));

            // Itens de custo: cada subcategoria (ou a propria categoria, se nao tiver subs), com o mes escolhido e o anterior
            const [cats] = await db.query(
                `SELECT c.id, c.nome, c.parent_id FROM categorias c
                 WHERE c.user_id = ? AND (c.id = ? OR c.parent_id = ?) AND (c.status = 'ativa' OR EXISTS
                     (SELECT 1 FROM lancamentos x WHERE x.categoria_id = c.id AND x.data_competencia BETWEEN ? AND ?))
                 ORDER BY (c.id = ?) DESC, c.nome`,
                [userId, servico.categoria_custo_id, servico.categoria_custo_id, janela.inicio, janela.fim, servico.categoria_custo_id]
            );
            const [lan] = await db.query(
                `SELECT l.categoria_id, DATE_FORMAT(l.data_competencia, '%Y-%m') AS ym, ABS(l.valor) AS valor, l.status, DATE_FORMAT(l.data_competencia, '${ND}') AS data
                 FROM lancamentos l JOIN contas cb ON cb.id = l.conta_id
                 WHERE l.user_id = ? AND l.tipo = 'despesa' AND l.categoria_id IN (?) AND l.data_competencia BETWEEN ? AND ?${filtroMoeda}`,
                [userId, cats.map((c) => c.id).concat([0]), limitesDoMes(anterior.ano, anterior.mes).inicio, atual.fim, ...parMoeda]
            );
            const temSubs = cats.some((c) => c.parent_id);
            itens = cats
                .filter((c) => !(temSubs && c.id === servico.categoria_custo_id)) // com subs, a propria categoria so soma o que for lancado direto nela (abaixo)
                .map((c) => ({ id: c.id, nome: c.nome }));
            // Lancamento direto na categoria pai (quando ela tem subs) aparece como "Sem subcategoria"
            const diretos = lan.filter((x) => x.categoria_id === servico.categoria_custo_id);
            if (temSubs && diretos.length) itens.push({ id: servico.categoria_custo_id, nome: null, direto: true });
            for (const it of itens) {
                const meus = lan.filter((x) => x.categoria_id === it.id);
                const doMes = meus.filter((x) => x.ym === chaveMes(ano, mes));
                const doAnt = meus.filter((x) => x.ym === anterior.chave);
                it.valor = doMes.reduce((s, x) => s + num(x.valor), 0);
                it.anterior = doAnt.reduce((s, x) => s + num(x.valor), 0);
                it.variacao = it.valor - it.anterior;
                it.dia = doMes.length ? parseInt(doMes[0].data.slice(8, 10), 10) : null;
                it.estado = !doMes.length ? null : (doMes.every((x) => x.status === 'pago') ? 'pago' : (doMes.some((x) => x.data < hoje && x.status !== 'pago') ? 'atrasado' : 'pendente'));
            }
        }

        // Clientes (cuotas) do mes escolhido
        const [cuotas] = await db.query(
            `SELECT l.id, c.id AS cliente_id, c.nome AS cliente, l.valor, l.status, l.cuota_num,
                    DATE_FORMAT(l.data_competencia, '${ND}') AS data, k.id AS contrato_id
             FROM lancamentos l
             JOIN cliente_contratos k ON k.id = l.contrato_id AND k.servico_id = ?
             JOIN clientes c ON c.id = k.cliente_id
             JOIN contas cb ON cb.id = l.conta_id
             WHERE l.user_id = ? AND l.tipo = 'receita' AND l.data_competencia BETWEEN ? AND ?${filtroMoeda}
             ORDER BY l.data_competencia, c.nome`,
            [servico.id, userId, atual.inicio, atual.fim, ...parMoeda]
        );
        const clientes = cuotas.map((q) => ({
            id: q.cliente_id, nome: q.cliente, valor: num(q.valor), data: q.data, dia: parseInt(q.data.slice(8, 10), 10),
            estado: q.status === 'pago' ? 'pago' : (q.data < hoje ? 'atrasado' : 'pendente')
        }));

        // Resumo do mes escolhido e historico
        const r = recPorMes.get(chaveMes(ano, mes)) || { clientes: 0, total: 0, recebido: 0 };
        const receita = num(r.total), recebido = num(r.recebido), nClientes = Number(r.clientes) || 0;
        const custo = num((cusPorMes.get(chaveMes(ano, mes)) || {}).total);
        const margem = receita - custo;
        const cuotaMedia = nClientes ? receita / nClientes : 0;
        const equilibrio = cuotaMedia > 0 && custo > 0 ? Math.ceil(custo / cuotaMedia - 1e-9) : null;
        const historico = meses.map((x) => {
            const a = recPorMes.get(x.chave) || { clientes: 0, total: 0 };
            const c = num((cusPorMes.get(x.chave) || {}).total);
            const rt = num(a.total);
            return { ano: x.ano, mes: x.mes, clientes: Number(a.clientes) || 0, receita: rt, custo: c, margem: rt - c, pct: rt > 0 ? ((rt - c) / rt) * 100 : null, atual: x.chave === chaveMes(ano, mes) };
        });
        return {
            moeda, receita, recebido, custo, margem, nClientes,
            pct: receita > 0 ? (margem / receita) * 100 : null,
            porCliente: nClientes ? { custo: custo / nClientes, margem: margem / nClientes } : null,
            equilibrio, folga: equilibrio !== null ? nClientes - equilibrio : null,
            temCusto: !!servico.categoria_custo_id,
            itens, totalAnterior: itens.reduce((s, x) => s + x.anterior, 0),
            clientes, historico
        };
    }

    // Categoria de custo valida para o usuario: ativa, dele, e nao de sistema. Devolve o id ou null.
    static async custoValido(userId, id, conn = db) {
        const n = parseInt(id, 10);
        if (!(n > 0)) return null;
        const [[c]] = await conn.query("SELECT id FROM categorias WHERE id = ? AND user_id = ? AND sistema = 0 AND status = 'ativa' LIMIT 1", [n, userId]);
        return c ? c.id : null;
    }
}

module.exports = ServicoMargem;
