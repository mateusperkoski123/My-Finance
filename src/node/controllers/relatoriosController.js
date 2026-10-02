const db = require('../config/db');
const Lancamento = require('../models/Lancamento');
const { toLocalYMD, hojeLocal } = require('../core/helpers');

const relatoriosController = {
    index: async (req, res) => {
        const userId = req.user.id;
        const query = req.query;

        const hojeObj = hojeLocal();
        const hoje = toLocalYMD(hojeObj);
        
        let mes = parseInt(query.mes || (hojeObj.getMonth() + 1), 10);
        let ano = parseInt(query.ano || hojeObj.getFullYear(), 10);

        let inicio, fim, preset = query.preset || 'mes';

        // Datas so valem como periodo personalizado quando vieram do botao "Aplicar" ou de um link com preset=custom/sem preset;
        // os outros envios do formulario (ordenar/agrupar) carregam as datas so para exibir o periodo atual.
        const usaDatas = query.data_inicio && query.data_fim && (query.aplicar || !query.preset || query.preset === 'custom');
        if (usaDatas) {
            inicio = query.data_inicio;
            fim = query.data_fim;
            preset = 'custom';
        } else if (preset === 'hoje') {
            inicio = hoje;
            fim = hoje;
        } else if (preset === '7dias') {
            const d = hojeLocal(); d.setDate(d.getDate() - 7);
            inicio = toLocalYMD(d);
            fim = hoje;
        } else if (preset === '30dias') {
            const d = hojeLocal(); d.setDate(d.getDate() - 30);
            inicio = toLocalYMD(d);
            fim = hoje;
        } else if (preset === 'anual') {
            inicio = `${ano}-01-01`;
            fim = `${ano}-12-31`;
        } else {
            const start = new Date(ano, mes - 1, 1);
            const end = new Date(ano, mes, 0);
            inicio = toLocalYMD(start);
            fim = toLocalYMD(end);
        }

        const mesAnt = new Date(ano, mes - 2, 1);
        const mesProx = new Date(ano, mes, 1);
        const periodo = {
            mes,
            ano,
            inicio,
            fim,
            preset,
            mes_anterior: mesAnt.getMonth() + 1,
            ano_anterior: mesAnt.getFullYear(),
            mes_proximo: mesProx.getMonth() + 1,
            ano_proximo: mesProx.getFullYear()
        };

        const aba = query.aba || 'graficos';
        const anoAnual = parseInt(query.ano_anual || ano, 10);
        const ordenar = query.ordenar || 'data';
        const agrupar = query.agrupar || 'categoria';

        // Dynamic ordering for pendentes & demonstrativo
        let orderSql = 'l.data_competencia DESC, l.id DESC';
        if (ordenar === 'preco' || ordenar === 'valor') {
            orderSql = 'ABS(l.valor) DESC';
        } else if (ordenar === 'data_criacao' || ordenar === 'criacao') {
            orderSql = 'l.created_at DESC, l.id DESC';
        } else if (ordenar === 'vencimento' || ordenar === 'data_vencimento') {
            orderSql = 'l.data_competencia ASC';
        }

        // Pendentes: respeita o periodo escolhido; se o periodo contem hoje, as atrasadas (de antes do periodo) tambem aparecem.
        // "Vencimento" (padrao do seletor) ordena do mais proximo para o mais distante.
        let pendentesOrderSql = 'l.data_competencia ASC, l.id ASC';
        if (ordenar === 'preco' || ordenar === 'valor') {
            pendentesOrderSql = 'ABS(l.valor) DESC, l.id ASC';
        } else if (ordenar === 'data_criacao' || ordenar === 'criacao') {
            pendentesOrderSql = 'l.created_at DESC, l.id DESC';
        }

        // Fetch category distribution for charts
        // Regra: o total de uma categoria incorpora o de suas subcategorias.
        const [catData] = await db.query(
            `SELECT COALESCE(p.nome, c.nome) AS nome, COALESCE(p.cor, c.cor) AS cor, l.tipo, SUM(ABS(l.valor)) AS total
             FROM lancamentos l
             LEFT JOIN categorias c ON l.categoria_id = c.id
             LEFT JOIN categorias p ON c.parent_id = p.id
             WHERE l.user_id = ? AND l.data_competencia BETWEEN ? AND ? AND l.tipo IN ('receita', 'despesa')
             GROUP BY COALESCE(p.id, c.id), COALESCE(p.nome, c.nome), COALESCE(p.cor, c.cor), l.tipo`,
            [userId, inicio, fim]
        );

        // Daily frequency chart data
        const frequencia = await Lancamento.frequenciaDiaria(userId, inicio, fim);

        // Fetch pendentes
        const [pendentes] = await db.query(
            `SELECT l.*, 
                    IF(c.parent_id IS NULL, c.nome, (SELECT p.nome FROM categorias p WHERE p.id = c.parent_id)) as categoria_nome,
                    IF(c.parent_id IS NOT NULL, c.nome, NULL) as subcategoria_nome,
                    cb.nome as conta_nome
             FROM lancamentos l
             LEFT JOIN categorias c ON l.categoria_id = c.id
             LEFT JOIN contas cb ON l.conta_id = cb.id
             WHERE l.user_id = ? AND l.status = 'pendente'
               AND (l.data_competencia BETWEEN ? AND ? OR (? AND l.data_competencia < ?))
             ORDER BY ${pendentesOrderSql}`,
            [userId, inicio, fim, inicio <= hoje && fim >= hoje ? 1 : 0, hoje]
        );

        // Fetch demonstrativo mensal
        const [demonstrativoLinhas] = await db.query(
            `SELECT 
                IF(c.parent_id IS NULL, c.nome, (SELECT p.nome FROM categorias p WHERE p.id = c.parent_id)) as categoria,
                IF(c.parent_id IS NOT NULL, c.nome, NULL) as subcategoria,
                l.tipo, 
                SUM(ABS(l.valor)) as total
             FROM lancamentos l
             LEFT JOIN categorias c ON l.categoria_id = c.id
             WHERE l.user_id = ? AND l.data_competencia BETWEEN ? AND ? AND l.tipo IN ('receita', 'despesa')
             GROUP BY c.parent_id, l.categoria_id, l.tipo
             ORDER BY ${orderSql}`,
            [userId, inicio, fim]
        );

        // Fetch demonstrativo anual
        const demonstrativoAnual = await Lancamento.demonstrativoAnual(userId, anoAnual);

        // Fetch resumo do período
        const resumo = await Lancamento.resumoPeriodo(userId, periodo);

        // Evolucao do saldo dia a dia (saldo anterior + movimentos pagos acumulados; contas ativas)
        let evolucao = [];
        if (aba === 'graficos') {
            const [movs] = await db.query(
                `SELECT l.data_competencia AS dia, SUM(l.valor) AS total
                 FROM lancamentos l JOIN contas c ON c.id = l.conta_id AND c.status = 'ativa'
                 WHERE l.user_id = ? AND l.status = 'pago' AND l.data_competencia BETWEEN ? AND ?
                 GROUP BY l.data_competencia`,
                [userId, inicio, fim]
            );
            const porDia = {};
            movs.forEach(m => { porDia[toLocalYMD(m.dia)] = parseFloat(m.total) || 0; });
            let acumulado = resumo.saldo_anterior;
            const [ay, am, ad] = inicio.split('-').map(Number);
            const [by, bm, bd] = fim.split('-').map(Number);
            const ini = new Date(ay, am - 1, ad), end = new Date(by, bm - 1, bd);
            for (let d = new Date(ini), n = 0; d <= end && n < 400; d.setDate(d.getDate() + 1), n++) {
                const k = toLocalYMD(d);
                acumulado += porDia[k] || 0;
                evolucao.push({ data: k, saldo: acumulado });
            }
        }

        res.render('relatorios/index', {
            title: req.t('pages.relatorios.titulo'),
            periodo,
            aba,
            anoAnual,
            anoAtual: hojeObj.getFullYear(),
            ordenar,
            agrupar,
            catData,
            frequencia,
            evolucao,
            pendentes,
            demonstrativoLinhas,
            demonstrativoAnual,
            resumo
        });
    }
};

relatoriosController.exportar = async (req, res) => {
    const userId = req.user.id;
    const hoje = hojeLocal();
    let inicio = req.query.data_inicio, fim = req.query.data_fim;
    const ymd = /^\d{4}-\d{2}-\d{2}$/;
    if (!ymd.test(inicio || '') || !ymd.test(fim || '')) {
        inicio = toLocalYMD(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
        fim = toLocalYMD(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0));
    }
    const [rows] = await db.query(
        `SELECT l.data_competencia, l.tipo, l.descricao, l.valor, l.status, l.data_pagamento,
                COALESCE(p.nome, c.nome) AS categoria, IF(p.id IS NOT NULL, c.nome, NULL) AS subcategoria, cb.nome AS conta
         FROM lancamentos l
         LEFT JOIN categorias c ON l.categoria_id = c.id
         LEFT JOIN categorias p ON c.parent_id = p.id
         LEFT JOIN contas cb ON l.conta_id = cb.id
         WHERE l.user_id = ? AND l.data_competencia BETWEEN ? AND ?
         ORDER BY l.data_competencia ASC, l.id ASC`,
        [userId, inicio, fim]
    );
    const esc = (v) => {
        const t = v === null || v === undefined ? '' : String(v);
        // Neutraliza formulas de planilha (CSV injection) e escapa aspas.
        const seguro = /^[=+\-@]/.test(t) && isNaN(Number(t)) ? "'" + t : t;
        return '"' + seguro.replace(/"/g, '""') + '"';
    };
    const linhas = [['Data', 'Tipo', 'Descricao', 'Categoria', 'Subcategoria', 'Conta', 'Valor', 'Status', 'Data pagamento'].join(';')];
    rows.forEach(r => linhas.push([
        toLocalYMD(r.data_competencia), r.tipo, esc(r.descricao), esc(r.categoria), esc(r.subcategoria), esc(r.conta),
        String(parseFloat(r.valor)).replace('.', ','), r.status, r.data_pagamento ? toLocalYMD(r.data_pagamento) : ''
    ].join(';')));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lancamentos_${inicio}_a_${fim}.csv"`);
    res.send(String.fromCharCode(0xFEFF) + linhas.join(String.fromCharCode(13, 10)));
};

module.exports = relatoriosController;
