// Modulo Compras: listas de compras, itens, produtos ja usados e fechamento (a compra vira um lancamento de despesa).
const db = require('../config/db');
const Lancamento = require('./Lancamento');
const consumo = require('../core/compras_consumo');

const limpar = (v, max) => String(v === null || v === undefined ? '' : v).trim().slice(0, max);
const dinheiro = (v) => Math.round((Number(v) || 0) * 100) / 100;

class Compra {
    // ---------- Listas ----------
    static async listas(userId, arquivadas = false) {
        const [rows] = await db.query(
            `SELECT l.*, c.nome AS categoria_nome,
                    COUNT(i.id) AS itens, COALESCE(SUM(i.marcado), 0) AS marcados,
                    COALESCE(SUM(i.preco), 0) AS soma_preco, COALESCE(SUM(i.preco IS NULL), 0) AS sem_preco
             FROM compras_listas l
             LEFT JOIN categorias c ON c.id = l.categoria_id
             LEFT JOIN compras_itens i ON i.lista_id = l.id
             WHERE l.user_id = ? AND l.status = ?
             GROUP BY l.id ORDER BY l.nome ASC`,
            [userId, arquivadas ? 'arquivada' : 'ativa']
        );
        return rows;
    }

    static async buscarLista(id, userId) {
        const [rows] = await db.query(
            `SELECT l.*, c.nome AS categoria_nome, ct.nome AS conta_nome, ct.moeda AS conta_moeda
             FROM compras_listas l
             LEFT JOIN categorias c ON c.id = l.categoria_id
             LEFT JOIN contas ct ON ct.id = l.conta_id
             WHERE l.id = ? AND l.user_id = ? LIMIT 1`,
            [id, userId]
        );
        return rows[0] || null;
    }

    // Categorias de despesa que a cliente pode escolher (pai com as subcategorias), sem as de sistema.
    static async categoriasDespesa(userId) {
        const [rows] = await db.query(
            `SELECT id, parent_id, nome FROM categorias
             WHERE user_id = ? AND status = 'ativa' AND sistema = 0 AND tipo <> 'receita'
             ORDER BY nome ASC`,
            [userId]
        );
        const pais = rows.filter((c) => !c.parent_id).map((c) => ({ ...c, subcategorias: [] }));
        const mapa = new Map(pais.map((p) => [p.id, p]));
        rows.filter((c) => c.parent_id && mapa.has(c.parent_id)).forEach((c) => mapa.get(c.parent_id).subcategorias.push(c));
        return pais;
    }

    static async criarLista(userId, { nome, categoria_id = null, conta_id = null }) {
        await Lancamento.validarPropriedade(userId, conta_id, categoria_id);
        const [r] = await db.query(
            'INSERT INTO compras_listas (user_id, nome, categoria_id, conta_id) VALUES (?, ?, ?, ?)',
            [userId, limpar(nome, 80), categoria_id || null, conta_id || null]
        );
        return r.insertId;
    }

    static async atualizarLista(id, userId, { nome, categoria_id = null, conta_id = null }) {
        await Lancamento.validarPropriedade(userId, conta_id, categoria_id);
        const [r] = await db.query(
            'UPDATE compras_listas SET nome = ?, categoria_id = ?, conta_id = ? WHERE id = ? AND user_id = ?',
            [limpar(nome, 80), categoria_id || null, conta_id || null, id, userId]
        );
        return r.affectedRows > 0;
    }

    static async definirStatusLista(id, userId, arquivar) {
        const [r] = await db.query('UPDATE compras_listas SET status = ? WHERE id = ? AND user_id = ?', [arquivar ? 'arquivada' : 'ativa', id, userId]);
        return r.affectedRows > 0;
    }

    // ---------- Itens ----------
    static async itens(listaId, userId) {
        const [rows] = await db.query(
            'SELECT id, nome, preco, marcado FROM compras_itens WHERE lista_id = ? AND user_id = ? ORDER BY marcado ASC, id ASC',
            [listaId, userId]
        );
        return rows;
    }

    // Produto do catalogo da cliente (cria se for novo). O nome e unico por cliente, sem diferenciar maiusculas.
    static async garantirProduto(userId, nome, conn = db) {
        await conn.query('INSERT IGNORE INTO compras_produtos (user_id, nome) VALUES (?, ?)', [userId, nome]);
        const [rows] = await conn.query('SELECT id, nome, ultimo_preco, avisar FROM compras_produtos WHERE user_id = ? AND nome = ? LIMIT 1', [userId, nome]);
        return rows[0];
    }

    // Adiciona o item com o ultimo preco pago (se houver). Se ele ja esta na lista, nao duplica.
    static async adicionarItem(userId, listaId, nomeBruto) {
        const nome = limpar(nomeBruto, 120);
        if (!nome) return null;
        const [ja] = await db.query('SELECT id FROM compras_itens WHERE lista_id = ? AND user_id = ? AND nome = ? LIMIT 1', [listaId, userId, nome]);
        if (ja.length) return { id: ja[0].id, repetido: true };
        const produto = await this.garantirProduto(userId, nome);
        // Se ela pediu para nao avisar deste produto mas o esta adicionando de novo, os avisos voltam.
        if (!produto.avisar) await db.query('UPDATE compras_produtos SET avisar = 1, aviso_ate = NULL WHERE id = ? AND user_id = ?', [produto.id, userId]);
        const [r] = await db.query(
            'INSERT INTO compras_itens (user_id, lista_id, produto_id, nome, preco) VALUES (?, ?, ?, ?, ?)',
            [userId, listaId, produto.id, produto.nome, produto.ultimo_preco]
        );
        return { id: r.insertId, repetido: false };
    }

    static async buscarItem(id, userId) {
        const [rows] = await db.query('SELECT * FROM compras_itens WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
        return rows[0] || null;
    }

    static async marcarItem(id, userId, marcado) {
        const [r] = await db.query('UPDATE compras_itens SET marcado = ? WHERE id = ? AND user_id = ?', [marcado ? 1 : 0, id, userId]);
        return r.affectedRows > 0;
    }

    static async marcarTodos(listaId, userId, marcado) {
        await db.query('UPDATE compras_itens SET marcado = ? WHERE lista_id = ? AND user_id = ?', [marcado ? 1 : 0, listaId, userId]);
    }

    static async definirPreco(id, userId, preco) {
        const valor = preco > 0 ? dinheiro(preco) : null;
        const [r] = await db.query('UPDATE compras_itens SET preco = ? WHERE id = ? AND user_id = ?', [valor, id, userId]);
        return r.affectedRows > 0;
    }

    static async excluirItem(id, userId) {
        const [r] = await db.query('DELETE FROM compras_itens WHERE id = ? AND user_id = ?', [id, userId]);
        return r.affectedRows > 0;
    }

    // Sugestoes ao digitar: os produtos mais comprados primeiro.
    static async sugestoes(userId, limite = 300) {
        const [rows] = await db.query(
            'SELECT nome FROM compras_produtos WHERE user_id = ? ORDER BY vezes_compra DESC, nome ASC LIMIT ?',
            [userId, limite]
        );
        return rows.map((r) => r.nome);
    }

    // ---------- Aviso de consumo ----------
    // Produtos que provavelmente estao acabando: o ritmo de compra de cada um vem do historico (ver core/compras_consumo.js).
    // Nao lista o que ja esta em alguma lista ativa. paraNotificacao: pula o que ja foi avisado por notificacao nos ultimos 3 dias.
    static async avisos(userId, hoje, { limite = 12, paraNotificacao = false } = {}) {
        const [produtos] = await db.query(
            `SELECT p.id, p.nome, DATE_FORMAT(p.aviso_ate, '%Y-%m-%d') AS aviso_ate, DATE_FORMAT(p.notificado_em, '%Y-%m-%d') AS notificado_em
             FROM compras_produtos p
             WHERE p.user_id = ? AND p.avisar = 1
               AND NOT EXISTS (SELECT 1 FROM compras_itens i JOIN compras_listas l ON l.id = i.lista_id AND l.status = 'ativa'
                               WHERE i.produto_id = p.id AND i.user_id = p.user_id)`,
            [userId]
        );
        if (!produtos.length) return [];
        const [hist] = await db.query(
            "SELECT produto_id, DATE_FORMAT(data_compra, '%Y-%m-%d') AS d FROM compras_historico WHERE user_id = ? GROUP BY produto_id, data_compra",
            [userId]
        );
        const datas = new Map();
        hist.forEach((h) => { if (!datas.has(h.produto_id)) datas.set(h.produto_id, []); datas.get(h.produto_id).push(h.d); });
        const limiteRepeticao = consumo.somar(hoje, -3);
        const lista = [];
        for (const p of produtos) {
            const a = consumo.avaliar({ datas: datas.get(p.id) || [], hoje, avisarAte: p.aviso_ate });
            if (!a) continue;
            if (paraNotificacao && p.notificado_em && p.notificado_em > limiteRepeticao) continue;
            lista.push({ id: p.id, nome: p.nome, ...a });
        }
        lista.sort((x, y) => y.atraso - x.atraso || x.nome.localeCompare(y.nome));
        return lista.slice(0, limite);
    }

    static async marcarNotificados(userId, ids, hoje) {
        if (!ids.length) return;
        await db.query(`UPDATE compras_produtos SET notificado_em = ? WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`, [hoje, userId, ...ids]);
    }

    // "Agora nao" esconde o aviso por um ciclo inteiro; "nunca" para de avisar deste produto.
    static async dispensarAviso(userId, produtoId, modo, hoje) {
        if (modo === 'nunca') {
            const [r] = await db.query('UPDATE compras_produtos SET avisar = 0 WHERE id = ? AND user_id = ?', [produtoId, userId]);
            return r.affectedRows > 0;
        }
        const [hist] = await db.query(
            "SELECT DATE_FORMAT(data_compra, '%Y-%m-%d') AS d FROM compras_historico WHERE user_id = ? AND produto_id = ? GROUP BY data_compra",
            [userId, produtoId]
        );
        const c = consumo.ciclo(hist.map((h) => h.d));
        const [r] = await db.query('UPDATE compras_produtos SET aviso_ate = ? WHERE id = ? AND user_id = ?', [consumo.somar(hoje, c ? c.intervalo : 7), produtoId, userId]);
        return r.affectedRows > 0;
    }

    // ---------- Estimativa ----------
    // Resume o que o app sabe sobre o gasto da lista, do mais preciso ao menos:
    //  'itens'   todos os itens tem preco -> soma exata;
    //  'parcial' alguns itens tem preco  -> soma do que se sabe + quantos faltam;
    //  'media'   nenhum preco, mas ha compras fechadas -> media das ultimas;
    //  'nenhum'  nada para estimar (nao inventa numero).
    static async estimativa(listaId, userId) {
        const [[soma]] = await db.query(
            `SELECT COUNT(*) AS itens, COALESCE(SUM(preco), 0) AS soma, COALESCE(SUM(preco IS NULL), 0) AS sem_preco,
                    COALESCE(SUM(CASE WHEN marcado = 1 THEN preco ELSE 0 END), 0) AS soma_marcados,
                    COALESCE(SUM(marcado), 0) AS marcados
             FROM compras_itens WHERE lista_id = ? AND user_id = ?`,
            [listaId, userId]
        );
        const [ultimas] = await db.query(
            'SELECT total FROM compras_fechamentos WHERE lista_id = ? AND user_id = ? ORDER BY data_compra DESC, id DESC LIMIT 3',
            [listaId, userId]
        );
        const media = ultimas.length ? dinheiro(ultimas.reduce((a, f) => a + Number(f.total), 0) / ultimas.length) : null;
        const itens = Number(soma.itens), semPreco = Number(soma.sem_preco), valor = dinheiro(soma.soma);
        let nivel = 'nenhum';
        if (itens > 0 && semPreco === 0) nivel = 'itens';
        else if (itens > 0 && valor > 0) nivel = 'parcial';
        else if (media !== null) nivel = 'media';
        return {
            nivel, itens, marcados: Number(soma.marcados), semPreco, media,
            soma: valor, somaMarcados: dinheiro(soma.soma_marcados),
            valor: nivel === 'media' ? media : valor
        };
    }

    // ---------- Fechar a compra ----------
    // Cria o lancamento de despesa (ja pago), leva os itens marcados para o historico e tira-os da lista.
    // Os que nao foram marcados ficam para a proxima compra (ou saem, se a cliente descartar).
    static async fechar(userId, lista, { total, data, contaId, categoriaId, precos = {}, descartarRestantes = false, comprouIds = [], extras = [] }) {
        const estimativa = await this.estimativa(lista.id, userId);
        // Comprados = os marcados + os que a leitura da nota reconheceu (ainda nao marcados). Extras: comprados fora da lista.
        const ids = [...new Set(comprouIds.map(Number).filter((n) => n > 0))];
        const [marcados] = await db.query(
            `SELECT id, produto_id, nome, preco FROM compras_itens WHERE lista_id = ? AND user_id = ? AND (marcado = 1${ids.length ? ` OR id IN (${ids.map(() => '?').join(',')})` : ''})`,
            [lista.id, userId, ...ids]
        );

        const [lancamentoId] = await Lancamento.criar(userId, {
            tipo: 'despesa', conta_id: contaId, categoria_id: categoriaId, valor: total, descricao: lista.nome,
            data_competencia: data, status: 'pago', data_pagamento: data
        });

        let comprados = marcados.length;
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            for (const item of marcados) {
                const informado = Number(precos[item.id]);
                const preco = informado > 0 ? dinheiro(informado) : (item.preco !== null ? Number(item.preco) : null);
                const produtoId = item.produto_id || (await this.garantirProduto(userId, item.nome, conn)).id;
                await conn.query(
                    `UPDATE compras_produtos SET ultimo_preco = COALESCE(?, ultimo_preco), ultima_compra = ?, vezes_compra = vezes_compra + 1 WHERE id = ? AND user_id = ?`,
                    [preco, data, produtoId, userId]
                );
                await conn.query('INSERT INTO compras_historico (user_id, produto_id, data_compra, preco) VALUES (?, ?, ?, ?)', [userId, produtoId, data, preco]);
            }
            for (const ex of extras.slice(0, 80)) {
                const nome = limpar(ex.nome, 120);
                if (!nome) continue;
                const preco = Number(ex.preco) > 0 ? dinheiro(ex.preco) : null;
                const produto = await this.garantirProduto(userId, nome, conn);
                await conn.query('UPDATE compras_produtos SET ultimo_preco = COALESCE(?, ultimo_preco), ultima_compra = ?, vezes_compra = vezes_compra + 1 WHERE id = ? AND user_id = ?', [preco, data, produto.id, userId]);
                await conn.query('INSERT INTO compras_historico (user_id, produto_id, data_compra, preco) VALUES (?, ?, ?, ?)', [userId, produto.id, data, preco]);
                comprados++;
            }
            if (marcados.length) {
                await conn.query(`DELETE FROM compras_itens WHERE user_id = ? AND id IN (${marcados.map(() => '?').join(',')})`, [userId, ...marcados.map((m) => m.id)]);
            }
            if (descartarRestantes) await conn.query('DELETE FROM compras_itens WHERE lista_id = ? AND user_id = ?', [lista.id, userId]);
            await conn.query(
                'INSERT INTO compras_fechamentos (user_id, lista_id, lancamento_id, total, estimativa, itens_comprados, data_compra) VALUES (?, ?, ?, ?, ?, ?, ?)',
                [userId, lista.id, lancamentoId, total, estimativa.nivel === 'nenhum' ? null : estimativa.valor, comprados, data]
            );
            // Lembra a categoria e a conta escolhidas para a proxima vez.
            await conn.query('UPDATE compras_listas SET conta_id = ?, categoria_id = ? WHERE id = ? AND user_id = ?', [contaId, categoriaId, lista.id, userId]);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            // O lancamento ja existe: desfaz para a compra nao ficar lancada sem fechar.
            await Lancamento.excluir(lancamentoId, userId).catch(() => {});
            throw err;
        } finally {
            conn.release();
        }
        return { lancamentoId, estimativa, comprados };
    }
}

module.exports = Compra;
