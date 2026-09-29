<?php

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Database;
use App\Core\Money;
use App\Core\View;
use App\Models\Categoria;
use PDO;

/**
 * Base para controllers de paginas autenticadas: garante login, expoe a
 * conexao PDO e o usuario logado, e um atalho para renderizar com layout.
 */
abstract class Controller
{
    protected PDO $db;
    protected array $usuario;
    protected array $config;

    public function __construct()
    {
        $this->config = require __DIR__ . '/../../config/config.php';
        $this->db = Database::connect($this->config['db']);

        Auth::requireLogin();
        $this->usuario = Auth::user($this->db);

        // Define o contexto de moeda ja aqui (nao so em render()) para que
        // acoes que so processam POST e redirecionam - sem nunca chamar
        // render() - tambem interpretem/formatam valores na moeda certa.
        Money::definirMoeda($this->usuario['moeda']);

        // Garante que as categorias de sistema existam mesmo para usuarios
        // que se cadastraram antes da Fase 2 (INSERT IGNORE - idempotente).
        Categoria::criarCategoriasSistema($this->db, $this->usuario['id']);
    }

    protected function render(string $view, array $dados = []): void
    {
        View::render($view, $dados, $this->usuario);
    }
}
