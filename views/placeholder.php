<?php
/** @var string $tituloKey */
/** @var string $descricaoKey */
/** @var int $faseNumero */
?>
<div class="page-header">
    <h1><?= htmlspecialchars(t($tituloKey), ENT_QUOTES, 'UTF-8') ?></h1>
</div>

<div class="card placeholder-card">
    <p class="placeholder-emoji">🚧</p>
    <h2><?= htmlspecialchars(t('placeholder.em_construcao'), ENT_QUOTES, 'UTF-8') ?></h2>
    <p class="muted"><?= htmlspecialchars(t($descricaoKey), ENT_QUOTES, 'UTF-8') ?></p>
    <p class="badge badge-neutro">
        <?= htmlspecialchars(t('placeholder.prevista'), ENT_QUOTES, 'UTF-8') ?>
        <?= htmlspecialchars(t('fase.prefixo'), ENT_QUOTES, 'UTF-8') ?> <?= (int) $faseNumero ?>
        <?= htmlspecialchars(t('placeholder.do_projeto'), ENT_QUOTES, 'UTF-8') ?>
    </p>
</div>
