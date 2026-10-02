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

    static async garantirCategoriasSistema(userId, idioma) {
        const { para, nomesDeSistema } = require('../core/categorias_padrao');
        const p = para(idioma || await this.idiomaDoUsuario(userId));
        const categoriasSistema = [
            { chave_sistema: 'ajuste_saldo', cor: '#64748b' },
            { chave_sistema: 'transferencia', cor: '#3b82f6' }
        ];

        for (const cat of categoriasSistema) {
            const [existing] = await db.query(
                'SELECT id FROM categorias WHERE user_id = ? AND (chave_sistema = ? OR nome IN (?)) LIMIT 1',
                [userId, cat.chave_sistema, nomesDeSistema(cat.chave_sistema)]
            );
            if (!existing || existing.length === 0) {
                await db.query(
                    `INSERT INTO categorias (user_id, parent_id, nome, cor, tipo, sistema, chave_sistema, status, created_at, updated_at)
                     VALUES (?, NULL, ?, ?, 'ambas', 1, ?, 'ativa', NOW(), NOW())`,
                    [userId, p.sistema[cat.chave_sistema], cat.cor, cat.chave_sistema]
                );
            }
        }
    }

    // Id da categoria de sistema ('ajuste_saldo' | 'transferencia'), criando-a no idioma do usuario se faltar.
    static async idSistema(userId, chave) {
        const { nomesDeSistema } = require('../core/categorias_padrao');
        await this.garantirCategoriasSistema(userId);
        const [r] = await db.query(
            'SELECT id FROM categorias WHERE user_id = ? AND (chave_sistema = ? OR nome IN (?)) ORDER BY (chave_sistema IS NULL) ASC LIMIT 1',
            [userId, chave, nomesDeSistema(chave)]
        );
        return r[0] ? r[0].id : null;
    }

    static async idiomaDoUsuario(userId) {
        const [u] = await db.query('SELECT idioma FROM users WHERE id = ? LIMIT 1', [userId]);
        return u[0] ? u[0].idioma : null;
    }

    // Categorias iniciais para quem acabou de se cadastrar, ja no idioma escolhido (evita tela vazia e formulario travado).
    static async criarPadrao(userId, idioma) {
        const { para } = require('../core/categorias_padrao');
        const [ex] = await db.query('SELECT COUNT(*) AS n FROM categorias WHERE user_id = ? AND sistema = 0', [userId]);
        if (ex[0].n === 0) {
            const p = para(idioma);
            for (const [nome, cor] of [...p.despesas, ...p.receitas]) {
                await db.query(
                    `INSERT INTO categorias (user_id, parent_id, nome, cor, tipo, sistema, status, created_at, updated_at)
                     VALUES (?, NULL, ?, ?, 'ambas', 0, 'ativa', NOW(), NOW())`,
                    [userId, nome, cor]
                );
            }
        }
        await this.garantirCategoriasSistema(userId, idioma);
    }

    // Garante que existam categorias ativas (nao-sistema) utilizaveis para despesa E para receita (idioma do usuario).
    // Cobre contas antigas que so tinham as categorias de sistema.
    static async garantirCategoriasBasicas(userId, idioma) {
        const { para } = require('../core/categorias_padrao');
        const p = para(idioma || await this.idiomaDoUsuario(userId));
        const conjuntos = { despesa: p.despesas, receita: p.receitas };
        for (const tipo of ['despesa', 'receita']) {
            const [r] = await db.query(
                "SELECT COUNT(*) AS n FROM categorias WHERE user_id = ? AND sistema = 0 AND status = 'ativa' AND parent_id IS NULL AND tipo IN (?, 'ambas')",
                [userId, tipo]
            );
            if (r[0].n > 0) continue;
            for (const [nome, cor] of conjuntos[tipo]) {
                const [ex] = await db.query('SELECT id, status, tipo FROM categorias WHERE user_id = ? AND nome = ? AND parent_id IS NULL AND sistema = 0 LIMIT 1', [userId, nome]);
                if (ex.length) {
                    // mesma categoria ja existe (arquivada): reativa em vez de duplicar
                    await db.query("UPDATE categorias SET status = 'ativa', tipo = 'ambas', updated_at = NOW(3) WHERE id = ?", [ex[0].id]);
                } else {
                    await db.query(
                        `INSERT INTO categorias (user_id, parent_id, nome, cor, tipo, sistema, status, created_at, updated_at)
                         VALUES (?, NULL, ?, ?, 'ambas', 0, 'ativa', NOW(), NOW())`,
                        [userId, nome, cor]
                    );
                }
            }
        }
    }

    static async criar(userId, { parent_id, categoria_pai_id, nome, cor, limite_gasto, client_id = null }) {
        // Cor padrao do formulario (azul) vira uma cor distinta da paleta, para os graficos nao ficarem todos iguais.
        if (!cor || String(cor).toLowerCase() === '#3b82f6') {
            const paleta = ['#F97316', '#EF4444', '#10B981', '#8B5CF6', '#06B6D4', '#EC4899', '#F59E0B', '#6366F1', '#64748B', '#16A34A'];
            const [n] = await db.query('SELECT COUNT(*) AS n FROM categorias WHERE user_id = ? AND parent_id IS NULL', [userId]);
            cor = paleta[n[0].n % paleta.length];
        }
        parent_id = parent_id || categoria_pai_id || null;
        if (parent_id) {
            const pai = await this.buscarPorId(parent_id, userId);
            if (!pai || pai.parent_id) parent_id = null; // pai invalido/de outro usuario ou ja e sub (so 1 nivel)
        }
        const [res] = await db.query(
            `INSERT INTO categorias (user_id, parent_id, nome, cor, tipo, limite_gasto, sistema, status, client_id, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, 0, 'ativa', ?, NOW(3), NOW(3))`,
            [userId, parent_id || null, nome, cor || '#3b82f6', 'ambas', limite_gasto ? parseFloat(limite_gasto) : null, client_id]
        );
        return res.insertId;
    }

    static async atualizar(id, userId, { nome, cor, limite_gasto }) {
        await db.query(
            `UPDATE categorias SET nome = ?, cor = ?, limite_gasto = ?, updated_at = NOW(3)
             WHERE id = ? AND user_id = ? AND sistema = 0`,
            [nome, cor, limite_gasto ? parseFloat(limite_gasto) : null, id, userId]
        );
    }

    static async arquivar(id, userId) {
        await db.query("UPDATE categorias SET status = 'arquivada', updated_at = NOW(3) WHERE (id = ? OR parent_id = ?) AND user_id = ? AND sistema = 0", [id, id, userId]);
    }

    static async restaurar(id, userId) {
        await db.query("UPDATE categorias SET status = 'ativa', updated_at = NOW(3) WHERE (id = ? OR parent_id = ?) AND user_id = ? AND sistema = 0", [id, id, userId]);
    }
}

module.exports = Categoria;
