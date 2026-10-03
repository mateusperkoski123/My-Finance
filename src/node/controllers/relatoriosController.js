const db = require('../config/db');
const Lancamento = require('../models/Lancamento');
const { toLocalYMD, hojeLocal } = require('../core/helpers');
const { CONTA_ATIVA } = require('../models/Lancamento');
const Conta = require('../models/Conta');
const Categoria = require('../models/Categoria');


const cleanVal = (v) => (v && v !== 'null' && v !== 'undefined' && v !== '') ? String(v).trim() : null;

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
        // os outros envios do formulario carregam as datas so para exibir o periodo atual.
        const usaDatas = query.data_inicio && query.data_fim && (query.aplicar || !query.preset || query.preset === 'custom');
        if (usaDatas) {
            inicio = query.data_inicio;
            fim = query.data_fim;
            preset = 'custom';
        } else if (preset === 'hoje') {
            inicio = hoje;
            fim = hoje;
        } else if (preset === '7dias') {
            const d = hojeLocal();
            if (query.aba === 'pendentes') {
                // Pendentes olha para frente: de hoje ate daqui a 7 dias (as atrasadas entram porque o periodo contem hoje).
                inicio = hoje;
                d.setDate(d.getDate() + 7);
                fim = toLocalYMD(d);
            } else {
                d.setDate(d.getDate() - 7);
                inicio = toLocalYMD(d);
                fim = hoje;
            }
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

        // Parametros que identificam o periodo (links entre abas, lista compartilhada e graficos clicaveis).
        const periodoParams = preset === 'custom'
            ? { preset: 'custom', data_inicio: inicio, data_fim: fim }
            : ((preset === 'mes' || preset === 'anual') ? { preset, mes, ano } : { preset });

        // Contas e categorias dos formularios (novo / editar) nas abas que listam lancamentos.
        const comLista = aba === 'pendentes' || aba === 'demonstrativo';
        let contas = [], categoriasArvore = [];
        if (comLista) {
            contas = await Conta.buscarPorUsuario(userId, false);
            await Categoria.garantirCategoriasBasicas(userId);
            categoriasArvore = await Categoria.buscarArvore(userId, false);
        }

        // ---- Lista no formato da Visao geral (Movimentos pendentes, ou Estado financeiro filtrado por categoria) ----
        const filtros = {
            tipo: cleanVal(query.tipo) || 'todas',
            busca: cleanVal(query.busca) || '',
            categoria_id: cleanVal(query.categoria_id),
            subcategoria_id: cleanVal(query.subcategoria_id)
        };
        const ordenacao = cleanVal(query.ordenar) || (aba === 'pendentes' ? 'vencimento' : 'data');
        const AGRUPAR_VALIDOS = ['sem_agrupamento', 'categoria', 'subcategoria', 'vencimento', 'criacao', 'status'];
        const agrupamento = AGRUPAR_VALIDOS.includes(query.agrupar) ? query.agrupar : 'sem_agrupamento';
        const pagina = Math.max(parseInt(query.pagina || '1', 10) || 1, 1);
        const porPagina = Math.min(Math.max(parseInt(query.por_pagina || '30', 10) || 30, 10), 200);

        const estadoPorCategoria = aba === 'demonstrativo' && (filtros.categoria_id || filtros.subcategoria_id);
        let dadosLista = null;
        if (aba === 'pendentes' || estadoPorCategoria) {
            const extra = aba === 'pendentes' ? { status: 'pendente', atrasadas: inicio <= hoje && fim >= hoje } : {};
            dadosLista = await Lancamento.buscarFiltrados(userId, periodo, filtros, ordenacao, pagina, porPagina, agrupamento, extra);
        }

        // ---- Estado financeiro (resumo por categoria), com filtros de tipo e nivel ----
        let demonstrativoLinhas = [];
        const tipoFiltro = ['receita', 'despesa'].includes(query.tipo) ? query.tipo : '';
        const nivel = ['cat', 'sub'].includes(query.nivel) ? query.nivel : '';
        if (aba === 'demonstrativo' && !estadoPorCategoria) {
            const [linhas] = await db.query(
                `SELECT
                    COALESCE(p.id, c.id) AS categoria_id, IF(p.id IS NULL, c.nome, p.nome) AS categoria,
                    IF(p.id IS NOT NULL, c.id, NULL) AS subcategoria_id, IF(p.id IS NOT NULL, c.nome, NULL) AS subcategoria,
                    l.tipo, SUM(ABS(l.valor)) AS total
                 FROM lancamentos l
                 LEFT JOIN categorias c ON l.categoria_id = c.id
                 LEFT JOIN categorias p ON c.parent_id = p.id
                 WHERE l.user_id = ? AND l.data_competencia BETWEEN ? AND ? AND l.tipo IN ('receita', 'despesa') AND ${CONTA_ATIVA}
                 GROUP BY p.id, c.id, p.nome, c.nome, l.tipo
                 ORDER BY l.tipo ASC, total DESC`,
                [userId, inicio, fim]
            );
            demonstrativoLinhas = linhas.filter((r) => !tipoFiltro || r.tipo === tipoFiltro);
            if (nivel === 'sub') {
                demonstrativoLinhas = demonstrativoLinhas.filter((r) => r.subcategoria_id);
            } else if (nivel === 'cat') {
                // Soma as subcategorias na categoria pai.
                const mapa = new Map();
                demonstrativoLinhas.forEach((r) => {
                    const k = r.tipo + ':' + r.categoria_id;
                    if (!mapa.has(k)) mapa.set(k, { categoria_id: r.categoria_id, categoria: r.categoria, subcategoria_id: null, subcategoria: null, tipo: r.tipo, total: 0 });
                    mapa.get(k).total += parseFloat(r.total) || 0;
                });
                demonstrativoLinhas = [...mapa.values()].sort((a, b) => (a.tipo === b.tipo ? b.total - a.total : (a.tipo < b.tipo ? 1 : -1)));
            }
        }

        // ---- Graficos: totais por tipo, situacao, categoria e subcategoria (o navegador monta e filtra os 4 graficos) ----
        let graficosDados = [];
        let frequencia = [];
        let evolucao = [];
        let resumo = null;
        if (aba === 'graficos') {
            const [dados] = await db.query(
                `SELECT l.tipo, l.status,
                        COALESCE(p.id, c.id) AS cat_id, IF(p.id IS NULL, c.nome, p.nome) AS cat_nome, IF(p.id IS NULL, c.cor, p.cor) AS cat_cor,
                        IF(p.id IS NOT NULL, c.id, NULL) AS sub_id, IF(p.id IS NOT NULL, c.nome, NULL) AS sub_nome, IF(p.id IS NOT NULL, c.cor, NULL) AS sub_cor,
                        SUM(ABS(l.valor)) AS total
                 FROM lancamentos l
                 LEFT JOIN categorias c ON l.categoria_id = c.id
                 LEFT JOIN categorias p ON c.parent_id = p.id
                 WHERE l.user_id = ? AND l.data_competencia BETWEEN ? AND ? AND l.tipo IN ('receita', 'despesa') AND ${CONTA_ATIVA}
                 GROUP BY l.tipo, l.status, p.id, c.id, p.nome, c.nome, p.cor, c.cor`,
                [userId, inicio, fim]
            );
            graficosDados = dados.map((r) => ({
                tipo: r.tipo, status: r.status,
                catId: r.cat_id, catNome: r.cat_nome, catCor: r.cat_cor,
                subId: r.sub_id, subNome: r.sub_nome, subCor: r.sub_cor,
                total: parseFloat(r.total) || 0
            }));
            frequencia = await Lancamento.frequenciaDiaria(userId, inicio, fim);
        }

        // Resumo do periodo (cartoes dos graficos) e evolucao do saldo
        if (aba === 'graficos' || aba === 'demonstrativo') {
            resumo = await Lancamento.resumoPeriodo(userId, periodo);
        }
        if (aba === 'graficos') {
            // Evolucao do saldo dia a dia (saldo anterior + movimentos pagos acumulados; contas ativas)
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

        // Demonstrativo anual
        const demonstrativoAnual = aba === 'demonstrativo_anual' ? await Lancamento.demonstrativoAnual(userId, anoAnual) : null;

        // Categoria escolhida (cabecalho do Estado financeiro filtrado)
        let categoriaFiltro = null;
        if (estadoPorCategoria) {
            const id = filtros.subcategoria_id || filtros.categoria_id;
            const [cr] = await db.query(
                `SELECT c.id, c.nome, c.cor, p.nome AS pai_nome FROM categorias c LEFT JOIN categorias p ON p.id = c.parent_id WHERE c.id = ? AND c.user_id = ? LIMIT 1`,
                [id, userId]
            );
            categoriaFiltro = cr[0] || null;
        }

        // Base da lista compartilhada: mantem aba e periodo nos links (busca, abas de tipo, agrupar, ordenar, paginacao).
        const listaParams = Object.assign({ aba }, periodoParams);
        const limparUrl = '/relatorios?' + new URLSearchParams(
            aba === 'demonstrativo' ? Object.assign({ aba }, periodoParams, filtros.tipo !== 'todas' && ['receita', 'despesa'].includes(filtros.tipo) ? { tipo: filtros.tipo } : {}) : listaParams
        ).toString();

        res.render('relatorios/index', {
            title: req.t('pages.relatorios.titulo'),
            periodo,
            periodoParams,
            aba,
            anoAnual,
            anoAtual: hojeObj.getFullYear(),
            contas,
            categoriasArvore,
            // lista compartilhada (partials/lista_lancamentos)
            filtros,
            ordenacao,
            agrupamento,
            porPagina,
            listaBase: '/relatorios',
            listaParams,
            limparUrl,
            agruparOpcoes: ['sem_agrupamento', 'categoria', 'subcategoria', 'vencimento', 'criacao'].concat(aba === 'pendentes' ? [] : ['status']),
            lancamentos: dadosLista ? dadosLista.lancamentos : [],
            grupos: dadosLista ? dadosLista.grupos : null,
            totalRegistros: dadosLista ? dadosLista.totalRegistros : 0,
            somaFiltrada: dadosLista ? dadosLista.somaFiltrada : 0,
            totalPaginas: dadosLista ? dadosLista.totalPaginas : 1,
            paginaAtual: dadosLista ? dadosLista.paginaAtual : 1,
            categoriaFiltro,
            // estado financeiro / graficos / anual
            tipoFiltro,
            nivel,
            demonstrativoLinhas,
            graficosDados,
            frequencia,
            evolucao,
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
