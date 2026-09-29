<?php

use App\Core\Csrf;

/** @var array $contas */
?>
<div class="modal-backdrop" id="modal-transferir" data-modal>
    <div class="modal card">
        <div class="modal__header">
            <h2><?= htmlspecialchars(t('contas.modal.transferir_titulo'), ENT_QUOTES, 'UTF-8') ?></h2>
            <button type="button" class="modal__fechar" data-modal-close aria-label="Fechar">✕</button>
        </div>
        <form method="post" action="/contas/transferir" class="form">
            <?= Csrf::campo() ?>
            <input type="hidden" name="conta_origem_id" id="transferir-origem-hidden" value="">

            <div class="form-row">
                <div class="form-group">
                    <label for="transferir-origem"><?= htmlspecialchars(t('contas.transferir.origem_label'), ENT_QUOTES, 'UTF-8') ?></label>
                    <select class="input" id="transferir-origem" name="conta_origem_id" required onchange="
                        document.getElementById('transferir-origem-hidden').value = this.value;
                        atualizarOpcoesDestinoPhp(this.value);
                    ">
                        <?php foreach ($contas as $c): ?>
                            <option value="<?= $c['id'] ?>"><?= htmlspecialchars($c['nome'], ENT_QUOTES, 'UTF-8') ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="form-group">
                    <label for="transferir-destino"><?= htmlspecialchars(t('contas.transferir.destino_label'), ENT_QUOTES, 'UTF-8') ?></label>
                    <select class="input" id="transferir-destino" name="conta_destino_id" required>
                        <?php foreach ($contas as $c): ?>
                            <option value="<?= $c['id'] ?>"><?= htmlspecialchars($c['nome'], ENT_QUOTES, 'UTF-8') ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>

            <div class="form-row">
                <div class="form-group">
                    <label for="transferir-valor"><?= htmlspecialchars(t('contas.transferir.valor_label'), ENT_QUOTES, 'UTF-8') ?></label>
                    <input class="input" type="text" id="transferir-valor" name="valor" data-money
                           inputmode="<?= moeda_decimais() > 0 ? 'decimal' : 'numeric' ?>" required>
                </div>
                <div class="form-group">
                    <label for="transferir-data"><?= htmlspecialchars(t('contas.transferir.data_label'), ENT_QUOTES, 'UTF-8') ?></label>
                    <input class="input" type="date" id="transferir-data" name="data" value="<?= date('Y-m-d') ?>" required>
                </div>
            </div>

            <div class="form-group">
                <label for="transferir-descricao"><?= htmlspecialchars(t('contas.transferir.descricao_label'), ENT_QUOTES, 'UTF-8') ?></label>
                <input class="input" type="text" id="transferir-descricao" name="descricao">
            </div>

            <div class="modal__acoes">
                <button type="button" class="btn btn-outline" data-modal-close><?= htmlspecialchars(t('contas.cancelar'), ENT_QUOTES, 'UTF-8') ?></button>
                <button type="submit" class="btn btn-primary"><?= htmlspecialchars(t('contas.salvar'), ENT_QUOTES, 'UTF-8') ?></button>
            </div>
        </form>
    </div>
</div>
