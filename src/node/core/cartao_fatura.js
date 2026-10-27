// Modulo Cartao de credito: em qual fatura cai uma compra e quando ela fecha e vence.
// A fatura e identificada pelo mes (YYYY-MM) em que FECHA. Dias 29-31 valem o ultimo dia dos meses mais curtos.

const ultimoDia = (ano, mes) => new Date(ano, mes, 0).getDate(); // mes 1-12

const partesMes = (mes) => { const [a, m] = String(mes).split('-').map(Number); return { ano: a, mes: m }; };
const textoMes = (ano, mes) => `${ano}-${String(mes).padStart(2, '0')}`;
const ymd = (ano, mes, dia) => `${textoMes(ano, mes)}-${String(Math.min(dia, ultimoDia(ano, mes))).padStart(2, '0')}`;

function somarMeses(mes, n) {
    const { ano, mes: m } = partesMes(mes);
    const d = new Date(ano, m - 1 + n, 1);
    return textoMes(d.getFullYear(), d.getMonth() + 1);
}

const mesValido = (v) => /^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || ''));

// Compra feita ate o dia do fechamento entra na fatura do proprio mes; depois dele, na do mes seguinte.
function mesDaCompra(dataYMD, diaFechamento) {
    const [a, m, d] = String(dataYMD).split('-').map(Number);
    const fecha = Math.min(diaFechamento, ultimoDia(a, m));
    return d <= fecha ? textoMes(a, m) : somarMeses(textoMes(a, m), 1);
}

// Datas da fatura que fecha em `mes`: o vencimento cai no mesmo mes se o dia for depois do fechamento, senao no seguinte.
function datasDaFatura(mes, diaFechamento, diaVencimento) {
    const { ano, mes: m } = partesMes(mes);
    const fechamento = ymd(ano, m, diaFechamento);
    const mesVenc = diaVencimento > diaFechamento ? mes : somarMeses(mes, 1);
    const v = partesMes(mesVenc);
    return { fechamento, vencimento: ymd(v.ano, v.mes, diaVencimento) };
}

module.exports = { mesDaCompra, datasDaFatura, somarMeses, mesValido, ultimoDia };
