<?php

use App\Core\Csrf;

/** @var array $alvo (categoria ou subcategoria sendo editada) */
$paletaCores = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563', '#ca8a04', '#059669'];
?>
<div class="modal-backdrop" id="modal-editar-<?= $alvo['id'] ?>" data-modal>
    <div class="modal card">
        <div class="modal__header">
            <h2><?= htmlspecialchars(t('categorias.modal.editar_titulo'), ENT_QUOTES, 'UTF-8') ?></h2>
            <button type="button" class="modal__fechar" data-modal-close aria-label="Fechar">✕</button>
        </div>
        <form method="post" action="/categorias/<?= $alvo['id'] ?>/editar" class="form">
            <?= Csrf::campo() ?>
            <?php if ($alvo['parent_id']): ?>
                <input type="hidden" name="parent_id" value="<?= $alvo['parent_id'] ?>">
            <?php endif; ?>

            <div class="form-group">
                <label for="editar-cat-nome-<?= $alvo['id'] ?>"><?= htmlspecialchars(t('categorias.nome_label'), ENT_QUOTES, 'UTF-8') ?></label>
                <input class="input" type="text" id="editar-cat-nome-<?= $alvo['id'] ?>" name="nome" required
                       value="<?= htmlspecialchars($alvo['nome'], ENT_QUOTES, 'UTF-8') ?>">
            </div>

            <?php if (!$alvo['parent_id']): ?>
                <div class="form-group">
                    <label for="editar-cat-tipo-<?= $alvo['id'] ?>"><?= htmlspecialchars(t('categorias.tipo_label'), ENT_QUOTES, 'UTF-8') ?></label>
                    <select class="input" id="editar-cat-tipo-<?= $alvo['id'] ?>" name="tipo">
                        <?php foreach (\App\Models\Categoria::TIPOS as $tipo): ?>
                            <option value="<?= $tipo ?>" <?= $alvo['tipo'] === $tipo ? 'selected' : '' ?>><?= htmlspecialchars(t('categorias.tipo.' . $tipo), ENT_QUOTES, 'UTF-8') ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
            <?php else: ?>
                <input type="hidden" name="tipo" value="<?= htmlspecialchars($alvo['tipo'], ENT_QUOTES, 'UTF-8') ?>">
            <?php endif; ?>

            <div class="form-group">
                <label><?= htmlspecialchars(t('contas.cor_label'), ENT_QUOTES, 'UTF-8') ?></label>
                <div class="cor-opcoes">
                    <?php foreach ($paletaCores as $cor): ?>
                        <label class="cor-opcao" style="--cor: <?= $cor ?>">
                            <input type="radio" name="cor" value="<?= $cor ?>" <?= strcasecmp($alvo['cor'], $cor) === 0 ? 'checked' : '' ?>>
                        </label>
                    <?php endforeach; ?>
                </div>
            </div>

            <div class="modal__acoes">
                <button type="button" class="btn btn-outline" data-modal-close><?= htmlspecialchars(t('contas.cancelar'), ENT_QUOTES, 'UTF-8') ?></button>
                <button type="submit" class="btn btn-primary"><?= htmlspecialchars(t('contas.salvar'), ENT_QUOTES, 'UTF-8') ?></button>
            </div>
        </form>
    </div>
</div>
