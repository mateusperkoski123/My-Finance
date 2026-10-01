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
        const infoLog = { email: email.trim(), ip: req.ip, userAgent: req.get('User-Agent') };
        if (!user || !bcrypt.compareSync(senha, user.senha_hash)) {
            await User.registrarLogin(user ? user.id : null, { ...infoLog, sucesso: false }).catch(() => {});
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.login_invalido') };
            return res.redirect('/login');
        }
        if (user.status && user.status !== 'ativo') {
            await User.registrarLogin(user.id, { ...infoLog, sucesso: false }).catch(() => {});
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.conta_suspensa') };
            return res.redirect('/login');
        }

        await User.registrarLogin(user.id, infoLog).catch((e) => console.error('Falha ao registrar login:', e.message));
        req.session.user_id = user.id;
        res.redirect('/');
    },

    registerPage: (req, res) => {
        res.render('auth/cadastro', { title: req.t('auth.titulo_cadastro') });
    },

    registerSubmit: async (req, res) => {
        const { nome, email, senha, confirmar_senha, aceitar_termos } = req.body;
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
        if (!aceitar_termos) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.termos_obrigatorio') };
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
            idioma: req.lang || 'pt-BR',
            moeda: 'PYG',
            tema: 'claro'
        });

        // E-mail de verificacao: se o envio falhar, o cadastro continua (da para reenviar depois).
        try {
            const link = `${req.protocol || 'https'}://${req.get('host')}/verificar-email/${userId.tokenVerificacao}`;
            await require('../core/mailer').sendVerificationEmail(email.trim(), link, req.lang);
        } catch (err) {
            console.error('Falha ao enviar e-mail de verificacao:', err.message);
        }
        await User.registrarLogin(userId.id, { email: email.trim(), ip: req.ip, userAgent: req.get('User-Agent') }).catch(() => {});

        req.session.user_id = userId.id;
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.cadastro_sucesso') };
        res.redirect('/');
    },

    logout: (req, res) => {
        req.session.destroy(() => {
            res.redirect('/login');
        });
    },

    esqueciSenhaPage: (req, res) => {
        res.render('auth/esqueci_senha', { title: req.t('auth.recuperar_titulo') });
    },

    esqueciSenhaSubmit: async (req, res) => {
        const { email } = req.body;
        if (!email || !email.trim()) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.informe_email') };
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
            await sendResetPasswordEmail(user.email, magicLink, user.idioma);
        }

        // Always show the same friendly message for security (prevents user enumeration)
        req.session.flash = {
            tipo: 'sucesso',
            mensagem: req.t('flash.reset_enviado')
        };
        res.redirect('/login');
    },

    redefinirSenhaPage: async (req, res) => {
        const { token } = req.params;
        const user = await User.findByResetToken(token);

        if (!user) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.reset_invalido') };
            return res.redirect('/esqueci-senha');
        }

        res.render('auth/redefinir_senha', { title: req.t('auth.redefinir_titulo'), token });
    },

    redefinirSenhaSubmit: async (req, res) => {
        const { token } = req.params;
        const { nova_senha, confirmar_nova_senha } = req.body;
        const s = (nova_senha || '').trim();
        const cs = (confirmar_nova_senha || '').trim();

        const user = await User.findByResetToken(token);
        if (!user) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.reset_invalido') };
            return res.redirect('/esqueci-senha');
        }

        if (!s || s !== cs) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.senhas_nao_conferem') };
            return res.redirect(`/redefinir-senha/${token}`);
        }

        if (s.length < 6) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.senha_minimo6') };
            return res.redirect(`/redefinir-senha/${token}`);
        }

        const hash = bcrypt.hashSync(s, 10);
        await User.updateSenha(user.id, hash);

        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.senha_redefinida') };
        res.redirect('/login');
    },

    googleRedirect: (req, res) => {
        const clientId = process.env.GOOGLE_CLIENT_ID;
        if (!clientId) {
            req.session.flash = {
                tipo: 'erro',
                mensagem: req.t('flash.google_nao_configurado')
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
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.google_cancelado') };
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

            if (user.status && user.status !== 'ativo') {
                req.session.flash = { tipo: 'erro', mensagem: req.t('flash.conta_suspensa') };
                return res.redirect('/login');
            }
            await User.registrarLogin(user.id, { email: user.email, ip: req.ip, userAgent: req.get('User-Agent') }).catch(() => {});
            req.session.user_id = user.id;
            req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.google_bemvindo', { nome: user.nome }) };
            res.redirect('/');
        } catch (err) {
            console.error('Google Auth Callback Error:', err);
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.google_erro') };
            res.redirect('/login');
        }
    }
};

module.exports = authController;
