// Lembretes de vencimento: calculo do proximo horario (no fuso do usuario), montagem do texto e envio do push.
const Lembrete = require('../models/Lembrete');
const push = require('./push');
const { t } = require('./i18n');
const { moeda, descricaoLancamento } = require('./helpers');

const FUSO_PADRAO = process.env.IA_TIMEZONE || 'America/Asuncion';
// Itens listados no texto expandido da notificacao (o Android mostra a lista inteira ao tocar na seta).
const MAX_ITENS_NA_NOTIFICACAO = 5;
const MAX_NOME = 30;
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

// Total por moeda como texto: moedas diferentes nunca se somam ("Gs. 1.000.000 + R$ 20,00").
function totalTexto(lista, padrao) {
    const porMoeda = {};
    lista.forEach((i) => { const c = i.conta_moeda || padrao; porMoeda[c] = (porMoeda[c] || 0) + Number(i.valor_abs); });
    return Object.keys(porMoeda).map((c) => moeda(porMoeda[c], c)).join(' + ');
}

// Data de um lancamento como "AAAA-MM-DD" (o mysql2 devolve DATE como Date a meia-noite local, ou texto).
function ymd(v) {
    if (v instanceof Date) return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
    return String(v || '').slice(0, 10);
}

function diasEntre(deYMD, ateYMD) {
    const [a1, m1, d1] = deYMD.split('-').map(Number);
    const [a2, m2, d2] = ateYMD.split('-').map(Number);
    return Math.round((Date.UTC(a2, m2 - 1, d2) - Date.UTC(a1, m1 - 1, d1)) / 86400000);
}

function encurtar(txt) {
    const s = String(txt || '').replace(/\s+/g, ' ').trim();
    return s.length > MAX_NOME ? s.slice(0, MAX_NOME - 1).trimEnd() + '…' : s;
}

// Monta a notificacao de uma data (ou null se nao ha nada). "atrasadas" (despesas vencidas e ainda pendentes) entram so
// na notificacao do dia. Formato (sem emojis):
//   titulo  "Vence hoy: 2 a pagar, 1 a cobrar"  ou, so com atrasos, "4 pagos atrasados"
//   linha 1 os totais, que e o que aparece com a notificacao fechada
//   depois  ate 5 lancamentos "Pagar · Alquiler · Gs. 2.000.000 · 3 días de atraso" e "y N más", vistos ao expandir
function montarNotificacao(itens, atrasadas, dataYMD, deslocamentoDias, { idioma, moeda: cod }) {
    const g = agrupar(itens);
    if (!itens.length && !atrasadas.length) return null;
    const tr = (k, p) => t(k, p, idioma);
    const plural = (chave, n) => tr(n === 1 ? chave + '_1' : chave, { n });

    let titulo;
    const linhas = [];
    if (itens.length) {
        const partes = [];
        if (g.pagar.length) partes.push(tr('lembrete.parte_pagar', { n: g.pagar.length }));
        if (g.receber.length) partes.push(tr('lembrete.parte_receber', { n: g.receber.length }));
        if (g.transf.length) partes.push(plural('lembrete.parte_transf', g.transf.length));
        titulo = tr(deslocamentoDias === 0 ? 'lembrete.t_hoje' : 'lembrete.t_amanha', { partes: partes.join(', ') });
        const totais = [];
        if (g.pagar.length) totais.push(tr('lembrete.resumo_pagar', { valor: totalTexto(g.pagar, cod) }));
        if (g.receber.length) totais.push(tr('lembrete.resumo_receber', { valor: totalTexto(g.receber, cod) }));
        if (g.transf.length) totais.push(tr('lembrete.resumo_transf', { valor: totalTexto(g.transf, cod) }));
        linhas.push(totais.join(' · '));
        if (atrasadas.length) linhas.push(tr('lembrete.atrasadas', { n: atrasadas.length, valor: totalTexto(atrasadas, cod) }));
    } else {
        titulo = plural('lembrete.so_atrasadas', atrasadas.length);
        linhas.push(tr('lembrete.resumo_atraso', { valor: totalTexto(atrasadas, cod) }));
    }

    // Os do dia primeiro (o titulo fala deles, maiores valores antes), depois os atrasados (os mais antigos antes).
    const lista = [
        ...g.pagar.map((i) => ({ i, rot: 'lembrete.rot_pagar' })),
        ...g.receber.map((i) => ({ i, rot: 'lembrete.rot_receber' })),
        ...g.transf.map((i) => ({ i, rot: 'lembrete.rot_transf', nome: descricaoLancamento(i, (k) => tr(k)) })),
        ...atrasadas.map((i) => ({ i, rot: 'lembrete.rot_pagar', atraso: diasEntre(ymd(i.data_competencia), dataYMD) }))
    ];
    lista.slice(0, MAX_ITENS_NA_NOTIFICACAO).forEach(({ i, rot, nome, atraso }) => {
        const campos = [tr(rot), encurtar(nome || i.descricao), moeda(i.valor_abs, i.conta_moeda || cod)];
        if (atraso > 0) campos.push(tr(atraso === 1 ? 'painel.dia_atraso' : 'painel.dias_atraso', { n: atraso }));
        linhas.push(campos.join(' · '));
    });
    if (lista.length > MAX_ITENS_NA_NOTIFICACAO) linhas.push(tr('lembrete.itens_mais', { n: lista.length - MAX_ITENS_NA_NOTIFICACAO }));
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
    // Modulo Clientes: renova as cuotas dos contratos sem prazo e, se o usuario quiser, avisa os vencimentos de hoje.
    if (cfg.clientes_habilitado) {
        try {
            const Cliente = require('../models/Cliente');
            await Cliente.renovarContratos(cfg.user_id);
            if (cfg.aviso_clientes) {
                const payload = montarAvisoClientes(await Cliente.vencimentosDoDia(cfg.user_id, hoje), hoje, cfg);
                if (payload) {
                    gerados++;
                    await enviarParaUsuario(cfg.user_id, payload);
                }
            }
        } catch (err) {
            console.error('Falha no aviso de clientes do usuario', cfg.user_id, err.message);
        }
    }
    // Modulo Compras: itens que provavelmente estao acabando (pelo ritmo de compra de cada um), se o usuario quiser o aviso.
    if (cfg.compras_habilitado && cfg.aviso_compras) {
        try {
            const Compra = require('../models/Compra');
            const avisos = await Compra.avisos(cfg.user_id, hoje, { paraNotificacao: true });
            const payload = montarAvisoCompras(avisos, hoje, cfg);
            if (payload) {
                gerados++;
                await enviarParaUsuario(cfg.user_id, payload);
                await Compra.marcarNotificados(cfg.user_id, avisos.map((a) => a.id), hoje);
            }
        } catch (err) {
            console.error('Falha no aviso de compras do usuario', cfg.user_id, err.message);
        }
    }
    // Cartao de credito: faturas em aberto que vencem hoje ou amanha, se o usuario quiser o aviso.
    if (cfg.aviso_cartoes) {
        try {
            const Cartao = require('../models/Cartao');
            const payload = montarAvisoCartoes(await Cartao.vencimentos(cfg.user_id, [hoje, somarDias(hoje, 1)]), hoje, cfg);
            if (payload) {
                gerados++;
                await enviarParaUsuario(cfg.user_id, payload);
            }
        } catch (err) {
            console.error('Falha no aviso de cartoes do usuario', cfg.user_id, err.message);
        }
    }
    return gerados;
}

// Faturas que vencem hoje ou amanha: nome do cartao e valor de cada uma (ate 3) e o total por moeda.
function montarAvisoCartoes(faturas, dataYMD, { idioma, moeda: cod }) {
    if (!faturas.length) return null;
    const tr = (k, p) => t(k, p, idioma);
    const hojeN = faturas.filter((f) => f.vencimento === dataYMD).length;
    const titulo = hojeN === faturas.length ? tr('lembrete.cartoes_titulo_hoje', { n: faturas.length })
        : hojeN === 0 ? tr('lembrete.cartoes_titulo_amanha', { n: faturas.length }) : tr('lembrete.cartoes_titulo_varias', { n: faturas.length });
    const linhas = faturas.slice(0, MAX_ITENS_NA_NOTIFICACAO).map((f) => {
        const quando = f.vencimento === dataYMD ? tr('lembrete.cartoes_hoje') : tr('lembrete.cartoes_amanha');
        return `${f.nome} (${quando}): ${moeda(f.total, f.moeda || cod)}`;
    });
    if (faturas.length > MAX_ITENS_NA_NOTIFICACAO) linhas.push(tr('lembrete.compras_mais', { n: faturas.length - MAX_ITENS_NA_NOTIFICACAO }));
    return { title: titulo, body: linhas.join('\n'), url: `/cartoes/${faturas[0].cartao_id}?mes=${faturas[0].mes}`, tag: `cartoes-${dataYMD}` };
}

// "N itens provavelmente acabando": nomes dos tres primeiros; a lista completa e a tela de Compras.
function montarAvisoCompras(avisos, dataYMD, { idioma }) {
    if (!avisos.length) return null;
    const tr = (k, p) => t(k, p, idioma);
    const nomes = avisos.slice(0, 3).map((a) => a.nome).join(', ');
    const resto = avisos.length > 3 ? ' ' + tr('lembrete.compras_mais', { n: avisos.length - 3 }) : '';
    return { title: tr('lembrete.compras_titulo', { n: avisos.length }), body: nomes + resto, url: '/compras', tag: `compras-${dataYMD}` };
}

// "Hoje vencem N clientes": so a quantidade e o total a cobrar por moeda (a lista completa fica na tela de Clientes).
function montarAvisoClientes(v, dataYMD, { idioma, moeda: cod }) {
    const tr = (k, p) => t(k, p, idioma);
    const n = v.porMoeda.reduce((s, r) => s + Number(r.clientes), 0);
    if (!n && !v.atrasados) return null;
    const linhas = [];
    if (n) linhas.push(tr('lembrete.clientes_total', { valor: v.porMoeda.map((r) => moeda(r.valor, r.moeda || cod)).join(' + ') }));
    if (n && v.atrasados) linhas.push(tr('lembrete.clientes_atrasados', { n: v.atrasados }));
    return {
        title: n ? tr('lembrete.clientes_titulo', { n }) : tr('lembrete.clientes_so_atrasados', { n: v.atrasados }),
        body: linhas.join('\n'),
        url: n ? `/clientes?dia=${dataYMD}` : '/clientes?mes=todos&estado=vencidas',
        tag: `clientes-${dataYMD}`
    };
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
    FUSO_PADRAO, fusoValido, horaValida, partesNoFuso, proximoEnvio, dataLocalYMD, somarDias,
    montarNotificacao, montarAvisoClientes, montarAvisoCompras, montarAvisoCartoes, totalTexto, enviarParaUsuario, processarDevidos
};
