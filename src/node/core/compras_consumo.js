// Modulo Compras: descobre quando um produto costuma acabar, pelas datas em que a cliente o comprou.
// Regra simples e explicavel (sem IA): o intervalo tipico e a MEDIANA dos dias entre compras seguidas.
// Funcoes puras (sem banco), faceis de testar. Datas sempre 'YYYY-MM-DD'.

const MIN_COMPRAS = 3;          // com menos de 3 compras (2 intervalos) ainda nao ha padrao
const MIN_INTERVALO_DIAS = 2;   // quem compra todo dia nao precisa de aviso
const MARGEM = 0.15;            // avisa um pouco antes do dia previsto (15% do intervalo, no minimo 1 dia)
const PAROU_DE_COMPRAR = 4;     // passou 4 intervalos sem comprar: provavelmente deixou de usar, nao avisa

const dias = (ymd) => Date.UTC(+ymd.slice(0, 4), +ymd.slice(5, 7) - 1, +ymd.slice(8, 10)) / 86400000;
const somar = (ymd, n) => new Date((dias(ymd) + n) * 86400000).toISOString().slice(0, 10);

function mediana(nums) {
    const o = [...nums].sort((a, b) => a - b);
    const m = Math.floor(o.length / 2);
    return o.length % 2 ? o[m] : (o[m - 1] + o[m]) / 2;
}

// { compras, intervalo, ultima } ou null quando ainda nao ha padrao.
function ciclo(datas) {
    const unicas = [...new Set((datas || []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
    if (unicas.length < MIN_COMPRAS) return null;
    const passos = [];
    for (let i = 1; i < unicas.length; i++) passos.push(dias(unicas[i]) - dias(unicas[i - 1]));
    const intervalo = Math.round(mediana(passos));
    if (intervalo < MIN_INTERVALO_DIAS) return null;
    return { compras: unicas.length, intervalo, ultima: unicas[unicas.length - 1] };
}

// Devolve null se nao ha o que avisar, ou { intervalo, ultima, diasDesde, previsto, atraso, compras }.
// atraso < 0: ainda faltam dias para o previsto (mas ja entrou na margem); atraso > 0: passou do previsto.
function avaliar({ datas, hoje, avisarAte = null }) {
    const c = ciclo(datas);
    if (!c) return null;
    if (avisarAte && hoje < avisarAte) return null;
    const diasDesde = dias(hoje) - dias(c.ultima);
    const margem = Math.max(1, Math.round(c.intervalo * MARGEM));
    if (diasDesde < c.intervalo - margem) return null;
    if (diasDesde > c.intervalo * PAROU_DE_COMPRAR) return null;
    return {
        intervalo: c.intervalo, ultima: c.ultima, diasDesde, compras: c.compras,
        previsto: somar(c.ultima, c.intervalo), atraso: diasDesde - c.intervalo
    };
}

module.exports = { ciclo, avaliar, somar, MIN_COMPRAS };
