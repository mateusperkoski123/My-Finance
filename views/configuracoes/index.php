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

    <section class="card settings-content">
        <h2><?= htmlspecialchars(t('config.preferencia.titulo'), ENT_QUOTES, 'UTF-8') ?></h2>
        <p class="muted"><?= htmlspecialchars(t('config.preferencia.subtitulo'), ENT_QUOTES, 'UTF-8') ?></p>

        <form method="post" action="/configuracoes/preferencia" class="form">
            <?= Csrf::campo() ?>

            <div class="form-row">
                <div class="form-group">
                    <label for="idioma"><?= htmlspecialchars(t('config.idioma'), ENT_QUOTES, 'UTF-8') ?></label>
                    <select class="input" id="idioma" name="idioma">
                        <?php foreach ($config['idiomas'] as $codigo => $label): ?>
                            <option value="<?= htmlspecialchars($codigo, ENT_QUOTES, 'UTF-8') ?>"
                                <?= $usuarioLogado['idioma'] === $codigo ? 'selected' : '' ?>>
                                <?= htmlspecialchars($label, ENT_QUOTES, 'UTF-8') ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <div class="form-group">
                    <label for="moeda"><?= htmlspecialchars(t('config.moeda'), ENT_QUOTES, 'UTF-8') ?></label>
                    <select class="input" id="moeda" name="moeda">
                        <?php foreach ($config['moedas'] as $codigo => $label): ?>
                            <option value="<?= htmlspecialchars($codigo, ENT_QUOTES, 'UTF-8') ?>"
                                <?= $usuarioLogado['moeda'] === $codigo ? 'selected' : '' ?>>
                                <?= htmlspecialchars($label, ENT_QUOTES, 'UTF-8') ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>

            <div class="form-group">
                <label><?= htmlspecialchars(t('config.tema'), ENT_QUOTES, 'UTF-8') ?></label>
                <div class="tema-opcoes">
                    <?php foreach (array_keys($config['temas']) as $codigo): ?>
                        <label class="tema-opcao tema-opcao--<?= $codigo ?>">
                            <input type="radio" name="tema" value="<?= $codigo ?>"
                                <?= $usuarioLogado['tema'] === $codigo ? 'checked' : '' ?>>
                            <span class="tema-opcao__amostra"></span>
                            <?= htmlspecialchars(t('tema.' . $codigo), ENT_QUOTES, 'UTF-8') ?>
                        </label>
                    <?php endforeach; ?>
                </div>
            </div>

            <button type="submit" class="btn btn-primary">💾 <?= htmlspecialchars(t('config.salvar'), ENT_QUOTES, 'UTF-8') ?></button>
        </form>
    </section>
</div>
