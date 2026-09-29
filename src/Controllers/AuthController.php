<?php

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Csrf;
use App\Core\Database;
use App\Core\Flash;
use App\Core\View;
use App\Models\User;

class AuthController
{
    private function db()
    {
        static $pdo = null;
        if ($pdo === null) {
            $config = require __DIR__ . '/../../config/config.php';
            $pdo = Database::connect($config['db']);
        }
        return $pdo;
    }

    public function loginForm(): void
    {
        if (Auth::check()) {
            header('Location: /');
            exit;
        }
        View::renderSemLayout('auth/login', ['erro' => null]);
    }

    public function login(): void
    {
        if (!Csrf::validar($_POST['_csrf'] ?? null)) {
            Flash::erro(t('flash.sessao_expirada'));
            header('Location: /login');
            exit;
        }

        $email = trim($_POST['email'] ?? '');
        $senha = (string) ($_POST['senha'] ?? '');

        $usuario = User::buscarPorEmail($this->db(), $email);

        if (!$usuario || !password_verify($senha, $usuario['senha_hash'])) {
            View::renderSemLayout('auth/login', ['erro' => t('flash.login_invalido')]);
            return;
        }

        Auth::login($usuario);
        header('Location: /');
        exit;
    }

    public function cadastroForm(): void
    {
        if (Auth::check()) {
            header('Location: /');
            exit;
        }
        View::renderSemLayout('auth/cadastro', ['erro' => null, 'valores' => []]);
    }

    public function cadastro(): void
    {
        $config = require __DIR__ . '/../../config/config.php';

        if (!Csrf::validar($_POST['_csrf'] ?? null)) {
            Flash::erro(t('flash.sessao_expirada'));
            header('Location: /cadastro');
            exit;
        }

        $nome    = trim($_POST['nome'] ?? '');
        $email   = trim($_POST['email'] ?? '');
        $senha   = (string) ($_POST['senha'] ?? '');
        $confirmar = (string) ($_POST['confirmar_senha'] ?? '');

        $erro = null;
        if ($nome === '' || $email === '' || $senha === '') {
            $erro = t('flash.cadastro_incompleto');
        } elseif (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            $erro = t('flash.email_invalido');
        } elseif (strlen($senha) < 6) {
            $erro = t('flash.senha_curta');
        } elseif ($senha !== $confirmar) {
            $erro = t('flash.senhas_diferentes');
        } elseif (User::buscarPorEmail($this->db(), $email)) {
            $erro = t('flash.email_em_uso');
        }

        if ($erro) {
            View::renderSemLayout('auth/cadastro', [
                'erro'    => $erro,
                'valores' => ['nome' => $nome, 'email' => $email],
            ]);
            return;
        }

        $usuario = User::criar(
            $this->db(),
            $nome,
            $email,
            $senha,
            $config['idioma_padrao'],
            $config['moeda_padrao'],
            $config['tema_padrao']
        );

        // Categorias de sistema (Ajuste de Saldo, Transferência Bancária)
        // usadas pelos lançamentos automáticos de Contas Bancárias.
        \App\Models\Categoria::criarCategoriasSistema($this->db(), (int) $usuario['id']);

        Auth::login($usuario);
        Flash::sucesso(t('flash.cadastro_sucesso'));
        header('Location: /');
        exit;
    }

    public function logout(): void
    {
        Auth::logout();
        header('Location: /login');
        exit;
    }
}
