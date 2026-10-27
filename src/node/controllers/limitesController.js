const db = require('../config/db');
const Categoria = require('../models/Categoria');
const Limite = require('../models/Limite');
const { parseMoeda, hojeLocal, toLocalYMD, normalizarMoeda } = require('../core/helpers');

const pad = (n) => String(n).padStart(2, '0');
const chaveMes = (m) => `${m.ano}-${pad(m.numero)}`;
const somarMes = (m, n) => { const d = new Date(Date.UTC(m.ano, m.numero - 1 + n, 1)); return { ano: d.getUTCFullYear(), numero: d.getUTCMonth() + 1 }; };
const ultimoDia = (m) => new Date(Date.UTC(m.ano, m.numero, 0)).getUTCDate();
const num = (v) => parseFloat(v) || 0;

// Mes a partir de 'YYYY-MM' (ou o atual).
function mesDe(pedido, hojeYmd) {
    const m = /^(\d{4})-(\d{2})$/.exec(String(pedido || ''));
    if (m && +m[2] >= 1 && +m[2] <= 12 && +m[1] >= 2000 && +m[1] <= 2100) return { ano: +m[1], numero: +m[2] };
    return { ano: +hojeYmd.slice(0, 4), numero: +hojeYmd.slice(5, 7) };
}

const limitesController = {
    // Tela "Limites de gastos": 5 meses (gasto x limite), resumo do mes e planejamento por categoria. Do Premium em diante.
    index: async (req, res) => {
        const userId = req.user.id;
        const hoje = toLocalYMD(hojeLocal());
        const sel = mesDe(req.query.mes, hoje);
        const selChave = chaveMes(sel);
        const mesAtual = hoje.slice(0, 7);
        const base = normalizarMoeda(req.user.moeda);
        const mes = { ...sel, chave: selChave, atual: mesAtual, anterior: chaveMes(somarMes(sel, -1)), proximo: chaveMes(somarMes(sel, 1)), ultimoDia: ultimoDia(sel) };

        if (!req.pode('rec_estado')) {
            return res.render('limites/index', { title: req.t('limites.titulo'), menuAtivo: 'limites', bloqueado: true, mes, base });
        }

        // Os 5 meses da linha do tempo: dois antes e dois depois do escolhido.
        const janela = [-2, -1, 0, 1, 2].map((i) => { const m = somarMes(sel, i); return { ...m, chave: chaveMes(m) }; });
        const primeiro = janela[0], ultimo = janela[4];
        const inicio = `${primeiro.chave}-01`, fim = `${ultimo.chave}-${pad(ultimoDia(ultimo))}`;
        const inicioSel = `${selChave}-01`, fimSel = `${selChave}-${pad(mes.ultimoDia)}`;

        const [totais] = await db.query(
            `SELECT DATE_FORMAT(l.data_competencia, '%Y-%m') AS ym, l.tipo, SUM(ABS(l.valor)) AS total
             FROM lancamentos l JOIN contas ct ON ct.id = l.conta_id AND ct.status = 'ativa' AND ct.moeda = ?
             WHERE l.user_id = ? AND l.tipo IN ('despesa', 'receita') AND l.data_competencia BETWEEN ? AND ?
             GROUP BY ym, l.tipo`,
            [base, userId, inicio, fim]
        );
        const [gastosCat] = await db.query(
            `SELECT l.categoria_id AS cat_id, SUM(ABS(l.valor)) AS total,
                    SUM(CASE WHEN l.status = 'pendente' THEN ABS(l.valor) ELSE 0 END) AS pendente
             FROM lancamentos l JOIN contas ct ON ct.id = l.conta_id AND ct.status = 'ativa' AND ct.moeda = ?
             WHERE l.user_id = ? AND l.tipo = 'despesa' AND l.data_competencia BETWEEN ? AND ?
             GROUP BY l.categoria_id`,
            [base, userId, inicioSel, fimSel]
        );

        const linhasLim = await Limite.linhasAte(userId, ultimo.chave);
        const gastoMes = (ym) => totais.filter((t) => t.ym === ym && t.tipo === 'despesa').reduce((s, t) => s + num(t.total), 0);
        const receitaMes = (ym) => totais.filter((t) => t.ym === ym && t.tipo === 'receita').reduce((s, t) => s + num(t.total), 0);

        // ---- Tabela por categoria: o gasto das subcategorias soma na categoria ----
        const arvore = (await Categoria.buscarArvoreGerenciar(userId, { arquivadas: false })).filter((c) => !c.e_sistema);
        const gastoDe = new Map(gastosCat.map((g) => [Number(g.cat_id), { total: num(g.total), pendente: num(g.pendente) }]));
        const proprio = (id) => gastoDe.get(id) || { total: 0, pendente: 0 };
        const linha = (c, gasto, pendente) => {
            const planejado = Limite.valorEm(linhasLim, c.id, selChave, c.limite_gasto);
            return {
                id: c.id, nome: c.nome, cor: c.cor || '#3b82f6', planejado, gasto, pendente,
                restante: planejado === null ? null : planejado - gasto,
                pct: planejado ? Math.round(gasto / planejado * 100) : null
            };
        };
        const categorias = arvore.map((c) => {
            const subs = (c.subcategorias || []).filter((s) => !s.e_sistema).map((s) => linha(s, proprio(s.id).total, proprio(s.id).pendente));
            const pg = proprio(c.id);
            const l = linha(c, pg.total + subs.reduce((s, x) => s + x.gasto, 0), pg.pendente + subs.reduce((s, x) => s + x.pendente, 0));
            l.subs = subs;
            return l;
        });
        // Soma dos limites das categorias: o limite de uma subcategoria so entra se a categoria dela nao tem limite proprio.
        const planejadoCats = categorias.reduce((s, c) => s + (c.planejado !== null ? c.planejado : c.subs.reduce((a, x) => a + (x.planejado || 0), 0)), 0);

        const limiteGeral = Limite.valorEm(linhasLim, Limite.GERAL, selChave, null);
        const gasto = gastoMes(selChave);
        const receita = receitaMes(selChave);
        const referencia = limiteGeral || (planejadoCats > 0 ? planejadoCats : null);
        const resumo = {
            limiteGeral, planejadoCats, referencia, gasto, receita,
            restante: referencia === null ? null : referencia - gasto,
            economia: receita > 0 && referencia !== null ? receita - referencia : null,
            pct: referencia ? Math.round(gasto / referencia * 100) : null,
            // Marcador "Hoje" na barra: so no mes em andamento.
            marcadorHoje: selChave === mesAtual ? Math.min(100, Math.round(+hoje.slice(8, 10) / mes.ultimoDia * 100)) : null
        };

        const linhaDoTempo = janela.map((m) => {
            const limite = Limite.valorEm(linhasLim, Limite.GERAL, m.chave, null);
            const g = gastoMes(m.chave);
            return { ...m, gasto: g, limite, pct: limite ? Math.min(100, Math.round(g / limite * 100)) : null, estourou: limite ? g > limite : false, atual: m.chave === mesAtual, selecionado: m.chave === selChave, futuro: m.chave > mesAtual };
        });

        res.render('limites/index', { title: req.t('limites.titulo'), menuAtivo: 'limites', bloqueado: false, mes, base, linhaDoTempo, resumo, categorias });
    },

    // Define o limite de uma categoria a partir de um mes (vazio ou zero remove).
    definirCategoria: async (req, res) => {
        const userId = req.user.id;
        const hoje = toLocalYMD(hojeLocal());
        const anoMes = chaveMes(mesDe(req.body.mes, hoje));
        const cat = await Categoria.buscarPorId(parseInt(req.body.categoria_id, 10), userId);
        if (!cat || cat.sistema || cat.status !== 'ativa') {
            req.session.flash = { tipo: 'erro', mensagem: req.t('limites.flash_erro') };
            return res.redirect('/limites?mes=' + anoMes);
        }
        const valor = req.body.valor ? parseMoeda(req.body.valor) : 0;
        await Limite.definir(userId, cat.id, anoMes, valor, hoje.slice(0, 7));
        req.session.flash = { tipo: 'sucesso', mensagem: req.t(valor > 0 ? 'limites.flash_salvo' : 'limites.flash_removido') };
        res.redirect('/limites?mes=' + anoMes);
    },

    // Limite geral do mes (todas as categorias juntas).
    definirGeral: async (req, res) => {
        const hoje = toLocalYMD(hojeLocal());
        const anoMes = chaveMes(mesDe(req.body.mes, hoje));
        const valor = req.body.valor ? parseMoeda(req.body.valor) : 0;
        await Limite.definir(req.user.id, Limite.GERAL, anoMes, valor, hoje.slice(0, 7));
        req.session.flash = { tipo: 'sucesso', mensagem: req.t(valor > 0 ? 'limites.flash_salvo' : 'limites.flash_removido') };
        res.redirect('/limites?mes=' + anoMes);
    }
};

module.exports = limitesController;
