const db = require('../config/db');
const Lancamento = require('../models/Lancamento');
const { toLocalYMD } = require('../core/helpers');

const relatoriosController = {
    index: async (req, res) => {
        const userId = req.user.id;
        const query = req.query;

        const hojeObj = new Date();
        const hoje = toLocalYMD(hojeObj);
        
        let mes = parseInt(query.mes || (hojeObj.getMonth() + 1), 10);
        let ano = parseInt(query.ano || hojeObj.getFullYear(), 10);

        let inicio, fim, preset = query.preset || 'mes';

        if (query.data_inicio && query.data_fim) {
            inicio = query.data_inicio;
            fim = query.data_fim;
            preset = 'custom';
        } else if (preset === 'hoje') {
            inicio = hoje;
            fim = hoje;
        } else if (preset === '7dias') {
            const d = new Date(); d.setDate(d.getDate() - 7);
            inicio = toLocalYMD(d);
            fim = hoje;
        } else if (preset === '30dias') {
            const d = new Date(); d.setDate(d.getDate() - 30);
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

        const periodo = {
            mes,
            ano,
            inicio,
            fim,
            preset
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
             ORDER BY ${orderSql}`,
            [userId]
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
            pendentes,
            demonstrativoLinhas,
            demonstrativoAnual,
            resumo
        });
    }
};

module.exports = relatoriosController;
