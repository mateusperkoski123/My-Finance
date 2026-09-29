<?php

use App\Core\Csrf;

$paletaCores = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563', '#ca8a04', '#059669'];
?>
<div class="modal-backdrop" id="modal-nova-categoria" data-modal>
    <div class="modal card">
        <div class="modal__header">
            <h2><?= htmlspecialchars(t('categorias.modal.nova_titulo'), ENT_QUOTES, 'UTF-8') ?></h2>
            <button type="button" class="modal__fechar" data-modal-close aria-label="Fechar">✕</button>
        </div>
        <form method="post" action="/categorias" class="form">
            <?= Csrf::campo() ?>

            <div class="form-group">
                <label for="nova-cat-nome"><?= htmlspecialchars(t('categorias.nome_label'), ENT_QUOTES, 'UTF-8') ?></label>
                <input class="input" type="text" id="nova-cat-nome" name="nome" required>
            </div>

            <div class="form-group">
                <label for="nova-cat-tipo"><?= htmlspecialchars(t('categorias.tipo_label'), ENT_QUOTES, 'UTF-8') ?></label>
                <select class="input" id="nova-cat-tipo" name="tipo">
                    <?php foreach (\App\Models\Categoria::TIPOS as $tipo): ?>
                        <option value="<?= $tipo ?>" <?= $tipo === 'despesa' ? 'selected' : '' ?>><?= htmlspecialchars(t('categorias.tipo.' . $tipo), ENT_QUOTES, 'UTF-8') ?></option>
                    <?php endforeach; ?>
                </select>
            </div>

            <div class="form-group">
                <label><?= htmlspecialchars(t('contas.cor_label'), ENT_QUOTES, 'UTF-8') ?></label>
                <div class="cor-opcoes">
                    <?php foreach ($paletaCores as $i => $cor): ?>
                        <label class="cor-opcao" style="--cor: <?= $cor ?>">
                            <input type="radio" name="cor" value="<?= $cor ?>" <?= $i === 0 ? 'checked' : '' ?>>
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
