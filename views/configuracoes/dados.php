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
            <h2><?= htmlspecialchars(t('config.dados.exportar_titulo'), ENT_QUOTES, 'UTF-8') ?></h2>
            <p class="muted"><?= htmlspecialchars(t('config.dados.exportar_texto'), ENT_QUOTES, 'UTF-8') ?></p>

            <a href="/configuracoes/exportar" class="btn btn-primary"><?= htmlspecialchars(t('config.dados.exportar_botao'), ENT_QUOTES, 'UTF-8') ?></a>
        </div>

        <div class="card">
            <h2><?= htmlspecialchars(t('config.dados.importar_titulo'), ENT_QUOTES, 'UTF-8') ?></h2>
            <p class="muted"><?= htmlspecialchars(t('config.dados.importar_texto'), ENT_QUOTES, 'UTF-8') ?></p>

            <div class="alert alert-aviso"><?= htmlspecialchars(t('config.dados.importar_aviso'), ENT_QUOTES, 'UTF-8') ?></div>

            <form method="post" action="/configuracoes/importar" enctype="multipart/form-data" class="form">
                <?= Csrf::campo() ?>

                <div class="form-group">
                    <label for="arquivo"><?= htmlspecialchars(t('config.dados.importar_arquivo_label'), ENT_QUOTES, 'UTF-8') ?></label>
                    <input class="input" type="file" id="arquivo" name="arquivo" accept="application/json,.json" required>
                </div>

                <button type="submit" class="btn btn-primary"><?= htmlspecialchars(t('config.dados.importar_botao'), ENT_QUOTES, 'UTF-8') ?></button>
            </form>
        </div>
    </section>
</div>
