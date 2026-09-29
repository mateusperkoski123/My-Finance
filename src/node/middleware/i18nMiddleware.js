const { t } = require('../core/i18n');

function i18nMiddleware(req, res, next) {
    const lang = req.user ? req.user.idioma : (req.session?.idioma || 'pt-BR');
    const currency = req.user ? req.user.moeda : 'PYG';
    const theme = req.user ? req.user.tema : 'claro';

    req.lang = lang;
    req.t = (key, params) => t(key, params, lang);
    
    res.locals.lang = lang;
    res.locals.currency = currency;
    res.locals.theme = theme;
    res.locals.t = req.t;

    // Flash messages
    res.locals.flash = req.session.flash || null;
    delete req.session.flash;

    next();
}

module.exports = i18nMiddleware;
