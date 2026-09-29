<?php

use App\Core\Csrf;

/** @var array $alvo (lancamento sendo editado) */
/** @var array $contas */
/** @var array $categoriasArvore */
/** @var string $voltarPara */

$prefixo = 'editar-lanc-' . $alvo['id'];
$ehReceita = $alvo['tipo'] === 'receita';
$corTema = $ehReceita ? 'var(--green)' : 'var(--red)';
$tituloModal = $ehReceita ? t('modal.editar_receita') : t('modal.editar_despesa');
$labelStatus = $ehReceita ? t('modal.nao_foi_recebida') : t('modal.nao_foi_pago');
$labelFixa = $ehReceita ? t('modal.receita_fixa') : t('modal.despesa_fixa');
$ajudaFixa = $ehReceita ? t('modal.receita_fixa') : t('modal.despesa_fixa');

$ehSerie = !empty($alvo['serie_id']) || !empty($alvo['recorrente']);

$categoriaTopoAtual = null;
$subcategoriaAtual = null;
if (!empty($alvo['categoria_id'])) {
    if (!empty($alvo['categoria_parent_id'])) {
        $categoriaTopoAtual = (int) $alvo['categoria_parent_id'];
        $subcategoriaAtual = (int) $alvo['categoria_id'];
    } else {
        $categoriaTopoAtual = (int) $alvo['categoria_id'];
    }
}
?>
<div class="modal-backdrop" id="modal-editar-lancamento-<?= $alvo['id'] ?>" data-modal style="background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(4px);">
    <div class="modal card" style="max-width: 520px; border-radius: 20px; padding: 24px; box-shadow: var(--shadow); border: 1px solid var(--border); background: var(--card);">
        <div class="modal__header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: <?= $ehReceita ? 'var(--green-bg)' : 'var(--red-bg)' ?>; display: flex; align-items: center; justify-content: center;">
                    <i class="<?= $ehReceita ? 'ph ph-trend-up' : 'ph ph-trend-down' ?>" style="color: <?= $corTema ?>; font-size: 20px;"></i>
                </div>
                <h2 style="font-size: 18px; font-weight: 700; margin: 0; color: var(--text);"><?= htmlspecialchars($tituloModal, ENT_QUOTES, 'UTF-8') ?></h2>
            </div>
            <button type="button" class="modal__fechar" data-modal-close aria-label="Fechar" style="background: none; border: none; font-size: 18px; cursor: pointer; color: var(--muted);"><i class="ph ph-x"></i></button>
        </div>

        <form id="form-editar-<?= $alvo['id'] ?>" method="post" action="/lancamentos/<?= $alvo['id'] ?>/editar" class="form" style="display: flex; flex-direction: column; gap: 16px;" data-eh-serie="<?= $ehSerie ? '1' : '0' ?>" data-submodal-id="submodal-serie-<?= $alvo['id'] ?>">
            <?= Csrf::campo() ?>
            <input type="hidden" name="tipo" value="<?= htmlspecialchars($alvo['tipo'], ENT_QUOTES, 'UTF-8') ?>">
            <input type="hidden" name="voltar" value="<?= htmlspecialchars($voltarPara, ENT_QUOTES, 'UTF-8') ?>">
            <input type="hidden" name="escopo_edicao" id="<?= $prefixo ?>-escopo" value="apenas_esta">

            <!-- SEÇÃO 1: INFORMAÇÕES BÁSICAS -->
            <div>
                <h4 style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 700; margin-bottom: 12px;"><?= htmlspecialchars(t('modal.inf_basicas'), ENT_QUOTES, 'UTF-8') ?></h4>

                <!-- Descrição -->
                <div class="form-group" style="margin-bottom: 14px;">
                    <label for="<?= $prefixo ?>-descricao" style="font-size: 13px; font-weight: 600; margin-bottom: 4px; display: block; color: var(--text);"><?= htmlspecialchars(t('modal.descricao'), ENT_QUOTES, 'UTF-8') ?></label>
                    <input class="input" type="text" id="<?= $prefixo ?>-descricao" name="descricao" value="<?= htmlspecialchars($alvo['descricao'], ENT_QUOTES, 'UTF-8') ?>" style="border-radius: 12px; padding: 10px 14px; font-size: 13.5px;" required>
                </div>

                <!-- Valor -->
                <div class="form-group" style="margin-bottom: 14px;">
                    <label for="<?= $prefixo ?>-valor" style="font-size: 13px; font-weight: 600; margin-bottom: 4px; display: block; color: var(--text);"><?= htmlspecialchars(t('modal.valor'), ENT_QUOTES, 'UTF-8') ?></label>
                    <input class="input" type="text" id="<?= $prefixo ?>-valor" name="valor" data-money
                           value="<?= htmlspecialchars(moeda_input(abs((float) $alvo['valor'])), ENT_QUOTES, 'UTF-8') ?>"
                           inputmode="<?= moeda_decimais() > 0 ? 'decimal' : 'numeric' ?>" style="border-radius: 12px; padding: 10px 14px; font-size: 16px; font-weight: 700;" required>
                </div>

                <!-- Categoria -->
                <div class="form-group" style="margin-bottom: 14px;">
                    <label for="<?= $prefixo ?>-categoria" style="font-size: 13px; font-weight: 600; margin-bottom: 4px; display: block; color: var(--text);"><?= htmlspecialchars(t('modal.categoria'), ENT_QUOTES, 'UTF-8') ?></label>
                    <select class="input" id="<?= $prefixo ?>-categoria" name="categoria_id" data-gf-categoria-select data-subcategoria-atual="<?= $subcategoriaAtual ?? '' ?>" style="border-radius: 12px; padding: 10px 14px; font-size: 13.5px;">
                        <option value=""><?= htmlspecialchars(t('modal.escolha_cat'), ENT_QUOTES, 'UTF-8') ?></option>
                        <?php foreach ($categoriasArvore as $cat): ?>
                            <option value="<?= $cat['id'] ?>" <?= $categoriaTopoAtual === (int) $cat['id'] ? 'selected' : '' ?>><?= htmlspecialchars($cat['nome'], ENT_QUOTES, 'UTF-8') ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <!-- Subcategoria -->
                <div class="form-group" style="margin-bottom: 14px;">
                    <label for="<?= $prefixo ?>-subcategoria" style="font-size: 13px; font-weight: 600; margin-bottom: 4px; display: block; color: var(--text);"><?= htmlspecialchars(t('modal.subcategoria'), ENT_QUOTES, 'UTF-8') ?></label>
                    <select class="input" id="<?= $prefixo ?>-subcategoria" name="subcategoria_id" data-gf-subcategoria-select <?= $categoriaTopoAtual === null ? 'disabled' : '' ?> style="border-radius: 12px; padding: 10px 14px; font-size: 13.5px;">
                        <option value=""><?= htmlspecialchars(t('modal.sel_cat_primeiro'), ENT_QUOTES, 'UTF-8') ?></option>
                    </select>
                </div>
            </div>

            <!-- SEÇÃO 2: CONFIGURAÇÕES DE TRANSAÇÃO -->
            <div>
                <h4 style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 700; margin-bottom: 12px;"><?= htmlspecialchars(t('modal.config_transacao'), ENT_QUOTES, 'UTF-8') ?></h4>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <!-- Card Status Payment Toggle -->
                    <div style="border: 1px solid var(--border); border-radius: 14px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; background: var(--bg);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 32px; height: 32px; border-radius: 8px; background: var(--red-bg); display: flex; align-items: center; justify-content: center;" data-status-icon-box>
                                <i class="ph ph-trend-down" style="font-size: 18px; color: var(--red);" data-status-icon></i>
                            </div>
                            <div>
                                <strong style="font-size: 13px; display: block; color: var(--text);" data-status-title><?= htmlspecialchars($labelStatus, ENT_QUOTES, 'UTF-8') ?></strong>
                                <span style="font-size: 11px; color: var(--muted);"><?= htmlspecialchars(t('modal.status_pagamento'), ENT_QUOTES, 'UTF-8') ?></span>
                            </div>
                        </div>
                        <label class="toggle" style="margin: 0;">
                            <input type="hidden" name="foi_pago_presente" value="1">
                            <input type="checkbox" name="foi_pago" value="1" <?= $alvo['status'] === 'pago' ? 'checked' : '' ?> data-gf-status-toggle data-tipo="<?= $alvo['tipo'] ?>">
                            <span class="toggle__track"><span class="toggle__thumb"></span></span>
                        </label>
                    </div>

                    <!-- Card Data de Vencimento -->
                    <div style="border: 1px solid var(--border); border-radius: 14px; padding: 12px 16px; background: var(--bg);">
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                            <div style="width: 32px; height: 32px; border-radius: 8px; background: var(--card); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center;">
                                <i class="ph ph-calendar" style="font-size: 18px; color: var(--muted);"></i>
                            </div>
                            <div>
                                <strong style="font-size: 13px; display: block; color: var(--text);" data-status-date-label><?= htmlspecialchars(t('modal.data_vencimento'), ENT_QUOTES, 'UTF-8') ?></strong>
                                <span style="font-size: 11px; color: var(--muted);"><?= htmlspecialchars(t('modal.quando_paga'), ENT_QUOTES, 'UTF-8') ?></span>
                            </div>
                        </div>
                        <input class="input" type="date" id="<?= $prefixo ?>-data-pagamento" name="data_pagamento" value="<?= htmlspecialchars((string) $alvo['data_pagamento'], ENT_QUOTES, 'UTF-8') ?>" style="border-radius: 10px; padding: 8px 12px; font-size: 13px;">
                    </div>

                    <!-- Card Conta -->
                    <div style="border: 1px solid var(--border); border-radius: 14px; padding: 12px 16px; background: var(--bg);">
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                            <div style="width: 32px; height: 32px; border-radius: 8px; background: var(--card); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center;">
                                <i class="ph ph-bank" style="font-size: 18px; color: var(--muted);"></i>
                            </div>
                            <div>
                                <strong style="font-size: 13px; display: block; color: var(--text);"><?= htmlspecialchars(t('modal.conta'), ENT_QUOTES, 'UTF-8') ?></strong>
                                <span style="font-size: 11px; color: var(--muted);"><?= htmlspecialchars(t('modal.escolha_conta'), ENT_QUOTES, 'UTF-8') ?></span>
                            </div>
                        </div>
                        <select class="input" id="<?= $prefixo ?>-conta" name="conta_id" required style="border-radius: 10px; padding: 8px 12px; font-size: 13px;">
                            <?php foreach ($contas as $c): ?>
                                <option value="<?= $c['id'] ?>" <?= (int) $alvo['conta_id'] === (int) $c['id'] ? 'selected' : '' ?>><?= htmlspecialchars($c['nome'], ENT_QUOTES, 'UTF-8') ?></option>
                            <?php endforeach; ?>
                        </select>
                    </div>

                    <!-- Card Receita Fixa / Despesa Fixa -->
                    <div style="border: 1px solid var(--border); border-radius: 14px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; background: var(--bg);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 32px; height: 32px; border-radius: 8px; background: var(--card); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center;">
                                <i class="ph ph-push-pin" style="font-size: 18px; color: var(--muted);"></i>
                            </div>
                            <div>
                                <strong style="font-size: 13px; display: block; color: var(--text);"><?= htmlspecialchars($labelFixa, ENT_QUOTES, 'UTF-8') ?></strong>
                                <span style="font-size: 11px; color: var(--muted);"><?= htmlspecialchars($ajudaFixa, ENT_QUOTES, 'UTF-8') ?></span>
                            </div>
                        </div>
                        <label class="toggle" style="margin: 0;">
                            <input type="checkbox" name="recorrente" value="1" <?= $alvo['recorrente'] ? 'checked' : '' ?>>
                            <span class="toggle__track"><span class="toggle__thumb"></span></span>
                        </label>
                    </div>

                    <!-- Card Data de Competência -->
                    <div style="border: 1px solid var(--border); border-radius: 14px; padding: 12px 16px; background: var(--bg);">
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                            <div style="width: 32px; height: 32px; border-radius: 8px; background: var(--card); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center;">
                                <i class="ph ph-calendar-blank" style="font-size: 18px; color: var(--muted);"></i>
                            </div>
                            <div>
                                <strong style="font-size: 13px; display: block; color: var(--text);"><?= htmlspecialchars(t('modal.data_competencia'), ENT_QUOTES, 'UTF-8') ?></strong>
                            </div>
                        </div>
                        <input class="input" type="date" id="<?= $prefixo ?>-data" name="data_competencia" value="<?= htmlspecialchars($alvo['data_competencia'], ENT_QUOTES, 'UTF-8') ?>" required style="border-radius: 10px; padding: 8px 12px; font-size: 13px;">
                    </div>
                </div>
            </div>

            <!-- BOTÕES DO RODAPÉ -->
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
                <button type="submit" class="btn btn-salvar-lancamento" style="background: <?= $corTema ?>; color: #fff; border: none; border-radius: 12px; padding: 12px; font-size: 14px; font-weight: 700; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i class="ph ph-floppy-disk" style="font-size: 18px;"></i> <?= htmlspecialchars($ehReceita ? t('modal.atualizar_receita') : t('modal.atualizar_despesa'), ENT_QUOTES, 'UTF-8') ?>
                </button>
                <button type="button" class="btn btn-outline" data-modal-close style="border-radius: 12px; padding: 10px; font-size: 13.5px; font-weight: 600; width: 100%;">
                    <?= htmlspecialchars(t('modal.cancelar'), ENT_QUOTES, 'UTF-8') ?>
                </button>
            </div>
        </form>
    </div>
</div>

<?php if ($ehSerie): ?>
<!-- SUBMODAL: ATUALIZAR TRANSAÇÕES REPETIDAS (IMAGE 5 REPLICA) -->
<div class="modal-backdrop" id="submodal-serie-<?= $alvo['id'] ?>" data-modal style="background: rgba(0, 0, 0, 0.6); backdrop-filter: blur(4px); z-index: 1050;">
    <div class="modal card" style="max-width: 440px; border-radius: 20px; padding: 24px; box-shadow: var(--shadow); border: 1px solid var(--border); background: var(--card);">
        <div class="modal__header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: var(--green-bg); display: flex; align-items: center; justify-content: center;">
                    <i class="ph ph-arrows-clockwise" style="color: var(--green); font-size: 20px;"></i>
                </div>
                <h3 style="font-size: 17px; font-weight: 700; margin: 0; color: var(--text);"><?= htmlspecialchars(t('series.titulo'), ENT_QUOTES, 'UTF-8') ?></h3>
            </div>
            <button type="button" class="modal__fechar" data-submodal-close aria-label="Fechar" style="background: none; border: none; font-size: 18px; cursor: pointer; color: var(--muted);"><i class="ph ph-x"></i></button>
        </div>

        <!-- Banner de Atenção -->
        <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 12px; padding: 12px 14px; margin-bottom: 16px; font-size: 13px; color: var(--text); line-height: 1.4;">
            <?= htmlspecialchars(t('series.atencao'), ENT_QUOTES, 'UTF-8') ?>
        </div>

        <!-- Opções de Escopo (Cards) -->
        <div style="display: flex; flex-direction: column; gap: 10px; margin-bottom: 20px;">
            <!-- Opção 1: Apenas Esta Transação -->
            <button type="button" class="btn-escopo-opcao" data-escopo-val="apenas_esta" data-form-id="form-editar-<?= $alvo['id'] ?>"
                    style="display: flex; align-items: flex-start; gap: 14px; padding: 14px; border: 1px solid var(--border); border-radius: 14px; background: var(--card); text-align: left; cursor: pointer; transition: all 0.2s ease;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--bg); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
                    <i class="ph ph-pencil-simple" style="font-size: 18px; color: var(--text);"></i>
                </div>
                <div>
                    <strong style="font-size: 14px; display: block; color: var(--text); margin-bottom: 2px;"><?= htmlspecialchars(t('series.apenas_esta'), ENT_QUOTES, 'UTF-8') ?></strong>
                    <span style="font-size: 12px; color: var(--muted); line-height: 1.3; display: block;"><?= htmlspecialchars(t('series.apenas_esta_desc'), ENT_QUOTES, 'UTF-8') ?></span>
                </div>
            </button>

            <!-- Opção 2: Esta e as Próximas -->
            <button type="button" class="btn-escopo-opcao" data-escopo-val="esta_e_proximas" data-form-id="form-editar-<?= $alvo['id'] ?>"
                    style="display: flex; align-items: flex-start; gap: 14px; padding: 14px; border: 1px solid var(--border); border-radius: 14px; background: var(--card); text-align: left; cursor: pointer; transition: all 0.2s ease;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--bg); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
                    <i class="ph ph-fast-forward" style="font-size: 18px; color: var(--text);"></i>
                </div>
                <div>
                    <strong style="font-size: 14px; display: block; color: var(--text); margin-bottom: 2px;"><?= htmlspecialchars(t('series.esta_e_proximas'), ENT_QUOTES, 'UTF-8') ?></strong>
                    <span style="font-size: 12px; color: var(--muted); line-height: 1.3; display: block;"><?= htmlspecialchars(t('series.esta_e_proximas_desc'), ENT_QUOTES, 'UTF-8') ?></span>
                </div>
            </button>

            <!-- Opção 3: Toda a Série -->
            <button type="button" class="btn-escopo-opcao" data-escopo-val="toda_serie" data-form-id="form-editar-<?= $alvo['id'] ?>"
                    style="display: flex; align-items: flex-start; gap: 14px; padding: 14px; border: 1px solid var(--border); border-radius: 14px; background: var(--card); text-align: left; cursor: pointer; transition: all 0.2s ease;">
                <div style="width: 32px; height: 32px; border-radius: 50%; background: var(--bg); display: flex; align-items: center; justify-content: center; flex-shrink: 0; margin-top: 2px;">
                    <i class="ph ph-arrows-clockwise" style="font-size: 18px; color: var(--text);"></i>
                </div>
                <div>
                    <strong style="font-size: 14px; display: block; color: var(--text); margin-bottom: 2px;"><?= htmlspecialchars(t('series.toda_serie'), ENT_QUOTES, 'UTF-8') ?></strong>
                    <span style="font-size: 12px; color: var(--muted); line-height: 1.3; display: block; margin-bottom: 6px;"><?= htmlspecialchars(t('series.toda_serie_desc'), ENT_QUOTES, 'UTF-8') ?></span>
                    <div style="background: var(--bg); border: 1px solid var(--border); border-radius: 8px; padding: 6px 10px; font-size: 11px; color: var(--muted); display: flex; align-items: center; gap: 6px;">
                        <span>⚠️ <strong><?= htmlspecialchars(t('series.aviso_datas'), ENT_QUOTES, 'UTF-8') ?></strong></span>
                    </div>
                </div>
            </button>
        </div>

        <button type="button" class="btn btn-outline" data-submodal-close style="border-radius: 12px; padding: 10px; font-size: 13.5px; font-weight: 600; width: 100%;">
            <?= htmlspecialchars(t('modal.cancelar'), ENT_QUOTES, 'UTF-8') ?>
        </button>
    </div>
</div>
<?php endif; ?>
