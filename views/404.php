<?php

use App\Core\I18n;

$config = require __DIR__ . '/../config/config.php';
?>
<!doctype html>
<html lang="<?= htmlspecialchars(I18n::idioma(), ENT_QUOTES, 'UTF-8') ?>" data-tema="<?= htmlspecialchars($_COOKIE['gf_tema'] ?? $config['tema_padrao'], ENT_QUOTES, 'UTF-8') ?>">
<head>
    <meta charset="utf-8">
    <title><?= htmlspecialchars(t('erro404.titulo'), ENT_QUOTES, 'UTF-8') ?></title>
    <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="auth-body">
<div class="auth-wrapper">
    <div class="card auth-card" style="text-align:center">
        <h1>404</h1>
        <p class="muted"><?= htmlspecialchars(t('erro404.titulo'), ENT_QUOTES, 'UTF-8') ?></p>
        <a class="btn btn-primary" href="/"><?= htmlspecialchars(t('erro404.voltar'), ENT_QUOTES, 'UTF-8') ?></a>
    </div>
</div>
</body>
</html>
