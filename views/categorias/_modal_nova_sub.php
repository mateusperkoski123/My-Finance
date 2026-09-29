<?php

use App\Core\Csrf;

/** @var array $categoria (categoria-pai, vem do foreach em index.php) */
$paletaCores = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563', '#ca8a04', '#059669'];
?>
<div class="modal-backdrop" id="modal-nova-sub-<?= $categoria['id'] ?>" data-modal>
    <div class="modal card">
        <div class="modal__header">
            <h2><?= htmlspecialchars(t('categorias.modal.nova_sub_titulo'), ENT_QUOTES, 'UTF-8') ?> — <?= htmlspecialchars($categoria['nome'], ENT_QUOTES, 'UTF-8') ?></h2>
            <button type="button" class="modal__fechar" data-modal-close aria-label="Fechar">✕</button>
        </div>
        <form method="post" action="/categorias" class="form">
            <?= Csrf::campo() ?>
            <input type="hidden" name="parent_id" value="<?= $categoria['id'] ?>">
            <input type="hidden" name="tipo" value="<?= htmlspecialchars($categoria['tipo'], ENT_QUOTES, 'UTF-8') ?>">

            <div class="form-group">
                <label for="nova-sub-nome-<?= $categoria['id'] ?>"><?= htmlspecialchars(t('categorias.nome_label'), ENT_QUOTES, 'UTF-8') ?></label>
                <input class="input" type="text" id="nova-sub-nome-<?= $categoria['id'] ?>" name="nome" required>
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
