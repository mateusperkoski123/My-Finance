const User = require('../models/User');

// Caminho local seguro para voltar depois do login (nunca um endereco externo).
function caminhoLocal(v) {
    return typeof v === 'string' && v.startsWith('/') && !v.startsWith('//') && !v.includes('\\') && v.length <= 500 ? v : null;
}

async function requireAuth(req, res, next) {
    if (!req.session || !req.session.user_id) {
        // Guarda a pagina pedida (ex.: o link de uma notificacao) para abrir logo depois de entrar.
        if (req.method === 'GET' && !req.xhr && req.accepts('html')) {
            const destino = caminhoLocal(req.originalUrl);
            if (destino && destino !== '/') req.session.voltar = destino;
        }
        req.session.flash = { tipo: 'erro', mensagem: req.t ? req.t('flash.sessao_expirada') : 'Sessão expirada.' };
        return res.redirect('/login');
    }
    // O usuario ja foi carregado no inicio da requisicao (server.js); so consulta de novo se isso falhou.
    if (req.user) return next();
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

// Inicia a sessao de um usuario que acabou de se identificar. Troca o identificador da sessao (um cookie antigo,
// de antes do login, deixa de valer) e devolve para onde o usuario queria ir.
function iniciarSessao(req, userId) {
    const idioma = req.session ? req.session.idioma : null;
    // Plano escolhido na pagina inicial (botao "Quero este plano"): ja vem marcado na tela de escolher o teste.
    const planoTeste = req.session ? req.session.plano_teste : null;
    const destino = caminhoLocal(req.session ? req.session.voltar : null) || '/';
    return new Promise((resolve, reject) => {
        req.session.regenerate((err) => {
            if (err) return reject(err);
            req.session.user_id = userId;
            if (idioma) req.session.idioma = idioma;
            if (planoTeste) req.session.plano_teste = planoTeste;
            resolve(destino);
        });
    });
}

module.exports = { requireAuth, guestOnly, iniciarSessao, caminhoLocal };
