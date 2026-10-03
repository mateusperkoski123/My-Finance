const { t } = require('../core/i18n');
const { IDIOMAS, detectarIdioma, normalizarIdioma } = require('../core/idiomas');

function i18nMiddleware(req, res, next) {
    // Veio da landing (myfinance.systempy.com/es/ -> /cadastro?lang=es): o visitante segue no idioma que estava lendo.
    if (!req.user && req.session && req.method === 'GET' && req.query && req.query.lang) {
        const escolhido = normalizarIdioma(req.query.lang);
        if (escolhido) req.session.idioma = escolhido;
    }
    // Visitante (sem login): idioma escolhido no seletor, ou o do navegador, ou portugues.
    const lang = req.user ? req.user.idioma : (req.session?.idioma || detectarIdioma(req) || 'pt-BR');
    const currency = req.user ? req.user.moeda : 'PYG';
    const theme = req.user ? req.user.tema : 'claro';

    req.lang = lang;
    req.t = (key, params) => t(key, params, lang);
    
    res.locals.lang = lang;
    res.locals.idiomas = IDIOMAS;
    res.locals.currency = currency;
    res.locals.theme = theme;
    res.locals.t = req.t;

    // Mensagem de retorno (flash): so e consumida quando uma pagina e de fato montada (res.render le res.locals).
    // Requisicoes de segundo plano que passam por aqui (teste de conexao, sincronizacao do app, manifest, foto)
    // nao podem "gastar" a mensagem antes de o usuario ve-la.
    let lida = false;
    let valor = null;
    Object.defineProperty(res.locals, 'flash', {
        enumerable: true,
        configurable: true,
        get() {
            if (!lida) {
                lida = true;
                if (req.method !== 'HEAD' && req.session && req.session.flash) {
                    valor = req.session.flash;
                    delete req.session.flash;
                }
            }
            return valor;
        },
        set(v) { lida = true; valor = v; }
    });

    next();
}

module.exports = i18nMiddleware;
