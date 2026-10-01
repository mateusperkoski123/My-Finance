const rateLimit = require('express-rate-limit');

// O Chat IA vem desligado para todos; o admin liga por usuario (users.ia_habilitada). Admin sempre tem acesso.
function exigirIa(req, res, next) {
    const permitido = Boolean(req.ehAdmin || (req.user && req.user.ia_habilitada));
    if (permitido) return next();
    const acceptJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.method !== 'GET';
    if (acceptJson) return res.status(403).json({ sucesso: false, erro: req.t('ia.erro_indisponivel') });
    return res.status(403).render('ia/indisponivel', { title: req.t('ia.titulo') });
}

// Anti-abuso por usuario: 30 mensagens a cada 10 minutos (alem do limite mensal controlado no controller).
const limiteMensagens = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,
    keyGenerator: (req) => (req.user && req.user.id ? 'u' + req.user.id : req.ip),
    handler: (req, res) => res.status(429).json({ sucesso: false, erro: req.t('ia.erro_limite_rapido') }),
    standardHeaders: true,
    legacyHeaders: false,
    validate: false
});

module.exports = { exigirIa, limiteMensagens };
