// Regras puras de negocio financeiro (compativeis com Node.js e Navegador)
(function(exports) {
    /**
     * Calcula o saldo atual de uma conta bancaria a partir dos lancamentos pagos.
     * Saldo = saldo_inicial + soma dos valores dos lancamentos pagos da conta.
     */
    function calcularSaldoConta(conta, lancamentos) {
        if (!conta) return 0;
        let saldo = parseFloat(conta.saldo_inicial) || 0;
        if (!Array.isArray(lancamentos)) return saldo;

        const contaId = Number(conta.id);
        lancamentos.forEach((l) => {
            if (l.deleted_at) return;
            const lContaId = Number(l.conta_id);
            if (lContaId === contaId && l.status === 'pago') {
                saldo += parseFloat(l.valor) || 0;
            }
        });
        return Math.round(saldo * 100) / 100;
    }

    /**
     * Calcula os totais do mes (receitas, despesas, a receber, a pagar).
     */
    function calcularResumoMes(lancamentos, ano, mes) {
        let receitasRecebidas = 0;
        let aReceber = 0;
        let despesasPagas = 0;
        let aPagar = 0;

        if (!Array.isArray(lancamentos)) {
            return { receitasRecebidas: 0, aReceber: 0, despesasPagas: 0, aPagar: 0 };
        }

        lancamentos.forEach((l) => {
            if (l.deleted_at) return;
            if (!l.data_competencia) return;

            const dateStr = String(l.data_competencia).slice(0, 10);
            const [lAno, lMes] = dateStr.split('-').map(Number);

            if (lAno === Number(ano) && lMes === Number(mes)) {
                const val = parseFloat(l.valor) || 0;
                if (l.tipo === 'receita') {
                    if (l.status === 'pago') receitasRecebidas += val;
                    else aReceber += val;
                } else if (l.tipo === 'despesa') {
                    if (l.status === 'pago') despesasPagas += Math.abs(val);
                    else aPagar += Math.abs(val);
                }
            }
        });

        return {
            receitasRecebidas: Math.round(receitasRecebidas * 100) / 100,
            aReceber: Math.round(aReceber * 100) / 100,
            despesasPagas: Math.round(despesasPagas * 100) / 100,
            aPagar: Math.round(aPagar * 100) / 100
        };
    }

    /**
     * Filtra lancamentos por tipo, busca, conta e categoria.
     */
    function filtrarLancamentos(lancamentos, filtros = {}) {
        if (!Array.isArray(lancamentos)) return [];
        return lancamentos.filter((l) => {
            if (l.deleted_at) return false;

            if (filtros.tipo && filtros.tipo !== 'todas') {
                if (filtros.tipo === 'despesas' || filtros.tipo === 'despesa') {
                    if (l.tipo !== 'despesa') return false;
                } else if (filtros.tipo === 'receitas' || filtros.tipo === 'receita') {
                    if (l.tipo !== 'receita') return false;
                }
            }

            if (filtros.conta_id && Number(l.conta_id) !== Number(filtros.conta_id)) {
                return false;
            }

            if (filtros.categoria_id && Number(l.categoria_id) !== Number(filtros.categoria_id)) {
                return false;
            }

            if (filtros.status && l.status !== filtros.status) {
                return false;
            }

            if (filtros.busca) {
                const term = String(filtros.busca).toLowerCase();
                const desc = String(l.descricao || '').toLowerCase();
                if (!desc.includes(term)) return false;
            }

            return true;
        });
    }

    /**
     * Converte o texto digitado ("1.500.000", "1.500,50", "Gs. 25.000", "10,5") em numero.
     * Copia exata de parseMoeda do servidor (src/node/core/helpers.js): o app offline e o site tem que ler o valor igual.
     */
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
            const partes = s.split('.');
            if (partes.length > 2 || partes[partes.length - 1].length === 3) s = partes.join('');
        } else if (temVirgula) {
            // So virgulas: milhar do dolar ("1,500"); nos demais casos e o decimal ("10,5").
            const partes = s.split(',');
            if (partes.length > 2 || partes[partes.length - 1].replace(/[^0-9]/g, '').length === 3) s = partes.join('');
            else s = s.replace(',', '.');
        }
        s = s.replace(/[^0-9.-]/g, '');
        return parseFloat(s) || 0;
    }

    /** Data local de hoje como YYYY-MM-DD (a data de competencia e a que o usuario ve no celular). */
    function hojeYMD(d) {
        const x = d || new Date();
        return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
    }

    // ---- Cambio entre moedas (Guarani, Real, Dolar, Euro, Peso argentino) ----
    // A cotacao e sempre "quantas unidades da moeda mais fraca valem 1 unidade da mais forte" (Gs. por 1 R$, Gs. por 1 US$,
    // R$ por 1 US$...). Ordem das moedas, da mais forte para a mais fraca:
    const FORCA_MOEDAS = ['EUR', 'USD', 'BRL', 'ARS', 'PYG'];
    const CASAS_MOEDA = { PYG: 0 };

    function casasDaMoeda(cod) { return CASAS_MOEDA[cod] === undefined ? 2 : CASAS_MOEDA[cod]; }

    function arredondarMoeda(valor, cod) {
        const f = Math.pow(10, casasDaMoeda(cod));
        return Math.round((Number(valor) + Number.EPSILON) * f) / f;
    }

    // Qual e a moeda base (1 unidade) e qual a cotada no par origem/destino.
    function parCambio(origem, destino) {
        const iO = FORCA_MOEDAS.indexOf(origem), iD = FORCA_MOEDAS.indexOf(destino);
        const baseEOrigem = (iO === -1 ? 99 : iO) <= (iD === -1 ? 99 : iD);
        return baseEOrigem ? { base: origem, cotada: destino, origemEBase: true } : { base: destino, cotada: origem, origemEBase: false };
    }

    // Valor que entra na conta de destino: guarani -> real/dolar divide pela cotacao; real/dolar -> guarani multiplica.
    function calcularEntrada(valorSaida, cotacao, origem, destino) {
        const v = Number(valorSaida), c = Number(cotacao);
        if (origem === destino) return arredondarMoeda(v, destino);
        if (!(v > 0) || !(c > 0)) return 0;
        const par = parCambio(origem, destino);
        return arredondarMoeda(par.origemEBase ? v * c : v / c, destino);
    }

    // Cotacao implicita entre o que saiu e o que entrou (o banco arredonda: quem manda e o valor recebido).
    function calcularCotacao(valorSaida, valorEntrada, origem, destino) {
        const s = Number(valorSaida), e = Number(valorEntrada);
        if (origem === destino || !(s > 0) || !(e > 0)) return 0;
        const par = parCambio(origem, destino);
        const c = par.origemEBase ? e / s : s / e;
        return Math.round(c * 1000000) / 1000000;
    }

    // Cotacao digitada. Pares com guarani tem cotacao grande ("1.190" = 1190); os demais usam ponto ou virgula como decimal.
    function lerCotacao(texto, origem, destino) {
        if (typeof texto === 'number') return texto > 0 && isFinite(texto) ? texto : 0;
        let s = String(texto == null ? '' : texto).replace(/[^0-9.,]/g, '');
        if (!s) return 0;
        const grande = origem === 'PYG' || destino === 'PYG';
        if (grande) return parseMoeda(s) || 0;
        const ultimo = Math.max(s.lastIndexOf(','), s.lastIndexOf('.'));
        if (ultimo === -1) return parseFloat(s) || 0;
        return parseFloat(s.slice(0, ultimo).replace(/[.,]/g, '') + '.' + s.slice(ultimo + 1)) || 0;
    }

    exports.parseMoeda = parseMoeda;
    exports.casasDaMoeda = casasDaMoeda;
    exports.arredondarMoeda = arredondarMoeda;
    exports.parCambio = parCambio;
    exports.calcularEntrada = calcularEntrada;
    exports.calcularCotacao = calcularCotacao;
    exports.lerCotacao = lerCotacao;
    exports.FORCA_MOEDAS = FORCA_MOEDAS;
    exports.hojeYMD = hojeYMD;
    exports.calcularSaldoConta = calcularSaldoConta;
    exports.calcularResumoMes = calcularResumoMes;
    exports.filtrarLancamentos = filtrarLancamentos;

})(typeof exports !== 'undefined' ? exports : (window.AppRegras = {}));
