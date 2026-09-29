<?php

use App\Core\Csrf;
use App\Core\I18n;

/** @var string|null $erro */
/** @var array $valores */
$config = require __DIR__ . '/../../config/config.php';
?>
<!doctype html>
<html lang="<?= htmlspecialchars(I18n::idioma(), ENT_QUOTES, 'UTF-8') ?>" data-tema="<?= htmlspecialchars($_COOKIE['gf_tema'] ?? $config['tema_padrao'], ENT_QUOTES, 'UTF-8') ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= htmlspecialchars(t('auth.titulo_cadastro'), ENT_QUOTES, 'UTF-8') ?> — <?= htmlspecialchars($config['app']['nome'], ENT_QUOTES, 'UTF-8') ?></title>
    <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body class="auth-body">
<div class="auth-wrapper">
    <div class="card auth-card">
        <h1 class="auth-title">💰 <?= htmlspecialchars($config['app']['nome'], ENT_QUOTES, 'UTF-8') ?></h1>
        <p class="muted"><?= htmlspecialchars(t('auth.cadastro.subtitulo'), ENT_QUOTES, 'UTF-8') ?></p>

        <?php if ($erro): ?>
            <div class="alert alert-erro"><?= htmlspecialchars($erro, ENT_QUOTES, 'UTF-8') ?></div>
        <?php endif; ?>

        <form method="post" action="/cadastro" class="form">
            <?= Csrf::campo() ?>
            <div class="form-group">
                <label for="nome"><?= htmlspecialchars(t('auth.nome'), ENT_QUOTES, 'UTF-8') ?></label>
                <input class="input" type="text" id="nome" name="nome" required autofocus
                       value="<?= htmlspecialchars($valores['nome'] ?? '', ENT_QUOTES, 'UTF-8') ?>">
            </div>
            <div class="form-group">
                <label for="email"><?= htmlspecialchars(t('auth.email'), ENT_QUOTES, 'UTF-8') ?></label>
                <input class="input" type="email" id="email" name="email" required
                       value="<?= htmlspecialchars($valores['email'] ?? '', ENT_QUOTES, 'UTF-8') ?>">
            </div>
            <div class="form-group">
                <label for="senha"><?= htmlspecialchars(t('auth.senha'), ENT_QUOTES, 'UTF-8') ?></label>
                <input class="input" type="password" id="senha" name="senha" required minlength="6">
            </div>
            <div class="form-group">
                <label for="confirmar_senha"><?= htmlspecialchars(t('auth.confirmar_senha'), ENT_QUOTES, 'UTF-8') ?></label>
                <input class="input" type="password" id="confirmar_senha" name="confirmar_senha" required minlength="6">
            </div>
            <button type="submit" class="btn btn-primary btn-block"><?= htmlspecialchars(t('auth.criar_conta'), ENT_QUOTES, 'UTF-8') ?></button>
        </form>

        <p class="auth-footer"><?= htmlspecialchars(t('auth.ja_tem_conta'), ENT_QUOTES, 'UTF-8') ?> <a href="/login"><?= htmlspecialchars(t('auth.entrar'), ENT_QUOTES, 'UTF-8') ?></a></p>
    </div>
</div>
</body>
</html>
