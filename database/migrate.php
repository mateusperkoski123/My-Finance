<?php

/**
 * Runner simples de migrations.
 * Uso (a partir da raiz do projeto): php database/migrate.php
 *
 * Le os arquivos .sql de database/migrations em ordem alfabetica/numerica,
 * executa os que ainda nao foram aplicados e registra cada um na tabela
 * `migrations`. Seguro rodar varias vezes (idempotente).
 */

require __DIR__ . '/../src/Core/Database.php';

use App\Core\Database;

$config = require __DIR__ . '/../config/config.php';
$pdo = Database::connect($config['db']);

$pdo->exec(
    'CREATE TABLE IF NOT EXISTS migrations (
        id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
        arquivo VARCHAR(190) NOT NULL UNIQUE,
        aplicada_em DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4'
);

$jaAplicadas = $pdo->query('SELECT arquivo FROM migrations')->fetchAll(PDO::FETCH_COLUMN);

$diretorio = __DIR__ . '/migrations';
$arquivos = glob($diretorio . '/*.sql');
sort($arquivos);

$executadas = 0;
foreach ($arquivos as $caminho) {
    $nome = basename($caminho);
    if (in_array($nome, $jaAplicadas, true)) {
        continue;
    }

    $sql = file_get_contents($caminho);
    echo "Aplicando {$nome}... ";

    // DDL (CREATE/ALTER TABLE) causa commit implicito no MySQL/MariaDB, entao
    // nao ha transacao real a proteger aqui - so registramos o erro se houver.
    try {
        foreach (array_filter(array_map('trim', explode(';', $sql))) as $statement) {
            $pdo->exec($statement);
        }
        $stmt = $pdo->prepare('INSERT INTO migrations (arquivo) VALUES (:arquivo)');
        $stmt->execute(['arquivo' => $nome]);
        echo "OK\n";
        $executadas++;
    } catch (Throwable $e) {
        echo "FALHOU\n";
        fwrite(STDERR, $e->getMessage() . "\n");
        exit(1);
    }
}

echo $executadas > 0
    ? "{$executadas} migration(s) aplicada(s) com sucesso.\n"
    : "Nenhuma migration pendente. Banco ja esta atualizado.\n";
