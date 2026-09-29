<?php

use App\Core\Csrf;
use App\Core\I18n;

/** @var array $conta */
/** @var array $lancamentos */

$formatoData = I18n::idioma() === 'en-US' ? 'm/d/Y' : 'd/m/Y';
$formatoDataHora = $formatoData . ' H:i';

$formatarData = function (?string $valor) use ($formatoData): string {
    return $valor ? date($formatoData, strtotime($valor)) : '—';
};
$formatarDataHora = function (?string $valor) use ($formatoDataHora): string {
    return $valor ? date($formatoDataHora, strtotime($valor)) : '—';
};
?>
<div class="page-header">
    <p><a href="/contas" class="link-voltar"><?= htmlspecialchars(t('contas.extrato.voltar'), ENT_QUOTES, 'UTF-8') ?></a></p>
    <h1>📄 <?= htmlspecialchars(t('contas.extrato.titulo'), ENT_QUOTES, 'UTF-8') ?> — <?= htmlspecialchars($conta['nome'], ENT_QUOTES, 'UTF-8') ?></h1>
    <p class="muted">
        <?= htmlspecialchars(t('contas.saldo_atual'), ENT_QUOTES, 'UTF-8') ?>:
        <strong class="<?= $conta['saldo_atual'] < 0 ? 'valor-negativo' : 'valor-positivo' ?>"><?= htmlspecialchars(moeda((float) $conta['saldo_atual']), ENT_QUOTES, 'UTF-8') ?></strong>
    </p>
</div>

<?php if (!$lancamentos): ?>
    <div class="card placeholder-card">
        <p class="muted"><?= htmlspecialchars(t('contas.extrato.vazio'), ENT_QUOTES, 'UTF-8') ?></p>
    </div>
<?php else: ?>
    <div class="card tabela-wrapper">
        <table class="tabela">
            <thead>
                <tr>
                    <th><?= htmlspecialchars(t('contas.extrato.col.data'), ENT_QUOTES, 'UTF-8') ?></th>
                    <th><?= htmlspecialchars(t('contas.extrato.col.descricao'), ENT_QUOTES, 'UTF-8') ?></th>
                    <th><?= htmlspecialchars(t('contas.extrato.col.tipo'), ENT_QUOTES, 'UTF-8') ?></th>
                    <th class="tabela__num"><?= htmlspecialchars(t('contas.extrato.col.valor'), ENT_QUOTES, 'UTF-8') ?></th>
                    <th><?= htmlspecialchars(t('contas.extrato.col.status'), ENT_QUOTES, 'UTF-8') ?></th>
                    <th>Ações</th>
                </tr>
            </thead>
            <tbody>
                <?php foreach ($lancamentos as $l): ?>
                    <tr>
                        <td><?= htmlspecialchars($formatarData($l['data_competencia']), ENT_QUOTES, 'UTF-8') ?></td>
                        <td>
                            <strong><?= htmlspecialchars($l['descricao'], ENT_QUOTES, 'UTF-8') ?></strong>
                            <?php if (!empty($l['categoria_nome'])): ?>
                                <span class="lancamento-tag" style="margin-left: 6px; font-size: 11px;"><?= htmlspecialchars($l['categoria_nome'], ENT_QUOTES, 'UTF-8') ?></span>
                            <?php endif; ?>
                        </td>
                        <td><span class="badge badge-neutro"><?= htmlspecialchars(t('lancamento.tipo.' . $l['tipo']), ENT_QUOTES, 'UTF-8') ?></span></td>
                        <td class="tabela__num <?= $l['valor'] < 0 ? 'valor-negativo' : 'valor-positivo' ?>"><?= htmlspecialchars(moeda((float) $l['valor']), ENT_QUOTES, 'UTF-8') ?></td>
                        <td><?= htmlspecialchars(t('lancamento.status.' . $l['status']), ENT_QUOTES, 'UTF-8') ?></td>
                        <td>
                            <div style="display: flex; gap: 6px; align-items: center;">
                                <button type="button" class="icon-btn" title="Editar" data-modal-open="modal-editar-lancamento-<?= $l['id'] ?>">✏️</button>
                                <form method="post" action="/lancamentos/<?= $l['id'] ?>/excluir" onsubmit="return confirm('<?= htmlspecialchars(t('painel.lancamento.confirmar_exclusao'), ENT_QUOTES, 'UTF-8') ?>')" style="margin: 0;">
                                    <?= Csrf::campo() ?>
                                    <button type="submit" class="icon-btn" title="Excluir" style="background: none; border: none; cursor: pointer; color: var(--red);">🗑️</button>
                                </form>
                            </div>
                        </td>
                    </tr>
                    <?php $alvo = $l; require __DIR__ . '/../dashboard/_modal_editar.php'; ?>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>
<?php endif; ?>
