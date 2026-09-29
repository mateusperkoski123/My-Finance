<?php

use App\Core\Csrf;

$paletaCores = ['#2563eb', '#16a34a', '#dc2626', '#d97706', '#7c3aed', '#0891b2', '#db2777', '#4b5563'];
?>
<div class="modal-backdrop" id="modal-nova-conta" data-modal>
    <div class="modal card">
        <div class="modal__header">
            <h2><?= htmlspecialchars(t('contas.modal.nova_titulo'), ENT_QUOTES, 'UTF-8') ?></h2>
            <button type="button" class="modal__fechar" data-modal-close aria-label="Fechar">✕</button>
        </div>
        <form method="post" action="/contas" class="form">
            <?= Csrf::campo() ?>

            <div class="form-group">
                <label for="nova-nome"><?= htmlspecialchars(t('contas.nome_label'), ENT_QUOTES, 'UTF-8') ?></label>
                <input class="input" type="text" id="nova-nome" name="nome" required>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="nova-tipo"><?= htmlspecialchars(t('contas.tipo_label'), ENT_QUOTES, 'UTF-8') ?></label>
                    <select class="input" id="nova-tipo" name="tipo">
                        <?php foreach (\App\Models\Conta::TIPOS as $tipo): ?>
                            <option value="<?= $tipo ?>"><?= htmlspecialchars(t('contas.tipo.' . $tipo), ENT_QUOTES, 'UTF-8') ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="form-group">
                    <label for="nova-saldo"><?= htmlspecialchars(t('contas.saldo_inicial_label'), ENT_QUOTES, 'UTF-8') ?></label>
                    <input class="input" type="text" id="nova-saldo" name="saldo_inicial" value="0" data-money
                           inputmode="<?= moeda_decimais() > 0 ? 'decimal' : 'numeric' ?>">
                </div>
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

            <label class="checkbox-linha">
                <input type="checkbox" name="conta_padrao" value="1">
                <?= htmlspecialchars(t('contas.conta_padrao'), ENT_QUOTES, 'UTF-8') ?>
            </label>

            <div class="modal__acoes">
                <button type="button" class="btn btn-outline" data-modal-close><?= htmlspecialchars(t('contas.cancelar'), ENT_QUOTES, 'UTF-8') ?></button>
                <button type="submit" class="btn btn-primary"><?= htmlspecialchars(t('contas.salvar'), ENT_QUOTES, 'UTF-8') ?></button>
            </div>
        </form>
    </div>
</div>
