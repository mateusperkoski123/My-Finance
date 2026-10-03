const rateLimit = require('express-rate-limit');

// O Chat IA vem do plano (planos.rec_ia): quem tem plano com IA ja entra com o chat liberado. O admin ainda pode
// desligar um usuario especifico (users.ia_habilitada = 0). Admin sempre tem acesso.
function exigirIa(req, res, next) {
    const planoTemIa = Boolean(req.assinatura && req.assinatura.plano && req.assinatura.plano.rec_ia);
    const permitido = Boolean(req.ehAdmin || (req.user && req.user.ia_habilitada && planoTemIa));
    if (permitido) return next();
    const acceptJson = req.xhr || (req.headers.accept && req.headers.accept.includes('application/json')) || req.method !== 'GET';
    if (acceptJson) return res.status(403).json({ sucesso: false, erro: req.t(planoTemIa ? 'ia.erro_indisponivel' : 'ia.erro_plano') });
    // Plano sem IA: apresenta o recurso e o plano que o inclui (nao e um erro).
    if (!planoTemIa) return res.render('ia/indisponivel', { title: req.t('ia.titulo'), semPlano: true });
    return res.status(403).render('ia/indisponivel', { title: req.t('ia.titulo'), semPlano: false });
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
