// Modulo Clientes: produtos que a pessoa vende (com foto, custo e estoque) e as vendas para os clientes.
// Cada parcela da venda e um lancamento de receita ligado por lancamentos.venda_id (a vista = uma parcela ja paga);
// assim a venda entra no saldo da conta, nas Cobrancas e nos relatorios pela mesma regra das cuotas dos servicos.
// Ideia do pedido do MinhaLoja: o item guarda nome, preco e custo do momento da venda.
const { randomUUID } = require('crypto');
const db = require('../config/db');
const regras = require('../core/vendas_regras');
const { hojeLocal, toLocalYMD } = require('../core/helpers');
const SyncExclusao = require('./SyncExclusao');

const hojeYMD = () => toLocalYMD(hojeLocal());
const ND = '%Y-%m-%d';

// Categoria "Vendas de produtos" (pai de todas as vendas) no idioma da conta.
const CATEGORIA_VENDAS = { 'pt-BR': 'Vendas de produtos', 'es-PY': 'Venta de productos', 'en-US': 'Product sales' };
const COR_VENDAS = '#F59E0B';

const likeSeguro = (q) => `%${String(q).replace(/[\\%_]/g, (c) => '\\' + c)}%`;
const falha = (codigo, extra = {}) => Object.assign(new Error(codigo), { codigo, ...extra });

class Venda {
    // ---------- Categoria das vendas ----------
    static async categoriaVendas(userId, conn = db) {
        const [[u]] = await conn.query('SELECT idioma, categoria_vendas_id FROM users WHERE id = ? LIMIT 1', [userId]);
        if (u && u.categoria_vendas_id) {
            const [r] = await conn.query('SELECT id, status, parent_id FROM categorias WHERE id = ? AND user_id = ? LIMIT 1', [u.categoria_vendas_id, userId]);
            if (r[0] && !r[0].parent_id) {
                if (r[0].status !== 'ativa') await conn.query("UPDATE categorias SET status = 'ativa' WHERE id = ?", [r[0].id]);
                return r[0].id;
            }
        }
        const nome = CATEGORIA_VENDAS[u && u.idioma] || CATEGORIA_VENDAS['es-PY'];
        const [ex] = await conn.query(
            "SELECT id FROM categorias WHERE user_id = ? AND parent_id IS NULL AND sistema = 0 AND tipo IN ('receita', 'ambas') AND nome IN (?) ORDER BY id LIMIT 1",
            [userId, Object.values(CATEGORIA_VENDAS)]
        );
        let id;
        if (ex[0]) {
            id = ex[0].id;
            await conn.query("UPDATE categorias SET status = 'ativa' WHERE id = ?", [id]);
        } else {
            const [ins] = await conn.query(
                `INSERT INTO categorias (user_id, parent_id, nome, cor, tipo, sistema, status, created_at, updated_at)
                 VALUES (?, NULL, ?, ?, 'receita', 0, 'ativa', NOW(), NOW())`,
                [userId, nome, COR_VENDAS]
            );
            id = ins.insertId;
        }
        await conn.query('UPDATE users SET categoria_vendas_id = ? WHERE id = ?', [id, userId]);
        return id;
    }

    // ---------- Produtos ----------
    // `estoque = 'baixo'`: so os que acabaram ou estao no minimo.
    static async listarProdutos(userId, { arquivados = false, q = '', estoque = '' } = {}) {
        let where = 'p.user_id = ? AND p.status = ?';
        const params = [userId, arquivados ? 'arquivado' : 'ativo'];
        const termo = String(q || '').trim();
        if (termo) { where += ' AND (p.nome LIKE ? OR p.descricao LIKE ?)'; params.push(likeSeguro(termo), likeSeguro(termo)); }
        if (estoque === 'baixo') where += ' AND p.estoque IS NOT NULL AND p.estoque <= COALESCE(p.estoque_minimo, 0)';
        const [rows] = await db.query(
            `SELECT p.*, UNIX_TIMESTAMP(p.foto_em) AS foto_v,
                (SELECT COALESCE(SUM(i.quantidade), 0) FROM cliente_venda_itens i JOIN cliente_vendas v ON v.id = i.venda_id
                  WHERE i.produto_id = p.id AND v.status = 'ativa') AS vendidos
             FROM cliente_produtos p WHERE ${where} ORDER BY p.nome LIMIT 2000`,
            params
        );
        return rows;
    }

    // Quantos produtos ativos acabaram e quantos estao no estoque minimo.
    static async totaisEstoque(userId) {
        const [[r]] = await db.query(
            `SELECT SUM(estoque IS NOT NULL AND estoque <= 0) AS sem,
                    SUM(estoque IS NOT NULL AND estoque > 0 AND estoque_minimo IS NOT NULL AND estoque <= estoque_minimo) AS baixo,
                    COUNT(*) AS ativos
             FROM cliente_produtos WHERE user_id = ? AND status = 'ativo'`,
            [userId]
        );
        return { sem: Number(r.sem) || 0, baixo: Number(r.baixo) || 0, ativos: Number(r.ativos) || 0 };
    }

    static async buscarProduto(id, userId) {
        const [rows] = await db.query('SELECT * FROM cliente_produtos WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
        return rows[0] || null;
    }

    static async criarProduto(userId, d) {
        try {
            const [r] = await db.query(
                'INSERT INTO cliente_produtos (user_id, nome, descricao, preco, custo, estoque, estoque_minimo) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [userId, d.nome, d.descricao, d.preco, d.custo, d.estoque, d.minimo]
            );
            return { id: r.insertId };
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') return { duplicado: true };
            throw err;
        }
    }

    static async atualizarProduto(userId, id, d) {
        try {
            const [r] = await db.query(
                'UPDATE cliente_produtos SET nome = ?, descricao = ?, preco = ?, custo = ?, estoque = ?, estoque_minimo = ? WHERE id = ? AND user_id = ?',
                [d.nome, d.descricao, d.preco, d.custo, d.estoque, d.minimo, id, userId]
            );
            return r.affectedRows ? { ok: true } : { naoEncontrado: true };
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') return { duplicado: true };
            throw err;
        }
    }

    static async definirStatusProduto(userId, id, status) {
        await db.query('UPDATE cliente_produtos SET status = ? WHERE id = ? AND user_id = ?', [status === 'arquivado' ? 'arquivado' : 'ativo', id, userId]);
    }

    // ---------- Foto do produto ----------
    static async obterFoto(userId, produtoId) {
        const [rows] = await db.query('SELECT mime, dados FROM cliente_produto_fotos WHERE produto_id = ? AND user_id = ? LIMIT 1', [produtoId, userId]);
        return rows[0] || null;
    }

    static async salvarFoto(userId, produtoId, mime, dados) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [[p]] = await conn.query('SELECT id FROM cliente_produtos WHERE id = ? AND user_id = ? LIMIT 1', [produtoId, userId]);
            if (!p) { await conn.rollback(); return false; }
            await conn.query(
                'INSERT INTO cliente_produto_fotos (produto_id, user_id, mime, dados) VALUES (?, ?, ?, ?) ON DUPLICATE KEY UPDATE mime = VALUES(mime), dados = VALUES(dados)',
                [produtoId, userId, mime, dados]
            );
            await conn.query('UPDATE cliente_produtos SET foto_em = NOW() WHERE id = ? AND user_id = ?', [produtoId, userId]);
            await conn.commit();
            return true;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    static async removerFoto(userId, produtoId) {
        await db.query('DELETE FROM cliente_produto_fotos WHERE produto_id = ? AND user_id = ?', [produtoId, userId]);
        await db.query('UPDATE cliente_produtos SET foto_em = NULL WHERE id = ? AND user_id = ?', [produtoId, userId]);
    }

    // ---------- Clientes para a tela de venda ----------
    static async buscarClientes(userId, q, limite = 12) {
        const termo = String(q || '').trim().slice(0, 80);
        if (!termo) return [];
        const like = likeSeguro(termo);
        const [rows] = await db.query(
            `SELECT id, nome, celular, cedula FROM clientes
             WHERE user_id = ? AND status = 'ativo' AND (nome LIKE ? OR cedula LIKE ? OR ruc LIKE ? OR celular LIKE ?)
             ORDER BY nome LIMIT ?`,
            [userId, like, like, like, like, limite]
        );
        return rows;
    }

    // ---------- Vendas ----------
    // `itens` ja validados por regras.validarItens; `pagamento` por regras.validarPagamento.
    // Erros com `codigo`: cliente, conta, produto, total, estoque (com `faltam`).
    static async criarVenda(userId, { clienteId, contaId, dataVenda, itens, pagamento, observacoes }) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [[cli]] = await conn.query("SELECT id, nome FROM clientes WHERE id = ? AND user_id = ? AND status = 'ativo' LIMIT 1", [clienteId, userId]);
            if (!cli) throw falha('cliente');
            const [[cta]] = await conn.query("SELECT id, moeda FROM contas WHERE id = ? AND user_id = ? AND status = 'ativa' LIMIT 1", [contaId, userId]);
            if (!cta) throw falha('conta');

            // Trava os produtos ate o fim: duas vendas ao mesmo tempo nao vendem a mesma ultima unidade.
            const ids = [...new Set(itens.map((i) => i.produtoId))];
            const [prods] = await conn.query(
                'SELECT id, nome, custo, estoque, status FROM cliente_produtos WHERE user_id = ? AND id IN (?) FOR UPDATE',
                [userId, ids]
            );
            const porId = new Map(prods.map((p) => [p.id, p]));
            const pedido = new Map();
            for (const it of itens) {
                const p = porId.get(it.produtoId);
                if (!p || p.status !== 'ativo') throw falha('produto');
                pedido.set(p.id, (pedido.get(p.id) || 0) + it.quantidade);
            }
            const faltam = [];
            for (const [id, qtd] of pedido) {
                const p = porId.get(id);
                if (p.estoque !== null && qtd > p.estoque) faltam.push({ nome: p.nome, disponivel: Math.max(0, p.estoque) });
            }
            if (faltam.length) throw falha('estoque', { faltam });

            const casas = regras.casasDaMoeda(cta.moeda);
            const linhas = itens.map((it) => {
                const p = porId.get(it.produtoId);
                return { produtoId: p.id, nome: p.nome, quantidade: it.quantidade, preco: regras.arredondar(it.preco, casas), custo: p.custo === null ? null : Number(p.custo) };
            });
            const total = regras.arredondar(linhas.reduce((s, l) => s + l.preco * l.quantidade, 0), casas);
            if (!(total > 0) || total >= 1e12) throw falha('total');
            const custoTotal = regras.arredondar(linhas.reduce((s, l) => s + (l.custo === null ? 0 : l.custo * l.quantidade), 0), 2);
            const semCusto = linhas.filter((l) => l.custo === null).length;
            const resumo = regras.resumoDosItens(linhas);

            const [[seq]] = await conn.query('SELECT COALESCE(MAX(numero), 0) + 1 AS n FROM cliente_vendas WHERE user_id = ? FOR UPDATE', [userId]);
            const serieId = pagamento.parcelas > 1 ? randomUUID() : null;
            const [ins] = await conn.query(
                `INSERT INTO cliente_vendas (user_id, numero, cliente_id, conta_id, data_venda, total, custo_total, itens_sem_custo, resumo,
                    forma, parcelas, observacoes, serie_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, seq.n, cli.id, cta.id, dataVenda, total, custoTotal, semCusto, resumo, pagamento.forma, pagamento.parcelas, observacoes || null, serieId]
            );
            const vendaId = ins.insertId;
            await conn.query(
                'INSERT INTO cliente_venda_itens (venda_id, produto_id, nome, quantidade, preco_unit, custo_unit) VALUES ?',
                [linhas.map((l) => [vendaId, l.produtoId, l.nome, l.quantidade, l.preco, l.custo])]
            );
            for (const [id, qtd] of pedido) {
                if (porId.get(id).estoque !== null) {
                    await conn.query('UPDATE cliente_produtos SET estoque = estoque - ? WHERE id = ? AND user_id = ?', [qtd, id, userId]);
                }
            }

            // Parcelas = receitas. A vista: uma so, paga na data da venda. A prazo: mensais a partir do 1o vencimento.
            const categoriaId = await this.categoriaVendas(userId, conn);
            const avista = pagamento.forma === 'avista';
            const datas = avista ? [{ num: 1, data: dataVenda }] : regras.datasDasParcelas(pagamento.primeiro, pagamento.parcelas);
            const valores = regras.dividirEmParcelas(total, datas.length, casas);
            const hoje = hojeYMD();
            const lancamentos = datas.map((d, i) => {
                const pago = avista || (i === 0 && pagamento.primeiraPaga);
                const dataPag = !pago ? null : (avista ? dataVenda : (d.data <= hoje ? d.data : hoje));
                return [
                    userId, serieId, cta.id, categoriaId, 'receita', regras.descricaoDaParcela(resumo, cli.nome, d.num, datas.length),
                    valores[i], d.data, dataPag, pago ? 'pago' : 'pendente', 0, vendaId, d.num
                ];
            });
            await conn.query(
                `INSERT INTO lancamentos (user_id, serie_id, conta_id, categoria_id, tipo, descricao, valor, data_competencia,
                    data_pagamento, status, recorrente, venda_id, cuota_num) VALUES ?`,
                [lancamentos]
            );
            await conn.commit();
            return { id: vendaId, numero: seq.n, parcelas: datas.length };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    static _filtroVendas(userId, { inicio, fim, q, estado, clienteId }) {
        let where = 'v.user_id = ?';
        const params = [userId];
        if (inicio && fim) { where += ' AND v.data_venda BETWEEN ? AND ?'; params.push(inicio, fim); }
        if (clienteId) { where += ' AND v.cliente_id = ?'; params.push(clienteId); }
        if (estado === 'canceladas') where += " AND v.status = 'cancelada'";
        else if (estado === 'a_receber') where += " AND v.status = 'ativa' AND EXISTS (SELECT 1 FROM lancamentos x WHERE x.venda_id = v.id AND x.status = 'pendente')";
        else if (estado === 'recebidas') where += " AND v.status = 'ativa' AND NOT EXISTS (SELECT 1 FROM lancamentos x WHERE x.venda_id = v.id AND x.status = 'pendente')";
        const termo = String(q || '').trim();
        if (termo) {
            const like = likeSeguro(termo);
            const num = /^#?\d+$/.test(termo) ? parseInt(termo.replace('#', ''), 10) : 0;
            where += ' AND (c.nome LIKE ? OR c.cedula LIKE ? OR v.resumo LIKE ? OR v.numero = ?)';
            params.push(like, like, like, num);
        }
        return { where, params };
    }

    static _colunasVenda = `v.id, v.numero, v.cliente_id, c.nome AS cliente_nome, c.celular, DATE_FORMAT(v.data_venda, '${ND}') AS data,
        v.total, v.custo_total, v.itens_sem_custo, v.resumo, v.forma, v.parcelas, v.status, v.observacoes,
        DATE_FORMAT(v.cancelada_em, '${ND}') AS cancelada, cb.moeda, cb.nome AS conta_nome,
        (SELECT COUNT(*) FROM lancamentos l WHERE l.venda_id = v.id) AS lancadas,
        (SELECT COUNT(*) FROM lancamentos l WHERE l.venda_id = v.id AND l.status = 'pago') AS pagas,
        (SELECT COALESCE(SUM(l.valor), 0) FROM lancamentos l WHERE l.venda_id = v.id AND l.status = 'pago') AS recebido,
        (SELECT COALESCE(SUM(l.valor), 0) FROM lancamentos l WHERE l.venda_id = v.id AND l.status = 'pendente') AS a_receber,
        (SELECT COUNT(*) FROM lancamentos l WHERE l.venda_id = v.id AND l.status = 'pendente' AND l.data_competencia < ?) AS vencidas`;

    static async listarVendas(userId, filtros, pagina = 1, porPagina = 30) {
        const { where, params } = this._filtroVendas(userId, filtros);
        const base = 'FROM cliente_vendas v JOIN clientes c ON c.id = v.cliente_id JOIN contas cb ON cb.id = v.conta_id';
        const [[tot]] = await db.query(`SELECT COUNT(*) AS n ${base} WHERE ${where}`, params);
        const [rows] = await db.query(
            `SELECT ${this._colunasVenda} ${base} WHERE ${where} ORDER BY v.data_venda DESC, v.id DESC LIMIT ? OFFSET ?`,
            [hojeYMD(), ...params, porPagina, (Math.max(1, pagina) - 1) * porPagina]
        );
        return { vendas: rows, total: tot.n };
    }

    // Itens e parcelas de cada venda da lista.
    static async _completar(userId, vendas) {
        if (!vendas.length) return vendas;
        const ids = vendas.map((v) => v.id);
        const [itens] = await db.query(
            `SELECT i.venda_id, i.produto_id, i.nome, i.quantidade, i.preco_unit, i.custo_unit, UNIX_TIMESTAMP(p.foto_em) AS foto_v
             FROM cliente_venda_itens i LEFT JOIN cliente_produtos p ON p.id = i.produto_id
             WHERE i.venda_id IN (?) ORDER BY i.id`,
            [ids]
        );
        const [cuotas] = await db.query(
            `SELECT l.id, l.venda_id, l.cuota_num, l.valor, l.status, DATE_FORMAT(l.data_competencia, '${ND}') AS venc,
                    DATE_FORMAT(l.data_pagamento, '${ND}') AS pago_em
             FROM lancamentos l WHERE l.user_id = ? AND l.venda_id IN (?) ORDER BY l.venda_id, l.cuota_num, l.data_competencia`,
            [userId, ids]
        );
        const agrupar = (lista) => lista.reduce((m, x) => { (m[x.venda_id] = m[x.venda_id] || []).push(x); return m; }, {});
        const porItens = agrupar(itens);
        const porCuotas = agrupar(cuotas);
        vendas.forEach((v) => { v.itens = porItens[v.id] || []; v.cuotas = porCuotas[v.id] || []; });
        return vendas;
    }

    static async buscarVenda(id, userId) {
        const [rows] = await db.query(
            `SELECT ${this._colunasVenda} FROM cliente_vendas v JOIN clientes c ON c.id = v.cliente_id JOIN contas cb ON cb.id = v.conta_id
             WHERE v.id = ? AND v.user_id = ? LIMIT 1`,
            [hojeYMD(), id, userId]
        );
        if (!rows[0]) return null;
        await this._completar(userId, rows);
        return rows[0];
    }

    // Vendas do cliente (ficha), mais recentes primeiro.
    static async vendasDoCliente(userId, clienteId, limite = 50) {
        const r = await this.listarVendas(userId, { clienteId }, 1, limite);
        await this._completar(userId, r.vendas);
        return r;
    }

    // Totais do periodo por moeda (vendas ativas): faturamento, lucro dos itens com custo, recebido e a receber.
    static async resumoPeriodo(userId, inicio, fim) {
        const hoje = hojeYMD();
        const [itens] = await db.query(
            `SELECT cb.moeda, COUNT(DISTINCT v.id) AS vendas, COALESCE(SUM(i.quantidade), 0) AS unidades,
                COALESCE(SUM(i.preco_unit * i.quantidade), 0) AS faturamento,
                COALESCE(SUM(CASE WHEN i.custo_unit IS NOT NULL THEN i.custo_unit * i.quantidade END), 0) AS custo,
                COALESCE(SUM(CASE WHEN i.custo_unit IS NOT NULL THEN i.preco_unit * i.quantidade END), 0) AS faturamento_com_custo,
                SUM(i.custo_unit IS NULL) AS itens_sem_custo
             FROM cliente_vendas v JOIN cliente_venda_itens i ON i.venda_id = v.id JOIN contas cb ON cb.id = v.conta_id
             WHERE v.user_id = ? AND v.status = 'ativa' AND v.data_venda BETWEEN ? AND ?
             GROUP BY cb.moeda ORDER BY faturamento DESC`,
            [userId, inicio, fim]
        );
        const [receb] = await db.query(
            `SELECT cb.moeda,
                COALESCE(SUM(CASE WHEN l.status = 'pago' THEN l.valor END), 0) AS recebido,
                COALESCE(SUM(CASE WHEN l.status = 'pendente' THEN l.valor END), 0) AS a_receber,
                COALESCE(SUM(CASE WHEN l.status = 'pendente' AND l.data_competencia < ? THEN l.valor END), 0) AS vencido
             FROM cliente_vendas v JOIN lancamentos l ON l.venda_id = v.id JOIN contas cb ON cb.id = v.conta_id
             WHERE v.user_id = ? AND v.status = 'ativa' AND v.data_venda BETWEEN ? AND ?
             GROUP BY cb.moeda`,
            [hoje, userId, inicio, fim]
        );
        const porMoeda = new Map(receb.map((r) => [r.moeda, r]));
        return itens.map((r) => {
            const x = porMoeda.get(r.moeda) || {};
            const comCusto = Number(r.faturamento_com_custo);
            const lucro = comCusto - Number(r.custo);
            return {
                moeda: r.moeda, vendas: Number(r.vendas), unidades: Number(r.unidades), faturamento: Number(r.faturamento),
                custo: Number(r.custo), lucro, margem: comCusto > 0 ? Math.round((lucro / comCusto) * 1000) / 10 : null,
                itensSemCusto: Number(r.itens_sem_custo) || 0, recebido: Number(x.recebido) || 0,
                aReceber: Number(x.a_receber) || 0, vencido: Number(x.vencido) || 0
            };
        });
    }

    // Produtos mais vendidos do periodo (por unidades).
    static async maisVendidos(userId, inicio, fim, limite = 5) {
        const [rows] = await db.query(
            `SELECT i.produto_id, MAX(i.nome) AS nome, cb.moeda, SUM(i.quantidade) AS unidades,
                SUM(i.preco_unit * i.quantidade) AS faturamento,
                SUM(CASE WHEN i.custo_unit IS NOT NULL THEN (i.preco_unit - i.custo_unit) * i.quantidade END) AS lucro,
                SUM(i.custo_unit IS NULL) AS sem_custo, MAX(UNIX_TIMESTAMP(p.foto_em)) AS foto_v
             FROM cliente_vendas v JOIN cliente_venda_itens i ON i.venda_id = v.id JOIN contas cb ON cb.id = v.conta_id
             LEFT JOIN cliente_produtos p ON p.id = i.produto_id
             WHERE v.user_id = ? AND v.status = 'ativa' AND v.data_venda BETWEEN ? AND ?
             GROUP BY i.produto_id, cb.moeda ORDER BY unidades DESC, faturamento DESC LIMIT ?`,
            [userId, inicio, fim, limite]
        );
        return rows;
    }

    // Devolve ao estoque os itens das vendas ATIVAS indicadas (produtos que controlam estoque).
    static async _devolverEstoque(conn, userId, vendaIds) {
        if (!vendaIds.length) return;
        await conn.query(
            `UPDATE cliente_produtos p
             JOIN (SELECT i.produto_id, SUM(i.quantidade) AS q FROM cliente_venda_itens i JOIN cliente_vendas v ON v.id = i.venda_id
                   WHERE v.user_id = ? AND v.status = 'ativa' AND v.id IN (?) AND i.produto_id IS NOT NULL GROUP BY i.produto_id) x
               ON x.produto_id = p.id
             SET p.estoque = p.estoque + x.q
             WHERE p.user_id = ? AND p.estoque IS NOT NULL`,
            [userId, vendaIds, userId]
        );
    }

    // Cancela: o estoque volta, as parcelas a receber saem. As ja recebidas ficam (o dinheiro entrou), a nao ser que
    // `apagarRecebidas` (venda lancada por engano): ai saem tambem e o saldo da conta muda.
    static async cancelarVenda(userId, id, { apagarRecebidas = false } = {}) {
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [[v]] = await conn.query('SELECT id, status FROM cliente_vendas WHERE id = ? AND user_id = ? FOR UPDATE', [id, userId]);
            if (!v || v.status !== 'ativa') { await conn.rollback(); return { naoEncontrado: true }; }
            await this._devolverEstoque(conn, userId, [id]);
            const onde = `user_id = ? AND venda_id = ?${apagarRecebidas ? '' : " AND status = 'pendente'"}`;
            await SyncExclusao.registrar('lancamentos', onde, [userId, id], conn);
            const [del] = await conn.query(`DELETE FROM lancamentos WHERE ${onde}`, [userId, id]);
            const [[fica]] = await conn.query("SELECT COUNT(*) AS n FROM lancamentos WHERE user_id = ? AND venda_id = ? AND status = 'pago'", [userId, id]);
            await conn.query("UPDATE cliente_vendas SET status = 'cancelada', cancelada_em = ? WHERE id = ? AND user_id = ?", [hojeYMD(), id, userId]);
            await conn.commit();
            return { ok: true, removidas: del.affectedRows, mantidas: Number(fica.n) || 0 };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    // Antes de excluir clientes (dentro da transacao da exclusao): devolve o estoque das vendas ativas e apaga as
    // receitas das vendas deles. As vendas em si saem junto com o cliente (ON DELETE CASCADE).
    static async antesDeExcluirClientes(conn, userId, clienteIds) {
        if (!clienteIds.length) return 0;
        const [vendas] = await conn.query('SELECT id FROM cliente_vendas WHERE user_id = ? AND cliente_id IN (?)', [userId, clienteIds]);
        const ids = vendas.map((v) => v.id);
        if (!ids.length) return 0;
        await this._devolverEstoque(conn, userId, ids);
        const onde = 'user_id = ? AND venda_id IN (?)';
        await SyncExclusao.registrar('lancamentos', onde, [userId, ids], conn);
        const [del] = await conn.query(`DELETE FROM lancamentos WHERE ${onde}`, [userId, ids]);
        return del.affectedRows;
    }
}

module.exports = Venda;
