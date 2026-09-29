const db = require('../config/db');

class User {
    static async findById(id) {
        const [rows] = await db.query('SELECT * FROM users WHERE id = ? LIMIT 1', [id]);
        return rows[0] || null;
    }

    static async findByEmail(email) {
        const [rows] = await db.query('SELECT * FROM users WHERE email = ? LIMIT 1', [email]);
        return rows[0] || null;
    }

    static async create({ nome, email, senha_hash, idioma = 'pt-BR', moeda = 'PYG', tema = 'claro' }) {
        const [result] = await db.query(
            'INSERT INTO users (nome, email, senha_hash, idioma, moeda, tema, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, NOW(), NOW())',
            [nome, email, senha_hash, idioma, moeda, tema]
        );
        await require('./Categoria').criarPadrao(result.insertId);
        return { id: result.insertId };
    }

    static async updatePreferencias(id, { idioma, moeda, tema }) {
        await db.query(
            'UPDATE users SET idioma = ?, moeda = ?, tema = ?, updated_at = NOW() WHERE id = ?',
            [idioma, moeda, tema, id]
        );
    }

    static async updatePerfil(id, { nome, email }) {
        await db.query(
            'UPDATE users SET nome = ?, email = ?, updated_at = NOW() WHERE id = ?',
            [nome, email, id]
        );
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
            [token, expiresAt, id]
        );
    }

    static async findByResetToken(token) {
        const [rows] = await db.query(
            'SELECT * FROM users WHERE reset_token = ? AND reset_expires > NOW() LIMIT 1',
            [token]
        );
        return rows[0] || null;
    }

    static async findByGoogleId(googleId) {
        const [rows] = await db.query('SELECT * FROM users WHERE google_id = ? LIMIT 1', [googleId]);
        return rows[0] || null;
    }

    static async findOrCreateFromGoogle({ googleId, nome, email }) {
        // 1. Find by google_id
        let user = await this.findByGoogleId(googleId);
        if (user) return user;

        // 2. Find by email
        user = await this.findByEmail(email);
        if (user) {
            await db.query('UPDATE users SET google_id = ?, updated_at = NOW() WHERE id = ?', [googleId, user.id]);
            user.google_id = googleId;
            return user;
        }

        // 3. Create new user
        const bcrypt = require('bcryptjs');
        const randomPass = require('crypto').randomBytes(16).toString('hex');
        const hash = bcrypt.hashSync(randomPass, 10);

        const [result] = await db.query(
            'INSERT INTO users (nome, email, senha_hash, google_id, idioma, moeda, tema, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, NOW(), NOW())',
            [nome, email, hash, googleId, 'pt-BR', 'PYG', 'claro']
        );

        await require('./Categoria').criarPadrao(result.insertId);
        return this.findById(result.insertId);
    }
}

module.exports = User;
