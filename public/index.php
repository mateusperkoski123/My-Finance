<?php

declare(strict_types=1);

require __DIR__ . '/../vendor/autoload.php';

use App\Controllers\AuthController;
use App\Controllers\CategoriasController;
use App\Controllers\ConfiguracoesController;
use App\Controllers\ContasController;
use App\Controllers\DashboardController;
use App\Controllers\PatrimonioController;
use App\Controllers\RelatoriosController;
use App\Core\I18n;
use App\Core\Router;

$config = require __DIR__ . '/../config/config.php';

error_reporting(E_ALL);
ini_set('display_errors', $config['app']['ambiente'] === 'development' ? '1' : '0');

ini_set('session.gc_maxlifetime', '2592000');
session_name($config['app']['session_name']);
session_set_cookie_params([
    'lifetime' => 86400 * 30,
    'path'     => '/',
    'httponly' => true,
    'samesite' => 'Lax',
]);
session_start();

if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}

// Idioma "de visitante" (cookie) para paginas antes do login (login/cadastro/404).
// Paginas autenticadas recarregam com a preferencia real do usuario em View::render().
I18n::carregar($_COOKIE['gf_idioma'] ?? $config['idioma_padrao']);

$router = new Router();

// Autenticação
$router->get('/login', [AuthController::class, 'loginForm']);
$router->post('/login', [AuthController::class, 'login']);
$router->get('/cadastro', [AuthController::class, 'cadastroForm']);
$router->post('/cadastro', [AuthController::class, 'cadastro']);
$router->get('/logout', [AuthController::class, 'logout']);

// Páginas principais
$router->get('/', [DashboardController::class, 'index']);
$router->get('/planejar', [DashboardController::class, 'index']);
$router->post('/lancamentos', [DashboardController::class, 'criar']);
$router->post('/lancamentos/{id}/editar', [DashboardController::class, 'editar']);
$router->post('/lancamentos/{id}/excluir', [DashboardController::class, 'excluir']);
$router->post('/lancamentos/{id}/marcar-pago', [DashboardController::class, 'marcarPago']);
$router->get('/contas', [ContasController::class, 'index']);
$router->get('/contas/{id}/extrato', [ContasController::class, 'extrato']);
$router->post('/contas', [ContasController::class, 'criar']);
$router->post('/contas/transferir', [ContasController::class, 'transferir']);
$router->post('/contas/{id}/editar', [ContasController::class, 'editar']);
$router->post('/contas/{id}/arquivar', [ContasController::class, 'arquivar']);
$router->post('/contas/{id}/restaurar', [ContasController::class, 'restaurar']);
$router->post('/contas/{id}/ajustar-saldo', [ContasController::class, 'ajustarSaldo']);
$router->get('/categorias', [CategoriasController::class, 'index']);
$router->post('/categorias', [CategoriasController::class, 'criar']);
$router->post('/categorias/{id}/editar', [CategoriasController::class, 'editar']);
$router->post('/categorias/{id}/arquivar', [CategoriasController::class, 'arquivar']);
$router->post('/categorias/{id}/restaurar', [CategoriasController::class, 'restaurar']);
$router->get('/relatorios', [RelatoriosController::class, 'index']);
$router->get('/patrimonio', [PatrimonioController::class, 'index']);
$router->get('/configuracoes', [ConfiguracoesController::class, 'preferencia']);
$router->post('/configuracoes/preferencia', [ConfiguracoesController::class, 'salvarPreferencia']);
$router->get('/configuracoes/perfil', [ConfiguracoesController::class, 'perfil']);
$router->post('/configuracoes/perfil', [ConfiguracoesController::class, 'salvarPerfil']);
$router->post('/configuracoes/senha', [ConfiguracoesController::class, 'salvarSenha']);
$router->get('/configuracoes/dados', [ConfiguracoesController::class, 'dados']);
$router->get('/configuracoes/exportar', [ConfiguracoesController::class, 'exportar']);
$router->post('/configuracoes/importar', [ConfiguracoesController::class, 'importar']);

$router->despachar($_SERVER['REQUEST_METHOD'], $_SERVER['REQUEST_URI']);
