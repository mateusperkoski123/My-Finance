const db = require('../config/db');

class Categoria {
    static async buscarArvore(userId, incluirArquivadas = false) {
        const sql = incluirArquivadas
            ? 'SELECT * FROM categorias WHERE user_id = ? ORDER BY parent_id ASC, nome ASC'
            : "SELECT * FROM categorias WHERE user_id = ? AND status = 'ativa' ORDER BY parent_id ASC, nome ASC";
        const [rows] = await db.query(sql, [userId]);

        const mapa = {};
        const raiz = [];

        rows.forEach(cat => {
            mapa[cat.id] = { ...cat, subcategorias: [] };
        });

        rows.forEach(cat => {
            if (cat.parent_id && mapa[cat.parent_id]) {
                mapa[cat.parent_id].subcategorias.push(mapa[cat.id]);
            } else if (!cat.parent_id) {
                raiz.push(mapa[cat.id]);
            }
        });

        return raiz;
    }

    // Arvore para a tela de gestao: aba ativas ou arquivadas + busca por nome (pai ou sub).
    static async buscarArvoreGerenciar(userId, { arquivadas = false, busca = '' } = {}) {
        const [rows] = await db.query(
            'SELECT * FROM categorias WHERE user_id = ? AND status = ? ORDER BY nome ASC',
            [userId, arquivadas ? 'arquivada' : 'ativa']
        );
        const mapa = {};
        rows.forEach(c => { mapa[c.id] = { ...c, e_sistema: !!c.sistema, subcategorias: [] }; });
        const raiz = [];
        rows.forEach(c => {
            if (c.parent_id && mapa[c.parent_id]) mapa[c.parent_id].subcategorias.push(mapa[c.id]);
            else raiz.push(mapa[c.id]); // sub arquivada cujo pai segue ativo aparece como item proprio
        });
        const termo = String(busca || '').trim().toLowerCase();
        if (!termo) return raiz;
        return raiz.filter(c => c.nome.toLowerCase().includes(termo) || c.subcategorias.some(sc => sc.nome.toLowerCase().includes(termo)));
    }

    static async buscarPorId(id, userId) {
        const [rows] = await db.query('SELECT * FROM categorias WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
        return rows[0] || null;
    }

    static async garantirCategoriasSistema(userId) {
        const categoriasSistema = [
            { nome: 'Ajuste de Saldo', chave_sistema: 'ajuste_saldo', tipo: 'ambas', cor: '#64748b' },
            { nome: 'Transferência Bancária', chave_sistema: 'transferencia', tipo: 'ambas', cor: '#3b82f6' }
        ];

        for (const cat of categoriasSistema) {
            const [existing] = await db.query(
                'SELECT id FROM categorias WHERE user_id = ? AND (chave_sistema = ? OR nome = ?) LIMIT 1',
                [userId, cat.chave_sistema, cat.nome]
            );
            if (!existing || existing.length === 0) {
                await db.query(
                    `INSERT INTO categorias (user_id, parent_id, nome, cor, tipo, sistema, chave_sistema, status, created_at, updated_at) 
                     VALUES (?, NULL, ?, ?, ?, 1, ?, 'ativa', NOW(), NOW())`,
                    [userId, cat.nome, cat.cor, cat.tipo, cat.chave_sistema]
                );
            }
        }
    }

    static async criar(userId, { parent_id, categoria_pai_id, nome, cor, tipo, limite_gasto }) {
        parent_id = parent_id || categoria_pai_id || null;
        if (parent_id) {
            const pai = await this.buscarPorId(parent_id, userId);
            if (!pai || pai.parent_id) parent_id = null; // pai invalido/de outro usuario ou ja e sub (so 1 nivel)
            else if (!tipo || tipo === 'ambas') tipo = pai.tipo;
        }
        const [res] = await db.query(
            `INSERT INTO categorias (user_id, parent_id, nome, cor, tipo, limite_gasto, sistema, status, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, 0, 'ativa', NOW(), NOW())`,
            [userId, parent_id || null, nome, cor || '#3b82f6', tipo || 'despesa', limite_gasto ? parseFloat(limite_gasto) : null]
        );
        return res.insertId;
    }

    static async atualizar(id, userId, { nome, cor, tipo, limite_gasto }) {
        if (tipo !== undefined && tipo !== null) {
            await db.query(
                `UPDATE categorias SET nome = ?, cor = ?, tipo = ?, limite_gasto = ?, updated_at = NOW() 
                 WHERE id = ? AND user_id = ? AND sistema = 0`,
                [nome, cor, tipo, limite_gasto ? parseFloat(limite_gasto) : null, id, userId]
            );
        } else {
            await db.query(
                `UPDATE categorias SET nome = ?, cor = ?, limite_gasto = ?, updated_at = NOW() 
                 WHERE id = ? AND user_id = ? AND sistema = 0`,
                [nome, cor, limite_gasto ? parseFloat(limite_gasto) : null, id, userId]
            );
        }
    }

    static async arquivar(id, userId) {
        await db.query("UPDATE categorias SET status = 'arquivada', updated_at = NOW() WHERE (id = ? OR parent_id = ?) AND user_id = ? AND sistema = 0", [id, id, userId]);
    }

    static async restaurar(id, userId) {
        await db.query("UPDATE categorias SET status = 'ativa', updated_at = NOW() WHERE (id = ? OR parent_id = ?) AND user_id = ? AND sistema = 0", [id, id, userId]);
    }
}

module.exports = Categoria;
