<?php

namespace App\Core;

/**
 * Mensagens "flash" de uma unica exibicao (sucesso/erro apos redirect).
 */
class Flash
{
    public static function set(string $tipo, string $mensagem): void
    {
        $_SESSION['_flash'][$tipo][] = $mensagem;
    }

    public static function sucesso(string $mensagem): void
    {
        self::set('sucesso', $mensagem);
    }

    public static function erro(string $mensagem): void
    {
        self::set('erro', $mensagem);
    }

    /** Le e limpa todas as mensagens acumuladas. */
    public static function consumir(): array
    {
        $mensagens = $_SESSION['_flash'] ?? [];
        unset($_SESSION['_flash']);
        return $mensagens;
    }
}
