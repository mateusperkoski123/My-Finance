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

    // Categorias iniciais para quem acabou de se cadastrar (evita tela vazia e formulario travado).
    static async criarPadrao(userId) {
        const [ex] = await db.query('SELECT COUNT(*) AS n FROM categorias WHERE user_id = ? AND sistema = 0', [userId]);
        if (ex[0].n > 0) return;
        const padrao = [
            ['Alimentação', '#F97316', 'ambas'], ['Moradia', '#EF4444', 'ambas'], ['Transporte', '#3B82F6', 'ambas'],
            ['Saúde', '#10B981', 'ambas'], ['Lazer', '#8B5CF6', 'ambas'], ['Educação', '#06B6D4', 'ambas'],
            ['Assinaturas', '#6366F1', 'ambas'], ['Outros', '#64748B', 'ambas'],
            ['Salário', '#16A34A', 'ambas'], ['Renda extra', '#F59E0B', 'ambas']
        ];
        for (const [nome, cor, tipo] of padrao) {
            await db.query(
                `INSERT INTO categorias (user_id, parent_id, nome, cor, tipo, sistema, status, created_at, updated_at)
                 VALUES (?, NULL, ?, ?, ?, 0, 'ativa', NOW(), NOW())`,
                [userId, nome, cor, tipo]
            );
        }
    }

    // Garante que existam categorias ativas (nao-sistema) utilizaveis para despesa E para receita.
    // Cobre contas antigas que so tinham as categorias de sistema ou so um dos tipos.
    static async garantirCategoriasBasicas(userId) {
        const conjuntos = {
            despesa: [['Alimentação', '#F97316'], ['Moradia', '#EF4444'], ['Transporte', '#3B82F6'], ['Saúde', '#10B981'],
                      ['Lazer', '#8B5CF6'], ['Educação', '#06B6D4'], ['Assinaturas', '#6366F1'], ['Outros', '#64748B']],
            receita: [['Salário', '#16A34A'], ['Renda extra', '#F59E0B']]
        };
        for (const tipo of ['despesa', 'receita']) {
            const [r] = await db.query(
                "SELECT COUNT(*) AS n FROM categorias WHERE user_id = ? AND sistema = 0 AND status = 'ativa' AND parent_id IS NULL AND tipo IN (?, 'ambas')",
                [userId, tipo]
            );
            if (r[0].n > 0) continue;
            for (const [nome, cor] of conjuntos[tipo]) {
                const [ex] = await db.query('SELECT id, status, tipo FROM categorias WHERE user_id = ? AND nome = ? AND parent_id IS NULL AND sistema = 0 LIMIT 1', [userId, nome]);
                if (ex.length) {
                    // mesma categoria ja existe (arquivada ou de outro tipo): reativa / amplia em vez de duplicar
                    await db.query("UPDATE categorias SET status = 'ativa', tipo = IF(tipo = ?, tipo, 'ambas'), updated_at = NOW() WHERE id = ?", [tipo, ex[0].id]);
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

    // Categorias nao tem tipo: valem para receita e despesa (coluna fica sempre 'ambas').
    static async criar(userId, { parent_id, categoria_pai_id, nome, cor, limite_gasto }) {
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
            `INSERT INTO categorias (user_id, parent_id, nome, cor, tipo, limite_gasto, sistema, status, created_at, updated_at) 
             VALUES (?, ?, ?, ?, ?, ?, 0, 'ativa', NOW(), NOW())`,
            [userId, parent_id || null, nome, cor || '#3b82f6', 'ambas', limite_gasto ? parseFloat(limite_gasto) : null]
        );
        return res.insertId;
    }

    static async atualizar(id, userId, { nome, cor, limite_gasto }) {
        await db.query(
            `UPDATE categorias SET nome = ?, cor = ?, limite_gasto = ?, updated_at = NOW()
             WHERE id = ? AND user_id = ? AND sistema = 0`,
            [nome, cor, limite_gasto ? parseFloat(limite_gasto) : null, id, userId]
        );
    }

    static async arquivar(id, userId) {
        await db.query("UPDATE categorias SET status = 'arquivada', updated_at = NOW() WHERE (id = ? OR parent_id = ?) AND user_id = ? AND sistema = 0", [id, id, userId]);
    }

    static async restaurar(id, userId) {
        await db.query("UPDATE categorias SET status = 'ativa', updated_at = NOW() WHERE (id = ? OR parent_id = ?) AND user_id = ? AND sistema = 0", [id, id, userId]);
    }
}

module.exports = Categoria;
