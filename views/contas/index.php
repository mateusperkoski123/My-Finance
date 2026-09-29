<?php

use App\Core\Csrf;

/** @var array $contas */
/** @var bool $abaArquivadas */
/** @var float $saldoTotal */
/** @var int $totalAtivas */
?>
<div class="page-header page-header--acoes" style="display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 24px;">
    <div>
        <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 6px 0; display: flex; align-items: center; gap: 8px; color: var(--text);">
            <i class="ph ph-bank" style="font-size: 26px;"></i> <?= htmlspecialchars(t('contas.titulo'), ENT_QUOTES, 'UTF-8') ?>
        </h1>
        <p class="muted" style="margin: 0; font-size: 14px; color: var(--muted);"><?= htmlspecialchars(t('contas.subtitulo'), ENT_QUOTES, 'UTF-8') ?></p>
    </div>
    <div>
        <button type="button" class="btn btn-outline" style="border-radius: 20px; padding: 8px 16px; font-size: 13px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
            <i class="ph ph-key" style="font-size: 16px;"></i> <?= htmlspecialchars(t('contas.open_finance'), ENT_QUOTES, 'UTF-8') ?>
        </button>
    </div>
</div>

<div style="margin-bottom: 20px;">
    <button type="button" class="btn btn-outline" data-modal-open="modal-nova-conta" style="border-radius: 20px; padding: 8px 16px; font-size: 13.5px; font-weight: 600; display: inline-flex; align-items: center; gap: 6px; background: var(--card);">
        <i class="ph ph-plus" style="font-size: 16px;"></i> <?= htmlspecialchars(t('contas.nova'), ENT_QUOTES, 'UTF-8') ?>
    </button>
</div>

<div class="contas-toolbar" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 24px;">
    <div class="tabs" style="border: none; gap: 16px; margin: 0;">
        <a href="/contas?aba=ativas" class="tabs__item <?= !$abaArquivadas ? 'is-active' : '' ?>" style="font-size: 14px; font-weight: 600; padding: 6px 4px; display: flex; align-items: center; gap: 6px;">
            <i class="ph ph-bank"></i> <?= htmlspecialchars(t('contas.aba_ativas'), ENT_QUOTES, 'UTF-8') ?>
        </a>
        <a href="/contas?aba=arquivadas" class="tabs__item <?= $abaArquivadas ? 'is-active' : '' ?>" style="font-size: 14px; font-weight: 600; padding: 6px 4px; display: flex; align-items: center; gap: 6px;">
            <i class="ph ph-archive"></i> <?= htmlspecialchars(t('contas.aba_arquivadas'), ENT_QUOTES, 'UTF-8') ?>
        </a>
    </div>
    <div style="background: var(--card); border: 1px solid var(--border); border-radius: 20px; padding: 6px 16px; font-size: 13px; color: var(--muted); display: flex; align-items: center; gap: 8px;">
        <span class="badge badge-neutro" style="font-size: 12px; font-weight: 600;"><?= $totalAtivas ?> conta(s)</span>
        <span><?= htmlspecialchars(t('contas.saldo_total'), ENT_QUOTES, 'UTF-8') ?>:</span>
        <strong style="color: var(--green); font-size: 14px;" id="header-saldo-total"><?= htmlspecialchars(moeda($saldoTotal), ENT_QUOTES, 'UTF-8') ?></strong>
    </div>
</div>

<?php if (!$contas): ?>
    <div class="card placeholder-card" style="border-radius: 20px; padding: 40px; text-align: center; background: var(--card);">
        <p class="muted" style="margin: 0; font-size: 15px; color: var(--muted);"><?= htmlspecialchars($abaArquivadas ? t('contas.nenhuma_arquivada') : t('contas.nenhuma_ativa'), ENT_QUOTES, 'UTF-8') ?></p>
    </div>
<?php else: ?>
    <div class="contas-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 24px;">
        <?php foreach ($contas as $conta): ?>
            <div class="card conta-card" data-conta-card-id="<?= $conta['id'] ?>" data-raw-saldo="<?= (float)$conta['saldo_atual'] ?>" style="border-radius: 20px; padding: 20px; background: var(--card); border: 1px solid var(--border); box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 16px;">
                <!-- Nome da Conta -->
                <div style="display: flex; justify-content: space-between; align-items: center;">
                    <h3 style="font-size: 16px; font-weight: 700; margin: 0; text-transform: lowercase; color: var(--text);"><?= htmlspecialchars($conta['nome'], ENT_QUOTES, 'UTF-8') ?></h3>
                    <?php if (!$abaArquivadas): ?>
                        <button type="button" class="btn-olho-toggle" data-conta-id="<?= $conta['id'] ?>" onclick="toggleOlhoConta('<?= $conta['id'] ?>')" title="Ocultar/Exibir Capital" style="background: none; border: none; cursor: pointer; padding: 4px;">
                            <span id="btn-olho-icon-<?= $conta['id'] ?>"><i class="ph ph-eye" style="font-size: 18px; color: var(--muted);"></i></span>
                        </button>
                    <?php endif; ?>
                </div>

                <!-- Box 1: Saldo Atual -->
                <div style="border: 1px solid var(--border); border-radius: 14px; padding: 14px 16px; background: var(--bg);">
                    <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px;">
                        <span style="font-size: 12.5px; color: var(--muted); font-weight: 500; display: flex; align-items: center; gap: 6px;">
                            <i class="ph ph-trend-up" style="font-size: 14px;"></i> <?= htmlspecialchars(t('contas.saldo_atual'), ENT_QUOTES, 'UTF-8') ?>
                        </span>
                    </div>
                    <div class="val-saldo-display" id="saldo-display-<?= $conta['id'] ?>" style="font-size: 22px; font-weight: 800; color: var(--green);">
                        <?= htmlspecialchars(moeda((float) $conta['saldo_atual']), ENT_QUOTES, 'UTF-8') ?>
                    </div>
                </div>

                <!-- Box 2: Status / Descrição -->
                <div style="border: 1px solid var(--border); border-radius: 14px; padding: 12px 14px; background: var(--bg); display: flex; align-items: flex-start; gap: 10px;">
                    <i class="ph ph-user" style="font-size: 18px; color: var(--muted); margin-top: 2px;"></i>
                    <div>
                        <strong style="font-size: 13px; display: block; color: var(--text); margin-bottom: 2px;">
                            <?= $conta['conta_padrao'] ? htmlspecialchars(t('contas.conta_padrao'), ENT_QUOTES, 'UTF-8') : 'Conta' ?>
                        </strong>
                        <span style="font-size: 11px; color: var(--muted); line-height: 1.3; display: block;">
                            <?= $conta['conta_padrao'] ? 'Ao lançar sem informar uma conta, será utilizada essa conta.' : 'Registra lançamentos desta conta.' ?>
                        </span>
                    </div>
                </div>

                <!-- Box 3: Botões Grid -->
                <?php if (!$abaArquivadas): ?>
                    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: auto;">
                        <a href="/contas/<?= $conta['id'] ?>/extrato" class="btn btn-outline" style="border-radius: 10px; padding: 8px 4px; font-size: 11.5px; font-weight: 600; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--text);">
                            <i class="ph ph-receipt" style="font-size: 16px;"></i> <?= htmlspecialchars(t('contas.extrato'), ENT_QUOTES, 'UTF-8') ?>
                        </a>
                        <button type="button" class="btn btn-outline" data-modal-open="modal-ajustar-<?= $conta['id'] ?>" style="border-radius: 10px; padding: 8px 4px; font-size: 11.5px; font-weight: 600; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--text);">
                            <i class="ph ph-currency-dollar" style="font-size: 16px;"></i> <?= htmlspecialchars(t('contas.ajustar_saldo'), ENT_QUOTES, 'UTF-8') ?>
                        </button>
                        <button type="button" class="btn btn-outline" data-modal-open="modal-transferir" onclick="prepararTransferenciaOrigem('<?= $conta['id'] ?>')" style="border-radius: 10px; padding: 8px 4px; font-size: 11.5px; font-weight: 600; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--text);">
                            <i class="ph ph-arrows-left-right" style="font-size: 16px;"></i> <?= htmlspecialchars(t('contas.transferir'), ENT_QUOTES, 'UTF-8') ?>
                        </button>
                        <button type="button" class="btn btn-outline" style="border-radius: 10px; padding: 8px 4px; font-size: 11.5px; font-weight: 600; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--text);">
                            <i class="ph ph-upload-simple" style="font-size: 16px;"></i> OFX
                        </button>
                        <button type="button" class="btn btn-outline" data-modal-open="modal-editar-<?= $conta['id'] ?>" style="border-radius: 10px; padding: 8px 4px; font-size: 11.5px; font-weight: 600; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--text);">
                            <i class="ph ph-pencil-simple" style="font-size: 16px;"></i> <?= htmlspecialchars(t('contas.editar'), ENT_QUOTES, 'UTF-8') ?>
                        </button>
                        <form method="post" action="/contas/<?= $conta['id'] ?>/arquivar" style="margin: 0;">
                            <?= Csrf::campo() ?>
                            <button type="submit" class="btn btn-outline" style="width: 100%; border-radius: 10px; padding: 8px 4px; font-size: 11.5px; font-weight: 600; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; color: var(--text);">
                                <i class="ph ph-archive-in" style="font-size: 16px;"></i> <?= htmlspecialchars(t('contas.arquivar'), ENT_QUOTES, 'UTF-8') ?>
                            </button>
                        </form>
                    </div>
                <?php else: ?>
                    <div style="margin-top: auto;">
                        <form method="post" action="/contas/<?= $conta['id'] ?>/restaurar">
                            <?= Csrf::campo() ?>
                            <button type="submit" class="btn btn-outline btn-block" style="border-radius: 10px; font-size: 12px;">
                                <i class="ph ph-arrow-counter-clockwise"></i> <?= htmlspecialchars(t('contas.restaurar'), ENT_QUOTES, 'UTF-8') ?>
                            </button>
                        </form>
                    </div>
                <?php endif; ?>
            </div>

            <?php if (!$abaArquivadas): ?>
                <?php require __DIR__ . '/_modal_editar.php'; ?>
                <?php require __DIR__ . '/_modal_ajustar.php'; ?>
            <?php endif; ?>
        <?php endforeach; ?>
    </div>
<?php endif; ?>

<?php if (!$abaArquivadas): ?>
    <?php require __DIR__ . '/_modal_nova.php'; ?>
    <?php require __DIR__ . '/_modal_transferir.php'; ?>
<?php endif; ?>

<script>
const ocultasSet = new Set(JSON.parse(localStorage.getItem('gf_contas_ocultas') || '[]'));

function toggleOlhoConta(contaId) {
    contaId = String(contaId);
    if (ocultasSet.has(contaId)) {
        ocultasSet.delete(contaId);
    } else {
        ocultasSet.add(contaId);
    }
    localStorage.setItem('gf_contas_ocultas', JSON.stringify(Array.from(ocultasSet)));
    aplicarEstadosOlho();
}

function aplicarEstadosOlho() {
    let saldoTotalVisivel = 0;

    document.querySelectorAll('.conta-card').forEach(card => {
        const contaId = String(card.getAttribute('data-conta-card-id'));
        const rawSaldo = parseFloat(card.getAttribute('data-raw-saldo')) || 0;
        const iconSpan = document.getElementById('btn-olho-icon-' + contaId);
        const displayEl = card.querySelector('.val-saldo-display');

        if (ocultasSet.has(contaId)) {
            if (iconSpan) iconSpan.innerHTML = '<i class="ph ph-eye-slash" style="font-size: 18px; color: var(--muted);"></i>';
            if (displayEl) displayEl.innerHTML = '••••••••';
        } else {
            if (iconSpan) iconSpan.innerHTML = '<i class="ph ph-eye" style="font-size: 18px; color: var(--muted);"></i>';
            saldoTotalVisivel += rawSaldo;
            if (displayEl && typeof window.gfFormatarValorMoeda === 'function') {
                displayEl.innerHTML = window.gfFormatarValorMoeda(rawSaldo);
            }
        }
    });

    const headerTotalEl = document.getElementById('header-saldo-total');
    if (headerTotalEl && typeof window.gfFormatarValorMoeda === 'function') {
        headerTotalEl.innerHTML = window.gfFormatarValorMoeda(saldoTotalVisivel);
    }
}

function prepararTransferenciaOrigem(origemId) {
    const origSelect = document.getElementById('transferir-origem');
    const origHidden = document.getElementById('transferir-origem-hidden');
    if (origSelect && origHidden) {
        origSelect.value = origemId;
        origSelect.disabled = true;
        origHidden.value = origemId;
    }
    atualizarOpcoesDestinoPhp(origemId);
}

function resetModalTransferirPhp() {
    const origSelect = document.getElementById('transferir-origem');
    const origHidden = document.getElementById('transferir-origem-hidden');
    if (origSelect && origHidden) {
        origSelect.disabled = false;
        origHidden.value = origSelect.value;
    }
    atualizarOpcoesDestinoPhp(origSelect ? origSelect.value : null);
}

function atualizarOpcoesDestinoPhp(origemId) {
    const destSelect = document.getElementById('transferir-destino');
    if (!destSelect) return;
    Array.from(destSelect.options).forEach(opt => {
        opt.disabled = (opt.value === String(origemId));
    });
    if (destSelect.value === String(origemId)) {
        const firstValid = Array.from(destSelect.options).find(opt => !opt.disabled);
        if (firstValid) destSelect.value = firstValid.value;
    }
}

document.addEventListener('DOMContentLoaded', () => {
    aplicarEstadosOlho();
});
</script>
