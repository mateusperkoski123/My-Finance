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
// Porcentagem de reintegro (0 a 99,99): aceita "20", "20,5" e "20.5". Fora disso vira 0 (sem reintegro).
const porcentagem = (v) => {
    const n = parseFloat(String(v === null || v === undefined ? '' : v).replace(',', '.'));
    return Number.isFinite(n) ? Math.min(Math.max(Math.round(n * 100) / 100, 0), 99.99) : 0;
};
// Quanto o cartao devolve de uma compra de `valor` com `pct` % de reintegro.
const valorReintegro = (valor, pct) => dinheiro((Number(valor) || 0) * (Number(pct) || 0) / 100);
// Parte da compra que entra na fatura e no limite usado: o valor menos o reintegro.
const LIQUIDO = '(cc.valor - cc.reintegro_valor)';
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
        await Promise.all(rows.map(async (k) => { k.usado = await this.calcularUsado(k.id); }));
        return rows;
    }

    // Quanto do limite esta em uso agora: compras de faturas ainda nao pagas. Parcelas contam inteiras desde a compra
    // (como no banco: a compra parcelada ocupa o limite todo e libera a cada fatura paga), mas cada cobranca de uma
    // assinatura (recorrente) so conta a partir da data dela - as dos meses seguintes, criadas de antemao, ainda nao.
    static async calcularUsado(cartaoId) {
        const [[r]] = await db.query(
            `SELECT COALESCE(SUM(${LIQUIDO}), 0) AS usado FROM cartao_compras cc
             LEFT JOIN cartao_faturas f ON f.cartao_id = cc.cartao_id AND f.mes = cc.fatura_mes
             WHERE cc.cartao_id = ? AND f.id IS NULL AND (cc.recorrente = 0 OR cc.data_compra <= ?)`,
            [cartaoId, toLocalYMD(hojeLocal())]
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

    static async criar(userId, { nome, bandeira, conta_id, limite_total, reintegro_pct, dia_fechamento, dia_vencimento }) {
        await this.validarConta(userId, conta_id);
        const [res] = await db.query(
            `INSERT INTO cartoes (user_id, conta_id, nome, bandeira, limite_total, reintegro_pct, dia_fechamento, dia_vencimento)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [userId, conta_id, limpar(nome, 80), limpar(bandeira, 30), Math.max(dinheiro(limite_total), 0), porcentagem(reintegro_pct), dia(dia_fechamento), dia(dia_vencimento)]
        );
        return res.insertId;
    }

    // A conta pode mudar: as faturas ja pagas ficam como estao (os lancamentos gerados continuam na conta de antes).
    // Mudar a porcentagem de reintegro vale para as compras novas; as que ja foram feitas guardam a porcentagem da epoca.
    static async atualizar(id, userId, { nome, bandeira, conta_id, limite_total, reintegro_pct, dia_fechamento, dia_vencimento }) {
        await this.validarConta(userId, conta_id);
        const [res] = await db.query(
            `UPDATE cartoes SET nome = ?, bandeira = ?, conta_id = ?, limite_total = ?, reintegro_pct = ?, dia_fechamento = ?, dia_vencimento = ?
             WHERE id = ? AND user_id = ?`,
            [limpar(nome, 80), limpar(bandeira, 30), conta_id, Math.max(dinheiro(limite_total), 0), porcentagem(reintegro_pct), dia(dia_fechamento), dia(dia_vencimento), id, userId]
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

    // A fatura de um mes: compras, total e (se paga) quando foi paga. Compra em serie traz a posicao ("3/12") e o total.
    static async fatura(cartao, userId, mes) {
        const [[compras], paga] = await Promise.all([
            db.query(
                `SELECT cc.*, c.nome AS categoria_nome,
                        IF(cc.serie_id IS NULL, NULL, (SELECT COUNT(*) FROM cartao_compras s WHERE s.user_id = cc.user_id AND s.serie_id = cc.serie_id
                            AND (s.data_compra < cc.data_compra OR (s.data_compra = cc.data_compra AND s.id <= cc.id)))) AS serie_pos,
                        IF(cc.serie_id IS NULL, NULL, (SELECT COUNT(*) FROM cartao_compras s WHERE s.user_id = cc.user_id AND s.serie_id = cc.serie_id)) AS serie_total
                 FROM cartao_compras cc
                 LEFT JOIN categorias c ON c.id = cc.categoria_id
                 WHERE cc.cartao_id = ? AND cc.user_id = ? AND cc.fatura_mes = ?
                 ORDER BY cc.data_compra DESC, cc.id DESC`,
                [cartao.id, userId, mes]
            ),
            this.faturaPaga(cartao.id, mes)
        ]);
        // Cada compra traz `liquido` (valor menos o reintegro). `total` e o que se paga; `bruto` e `reintegro` explicam a conta.
        compras.forEach((c) => { c.liquido = dinheiro(Number(c.valor) - Number(c.reintegro_valor)); });
        const total = dinheiro(compras.reduce((s, c) => s + c.liquido, 0));
        const reintegro = dinheiro(compras.reduce((s, c) => s + Number(c.reintegro_valor), 0));
        return { mes, compras, total, reintegro, bruto: dinheiro(total + reintegro), paga, ...fatura.datasDaFatura(mes, cartao.dia_fechamento, cartao.dia_vencimento) };
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
    // `reintegro`: a compra tem o reintegro do cartao (cartao.reintegro_pct); cada ocorrencia da serie guarda a
    // porcentagem e o valor devolvido.
    static async criarCompra(userId, cartao, { descricao, valor, data, categoria_id, client_id = null, e_fixo = false, repetir = false, periodicidade = 'mensal', quantidade_repeticoes = 1, reintegro = false }) {
        if (categoria_id) await Lancamento.validarPropriedade(userId, null, categoria_id);
        const pct = reintegro ? porcentagem(cartao.reintegro_pct) : 0;
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
                    `INSERT INTO cartao_compras (user_id, cartao_id, categoria_id, descricao, valor, reintegro_pct, reintegro_valor, data_compra, fatura_mes, serie_id, recorrente, client_id)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [userId, cartao.id, categoria_id || null, descLimpa, valorLimpo, pct, valorReintegro(valorLimpo, pct), dataOcorrencia, mes, serieId, eFixo ? 1 : 0, i === 0 ? client_id : null]
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
    // `novos` traz o que foi editado no mesmo formulario: descricao, valor e categoria valem para todas as ocorrencias
    // convertidas; a data, so para a ocorrencia editada (mesma regra da edicao de serie em Lancamento.atualizar).
    static async converterLancamentos(userId, cartao, { id, serieId, escopo, dataRef, novos = {} }) {
        if (novos.categoria_id) await Lancamento.validarPropriedade(userId, null, novos.categoria_id);
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
                const dataYMD = String(row.id) === String(id) && novos.data ? novos.data : toLocalYMD(row.data_competencia);
                const mes = await this.mesDeNovaCompra(cartao, dataYMD);
                await conn.query(
                    `INSERT INTO cartao_compras (user_id, cartao_id, categoria_id, descricao, valor, data_compra, fatura_mes, serie_id, recorrente)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [userId, cartao.id, novos.categoria_id || row.categoria_id, limpar(novos.descricao || row.descricao, 190),
                     novos.valor > 0 ? dinheiro(novos.valor) : Math.abs(Number(row.valor)), dataYMD, mes, serieNovaId, recorrenteNovo]
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
    // Compra em serie com escopo "esta_e_proximas" (ex.: a assinatura mudou de preco): descricao, valor e categoria
    // valem tambem para as proximas ocorrencias ainda nao pagas; a data muda so nesta.
    // `reintegro` (true/false) liga ou desliga o reintegro da compra: ao ligar, vale a porcentagem que a compra ja tinha
    // (ou, se nao tinha, a do cartao hoje); o valor devolvido e recalculado sobre o valor novo. Nas ocorrencias seguintes
    // da serie o reintegro acompanha o que foi escolhido aqui.
    static async atualizarCompra(id, cartao, userId, { descricao, valor, data, categoria_id, reintegro = false }, escopo = 'apenas_esta') {
        if (categoria_id) await Lancamento.validarPropriedade(userId, null, categoria_id);
        const [rows] = await db.query(
            "SELECT fatura_mes, serie_id, reintegro_pct, DATE_FORMAT(data_compra, '%Y-%m-%d') AS data_compra FROM cartao_compras WHERE id = ? AND cartao_id = ? AND user_id = ? LIMIT 1",
            [id, cartao.id, userId]
        );
        if (!rows.length || (await this.faturaPaga(cartao.id, rows[0].fatura_mes))) return null;
        const mes = await this.mesDeNovaCompra(cartao, data);
        const valorLimpo = dinheiro(valor);
        const pct = reintegro ? (porcentagem(rows[0].reintegro_pct) || porcentagem(cartao.reintegro_pct)) : 0;
        await db.query(
            `UPDATE cartao_compras SET descricao = ?, valor = ?, reintegro_pct = ?, reintegro_valor = ?, data_compra = ?, categoria_id = ?, fatura_mes = ?
             WHERE id = ? AND cartao_id = ? AND user_id = ?`,
            [limpar(descricao, 190), valorLimpo, pct, valorReintegro(valorLimpo, pct), data, categoria_id || null, mes, id, cartao.id, userId]
        );
        if (escopo === 'esta_e_proximas' && rows[0].serie_id) {
            await db.query(
                `UPDATE cartao_compras cc SET cc.descricao = ?, cc.valor = ?, cc.reintegro_pct = ?, cc.reintegro_valor = ?, cc.categoria_id = ?
                 WHERE cc.user_id = ? AND cc.cartao_id = ? AND cc.serie_id = ? AND cc.id <> ? AND cc.data_compra >= ?
                   AND NOT EXISTS (SELECT 1 FROM cartao_faturas f WHERE f.cartao_id = cc.cartao_id AND f.mes = cc.fatura_mes)`,
                [limpar(descricao, 190), valorLimpo, pct, valorReintegro(valorLimpo, pct), categoria_id || null, userId, cartao.id, rows[0].serie_id, id, rows[0].data_compra]
            );
        }
        return mes;
    }

    // Faturas em aberto (com compras) de cartoes ativos que vencem em alguma das datas. Usado pelo lembrete de vencimento.
    static async vencimentos(userId, datas) {
        const [rows] = await db.query(
            `SELECT k.id AS cartao_id, k.nome, k.dia_fechamento, k.dia_vencimento, ct.moeda, cc.fatura_mes AS mes, SUM(${LIQUIDO}) AS total
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
    // Compra em serie com escopo "esta_e_proximas" (cancelar uma assinatura ou as parcelas restantes): apaga esta e as
    // ocorrencias seguintes que ainda estao em faturas nao pagas. Devolve quantas foram apagadas.
    static async excluirCompra(id, cartaoId, userId, escopo = 'apenas_esta') {
        const naoPaga = 'NOT EXISTS (SELECT 1 FROM cartao_faturas f WHERE f.cartao_id = cartao_compras.cartao_id AND f.mes = cartao_compras.fatura_mes)';
        let onde = `id = ? AND cartao_id = ? AND user_id = ? AND ${naoPaga}`;
        let params = [id, cartaoId, userId];
        if (escopo === 'esta_e_proximas') {
            const [[c]] = await db.query(
                "SELECT serie_id, DATE_FORMAT(data_compra, '%Y-%m-%d') AS data_compra FROM cartao_compras WHERE id = ? AND cartao_id = ? AND user_id = ? LIMIT 1",
                [id, cartaoId, userId]
            );
            if (c && c.serie_id) {
                onde = `user_id = ? AND cartao_id = ? AND serie_id = ? AND (id = ? OR data_compra >= ?) AND ${naoPaga}`;
                params = [userId, cartaoId, c.serie_id, id, c.data_compra];
            }
        }
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await SyncExclusao.registrar('cartao_compras', onde, params, conn);
            const [res] = await conn.query(`DELETE FROM cartao_compras WHERE ${onde}`, params);
            await conn.commit();
            return res.affectedRows;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
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
                    // O lancamento sai pelo que de fato foi pago: a compra menos o reintegro.
                    tipo: 'despesa', conta_id: cartao.conta_id, categoria_id: c.categoria_id, valor: c.liquido,
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
