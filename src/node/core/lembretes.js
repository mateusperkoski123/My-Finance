// Lembretes de vencimento: calculo do proximo horario (no fuso do usuario), montagem do texto e envio do push.
const Lembrete = require('../models/Lembrete');
const push = require('./push');
const { t } = require('./i18n');
const { moeda } = require('./helpers');

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

// Monta a notificacao de uma data (ou null se nao ha despesas). Nome e valor de cada despesa, e o total ao final.
function montarNotificacao(despesas, dataYMD, deslocamentoDias, { idioma, moeda: cod }) {
    if (!despesas.length) return null;
    const n = despesas.length;
    const total = despesas.reduce((s, d) => s + Number(d.valor), 0);
    const prefixo = deslocamentoDias === 0 ? 'lembrete.titulo_hoje' : 'lembrete.titulo_amanha';
    const titulo = t(n === 1 ? `${prefixo}_um` : `${prefixo}_n`, { n }, idioma);
    const linhas = despesas.slice(0, MAX_ITENS_NA_NOTIFICACAO).map((d) => `${d.descricao}: ${moeda(d.valor, cod)}`);
    if (n > MAX_ITENS_NA_NOTIFICACAO) linhas.push(t('lembrete.mais', { n: n - MAX_ITENS_NA_NOTIFICACAO }, idioma));
    linhas.push(t('lembrete.total', { valor: moeda(total, cod) }, idioma));
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
async function enviarAvisos(cfg, agoraMs) {
    const hoje = dataLocalYMD(agoraMs, cfg.fuso);
    const dias = [];
    if (cfg.aviso_dia) dias.push(0);
    if (cfg.aviso_antes) dias.push(1);
    let gerados = 0;
    for (const dd of dias) {
        const data = somarDias(hoje, dd);
        const despesas = await Lembrete.despesasDoDia(cfg.user_id, data);
        const payload = montarNotificacao(despesas, data, dd, cfg);
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
    return resumo;
}

module.exports = {
    FUSO_PADRAO, fusoValido, horaValida, proximoEnvio, dataLocalYMD, somarDias,
    montarNotificacao, enviarParaUsuario, processarDevidos
};
