<?php

use App\Core\Csrf;

/** @var array $conta (vem do foreach em index.php) */
?>
<div class="modal-backdrop" id="modal-ajustar-<?= $conta['id'] ?>" data-modal style="background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(4px);">
    <div class="modal card" style="max-width: 460px; border-radius: 20px; padding: 24px; box-shadow: var(--shadow); border: 1px solid var(--border); background: var(--card);">
        <div class="modal__header" style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 20px;">
            <div>
                <h2 style="font-size: 19px; font-weight: 700; margin: 0 0 4px 0; color: var(--text);"><?= htmlspecialchars(t('contas.ajustar_titulo'), ENT_QUOTES, 'UTF-8') ?></h2>
                <span style="font-size: 13px; color: var(--muted);"><?= htmlspecialchars(t('contas.ajustar_sub', ['nome' => $conta['nome']]), ENT_QUOTES, 'UTF-8') ?></span>
            </div>
            <button type="button" class="modal__fechar" data-modal-close aria-label="Fechar" style="background: none; border: none; font-size: 18px; cursor: pointer; color: var(--muted);"><i class="ph ph-x"></i></button>
        </div>

        <!-- Box resumo da conta -->
        <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 14px; padding: 14px 18px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between;">
            <div>
                <span style="font-size: 11px; text-transform: uppercase; color: var(--muted); font-weight: 600; display: block; margin-bottom: 2px;"><?= htmlspecialchars(t('contas.origem'), ENT_QUOTES, 'UTF-8') ?></span>
                <strong style="font-size: 15px; color: var(--text);"><?= htmlspecialchars($conta['nome'], ENT_QUOTES, 'UTF-8') ?></strong>
            </div>
            <div style="text-align: right;">
                <span style="font-size: 11px; text-transform: uppercase; color: var(--muted); font-weight: 600; display: block; margin-bottom: 2px;"><?= htmlspecialchars(t('contas.saldo'), ENT_QUOTES, 'UTF-8') ?></span>
                <strong style="font-size: 16px; color: var(--green);"><?= htmlspecialchars(moeda((float) $conta['saldo_atual']), ENT_QUOTES, 'UTF-8') ?></strong>
            </div>
        </div>

        <form method="post" action="/contas/<?= $conta['id'] ?>/ajustar-saldo" class="form" style="display: flex; flex-direction: column; gap: 16px;">
            <?= Csrf::campo() ?>
            <input type="hidden" name="tipo_ajuste" id="tipo-ajuste-<?= $conta['id'] ?>" value="somar">

            <!-- Data de Competência -->
            <div class="form-group">
                <label for="ajustar-data-<?= $conta['id'] ?>" style="font-size: 13px; font-weight: 600; margin-bottom: 6px; display: block; color: var(--text);"><?= htmlspecialchars(t('modal.data_competencia'), ENT_QUOTES, 'UTF-8') ?></label>
                <input class="input" type="date" id="ajustar-data-<?= $conta['id'] ?>" name="data_competencia" value="<?= date('Y-m-d') ?>" style="border-radius: 12px; padding: 10px 14px; font-size: 13.5px;" required>
            </div>

            <!-- Valor do Ajuste com Toggle + / - -->
            <div class="form-group">
                <label for="ajustar-saldo-<?= $conta['id'] ?>" style="font-size: 13px; font-weight: 600; margin-bottom: 6px; display: block; color: var(--text);"><?= htmlspecialchars(t('contas.inf_valor'), ENT_QUOTES, 'UTF-8') ?></label>
                <div style="display: flex; align-items: center; gap: 10px;">
                    <button type="button" class="btn-toggle-ajuste-sinal" data-conta-id="<?= $conta['id'] ?>"
                            style="width: 38px; height: 38px; border-radius: 50%; background: var(--green-bg); border: none; display: flex; align-items: center; justify-content: center; flex-shrink: 0; cursor: pointer; transition: all 0.2s ease;"
                            title="Alternar entre Somar (+) e Subtrair (-)">
                        <i class="ph ph-plus" id="icon-ajustar-sinal-<?= $conta['id'] ?>" style="font-size: 20px; color: var(--green);"></i>
                    </button>
                    <input class="input" type="text" id="ajustar-saldo-<?= $conta['id'] ?>" name="valor_ajuste" data-money
                           value="<?= htmlspecialchars(moeda_input(0.0), ENT_QUOTES, 'UTF-8') ?>"
                           inputmode="<?= moeda_decimais() > 0 ? 'decimal' : 'numeric' ?>" style="border-radius: 12px; padding: 10px 14px; font-size: 16px; font-weight: 700; flex: 1;" required>
                </div>
            </div>

            <!-- Botões de Ação -->
            <div style="display: flex; flex-direction: column; gap: 10px; margin-top: 8px;">
                <button type="submit" id="btn-ajustar-submit-<?= $conta['id'] ?>" class="btn btn-primary" style="border: none; border-radius: 14px; padding: 12px; font-size: 14px; font-weight: 700; width: 100%;">
                    <?= htmlspecialchars(t('contas.adicionar_saldo'), ENT_QUOTES, 'UTF-8') ?>
                </button>
                <button type="button" class="btn btn-outline" data-modal-close style="border-radius: 14px; padding: 11px; font-size: 13.5px; font-weight: 600; width: 100%;">
                    <?= htmlspecialchars(t('modal.cancelar'), ENT_QUOTES, 'UTF-8') ?>
                </button>
            </div>
        </form>
    </div>
</div>
