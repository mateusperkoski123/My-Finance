// Comunidade > Novidades: avisos escritos pela equipe (novos modulos, novidades e melhorias).
// Cada novidade tem titulo e texto em pt/es/en; o usuario sempre recebe o idioma da sua conta.
const db = require('../config/db');

const TIPOS = ['modulo', 'novidade', 'melhoria'];
const TTL_MS = 60 * 1000;
let cacheDatas = null; // datas de publicacao (ms), para o selinho do menu sem consultar o banco a cada pagina

const sufixo = (lang) => { const l = String(lang || '').toLowerCase(); return l.startsWith('es') ? 'es' : l.startsWith('en') ? 'en' : 'pt'; };

class Novidade {
    static TIPOS = TIPOS;

    // Troca as colunas titulo_xx/texto_xx pelo idioma do usuario (cai no portugues se o idioma estiver vazio).
    static localizar(row, lang) {
        const s = sufixo(lang);
        return { ...row, titulo: row['titulo_' + s] || row.titulo_pt, texto: row['texto_' + s] || row.texto_pt };
    }

    static invalidar() { cacheDatas = null; }

    static async datasPublicadas() {
        if (cacheDatas && Date.now() - cacheDatas.em < TTL_MS) return cacheDatas.lista;
        const [rows] = await db.query("SELECT publicada_em FROM comunidade_novidades WHERE estado = 'publicada' AND publicada_em IS NOT NULL ORDER BY publicada_em DESC LIMIT 50");
        const lista = rows.map((r) => new Date(r.publicada_em).getTime());
        cacheDatas = { em: Date.now(), lista };
        return lista;
    }

    // Quantas novidades publicadas depois da ultima visita (quem nunca abriu conta a partir do cadastro).
    static async contarNovas(user) {
        const desde = new Date(user.novidades_vistas_em || user.created_at || 0).getTime();
        return (await this.datasPublicadas()).filter((d) => d > desde).length;
    }

    static async marcarVistas(userId) {
        await db.query('UPDATE users SET novidades_vistas_em = NOW() WHERE id = ?', [userId]);
    }

    static async listarPublicadas(userId, lang, limite = 50) {
        const [rows] = await db.query(
            `SELECT n.*, p.titulo AS post_titulo, p.oculto AS post_oculto,
                    (SELECT COUNT(*) FROM comunidade_novidades_reacoes r WHERE r.novidade_id = n.id AND r.valor = 1) AS gostei,
                    (SELECT COUNT(*) FROM comunidade_novidades_reacoes r WHERE r.novidade_id = n.id AND r.valor = -1) AS nao_gostei,
                    (SELECT r.valor FROM comunidade_novidades_reacoes r WHERE r.novidade_id = n.id AND r.user_id = ?) AS minha
             FROM comunidade_novidades n LEFT JOIN comunidade_posts p ON p.id = n.post_id
             WHERE n.estado = 'publicada' ORDER BY n.publicada_em DESC, n.id DESC LIMIT ?`, [userId, limite]);
        return rows.map((r) => ({
            ...this.localizar(r, lang), gostei: Number(r.gostei), nao_gostei: Number(r.nao_gostei), minha: r.minha === null ? 0 : Number(r.minha),
            post_titulo: r.post_oculto ? null : r.post_titulo
        }));
    }

    // Gostei / nao gostei. Tocar de novo na mesma reacao a remove; tocar na outra troca.
    static async reagir(novidadeId, userId, valor) {
        const [[nov]] = await db.query("SELECT id FROM comunidade_novidades WHERE id = ? AND estado = 'publicada'", [novidadeId]);
        if (!nov || (valor !== 1 && valor !== -1)) return null;
        const [[atual]] = await db.query('SELECT valor FROM comunidade_novidades_reacoes WHERE novidade_id = ? AND user_id = ?', [novidadeId, userId]);
        let minha = valor;
        if (atual && Number(atual.valor) === valor) {
            await db.query('DELETE FROM comunidade_novidades_reacoes WHERE novidade_id = ? AND user_id = ?', [novidadeId, userId]);
            minha = 0;
        } else {
            await db.query('INSERT INTO comunidade_novidades_reacoes (novidade_id, user_id, valor) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE valor = VALUES(valor)', [novidadeId, userId, valor]);
        }
        const [[c]] = await db.query(
            'SELECT SUM(valor = 1) AS gostei, SUM(valor = -1) AS nao_gostei FROM comunidade_novidades_reacoes WHERE novidade_id = ?', [novidadeId]);
        return { minha, gostei: Number(c.gostei) || 0, nao_gostei: Number(c.nao_gostei) || 0 };
    }

    // ---- Admin ----
    static async listarAdmin() {
        const [rows] = await db.query(
            `SELECT n.*,
                    (SELECT COUNT(*) FROM comunidade_novidades_reacoes r WHERE r.novidade_id = n.id AND r.valor = 1) AS gostei,
                    (SELECT COUNT(*) FROM comunidade_novidades_reacoes r WHERE r.novidade_id = n.id AND r.valor = -1) AS nao_gostei
             FROM comunidade_novidades n
             ORDER BY (n.estado = 'rascunho') DESC, n.publicada_em DESC, n.id DESC`);
        return rows.map((r) => ({ ...r, gostei: Number(r.gostei), nao_gostei: Number(r.nao_gostei) }));
    }

    static async buscar(id) {
        const [rows] = await db.query('SELECT * FROM comunidade_novidades WHERE id = ?', [id]);
        return rows[0] || null;
    }

    // Tres idiomas completos sao exigidos para publicar (assim ninguem le um aviso em outro idioma).
    static idiomasFaltando(n) {
        return ['pt', 'es', 'en'].filter((i) => !String(n['titulo_' + i] || '').trim() || !String(n['texto_' + i] || '').trim());
    }

    static async salvar(id, d) {
        const campos = [d.tipo, d.titulo_pt, d.titulo_es, d.titulo_en, d.texto_pt, d.texto_es, d.texto_en, d.post_id || null];
        if (id) {
            await db.query('UPDATE comunidade_novidades SET tipo = ?, titulo_pt = ?, titulo_es = ?, titulo_en = ?, texto_pt = ?, texto_es = ?, texto_en = ?, post_id = ? WHERE id = ?', [...campos, id]);
            return id;
        }
        const [r] = await db.query('INSERT INTO comunidade_novidades (tipo, titulo_pt, titulo_es, titulo_en, texto_pt, texto_es, texto_en, post_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', campos);
        return r.insertId;
    }

    static async publicar(id) {
        await db.query("UPDATE comunidade_novidades SET estado = 'publicada', publicada_em = COALESCE(publicada_em, NOW()) WHERE id = ?", [id]);
        this.invalidar();
    }

    static async despublicar(id) {
        await db.query("UPDATE comunidade_novidades SET estado = 'rascunho' WHERE id = ?", [id]);
        this.invalidar();
    }

    static async excluir(id) {
        await db.query('DELETE FROM comunidade_novidades WHERE id = ?', [id]);
        this.invalidar();
    }
}

module.exports = Novidade;
