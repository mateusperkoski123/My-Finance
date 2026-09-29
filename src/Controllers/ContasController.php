<?php

namespace App\Controllers;

use App\Core\Csrf;
use App\Core\Flash;
use App\Models\Conta;
use App\Models\Lancamento;

class ContasController extends Controller
{
    public function index(): void
    {
        $abaArquivadas = ($_GET['aba'] ?? 'ativas') === 'arquivadas';
        $status = $abaArquivadas ? 'arquivada' : 'ativa';

        $this->render('contas/index', [
            'contas'         => Conta::listar($this->db, $this->usuario['id'], $status),
            'abaArquivadas'  => $abaArquivadas,
            'saldoTotal'     => Conta::saldoTotal($this->db, $this->usuario['id']),
            'totalAtivas'    => Conta::contarAtivas($this->db, $this->usuario['id']),
        ]);
    }

    public function extrato(int $id): void
    {
        $conta = Conta::buscarPorId($this->db, $this->usuario['id'], $id);
        if (!$conta) {
            Flash::erro(t('flash.conta_invalida'));
            header('Location: /contas');
            exit;
        }

        $this->render('contas/extrato', [
            'conta'       => $conta,
            'lancamentos' => Lancamento::listarPorConta($this->db, $this->usuario['id'], $id),
        ]);
    }

    public function criar(): void
    {
        if (!$this->validarCsrf()) {
            return;
        }

        $dados = $this->dadosFormulario();

        if ($dados === null) {
            header('Location: /contas');
            exit;
        }

        Conta::criar($this->db, $this->usuario['id'], $dados);
        Flash::sucesso(t('flash.conta_criada'));
        header('Location: /contas');
        exit;
    }

    public function editar(int $id): void
    {
        if (!$this->validarCsrf()) {
            return;
        }

        if (!Conta::buscarPorId($this->db, $this->usuario['id'], $id)) {
            Flash::erro(t('flash.conta_invalida'));
            header('Location: /contas');
            exit;
        }

        $dados = $this->dadosFormulario();

        if ($dados === null) {
            header('Location: /contas');
            exit;
        }

        Conta::atualizar($this->db, $this->usuario['id'], $id, $dados);
        Flash::sucesso(t('flash.conta_atualizada'));
        header('Location: /contas');
        exit;
    }

    public function arquivar(int $id): void
    {
        if (!$this->validarCsrf()) {
            return;
        }

        Conta::arquivar($this->db, $this->usuario['id'], $id);
        Flash::sucesso(t('flash.conta_arquivada'));
        header('Location: /contas');
        exit;
    }

    public function restaurar(int $id): void
    {
        if (!$this->validarCsrf()) {
            return;
        }

        Conta::restaurar($this->db, $this->usuario['id'], $id);
        Flash::sucesso(t('flash.conta_restaurada'));
        header('Location: /contas');
        exit;
    }

    public function ajustarSaldo(int $id): void
    {
        if (!$this->validarCsrf()) {
            return;
        }

        $conta = Conta::buscarPorId($this->db, $this->usuario['id'], $id);
        if (!$conta) {
            Flash::erro(t('flash.conta_invalida'));
            header('Location: /contas');
            exit;
        }

        $tipoAjuste = $_POST['tipo_ajuste'] ?? 'somar';
        $valorAjuste = \App\Core\Money::paraFloat($_POST['valor_ajuste'] ?? $_POST['novo_saldo'] ?? '');

        if (isset($_POST['valor_ajuste'])) {
            $diferenca = $tipoAjuste === 'subtrair' ? -abs($valorAjuste) : abs($valorAjuste);
        } else {
            $diferenca = round($valorAjuste - (float) $conta['saldo_atual'], 2);
        }

        if (abs($diferenca) > 0.004) {
            $categoriaId = \App\Models\Categoria::idSistema($this->db, $this->usuario['id'], 'ajuste_saldo');
            Lancamento::criarAjuste($this->db, $this->usuario['id'], $id, $diferenca, 'Ajuste de saldo', $categoriaId);
        }

        Flash::sucesso(t('flash.saldo_ajustado'));
        header('Location: /contas');
        exit;
    }

    public function transferir(): void
    {
        if (!$this->validarCsrf()) {
            return;
        }

        $origemId  = (int) ($_POST['conta_origem_id'] ?? 0);
        $destinoId = (int) ($_POST['conta_destino_id'] ?? 0);
        $valor     = \App\Core\Money::paraFloat($_POST['valor'] ?? '');
        $descricao = trim($_POST['descricao'] ?? '') ?: 'Transferência entre contas';
        $data      = $_POST['data'] ?? date('Y-m-d');

        $origem  = Conta::buscarPorId($this->db, $this->usuario['id'], $origemId);
        $destino = Conta::buscarPorId($this->db, $this->usuario['id'], $destinoId);

        if (!$origem || !$destino) {
            Flash::erro(t('flash.conta_invalida'));
            header('Location: /contas');
            exit;
        }

        if ($origemId === $destinoId) {
            Flash::erro(t('flash.transferencia_contas_iguais'));
            header('Location: /contas');
            exit;
        }

        if ($valor <= 0) {
            Flash::erro(t('flash.transferencia_valor_invalido'));
            header('Location: /contas');
            exit;
        }

        $categoriaId = \App\Models\Categoria::idSistema($this->db, $this->usuario['id'], 'transferencia_bancaria');
        Lancamento::criarTransferencia($this->db, $this->usuario['id'], $origemId, $destinoId, $valor, $descricao, $data, $categoriaId);
        Flash::sucesso(t('flash.transferencia_realizada'));
        header('Location: /contas');
        exit;
    }

    private function validarCsrf(): bool
    {
        if (!Csrf::validar($_POST['_csrf'] ?? null)) {
            Flash::erro(t('flash.sessao_expirada'));
            header('Location: /contas');
            exit;
        }
        return true;
    }

    /**
     * Le e valida nome/tipo/cor/saldo_inicial/conta_padrao do POST.
     * Retorna null (e ja seta flash de erro) se o nome estiver vazio.
     */
    private function dadosFormulario(): ?array
    {
        $nome = trim($_POST['nome'] ?? '');
        if ($nome === '') {
            Flash::erro(t('flash.conta_nome_obrigatorio'));
            return null;
        }

        $tipo = $_POST['tipo'] ?? 'corrente';
        if (!in_array($tipo, \App\Models\Conta::TIPOS, true)) {
            $tipo = 'corrente';
        }

        $cor = $_POST['cor'] ?? '#2563eb';
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $cor)) {
            $cor = '#2563eb';
        }

        return [
            'nome'          => $nome,
            'tipo'          => $tipo,
            'cor'           => $cor,
            'saldo_inicial' => \App\Core\Money::paraFloat($_POST['saldo_inicial'] ?? '0'),
            'conta_padrao'  => !empty($_POST['conta_padrao']),
        ];
    }
}
