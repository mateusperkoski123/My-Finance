<?php

namespace App\Core;

/**
 * Protecao CSRF simples baseada em token de sessao.
 */
class Csrf
{
    public static function token(): string
    {
        if (empty($_SESSION['csrf_token'])) {
            $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
        }

        return $_SESSION['csrf_token'];
    }

    public static function campo(): string
    {
        $token = htmlspecialchars(self::token(), ENT_QUOTES, 'UTF-8');
        return "<input type=\"hidden\" name=\"_csrf\" value=\"{$token}\">";
    }

    public static function validar(?string $tokenRecebido): bool
    {
        if (empty($_SESSION['csrf_token']) || empty($tokenRecebido)) {
            return false;
        }

        return hash_equals($_SESSION['csrf_token'], $tokenRecebido);
    }
}
