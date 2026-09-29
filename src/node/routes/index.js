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

const { requireAuth, guestOnly } = require('../middleware/authMiddleware');

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
router.get('/esqueci-senha', guestOnly, authController.esqueciSenhaPage);
router.post('/esqueci-senha', guestOnly, authController.esqueciSenhaSubmit);
router.get('/redefinir-senha/:token', guestOnly, authController.redefinirSenhaPage);
router.post('/redefinir-senha/:token', guestOnly, authController.redefinirSenhaSubmit);
router.get('/auth/google', guestOnly, authController.googleRedirect);
router.get('/auth/google/callback', guestOnly, authController.googleCallback);
router.post('/logout', requireAuth, authController.logout);

// Dashboard routes
router.get('/', requireAuth, dashboardController.index);
router.post('/lancamentos', requireAuth, dashboardController.criarLancamento);
router.post('/lancamentos/criar', requireAuth, dashboardController.criarLancamento);
router.post('/lancamentos/:id/atualizar', requireAuth, dashboardController.atualizarLancamento);
router.post('/lancamentos/:id/excluir', requireAuth, dashboardController.excluirLancamento);
router.post('/lancamentos/:id/marcar-pago', requireAuth, dashboardController.marcarPago);

// Contas Bancarias routes
router.get('/contas', requireAuth, contasController.index);
router.post('/contas/criar', requireAuth, contasController.criar);
router.post('/contas/:id/atualizar', requireAuth, contasController.atualizar);
router.post('/contas/:id/arquivar', requireAuth, contasController.arquivar);
router.post('/contas/:id/restaurar', requireAuth, contasController.restaurar);
router.post('/contas/:id/excluir', requireAuth, contasController.excluir);
router.post('/contas/:id/definir-padrao', requireAuth, contasController.definirPadrao);
router.post('/contas/:id/ajustar', requireAuth, contasController.ajustarSaldo);
router.post('/contas/transferir', requireAuth, contasController.transferir);
router.get('/contas/:id/extrato', requireAuth, contasController.extrato);

// Categorias routes
router.get('/categorias', requireAuth, categoriasController.index);
router.post('/categorias/criar', requireAuth, categoriasController.criar);
router.post('/categorias/:id/atualizar', requireAuth, categoriasController.atualizar);
router.post('/categorias/:id/arquivar', requireAuth, categoriasController.arquivar);
router.post('/categorias/:id/restaurar', requireAuth, categoriasController.restaurar);

// Relatorios routes
router.get('/relatorios', requireAuth, relatoriosController.index);
router.get('/relatorios/exportar', requireAuth, relatoriosController.exportar);

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
router.get('/configuracoes/dados/exportar', requireAuth, configuracoesController.exportarDados);
router.post('/configuracoes/dados/importar', requireAuth, upload.single('arquivo'), configuracoesController.importarDados);

module.exports = router;
