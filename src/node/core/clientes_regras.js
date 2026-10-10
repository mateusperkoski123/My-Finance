// Regras puras do modulo Clientes (sem banco): datas de vencimento, quantidade de cuotas e normalizacao de textos.
// Todas as datas sao 'YYYY-MM-DD' (calendario, sem fuso).

const pad = (n) => String(n).padStart(2, '0');
const ymd = (a, m, d) => `${a}-${pad(m)}-${pad(d)}`;

function partes(data) {
    const [a, m, d] = String(data).split('-').map(Number);
    return { a, m, d };
}

function ultimoDiaDoMes(ano, mes) {
    return new Date(Date.UTC(ano, mes, 0)).getUTCDate(); // mes 1-12
}

// Vencimento do dia `dia` no mes (1-12); meses curtos usam o ultimo dia (dia 31 em fevereiro = 28/29).
function vencimento(ano, mes, dia) {
    const ajustado = new Date(Date.UTC(ano, mes - 1, 1));
    const a = ajustado.getUTCFullYear();
    const m = ajustado.getUTCMonth() + 1;
    return ymd(a, m, Math.min(dia, ultimoDiaDoMes(a, m)));
}

// Primeiro vencimento: o proximo `dia` a partir da data de inicio (no proprio dia de inicio, vale o dia).
function primeiroVencimento(inicio, dia) {
    const { a, m, d } = partes(inicio);
    const mesmoMes = vencimento(a, m, dia);
    if (mesmoMes >= inicio) return mesmoMes;
    return vencimento(a, m + 1, dia);
}

function passoMeses(periodicidade) {
    return periodicidade === 'anual' ? 12 : 1;
}

// Vencimento da cuota de numero `num` (1 = primeira). Sempre calculado a partir da primeira, nunca encadeado,
// para o dia 31 voltar a ser 31 depois de um mes curto.
function vencimentoDaCuota(primeiro, periodicidade, dia, num) {
    const { a, m } = partes(primeiro);
    return vencimento(a, m + (num - 1) * passoMeses(periodicidade), dia);
}

// Quantas cuotas tem o contrato: mensal = meses do prazo; anual = anos do prazo (minimo 1). Sem prazo = null.
function totalDeCuotas(periodicidade, prazoMeses) {
    if (prazoMeses === null || prazoMeses === undefined || prazoMeses === '') return null;
    const p = parseInt(prazoMeses, 10);
    if (!(p > 0)) return null;
    return periodicidade === 'anual' ? Math.max(1, Math.ceil(p / 12)) : p;
}

function somarMeses(data, n) {
    const { a, m, d } = partes(data);
    return vencimento(a, m + n, d);
}

// Ate onde os contratos sem prazo ficam gerados: 12 meses a frente (mensal) ou 24 (anual).
function horizonte(hoje, periodicidade) {
    return somarMeses(hoje, periodicidade === 'anual' ? 24 : 12);
}

// Cuotas a gerar de `desdeNum` em diante. Com prazo: ate o total. Sem prazo: ate o horizonte.
function cuotasAGerar({ primeiro, periodicidade, dia, total, desdeNum = 1, hoje }) {
    const lista = [];
    const limite = total !== null && total !== undefined ? null : horizonte(hoje, periodicidade);
    for (let num = desdeNum; num < desdeNum + 1200; num++) {
        if (total !== null && total !== undefined && num > total) break;
        const data = vencimentoDaCuota(primeiro, periodicidade, dia, num);
        lista.push({ num, data });
        if (limite && data >= limite) break;
    }
    return lista;
}

function rotuloCuota(num, total) {
    return total ? `${num}/${total}` : String(num);
}

function descricaoDaCuota(servico, cliente, num, total) {
    return `${servico} · ${cliente} · ${rotuloCuota(num, total)}`.slice(0, 190);
}

// Texto sem acentos, minusculo e so letras/numeros: compara cabecalhos de planilha, nomes de servico e cedulas.
function chave(texto) {
    return String(texto === null || texto === undefined ? '' : texto)
        .normalize('NFD').replace(/\p{Diacritic}/gu, '')
        .toLowerCase().replace(/[^a-z0-9]+/g, '');
}

// Valida e normaliza os dados de um contrato (formulario e importacao usam a mesma regra).
// Devolve { ok: true, dados } ou { ok: false, erro } com um codigo traduzido pela tela ('clientes.erro_<codigo>').
function validarContrato({ valor, periodicidade, prazo, dia, inicio }) {
    const { parseMoeda, dataValida } = require('./helpers');
    const per = String(periodicidade || 'mensal').toLowerCase() === 'anual' ? 'anual' : 'mensal';
    const v = typeof valor === 'number' ? valor : parseMoeda(valor);
    if (!(v > 0) || v >= 1e12) return { ok: false, erro: 'valor' };
    const d = parseInt(dia, 10);
    if (!(d >= 1 && d <= 31)) return { ok: false, erro: 'dia' };
    if (!dataValida(inicio)) return { ok: false, erro: 'inicio' };
    let prazoMeses = null;
    const txt = String(prazo === null || prazo === undefined ? '' : prazo).trim().toLowerCase();
    if (txt && txt !== 'sem' && txt !== '0') {
        const p = parseInt(txt, 10);
        if (!(p >= 1 && p <= 120) || String(p) !== txt.replace(/^0+/, '')) return { ok: false, erro: 'prazo' };
        if (per === 'anual' && p % 12 !== 0) return { ok: false, erro: 'prazo_anual' };
        prazoMeses = p;
    }
    return {
        ok: true,
        dados: { valor: Math.round(v * 100) / 100, periodicidade: per, prazoMeses, cuotasTotal: totalDeCuotas(per, prazoMeses), dia: d, inicio }
    };
}

module.exports = {
    ultimoDiaDoMes, vencimento, primeiroVencimento, passoMeses, vencimentoDaCuota, totalDeCuotas,
    somarMeses, horizonte, cuotasAGerar, rotuloCuota, descricaoDaCuota, chave, validarContrato
};
