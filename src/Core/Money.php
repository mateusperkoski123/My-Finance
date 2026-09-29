<?php

namespace App\Core;

/**
 * Formatacao de valores monetarios conforme a moeda escolhida pelo usuario.
 * Nao depende da extensao intl (para funcionar em qualquer hospedagem).
 */
class Money
{
    private static string $moedaAtual = 'PYG';

    private const FORMATOS = [
        'PYG' => ['simbolo' => '₲',  'decimais' => 0, 'milhar' => '.', 'decimal' => ','],
        'BRL' => ['simbolo' => 'R$', 'decimais' => 2, 'milhar' => '.', 'decimal' => ','],
        'USD' => ['simbolo' => '$',  'decimais' => 2, 'milhar' => ',', 'decimal' => '.'],
        'ARS' => ['simbolo' => '$',  'decimais' => 2, 'milhar' => '.', 'decimal' => ','],
        'EUR' => ['simbolo' => '€',  'decimais' => 2, 'milhar' => '.', 'decimal' => ','],
    ];

    public static function definirMoeda(string $codigo): void
    {
        self::$moedaAtual = array_key_exists($codigo, self::FORMATOS) ? $codigo : 'PYG';
    }

    public static function moedaAtual(): string
    {
        return self::$moedaAtual;
    }

    public static function decimaisAtual(): int
    {
        return self::FORMATOS[self::$moedaAtual]['decimais'];
    }

    public static function formatar(float $valor, ?string $moeda = null): string
    {
        $formato = self::FORMATOS[$moeda ?? self::$moedaAtual] ?? self::FORMATOS['PYG'];

        $numero = number_format(abs($valor), $formato['decimais'], $formato['decimal'], $formato['milhar']);
        $sinal = $valor < 0 ? '-' : '';

        return "{$sinal}{$formato['simbolo']} {$numero}";
    }

    /**
     * Formata um valor para usar como "value" de <input>: sem separador de
     * milhar, ponto como separador decimal (padrao HTML), e sem casas
     * decimais quando a moeda atual nao usa centavos (ex.: Guarani) - e
     * exatamente o que evita aparecer "50000.00" num campo de Guaranis.
     */
    public static function paraInput(float $valor): string
    {
        return number_format($valor, self::decimaisAtual(), '.', '');
    }

    /**
     * Interpreta uma string digitada pelo usuario (ou ja formatada pelo JS
     * de digitacao ao vivo, incluindo simbolo/separador de milhar) e
     * devolve o valor numerico. Estrategia: mantem so digitos + o separador
     * DECIMAL da moeda atual (whitelist), descarta tudo o mais (simbolo,
     * separador de milhar, espacos, letras) - assim funciona igual para
     * "10000", "10.000", "₲ 10.000", "R$ 1.234,56" etc., sem depender de
     * heuristica sobre quantos separadores existem no texto.
     */
    public static function paraFloat(string $valor, ?string $moeda = null): float
    {
        $valor = trim($valor);
        if ($valor === '') {
            return 0.0;
        }

        $formato = self::FORMATOS[$moeda ?? self::$moedaAtual] ?? self::FORMATOS['PYG'];

        $negativo = str_starts_with($valor, '-');

        if ($formato['decimais'] === 0) {
            // Moeda sem casas decimais: qualquer separador digitado (ponto,
            // virgula...) e sempre agrupador de milhar, nunca decimal.
            $limpo = preg_replace('/[^0-9]/', '', $valor);
            $numero = $limpo === '' ? 0.0 : (float) $limpo;
        } else {
            $separadorDecimal = preg_quote($formato['decimal'], '/');
            $limpo = preg_replace('/[^0-9' . $separadorDecimal . ']/', '', $valor);
            // So o ULTIMO separador decimal digitado conta como decimal de
            // verdade; qualquer ocorrencia anterior dele (ex.: usuario ainda
            // digitando "1.234,5" onde "," e o decimal mas "." sobrou por
            // engano) e tratada como ruido e removida.
            $ultima = strrpos($limpo, $formato['decimal']);
            if ($ultima !== false) {
                $limpo = str_replace($formato['decimal'], '', substr($limpo, 0, $ultima))
                    . '.' . substr($limpo, $ultima + strlen($formato['decimal']));
            }
            $numero = $limpo === '' || $limpo === '.' ? 0.0 : (float) $limpo;
        }

        return $negativo ? -$numero : $numero;
    }

    /**
     * Configuracao da moeda atual pronta para embutir em JS (formatacao ao
     * vivo dos campos de valor - ver public/assets/js/app.js).
     */
    public static function configParaJs(): array
    {
        $formato = self::FORMATOS[self::$moedaAtual];

        return [
            'simbolo'  => $formato['simbolo'],
            'decimais' => $formato['decimais'],
            'milhar'   => $formato['milhar'],
            'decimal'  => $formato['decimal'],
        ];
    }
}
