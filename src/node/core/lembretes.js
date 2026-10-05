// Lembretes de vencimento: calculo do proximo horario (no fuso do usuario), montagem do texto e envio do push.
const Lembrete = require('../models/Lembrete');
const push = require('./push');
const { t } = require('./i18n');
const { moeda, descricaoLancamento } = require('./helpers');

const FUSO_PADRAO = process.env.IA_TIMEZONE || 'America/Asuncion';
const MAX_ITENS_NA_NOTIFICACAO = 4;
const LOTE = 10;

function fusoValido(fuso) {
    try {
        new Intl.DateTimeFormat('en-US', { timeZone: fuso });
        return true;
    } catch (e) {
        return false;
    }
}

// Horarios de 30 em 30 minutos: "08:00", "08:30"...
function horaValida(hora) {
    return /^([01]\d|2[0-3]):(00|30)$/.test(String(hora || ''));
}

function partesNoFuso(ms, fuso) {
    const f = new Intl.DateTimeFormat('en-CA', {
        timeZone: fuso, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const p = {};
    f.formatToParts(new Date(ms)).forEach((x) => { if (x.type !== 'literal') p[x.type] = parseInt(x.value, 10); });
    return p;
}

function deslocamento(ms, fuso) {
    const p = partesNoFuso(ms, fuso);
    return Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second) - Math.floor(ms / 1000) * 1000;
}

// Instante UTC (ms) em que o relogio do fuso marca a data/hora informadas.
function localParaEpoch(ano, mes, dia, hora, minuto, fuso) {
    const base = Date.UTC(ano, mes - 1, dia, hora, minuto);
    const primeira = base - deslocamento(base, fuso);
    return base - deslocamento(primeira, fuso);
}

// Proximo instante (ms, UTC) em que o relogio do fuso marca "hora", estritamente depois de agoraMs.
function proximoEnvio(hora, fuso, agoraMs = Date.now()) {
    const [h, m] = hora.split(':').map(Number);
    const p = partesNoFuso(agoraMs, fuso);
    const hoje = localParaEpoch(p.year, p.month, p.day, h, m, fuso);
    if (hoje > agoraMs) return hoje;
    const amanha = new Date(Date.UTC(p.year, p.month - 1, p.day + 1));
    return localParaEpoch(amanha.getUTCFullYear(), amanha.getUTCMonth() + 1, amanha.getUTCDate(), h, m, fuso);
}

function dataLocalYMD(ms, fuso) {
    const p = partesNoFuso(ms, fuso);
    return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

function somarDias(ymd, dias) {
    const [a, m, d] = ymd.split('-').map(Number);
    const x = new Date(Date.UTC(a, m - 1, d + dias));
    return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}-${String(x.getUTCDate()).padStart(2, '0')}`;
}

// Separa as pendencias de um dia em a pagar (despesas), a receber (receitas) e transferencias.
function agrupar(itens) {
    return {
        pagar: itens.filter((i) => i.tipo === 'despesa'),
        receber: itens.filter((i) => i.tipo === 'receita'),
        transf: itens.filter((i) => i.tipo === 'transferencia')
    };
}

const soma = (lista) => lista.reduce((s, i) => s + Number(i.valor_abs), 0);

// Monta a notificacao de uma data (ou null se nao ha nada). Cada item mostra nome e valor; ao final, os totais.
// "atrasadas" (despesas vencidas e ainda pendentes) entram so na notificacao que as carrega.
function montarNotificacao(itens, atrasadas, dataYMD, deslocamentoDias, { idioma, moeda: cod }) {
    const g = agrupar(itens);
    if (!itens.length && !atrasadas.length) return null;
    const tr = (k, p) => t(k, p, idioma);
    const partes = [];
    if (g.pagar.length) partes.push(tr('lembrete.parte_pagar', { n: g.pagar.length }));
    if (g.receber.length) partes.push(tr('lembrete.parte_receber', { n: g.receber.length }));
    if (g.transf.length) partes.push(tr('lembrete.parte_transf', { n: g.transf.length }));
    if (atrasadas.length) partes.push(tr('lembrete.parte_atrasadas', { n: atrasadas.length }));
    const titulo = tr(deslocamentoDias === 0 ? 'lembrete.t_hoje' : 'lembrete.t_amanha', { partes: partes.join(', ') });

    const linhas = [];
    const todos = [
        ...g.pagar.map((i) => [tr('lembrete.rot_pagar'), i.descricao, i.valor_abs]),
        ...g.receber.map((i) => [tr('lembrete.rot_receber'), i.descricao, i.valor_abs]),
        ...g.transf.map((i) => [tr('lembrete.rot_transf'), descricaoLancamento(i, (k) => tr(k)), i.valor_abs])
    ];
    todos.slice(0, MAX_ITENS_NA_NOTIFICACAO).forEach(([rot, nome, valor]) => linhas.push(`${rot} ${nome}: ${moeda(valor, cod)}`));
    if (todos.length > MAX_ITENS_NA_NOTIFICACAO) linhas.push(tr('lembrete.mais', { n: todos.length - MAX_ITENS_NA_NOTIFICACAO }));
    if (g.pagar.length) linhas.push(tr('lembrete.total', { valor: moeda(soma(g.pagar), cod) }));
    if (g.receber.length) linhas.push(tr('lembrete.total_receber', { valor: moeda(soma(g.receber), cod) }));
    if (atrasadas.length) linhas.push(tr('lembrete.atrasadas', { n: atrasadas.length, valor: moeda(soma(atrasadas), cod) }));
    return { title: titulo, body: linhas.join('\n'), url: `/lembretes/vencimentos?data=${dataYMD}`, tag: `vencimentos-${dataYMD}` };
}

async function enviarParaUsuario(userId, payload) {
    const aparelhos = await Lembrete.inscricoes(userId);
    let entregues = 0;
    for (const a of aparelhos) {
        const r = await push.enviar(a, payload);
        if (r.ok) {
            entregues++;
            Lembrete.marcarEnviada(a.id).catch(() => {});
        } else if (r.expirada) {
            await Lembrete.removerPorId(a.id);
        }
    }
    return entregues;
}

// Envia os avisos configurados (hoje e/ou amanha) de um usuario. Retorna quantas notificacoes foram geradas.
// As despesas atrasadas vao junto do aviso de hoje; se o usuario so quer "1 dia antes", vao em um aviso proprio.
async function enviarAvisos(cfg, agoraMs) {
    const hoje = dataLocalYMD(agoraMs, cfg.fuso);
    const atrasadas = await Lembrete.despesasAtrasadas(cfg.user_id, hoje);
    const dias = [];
    if (cfg.aviso_dia || atrasadas.length) dias.push(0);
    if (cfg.aviso_antes) dias.push(1);
    let gerados = 0;
    for (const dd of dias) {
        const data = somarDias(hoje, dd);
        const itens = dd === 0 && !cfg.aviso_dia ? [] : await Lembrete.pendentesDoDia(cfg.user_id, data);
        const payload = montarNotificacao(itens, dd === 0 ? atrasadas : [], data, dd, cfg);
        if (!payload) continue;
        gerados++;
        await enviarParaUsuario(cfg.user_id, payload);
    }
    return gerados;
}

// Chamado pelo cron externo: processa todo mundo cujo horario ja chegou.
async function processarDevidos() {
    const agora = Date.now();
    const resumo = { devidos: 0, avisos: 0, erros: 0 };
    if (!push.disponivel()) return Object.assign(resumo, { desligado: true });
    const lista = await Lembrete.devidos(agora);
    resumo.devidos = lista.length;
    for (let i = 0; i < lista.length; i += LOTE) {
        await Promise.all(lista.slice(i, i + LOTE).map(async (cfg) => {
            try {
                const novo = proximoEnvio(cfg.hora, cfg.fuso, agora);
                if (!(await Lembrete.reservar(cfg.user_id, Number(cfg.proximo_envio), novo))) return;
                resumo.avisos += await enviarAvisos(cfg, agora);
            } catch (err) {
                resumo.erros++;
                console.error('Falha no lembrete do usuario', cfg.user_id, err.message);
            }
        }));
    }
    // Financeiro (cobrancas por inatividade): um erro aqui nunca atrapalha os lembretes de vencimento.
    try {
        resumo.financeiro = await require('./financeiro').processarDevidos(agora);
    } catch (err) {
        console.error('Falha no Financeiro:', err.message);
    }
    return resumo;
}

module.exports = {
    FUSO_PADRAO, fusoValido, horaValida, proximoEnvio, dataLocalYMD, somarDias,
    montarNotificacao, enviarParaUsuario, processarDevidos
};
