// Modulo Cartao de credito: cartoes, compras e faturas. A compra so vira lancamento (e mexe no saldo) quando a fatura e paga.
const { randomUUID: uuidv4 } = require('crypto');
const db = require('../config/db');
const Lancamento = require('./Lancamento');
const SyncExclusao = require('./SyncExclusao');
const fatura = require('../core/cartao_fatura');
const { addMonthsYMD, passoMeses, toLocalYMD, hojeLocal } = require('../core/helpers');

const limpar = (v, max) => String(v === null || v === undefined ? '' : v).trim().slice(0, max);
const dinheiro = (v) => Math.round((Number(v) || 0) * 100) / 100;
const dia = (v) => Math.min(Math.max(parseInt(v, 10) || 1, 1), 31);
const erro = (codigo) => { const e = new Error(codigo); e.codigo = codigo; return e; };
// Assinatura (compra fixa): cria as proximas 24 ocorrencias, uma por mes, igual ao fixo dos lancamentos.
const MESES_FIXO = 24;

class Cartao {
    // Cartoes com o limite usado (compras de faturas ainda nao pagas) e a conta a que pertencem.
    static async listar(userId, arquivados = false) {
        const [rows] = await db.query(
            `SELECT k.*, ct.nome AS conta_nome, ct.moeda AS conta_moeda
             FROM cartoes k JOIN contas ct ON ct.id = k.conta_id
             WHERE k.user_id = ? AND k.status = ?
             ORDER BY k.nome ASC`,
            [userId, arquivados ? 'arquivado' : 'ativo']
        );
        await Promise.all(rows.map(async (k) => { k.usado = await this.calcularUsado(k.id, k.dia_fechamento); }));
        return rows;
    }

    // Quanto do limite esta em uso agora: soma as compras de faturas ainda nao pagas, ATE a fatura aberta hoje -
    // nao conta ocorrencias futuras de uma assinatura/parcela ja criadas de antemao (essas so entram no limite
    // quando a fatura delas abrir de verdade, mes a mes).
    static async calcularUsado(cartaoId, diaFechamento) {
        const mesAberto = fatura.mesDaCompra(toLocalYMD(hojeLocal()), diaFechamento);
        const [[r]] = await db.query(
            `SELECT COALESCE(SUM(cc.valor), 0) AS usado FROM cartao_compras cc
             LEFT JOIN cartao_faturas f ON f.cartao_id = cc.cartao_id AND f.mes = cc.fatura_mes
             WHERE cc.cartao_id = ? AND f.id IS NULL AND cc.fatura_mes <= ?`,
            [cartaoId, mesAberto]
        );
        return dinheiro(r.usado);
    }

    static async buscar(id, userId) {
        const [rows] = await db.query(
            `SELECT k.*, ct.nome AS conta_nome, ct.moeda AS conta_moeda
             FROM cartoes k JOIN contas ct ON ct.id = k.conta_id
             WHERE k.id = ? AND k.user_id = ? LIMIT 1`,
            [id, userId]
        );
        return rows[0] || null;
    }

    static async validarConta(userId, contaId) {
        const [c] = await db.query("SELECT id FROM contas WHERE id = ? AND user_id = ? AND status = 'ativa' LIMIT 1", [contaId, userId]);
        if (!c.length) throw erro('conta_invalida');
    }

    static async criar(userId, { nome, bandeira, conta_id, limite_total, dia_fechamento, dia_vencimento }) {
        await this.validarConta(userId, conta_id);
        const [res] = await db.query(
            `INSERT INTO cartoes (user_id, conta_id, nome, bandeira, limite_total, dia_fechamento, dia_vencimento)
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [userId, conta_id, limpar(nome, 80), limpar(bandeira, 30), Math.max(dinheiro(limite_total), 0), dia(dia_fechamento), dia(dia_vencimento)]
        );
        return res.insertId;
    }

    // A conta pode mudar: as faturas ja pagas ficam como estao (os lancamentos gerados continuam na conta de antes).
    static async atualizar(id, userId, { nome, bandeira, conta_id, limite_total, dia_fechamento, dia_vencimento }) {
        await this.validarConta(userId, conta_id);
        const [res] = await db.query(
            `UPDATE cartoes SET nome = ?, bandeira = ?, conta_id = ?, limite_total = ?, dia_fechamento = ?, dia_vencimento = ?
             WHERE id = ? AND user_id = ?`,
            [limpar(nome, 80), limpar(bandeira, 30), conta_id, Math.max(dinheiro(limite_total), 0), dia(dia_fechamento), dia(dia_vencimento), id, userId]
        );
        return res.affectedRows > 0;
    }

    static async definirStatus(id, userId, arquivar) {
        const [res] = await db.query('UPDATE cartoes SET status = ? WHERE id = ? AND user_id = ?', [arquivar ? 'arquivado' : 'ativo', id, userId]);
        return res.affectedRows > 0;
    }

    // ---------- Faturas ----------
    static async faturaPaga(cartaoId, mes) {
        const [rows] = await db.query('SELECT * FROM cartao_faturas WHERE cartao_id = ? AND mes = ? LIMIT 1', [cartaoId, mes]);
        return rows[0] || null;
    }

    // A fatura de um mes: compras, total e (se paga) quando foi paga.
    static async fatura(cartao, userId, mes) {
        const [[compras], paga] = await Promise.all([
            db.query(
                `SELECT cc.*, c.nome AS categoria_nome FROM cartao_compras cc
                 LEFT JOIN categorias c ON c.id = cc.categoria_id
                 WHERE cc.cartao_id = ? AND cc.user_id = ? AND cc.fatura_mes = ?
                 ORDER BY cc.data_compra DESC, cc.id DESC`,
                [cartao.id, userId, mes]
            ),
            this.faturaPaga(cartao.id, mes)
        ]);
        const total = dinheiro(compras.reduce((s, c) => s + Number(c.valor), 0));
        return { mes, compras, total, paga, ...fatura.datasDaFatura(mes, cartao.dia_fechamento, cartao.dia_vencimento) };
    }

    // Fatura mais antiga anterior a `mesAberto` que tem compras e ainda nao foi paga (ja fechou: e a que pede pagamento).
    static async mesFechadoSemPagamento(cartaoId, mesAberto) {
        const [[r]] = await db.query(
            `SELECT MIN(cc.fatura_mes) AS mes FROM cartao_compras cc
             LEFT JOIN cartao_faturas fa ON fa.cartao_id = cc.cartao_id AND fa.mes = cc.fatura_mes
             WHERE cc.cartao_id = ? AND cc.fatura_mes < ? AND fa.id IS NULL`,
            [cartaoId, mesAberto]
        );
        return r && r.mes ? r.mes : null;
    }

    // Mes da fatura aberta para uma compra feita em `data`: se esse mes ja foi pago, a compra segue para o proximo.
    static async mesDeNovaCompra(cartao, data) {
        let mes = fatura.mesDaCompra(data, cartao.dia_fechamento);
        for (let i = 0; i < 24 && (await this.faturaPaga(cartao.id, mes)); i++) mes = fatura.somarMeses(mes, 1);
        return mes;
    }

    // ---------- Compras ----------
    // Assinatura (e_fixo) ou parcelas de uma cobranca periodica (repetir): cria uma compra por mes/periodo, cada
    // uma caindo na fatura certa pela sua propria data. Mesma logica de Lancamento.criar, sem o status pago/pendente
    // (nao existe por compra: a fatura inteira e paga de uma vez).
    static async criarCompra(userId, cartao, { descricao, valor, data, categoria_id, client_id = null, e_fixo = false, repetir = false, periodicidade = 'mensal', quantidade_repeticoes = 1 }) {
        if (categoria_id) await Lancamento.validarPropriedade(userId, null, categoria_id);
        const eFixo = !!e_fixo;
        const eRepetir = !eFixo && !!repetir;
        const qtdPedida = eRepetir ? Math.min(Math.max(parseInt(quantidade_repeticoes, 10) || 1, 1), 60) : 1;
        const totalOcorrencias = eFixo ? MESES_FIXO : qtdPedida;
        const passo = eRepetir ? passoMeses(periodicidade) : 1;
        const serieId = totalOcorrencias > 1 ? uuidv4() : null;
        const descLimpa = limpar(descricao, 190);
        const valorLimpo = dinheiro(valor);

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            let primeiro = null;
            for (let i = 0; i < totalOcorrencias; i++) {
                const dataOcorrencia = addMonthsYMD(data, i * passo);
                const mes = await this.mesDeNovaCompra(cartao, dataOcorrencia);
                const [res] = await conn.query(
                    `INSERT INTO cartao_compras (user_id, cartao_id, categoria_id, descricao, valor, data_compra, fatura_mes, serie_id, recorrente, client_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [userId, cartao.id, categoria_id || null, descLimpa, valorLimpo, dataOcorrencia, mes, serieId, eFixo ? 1 : 0, i === 0 ? client_id : null]
                );
                if (i === 0) primeiro = { id: res.insertId, mes };
            }
            await conn.commit();
            return primeiro;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    // Muda a forma de pagamento de um lancamento (ja existente, numa conta) para este cartao: vira(m) compra(s) de
    // cartao, saindo da tabela lancamentos. So pega ocorrencias AINDA PENDENTES - o que ja foi pago fica como estava,
    // porque aquele valor ja saiu de verdade do saldo da conta (o modelo de cartao so toca o saldo ao pagar a fatura).
    static async converterLancamentos(userId, cartao, { id, serieId, escopo, dataRef }) {
        let onde, params;
        if (serieId && escopo === 'esta_e_proximas') {
            onde = "user_id = ? AND serie_id = ? AND tipo = 'despesa' AND status = 'pendente' AND data_competencia >= ?";
            params = [userId, serieId, dataRef];
        } else if (serieId && escopo === 'toda_serie') {
            onde = "user_id = ? AND serie_id = ? AND tipo = 'despesa' AND status = 'pendente'";
            params = [userId, serieId];
        } else {
            onde = "user_id = ? AND id = ? AND tipo = 'despesa' AND status = 'pendente'";
            params = [userId, id];
        }
        const [rows] = await db.query(`SELECT * FROM lancamentos WHERE ${onde} ORDER BY data_competencia ASC, id ASC`, params);
        if (!rows.length) return 0;

        const serieNovaId = rows.length > 1 ? uuidv4() : null;
        const recorrenteNovo = rows[0].recorrente ? 1 : 0;

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            for (const row of rows) {
                const dataYMD = toLocalYMD(row.data_competencia);
                const mes = await this.mesDeNovaCompra(cartao, dataYMD);
                await conn.query(
                    `INSERT INTO cartao_compras (user_id, cartao_id, categoria_id, descricao, valor, data_compra, fatura_mes, serie_id, recorrente)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [userId, cartao.id, row.categoria_id, row.descricao, Math.abs(Number(row.valor)), dataYMD, mes, serieNovaId, recorrenteNovo]
                );
            }
            const idsApagar = rows.map((r) => r.id);
            const ondeDel = `user_id = ? AND id IN (${idsApagar.map(() => '?').join(',')})`;
            const paramsDel = [userId, ...idsApagar];
            await SyncExclusao.registrar('lancamentos', ondeDel, paramsDel, conn);
            await conn.query(`DELETE FROM lancamentos WHERE ${ondeDel}`, paramsDel);
            await conn.commit();
            return rows.length;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    // Edita uma compra de fatura em aberto; a fatura e recalculada pela nova data. Devolve o mes da fatura ou null.
    static async atualizarCompra(id, cartao, userId, { descricao, valor, data, categoria_id }) {
        if (categoria_id) await Lancamento.validarPropriedade(userId, null, categoria_id);
        const [rows] = await db.query('SELECT fatura_mes FROM cartao_compras WHERE id = ? AND cartao_id = ? AND user_id = ? LIMIT 1', [id, cartao.id, userId]);
        if (!rows.length || (await this.faturaPaga(cartao.id, rows[0].fatura_mes))) return null;
        const mes = await this.mesDeNovaCompra(cartao, data);
        await db.query(
            'UPDATE cartao_compras SET descricao = ?, valor = ?, data_compra = ?, categoria_id = ?, fatura_mes = ? WHERE id = ? AND cartao_id = ? AND user_id = ?',
            [limpar(descricao, 190), dinheiro(valor), data, categoria_id || null, mes, id, cartao.id, userId]
        );
        return mes;
    }

    // Faturas em aberto (com compras) de cartoes ativos que vencem em alguma das datas. Usado pelo lembrete de vencimento.
    static async vencimentos(userId, datas) {
        const [rows] = await db.query(
            `SELECT k.id AS cartao_id, k.nome, k.dia_fechamento, k.dia_vencimento, ct.moeda, cc.fatura_mes AS mes, SUM(cc.valor) AS total
             FROM cartao_compras cc
             JOIN cartoes k ON k.id = cc.cartao_id AND k.status = 'ativo'
             JOIN contas ct ON ct.id = k.conta_id
             LEFT JOIN cartao_faturas f ON f.cartao_id = cc.cartao_id AND f.mes = cc.fatura_mes
             WHERE cc.user_id = ? AND f.id IS NULL
             GROUP BY k.id, cc.fatura_mes`,
            [userId]
        );
        return rows
            .map((r) => ({ ...r, total: Number(r.total), vencimento: fatura.datasDaFatura(r.mes, r.dia_fechamento, r.dia_vencimento).vencimento }))
            .filter((r) => datas.includes(r.vencimento) && r.total > 0)
            .sort((a, b) => (a.vencimento < b.vencimento ? -1 : a.vencimento > b.vencimento ? 1 : b.total - a.total));
    }

    // Quantos cartoes ativos o usuario tem (para o limite do plano).
    static async totalAtivos(userId) {
        const [[r]] = await db.query("SELECT COUNT(*) AS n FROM cartoes WHERE user_id = ? AND status = 'ativo'", [userId]);
        return r.n;
    }

    // Compra de fatura paga nao pode ser apagada (o lancamento ja existe): desfaca o pagamento antes.
    static async excluirCompra(id, cartaoId, userId) {
        const onde = 'id = ? AND cartao_id = ? AND user_id = ? AND NOT EXISTS (SELECT 1 FROM cartao_faturas f WHERE f.cartao_id = cartao_compras.cartao_id AND f.mes = cartao_compras.fatura_mes)';
        await SyncExclusao.registrar('cartao_compras', onde, [id, cartaoId, userId]);
        const [res] = await db.query(
            `DELETE cc FROM cartao_compras cc
             WHERE cc.id = ? AND cc.cartao_id = ? AND cc.user_id = ?
               AND NOT EXISTS (SELECT 1 FROM cartao_faturas f WHERE f.cartao_id = cc.cartao_id AND f.mes = cc.fatura_mes)`,
            [id, cartaoId, userId]
        );
        return res.affectedRows > 0;
    }

    // ---------- Pagamento ----------
    // Cada compra vira um lancamento de despesa pago na conta do cartao, na data do pagamento. O UNIQUE de cartao_faturas
    // (gravado primeiro) impede duas cobrancas da mesma fatura; se algo falhar no meio, tudo e desfeito.
    static async pagar(userId, cartao, mes, dataPagamento) {
        const f = await this.fatura(cartao, userId, mes);
        if (f.paga) throw erro('fatura_paga');
        if (!f.compras.length || !(f.total > 0)) throw erro('fatura_vazia');
        try {
            await db.query('INSERT INTO cartao_faturas (user_id, cartao_id, mes, total, pago_em) VALUES (?, ?, ?, ?, ?)', [userId, cartao.id, mes, f.total, dataPagamento]);
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') throw erro('fatura_paga');
            throw err;
        }
        const criados = [];
        try {
            for (const c of f.compras) {
                const [lancId] = await Lancamento.criar(userId, {
                    tipo: 'despesa', conta_id: cartao.conta_id, categoria_id: c.categoria_id, valor: c.valor,
                    descricao: limpar(`${c.descricao} · ${cartao.nome}`, 190),
                    data_competencia: dataPagamento, status: 'pago', data_pagamento: dataPagamento
                });
                criados.push(lancId);
                await db.query('UPDATE cartao_compras SET lancamento_id = ? WHERE id = ?', [lancId, c.id]);
            }
        } catch (err) {
            await this.apagarLancamentos(userId, criados);
            await db.query('UPDATE cartao_compras SET lancamento_id = NULL WHERE cartao_id = ? AND fatura_mes = ?', [cartao.id, mes]);
            await db.query('DELETE FROM cartao_faturas WHERE cartao_id = ? AND mes = ?', [cartao.id, mes]);
            throw err;
        }
        return f.total;
    }

    // Desfaz o pagamento: apaga os lancamentos gerados (o saldo volta) e a fatura volta a ficar em aberto.
    static async desfazerPagamento(userId, cartao, mes) {
        const paga = await this.faturaPaga(cartao.id, mes);
        if (!paga) return false;
        const [rows] = await db.query(
            'SELECT lancamento_id FROM cartao_compras WHERE cartao_id = ? AND user_id = ? AND fatura_mes = ? AND lancamento_id IS NOT NULL',
            [cartao.id, userId, mes]
        );
        await this.apagarLancamentos(userId, rows.map((r) => r.lancamento_id));
        await db.query('UPDATE cartao_compras SET lancamento_id = NULL WHERE cartao_id = ? AND user_id = ? AND fatura_mes = ?', [cartao.id, userId, mes]);
        await SyncExclusao.registrar('cartao_faturas', 'cartao_id = ? AND mes = ? AND user_id = ?', [cartao.id, mes, userId]);
        await db.query('DELETE FROM cartao_faturas WHERE cartao_id = ? AND mes = ?', [cartao.id, mes]);
        return true;
    }

    static async apagarLancamentos(userId, ids) {
        for (const id of ids) await Lancamento.excluir(id, userId);
    }
}

module.exports = Cartao;
