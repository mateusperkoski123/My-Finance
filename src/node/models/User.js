const crypto = require('crypto');
const db = require('../config/db');
const { TERMOS_VERSAO } = require('../core/negocio');

const sha256 = (v) => crypto.createHash('sha256').update(String(v)).digest('hex');

class User {
    static async findById(id) {
        const [rows] = await db.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
        return rows[0] || null;
    }

    static async findByEmail(email) {
        const [rows] = await db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
        return rows[0] || null;
    }

    // Cadastro por e-mail/senha. Registra aceite dos termos; o teste gratis comeca quando a pessoa escolhe o plano.
    // Retorna { id, tokenVerificacao } (o token vai por e-mail; no banco fica so o hash).
    static async create({ nome, email, senha_hash, idioma = 'pt-BR', moeda = 'PYG', tema = 'claro', origem = 'web' }) {
        const tokenVerificacao = crypto.randomBytes(24).toString('hex');
        const [result] = await db.query(
            `INSERT INTO users (nome, email, senha_hash, idioma, moeda, tema, origem, email_verif_token,
                                termos_aceitos_em, termos_versao, politica_aceita_em, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW(), NOW(), NOW())`,
            [nome, email, senha_hash, idioma, moeda, tema, origem, sha256(tokenVerificacao), TERMOS_VERSAO]
        );
        await require('./Categoria').criarPadrao(result.insertId, idioma);
        await require('./Assinatura').criarPendente(result.insertId);
        return { id: result.insertId, tokenVerificacao };
    }

    static async updatePreferencias(id, { idioma, moeda, tema }) {
        await db.query(
            'UPDATE users SET idioma = ?, moeda = ?, tema = ?, updated_at = NOW() WHERE id = ?',
            [idioma, moeda, tema, id]
        );
    }

    static async updatePerfil(id, { nome, email }) {
        await db.query(
            // email_verificado_em vem antes de email: o MySQL avalia os SET da esquerda para a direita.
            'UPDATE users SET nome = ?, email_verificado_em = IF(email = ?, email_verificado_em, NULL), email = ?, updated_at = NOW() WHERE id = ?',
            [nome, email, email, id]
        );
    }

    // Telefone de contato (pedido de plano). codigo = "+595", numero = so digitos.
    static async salvarTelefone(id, codigo, numero) {
        await db.query('UPDATE users SET telefone_codigo = ?, telefone_numero = ?, updated_at = NOW() WHERE id = ?', [codigo, numero, id]);
    }

    static async updateSenha(id, senha_hash) {
        await db.query(
            'UPDATE users SET senha_hash = ?, reset_token = NULL, reset_expires = NULL, updated_at = NOW() WHERE id = ?',
            [senha_hash, id]
        );
    }

    static async salvarTokenRecuperacao(id, token, expiresAt) {
        await db.query(
            'UPDATE users SET reset_token = ?, reset_expires = ?, updated_at = NOW() WHERE id = ?',
            [sha256(token), expiresAt, id]
        );
    }

    static async findByResetToken(token) {
        const [rows] = await db.query(
            'SELECT * FROM users WHERE reset_token = ? AND reset_expires > NOW() LIMIT 1',
            [sha256(token)]
        );
        return rows[0] || null;
    }

    static async findByGoogleId(googleId) {
        const [rows] = await db.query('SELECT * FROM users WHERE google_id = ? LIMIT 1', [googleId]);
        return rows[0] || null;
    }

    static async findOrCreateFromGoogle({ googleId, nome, email, idioma = 'pt-BR' }) {
        // 1. Find by google_id
        let user = await this.findByGoogleId(googleId);
        if (user) return user;

        // 2. Find by email
        user = await this.findByEmail(email);
        if (user) {
            await db.query('UPDATE users SET google_id = ?, email_verificado_em = COALESCE(email_verificado_em, NOW()), updated_at = NOW() WHERE id = ?', [googleId, user.id]);
            user.google_id = googleId;
            return user;
        }

        // 3. Create new user (o Google ja verificou o e-mail; os termos sao pedidos no primeiro acesso)
        const bcrypt = require('bcryptjs');
        const randomPass = require('crypto').randomBytes(16).toString('hex');
        const hash = bcrypt.hashSync(randomPass, 10);

        const [result] = await db.query(
            `INSERT INTO users (nome, email, senha_hash, google_id, idioma, moeda, tema, origem, email_verificado_em, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, 'google', NOW(), NOW(), NOW())`,
            [nome, email, hash, googleId, idioma, 'PYG', 'claro']
        );

        await require('./Categoria').criarPadrao(result.insertId, idioma);
        await require('./Assinatura').criarPendente(result.insertId);
        return this.findById(result.insertId);
    }

    static async registrarAcesso(userId) {
        await db.query('UPDATE users SET ultimo_acesso_em = NOW() WHERE id = ?', [userId]);
    }

    static async registrarLogin(userId, { email = null, ip = null, userAgent = null, sucesso = true } = {}) {
        await db.query(
            'INSERT INTO login_logs (user_id, email, ip, user_agent, sucesso) VALUES (?, ?, ?, ?, ?)',
            [userId || null, email ? String(email).slice(0, 190) : null, ip ? String(ip).slice(0, 45) : null,
             userAgent ? String(userAgent).slice(0, 255) : null, sucesso ? 1 : 0]
        );
        if (userId && sucesso) {
            await db.query('UPDATE users SET ultimo_login_em = NOW() WHERE id = ?', [userId]);
        }
    }

    static async aceitarTermos(id) {
        await db.query(
            'UPDATE users SET termos_aceitos_em = NOW(), termos_versao = ?, politica_aceita_em = NOW() WHERE id = ?',
            [TERMOS_VERSAO, id]
        );
    }

    // Gera novo token de verificacao de e-mail; devolve o token em texto (so o hash e salvo).
    static async gerarTokenVerificacao(id) {
        const token = crypto.randomBytes(24).toString('hex');
        await db.query('UPDATE users SET email_verif_token = ? WHERE id = ?', [sha256(token), id]);
        return token;
    }

    static async verificarEmail(token) {
        const [r] = await db.query(
            'UPDATE users SET email_verificado_em = NOW(), email_verif_token = NULL WHERE email_verif_token = ? AND email_verificado_em IS NULL',
            [sha256(token)]
        );
        return r.affectedRows > 0;
    }

    // Exclusao definitiva (LGPD): contas, categorias, lancamentos, assinatura e logs saem em cascata;
    // pagamentos ficam sem user_id para fins contabeis.
    static async excluir(id) {
        await db.query('DELETE FROM users WHERE id = ?', [id]);
    }

    static async buscarVarios(ids) {
        if (!ids.length) return [];
        const [rows] = await db.query(`SELECT id, role, status FROM users WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
        return rows;
    }

    static async atualizarStatusVarios(ids, status) {
        if (!ids.length) return;
        await db.query(`UPDATE users SET status = ? WHERE id IN (${ids.map(() => '?').join(',')})`, [status, ...ids]);
    }

    static async definirIaVarios(ids, ligar) {
        if (!ids.length) return;
        await db.query(`UPDATE users SET ia_habilitada = ? WHERE id IN (${ids.map(() => '?').join(',')})`, [ligar ? 1 : 0, ...ids]);
    }

    static async definirIaNivelVarios(ids, nivel) {
        if (!ids.length) return;
        await db.query(`UPDATE users SET ia_nivel = ? WHERE id IN (${ids.map(() => '?').join(',')})`, [nivel === 2 ? 2 : 1, ...ids]);
    }

    static async atualizarStatus(id, status) {
        await db.query('UPDATE users SET status = ? WHERE id = ?', [status, id]);
    }
}

module.exports = User;
