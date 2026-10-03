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

    exports.parseMoeda = parseMoeda;
    exports.hojeYMD = hojeYMD;
    exports.calcularSaldoConta = calcularSaldoConta;
    exports.calcularResumoMes = calcularResumoMes;
    exports.filtrarLancamentos = filtrarLancamentos;

})(typeof exports !== 'undefined' ? exports : (window.AppRegras = {}));
