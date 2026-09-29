<?php

namespace App\Controllers;

use App\Core\Periodo;
use App\Models\Lancamento;

class RelatoriosController extends Controller
{
    private const ABAS = ['graficos', 'pendentes', 'demonstrativo', 'demonstrativo_anual'];

    public function index(): void
    {
        $periodo = Periodo::resolver();
        $abaParam = $_GET['aba'] ?? 'graficos';
        $aba = in_array($abaParam, self::ABAS, true) ? $abaParam : 'graficos';

        $despesasPorCategoria = Lancamento::despesasPorCategoriaTopo($this->db, $this->usuario['id'], $periodo['inicio'], $periodo['fim']);
        $receitasPorCategoria = Lancamento::receitasPorCategoriaTopo($this->db, $this->usuario['id'], $periodo['inicio'], $periodo['fim']);

        // Ano do Demonstrativo Anual: parametro proprio (ano_anual), separado
        // do mes/ano do periodo principal usado pelas outras abas - so
        // buscamos os dados quando essa aba esta ativa, pra nao pagar o
        // custo da query nas demais.
        $anoAtual = (int) date('Y');
        $anoAnual = (int) ($_GET['ano_anual'] ?? $anoAtual);
        if ($anoAnual < 2000 || $anoAnual > 2100) {
            $anoAnual = $anoAtual;
        }
        $demonstrativoAnual = $aba === 'demonstrativo_anual'
            ? Lancamento::demonstrativoAnual($this->db, $this->usuario['id'], $anoAnual)
            : null;

        $this->render('relatorios/index', [
            'periodo'              => $periodo,
            'aba'                  => $aba,
            'despesasPorCategoria' => $despesasPorCategoria,
            'receitasPorCategoria' => $receitasPorCategoria,
            'totalDespesas'        => array_sum(array_column($despesasPorCategoria, 'total')),
            'totalReceitas'        => array_sum(array_column($receitasPorCategoria, 'total')),
            'frequencia'           => Lancamento::frequenciaDiaria($this->db, $this->usuario['id'], $periodo['inicio'], $periodo['fim']),
            // Pendentes nao e filtrado pelo periodo navegado (ver
            // Lancamento::listarPendentes) - mostra tudo que ainda esta em
            // aberto, independente do mes selecionado acima.
            'pendentes'            => Lancamento::listarPendentes($this->db, $this->usuario['id']),
            'anoAnual'             => $anoAnual,
            'anoAtual'             => $anoAtual,
            'demonstrativoAnual'   => $demonstrativoAnual,
            'contas'               => \App\Models\Conta::listar($this->db, $this->usuario['id'], 'ativa'),
            'categoriasArvore'     => \App\Models\Categoria::listarComSubcategorias($this->db, $this->usuario['id'], 'ativa'),
            'voltarPara'           => $_SERVER['REQUEST_URI'] ?? '/relatorios?aba=pendentes',
        ]);
    }
}
