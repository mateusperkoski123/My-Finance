<?php

namespace App\Models;

use PDO;

class User
{
    public static function buscarPorEmail(PDO $pdo, string $email): ?array
    {
        $stmt = $pdo->prepare('SELECT * FROM users WHERE email = :email LIMIT 1');
        $stmt->execute(['email' => $email]);
        $usuario = $stmt->fetch();
        return $usuario ?: null;
    }

    public static function buscarPorId(PDO $pdo, int $id): ?array
    {
        $stmt = $pdo->prepare('SELECT * FROM users WHERE id = :id LIMIT 1');
        $stmt->execute(['id' => $id]);
        $usuario = $stmt->fetch();
        return $usuario ?: null;
    }

    public static function criar(PDO $pdo, string $nome, string $email, string $senha, string $idioma, string $moeda, string $tema): array
    {
        $stmt = $pdo->prepare(
            'INSERT INTO users (nome, email, senha_hash, idioma, moeda, tema)
             VALUES (:nome, :email, :senha_hash, :idioma, :moeda, :tema)'
        );
        $stmt->execute([
            'nome'       => $nome,
            'email'      => $email,
            'senha_hash' => password_hash($senha, PASSWORD_DEFAULT),
            'idioma'     => $idioma,
            'moeda'      => $moeda,
            'tema'       => $tema,
        ]);

        return self::buscarPorId($pdo, (int) $pdo->lastInsertId());
    }

    public static function atualizarPreferencias(PDO $pdo, int $id, string $idioma, string $moeda, string $tema): array
    {
        $stmt = $pdo->prepare(
            'UPDATE users SET idioma = :idioma, moeda = :moeda, tema = :tema WHERE id = :id'
        );
        $stmt->execute([
            'idioma' => $idioma,
            'moeda'  => $moeda,
            'tema'   => $tema,
            'id'     => $id,
        ]);

        return self::buscarPorId($pdo, $id);
    }

    public static function atualizarPerfil(PDO $pdo, int $id, string $nome, string $email): array
    {
        $stmt = $pdo->prepare('UPDATE users SET nome = :nome, email = :email WHERE id = :id');
        $stmt->execute(['nome' => $nome, 'email' => $email, 'id' => $id]);

        return self::buscarPorId($pdo, $id);
    }

    public static function atualizarSenha(PDO $pdo, int $id, string $novaSenha): void
    {
        $stmt = $pdo->prepare('UPDATE users SET senha_hash = :senha_hash WHERE id = :id');
        $stmt->execute([
            'senha_hash' => password_hash($novaSenha, PASSWORD_DEFAULT),
            'id'         => $id,
        ]);
    }

    public static function emailEmUsoPorOutro(PDO $pdo, string $email, int $idAtual): bool
    {
        $stmt = $pdo->prepare('SELECT id FROM users WHERE email = :email AND id != :id LIMIT 1');
        $stmt->execute(['email' => $email, 'id' => $idAtual]);
        return (bool) $stmt->fetch();
    }
}
