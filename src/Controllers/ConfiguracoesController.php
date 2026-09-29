<?php

namespace App\Controllers;

use App\Core\Auth;
use App\Core\Csrf;
use App\Core\Flash;
use App\Core\I18n;
use App\Models\Categoria;
use App\Models\Conta;
use App\Models\Lancamento;
use App\Models\User;
use PDO;

class ConfiguracoesController extends Controller
{
    public function preferencia(): void
    {
        $this->render('configuracoes/index', [
            'aba' => 'preferencia',
        ]);
    }

    public function salvarPreferencia(): void
    {
        if (!Csrf::validar($_POST['_csrf'] ?? null)) {
            Flash::erro(t('flash.sessao_expirada'));
            header('Location: /configuracoes');
            exit;
        }

        $idioma = $_POST['idioma'] ?? $this->config['idioma_padrao'];
        $moeda  = $_POST['moeda'] ?? $this->config['moeda_padrao'];
        $tema   = $_POST['tema'] ?? $this->config['tema_padrao'];

        if (!array_key_exists($idioma, $this->config['idiomas'])) {
            $idioma = $this->config['idioma_padrao'];
        }
        if (!array_key_exists($moeda, $this->config['moedas'])) {
            $moeda = $this->config['moeda_padrao'];
        }
        if (!array_key_exists($tema, $this->config['temas'])) {
            $tema = $this->config['tema_padrao'];
        }

        $usuarioAtualizado = User::atualizarPreferencias($this->db, $this->usuario['id'], $idioma, $moeda, $tema);
        Auth::atualizarCache($usuarioAtualizado);

        // Cookies de apoio para renderizar tema/idioma certos antes mesmo do
        // login (ex.: na proxima visita a tela de login).
        setcookie('gf_tema', $tema, time() + (60 * 60 * 24 * 365), '/');
        setcookie('gf_idioma', $idioma, time() + (60 * 60 * 24 * 365), '/');
        setcookie('gf_moeda', $moeda, time() + (60 * 60 * 24 * 365), '/');

        // Recarrega as traducoes com o idioma recem-escolhido para que a
        // propria mensagem de confirmacao ja apareca no idioma novo.
        I18n::carregar($idioma);
        Flash::sucesso(t('flash.preferencias_salvas'));
        header('Location: /configuracoes');
        exit;
    }

    public function perfil(): void
    {
        $this->render('configuracoes/perfil', [
            'aba' => 'perfil',
        ]);
    }

    public function salvarPerfil(): void
    {
        if (!Csrf::validar($_POST['_csrf'] ?? null)) {
            Flash::erro(t('flash.sessao_expirada'));
            header('Location: /configuracoes/perfil');
            exit;
        }

        $nome  = trim($_POST['nome'] ?? '');
        $email = trim($_POST['email'] ?? '');

        if ($nome === '') {
            Flash::erro(t('flash.perfil_nome_obrigatorio'));
            header('Location: /configuracoes/perfil');
            exit;
        }
        if ($email === '') {
            Flash::erro(t('flash.perfil_email_obrigatorio'));
            header('Location: /configuracoes/perfil');
            exit;
        }
        if (!filter_var($email, FILTER_VALIDATE_EMAIL)) {
            Flash::erro(t('flash.email_invalido'));
            header('Location: /configuracoes/perfil');
            exit;
        }
        if (User::emailEmUsoPorOutro($this->db, $email, $this->usuario['id'])) {
            Flash::erro(t('flash.perfil_email_em_uso'));
            header('Location: /configuracoes/perfil');
            exit;
        }

        $usuarioAtualizado = User::atualizarPerfil($this->db, $this->usuario['id'], $nome, $email);
        Auth::atualizarCache($usuarioAtualizado);

        Flash::sucesso(t('flash.perfil_atualizado'));
        header('Location: /configuracoes/perfil');
        exit;
    }

    public function salvarSenha(): void
    {
        if (!Csrf::validar($_POST['_csrf'] ?? null)) {
            Flash::erro(t('flash.sessao_expirada'));
            header('Location: /configuracoes/perfil');
            exit;
        }

        $senhaAtual     = (string) ($_POST['senha_atual'] ?? '');
        $senhaNova      = (string) ($_POST['senha_nova'] ?? '');
        $senhaConfirmar = (string) ($_POST['senha_confirmar'] ?? '');

        if (!password_verify($senhaAtual, $this->usuario['senha_hash'])) {
            Flash::erro(t('flash.senha_atual_incorreta'));
            header('Location: /configuracoes/perfil');
            exit;
        }
        if (strlen($senhaNova) < 6) {
            Flash::erro(t('flash.senha_curta'));
            header('Location: /configuracoes/perfil');
            exit;
        }
        if ($senhaNova !== $senhaConfirmar) {
            Flash::erro(t('flash.senhas_diferentes'));
            header('Location: /configuracoes/perfil');
            exit;
        }

        User::atualizarSenha($this->db, $this->usuario['id'], $senhaNova);

        Flash::sucesso(t('flash.senha_atualizada'));
        header('Location: /configuracoes/perfil');
        exit;
    }

    public function dados(): void
    {
        $this->render('configuracoes/dados', [
            'aba' => 'dados',
        ]);
    }

    /**
     * Exporta um backup completo (perfil sem senha + contas + categorias +
     * lancamentos) do usuario logado em JSON, para download direto (sem
     * gravar nada em disco no servidor).
     */
    public function exportar(): void
    {
        $usuario = $this->usuario;
        $userId  = (int) $usuario['id'];

        $backup = [
            'versao'       => 1,
            'exportado_em' => date('c'),
            'usuario'      => [
                'nome'   => $usuario['nome'],
                'email'  => $usuario['email'],
                'idioma' => $usuario['idioma'],
                'moeda'  => $usuario['moeda'],
                'tema'   => $usuario['tema'],
            ],
            'contas' => array_map(static function (array $c): array {
                return [
                    'id'            => (int) $c['id'],
                    'nome'          => $c['nome'],
                    'tipo'          => $c['tipo'],
                    'cor'           => $c['cor'],
                    'saldo_inicial' => (float) $c['saldo_inicial'],
                    'conta_padrao'  => (bool) $c['conta_padrao'],
                    'status'        => $c['status'],
                ];
            }, Conta::listarTodasDoUsuario($this->db, $userId)),
            'categorias' => array_map(static function (array $c): array {
                return [
                    'id'            => (int) $c['id'],
                    'parent_id'     => $c['parent_id'] !== null ? (int) $c['parent_id'] : null,
                    'nome'          => $c['nome'],
                    'cor'           => $c['cor'],
                    'tipo'          => $c['tipo'],
                    'limite_gasto'  => $c['limite_gasto'] !== null ? (float) $c['limite_gasto'] : null,
                    'sistema'       => (bool) $c['sistema'],
                    'chave_sistema' => $c['chave_sistema'],
                    'status'        => $c['status'],
                ];
            }, Categoria::listarTodasDoUsuario($this->db, $userId)),
            'lancamentos' => array_map(static function (array $l): array {
                return [
                    'id'                   => (int) $l['id'],
                    'conta_id'             => (int) $l['conta_id'],
                    'categoria_id'         => $l['categoria_id'] !== null ? (int) $l['categoria_id'] : null,
                    'tipo'                 => $l['tipo'],
                    'descricao'            => $l['descricao'],
                    'valor'                => (float) $l['valor'],
                    'data_competencia'     => $l['data_competencia'],
                    'data_pagamento'       => $l['data_pagamento'],
                    'status'               => $l['status'],
                    'recorrente'           => (bool) $l['recorrente'],
                    'transferencia_par_id' => $l['transferencia_par_id'] !== null ? (int) $l['transferencia_par_id'] : null,
                    'observacoes'          => $l['observacoes'],
                ];
            }, Lancamento::listarTodosDoUsuario($this->db, $userId)),
        ];

        $nomeArquivo = 'gestao-financeira-backup-' . date('Y-m-d') . '.json';

        header('Content-Type: application/json; charset=utf-8');
        header('Content-Disposition: attachment; filename="' . $nomeArquivo . '"');
        echo json_encode($backup, JSON_PRETTY_PRINT | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
        exit;
    }

    /**
     * Importa um backup no mesmo formato de exportar(): faz "merge aditivo"
     * (nunca substitui/remove nada existente), gerando novos ids para
     * contas/categorias/lancamentos do usuario logado. Categorias de
     * sistema do arquivo nunca sao duplicadas - sao remapeadas para as
     * categorias de sistema ja existentes do usuario atual. Pares de
     * transferencia so sao religados quando os dois lados do par estao
     * presentes no mesmo arquivo importado.
     */
    public function importar(): void
    {
        if (!Csrf::validar($_POST['_csrf'] ?? null)) {
            Flash::erro(t('flash.sessao_expirada'));
            header('Location: /configuracoes/dados');
            exit;
        }

        if (empty($_FILES['arquivo']) || ($_FILES['arquivo']['error'] ?? UPLOAD_ERR_NO_FILE) === UPLOAD_ERR_NO_FILE) {
            Flash::erro(t('flash.dados_arquivo_obrigatorio'));
            header('Location: /configuracoes/dados');
            exit;
        }

        if ($_FILES['arquivo']['error'] !== UPLOAD_ERR_OK) {
            Flash::erro(t('flash.dados_arquivo_invalido'));
            header('Location: /configuracoes/dados');
            exit;
        }

        $conteudo = file_get_contents($_FILES['arquivo']['tmp_name']);
        if ($conteudo === false || trim($conteudo) === '') {
            Flash::erro(t('flash.dados_arquivo_invalido'));
            header('Location: /configuracoes/dados');
            exit;
        }

        $dados = json_decode($conteudo, true);
        if (json_last_error() !== JSON_ERROR_NONE || !is_array($dados)) {
            Flash::erro(t('flash.dados_json_invalido'));
            header('Location: /configuracoes/dados');
            exit;
        }

        if (!isset($dados['usuario'], $dados['contas'], $dados['categorias'], $dados['lancamentos'])
            || !is_array($dados['usuario'])
            || !is_array($dados['contas'])
            || !is_array($dados['categorias'])
            || !is_array($dados['lancamentos'])
        ) {
            Flash::erro(t('flash.dados_formato_invalido'));
            header('Location: /configuracoes/dados');
            exit;
        }

        try {
            $resultado = $this->importarDados($dados);
        } catch (\Throwable $e) {
            Flash::erro(t('flash.dados_erro_importar'));
            header('Location: /configuracoes/dados');
            exit;
        }

        Flash::sucesso(t('flash.dados_importado_sucesso', [
            'contas'      => $resultado['contas'],
            'categorias'  => $resultado['categorias'],
            'lancamentos' => $resultado['lancamentos'],
        ]));
        header('Location: /configuracoes/dados');
        exit;
    }

    /**
     * Processa o merge aditivo dentro de uma unica transacao (tudo ou
     * nada). Retorna a contagem de itens efetivamente criados.
     */
    private function importarDados(array $dados): array
    {
        $userId = (int) $this->usuario['id'];
        $pdo    = $this->db;

        $pdo->beginTransaction();
        try {
            // 1) Contas: sempre criadas como nao-padrao (evita conflito com
            // a conta padrao atual do usuario) e com o mesmo status do arquivo.
            $contaMap = [];
            $contasImportadas = 0;
            foreach ($dados['contas'] as $c) {
                if (!is_array($c) || !isset($c['nome']) || trim((string) $c['nome']) === '') {
                    continue;
                }

                $tipo = in_array($c['tipo'] ?? null, Conta::TIPOS, true) ? $c['tipo'] : 'corrente';
                $cor  = preg_match('/^#[0-9a-fA-F]{6}$/', (string) ($c['cor'] ?? '')) ? $c['cor'] : '#2563eb';

                $novoId = Conta::criar($pdo, $userId, [
                    'nome'          => (string) $c['nome'],
                    'tipo'          => $tipo,
                    'cor'           => $cor,
                    'saldo_inicial' => (float) ($c['saldo_inicial'] ?? 0),
                    'conta_padrao'  => false,
                ]);

                if (($c['status'] ?? 'ativa') === 'arquivada') {
                    Conta::arquivar($pdo, $userId, $novoId);
                }

                if (isset($c['id'])) {
                    $contaMap[(int) $c['id']] = $novoId;
                }
                $contasImportadas++;
            }

            // 2) Categorias de sistema do arquivo nunca sao recriadas - so
            // mapeadas para a categoria de sistema equivalente do usuario
            // atual (ja existe, criada automaticamente no cadastro/login).
            $categoriaMap = [];
            foreach ($dados['categorias'] as $c) {
                if (!is_array($c) || empty($c['sistema']) || empty($c['chave_sistema']) || !isset($c['id'])) {
                    continue;
                }
                $idSistema = Categoria::idSistema($pdo, $userId, (string) $c['chave_sistema']);
                if ($idSistema !== null) {
                    $categoriaMap[(int) $c['id']] = $idSistema;
                }
            }

            // 3) Categorias de nivel superior (nao-sistema) primeiro...
            $categoriasImportadas = 0;
            foreach ($dados['categorias'] as $c) {
                if (!is_array($c) || !empty($c['sistema']) || !isset($c['nome']) || trim((string) $c['nome']) === '') {
                    continue;
                }
                if (!empty($c['parent_id'])) {
                    continue; // subcategoria, tratada no proximo laco
                }

                $novoId = $this->inserirCategoriaImportada($pdo, $userId, $c, null);
                if (isset($c['id'])) {
                    $categoriaMap[(int) $c['id']] = $novoId;
                }
                $categoriasImportadas++;
            }

            // ...depois subcategorias, remapeando o pai pelo id novo.
            foreach ($dados['categorias'] as $c) {
                if (!is_array($c) || !empty($c['sistema']) || !isset($c['nome']) || trim((string) $c['nome']) === '') {
                    continue;
                }
                if (empty($c['parent_id'])) {
                    continue;
                }

                $paiNovoId = $categoriaMap[(int) $c['parent_id']] ?? null;
                $novoId = $this->inserirCategoriaImportada($pdo, $userId, $c, $paiNovoId);
                if (isset($c['id'])) {
                    $categoriaMap[(int) $c['id']] = $novoId;
                }
                $categoriasImportadas++;
            }

            // 4) Lancamentos: gravados diretamente (valor ja vem assinado do
            // export), pulando qualquer um cuja conta nao pode ser mapeada.
            $lancMap = [];
            $paresPendentes = [];
            $lancamentosImportados = 0;

            $inserirLancamento = $pdo->prepare(
                'INSERT INTO lancamentos (user_id, conta_id, categoria_id, tipo, descricao, valor, data_competencia, data_pagamento, status, recorrente, observacoes)
                 VALUES (:user_id, :conta_id, :categoria_id, :tipo, :descricao, :valor, :data_competencia, :data_pagamento, :status, :recorrente, :observacoes)'
            );

            foreach ($dados['lancamentos'] as $l) {
                if (!is_array($l) || !isset($l['conta_id'], $l['tipo'], $l['descricao'], $l['valor'], $l['data_competencia'])) {
                    continue;
                }

                $contaNovaId = $contaMap[(int) $l['conta_id']] ?? null;
                if ($contaNovaId === null) {
                    continue;
                }

                $categoriaNovaId = null;
                if (isset($l['categoria_id']) && $l['categoria_id'] !== null) {
                    $categoriaNovaId = $categoriaMap[(int) $l['categoria_id']] ?? null;
                }

                $tipo = in_array($l['tipo'], ['receita', 'despesa', 'transferencia', 'ajuste'], true) ? $l['tipo'] : 'despesa';
                $status = in_array($l['status'] ?? 'pago', ['pago', 'pendente'], true) ? $l['status'] : 'pago';

                $inserirLancamento->execute([
                    'user_id'          => $userId,
                    'conta_id'         => $contaNovaId,
                    'categoria_id'     => $categoriaNovaId,
                    'tipo'             => $tipo,
                    'descricao'        => (string) $l['descricao'],
                    'valor'            => (float) $l['valor'],
                    'data_competencia' => (string) $l['data_competencia'],
                    'data_pagamento'   => $l['data_pagamento'] ?? null,
                    'status'           => $status,
                    'recorrente'       => !empty($l['recorrente']) ? 1 : 0,
                    'observacoes'      => $l['observacoes'] ?? null,
                ]);

                $novoId = (int) $pdo->lastInsertId();
                if (isset($l['id'])) {
                    $lancMap[(int) $l['id']] = $novoId;
                }
                if (!empty($l['transferencia_par_id'])) {
                    $paresPendentes[$novoId] = (int) $l['transferencia_par_id'];
                }
                $lancamentosImportados++;
            }

            // 5) Segunda passada: religa pares de transferencia so quando
            // os dois lados do par vieram no mesmo arquivo importado.
            $ligarPar = $pdo->prepare('UPDATE lancamentos SET transferencia_par_id = :par WHERE id = :id AND user_id = :user_id');
            foreach ($paresPendentes as $novoIdOrigem => $parAntigoId) {
                if (isset($lancMap[$parAntigoId])) {
                    $ligarPar->execute([
                        'par'     => $lancMap[$parAntigoId],
                        'id'      => $novoIdOrigem,
                        'user_id' => $userId,
                    ]);
                }
            }

            $pdo->commit();
        } catch (\Throwable $e) {
            $pdo->rollBack();
            throw $e;
        }

        return [
            'contas'      => $contasImportadas,
            'categorias'  => $categoriasImportadas,
            'lancamentos' => $lancamentosImportados,
        ];
    }

    /** Cria uma categoria importada (nao-sistema) e aplica o status original. */
    private function inserirCategoriaImportada(PDO $pdo, int $userId, array $c, ?int $parentId): int
    {
        $tipo   = in_array($c['tipo'] ?? null, Categoria::TIPOS, true) ? $c['tipo'] : 'despesa';
        $cor    = preg_match('/^#[0-9a-fA-F]{6}$/', (string) ($c['cor'] ?? '')) ? $c['cor'] : '#2563eb';
        $limite = isset($c['limite_gasto']) && $c['limite_gasto'] !== null ? (float) $c['limite_gasto'] : null;

        $novoId = Categoria::criar($pdo, $userId, [
            'parent_id'    => $parentId,
            'nome'         => (string) $c['nome'],
            'cor'          => $cor,
            'tipo'         => $tipo,
            'limite_gasto' => $limite,
        ]);

        if (($c['status'] ?? 'ativa') === 'arquivada') {
            Categoria::arquivar($pdo, $userId, $novoId);
        }

        return $novoId;
    }
}
