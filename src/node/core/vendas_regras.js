// Regras puras da venda de produtos (sem banco): itens do carrinho, resumo, divisao em parcelas e datas.
// Datas sempre 'YYYY-MM-DD'. Valores em numero (ja convertidos de texto pela tela).
const { vencimentoDaCuota } = require('./clientes_regras');

const MAX_ITENS = 50;
const MAX_QTD = 99999;
const MAX_PARCELAS = 48;
const MAX_VALOR = 1e12;

// Casas decimais de cada moeda (guarani nao tem centavos).
function casasDaMoeda(moeda) {
    return moeda === 'PYG' ? 0 : 2;
}

function arredondar(valor, casas) {
    const f = 10 ** casas;
    return Math.round((Number(valor) || 0) * f) / f;
}

// Carrinho enviado pela tela (JSON). Devolve { ok, itens } ou { ok: false, erro } (codigo de 'vendas.erro_<codigo>').
// O mesmo produto repetido vira uma linha so, se o preco for o mesmo.
function validarItens(texto) {
    let lista;
    try { lista = JSON.parse(String(texto || '[]')); } catch (e) { return { ok: false, erro: 'itens' }; }
    if (!Array.isArray(lista) || !lista.length) return { ok: false, erro: 'sem_itens' };
    if (lista.length > MAX_ITENS) return { ok: false, erro: 'muitos_itens' };
    const itens = [];
    for (const bruto of lista) {
        const produtoId = parseInt(bruto && bruto.produto_id, 10);
        const quantidade = Number(bruto && bruto.quantidade);
        const preco = Number(bruto && bruto.preco);
        if (!(produtoId > 0)) return { ok: false, erro: 'itens' };
        if (!Number.isInteger(quantidade) || quantidade < 1 || quantidade > MAX_QTD) return { ok: false, erro: 'quantidade' };
        if (!Number.isFinite(preco) || preco < 0 || preco >= MAX_VALOR) return { ok: false, erro: 'preco' };
        const igual = itens.find((i) => i.produtoId === produtoId && i.preco === preco);
        if (igual) igual.quantidade = Math.min(MAX_QTD, igual.quantidade + quantidade);
        else itens.push({ produtoId, quantidade, preco });
    }
    return { ok: true, itens };
}

// Forma de pagamento: 'avista' (ja recebido na data da venda) ou 'prazo' (1 a 48 parcelas mensais a partir do 1o vencimento).
function validarPagamento({ forma, parcelas, vencimento, entrada, dataVenda }) {
    const { dataValida } = require('./helpers');
    if (forma !== 'prazo') return { ok: true, dados: { forma: 'avista', parcelas: 1, primeiro: dataVenda, primeiraPaga: true } };
    const n = parseInt(parcelas, 10) || 1;
    if (n < 1 || n > MAX_PARCELAS) return { ok: false, erro: 'parcelas' };
    if (!dataValida(vencimento)) return { ok: false, erro: 'vencimento' };
    return { ok: true, dados: { forma: 'prazo', parcelas: n, primeiro: vencimento, primeiraPaga: n > 1 && (entrada === '1' || entrada === true) } };
}

// Divide o total em n parcelas na menor unidade da moeda; a diferenca do arredondamento fica na ultima.
function dividirEmParcelas(total, n, casas) {
    const f = 10 ** casas;
    const unidades = Math.round(total * f);
    const base = Math.floor(unidades / n);
    const lista = [];
    for (let i = 0; i < n; i++) lista.push((i === n - 1 ? unidades - base * (n - 1) : base) / f);
    return lista;
}

// Vencimentos mensais a partir do primeiro, sempre no mesmo dia (meses curtos usam o ultimo dia).
function datasDasParcelas(primeiro, n) {
    const dia = parseInt(String(primeiro).slice(8, 10), 10);
    const lista = [];
    for (let num = 1; num <= n; num++) lista.push({ num, data: vencimentoDaCuota(primeiro, 'mensal', dia, num) });
    return lista;
}

// "Camiseta ×3, Gorra" (cabe em `max`; o que nao couber vira "+N").
function resumoDosItens(itens, max = 150) {
    const partes = itens.map((it) => (it.quantidade > 1 ? `${it.nome} ×${it.quantidade}` : it.nome));
    if (!partes.length) return '';
    const reserva = partes.length > 1 ? 5 : 0; // espaco para o " +N" do final
    let txt = partes[0].length > max - reserva ? `${partes[0].slice(0, max - reserva - 1)}…` : partes[0];
    let i = 1;
    for (; i < partes.length; i++) {
        const prox = `${txt}, ${partes[i]}`;
        if (prox.length + (i < partes.length - 1 ? reserva : 0) > max) break;
        txt = prox;
    }
    return i < partes.length ? `${txt} +${partes.length - i}` : txt;
}

// Descricao do lancamento: igual a dos servicos ("Itens · Cliente · 1/3"); sem parcela quando e uma so.
function descricaoDaParcela(resumo, cliente, num, total) {
    return `${resumo} · ${cliente}${total > 1 ? ` · ${num}/${total}` : ''}`.slice(0, 190);
}

// Le os campos de produto do formulario.
function dadosProduto(body) {
    const { parseMoeda } = require('./helpers');
    const nome = String(body.nome || '').trim().slice(0, 120);
    const descricao = String(body.descricao || '').trim().slice(0, 500) || null;
    const preco = body.preco ? parseMoeda(body.preco) : 0;
    const custoTxt = String(body.custo || '').trim();
    const custo = custoTxt ? parseMoeda(custoTxt) : null;
    const controla = body.controla_estoque === '1';
    const estoque = controla ? parseInt(body.estoque, 10) : null;
    const minimoTxt = String(body.estoque_minimo || '').trim();
    const minimo = controla && minimoTxt ? parseInt(minimoTxt, 10) : null;
    if (!nome) return { ok: false, erro: 'nome' };
    if (!(preco >= 0) || preco >= MAX_VALOR) return { ok: false, erro: 'preco' };
    if (custo !== null && (!(custo >= 0) || custo >= MAX_VALOR)) return { ok: false, erro: 'custo' };
    if (controla && (!Number.isInteger(estoque) || estoque < 0 || estoque > 9999999)) return { ok: false, erro: 'estoque' };
    if (minimo !== null && (!Number.isInteger(minimo) || minimo < 0 || minimo > 9999999)) return { ok: false, erro: 'estoque' };
    return {
        ok: true,
        dados: { nome, descricao, preco: arredondar(preco, 2), custo: custo === null ? null : arredondar(custo, 2), estoque, minimo }
    };
}

// Situacao do estoque: 'sem' (controla e nao tem), 'baixo' (no minimo ou abaixo), 'ok' ou null (nao controla).
function situacaoEstoque(p) {
    if (p.estoque === null || p.estoque === undefined) return null;
    const qtd = Number(p.estoque);
    if (qtd <= 0) return 'sem';
    if (p.estoque_minimo !== null && p.estoque_minimo !== undefined && qtd <= Number(p.estoque_minimo)) return 'baixo';
    return 'ok';
}

module.exports = {
    MAX_ITENS, MAX_PARCELAS, casasDaMoeda, arredondar, validarItens, validarPagamento, dividirEmParcelas, datasDasParcelas,
    resumoDosItens, descricaoDaParcela, dadosProduto, situacaoEstoque
};
