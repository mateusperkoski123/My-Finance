const express = require('express');
const session = require('express-session');
const MySQLStore = require('express-mysql-session')(session);
const path = require('path');
const expressLayouts = require('express-ejs-layouts');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const routes = require('./src/node/routes');
const i18nMiddleware = require('./src/node/middleware/i18nMiddleware');
const csrfMiddleware = require('./src/node/middleware/csrfMiddleware');
const User = require('./src/node/models/User');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for Hostinger / Nginx reverse proxy
app.set('trust proxy', 1);

// Helmet security headers
app.use(
    helmet({
        contentSecurityPolicy: false,
        // 'no-referrer' (padrao do helmet) fazia o redirect pos-pagamento cair sempre na tela inicial.
        referrerPolicy: { policy: 'same-origin' },
        crossOriginEmbedderPolicy: false
    })
);

// Rate limiter for auth routes
const authLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false
});
app.use('/login', authLimiter);
app.use('/cadastro', authLimiter);

// Body parsing
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

// Static files
app.use(express.static(path.join(__dirname, 'public')));

// Em producao a chave de sessao e obrigatoria (nao ha valor padrao no codigo).
const SESSION_SECRET = process.env.SESSION_SECRET;
if (!SESSION_SECRET && process.env.NODE_ENV === 'production') {
    console.error('SESSION_SECRET nao definida: defina a variavel de ambiente antes de iniciar em producao.');
    process.exit(1);
}

// MySQL Session Store
const pool = require('./src/node/config/db');
const sessionStore = new MySQLStore({
    createDatabaseTable: true,
    clearExpired: true,
    checkExpirationInterval: 900000
}, pool);

app.use(
    session({
        name: 'gf_session_node',
        secret: SESSION_SECRET || 'chave-apenas-para-desenvolvimento',
        store: sessionStore,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
            httpOnly: true,
            secure: 'auto',
            sameSite: 'lax'
        }
    })
);

// EJS setup & Layouts
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'ejs');
app.use(expressLayouts);
app.set('layout', 'layout');

// Global route context
app.use((req, res, next) => {
    res.locals.currentRoute = req.path;
    res.locals.currentUrl = req.originalUrl;
    res.locals.googleAtivo = !!(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
    res.locals.usuarioLogado = null;
    next();
});

// Load logged user (if session exists)
app.use(async (req, res, next) => {
    if (req.session && req.session.user_id) {
        try {
            const user = await User.findById(req.session.user_id);
            if (user) {
                req.user = user;
                res.locals.usuarioLogado = user;
            }
        } catch (err) {
            console.error('Session user fetch error:', err);
        }
    }
    next();
});

// i18n & CSRF middlewares
app.use(i18nMiddleware);
app.use(csrfMiddleware);

// Regras de conta: suspensao, aceite de termos e modo somente leitura (assinatura vencida)
const { contaMiddleware } = require('./src/node/middleware/contaMiddleware');
app.use((req, res, next) => contaMiddleware(req, res, next).catch(next));

// Helpers in views
const { moeda, formatDate, truncarTexto, descricaoLancamento } = require('./src/node/core/helpers');
app.use((req, res, next) => {
    res.locals.moeda = (val) => moeda(val, res.locals.currency);
    res.locals.formatDate = formatDate;
    res.locals.truncarTexto = truncarTexto;
    res.locals.descricaoLancamento = (l) => descricaoLancamento(l, res.locals.t);
    next();
});

// Saldo por conta exibido na aba de Lancamentos Pendentes (atualiza a cada carregamento)
const Conta = require('./src/node/models/Conta');
app.use(async (req, res, next) => {
    res.locals.contasSaldos = null;
    if (req.method === 'GET' && req.user && (req.path === '/relatorios' && req.query.aba === 'pendentes')) {
        try {
            res.locals.contasSaldos = await Conta.buscarPorUsuario(req.user.id, false);
        } catch (err) {
            console.error('Erro ao carregar saldos por conta:', err);
        }
    }
    next();
});

// Register routes
app.use('/', routes);

// 404 handler
app.use((req, res) => {
    res.status(404).render('404', { title: res.locals.t ? res.locals.t('erro404.titulo') : 'Página não encontrada' });
});

// Production Error handler (500)
app.use((err, req, res, next) => {
    console.error('Unhandled Application Error:', err);
    res.status(500).render('500', { title: res.locals.t ? res.locals.t('erro500.titulo') : 'Erro no Servidor' });
});

// Inicializacao: aplica migrations pendentes (tolerante e com trava), promove admins por
// ADMIN_EMAILS, repara sinais e so entao aceita requisicoes.
const { migrar, promoverAdmins } = require('./src/node/core/migrator');
(async () => {
    try {
        const aplicadas = await migrar();
        if (aplicadas.length) console.log(`Migrations aplicadas: ${aplicadas.join(', ')}`);
        const admins = await promoverAdmins();
        if (admins) console.log(`${admins} usuario(s) promovido(s) a admin via ADMIN_EMAILS.`);
    } catch (err) {
        console.error('Falha ao aplicar migrations (servidor nao iniciado):', err.message);
        process.exit(1);
    }

    // Reparo de sinais (despesa negativa / receita positiva) antes de aceitar requisicoes
    try {
        const r = await require('./src/node/models/Lancamento').normalizarSinais();
        if (r.despesas || r.receitas) console.log(`Sinais corrigidos: ${r.despesas} despesa(s), ${r.receitas} receita(s).`);
    } catch (err) {
        console.error('Falha ao normalizar sinais:', err.message);
    }

    app.listen(PORT, () => {
        console.log(`====================================================`);
        console.log(`🚀 Servidor Node.js rodando na porta http://localhost:${PORT}`);
        console.log(`====================================================`);
    });
})();

module.exports = app;
