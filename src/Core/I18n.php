<?php

namespace App\Core;

/**
 * Traducoes simples baseadas em arquivos PHP (chave => texto) em /lang.
 * pt-BR e o idioma de referencia: qualquer chave que falte em outro idioma
 * cai automaticamente para o texto em pt-BR, em vez de quebrar a tela.
 */
class I18n
{
    private static array $dicionario = [];
    private static string $idiomaAtual = 'pt-BR';
    private const IDIOMA_REFERENCIA = 'pt-BR';

    public static function carregar(string $idioma): void
    {
        if ($idioma === 'es-ES' || $idioma === 'es' || str_starts_with($idioma, 'es')) {
            $idioma = 'es-PY';
        }

        $arquivo = __DIR__ . '/../../lang/' . $idioma . '.php';
        if (!is_file($arquivo)) {
            $idioma = self::IDIOMA_REFERENCIA;
            $arquivo = __DIR__ . '/../../lang/' . $idioma . '.php';
        }

        $traducoes = require $arquivo;

        if ($idioma !== self::IDIOMA_REFERENCIA) {
            $referencia = require __DIR__ . '/../../lang/' . self::IDIOMA_REFERENCIA . '.php';
            $traducoes = array_merge($referencia, $traducoes);
        }

        self::$dicionario = $traducoes;
        self::$idiomaAtual = $idioma;
    }

    public static function idioma(): string
    {
        return self::$idiomaAtual;
    }

    public static function t(string $chave, array $parametros = []): string
    {
        $texto = self::$dicionario[$chave] ?? $chave;

        if ($parametros) {
            $substituicoes = [];
            foreach ($parametros as $nome => $valor) {
                $substituicoes['{' . $nome . '}'] = $valor;
            }
            $texto = strtr($texto, $substituicoes);
        }

        return $texto;
    }
}
