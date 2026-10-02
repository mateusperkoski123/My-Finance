// Estatisticas agregadas do sistema (painel do admin e, no futuro, avisos para todos os usuarios).
// So numeros agregados: nenhuma funcao daqui devolve dados de um usuario especifico, exceto as listas "recentes" do admin.
// Os dias sao contados no fuso do negocio (IA_TIMEZONE, padrao America/Asuncion), mesmo que o servidor/banco rodem em UTC.
const db = require('../config/db');
const { hojeUso } = require('../core/ia_precos');

const TTL_MS = 60 * 1000; // o painel pode ser aberto varias vezes: recalcula no maximo 1x por minuto
const DIAS_SERIE = 62; // 2 meses de historico diario (alimenta os periodos, os comparativos e os graficos)
const cache = new Map();

const tzNegocio = () => process.env.IA_TIMEZONE || 'America/Asuncion';
const pad = (n) => String(n).padStart(2, '0');
const ymdDeMs = (ms) => { const d = new Date(ms); return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`; };
const msDeYmd = (ymd) => { const [y, m, d] = ymd.split('-').map(Number); return Date.UTC(y, m - 1, d); };
const somarDias = (ymd, n) => ymdDeMs(msDeYmd(ymd) + n * 86400000);
const dtDb = (ms) => { const d = new Date(ms); return `${ymdDeMs(ms)} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}`; };

// Diferenca (em minutos) entre o relogio do negocio e o do banco: relogio_banco = relogio_negocio - diff.
function offsetNegocioMin(agora = new Date()) {
    const p = new Intl.DateTimeFormat('en-US', { timeZone: tzNegocio(), hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
        .formatToParts(agora).reduce((o, x) => { o[x.type] = x.value; return o; }, {});
    const comoUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((comoUtc - Math.floor(agora.getTime() / 1000) * 1000) / 60000);
}

async function contexto() {
    const [[r]] = await db.query('SELECT TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW()) AS m');
    const diff = offsetNegocioMin() - Number(r.m);
    const hoje = hojeUso();
    return { diff, hoje, aBanco: (ymd) => dtDb(msDeYmd(ymd) - diff * 60000) };
}

// Periodos (inclusivos, em dias do negocio) usados no painel.
function periodos(hoje) {
    const [y, m, d] = hoje.split('-').map(Number);
    const iniMes = `${y}-${pad(m)}-01`;
    const iniMesAnt = ymdDeMs(Date.UTC(y, m - 2, 1));
    const diasMesAnt = new Date(Date.UTC(y, m - 1, 0)).getUTCDate();
    const fimMesAnt = somarDias(iniMesAnt, Math.min(d, diasMesAnt) - 1); // "mesmo periodo" do mes anterior
    return {
        hoje: [hoje, hoje],
        ontem: [somarDias(hoje, -1), somarDias(hoje, -1)],
        sem: [somarDias(hoje, -6), hoje],
        semAnt: [somarDias(hoje, -13), somarDias(hoje, -7)],
        mes: [iniMes, hoje],
        mesAnt: [iniMesAnt, fimMesAnt]
    };
}

function dias(hoje, n = DIAS_SERIE) { const lista = []; for (let i = n - 1; i >= 0; i--) lista.push(somarDias(hoje, -i)); return lista; }

// Soma uma serie diaria { 'YYYY-MM-DD': valor } dentro de [ini, fim]
function somar(serie, [ini, fim]) { let t = 0; for (const [k, v] of Object.entries(serie)) if (k >= ini && k <= fim) t += Number(v) || 0; return t; }
function porPeriodo(serie, per) { const o = {}; for (const k of Object.keys(per)) o[k] = somar(serie, per[k]); return o; }
const mapa = (rows, chave = 'n') => { const o = {}; rows.forEach((r) => { o[r.dia] = Number(r[chave]) || 0; }); return o; };

async function calcular() {
    const ctx = await contexto();
    const per = periodos(ctx.hoje);
    const lista = dias(ctx.hoje);
    const iniSerie = lista[0];
    const iniBanco = ctx.aBanco(iniSerie);
    const dia = (col) => `DATE_FORMAT(DATE_ADD(${col}, INTERVAL ${Number(ctx.diff)} MINUTE), '%Y-%m-%d')`;
    // Transacao registrada = uma acao do usuario: receita/despesa (uma serie fixa/repetida conta 1) ou transferencia (as duas pernas contam 1).
    const ehTransacao = "(tipo IN ('receita','despesa') OR (tipo = 'transferencia' AND valor < 0))";

    const [tx, usu, pag, pagantes, ia] = await Promise.all([
        db.query(`SELECT ${dia('created_at')} AS dia, COUNT(DISTINCT COALESCE(serie_id, id)) AS n FROM lancamentos WHERE created_at >= ? AND ${ehTransacao} GROUP BY 1`, [iniBanco]),
        db.query(`SELECT ${dia('created_at')} AS dia, COUNT(*) AS n FROM users WHERE created_at >= ? GROUP BY 1`, [iniBanco]),
        db.query(`SELECT ${dia('pago_em')} AS dia, COUNT(*) AS n, COALESCE(SUM(valor), 0) AS valor FROM pagamentos WHERE status = 'pago' AND pago_em >= ? GROUP BY 1`, [iniBanco]),
        db.query(`SELECT ${dia('primeiro')} AS dia, COUNT(*) AS n FROM (SELECT user_id, MIN(pago_em) AS primeiro FROM pagamentos WHERE status = 'pago' AND user_id IS NOT NULL GROUP BY user_id) x WHERE primeiro >= ? GROUP BY 1`, [iniBanco]),
        db.query(`SELECT DATE_FORMAT(dia, '%Y-%m-%d') AS dia, SUM(mensagens) AS mensagens, SUM(imagens) AS imagens, SUM(audios) AS audios, SUM(audio_segundos) AS segundos,
                         SUM(custo_texto_micro + custo_imagem_micro + custo_audio_micro) AS custo, COUNT(DISTINCT user_id) AS usuarios
                  FROM ia_uso_diario WHERE dia >= ? GROUP BY dia`, [iniSerie])
    ]);
    const S = {
        transacoes: mapa(tx[0]), novosUsuarios: mapa(usu[0]), pagamentos: mapa(pag[0]), receita: mapa(pag[0], 'valor'), novosPagantes: mapa(pagantes[0]),
        iaMensagens: mapa(ia[0], 'mensagens'), iaFotos: mapa(ia[0], 'imagens'), iaAudios: mapa(ia[0], 'audios'), iaCusto: mapa(ia[0], 'custo'), iaUsuarios: mapa(ia[0], 'usuarios')
    };
    const resumo = {};
    for (const k of Object.keys(S)) resumo[k] = porPeriodo(S[k], per);

    // Atividade (ultimo acesso) e totais gerais
    const limiteAtivo = (ymd) => ctx.aBanco(ymd);
    const [[ativ]] = await db.query(
        `SELECT SUM(g >= ?) AS hoje, SUM(g >= ?) AS sem, SUM(g >= ?) AS mes, COUNT(*) AS total
         FROM (SELECT GREATEST(COALESCE(ultimo_login_em, '1970-01-01'), COALESCE(ultimo_acesso_em, '1970-01-01')) AS g FROM users WHERE status <> 'arquivado') x`,
        [limiteAtivo(per.hoje[0]), limiteAtivo(per.sem[0]), limiteAtivo(somarDias(ctx.hoje, -29))]);
    const [[tot]] = await db.query(`SELECT COUNT(DISTINCT COALESCE(serie_id, id)) AS n FROM lancamentos WHERE ${ehTransacao}`);
    const [[iaTot]] = await db.query('SELECT COALESCE(SUM(mensagens), 0) AS m, COALESCE(SUM(imagens), 0) AS i, COALESCE(SUM(audios), 0) AS a FROM ia_uso_diario');
    const [[venc3]] = await db.query("SELECT COUNT(*) AS n FROM assinaturas WHERE status = 'trial' AND trial_fim > NOW() AND trial_fim <= DATE_ADD(NOW(), INTERVAL 3 DAY)");
    const [[conv]] = await db.query(
        `SELECT COUNT(*) AS novos, SUM(EXISTS (SELECT 1 FROM pagamentos p WHERE p.user_id = u.id AND p.status = 'pago')) AS pagaram
         FROM users u WHERE u.created_at >= ? AND u.role <> 'admin'`, [ctx.aBanco(somarDias(ctx.hoje, -29))]);
    const [idiomas] = await db.query("SELECT idioma, COUNT(*) AS n FROM users WHERE status <> 'arquivado' GROUP BY idioma ORDER BY n DESC");
    const [recentesUsuarios] = await db.query("SELECT id, nome, email, idioma, created_at FROM users ORDER BY id DESC LIMIT 8");
    const [recentesPagamentos] = await db.query(
        `SELECT p.id, p.valor, p.moeda, p.ciclo, p.pago_em, u.nome AS usuario, pl.codigo AS plano
         FROM pagamentos p LEFT JOIN users u ON u.id = p.user_id LEFT JOIN planos pl ON pl.id = p.plano_id
         WHERE p.status = 'pago' ORDER BY p.pago_em DESC, p.id DESC LIMIT 8`);

    const serie = (chave) => lista.map((d) => ({ d, n: S[chave][d] || 0 }));
    return {
        geradoEm: new Date().toISOString(), hoje: ctx.hoje, fuso: tzNegocio(), periodos: per,
        resumo,
        series: { dias: lista.slice(-30), transacoes: serie('transacoes').slice(-30), novosUsuarios: serie('novosUsuarios').slice(-30), iaMensagens: serie('iaMensagens').slice(-30), receita: serie('receita').slice(-30) },
        ativos: { hoje: Number(ativ.hoje) || 0, sem: Number(ativ.sem) || 0, mes: Number(ativ.mes) || 0, total: Number(ativ.total) || 0 },
        totais: { transacoes: Number(tot.n) || 0, iaMensagens: Number(iaTot.m), iaFotos: Number(iaTot.i), iaAudios: Number(iaTot.a) },
        trialsVencendo3d: Number(venc3.n) || 0,
        conversao30d: { novos: Number(conv.novos) || 0, pagaram: Number(conv.pagaram) || 0 },
        idiomas, recentesUsuarios, recentesPagamentos
    };
}

class Estatisticas {
    // Painel completo do admin (cache de 1 minuto).
    static async painel({ forcar = false } = {}) {
        const c = cache.get('painel');
        if (!forcar && c && Date.now() - c.em < TTL_MS) return c.dados;
        const dados = await calcular();
        cache.set('painel', { em: Date.now(), dados });
        return dados;
    }

    // Numeros agregados para avisos aos usuarios ("So hoje tivemos N transacoes registradas"). Nada que identifique alguem.
    static async publicas() {
        const p = await this.painel();
        return { geradoEm: p.geradoEm, transacoes: { hoje: p.resumo.transacoes.hoje, semana: p.resumo.transacoes.sem, mes: p.resumo.transacoes.mes, total: p.totais.transacoes } };
    }

    static limparCache() { cache.clear(); }
}

Estatisticas._interno = { periodos, somarDias, offsetNegocioMin, dtDb, msDeYmd };
module.exports = Estatisticas;
