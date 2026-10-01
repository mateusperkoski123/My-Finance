// REVISAR (seguranca): limitacao de taxa (anti-spam) por id de usuario com express-rate-limit
const rateLimit = require('express-rate-limit');

function extrairChaveUsuario(req) {
    if (req.user && req.user.id) {
        return 'u' + req.user.id;
    }
    return req.ip;
}

function responderRateLimit(req, res) {
    const msg = req.t ? req.t('flash.comunidade_limite_atingido') : 'Limite de envios atingido. Tente novamente mais tarde.';
    const aceitaJson = req.xhr ||
        (req.headers['accept'] && req.headers['accept'].includes('application/json')) ||
        (req.headers['content-type'] && req.headers['content-type'].includes('application/json')) ||
        req.path.includes('/votar') ||
        req.path.includes('/importancia') ||
        req.path.includes('/seguir') ||
        req.query.parcial;

    if (aceitaJson || req.method === 'POST') {
        return res.status(429).json({ sucesso: false, erro: msg, mensagem: msg });
    }
    req.session.flash = { tipo: 'erro', mensagem: msg };
    return res.status(429).redirect('/comunidade');
}

const limiteCriarPost = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 5,
    keyGenerator: extrairChaveUsuario,
    handler: responderRateLimit,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false
});

const limiteComentar = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 30,
    keyGenerator: extrairChaveUsuario,
    handler: responderRateLimit,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false
});

const limiteAcaoRapida = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hora
    max: 120,
    keyGenerator: extrairChaveUsuario,
    handler: responderRateLimit,
    standardHeaders: true,
    legacyHeaders: false,
    validate: false
});

module.exports = {
    limiteCriarPost,
    limiteComentar,
    limiteAcaoRapida
};
