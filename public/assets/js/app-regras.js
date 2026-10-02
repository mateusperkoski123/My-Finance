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

    exports.calcularSaldoConta = calcularSaldoConta;
    exports.calcularResumoMes = calcularResumoMes;
    exports.filtrarLancamentos = filtrarLancamentos;

})(typeof exports !== 'undefined' ? exports : (window.AppRegras = {}));
