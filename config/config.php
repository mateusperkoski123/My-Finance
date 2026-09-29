<?php

/**
 * Configuracao central da aplicacao.
 * Para sobrescrever credenciais localmente (ex.: outro usuario/senha do MySQL),
 * copie este arquivo de exemplo para config.local.php (ignorado pelo git) e
 * altere apenas o que precisar - ele e mesclado por cima destes valores.
 */

$config = [
    'app' => [
        'nome'          => 'Gestão Financeira',
        // Nome do cookie/sessao PHP usado pela aplicacao.
        'session_name'  => 'gf_session',
        // Ambiente: development | production. Controla exibicao de erros.
        'ambiente'      => 'development',
    ],

    'db' => [
        'host' => '127.0.0.1',
        'port' => 3306,
        'nome' => 'gestao_financeira',
        'user' => 'root',
        'pass' => '',
        'charset' => 'utf8mb4',
    ],

    // Idiomas disponiveis para o seletor em Configuracoes > Preferencia.
    'idiomas' => [
        'pt-BR' => 'Português (Brasil)',
        'es-PY' => 'Español (Paraguay)',
        'en-US' => 'English (US)',
    ],
    'idioma_padrao' => 'pt-BR',

    // Moedas disponiveis para o seletor em Configuracoes > Preferencia.
    'moedas' => [
        'PYG' => 'Guaraní (PYG)',
        'BRL' => 'Real (BRL)',
        'USD' => 'Dólar (USD)',
        'ARS' => 'Peso Argentino (ARS)',
        'EUR' => 'Euro (EUR)',
    ],
    'moeda_padrao' => 'PYG',

    // Temas de interface disponiveis (usados no atributo data-tema do <html>).
    'temas' => [
        'claro'  => 'Claro',
        'escuro' => 'Escuro',
    ],
    'tema_padrao' => 'claro',
];

$configLocal = __DIR__ . '/config.local.php';
if (is_file($configLocal)) {
    $overrides = require $configLocal;
    if (is_array($overrides)) {
        $config = array_replace_recursive($config, $overrides);
    }
}

return $config;
