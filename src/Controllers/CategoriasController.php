<?php

namespace App\Controllers;

use App\Core\Csrf;
use App\Core\Flash;
use App\Models\Categoria;

class CategoriasController extends Controller
{
    public function index(): void
    {
        $abaArquivadas = ($_GET['aba'] ?? 'ativas') === 'arquivadas';
        $status = $abaArquivadas ? 'arquivada' : 'ativa';

        $filtros = [
            'busca'            => trim($_GET['busca'] ?? ''),
            'com_limite'       => !empty($_GET['com_limite']),
            'com_subcategoria' => !empty($_GET['com_subcategoria']),
        ];

        $this->render('categorias/index', [
            'categorias'    => Categoria::listarComSubcategorias($this->db, $this->usuario['id'], $status, $filtros),
            'sistema'       => $abaArquivadas ? [] : Categoria::listarSistema($this->db, $this->usuario['id']),
            'categoriasPai' => Categoria::listarTopoAtivas($this->db, $this->usuario['id']),
            'abaArquivadas' => $abaArquivadas,
            'limiteTotal'   => Categoria::limiteTotal($this->db, $this->usuario['id']),
            'filtros'       => $filtros,
        ]);
    }

    public function criar(): void
    {
        if (!$this->validarCsrf()) {
            return;
        }

        $dados = $this->dadosFormulario();
        if ($dados === null) {
            header('Location: /categorias');
            exit;
        }

        Categoria::criar($this->db, $this->usuario['id'], $dados);
        Flash::sucesso(t('flash.categoria_criada'));
        header('Location: /categorias');
        exit;
    }

    public function editar(int $id): void
    {
        if (!$this->validarCsrf()) {
            return;
        }

        $categoria = Categoria::buscarPorId($this->db, $this->usuario['id'], $id);
        if (!$categoria || $categoria['sistema']) {
            Flash::erro(t('flash.categoria_invalida'));
            header('Location: /categorias');
            exit;
        }

        $dados = $this->dadosFormulario();
        if ($dados === null) {
            header('Location: /categorias');
            exit;
        }

        Categoria::atualizar($this->db, $this->usuario['id'], $id, $dados);
        Flash::sucesso(t('flash.categoria_atualizada'));
        header('Location: /categorias');
        exit;
    }

    public function arquivar(int $id): void
    {
        if (!$this->validarCsrf()) {
            return;
        }

        Categoria::arquivar($this->db, $this->usuario['id'], $id);
        Flash::sucesso(t('flash.categoria_arquivada'));
        header('Location: /categorias');
        exit;
    }

    public function restaurar(int $id): void
    {
        if (!$this->validarCsrf()) {
            return;
        }

        Categoria::restaurar($this->db, $this->usuario['id'], $id);
        Flash::sucesso(t('flash.categoria_restaurada'));
        header('Location: /categorias');
        exit;
    }

    private function validarCsrf(): bool
    {
        if (!Csrf::validar($_POST['_csrf'] ?? null)) {
            Flash::erro(t('flash.sessao_expirada'));
            header('Location: /categorias');
            exit;
        }
        return true;
    }

    /**
     * Le e valida nome/cor/tipo/limite_gasto/parent_id do POST.
     * Retorna null (e ja seta flash de erro) se o nome estiver vazio ou o
     * parent_id apontar para uma categoria invalida/subcategoria (nao
     * permitimos 3 niveis de profundidade).
     */
    private function dadosFormulario(): ?array
    {
        $nome = trim($_POST['nome'] ?? '');
        if ($nome === '') {
            Flash::erro(t('flash.categoria_nome_obrigatorio'));
            return null;
        }

        $tipo = $_POST['tipo'] ?? 'despesa';
        if (!in_array($tipo, Categoria::TIPOS, true)) {
            $tipo = 'despesa';
        }

        $cor = $_POST['cor'] ?? '#2563eb';
        if (!preg_match('/^#[0-9a-fA-F]{6}$/', $cor)) {
            $cor = '#2563eb';
        }

        $limiteRaw = trim($_POST['limite_gasto'] ?? '');
        $limite = null;
        if ($limiteRaw !== '') {
            $limite = \App\Core\Money::paraFloat($limiteRaw);
        }

        $parentId = (int) ($_POST['parent_id'] ?? 0) ?: null;
        if ($parentId !== null) {
            $pai = Categoria::buscarPorId($this->db, $this->usuario['id'], $parentId);
            if (!$pai || $pai['parent_id'] !== null || $pai['sistema']) {
                Flash::erro(t('flash.categoria_pai_invalida'));
                return null;
            }
        }

        return [
            'nome'         => $nome,
            'tipo'         => $tipo,
            'cor'          => $cor,
            'limite_gasto' => $limite,
            'parent_id'    => $parentId,
        ];
    }

}
