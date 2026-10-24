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

    // Categoria ativa com o mesmo nome no mesmo nivel (raiz ou sob o mesmo pai), sem diferenciar maiusculas nem acentos
    // (collation do banco). Subcategorias com o mesmo nome em pais diferentes continuam permitidas.
    static async buscarPorNome(userId, nome, parentId, ignorarId = null) {
        const [rows] = await db.query(
            "SELECT * FROM categorias WHERE user_id = ? AND status = 'ativa' AND TRIM(nome) = TRIM(?) AND parent_id <=> ? AND id <> ? LIMIT 1",
            [userId, nome, parentId || null, ignorarId || 0]
        );
        return rows[0] || null;
    }

    // Visao de uma categoria (ou subcategoria): lancamentos do mes escolhido e totais mensais ao redor dele.
    // Categoria pai inclui as subcategorias. So receitas e despesas de contas ativas, numa moeda por vez.
    // `inicio`/`fim` = limites do historico (YYYY-MM-DD); `mesInicio`/`mesFim` = o mes escolhido.
    static async detalhe(userId, id, { inicio, fim, mesInicio, mesFim, moeda = '' }) {
        const cat = await this.buscarPorId(id, userId);
        if (!cat) return null;
        const pai = cat.parent_id ? await this.buscarPorId(cat.parent_id, userId) : null;
        const [subs] = cat.parent_id ? [[]] : await db.query('SELECT id, nome FROM categorias WHERE parent_id = ? AND user_id = ? ORDER BY nome', [cat.id, userId]);
        const ids = [cat.id, ...subs.map((s) => s.id)];

        const base = `FROM lancamentos l
             LEFT JOIN categorias c ON c.id = l.categoria_id
             JOIN contas cb ON cb.id = l.conta_id AND cb.status = 'ativa'
             WHERE l.user_id = ? AND l.categoria_id IN (?) AND l.tipo IN ('receita', 'despesa')`;
        const [moedasRows] = await db.query(`SELECT DISTINCT cb.moeda ${base} ORDER BY cb.moeda`, [userId, ids]);
        const moedas = moedasRows.map((r) => r.moeda);
        const moedaUsada = moedas.includes(moeda) ? moeda : (moedas[0] || '');

        const [totais] = await db.query(
            `SELECT DATE_FORMAT(l.data_competencia, '%Y-%m') AS ym, l.tipo, l.status, SUM(ABS(l.valor)) AS total, COUNT(*) AS n
             ${base} AND cb.moeda = ? AND l.data_competencia BETWEEN ? AND ?
             GROUP BY ym, l.tipo, l.status`,
            [userId, ids, moedaUsada, inicio, fim]
        );
        const [lancamentos] = await db.query(
            `SELECT l.id, l.descricao, l.tipo, l.status, ABS(l.valor) AS valor, DATE_FORMAT(l.data_competencia, '%Y-%m-%d') AS data,
                    DATE_FORMAT(l.data_pagamento, '%Y-%m-%d') AS pago_em, cb.nome AS conta_nome,
                    IF(c.id = ?, NULL, c.nome) AS sub_nome
             ${base} AND cb.moeda = ? AND l.data_competencia BETWEEN ? AND ?
             ORDER BY l.data_competencia ASC, l.id ASC`,
            [cat.id, userId, ids, moedaUsada, mesInicio, mesFim]
        );
        return { categoria: cat, pai, subs, moedas, moeda: moedaUsada, totais, lancamentos };
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
        if (await this.buscarPorNome(userId, nome, parent_id)) {
            throw Object.assign(new Error('categoria_duplicada'), { codigo: 'categoria_duplicada' });
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
