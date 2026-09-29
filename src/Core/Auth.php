<?php

namespace App\Core;

use App\Models\User;
use PDO;

/**
 * Autenticacao baseada em sessao PHP nativa.
 * Guarda so o id do usuario na sessao; os dados completos sao buscados
 * (e cacheados na propria requisicao) via self::user().
 */
class Auth
{
    private static ?array $usuarioCache = null;

    public static function login(array $usuario): void
    {
        $csrfToken = $_SESSION['csrf_token'] ?? null;
        session_regenerate_id(true);
        $_SESSION['usuario_id'] = (int) $usuario['id'];
        if ($csrfToken) {
            $_SESSION['csrf_token'] = $csrfToken;
        } else {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }
        self::$usuarioCache = $usuario;
    }

    public static function logout(): void
    {
        self::$usuarioCache = null;
        unset($_SESSION['usuario_id']);
        session_regenerate_id(true);
    }

    public static function check(): bool
    {
        return isset($_SESSION['usuario_id']);
    }

    public static function id(): ?int
    {
        return isset($_SESSION['usuario_id']) ? (int) $_SESSION['usuario_id'] : null;
    }

    public static function user(?PDO $pdo = null): ?array
    {
        if (!self::check()) {
            return null;
        }

        if (self::$usuarioCache !== null) {
            return self::$usuarioCache;
        }

        if ($pdo === null) {
            return null;
        }

        $usuario = User::buscarPorId($pdo, self::id());
        self::$usuarioCache = $usuario;

        return $usuario;
    }

    public static function requireLogin(): void
    {
        if (!self::check()) {
            header('Location: /login');
            exit;
        }
    }

    /**
     * Atualiza o cache em memoria do usuario logado (ex.: apos salvar
     * preferencias) sem precisar de novo round-trip ao banco.
     */
    public static function atualizarCache(array $usuario): void
    {
        self::$usuarioCache = $usuario;
    }
}
