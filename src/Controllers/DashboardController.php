<?php

namespace App\Controllers;

use App\Core\Csrf;
use App\Core\Flash;
use App\Core\Periodo;
use App\Models\Categoria;
use App\Models\Conta;
use App\Models\Lancamento;

class DashboardController extends Controller
{
    public function index(): void
    {
        $periodo = Periodo::resolver();

        $tipoParam = $_GET['tipo'] ?? 'todas';
        $filtros = [
            'tipo'  => in_array($tipoParam, ['todas', 'receitas', 'despesas'], true) ? $tipoParam : 'todas',
            'busca' => trim($_GET['busca'] ?? ''),
        ];

        $ordenacaoParam = $_GET['ordenar'] ?? 'data';
        $ordenacao = in_array($ordenacaoParam, ['data', 'valor'], true) ? $ordenacaoParam : 'data';

        $porPagina = 30;
        $paginaAtual = max(1, (int) ($_GET['pagina'] ?? 1));

        $contas = Conta::listar($this->db, $this->usuario['id'], 'ativa');
        $categoriasArvore = Categoria::listarComSubcategorias($this->db, $this->usuario['id'], 'ativa');

        $totalRegistros = Lancamento::contarPorPeriodo($this->db, $this->usuario['id'], $periodo['inicio'], $periodo['fim'], $filtros);
        $totalPaginas = max(1, (int) ceil($totalRegistros / $porPagina));
        if ($paginaAtual > $totalPaginas) {
            $paginaAtual = $totalPaginas;
        }

        $this->render('dashboard/index', [
            'resumo'          => Lancamento::resumoPeriodo($this->db, $this->usuario['id'], $periodo['inicio'], $periodo['fim']),
            'lancamentos'     => Lancamento::listarPorPeriodo($this->db, $this->usuario['id'], $periodo['inicio'], $periodo['fim'], $filtros, $ordenacao, $paginaAtual, $porPagina),
            'contas'          => $contas,
            'categoriasArvore'=> $categoriasArvore,
            'periodo'         => $periodo,
            'filtros'         => $filtros,
            'voltarPara'      => $this->uriAtual(),
            'mesesTira'       => $this->mesesTira($periodo),
            'ordenacao'       => $ordenacao,
            'paginaAtual'     => $paginaAtual,
            'porPagina'       => $porPagina,
            'totalRegistros'  => $totalRegistros,
            'totalPaginas'    => $totalPaginas,
        ]);
    }

    /**
     * Janela de 11 meses ao redor do periodo navegado (5 antes + atual + 5
     * depois), cada um com o total de despesas do mes, para a faixa
     * horizontal do Painel Inicial. So faz sentido no modo mes/ano - um
     * intervalo customizado (data_inicio/data_fim) nao tem um "mes central"
     * unico para centralizar a janela, entao a faixa nao aparece
     * (array vazio; a view ja checa $periodo['customizado'] tambem).
     * Usa mktime() para rolar mes a mes, mesmo padrao ja usado em
     * Periodo::resolver() para o mes anterior/proximo.
     */
    private function mesesTira(array $periodo): array
    {
        if ($periodo['customizado']) {
            return [];
        }

        $meses = [];
        for ($offset = -5; $offset <= 5; $offset++) {
            $ts = mktime(0, 0, 0, $periodo['mes'] + $offset, 1, $periodo['ano']);
            $mes = (int) date('n', $ts);
            $ano = (int) date('Y', $ts);

            $meses[] = [
                'mes'   => $mes,
                'ano'   => $ano,
                'total' => Lancamento::totalDespesasMes($this->db, $this->usuario['id'], $mes, $ano),
                'atual' => $mes === $periodo['mes'] && $ano === $periodo['ano'],
            ];
        }

        return $meses;
    }

    public function criar(): void
    {
        if (!$this->validarCsrf()) {
            return;
        }

        $dados = $this->dadosFormulario();
        if ($dados === null) {
            header('Location: ' . $this->voltarPara());
            exit;
        }

        $quantidade = $this->quantidadeRepeticoes();

        if ($quantidade !== null) {
            $ids = Lancamento::criarComRepeticao($this->db, $this->usuario['id'], $dados, $quantidade);
            Flash::sucesso(t('flash.lancamentos_criados_repeticao', ['n' => count($ids)]));
        } else {
            Lancamento::criar($this->db, $this->usuario['id'], $dados);
            Flash::sucesso($dados['tipo'] === 'receita' ? t('flash.receita_criada') : t('flash.despesa_criada'));
        }

        header('Location: ' . $this->voltarPara());
        exit;
    }

    public function editar(int $id): void
    {
        if (!$this->validarCsrf()) {
            return;
        }

        $lancamento = Lancamento::buscarPorId($this->db, $this->usuario['id'], $id);
        if (!$lancamento || !in_array($lancamento['tipo'], Lancamento::TIPOS_MANUAIS, true)) {
            Flash::erro(t('flash.lancamento_invalido'));
            header('Location: ' . $this->voltarPara());
            exit;
        }

        $dados = $this->dadosFormulario();
        if ($dados === null) {
            header('Location: ' . $this->voltarPara());
            exit;
        }

        $escopo = $_POST['escopo_edicao'] ?? 'apenas_esta';
        if (!in_array($escopo, ['apenas_esta', 'esta_e_proximas', 'toda_serie'], true)) {
            $escopo = 'apenas_esta';
        }

        Lancamento::atualizar($this->db, $this->usuario['id'], $id, $dados, $escopo);
        Flash::sucesso(t('flash.lancamento_atualizado'));
        header('Location: ' . $this->voltarPara());
        exit;
    }

    public function excluir(int $id): void
    {
        if (!$this->validarCsrf()) {
            return;
        }

        $lancamento = Lancamento::buscarPorId($this->db, $this->usuario['id'], $id);
        if (!$lancamento || !in_array($lancamento['tipo'], Lancamento::TIPOS_MANUAIS, true)) {
            Flash::erro(t('flash.lancamento_invalido'));
            header('Location: ' . $this->voltarPara());
            exit;
        }

        $escopo = $_POST['escopo_edicao'] ?? $_POST['escopo_serie'] ?? 'apenas_esta';
        if (!in_array($escopo, ['apenas_esta', 'esta_e_proximas', 'toda_serie'], true)) {
            $escopo = 'apenas_esta';
        }

        Lancamento::excluir($this->db, $this->usuario['id'], $id, $escopo);
        Flash::sucesso(t('flash.lancamento_excluido'));
        header('Location: ' . $this->voltarPara());
        exit;
    }

    public function marcarPago(int $id): void
    {
        if (!$this->validarCsrf()) {
            return;
        }

        $lancamento = Lancamento::buscarPorId($this->db, $this->usuario['id'], $id);
        if (!$lancamento || !in_array($lancamento['tipo'], Lancamento::TIPOS_MANUAIS, true)) {
            Flash::erro(t('flash.lancamento_invalido'));
            header('Location: ' . $this->voltarPara());
            exit;
        }

        Lancamento::marcarPago($this->db, $this->usuario['id'], $id);
        Flash::sucesso(t('flash.lancamento_marcado_pago'));
        header('Location: ' . $this->voltarPara());
        exit;
    }

    private function validarCsrf(): bool
    {
        if (!Csrf::validar($_POST['_csrf'] ?? null)) {
            Flash::erro(t('flash.sessao_expirada'));
            header('Location: ' . $this->voltarPara());
            exit;
        }
        return true;
    }

    /** URL para onde redirecionar apos a acao: o form manda de volta a URL do Painel de onde veio (com mes/ano/filtros preservados). */
    private function voltarPara(): string
    {
        $voltar = $_POST['voltar'] ?? '/';
        return str_starts_with($voltar, '/') ? $voltar : '/';
    }

    private function uriAtual(): string
    {
        return $_SERVER['REQUEST_URI'] ?? '/';
    }

    /**
     * Le o toggle "Repetir Transacao" + a quantidade de repeticoes do form
     * de criacao. Retorna null (criacao simples de 1 lancamento) quando o
     * toggle nao estiver marcado OU a quantidade estiver fora do intervalo
     * permitido (2 a 60) - nao rejeita o form nesse caso, apenas cai para o
     * comportamento de criar um unico lancamento normalmente.
     */
    private function quantidadeRepeticoes(): ?int
    {
        if (empty($_POST['repetir'])) {
            return null;
        }

        $quantidade = (int) ($_POST['quantidade_repeticoes'] ?? 0);
        if ($quantidade < 2 || $quantidade > 60) {
            return null;
        }

        return $quantidade;
    }

    /**
     * Le e valida os campos do form de lancamento manual (novo ou edicao).
     * Retorna null (e ja seta flash de erro) se algo obrigatorio faltar ou
     * for invalido.
     */
    private function dadosFormulario(): ?array
    {
        $tipo = in_array($_POST['tipo'] ?? '', Lancamento::TIPOS_MANUAIS, true) ? $_POST['tipo'] : 'despesa';

        $contaId = (int) ($_POST['conta_id'] ?? 0);
        if (!Conta::buscarPorId($this->db, $this->usuario['id'], $contaId)) {
            Flash::erro(t('flash.lancamento_conta_invalida'));
            return null;
        }

        // Prefere a subcategoria quando informada (select dependente no
        // modal) - so precisa pertencer ao usuario logado, nao precisa
        // pertencer exatamente a categoria selecionada no outro select.
        $categoriaId = !empty($_POST['subcategoria_id'])
            ? (int) $_POST['subcategoria_id']
            : ((int) ($_POST['categoria_id'] ?? 0) ?: null);
        if ($categoriaId !== null && !Categoria::buscarPorId($this->db, $this->usuario['id'], $categoriaId)) {
            Flash::erro(t('flash.lancamento_categoria_invalida'));
            return null;
        }

        $descricao = trim($_POST['descricao'] ?? '');
        if ($descricao === '') {
            Flash::erro(t('flash.lancamento_descricao_obrigatoria'));
            return null;
        }

        $valor = \App\Core\Money::paraFloat($_POST['valor'] ?? '');
        if ($valor <= 0) {
            Flash::erro(t('flash.lancamento_valor_invalido'));
            return null;
        }

        $dataCompetenciaRaw = trim($_POST['data_competencia'] ?? '');
        $dataCompetencia = $this->dataValida($dataCompetenciaRaw) ? $dataCompetenciaRaw : date('Y-m-d');

        // Toggle de Status: "foi_pago" marcado (1) = pago, desmarcado = pendente.
        if (isset($_POST['foi_pago_presente']) || isset($_POST['foi_pago'])) {
            $status = !empty($_POST['foi_pago']) ? 'pago' : 'pendente';
        } else {
            $status = !empty($_POST['nao_pago']) ? 'pendente' : 'pago';
        }

        $dataPagamentoRaw = trim($_POST['data_pagamento'] ?? '');
        $dataPagamentoInformada = $this->dataValida($dataPagamentoRaw) ? $dataPagamentoRaw : null;
        $dataPagamento = $status === 'pago' ? ($dataPagamentoInformada ?? $dataCompetencia) : $dataPagamentoInformada;

        return [
            'conta_id'         => $contaId,
            'categoria_id'     => $categoriaId,
            'tipo'             => $tipo,
            'descricao'        => $descricao,
            'valor'            => $valor,
            'data_competencia' => $dataCompetencia,
            'data_pagamento'   => $dataPagamento,
            'status'           => $status,
            'recorrente'       => !empty($_POST['recorrente']),
            'observacoes'      => trim($_POST['observacoes'] ?? '') ?: null,
        ];
    }

    private function dataValida(string $data): bool
    {
        if ($data === '') {
            return false;
        }
        $d = \DateTime::createFromFormat('Y-m-d', $data);
        return $d !== false && $d->format('Y-m-d') === $data;
    }

}
