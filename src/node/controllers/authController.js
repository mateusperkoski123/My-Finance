const bcrypt = require('bcryptjs');
const User = require('../models/User');

const authController = {
    loginPage: (req, res) => {
        res.render('auth/login', { title: req.t('auth.titulo_entrar') });
    },

    loginSubmit: async (req, res) => {
        const { email, senha } = req.body;
        if (!email || !senha) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.cadastro_incompleto') };
            return res.redirect('/login');
        }

        const user = await User.findByEmail(email.trim());
        if (!user || !bcrypt.compareSync(senha, user.senha_hash)) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.login_invalido') };
            return res.redirect('/login');
        }

        req.session.user_id = user.id;
        res.redirect('/');
    },

    registerPage: (req, res) => {
        res.render('auth/cadastro', { title: req.t('auth.titulo_cadastro') });
    },

    registerSubmit: async (req, res) => {
        const { nome, email, senha, confirmar_senha } = req.body;
        const s = (senha || '').trim();
        const cs = (confirmar_senha || '').trim();

        if (!nome || !email || !s) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.cadastro_incompleto') };
            return res.redirect('/cadastro');
        }
        if (s !== cs) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.senhas_diferentes') };
            return res.redirect('/cadastro');
        }
        if (s.length < 6) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.senha_curta') };
            return res.redirect('/cadastro');
        }

        const existing = await User.findByEmail(email.trim());
        if (existing) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.email_em_uso') };
            return res.redirect('/cadastro');
        }

        const hash = bcrypt.hashSync(s, 10);
        const userId = await User.create({
            nome: nome.trim(),
            email: email.trim(),
            senha_hash: hash,
            idioma: 'pt-BR',
            moeda: 'PYG',
            tema: 'claro'
        });

        req.session.user_id = typeof userId === 'object' ? userId.id : userId;
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.cadastro_sucesso') };
        res.redirect('/');
    },

    logout: (req, res) => {
        req.session.destroy(() => {
            res.redirect('/login');
        });
    },

    esqueciSenhaPage: (req, res) => {
        res.render('auth/esqueci_senha', { title: 'Recuperar Senha' });
    },

    esqueciSenhaSubmit: async (req, res) => {
        const { email } = req.body;
        if (!email || !email.trim()) {
            req.session.flash = { tipo: 'erro', mensagem: 'Por favor, informe seu e-mail cadastrado.' };
            return res.redirect('/esqueci-senha');
        }

        const user = await User.findByEmail(email.trim());
        if (user) {
            const crypto = require('crypto');
            const token = crypto.randomBytes(32).toString('hex');
            const expiresAt = new Date(Date.now() + 3600000); // 1 hour from now

            await User.salvarTokenRecuperacao(user.id, token, expiresAt);

            const protocol = req.protocol || 'https';
            const host = req.get('host');
            const magicLink = `${protocol}://${host}/redefinir-senha/${token}`;

            const { sendResetPasswordEmail } = require('../core/mailer');
            await sendResetPasswordEmail(user.email, magicLink);
        }

        // Always show the same friendly message for security (prevents user enumeration)
        req.session.flash = {
            tipo: 'sucesso',
            mensagem: 'Se o e-mail informado estiver cadastrado em nosso sistema, você receberá o link de recuperação em alguns instantes.'
        };
        res.redirect('/login');
    },

    redefinirSenhaPage: async (req, res) => {
        const { token } = req.params;
        const user = await User.findByResetToken(token);

        if (!user) {
            req.session.flash = { tipo: 'erro', mensagem: 'O link de recuperação de senha é inválido ou já expirou.' };
            return res.redirect('/esqueci-senha');
        }

        res.render('auth/redefinir_senha', { title: 'Redefinir Senha', token });
    },

    redefinirSenhaSubmit: async (req, res) => {
        const { token } = req.params;
        const { nova_senha, confirmar_nova_senha } = req.body;
        const s = (nova_senha || '').trim();
        const cs = (confirmar_nova_senha || '').trim();

        const user = await User.findByResetToken(token);
        if (!user) {
            req.session.flash = { tipo: 'erro', mensagem: 'O link de recuperação de senha é inválido ou já expirou.' };
            return res.redirect('/esqueci-senha');
        }

        if (!s || s !== cs) {
            req.session.flash = { tipo: 'erro', mensagem: 'As senhas informadas não conferem.' };
            return res.redirect(`/redefinir-senha/${token}`);
        }

        if (s.length < 6) {
            req.session.flash = { tipo: 'erro', mensagem: 'A senha deve conter no mínimo 6 caracteres.' };
            return res.redirect(`/redefinir-senha/${token}`);
        }

        const hash = bcrypt.hashSync(s, 10);
        await User.redefinirSenhaComToken(user.id, hash);

        req.session.flash = { tipo: 'sucesso', mensagem: 'Sua senha foi redefinida com sucesso! Você já pode fazer login.' };
        res.redirect('/login');
    },

    googleRedirect: (req, res) => {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
            req.session.flash = {
                tipo: 'erro',
                mensagem: 'Login com Google ainda não configurado (adicione GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET nas variáveis de ambiente da Hostinger).'
            };
            return res.redirect('/login');
        }
        const protocol = req.protocol || 'https';
        const host = req.get('host');
        const redirectUri = `${protocol}://${host}/auth/google/callback`;
        const scope = encodeURIComponent('openid email profile');
        const url = `https://accounts.google.com/o/oauth2/v2/auth?client_id=${clientId}&redirect_uri=${encodeURIComponent(redirectUri)}&response_type=code&scope=${scope}`;
        res.redirect(url);
    },

    googleCallback: async (req, res) => {
        const { code, error } = req.query;
        if (error || !code) {
            req.session.flash = { tipo: 'erro', mensagem: 'Autenticação com o Google cancelada ou indisponível.' };
            return res.redirect('/login');
        }

        try {
            const clientId = process.env.GOOGLE_CLIENT_ID;
            const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
            const protocol = req.protocol || 'https';
            const host = req.get('host');
            const redirectUri = `${protocol}://${host}/auth/google/callback`;

            const https = require('https');
            const querystring = require('querystring');

            const tokenData = querystring.stringify({
                code,
                client_id: clientId,
                client_secret: clientSecret,
                redirect_uri: redirectUri,
                grant_type: 'authorization_code'
            });

            const tokenRes = await new Promise((resolve, reject) => {
                const reqHttp = https.request('https://oauth2.googleapis.com/token', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded',
                        'Content-Length': Buffer.byteLength(tokenData)
                    }
                }, (response) => {
                    let body = '';
                    response.on('data', chunk => body += chunk);
                    response.on('end', () => resolve(JSON.parse(body)));
                });
                reqHttp.on('error', reject);
                reqHttp.write(tokenData);
                reqHttp.end();
            });

            if (!tokenRes.access_token) {
                throw new Error('Sem token de acesso do Google.');
            }

            const userinfo = await new Promise((resolve, reject) => {
                https.get('https://www.googleapis.com/oauth2/v2/userinfo', {
                    headers: { Authorization: `Bearer ${tokenRes.access_token}` }
                }, (response) => {
                    let body = '';
                    response.on('data', chunk => body += chunk);
                    response.on('end', () => resolve(JSON.parse(body)));
                }).on('error', reject);
            });

            if (!userinfo.email) {
                throw new Error('E-mail não fornecido pelo Google.');
            }

            const user = await User.findOrCreateFromGoogle({
                googleId: userinfo.id,
                nome: userinfo.name || userinfo.email.split('@')[0],
                email: userinfo.email
            });

            req.session.user_id = user.id;
            req.session.flash = { tipo: 'sucesso', mensagem: `Bem-vindo(a), ${user.nome}!` };
            res.redirect('/');
        } catch (err) {
            console.error('Google Auth Callback Error:', err);
            req.session.flash = { tipo: 'erro', mensagem: 'Erro ao conectar com a conta do Google.' };
            res.redirect('/login');
        }
    }
};

module.exports = authController;
