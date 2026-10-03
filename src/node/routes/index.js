const express = require('express');
const router = express.Router();

// Express 4 nao captura rejeicoes de handlers async: sem isso a requisicao ficaria pendurada.
['get', 'post'].forEach((metodo) => {
    const original = router[metodo].bind(router);
    router[metodo] = (caminho, ...handlers) => original(caminho, ...handlers.map((h) =>
        (typeof h === 'function' && h.length < 4)
            ? (req, res, next) => Promise.resolve(h(req, res, next)).catch(next)
            : h
    ));
});
const path = require('path');

const authController = require('../controllers/authController');
const dashboardController = require('../controllers/dashboardController');
const contasController = require('../controllers/contasController');
const relatoriosController = require('../controllers/relatoriosController');
const categoriasController = require('../controllers/categoriasController');
const configuracoesController = require('../controllers/configuracoesController');
const assinaturaController = require('../controllers/assinaturaController');
const legalController = require('../controllers/legalController');
const contaController = require('../controllers/contaController');
const adminController = require('../controllers/adminController');
const apiAppController = require('../controllers/apiAppController');
const { exigirToken } = require('../middleware/apiAuthMiddleware');
const rateLimit = require('express-rate-limit');

const apiSyncLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false
});

const apiLoginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false
});

const cronLimiter = rateLimit({
    windowMs: 10 * 60 * 1000,
    max: 30,
    standardHeaders: true,
    legacyHeaders: false
});

const { requireAuth, guestOnly } = require('../middleware/authMiddleware');
const { exigirRecurso, exigirAdmin, limiteContas } = require('../middleware/contaMiddleware');

const multer = require('multer');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024, files: 1 } });

// Public downloadable simulation JSON file route
router.get('/simulacao_comercial_2026.json', (req, res) => {
    res.sendFile(path.join(__dirname, '../../../public/simulacao_comercial_2026.json'));
});

// Auth routes
router.get('/login', guestOnly, authController.loginPage);
router.post('/login', guestOnly, authController.loginSubmit);
router.get('/cadastro', guestOnly, authController.registerPage);
router.post('/cadastro', guestOnly, authController.registerSubmit);
// Seletor de idioma das telas publicas (login, cadastro, recuperar senha). Logado: o idioma muda em Configuracoes.
router.get('/idioma/:codigo', (req, res) => {
    const codigo = require('../core/idiomas').normalizarIdioma(req.params.codigo);
    if (codigo && !req.user) req.session.idioma = codigo;
    const v = String(req.query.voltar || '');
    res.redirect(/^\/[A-Za-z0-9_\-\/]*$/.test(v) && !v.startsWith('//') ? v : '/login');
});
router.get('/esqueci-senha', guestOnly, authController.esqueciSenhaPage);
router.post('/esqueci-senha', guestOnly, authController.esqueciSenhaSubmit);
router.get('/redefinir-senha/:token', guestOnly, authController.redefinirSenhaPage);
router.post('/redefinir-senha/:token', guestOnly, authController.redefinirSenhaSubmit);
router.get('/auth/google', guestOnly, authController.googleRedirect);
router.get('/auth/google/callback', guestOnly, authController.googleCallback);
router.post('/logout', requireAuth, authController.logout);

// Paginas legais (publicas), aceite de termos e verificacao de e-mail
router.get('/termos', legalController.termos);
router.get('/privacidade', legalController.privacidade);
router.get('/offline', (req, res) => {
    res.render('offline', { title: req.t('offline.titulo') });
});
router.get('/aceitar-termos', requireAuth, legalController.aceitarPage);
router.post('/aceitar-termos', requireAuth, legalController.aceitarSubmit);
router.get('/verificar-email/:token', contaController.verificarEmail);
router.post('/verificar-email/reenviar', requireAuth, contaController.reenviarVerificacao);

// Assinatura
router.get('/assinatura', requireAuth, assinaturaController.index);
router.post('/assinatura/solicitar', requireAuth, assinaturaController.solicitar);

// Administracao (somente role=admin)
router.get('/admin', requireAuth, exigirAdmin, adminController.painel);
router.get('/admin/usuarios', requireAuth, exigirAdmin, adminController.index);
router.get('/admin/ia', requireAuth, exigirAdmin, adminController.iaConsumo);
router.post('/admin/ia/creditos', requireAuth, exigirAdmin, adminController.adicionarCredito);
router.post('/admin/ia/creditos/:id/excluir', requireAuth, exigirAdmin, adminController.excluirCredito);
router.post('/admin/usuarios/massa', requireAuth, exigirAdmin, adminController.acaoEmMassa);
router.post('/admin/usuarios/:id/pagamento', requireAuth, exigirAdmin, adminController.registrarPagamento);
router.post('/admin/usuarios/:id/trial', requireAuth, exigirAdmin, adminController.estenderTrial);
router.post('/admin/usuarios/:id/cancelar', requireAuth, exigirAdmin, adminController.cancelar);
router.post('/admin/usuarios/:id/status', requireAuth, exigirAdmin, adminController.alterarStatus);
router.post('/admin/usuarios/:id/ia-nivel', requireAuth, exigirAdmin, adminController.alternarIaNivel);
router.post('/admin/usuarios/:id/ia', requireAuth, exigirAdmin, adminController.alternarIa);
router.post('/admin/usuarios/:id/arquivar', requireAuth, exigirAdmin, adminController.arquivar);
router.get('/admin/arquivados', requireAuth, exigirAdmin, adminController.arquivados);
router.post('/admin/usuarios/:id/desarquivar', requireAuth, exigirAdmin, adminController.desarquivar);
router.post('/admin/usuarios/:id/excluir', requireAuth, exigirAdmin, adminController.excluirDefinitivo);

// Dashboard routes
router.get('/', requireAuth, dashboardController.index);
router.post('/lancamentos', requireAuth, dashboardController.criarLancamento);
router.post('/lancamentos/criar', requireAuth, dashboardController.criarLancamento);
router.post('/lancamentos/:id/atualizar', requireAuth, dashboardController.atualizarLancamento);
router.post('/lancamentos/:id/atualizar-transferencia', requireAuth, dashboardController.atualizarTransferencia);
router.post('/lancamentos/:id/excluir', requireAuth, dashboardController.excluirLancamento);
router.post('/lancamentos/:id/marcar-pago', requireAuth, dashboardController.marcarPago);

// Contas Bancarias routes
router.get('/contas', requireAuth, contasController.index);
router.post('/contas/criar', requireAuth, limiteContas, contasController.criar);
router.post('/contas/:id/atualizar', requireAuth, contasController.atualizar);
router.post('/contas/:id/arquivar', requireAuth, contasController.arquivar);
router.post('/contas/:id/restaurar', requireAuth, limiteContas, contasController.restaurar);
router.post('/contas/:id/excluir', requireAuth, contasController.excluir);
router.post('/contas/:id/definir-padrao', requireAuth, contasController.definirPadrao);
router.post('/contas/:id/ajustar', requireAuth, contasController.ajustarSaldo);
router.post('/contas/transferir', requireAuth, contasController.transferir);
router.post('/contas/agendar-transferencia', requireAuth, contasController.agendarTransferencia);
router.get('/contas/:id/extrato', requireAuth, contasController.extrato);

// Categorias routes
router.get('/categorias', requireAuth, categoriasController.index);
router.post('/categorias/criar', requireAuth, categoriasController.criar);
router.post('/categorias/rapida', requireAuth, categoriasController.criarRapida);
router.post('/categorias/:id/atualizar', requireAuth, categoriasController.atualizar);
router.post('/categorias/:id/arquivar', requireAuth, categoriasController.arquivar);
router.post('/categorias/:id/restaurar', requireAuth, categoriasController.restaurar);

// Relatorios routes
// A aba "Demonstrativo Anual" e um recurso do Premium e do Pro (e do Plan de Prueba).
const gateAnual = (req, res, next) => (req.query.aba === 'demonstrativo_anual' ? exigirRecurso('rec_relatorio_anual')(req, res, next) : next());
router.get('/relatorios', requireAuth, gateAnual, relatoriosController.index);
router.get('/relatorios/exportar', requireAuth, exigirRecurso('rec_exportar', 'flash.recurso_pro'), relatoriosController.exportar);

// Divisao de Patrimonio route (Fase 5 - Placeholder)
router.get('/patrimonio', requireAuth, (req, res) => {
    res.render('patrimonio/index', { title: req.t('patrimonio.titulo') });
});

// Configuracoes routes
router.get('/configuracoes', requireAuth, configuracoesController.index);
router.post('/configuracoes/preferencia', requireAuth, configuracoesController.salvarPreferencia);
router.get('/configuracoes/perfil', requireAuth, configuracoesController.perfil);
router.post('/configuracoes/perfil', requireAuth, configuracoesController.salvarPerfil);
router.post('/configuracoes/perfil/senha', requireAuth, configuracoesController.salvarSenha);
router.get('/configuracoes/dados', requireAuth, configuracoesController.dados);
router.get('/configuracoes/dados/exportar', requireAuth, exigirRecurso('rec_backup', 'flash.recurso_pro'), configuracoesController.exportarDados);
router.post('/configuracoes/dados/importar', requireAuth, exigirRecurso('rec_backup', 'flash.recurso_pro'), upload.single('arquivo'), configuracoesController.importarDados);
// Foto de perfil (cada usuario so enxerga e altera a propria)
const fotoController = require('../controllers/fotoController');
const uploadFoto = (req, res, next) => {
    multer({ storage: multer.memoryStorage(), limits: { fileSize: 600 * 1024, files: 1 } }).single('foto')(req, res, (err) => {
        if (err) return res.status(err.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({ sucesso: false, erro: err.code === 'LIMIT_FILE_SIZE' ? 'foto_grande' : 'foto_invalida' });
        next();
    });
};
router.get('/perfil/foto', requireAuth, fotoController.ver);
router.post('/perfil/foto', requireAuth, uploadFoto, fotoController.salvar);
router.post('/perfil/foto/remover', requireAuth, fotoController.remover);
// Lembretes de vencimento (push). O cron externo chama /cron/lembretes a cada 30 min com o CRON_TOKEN.
const lembretesController = require('../controllers/lembretesController');
router.get('/configuracoes/lembretes', requireAuth, lembretesController.index);
router.post('/configuracoes/lembretes', requireAuth, lembretesController.salvar);
router.post('/configuracoes/lembretes/inscrever', requireAuth, lembretesController.inscrever);
router.post('/configuracoes/lembretes/desinscrever', requireAuth, lembretesController.desinscrever);
router.post('/configuracoes/lembretes/testar', requireAuth, lembretesController.testar);
router.get('/lembretes/vencimentos', requireAuth, lembretesController.vencimentos);
router.all('/cron/lembretes', cronLimiter, lembretesController.cron);
router.get('/configuracoes/dispositivos', requireAuth, configuracoesController.dispositivos);
router.post('/configuracoes/dispositivos/:id/revogar', requireAuth, configuracoesController.revogarDispositivo);

// API Mobile App & Offline Sync routes
router.post('/api/app/login', apiLoginLimiter, apiAppController.login);
// O navegador logado no site pede o token do proprio aparelho (sessao + CSRF); depois sincroniza como o app.
router.post('/app/dispositivo', apiLoginLimiter, requireAuth, apiAppController.registrarDispositivoWeb);
router.post('/api/app/logout', exigirToken, apiAppController.logout);
// Registro offline e sincronizacao sao recursos do Premium e do Pro (planos.rec_offline).
const exigirOffline = (req, res, next) => {
    if (req.user && req.user.role === 'admin') return next();
    if (req.assinatura && req.assinatura.plano && req.assinatura.plano.rec_offline) return next();
    return res.status(403).json({ sucesso: false, erro: 'plano_sem_offline' });
};
router.get('/api/app/sync', apiSyncLimiter, exigirToken, exigirOffline, apiAppController.sync);
router.post('/api/app/sync/push', apiSyncLimiter, exigirToken, exigirOffline, apiAppController.push);
const comunidadeController = require('../controllers/comunidadeController');
const iaController = require('../controllers/iaController');
const { exigirIa, limiteMensagens } = require('../middleware/iaMiddleware');
const { limiteCriarPost, limiteComentar, limiteAcaoRapida } = require('../middleware/comunidadeLimites');

const multerComunidade = multer({ storage: multer.memoryStorage(), limits: { fileSize: 2 * 1024 * 1024, files: 4 } });
const uploadComunidade = (req, res, next) => {
    multerComunidade.array('imagens', 4)(req, res, (err) => {
        if (err) {
            let msgKey = 'flash.comunidade_imagem_invalida';
            if (err.code === 'LIMIT_FILE_SIZE') {
                msgKey = 'flash.comunidade_imagem_grande';
            } else if (err.code === 'LIMIT_UNEXPECTED_FILE' || err.code === 'LIMIT_FILE_COUNT') {
                msgKey = 'flash.comunidade_limite_imagens';
            }
            const msg = req.t(msgKey);
            if (req.xhr || req.headers.accept?.includes('json')) {
                return res.status(400).json({ sucesso: false, erro: msg });
            }
            req.session.flash = { tipo: 'erro', mensagem: msg };
            return res.redirect('/comunidade');
        }
        next();
    });
};

router.get('/configuracoes/conta', requireAuth, contaController.index);
router.post('/configuracoes/conta/excluir', requireAuth, contaController.excluir);

// Rotas do Módulo Comunidade
router.get('/comunidade', requireAuth, comunidadeController.index);
router.get('/comunidade/similares', requireAuth, comunidadeController.similares);
router.get('/comunidade/anexo/:id', requireAuth, comunidadeController.servirAnexo);
router.get('/comunidade/:id', requireAuth, comunidadeController.detalhe);
router.post('/comunidade', requireAuth, limiteCriarPost, uploadComunidade, comunidadeController.criar);
router.post('/comunidade/:id/votar', requireAuth, limiteAcaoRapida, comunidadeController.votar);
router.post('/comunidade/:id/importancia', requireAuth, limiteAcaoRapida, comunidadeController.importancia);
router.post('/comunidade/:id/seguir', requireAuth, limiteAcaoRapida, comunidadeController.seguir);
router.post('/comunidade/:id/comentarios', requireAuth, limiteComentar, uploadComunidade, comunidadeController.comentar);
router.post('/comunidade/:id/excluir', requireAuth, comunidadeController.excluir);
router.post('/comunidade/comentarios/:id/excluir', requireAuth, comunidadeController.excluirComentario);

// Chat IA (desligado por padrao; o admin libera por usuario)
router.get('/ia', requireAuth, exigirIa, iaController.index);
router.get('/ia/conversas/:id', requireAuth, exigirIa, iaController.conversa);
const uploadIa = (req, res, next) => {
    multer({ storage: multer.memoryStorage(), limits: { fileSize: 6 * 1024 * 1024, files: 4, fields: 10 } })
        .fields([{ name: 'imagens', maxCount: 3 }, { name: 'audio', maxCount: 1 }])(req, res, (err) => {
            if (err) return res.status(400).json({ sucesso: false, erro: req.t(err.code === 'LIMIT_FILE_SIZE' ? 'ia.erro_imagem_grande' : 'ia.erro_foto_max', { n: 3 }) });
            next();
        });
};
router.post('/ia/mensagem', requireAuth, exigirIa, limiteMensagens, uploadIa, iaController.mensagem);
router.post('/ia/conversas/:id/excluir', requireAuth, exigirIa, iaController.excluirConversa);
router.post('/ia/acoes/:id/reverter', requireAuth, exigirIa, iaController.reverterAcao);

// Admin Comunidade
router.post('/admin/comunidade/:id/estado', requireAuth, exigirAdmin, comunidadeController.alterarEstado);
router.post('/admin/comunidade/:id/categoria', requireAuth, exigirAdmin, comunidadeController.alterarCategoria);
router.post('/admin/comunidade/:id/ocultar', requireAuth, exigirAdmin, comunidadeController.ocultar);
router.post('/admin/comunidade/:id/excluir', requireAuth, exigirAdmin, comunidadeController.excluirAdmin);

module.exports = router;
