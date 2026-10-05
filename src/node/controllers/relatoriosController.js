const db = require('../config/db');
const Lancamento = require('../models/Lancamento');
const { toLocalYMD, hojeLocal, dataValida, mesAnoValidos } = require('../core/helpers');
const { CONTA_ATIVA } = require('../models/Lancamento');
const { filtroConta, moedaEmFoco, moedaBase } = require('../core/moedaFoco');
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


// ---- Periodo escolhido (mes, ano, hoje, 7 dias, datas) e os parametros que o identificam nos links ----
function resolverPeriodo(query) {
    const hojeObj = hojeLocal();
    const hoje = toLocalYMD(hojeObj);
    // Mes e ano vem da URL: valores fora do esperado caem no mes atual (antes, "?mes=abc" derrubava a pagina).
    const { mes, ano } = mesAnoValidos(query.mes, query.ano, hojeObj);
    let inicio, fim, preset = query.preset || 'mes';

    // Datas so valem como periodo personalizado quando vieram do botao "Aplicar" ou de um link com preset=custom/sem preset;
    // os outros envios do formulario carregam as datas so para exibir o periodo atual.
    const usaDatas = dataValida(query.data_inicio) && dataValida(query.data_fim) && query.data_inicio <= query.data_fim
        && (query.aplicar || !query.preset || query.preset === 'custom');
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
        preset = 'mes';
        inicio = toLocalYMD(new Date(ano, mes - 1, 1));
        fim = toLocalYMD(new Date(ano, mes, 0));
    }

    const mesAnt = new Date(ano, mes - 2, 1);
    const mesProx = new Date(ano, mes, 1);
    const periodo = {
        mes, ano, inicio, fim, preset,
        mes_anterior: mesAnt.getMonth() + 1, ano_anterior: mesAnt.getFullYear(),
        mes_proximo: mesProx.getMonth() + 1, ano_proximo: mesProx.getFullYear()
    };
    const periodoParams = preset === 'custom'
        ? { preset: 'custom', data_inicio: inicio, data_fim: fim }
        : ((preset === 'mes' || preset === 'anual') ? { preset, mes, ano } : { preset });
    return { periodo, periodoParams, hoje, hojeObj };
}

// ---- Com o que comparar: periodo anterior (padrao), mesmo periodo do ano passado ou datas escolhidas ----
function resolverComparacao(query, periodo) {
    const { preset, inicio, fim, mes, ano } = periodo;
    let comparar = ['anterior', 'ano', 'custom'].includes(query.comparar) ? query.comparar : 'anterior';
    let periodoAnt = null;
    if (comparar === 'custom') {
        if (dataValida(query.cmp_inicio) && dataValida(query.cmp_fim) && query.cmp_inicio <= query.cmp_fim) {
            periodoAnt = { inicio: query.cmp_inicio, fim: query.cmp_fim };
        } else {
            comparar = 'anterior';
        }
    }
    if (comparar === 'ano') {
        if (preset === 'mes') {
            periodoAnt = { inicio: toLocalYMD(new Date(ano - 1, mes - 1, 1)), fim: toLocalYMD(new Date(ano - 1, mes, 0)) };
        } else if (preset === 'anual') {
            periodoAnt = { inicio: `${ano - 1}-01-01`, fim: `${ano - 1}-12-31` };
        } else {
            const volta = (ymd) => { const [a, m, d] = ymd.split('-').map(Number); return toLocalYMD(new Date(a - 1, m - 1, d)); };
            periodoAnt = { inicio: volta(inicio), fim: volta(fim) };
        }
    }
    if (!periodoAnt) periodoAnt = periodoAnterior(preset, inicio, fim, mes, ano);
    const cmpParams = comparar === 'anterior' ? {} : (comparar === 'ano' ? { comparar } : { comparar, cmp_inicio: periodoAnt.inicio, cmp_fim: periodoAnt.fim });
    return { comparar, periodoAnt, cmpParams };
}

// ---- Estado financeiro: categorias com realizado, pendente, total, % e comparacao ----
async function carregarEstado(userId, periodo, periodoAnt) {
    const { inicio, fim, preset } = periodo;
    // Limite de gasto das categorias e mensal: vale ao ver um mes (x1) ou o ano (x12); em outros periodos nao se compara.
    const orcamentoMult = preset === 'mes' ? 1 : (preset === 'anual' ? 12 : null);
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
           AND (l.data_competencia BETWEEN ? AND ? OR l.data_competencia BETWEEN ? AND ?)
         GROUP BY l.tipo, p.id, c.id, p.nome, c.nome, p.cor, c.cor, p.limite_gasto, c.limite_gasto`,
        [inicio, fim, inicio, fim, inicio, fim, periodoAnt.inicio, periodoAnt.fim, userId, inicio, fim, periodoAnt.inicio, periodoAnt.fim]
    );
    // O limite de gasto da categoria e na moeda principal do usuario: noutra moeda nao ha com o que comparar.
    if (moedaEmFoco() && moedaBase() && moedaEmFoco() !== moedaBase()) linhas.forEach((l) => { l.cat_limite = null; l.sub_limite = null; });
    return { estado: montarEstado(linhas, orcamentoMult), orcamentoMult };
}

// ---- Visao por conta: saldo inicial, entradas, saidas, transferencias/ajustes, saldo realizado, pendente e projetado ----
async function carregarPorConta(userId, periodo) {
    const { inicio, fim } = periodo;
    const [rows] = await db.query(
        `SELECT c.id, c.nome, c.cor, c.saldo_inicial,
                COALESCE(SUM(CASE WHEN l.status = 'pago' AND l.data_competencia < ? THEN l.valor END), 0) AS mov_anterior,
                COALESCE(SUM(CASE WHEN l.status = 'pago' AND l.tipo = 'receita' AND l.data_competencia BETWEEN ? AND ? THEN ABS(l.valor) END), 0) AS entradas,
                COALESCE(SUM(CASE WHEN l.status = 'pago' AND l.tipo = 'despesa' AND l.data_competencia BETWEEN ? AND ? THEN ABS(l.valor) END), 0) AS saidas,
                COALESCE(SUM(CASE WHEN l.status = 'pago' AND l.tipo IN ('ajuste', 'transferencia') AND l.data_competencia BETWEEN ? AND ? THEN l.valor END), 0) AS transf_ajustes,
                COALESCE(SUM(CASE WHEN l.status = 'pendente' AND l.tipo = 'receita' AND l.data_competencia BETWEEN ? AND ? THEN ABS(l.valor) END), 0) AS a_receber,
                COALESCE(SUM(CASE WHEN l.status = 'pendente' AND l.tipo = 'despesa' AND l.data_competencia BETWEEN ? AND ? THEN ABS(l.valor) END), 0) AS a_pagar
         FROM contas c
         LEFT JOIN lancamentos l ON l.conta_id = c.id AND l.user_id = c.user_id
         WHERE c.user_id = ? AND c.status = 'ativa'${filtroConta('c')}
         GROUP BY c.id, c.nome, c.cor, c.saldo_inicial
         ORDER BY c.nome ASC`,
        [inicio, inicio, fim, inicio, fim, inicio, fim, inicio, fim, inicio, fim, userId]
    );
    const contas = rows.map((r) => {
        const ini = num(r.saldo_inicial) + num(r.mov_anterior);
        const fimReal = ini + num(r.entradas) - num(r.saidas) + num(r.transf_ajustes);
        const pendente = num(r.a_receber) - num(r.a_pagar);
        return {
            id: r.id, nome: r.nome, cor: r.cor, inicial: ini, entradas: num(r.entradas), saidas: num(r.saidas), outros: num(r.transf_ajustes),
            realizado: fimReal, aReceber: num(r.a_receber), aPagar: num(r.a_pagar), pendente, projetado: fimReal + pendente
        };
    }).sort((a, b) => b.realizado - a.realizado);
    const soma = (k) => contas.reduce((s, c) => s + c[k], 0);
    const total = { inicial: soma('inicial'), entradas: soma('entradas'), saidas: soma('saidas'), outros: soma('outros'), realizado: soma('realizado'), pendente: soma('pendente'), projetado: soma('projetado') };
    return { contas, total };
}

// ---- Fluxo de caixa: entradas/saidas por dia, semana ou mes (realizado x previsto) e saldo acumulado ----
async function carregarFluxo(userId, periodo, saldoAnterior) {
    const { inicio, fim } = periodo;
    const [rows] = await db.query(
        `SELECT l.data_competencia AS dia, l.tipo, l.status, SUM(l.valor) AS total
         FROM lancamentos l
         WHERE l.user_id = ? AND l.data_competencia BETWEEN ? AND ? AND ${CONTA_ATIVA}
           AND (l.tipo IN ('receita', 'despesa') OR (l.tipo IN ('ajuste', 'transferencia') AND l.status = 'pago'))
         GROUP BY l.data_competencia, l.tipo, l.status`,
        [userId, inicio, fim]
    );
    const [maior] = await db.query(
        `SELECT l.descricao, ABS(l.valor) AS valor, l.data_competencia AS dia
         FROM lancamentos l
         WHERE l.user_id = ? AND l.tipo = 'despesa' AND l.data_competencia BETWEEN ? AND ? AND ${CONTA_ATIVA}
         ORDER BY ABS(l.valor) DESC, l.id ASC LIMIT 1`,
        [userId, inicio, fim]
    );

    // Blocos: ate 7 dias = por dia; ate 62 dias = semanas de 7 dias a partir do inicio; mais que isso = por mes.
    const [a, m, d] = inicio.split('-').map(Number);
    const [a2, m2, d2] = fim.split('-').map(Number);
    const ini = new Date(a, m - 1, d), end = new Date(a2, m2 - 1, d2);
    const dias = Math.round((end - ini) / 86400000) + 1;
    const blocos = [];
    if (dias <= 7) {
        for (let i = 0; i < dias; i++) { const x = new Date(ini); x.setDate(x.getDate() + i); blocos.push({ tipo: 'dia', ini: toLocalYMD(x), fim: toLocalYMD(x) }); }
    } else if (dias <= 62) {
        for (let i = 0, n = 1; i < dias; i += 7, n++) {
            const x = new Date(ini); x.setDate(x.getDate() + i);
            const y = new Date(ini); y.setDate(y.getDate() + Math.min(i + 6, dias - 1));
            blocos.push({ tipo: 'sem', n, ini: toLocalYMD(x), fim: toLocalYMD(y) });
        }
    } else {
        for (let c = new Date(ini.getFullYear(), ini.getMonth(), 1); c <= end; c = new Date(c.getFullYear(), c.getMonth() + 1, 1)) {
            const x = c < ini ? ini : c;
            const ultimo = new Date(c.getFullYear(), c.getMonth() + 1, 0);
            const y = ultimo > end ? end : ultimo;
            blocos.push({ tipo: 'mes', mes: c.getMonth() + 1, ano: c.getFullYear(), ini: toLocalYMD(x), fim: toLocalYMD(y) });
        }
    }
    blocos.forEach((b) => Object.assign(b, { entR: 0, entP: 0, saiR: 0, saiP: 0, outros: 0 }));
    rows.forEach((r) => {
        const dia = toLocalYMD(r.dia);
        const b = blocos.find((x) => dia >= x.ini && dia <= x.fim);
        if (!b) return;
        const v = num(r.total);
        if (r.tipo === 'receita') { if (r.status === 'pago') b.entR += Math.abs(v); else b.entP += Math.abs(v); }
        else if (r.tipo === 'despesa') { if (r.status === 'pago') b.saiR += Math.abs(v); else b.saiP += Math.abs(v); }
        else b.outros += v;
    });
    let saldo = saldoAnterior;
    let menor = { valor: saldo, ref: null };
    blocos.forEach((b) => {
        b.liquido = b.entR + b.entP - b.saiR - b.saiP + b.outros;
        saldo += b.liquido;
        b.saldoFim = saldo;
        if (b.saldoFim < menor.valor) menor = { valor: b.saldoFim, ref: b };
    });
    const entradas = blocos.reduce((s, b) => s + b.entR + b.entP, 0);
    const saidas = blocos.reduce((s, b) => s + b.saiR + b.saiP, 0);
    return {
        blocos, saldoInicial: saldoAnterior, saldoFinal: saldo, entradas, saidas,
        menor, negativo: blocos.find((b) => b.saldoFim < 0) || null,
        maiorSaida: maior[0] ? { descricao: maior[0].descricao, valor: num(maior[0].valor), dia: toLocalYMD(maior[0].dia) } : null,
        saidaMaior: blocos.filter((b) => b.liquido < 0)
    };
}

const relatoriosController = {
    index: async (req, res) => {
        const userId = req.user.id;
        const query = req.query;
        const { periodo, periodoParams, hoje, hojeObj } = resolverPeriodo(query);
        const { inicio, fim, preset } = periodo;
        const aba = ['graficos', 'pendentes', 'demonstrativo', 'demonstrativo_anual'].includes(query.aba) ? query.aba : 'graficos';
        const anoAnual = mesAnoValidos(1, query.ano_anual || periodo.ano, hojeObj).ano;

        // Niveis de plano: o Demonstrativo Financeiro e do Premium e do Pro; fluxo de caixa, visao por conta e
        // comparacao com o ano passado/datas escolhidas sao do Pro. Sem o recurso, a tela apresenta o que ele faz
        // (views/partials/recurso_bloqueado) e nada e calculado.
        const pode = req.pode || (() => false);
        const estadoBloqueado = aba === 'demonstrativo' && !pode('rec_estado');
        const avancado = pode('rec_estado_avancado');

        // Contas e categorias dos formularios (novo / editar) nas abas que listam lancamentos.
        const comLista = aba === 'pendentes' || (aba === 'demonstrativo' && !estadoBloqueado);
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

        const estadoPorCategoria = aba === 'demonstrativo' && !estadoBloqueado && (filtros.categoria_id || filtros.subcategoria_id);
        let dadosLista = null;
        if (aba === 'pendentes' || estadoPorCategoria) {
            const extra = aba === 'pendentes' ? { status: 'pendente', atrasadas: inicio <= hoje && fim >= hoje } : {};
            dadosLista = await Lancamento.buscarFiltrados(userId, periodo, filtros, ordenacao, pagina, porPagina, agrupamento, extra);
        }

        // ---- Estado financeiro: resultado do periodo, comparacao, categorias, contas e fluxo de caixa ----
        const tipoFiltro = ['receita', 'despesa'].includes(query.tipo) ? query.tipo : '';
        const nivel = ['cat', 'sub'].includes(query.nivel) ? query.nivel : '';
        const vista = ['comparativo', 'fluxo', 'contas'].includes(query.vista) ? query.vista : '';
        const vistaBloqueada = ['fluxo', 'contas'].includes(vista) && !avancado;
        let estado = null, orcamentoMult = null, porConta = null, fluxo = null;
        // Sem o recurso avancado a comparacao e sempre com o periodo anterior (os parametros da URL sao ignorados).
        const { comparar, periodoAnt, cmpParams } = resolverComparacao(avancado ? query : {}, periodo);

        const comEstado = aba === 'demonstrativo' && !estadoBloqueado && !estadoPorCategoria;
        let resumo = null;
        if (aba === 'graficos' || comEstado) {
            resumo = await Lancamento.resumoPeriodo(userId, periodo);
        }
        if (comEstado) {
            ({ estado, orcamentoMult } = await carregarEstado(userId, periodo, periodoAnt));
            if (vista === 'contas' && !vistaBloqueada) porConta = await carregarPorConta(userId, periodo);
            if (vista === 'fluxo' && !vistaBloqueada) fluxo = await carregarFluxo(userId, periodo, resumo.saldo_anterior);
        }

        // ---- Graficos: totais por tipo, situacao, categoria e subcategoria (o navegador monta e filtra os 4 graficos) ----
        let graficosDados = [];
        let frequencia = [];
        let evolucao = [];
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

            // Evolucao do saldo dia a dia (saldo anterior + movimentos pagos acumulados; contas ativas)
            const [movs] = await db.query(
                `SELECT l.data_competencia AS dia, SUM(l.valor) AS total
                 FROM lancamentos l JOIN contas c ON c.id = l.conta_id AND c.status = 'ativa'${filtroConta('c')}
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
            aba === 'demonstrativo' ? Object.assign({ aba }, periodoParams, cmpParams, filtros.tipo !== 'todas' && ['receita', 'despesa'].includes(filtros.tipo) ? { tipo: filtros.tipo } : {}) : listaParams
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
            vista,
            estadoBloqueado,
            vistaBloqueada,
            avancado,
            comparar,
            cmpParams,
            estado,
            periodoAnt,
            orcamentoMult,
            porConta,
            fluxo,
            graficosDados,
            frequencia,
            evolucao,
            demonstrativoAnual,
            resumo
        });
    },

    // Estado financeiro em CSV (uma linha por categoria e subcategoria, com o resumo do periodo no fim).
    estadoCsv: async (req, res) => {
        const userId = req.user.id;
        const { periodo } = resolverPeriodo(req.query);
        const { periodoAnt } = resolverComparacao(req.query, periodo);
        const { estado, orcamentoMult } = await carregarEstado(userId, periodo, periodoAnt);
        const resumo = await Lancamento.resumoPeriodo(userId, periodo);

        const esc = (v) => {
            const t = v === null || v === undefined ? '' : String(v);
            const seguro = /^[=+\-@]/.test(t) && isNaN(Number(t)) ? "'" + t : t; // evita formula de planilha
            return '"' + seguro.replace(/"/g, '""') + '"';
        };
        const n = (v) => (v === null || v === undefined ? '' : String(Math.round(v * 100) / 100).replace('.', ','));
        const linhas = [['tipo', 'categoria', 'subcategoria', 'realizado', 'pendente', 'total', 'pct_do_total', 'comparacao', 'variacao_pct', 'orcado', 'uso_do_orcado_pct'].join(';')];
        const linha = (tipo, cat, sub, x) => linhas.push([
            tipo, esc(cat), esc(sub), n(x.realizado), n(x.pendente), n(x.total), n(x.pct), n(x.anterior), n(x.variacao), n(x.orcado), n(x.uso)
        ].join(';'));
        [['receita', estado.receitas], ['despesa', estado.despesas]].forEach(([tipo, S]) => {
            S.cats.forEach((c) => {
                linha(tipo, c.nome, '', c);
                c.subLista.forEach((s) => linha(tipo, c.nome, s.direto ? '(sem subcategoria)' : s.nome, s));
            });
            linhas.push([tipo + '_total', '', '', n(S.realizado), n(S.pendente), n(S.total), '100', n(S.anterior), n(S.variacao), '', ''].join(';'));
        });
        const X = estado.resultado;
        linhas.push(['resultado', '', '', n(X.realizado), n(X.total - X.realizado), n(X.total), '', n(X.anterior), '', '', ''].join(';'));
        linhas.push(['saldo_anterior', '', '', '', '', n(resumo.saldo_anterior), '', '', '', '', ''].join(';'));
        linhas.push(['ajustes_e_transferencias', '', '', '', '', n(resumo.ajustes_periodo), '', '', '', '', ''].join(';'));
        linhas.push(['saldo_final_projetado', '', '', '', '', n(resumo.saldo_previsto), '', '', '', '', ''].join(';'));
        linhas.push(['saldo_realizado', '', '', '', '', n(resumo.saldo_disponivel), '', '', '', '', ''].join(';'));
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader('Content-Disposition', `attachment; filename="estado-financeiro_${moedaEmFoco() ? moedaEmFoco() + '_' : ''}${periodo.inicio}_a_${periodo.fim}.csv"`);
        res.send(String.fromCharCode(0xFEFF) + linhas.join(String.fromCharCode(13, 10)) + String.fromCharCode(13, 10));
    },

    // Pagina de impressao do estado financeiro (o navegador salva como PDF). Com anexo=1 lista tambem as transacoes do periodo.
    estadoImprimir: async (req, res) => {
        const userId = req.user.id;
        const { periodo, periodoParams, hojeObj } = resolverPeriodo(req.query);
        const { comparar, periodoAnt } = resolverComparacao(req.query, periodo);
        const { estado, orcamentoMult } = await carregarEstado(userId, periodo, periodoAnt);
        const resumo = await Lancamento.resumoPeriodo(userId, periodo);
        let anexo = null;
        if (req.query.anexo === '1') {
            const [rows] = await db.query(
                `SELECT l.data_competencia, l.tipo, l.descricao, l.valor, l.status,
                        COALESCE(p.nome, c.nome) AS categoria, IF(p.id IS NOT NULL, c.nome, NULL) AS subcategoria, cb.nome AS conta
                 FROM lancamentos l
                 LEFT JOIN categorias c ON l.categoria_id = c.id
                 LEFT JOIN categorias p ON c.parent_id = p.id
                 LEFT JOIN contas cb ON l.conta_id = cb.id
                 WHERE l.user_id = ? AND l.data_competencia BETWEEN ? AND ? AND l.tipo IN ('receita', 'despesa') AND ${CONTA_ATIVA}
                 ORDER BY l.data_competencia ASC, l.id ASC LIMIT 2000`,
                [userId, periodo.inicio, periodo.fim]
            );
            anexo = rows;
        }
        res.render('relatorios/imprimir', {
            layout: false,
            title: req.t('est.impr_titulo'),
            periodo, periodoParams, periodoAnt, comparar, estado, orcamentoMult, resumo, anexo,
            geradoEm: toLocalYMD(hojeObj),
            usuarioNome: req.user.nome
        });
    }
};

relatoriosController.exportar = async (req, res) => {
    const userId = req.user.id;
    const hoje = hojeLocal();
    let inicio = req.query.data_inicio, fim = req.query.data_fim;
    if (!dataValida(inicio) || !dataValida(fim)) {
        inicio = toLocalYMD(new Date(hoje.getFullYear(), hoje.getMonth(), 1));
        fim = toLocalYMD(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0));
    }
    const [rows] = await db.query(
        `SELECT l.data_competencia, l.tipo, l.descricao, l.valor, l.status, l.data_pagamento,
                COALESCE(p.nome, c.nome) AS categoria, IF(p.id IS NOT NULL, c.nome, NULL) AS subcategoria, cb.nome AS conta, cb.moeda AS moeda
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
    const linhas = [['Data', 'Tipo', 'Descricao', 'Categoria', 'Subcategoria', 'Conta', 'Valor', 'Status', 'Data pagamento', 'Moeda'].join(';')];
    rows.forEach(r => linhas.push([
        toLocalYMD(r.data_competencia), r.tipo, esc(r.descricao), esc(r.categoria), esc(r.subcategoria), esc(r.conta),
        String(parseFloat(r.valor)).replace('.', ','), r.status, r.data_pagamento ? toLocalYMD(r.data_pagamento) : '', r.moeda || ''
    ].join(';')));
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="lancamentos_${inicio}_a_${fim}.csv"`);
    res.send(String.fromCharCode(0xFEFF) + linhas.join(String.fromCharCode(13, 10)));
};

module.exports = relatoriosController;
