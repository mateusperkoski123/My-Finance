const crypto = require('crypto');
const db = require('../config/db');
const { versaoTermos } = require('../core/negocio');
const { normalizarPais, dadosPais, PAIS_PADRAO } = require('../core/paises');

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

    // Cadastro por e-mail/senha. Registra aceite dos termos (os do pais escolhido); o teste gratis comeca quando a pessoa
    // escolhe o plano. A moeda inicial vem do pais. Retorna { id, tokenVerificacao } (no banco fica so o hash do token).
    static async create({ nome, email, senha_hash, idioma = 'pt-BR', pais = PAIS_PADRAO, tema = 'claro', origem = 'web' }) {
        const p = normalizarPais(pais) || PAIS_PADRAO;
        const tokenVerificacao = crypto.randomBytes(24).toString('hex');
        const [result] = await db.query(
            `INSERT INTO users (nome, email, senha_hash, idioma, pais, moeda, tema, origem, email_verif_token,
                                termos_aceitos_em, termos_versao, politica_aceita_em, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), ?, NOW(), NOW(), NOW())`,
            [nome, email, senha_hash, idioma, p, dadosPais(p).moeda, tema, origem, sha256(tokenVerificacao), versaoTermos(p)]
        );
        await require('./Categoria').criarPadrao(result.insertId, idioma);
        await require('./Assinatura').criarPendente(result.insertId);
        return { id: result.insertId, tokenVerificacao };
    }

    static async updatePreferencias(id, { idioma, pais, moeda, tema, cor_tema }) {
        await db.query(
            'UPDATE users SET idioma = ?, pais = ?, moeda = ?, tema = ?, cor_tema = ?, updated_at = NOW() WHERE id = ?',
            [idioma, normalizarPais(pais) || PAIS_PADRAO, moeda, tema, cor_tema, id]
        );
    }

    static async updatePerfil(id, { nome, email }) {
        await db.query(
            // email_verificado_em vem antes de email: o MySQL avalia os SET da esquerda para a direita.
            'UPDATE users SET nome = ?, email_verificado_em = IF(email = ?, email_verificado_em, NULL), email = ?, updated_at = NOW() WHERE id = ?',
            [nome, email, email, id]
        );
    }

    // Codigo de desconto guardado no cadastro (ja normalizado e conferido); null apaga. soSeVazio: nao troca um que ja existe.
    static async salvarCodigoDesconto(id, codigo, soSeVazio = false) {
        await db.query(
            `UPDATE users SET codigo_desconto = ?, updated_at = NOW() WHERE id = ?${soSeVazio ? ' AND codigo_desconto IS NULL' : ''}`,
            [codigo || null, id]
        );
    }

    // Telefone de contato (pedido de plano). codigo = "+595", numero = so digitos.
    static async salvarTelefone(id, codigo, numero) {
        await db.query('UPDATE users SET telefone_codigo = ?, telefone_numero = ?, updated_at = NOW() WHERE id = ?', [codigo, numero, id]);
    }

    // Nova senha: encerra as outras sessoes e os tokens do app (quem tinha a senha antiga perde o acesso).
    // Devolve o instante gravado; a sessao atual, se houver, deve passar a ter iniciada_em = esse valor.
    static async updateSenha(id, senha_hash) {
        const agora = Date.now();
        await db.query(
            'UPDATE users SET senha_hash = ?, reset_token = NULL, reset_expires = NULL, sessoes_desde = ?, updated_at = NOW() WHERE id = ?',
            [senha_hash, agora, id]
        );
        await db.query('UPDATE dispositivos SET revogado_em = NOW() WHERE user_id = ? AND revogado_em IS NULL', [id]);
        return agora;
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

    static async findOrCreateFromGoogle({ googleId, nome, email, idioma = 'pt-BR', pais = PAIS_PADRAO }) {
        // 1. Find by google_id
        let user = await this.findByGoogleId(googleId);
        if (user) return user;

        // 2. Find by email
        user = await this.findByEmail(email);
        if (user) {
            // Conta criada com senha e e-mail nunca confirmado: qualquer pessoa pode ter cadastrado esse e-mail antes do dono.
            // Ao confirmar a posse pelo Google, a senha antiga deixa de valer (e as sessoes/tokens dela), para quem criou a
            // conta no lugar do dono nao continuar entrando nela.
            if (!user.email_verificado_em) {
                const bcrypt = require('bcryptjs');
                await this.updateSenha(user.id, await bcrypt.hash(crypto.randomBytes(16).toString('hex'), 10));
            }
            await db.query('UPDATE users SET google_id = ?, email_verificado_em = COALESCE(email_verificado_em, NOW()), updated_at = NOW() WHERE id = ?', [googleId, user.id]);
            user.google_id = googleId;
            return user;
        }

        // 3. Create new user (o Google ja verificou o e-mail; os termos sao pedidos no primeiro acesso)
        const bcrypt = require('bcryptjs');
        const randomPass = crypto.randomBytes(16).toString('hex');
        const hash = await bcrypt.hash(randomPass, 10);

        const p = normalizarPais(pais) || PAIS_PADRAO;
        const [result] = await db.query(
            `INSERT INTO users (nome, email, senha_hash, google_id, idioma, pais, moeda, tema, origem, email_verificado_em, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'google', NOW(), NOW(), NOW())`,
            [nome, email, hash, googleId, idioma, p, dadosPais(p).moeda, 'claro']
        );

        await require('./Categoria').criarPadrao(result.insertId, idioma);
        await require('./Assinatura').criarPendente(result.insertId);
        const novo = await this.findById(result.insertId);
        if (novo) novo.criadaAgora = true; // o login com Google avisa os administradores so de conta nova
        return novo;
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

    // Aceite dos Termos/Politica na versao do pais da conta.
    static async aceitarTermos(id, pais) {
        await db.query(
            'UPDATE users SET termos_aceitos_em = NOW(), termos_versao = ?, politica_aceita_em = NOW() WHERE id = ?',
            [versaoTermos(pais), id]
        );
    }

    // Registros de entrada (IP, aparelho) ficam 6 meses: o Marco Civil (art. 15) pede essa guarda e a LGPD pede apagar o que
    // nao e mais necessario. Apaga em lotes para nao travar a tabela.
    static async limparRegistrosLogin() {
        const [r] = await db.query('DELETE FROM login_logs WHERE created_at < DATE_SUB(NOW(), INTERVAL 6 MONTH) LIMIT 5000');
        return r.affectedRows;
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

    // Modulo Clientes liberado pelo admin para um usuario.
    static async definirClientesHabilitado(id, ligar) {
        await db.query('UPDATE users SET clientes_habilitado = ? WHERE id = ?', [ligar ? 1 : 0, id]);
    }

    // Modulo Compras (lista de compras) liberado pelo admin para um usuario.
    static async definirComprasHabilitado(id, ligar) {
        await db.query('UPDATE users SET compras_habilitado = ? WHERE id = ?', [ligar ? 1 : 0, id]);
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
