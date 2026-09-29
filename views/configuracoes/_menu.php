<?php

/** @var string $aba */

$itensMenu = [
    'preferencia' => ['href' => '/configuracoes', 'label' => t('config.menu.preferencia')],
    'perfil'      => ['href' => '/configuracoes/perfil', 'label' => t('config.menu.perfil')],
    'dados'       => ['href' => '/configuracoes/dados', 'label' => t('config.menu.dados')],
];
?>
<aside class="card settings-menu">
    <?php foreach ($itensMenu as $chave => $item): ?>
        <a href="<?= htmlspecialchars($item['href'], ENT_QUOTES, 'UTF-8') ?>"
           class="settings-menu__item <?= $aba === $chave ? 'is-active' : '' ?>">
            <?= htmlspecialchars($item['label'], ENT_QUOTES, 'UTF-8') ?>
        </a>
    <?php endforeach; ?>
</aside>
