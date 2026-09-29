<?php

namespace App\Core;

/**
 * Resolucao do periodo (mes/ano ou intervalo customizado via
 * data_inicio/data_fim) usada tanto pelo Painel Inicial quanto pelos
 * Relatorios (Fase 4), garantindo que a navegacao (mes anterior/proximo/
 * hoje) se comporte de forma identica nas duas telas. Extraida de
 * DashboardController::resolverPeriodo() sem alterar o comportamento.
 */
class Periodo
{
    public static function resolver(): array
    {
        $dataInicioParam = trim($_GET['data_inicio'] ?? '');
        $dataFimParam = trim($_GET['data_fim'] ?? '');

        if ($dataInicioParam !== '' && $dataFimParam !== '' && self::dataValida($dataInicioParam) && self::dataValida($dataFimParam) && $dataInicioParam <= $dataFimParam) {
            $tsInicio = strtotime($dataInicioParam);
            $mes = (int) date('n', $tsInicio);
            $ano = (int) date('Y', $tsInicio);
            $anteriorTs = mktime(0, 0, 0, $mes - 1, 1, $ano);
            $proximoTs = mktime(0, 0, 0, $mes + 1, 1, $ano);

            return [
                'customizado'   => true,
                'inicio'        => $dataInicioParam,
                'fim'           => $dataFimParam,
                'mes'           => $mes,
                'ano'           => $ano,
                'mes_anterior'  => (int) date('n', $anteriorTs),
                'ano_anterior'  => (int) date('Y', $anteriorTs),
                'mes_proximo'   => (int) date('n', $proximoTs),
                'ano_proximo'   => (int) date('Y', $proximoTs),
                'e_mes_atual'   => false,
            ];
        }

        $ano = (int) ($_GET['ano'] ?? date('Y'));
        $mes = (int) ($_GET['mes'] ?? date('n'));
        if ($mes < 1 || $mes > 12) {
            $mes = (int) date('n');
        }

        $inicioTs = mktime(0, 0, 0, $mes, 1, $ano);
        $inicio = date('Y-m-d', $inicioTs);
        $fim = date('Y-m-t', $inicioTs);

        $anteriorTs = mktime(0, 0, 0, $mes - 1, 1, $ano);
        $proximoTs = mktime(0, 0, 0, $mes + 1, 1, $ano);

        return [
            'customizado'   => false,
            'inicio'        => $inicio,
            'fim'           => $fim,
            'mes'           => $mes,
            'ano'           => $ano,
            'mes_anterior'  => (int) date('n', $anteriorTs),
            'ano_anterior'  => (int) date('Y', $anteriorTs),
            'mes_proximo'   => (int) date('n', $proximoTs),
            'ano_proximo'   => (int) date('Y', $proximoTs),
            'e_mes_atual'   => $mes === (int) date('n') && $ano === (int) date('Y'),
        ];
    }

    public static function dataValida(string $data): bool
    {
        if ($data === '') {
            return false;
        }
        $d = \DateTime::createFromFormat('Y-m-d', $data);
        return $d !== false && $d->format('Y-m-d') === $data;
    }
}
