<?php

use App\Core\Csrf;

/** @var array $categorias */
/** @var array $sistema */
/** @var array $categoriasPai (nao usado aqui - reservado p/ Fase 3) */
/** @var bool $abaArquivadas */
/** @var float $limiteTotal */
/** @var array $filtros */
?>
<div class="page-header page-header--acoes">
    <div>
        <h1>🏷️ <?= htmlspecialchars(t('categorias.titulo'), ENT_QUOTES, 'UTF-8') ?></h1>
        <p class="muted"><?= htmlspecialchars(t('categorias.subtitulo'), ENT_QUOTES, 'UTF-8') ?></p>
    </div>
    <button type="button" class="btn btn-primary" data-modal-open="modal-nova-categoria"><?= htmlspecialchars(t('categorias.nova'), ENT_QUOTES, 'UTF-8') ?></button>
</div>

<div class="contas-toolbar">
    <div class="tabs">
        <a href="/categorias" class="tabs__item <?= !$abaArquivadas ? 'is-active' : '' ?>"><?= htmlspecialchars(t('categorias.aba_ativas'), ENT_QUOTES, 'UTF-8') ?></a>
        <a href="/categorias?aba=arquivadas" class="tabs__item <?= $abaArquivadas ? 'is-active' : '' ?>"><?= htmlspecialchars(t('categorias.aba_arquivadas'), ENT_QUOTES, 'UTF-8') ?></a>
    </div>
</div>

<form method="get" action="/categorias" class="card categorias-filtros">
    <?php if ($abaArquivadas): ?><input type="hidden" name="aba" value="arquivadas"><?php endif; ?>
    <input class="input" type="text" name="busca" placeholder="<?= htmlspecialchars(t('categorias.buscar_placeholder'), ENT_QUOTES, 'UTF-8') ?>"
           value="<?= htmlspecialchars($filtros['busca'], ENT_QUOTES, 'UTF-8') ?>">
    <label class="checkbox-linha checkbox-linha--inline">
        <input type="checkbox" name="com_subcategoria" value="1" <?= $filtros['com_subcategoria'] ? 'checked' : '' ?> onchange="this.form.submit()">
        <?= htmlspecialchars(t('categorias.filtro_com_subcategoria'), ENT_QUOTES, 'UTF-8') ?>
    </label>
    <button type="submit" class="btn btn-outline btn-sm">🔎 <?= htmlspecialchars(t('categorias.buscar'), ENT_QUOTES, 'UTF-8') ?></button>
</form>

<?php if (!$categorias && !$sistema): ?>
    <div class="card placeholder-card">
        <p class="muted"><?= htmlspecialchars($abaArquivadas ? t('categorias.nenhuma_arquivada') : t('categorias.nenhuma_ativa'), ENT_QUOTES, 'UTF-8') ?></p>
    </div>
<?php else: ?>
    <div class="card categorias-lista">
        <?php foreach ($categorias as $categoria): ?>
            <details class="categoria-item">
                <summary class="categoria-linha">
                    <span class="categoria-linha__principal">
                        <span class="categoria-dot" style="--cor: <?= htmlspecialchars($categoria['cor'], ENT_QUOTES, 'UTF-8') ?>"></span>
                        <strong><?= htmlspecialchars($categoria['nome'], ENT_QUOTES, 'UTF-8') ?></strong>
                        <?php if ($categoria['subcategorias']): ?>
                            <span class="badge badge-neutro"><?= count($categoria['subcategorias']) ?></span>
                        <?php endif; ?>
                    </span>
                    <span class="categoria-linha__acoes">
                        <?php if (!$abaArquivadas): ?>
                            <button type="button" class="icon-btn" title="<?= htmlspecialchars(t('categorias.add_sub'), ENT_QUOTES, 'UTF-8') ?>" data-modal-open="modal-nova-sub-<?= $categoria['id'] ?>">➕</button>
                            <button type="button" class="icon-btn" title="<?= htmlspecialchars(t('categorias.editar'), ENT_QUOTES, 'UTF-8') ?>" data-modal-open="modal-editar-<?= $categoria['id'] ?>">✏️</button>
                            <form method="post" action="/categorias/<?= $categoria['id'] ?>/arquivar">
                                <?= Csrf::campo() ?>
                                <button type="submit" class="icon-btn" title="<?= htmlspecialchars(t('categorias.arquivar'), ENT_QUOTES, 'UTF-8') ?>">🗄️</button>
                            </form>
                        <?php else: ?>
                            <form method="post" action="/categorias/<?= $categoria['id'] ?>/restaurar">
                                <?= Csrf::campo() ?>
                                <button type="submit" class="icon-btn" title="<?= htmlspecialchars(t('categorias.restaurar'), ENT_QUOTES, 'UTF-8') ?>">↩️</button>
                            </form>
                        <?php endif; ?>
                    </span>
                </summary>

                <?php foreach ($categoria['subcategorias'] as $sub): ?>
                    <div class="categoria-linha categoria-linha--sub">
                        <span class="categoria-linha__principal">
                            <span class="categoria-dot" style="--cor: <?= htmlspecialchars($sub['cor'], ENT_QUOTES, 'UTF-8') ?>"></span>
                            <?= htmlspecialchars($sub['nome'], ENT_QUOTES, 'UTF-8') ?>
                        </span>
                        <span class="categoria-linha__acoes">
                            <?php if (!$abaArquivadas): ?>
                                <button type="button" class="icon-btn" title="<?= htmlspecialchars(t('categorias.editar'), ENT_QUOTES, 'UTF-8') ?>" data-modal-open="modal-editar-<?= $sub['id'] ?>">✏️</button>
                                <form method="post" action="/categorias/<?= $sub['id'] ?>/arquivar">
                                    <?= Csrf::campo() ?>
                                    <button type="submit" class="icon-btn" title="<?= htmlspecialchars(t('categorias.arquivar'), ENT_QUOTES, 'UTF-8') ?>">🗄️</button>
                                </form>
                            <?php else: ?>
                                <form method="post" action="/categorias/<?= $sub['id'] ?>/restaurar">
                                    <?= Csrf::campo() ?>
                                    <button type="submit" class="icon-btn" title="<?= htmlspecialchars(t('categorias.restaurar'), ENT_QUOTES, 'UTF-8') ?>">↩️</button>
                                </form>
                            <?php endif; ?>
                        </span>
                    </div>
                    <?php if (!$abaArquivadas): $alvo = $sub; require __DIR__ . '/_modal_editar.php'; endif; ?>
                <?php endforeach; ?>
            </details>

            <?php if (!$abaArquivadas): ?>
                <?php $alvo = $categoria; require __DIR__ . '/_modal_editar.php'; ?>
                <?php require __DIR__ . '/_modal_nova_sub.php'; ?>
            <?php endif; ?>
        <?php endforeach; ?>

        <?php if ($sistema): ?>
            <div class="categorias-sistema-titulo muted"><?= htmlspecialchars(t('categorias.sistema_titulo'), ENT_QUOTES, 'UTF-8') ?></div>
            <?php foreach ($sistema as $categoria): ?>
                <div class="categoria-linha categoria-linha--sistema">
                    <span class="categoria-linha__principal">
                        <span class="categoria-dot" style="--cor: <?= htmlspecialchars($categoria['cor'], ENT_QUOTES, 'UTF-8') ?>"></span>
                        <?= htmlspecialchars($categoria['nome'], ENT_QUOTES, 'UTF-8') ?>
                        <span class="badge badge-neutro"><?= htmlspecialchars(t('categorias.sistema_badge'), ENT_QUOTES, 'UTF-8') ?></span>
                    </span>
                    <span class="categoria-linha__acoes"></span>
                </div>
            <?php endforeach; ?>
        <?php endif; ?>
    </div>
<?php endif; ?>

<?php require __DIR__ . '/_modal_nova.php'; ?>
