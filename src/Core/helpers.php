<?php

use App\Core\I18n;
use App\Core\Money;

if (!function_exists('t')) {
    /**
     * Atalho global para traducao: t('nav.painel').
     */
    function t(string $chave, array $parametros = []): string
    {
        return I18n::t($chave, $parametros);
    }
}

if (!function_exists('moeda')) {
    /**
     * Atalho global para formatar valores na moeda atual do usuario logado:
     * moeda(1234.5) -> "₲ 1.235" (ou "R$ 1.234,50", etc.).
     */
    function moeda(float $valor, ?string $codigo = null): string
    {
        return Money::formatar($valor, $codigo);
    }
}

if (!function_exists('moeda_input')) {
    /**
     * Atalho global para preencher o "value" de um <input> de valor
     * monetario, respeitando as casas decimais da moeda atual.
     */
    function moeda_input(float $valor): string
    {
        return Money::paraInput($valor);
    }
}

if (!function_exists('moeda_decimais')) {
    function moeda_decimais(): int
    {
        return Money::decimaisAtual();
    }
}
