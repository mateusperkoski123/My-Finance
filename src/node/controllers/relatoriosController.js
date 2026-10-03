const db = require('../config/db');
const Lancamento = require('../models/Lancamento');
const { toLocalYMD, hojeLocal } = require('../core/helpers');
const { CONTA_ATIVA } = require('../models/Lancamento');
const Conta = require('../models/Conta');
const Categoria = require('../models/Categoria');


const cleanVal = (v) => (v && v !== 'null' && v !== 'undefined' && v !== '') ? String(v).trim() : null;

// Periodo imediatamente anterior para comparar: mes -> mes anterior, ano -> ano anterior, outros -> mesma quantidade de dias antes.
function periodoAnterior(preset, inicio, fim, mes, ano) {
    if (preset === 'mes') {
        return { inicio: toLocalYMD(new Date(ano, mes - 2, 1)), fim: toLocalYMD(new Date(ano, mes - 1, 0)) };
    }
    if (preset === 'anual') return { inicio: `${ano - 1}-01-01`, fim: `${ano - 1}-12-31` };
    const [a, m, d] = inicio.split('-').map(Number);
    const [a2, m2, d2] = fim.split('-').map(Number);
    const ini = new Date(a, m - 1, d), end = new Date(a2, m2 - 1, d2);
    const dias = Math.round((end - ini) / 86400000) + 1;
    const fimAnt = new Date(ini); fimAnt.setDate(fimAnt.getDate() - 1);
    const iniAnt = new Date(fimAnt); iniAnt.setDate(iniAnt.getDate() - (dias - 1));
    return { inicio: toLocalYMD(iniAnt), fim: toLocalYMD(fimAnt) };
}

const num = (v) => parseFloat(v) || 0;
const variacao = (atual, anterior) => (anterior > 0 ? ((atual - anterior) / anterior) * 100 : null);

// Agrupa as linhas (tipo x categoria x subcategoria) em: por tipo -> categorias -> subcategorias, com percentuais,
// variacao contra o periodo anterior e uso do limite (orcado) quando houver.
function montarEstado(linhas, orcamentoMult) {
    const novoNo = (id, nome, cor, limite) => ({ id, nome, cor, limite: limite === null || limite === undefined ? null : num(limite), realizado: 0, pendente: 0, total: 0, anterior: 0 });
    const soma = (no, r) => { no.realizado += num(r.realizado); no.pendente += num(r.pendente); no.total += num(r.total); no.anterior += num(r.anterior); };
    const base = { receita: new Map(), despesa: new Map() };

    linhas.forEach((r) => {
        const mapa = base[r.tipo];
        if (!mapa) return;
        let cat = mapa.get(r.categoria_id);
        if (!cat) {
            cat = novoNo(r.categoria_id, r.categoria, r.categoria_cor, r.cat_limite);
            cat.subs = new Map();
            mapa.set(r.categoria_id, cat);
        }
        soma(cat, r);
        if (r.subcategoria_id) {
            let sub = cat.subs.get(r.subcategoria_id);
            if (!sub) { sub = novoNo(r.subcategoria_id, r.subcategoria, r.categoria_cor, r.sub_limite); cat.subs.set(r.subcategoria_id, sub); }
            soma(sub, r);
        }
    });

    const enriquecer = (no, totalTipo) => {
        no.pct = totalTipo > 0 ? (no.total / totalTipo) * 100 : 0;
        no.variacao = variacao(no.total, no.anterior);
        no.orcado = orcamentoMult && no.limite ? no.limite * orcamentoMult : null;
        no.uso = no.orcado ? (no.total / no.orcado) * 100 : null;
        return no;
    };
    const ordem = (a, b) => (b.total - a.total) || (b.anterior - a.anterior);

    const secao = (tipo) => {
        const cats = [...base[tipo].values()];
        const t = { realizado: 0, pendente: 0, total: 0, anterior: 0 };
        cats.forEach((c) => { t.realizado += c.realizado; t.pendente += c.pendente; t.total += c.total; t.anterior += c.anterior; });
        cats.sort(ordem).forEach((c) => {
            enriquecer(c, t.total);
            const subs = [...c.subs.values()];
            const somaSubs = subs.reduce((s, x) => s + x.total, 0);
            const antSubs = subs.reduce((s, x) => s + x.anterior, 0);
            // O que foi lancado direto na categoria (sem subcategoria) aparece como linha propria quando ela tambem tem subcategorias.
            if (subs.length && (c.total - somaSubs > 0.004 || c.anterior - antSubs > 0.004)) {
                const direto = novoNo(null, null, c.cor, null);
                direto.direto = true;
                direto.realizado = c.realizado - subs.reduce((s, x) => s + x.realizado, 0);
                direto.pendente = c.pendente - subs.reduce((s, x) => s + x.pendente, 0);
                direto.total = c.total - somaSubs;
                direto.anterior = c.anterior - antSubs;
                subs.push(direto);
            }
            c.subLista = subs.sort(ordem).map((s) => enriquecer(s, t.total));
            delete c.subs;
        });
        return Object.assign(t, { variacao: variacao(t.total, t.anterior), cats });
    };

    const receitas = secao('receita');
    const despesas = secao('despesa');
    const resultado = { total: receitas.total - despesas.total, realizado: receitas.realizado - despesas.realizado, anterior: receitas.anterior - despesas.anterior };
    resultado.variacao = resultado.anterior !== 0 ? ((resultado.total - resultado.anterior) / Math.abs(resultado.anterior)) * 100 : null;
    return { receitas, despesas, resultado };
}


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

        // ---- Estado financeiro: resultado do periodo + categorias (realizado, pendente, total, %, vs periodo anterior, orcado) ----
        const tipoFiltro = ['receita', 'despesa'].includes(query.tipo) ? query.tipo : '';
        const nivel = ['cat', 'sub'].includes(query.nivel) ? query.nivel : '';
        let estado = null;
        const periodoAnt = periodoAnterior(preset, inicio, fim, mes, ano);
        // Limite de gasto das categorias e mensal: vale ao ver um mes (x1) ou o ano (x12); em outros periodos nao se compara.
        const orcamentoMult = preset === 'mes' ? 1 : (preset === 'anual' ? 12 : null);
        if (aba === 'demonstrativo' && !estadoPorCategoria) {
            const [linhas] = await db.query(
                `SELECT l.tipo,
                        COALESCE(p.id, c.id) AS categoria_id, IF(p.id IS NULL, c.nome, p.nome) AS categoria, IF(p.id IS NULL, c.cor, p.cor) AS categoria_cor,
                        IF(p.id IS NULL, c.limite_gasto, p.limite_gasto) AS cat_limite,
                        IF(p.id IS NOT NULL, c.id, NULL) AS subcategoria_id, IF(p.id IS NOT NULL, c.nome, NULL) AS subcategoria,
                        IF(p.id IS NOT NULL, c.limite_gasto, NULL) AS sub_limite,
                        SUM(CASE WHEN l.data_competencia BETWEEN ? AND ? AND l.status = 'pago' THEN ABS(l.valor) ELSE 0 END) AS realizado,
                        SUM(CASE WHEN l.data_competencia BETWEEN ? AND ? AND l.status = 'pendente' THEN ABS(l.valor) ELSE 0 END) AS pendente,
                        SUM(CASE WHEN l.data_competencia BETWEEN ? AND ? THEN ABS(l.valor) ELSE 0 END) AS total,
                        SUM(CASE WHEN l.data_competencia BETWEEN ? AND ? THEN ABS(l.valor) ELSE 0 END) AS anterior
                 FROM lancamentos l
                 LEFT JOIN categorias c ON l.categoria_id = c.id
                 LEFT JOIN categorias p ON c.parent_id = p.id
                 WHERE l.user_id = ? AND l.tipo IN ('receita', 'despesa') AND ${CONTA_ATIVA}
                   AND l.data_competencia BETWEEN ? AND ?
                 GROUP BY l.tipo, p.id, c.id, p.nome, c.nome, p.cor, c.cor, p.limite_gasto, c.limite_gasto`,
                [inicio, fim, inicio, fim, inicio, fim, periodoAnt.inicio, periodoAnt.fim, userId,
                    inicio < periodoAnt.inicio ? inicio : periodoAnt.inicio, fim > periodoAnt.fim ? fim : periodoAnt.fim]
            );
            estado = montarEstado(linhas, orcamentoMult);
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
            estado,
            periodoAnt,
            orcamentoMult,
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
