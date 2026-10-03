// Simbolo e separadores de cada moeda. O sinal de negativo vem antes do simbolo, igual ao formatador do navegador (app.js).
const SIMBOLOS = { PYG: 'Gs.', BRL: 'R$', USD: '$', EUR: '€', ARS: '$' };

function moeda(valor, codigoMoeda = 'PYG') {
    const num = parseFloat(valor) || 0;
    const abs = Math.abs(num);
    const milhar = (txt, sep) => txt.replace(/\B(?=(\d{3})+(?!\d))/g, sep);

    // Moeda sem centavos
    if (codigoMoeda === 'PYG') {
        const inteiro = Math.round(abs);
        return `${num < 0 && inteiro > 0 ? '-' : ''}Gs. ${milhar(String(inteiro), '.')}`;
    }

    const [inteiro, centavos] = abs.toFixed(2).split('.');
    const sinal = num < 0 && (inteiro !== '0' || centavos !== '00') ? '-' : '';
    // Dolar: milhar com virgula e decimal com ponto; as demais (real, euro, peso) usam ponto e virgula.
    if (codigoMoeda === 'USD') return `${sinal}$ ${milhar(inteiro, ',')}.${centavos}`;
    return `${sinal}${SIMBOLOS[codigoMoeda] || codigoMoeda} ${milhar(inteiro, '.')},${centavos}`;
}

// Converte o texto digitado em numero, no formato de qualquer moeda do sistema:
// "Gs. 1.500.000", "R$ 1.500,50", "$ 1,500.50" (dolar), "10,5", "1500".
// ATENCAO: public/assets/js/app-regras.js tem uma copia desta funcao (uso sem internet); as duas precisam ficar iguais.
function parseMoeda(str) {
    if (typeof str === 'number') return str;
    if (!str) return 0;

    let s = String(str).trim();
    s = s.replace(/(Gs\.|R\$|US\$|\$|€|Gs)/gi, '').trim();

    const temPonto = s.includes('.');
    const temVirgula = s.includes(',');
    if (temPonto && temVirgula) {
        // O separador que aparece por ultimo e o decimal: "1.500,50" (real) ou "1,500.50" (dolar).
        if (s.lastIndexOf(',') > s.lastIndexOf('.')) s = s.replace(/\./g, '').replace(',', '.');
        else s = s.replace(/,/g, '');
    } else if (temPonto) {
        // So pontos: milhar quando ha varios ou quando vem seguido de exatamente 3 digitos ("1.500", "1.500.000").
        const partes = s.split('.');
        if (partes.length > 2 || partes[partes.length - 1].length === 3) s = partes.join('');
    } else if (temVirgula) {
        // So virgulas: milhar do dolar ("1,500", "1,234,567"); nos demais casos e o decimal ("10,5").
        const partes = s.split(',');
        if (partes.length > 2 || partes[partes.length - 1].replace(/[^0-9]/g, '').length === 3) s = partes.join('');
        else s = s.replace(',', '.');
    }

    // Tira o que sobrou que nao seja numero, ponto ou sinal
    s = s.replace(/[^0-9.-]/g, '');
    return parseFloat(s) || 0;
}

const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

// 'YYYY-MM-DD' que existe de verdade no calendario (recusa "2026-02-31", texto solto, anos absurdos).
function dataValida(v) {
    const m = YMD_RE.exec(String(v === undefined || v === null ? '' : v));
    if (!m) return false;
    const ano = +m[1], mes = +m[2], dia = +m[3];
    if (ano < 1990 || ano > 2100) return false;
    const d = new Date(ano, mes - 1, dia);
    return d.getFullYear() === ano && d.getMonth() === mes - 1 && d.getDate() === dia;
}

// Mes (1-12) e ano vindos da URL; qualquer coisa fora do esperado vira o mes/ano de hoje.
function mesAnoValidos(mes, ano, hoje = hojeLocal()) {
    const m = parseInt(mes, 10);
    const a = parseInt(ano, 10);
    return {
        mes: m >= 1 && m <= 12 ? m : hoje.getMonth() + 1,
        ano: a >= 1990 && a <= 2100 ? a : hoje.getFullYear()
    };
}

const corValida = (v) => /^#[0-9a-fA-F]{6}$/.test(String(v || ''));

// JSON para embutir dentro de um <script> da pagina. O sinal de menor vira um escape unicode: um nome de categoria ou
// conta contendo "</script>" (digitado ou vindo de um backup importado) nao consegue fechar o bloco e injetar codigo.
// Os separadores de linha U+2028 e U+2029 tambem sao escapados (quebrariam o script em navegadores antigos).
const SEPARADORES_DE_LINHA = new RegExp('[' + String.fromCharCode(0x2028, 0x2029) + ']', 'g');
function jsonScript(v) {
    return JSON.stringify(v === undefined ? null : v)
        .replace(/</g, '\\u003c')
        .replace(SEPARADORES_DE_LINHA, (c) => '\\u' + c.charCodeAt(0).toString(16));
}

function formatDate(dateStr, formatStr = 'YYYY-MM-DD') {
    if (!dateStr) return '';
    // 'YYYY-MM-DD' puro e interpretado como UTC por new Date(); formata direto para nao voltar 1 dia no fuso local.
    const iso = typeof dateStr === 'string' && dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
    const d = iso ? new Date(+iso[1], +iso[2] - 1, +iso[3]) : new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');

    if (formatStr === 'DD/MM/YYYY' || formatStr === 'd/m/Y') {
        return `${day}/${month}/${year}`;
    }
    return `${year}-${month}-${day}`;
}

// 'DD/MM/YYYY HH:mm' no fuso do negocio (o servidor da hospedagem costuma rodar em UTC).
function formatDateTime(valor, tz) {
    if (!valor) return '';
    const d = new Date(valor);
    if (isNaN(d.getTime())) return '';
    const zona = tz || process.env.IA_TIMEZONE || 'America/Asuncion';
    try {
        const p = new Intl.DateTimeFormat('en-GB', { timeZone: zona, day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).formatToParts(d)
            .reduce((o, x) => { o[x.type] = x.value; return o; }, {});
        return `${p.day}/${p.month}/${p.year} ${p.hour === '24' ? '00' : p.hour}:${p.minute}`;
    } catch (e) {
        return d.toISOString().slice(0, 16).replace('T', ' ');
    }
}

function truncarTexto(str, max = 45) {
    if (!str) return '';
    const s = String(str).trim();
    if (s.length > max) {
        return s.substring(0, max) + '...';
    }
    return s;
}

// Fuso de negocio do app (padrao Paraguai). O servidor (Hostinger) costuma rodar em UTC; sem isso, depois das 21h locais
// o "hoje" viraria o dia seguinte (e o "Este mes" no ultimo dia do mes).
const FUSO_APP = process.env.APP_TIMEZONE || process.env.IA_TIMEZONE || 'America/Asuncion';
function hojeLocal(agora = new Date()) {
    try {
        const p = {};
        new Intl.DateTimeFormat('en-CA', { timeZone: FUSO_APP, year: 'numeric', month: '2-digit', day: '2-digit' })
            .formatToParts(agora).forEach((x) => { if (x.type !== 'literal') p[x.type] = parseInt(x.value, 10); });
        return new Date(p.year, p.month - 1, p.day);
    } catch (e) {
        return new Date(agora.getFullYear(), agora.getMonth(), agora.getDate());
    }
}

function toLocalYMD(d = new Date()) {
    if (!d) return '';
    const dateObj = (d instanceof Date) ? d : new Date(d);
    if (isNaN(dateObj.getTime())) return String(d);
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Soma meses a uma data 'YYYY-MM-DD' mantendo o dia (limitado ao ultimo dia do mes destino).
function addMonthsYMD(ymd, n) {
    const [y, m, d] = String(ymd).split('-').map(Number);
    const alvo = new Date(y, m - 1 + n, 1);
    const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
    alvo.setDate(Math.min(d, ultimo));
    return toLocalYMD(alvo);
}

// Texto amigavel para lancamentos de sistema (ajuste/transferencia), inclusive os antigos com "#id" e valores no texto.
function descricaoLancamento(l, t) {
    if (!l) return '';
    const tr = typeof t === 'function' ? t : (k) => ({
        'lancamento.ajuste_saida': 'Ajuste de saldo (saída)', 'lancamento.ajuste_entrada': 'Ajuste de saldo (entrada)',
        'lancamento.transf_recebida': 'Transferência recebida', 'lancamento.transf_enviada': 'Transferência enviada',
        'lancamento.transf_de': ' de ', 'lancamento.transf_para': ' para '
    })[k];
    const d = String(l.descricao || '');
    if (l.tipo === 'ajuste') return parseFloat(l.valor) < 0 ? tr('lancamento.ajuste_saida') : tr('lancamento.ajuste_entrada');
    if (l.tipo === 'transferencia') {
        const entrada = /recebida/i.test(d) || parseFloat(l.valor) > 0;
        const m = d.match(/\b(?:para|de|da)\s+(.+?)(?:\s+-\s+.*)?$/i);
        let outra = m ? m[1].trim() : '';
        if (/^(conta\s+)?#?\d+$/i.test(outra)) outra = '';
        return tr(entrada ? 'lancamento.transf_recebida' : 'lancamento.transf_enviada') + (outra ? tr(entrada ? 'lancamento.transf_de' : 'lancamento.transf_para') + outra : '');
    }
    return d;
}

module.exports = {
    descricaoLancamento,
    addMonthsYMD,
    moeda,
    parseMoeda,
    dataValida,
    mesAnoValidos,
    corValida,
    jsonScript,
    formatDate,
    formatDateTime,
    truncarTexto,
    toLocalYMD,
    hojeLocal
};
