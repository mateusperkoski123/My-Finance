<?php

namespace App\Models;

use PDO;

class Categoria
{
    public const TIPOS = ['receita', 'despesa', 'ambas'];

    /** Chaves das categorias de sistema, criadas automaticamente no cadastro. */
    public const SISTEMA = [
        'ajuste_saldo'        => ['nome' => 'Ajuste de Saldo', 'cor' => '#6b7280', 'tipo' => 'ambas'],
        'transferencia_bancaria' => ['nome' => 'Transferência Bancária', 'cor' => '#0891b2', 'tipo' => 'ambas'],
    ];

    /**
     * Cria (se ainda nao existirem) as categorias de sistema do usuario.
     * Chamado uma vez no cadastro; seguro rodar de novo (idempotente via
     * INSERT IGNORE + indice unico em (user_id, chave_sistema)).
     */
    public static function criarCategoriasSistema(PDO $pdo, int $userId): void
    {
        $stmt = $pdo->prepare(
            'INSERT IGNORE INTO categorias (user_id, nome, cor, tipo, sistema, chave_sistema)
             VALUES (:user_id, :nome, :cor, :tipo, 1, :chave)'
        );
        foreach (self::SISTEMA as $chave => $dados) {
            $stmt->execute([
                'user_id' => $userId,
                'nome'    => $dados['nome'],
                'cor'     => $dados['cor'],
                'tipo'    => $dados['tipo'],
                'chave'   => $chave,
            ]);
        }
    }

    public static function idSistema(PDO $pdo, int $userId, string $chave): ?int
    {
        $stmt = $pdo->prepare('SELECT id FROM categorias WHERE user_id = :user_id AND chave_sistema = :chave LIMIT 1');
        $stmt->execute(['user_id' => $userId, 'chave' => $chave]);
        $id = $stmt->fetchColumn();
        return $id !== false ? (int) $id : null;
    }

    /**
     * Categorias de nivel superior (parent_id nulo) com suas subcategorias
     * aninhadas em 'subcategorias', ja aplicando busca/filtros. Categorias
     * de sistema entram numa chave separada ('sistema') pois tem UI propria
     * (somente leitura).
     */
    public static function listarComSubcategorias(PDO $pdo, int $userId, string $status, array $filtros = []): array
    {
        $condicoesTopo = ['user_id = :user_id', 'status = :status', 'parent_id IS NULL', 'sistema = 0'];
        $params = ['user_id' => $userId, 'status' => $status];

        if (!empty($filtros['busca'])) {
            $condicoesTopo[] = 'nome LIKE :busca';
            $params['busca'] = '%' . $filtros['busca'] . '%';
        }
        if (!empty($filtros['com_limite'])) {
            $condicoesTopo[] = 'limite_gasto IS NOT NULL';
        }

        $sql = 'SELECT * FROM categorias WHERE ' . implode(' AND ', $condicoesTopo) . ' ORDER BY nome ASC';
        $stmt = $pdo->prepare($sql);
        $stmt->execute($params);
        $topo = $stmt->fetchAll();

        if (!$topo) {
            return [];
        }

        $ids = array_column($topo, 'id');
        $placeholders = implode(',', array_fill(0, count($ids), '?'));
        $stmtSub = $pdo->prepare(
            "SELECT * FROM categorias WHERE parent_id IN ($placeholders) AND status = ? ORDER BY nome ASC"
        );
        $stmtSub->execute([...$ids, $status]);
        $subs = $stmtSub->fetchAll();

        $porPai = [];
        foreach ($subs as $sub) {
            $porPai[$sub['parent_id']][] = $sub;
        }

        foreach ($topo as &$categoria) {
            $categoria['subcategorias'] = $porPai[$categoria['id']] ?? [];
        }
        unset($categoria);

        if (!empty($filtros['com_subcategoria'])) {
            $topo = array_values(array_filter($topo, fn ($c) => count($c['subcategorias']) > 0));
        }

        return $topo;
    }

    /**
     * Todas as categorias do usuario (qualquer status, inclusive de
     * sistema). Usado pela exportacao de backup (Configuracoes > Dados).
     */
    public static function listarTodasDoUsuario(PDO $pdo, int $userId): array
    {
        $stmt = $pdo->prepare('SELECT * FROM categorias WHERE user_id = :user_id ORDER BY id ASC');
        $stmt->execute(['user_id' => $userId]);
        return $stmt->fetchAll();
    }

    public static function listarSistema(PDO $pdo, int $userId, string $status = 'ativa'): array
    {
        $stmt = $pdo->prepare('SELECT * FROM categorias WHERE user_id = :user_id AND sistema = 1 AND status = :status ORDER BY nome ASC');
        $stmt->execute(['user_id' => $userId, 'status' => $status]);
        return $stmt->fetchAll();
    }

    public static function buscarPorId(PDO $pdo, int $userId, int $id): ?array
    {
        $stmt = $pdo->prepare('SELECT * FROM categorias WHERE id = :id AND user_id = :user_id LIMIT 1');
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
        $categoria = $stmt->fetch();
        return $categoria ?: null;
    }

    /** Lista simples (sem hierarquia) de categorias de nivel superior ativas, para popular selects de "categoria pai". */
    public static function listarTopoAtivas(PDO $pdo, int $userId): array
    {
        $stmt = $pdo->prepare("SELECT id, nome FROM categorias WHERE user_id = :user_id AND status = 'ativa' AND parent_id IS NULL AND sistema = 0 ORDER BY nome ASC");
        $stmt->execute(['user_id' => $userId]);
        return $stmt->fetchAll();
    }

    public static function limiteTotal(PDO $pdo, int $userId): float
    {
        $stmt = $pdo->prepare("SELECT COALESCE(SUM(limite_gasto), 0) FROM categorias WHERE user_id = :user_id AND status = 'ativa' AND limite_gasto IS NOT NULL");
        $stmt->execute(['user_id' => $userId]);
        return (float) $stmt->fetchColumn();
    }

    public static function criar(PDO $pdo, int $userId, array $dados): int
    {
        $stmt = $pdo->prepare(
            'INSERT INTO categorias (user_id, parent_id, nome, cor, tipo, limite_gasto)
             VALUES (:user_id, :parent_id, :nome, :cor, :tipo, :limite_gasto)'
        );
        $stmt->execute([
            'user_id'      => $userId,
            'parent_id'    => $dados['parent_id'] ?: null,
            'nome'         => $dados['nome'],
            'cor'          => $dados['cor'],
            'tipo'         => $dados['tipo'],
            'limite_gasto' => $dados['limite_gasto'],
        ]);

        return (int) $pdo->lastInsertId();
    }

    public static function atualizar(PDO $pdo, int $userId, int $id, array $dados): void
    {
        $stmt = $pdo->prepare(
            'UPDATE categorias
             SET nome = :nome, cor = :cor, tipo = :tipo, limite_gasto = :limite_gasto
             WHERE id = :id AND user_id = :user_id AND sistema = 0'
        );
        $stmt->execute([
            'nome'         => $dados['nome'],
            'cor'          => $dados['cor'],
            'tipo'         => $dados['tipo'],
            'limite_gasto' => $dados['limite_gasto'],
            'id'           => $id,
            'user_id'      => $userId,
        ]);
    }

    /** Arquiva a categoria e, se for de nivel superior, suas subcategorias junto. */
    public static function arquivar(PDO $pdo, int $userId, int $id): void
    {
        $stmt = $pdo->prepare("UPDATE categorias SET status = 'arquivada' WHERE id = :id AND user_id = :user_id AND sistema = 0");
        $stmt->execute(['id' => $id, 'user_id' => $userId]);

        $stmt = $pdo->prepare("UPDATE categorias SET status = 'arquivada' WHERE parent_id = :id AND user_id = :user_id");
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
    }

    public static function restaurar(PDO $pdo, int $userId, int $id): void
    {
        $stmt = $pdo->prepare("UPDATE categorias SET status = 'ativa' WHERE id = :id AND user_id = :user_id AND sistema = 0");
        $stmt->execute(['id' => $id, 'user_id' => $userId]);

        $stmt = $pdo->prepare("UPDATE categorias SET status = 'ativa' WHERE parent_id = :id AND user_id = :user_id");
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
    }
}
