<?php

namespace App\Core;

use PDO;
use PDOException;

/**
 * Conexao PDO unica (singleton) com o MySQL/MariaDB.
 */
class Database
{
    private static ?PDO $instance = null;

    public static function connect(array $dbConfig): PDO
    {
        if (self::$instance !== null) {
            return self::$instance;
        }

        self::garantirBancoExiste($dbConfig);

        $dsn = sprintf(
            'mysql:host=%s;port=%d;dbname=%s;charset=%s',
            $dbConfig['host'],
            $dbConfig['port'],
            $dbConfig['nome'],
            $dbConfig['charset'] ?? 'utf8mb4'
        );

        self::$instance = new PDO($dsn, $dbConfig['user'], $dbConfig['pass'], [
            PDO::ATTR_ERRMODE            => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES   => false,
        ]);

        return self::$instance;
    }

    /**
     * Em ambiente local (XAMPP) o banco pode ainda nao existir na primeira
     * execucao; cria automaticamente para simplificar o setup.
     */
    private static function garantirBancoExiste(array $dbConfig): void
    {
        $dsn = sprintf(
            'mysql:host=%s;port=%d;charset=%s',
            $dbConfig['host'],
            $dbConfig['port'],
            $dbConfig['charset'] ?? 'utf8mb4'
        );

        try {
            $pdo = new PDO($dsn, $dbConfig['user'], $dbConfig['pass'], [
                PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            ]);
            $nome = $dbConfig['nome'];
            $charset = $dbConfig['charset'] ?? 'utf8mb4';
            $pdo->exec("CREATE DATABASE IF NOT EXISTS `{$nome}` CHARACTER SET {$charset} COLLATE {$charset}_unicode_ci");
        } catch (PDOException $e) {
            // Se falhar aqui, a conexao principal abaixo vai lancar um erro
            // mais claro (credenciais invalidas, servidor fora do ar, etc.).
        }
    }
}
