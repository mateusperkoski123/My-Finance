<?php

use App\Core\Csrf;

/** @var array $alvo */
/** @var string $voltarPara */
?>
<div class="modal-backdrop" id="modal-excluir-lancamento-<?= $alvo['id'] ?>" data-modal>
    <div class="modal card">
        <div class="modal__header">
            <h3>Excluir Transação Repetida</h3>
            <button type="button" class="modal__fechar" data-modal-close aria-label="Fechar">✕</button>
        </div>
        <form method="post" action="/lancamentos/<?= $alvo['id'] ?>/excluir" class="form">
            <?= Csrf::campo() ?>
            <?php if (!empty($voltarPara)): ?>
                <input type="hidden" name="voltar" value="<?= htmlspecialchars($voltarPara, ENT_QUOTES, 'UTF-8') ?>">
            <?php endif; ?>

            <p style="font-weight: 600; font-size: 13.5px; margin-bottom: 6px;">Atenção: Esta transação faz parte de uma série repetida.</p>
            <p class="muted" style="font-size: 12px; margin-top: 0; margin-bottom: 16px;">Como você gostaria de aplicar a exclusão?</p>

            <div style="background: var(--bg); padding: 14px; border-radius: 12px; margin-bottom: 16px; border: 1px solid var(--border);">
                <label style="display: block; margin-bottom: 10px; font-size: 13px; cursor: pointer;">
                    <input type="radio" name="escopo_serie" value="apenas_esta" checked>
                    <strong><?= htmlspecialchars(t('series.apenas_esta'), ENT_QUOTES, 'UTF-8') ?></strong>
                    <span class="muted" style="display: block; font-size: 11px; margin-left: 20px;"><?= htmlspecialchars(t('series.apenas_esta_desc'), ENT_QUOTES, 'UTF-8') ?></span>
                </label>
                <label style="display: block; margin-bottom: 10px; font-size: 13px; cursor: pointer;">
                    <input type="radio" name="escopo_serie" value="esta_e_proximas">
                    <strong><?= htmlspecialchars(t('series.esta_e_proximas'), ENT_QUOTES, 'UTF-8') ?></strong>
                    <span class="muted" style="display: block; font-size: 11px; margin-left: 20px;"><?= htmlspecialchars(t('series.esta_e_proximas_desc'), ENT_QUOTES, 'UTF-8') ?></span>
                </label>
                <label style="display: block; font-size: 13px; cursor: pointer;">
                    <input type="radio" name="escopo_serie" value="toda_serie">
                    <strong><?= htmlspecialchars(t('series.toda_serie'), ENT_QUOTES, 'UTF-8') ?></strong>
                    <span class="muted" style="display: block; font-size: 11px; margin-left: 20px;"><?= htmlspecialchars(t('series.toda_serie_desc'), ENT_QUOTES, 'UTF-8') ?></span>
                </label>
            </div>

            <div class="modal__acoes">
                <button type="button" class="btn btn-outline" data-modal-close><?= htmlspecialchars(t('contas.cancelar'), ENT_QUOTES, 'UTF-8') ?></button>
                <button type="submit" class="btn btn-primary" style="background: var(--red); border: none;">Confirmar Exclusão</button>
            </div>
        </form>
    </div>
</div>
