const User = require('../models/User');

async function requireAuth(req, res, next) {
    if (!req.session || !req.session.user_id) {
        req.session.flash = { tipo: 'erro', mensagem: req.t ? req.t('flash.sessao_expirada') : 'Sessão expirada.' };
        return res.redirect('/login');
    }
    try {
        const user = await User.findById(req.session.user_id);
        if (!user) {
            req.session.destroy();
            return res.redirect('/login');
        }
        req.user = user;
        res.locals.usuarioLogado = user;
        next();
    } catch (err) {
        console.error('Auth Middleware Error:', err);
        next(err);
    }
}

function guestOnly(req, res, next) {
    if (req.session && req.session.user_id) {
        return res.redirect('/');
    }
    next();
}

module.exports = { requireAuth, guestOnly };
