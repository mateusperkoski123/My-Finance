<?php

use App\Core\Csrf;

/** @var array $config */
/** @var array|null $usuarioLogado */
?>
<div class="page-header">
    <h1>⚙️ <?= htmlspecialchars(t('config.titulo'), ENT_QUOTES, 'UTF-8') ?></h1>
</div>

<div class="settings-layout">
    <?php require __DIR__ . '/_menu.php'; ?>

    <section class="settings-content">
        <div class="card" style="margin-bottom: 20px;">
            <h2><?= htmlspecialchars(t('config.perfil.titulo'), ENT_QUOTES, 'UTF-8') ?></h2>
            <p class="muted"><?= htmlspecialchars(t('config.perfil.subtitulo'), ENT_QUOTES, 'UTF-8') ?></p>

            <form method="post" action="/configuracoes/perfil" class="form">
                <?= Csrf::campo() ?>

                <div class="form-row">
                    <div class="form-group">
                        <label for="nome"><?= htmlspecialchars(t('config.perfil.nome_label'), ENT_QUOTES, 'UTF-8') ?></label>
                        <input class="input" type="text" id="nome" name="nome" maxlength="120"
                               value="<?= htmlspecialchars($usuarioLogado['nome'], ENT_QUOTES, 'UTF-8') ?>" required>
                    </div>

                    <div class="form-group">
                        <label for="email"><?= htmlspecialchars(t('config.perfil.email_label'), ENT_QUOTES, 'UTF-8') ?></label>
                        <input class="input" type="email" id="email" name="email" maxlength="190"
                               value="<?= htmlspecialchars($usuarioLogado['email'], ENT_QUOTES, 'UTF-8') ?>" required>
                    </div>
                </div>

                <button type="submit" class="btn btn-primary">💾 <?= htmlspecialchars(t('config.perfil.salvar'), ENT_QUOTES, 'UTF-8') ?></button>
            </form>
        </div>

        <div class="card">
            <h2><?= htmlspecialchars(t('config.perfil.senha_titulo'), ENT_QUOTES, 'UTF-8') ?></h2>
            <p class="muted"><?= htmlspecialchars(t('config.perfil.senha_subtitulo'), ENT_QUOTES, 'UTF-8') ?></p>

            <form method="post" action="/configuracoes/senha" class="form">
                <?= Csrf::campo() ?>

                <div class="form-group">
                    <label for="senha_atual"><?= htmlspecialchars(t('config.perfil.senha_atual_label'), ENT_QUOTES, 'UTF-8') ?></label>
                    <input class="input" type="password" id="senha_atual" name="senha_atual" autocomplete="current-password" required>
                </div>

                <div class="form-row">
                    <div class="form-group">
                        <label for="senha_nova"><?= htmlspecialchars(t('config.perfil.senha_nova_label'), ENT_QUOTES, 'UTF-8') ?></label>
                        <input class="input" type="password" id="senha_nova" name="senha_nova" minlength="6" autocomplete="new-password" required>
                    </div>

                    <div class="form-group">
                        <label for="senha_confirmar"><?= htmlspecialchars(t('config.perfil.senha_confirmar_label'), ENT_QUOTES, 'UTF-8') ?></label>
                        <input class="input" type="password" id="senha_confirmar" name="senha_confirmar" minlength="6" autocomplete="new-password" required>
                    </div>
                </div>

                <button type="submit" class="btn btn-primary">🔒 <?= htmlspecialchars(t('config.perfil.senha_salvar'), ENT_QUOTES, 'UTF-8') ?></button>
            </form>
        </div>
    </section>
</div>
