<?php

namespace App\Models;

use PDO;

class Conta
{
    public const TIPOS = ['corrente', 'poupanca', 'carteira', 'investimento', 'outra'];

    /**
     * Lista as contas do usuario com saldo atual ja calculado
     * (saldo_inicial + soma dos lancamentos pagos daquela conta).
     */
    public static function listar(PDO $pdo, int $userId, string $status = 'ativa'): array
    {
        $stmt = $pdo->prepare(
            'SELECT c.*,
                    c.saldo_inicial + COALESCE((
                        SELECT SUM(l.valor) FROM lancamentos l
                        WHERE l.conta_id = c.id AND l.status = "pago"
                    ), 0) AS saldo_atual
             FROM contas c
             WHERE c.user_id = :user_id AND c.status = :status
             ORDER BY c.conta_padrao DESC, c.nome ASC'
        );
        $stmt->execute(['user_id' => $userId, 'status' => $status]);
        return $stmt->fetchAll();
    }

    public static function buscarPorId(PDO $pdo, int $userId, int $id): ?array
    {
        $stmt = $pdo->prepare(
            'SELECT c.*,
                    c.saldo_inicial + COALESCE((
                        SELECT SUM(l.valor) FROM lancamentos l
                        WHERE l.conta_id = c.id AND l.status = "pago"
                    ), 0) AS saldo_atual
             FROM contas c
             WHERE c.id = :id AND c.user_id = :user_id
             LIMIT 1'
        );
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
        $conta = $stmt->fetch();
        return $conta ?: null;
    }

    /**
     * Todas as contas do usuario (qualquer status), sem calculo de saldo
     * atual. Usado pela exportacao de backup (Configuracoes > Dados).
     */
    public static function listarTodasDoUsuario(PDO $pdo, int $userId): array
    {
        $stmt = $pdo->prepare('SELECT * FROM contas WHERE user_id = :user_id ORDER BY id ASC');
        $stmt->execute(['user_id' => $userId]);
        return $stmt->fetchAll();
    }

    public static function contarAtivas(PDO $pdo, int $userId): int
    {
        $stmt = $pdo->prepare("SELECT COUNT(*) FROM contas WHERE user_id = :user_id AND status = 'ativa'");
        $stmt->execute(['user_id' => $userId]);
        return (int) $stmt->fetchColumn();
    }

    public static function saldoTotal(PDO $pdo, int $userId): float
    {
        $stmt = $pdo->prepare(
            'SELECT COALESCE(SUM(
                c.saldo_inicial + COALESCE((
                    SELECT SUM(l.valor) FROM lancamentos l
                    WHERE l.conta_id = c.id AND l.status = "pago"
                ), 0)
             ), 0)
             FROM contas c
             WHERE c.user_id = :user_id AND c.status = "ativa"'
        );
        $stmt->execute(['user_id' => $userId]);
        return (float) $stmt->fetchColumn();
    }

    public static function criar(PDO $pdo, int $userId, array $dados): int
    {
        if (!empty($dados['conta_padrao'])) {
            self::limparPadrao($pdo, $userId);
        }

        $stmt = $pdo->prepare(
            'INSERT INTO contas (user_id, nome, tipo, cor, saldo_inicial, conta_padrao)
             VALUES (:user_id, :nome, :tipo, :cor, :saldo_inicial, :conta_padrao)'
        );
        $stmt->execute([
            'user_id'       => $userId,
            'nome'          => $dados['nome'],
            'tipo'          => $dados['tipo'],
            'cor'           => $dados['cor'],
            'saldo_inicial' => $dados['saldo_inicial'],
            'conta_padrao'  => !empty($dados['conta_padrao']) ? 1 : 0,
        ]);

        return (int) $pdo->lastInsertId();
    }

    public static function atualizar(PDO $pdo, int $userId, int $id, array $dados): void
    {
        if (!empty($dados['conta_padrao'])) {
            self::limparPadrao($pdo, $userId);
        }

        $stmt = $pdo->prepare(
            'UPDATE contas
             SET nome = :nome, tipo = :tipo, cor = :cor, saldo_inicial = :saldo_inicial, conta_padrao = :conta_padrao
             WHERE id = :id AND user_id = :user_id'
        );
        $stmt->execute([
            'nome'          => $dados['nome'],
            'tipo'          => $dados['tipo'],
            'cor'           => $dados['cor'],
            'saldo_inicial' => $dados['saldo_inicial'],
            'conta_padrao'  => !empty($dados['conta_padrao']) ? 1 : 0,
            'id'            => $id,
            'user_id'       => $userId,
        ]);
    }

    public static function arquivar(PDO $pdo, int $userId, int $id): void
    {
        $stmt = $pdo->prepare("UPDATE contas SET status = 'arquivada', conta_padrao = 0 WHERE id = :id AND user_id = :user_id");
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
    }

    public static function restaurar(PDO $pdo, int $userId, int $id): void
    {
        $stmt = $pdo->prepare("UPDATE contas SET status = 'ativa' WHERE id = :id AND user_id = :user_id");
        $stmt->execute(['id' => $id, 'user_id' => $userId]);
    }

    private static function limparPadrao(PDO $pdo, int $userId): void
    {
        $stmt = $pdo->prepare('UPDATE contas SET conta_padrao = 0 WHERE user_id = :user_id');
        $stmt->execute(['user_id' => $userId]);
    }
}
