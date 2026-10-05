// "Moeda em foco": paineis e relatorios mostram uma moeda por vez (moedas diferentes nao se somam). A escolha vale para a
// requisicao inteira e e lida pelas consultas de agregacao (Lancamento, relatorios) sem precisar passar um parametro por
// todas as funcoes: o middleware guarda a moeda num AsyncLocalStorage e as consultas pedem filtroConta()/CONTA_ATIVA.
// Fora de uma requisicao (rotinas agendadas, scripts) nao ha moeda em foco e nada e filtrado.
const { AsyncLocalStorage } = require('async_hooks');
const db = require('../config/db');
const { MOEDAS_CONTA, normalizarMoeda } = require('./helpers');

const armazenamento = new AsyncLocalStorage();

function moedaEmFoco() {
    const s = armazenamento.getStore();
    return s && MOEDAS_CONTA.includes(s.moeda) ? s.moeda : null;
}

// Moeda principal do usuario (a das Configuracoes). Os limites de gasto das categorias valem so nela.
function moedaBase() {
    const s = armazenamento.getStore();
    return s && MOEDAS_CONTA.includes(s.base) ? s.base : null;
}

// Condicao SQL extra para uma tabela/alias de contas (ex.: filtroConta('c') => " AND c.moeda = 'BRL'"). A moeda vem da
// lista fixa MOEDAS_CONTA, nunca do usuario direto.
function filtroConta(alias = 'c') {
    const m = moedaEmFoco();
    return m ? ` AND ${alias}.moeda = '${m}'` : '';
}

// Lancamentos (alias l) de contas ativas, na moeda em foco. Usado como ${CONTA_ATIVA} nas consultas de Lancamento.
function contaAtivaSql() {
    return `l.conta_id IN (SELECT id FROM contas WHERE user_id = l.user_id AND status = 'ativa'${filtroConta('contas')})`;
}

// Objeto que vira o SQL ao ser usado em texto (template string ou "+"), mantendo as consultas antigas como estavam.
const CONTA_ATIVA = { toString: contaAtivaSql, valueOf: contaAtivaSql };

function executarCom(moeda, fn, base = null) { return armazenamento.run({ moeda, base }, fn); }

// Escolhe a moeda em foco: ?moeda=XXX (e lembra na sessao), senao a ultima escolhida, senao a moeda principal do usuario,
// senao a primeira moeda que ele tem em contas ativas. So vale moeda de uma conta ativa.
async function moedaFocoMiddleware(req, res, next) {
    try {
        // So as telas que somam valores de varias contas: painel e relatorios.
        const aplica = req.path === '/' || req.path.startsWith('/relatorios');
        if (!req.user || req.method !== 'GET' || !aplica) return next();
        const [rows] = await db.query("SELECT DISTINCT moeda FROM contas WHERE user_id = ? AND status = 'ativa'", [req.user.id]);
        const disponiveis = rows.map((r) => r.moeda).filter((m) => MOEDAS_CONTA.includes(m));
        if (!disponiveis.length) return next();
        const base = normalizarMoeda(req.user.moeda);
        disponiveis.sort((a, b) => (a === base ? -1 : b === base ? 1 : MOEDAS_CONTA.indexOf(a) - MOEDAS_CONTA.indexOf(b)));

        const pedida = normalizarMoeda(req.query && req.query.moeda, '');
        let foco = disponiveis.includes(pedida) ? pedida : null;
        if (foco && req.session) req.session.moeda_foco = foco;
        if (!foco && req.session && disponiveis.includes(req.session.moeda_foco)) foco = req.session.moeda_foco;
        if (!foco) foco = disponiveis[0];

        req.moedaFoco = foco;
        res.locals.moedaFoco = foco;
        res.locals.moedasFoco = disponiveis;
        res.locals.currency = foco; // valores, mascaras de campo e graficos da tela falam esta moeda
        res.locals.linkMoeda = (m) => {
            const u = new URL(req.originalUrl, 'http://local');
            u.searchParams.set('moeda', m);
            return u.pathname + u.search;
        };
        return executarCom(foco, () => next(), base);
    } catch (err) {
        return next(err);
    }
}

module.exports = { moedaEmFoco, moedaBase, filtroConta, CONTA_ATIVA, executarCom, moedaFocoMiddleware };
