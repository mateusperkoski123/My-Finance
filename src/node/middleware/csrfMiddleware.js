const crypto = require('crypto');

function csrfProtection(req, res, next) {
    if (!req.session) {
        return next();
    }

    // API do app: autenticada por token Bearer (nao por cookie), logo nao e vulneravel a CSRF.
    if (req.path.startsWith('/api/app/')) {
        return next();
    }

    // Aviso de pagamento do Pagopar: sem sessao, autenticado pelo token do corpo.
    if (req.path === '/pagopar/resposta') {
        return next();
    }

    // Cron externo dos lembretes: autenticado por CRON_TOKEN, sem sessao.
    if (req.path === '/cron/lembretes') {
        return next();
    }

    // Botoes da notificacao do Financeiro: o service worker chama sem sessao, com token assinado no corpo.
    if (req.path === '/financeiro/acao') {
        return next();
    }

    if (!req.session.csrfToken) {
        req.session.csrfToken = crypto.randomBytes(32).toString('hex');
    }

    res.locals.csrfToken = req.session.csrfToken;
    res.locals.csrfCampo = `<input type="hidden" name="_csrf" value="${req.session.csrfToken}">`;

    if (['POST', 'PUT', 'DELETE', 'PATCH'].includes(req.method)) {
        const bodyToken = req.body ? req.body._csrf : null;
        const queryToken = req.query ? req.query._csrf : null;
        const headerToken = req.headers['x-csrf-token'];
        const token = bodyToken || queryToken || headerToken;

        if (!token || token !== req.session.csrfToken) {
            req.session.flash = { tipo: 'erro', mensagem: (req.t ? req.t('flash.csrf_falhou') : 'flash.csrf_falhou') };
            return res.status(403).redirect(req.get('Referrer') || '/');
        }
    }
    next();
}

module.exports = csrfProtection;
