<?php

use App\Core\Csrf;

/** @var array $contas */
/** @var array $categoriasArvore */
/** @var string $voltarPara */
/** @var string $tipoModal ('receita' ou 'despesa') */

$ehReceita = $tipoModal === 'receita';
$modalId = 'modal-novo-' . $tipoModal;
$prefixo = 'novo-' . $tipoModal;
$corTema = $ehReceita ? 'var(--green)' : 'var(--red)';
$tituloModal = $ehReceita ? 'Adicionar Receita' : 'Adicionar Despesa';
$labelStatus = $ehReceita ? 'Não Foi Recebida' : 'Não Foi Pago';
$labelFixa = $ehReceita ? 'Receita Fixa' : 'Despesa Fixa';
$ajudaFixa = $ehReceita ? 'Classifica como uma receita fixa' : 'Classifica como uma despesa fixa';
?>
<div class="modal-backdrop" id="<?= $modalId ?>" data-modal style="background: rgba(0, 0, 0, 0.5); backdrop-filter: blur(4px);">
    <div class="modal card" style="max-width: 520px; border-radius: 20px; padding: 24px; box-shadow: 0 20px 40px rgba(0,0,0,0.15); border: 1px solid var(--border);">
        <div class="modal__header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 20px;">
            <div style="display: flex; align-items: center; gap: 10px;">
                <div style="width: 36px; height: 36px; border-radius: 50%; background: <?= $ehReceita ? 'var(--green-bg)' : 'var(--red-bg)' ?>; display: flex; align-items: center; justify-content: center;">
                    <i class="<?= $ehReceita ? 'ph ph-trend-up' : 'ph ph-trend-down' ?>" style="color: <?= $corTema ?>; font-size: 20px;"></i>
                </div>
                <h2 style="font-size: 18px; font-weight: 700; margin: 0;"><?= htmlspecialchars($tituloModal, ENT_QUOTES, 'UTF-8') ?></h2>
            </div>
            <button type="button" class="modal__fechar" data-modal-close aria-label="Fechar" style="background: none; border: none; font-size: 18px; cursor: pointer; color: var(--muted);"><i class="ph ph-x"></i></button>
        </div>

        <form method="post" action="/lancamentos" class="form" style="display: flex; flex-direction: column; gap: 16px;">
            <?= Csrf::campo() ?>
            <input type="hidden" name="tipo" value="<?= $tipoModal ?>">
            <input type="hidden" name="voltar" value="<?= htmlspecialchars($voltarPara, ENT_QUOTES, 'UTF-8') ?>">

            <!-- SEÇÃO 1: INFORMAÇÕES BÁSICAS -->
            <div>
                <h4 style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 700; margin-bottom: 12px;">Informações Básicas</h4>

                <!-- Descrição -->
                <div class="form-group" style="margin-bottom: 14px;">
                    <label for="<?= $prefixo ?>-descricao" style="font-size: 13px; font-weight: 600; margin-bottom: 4px; display: block;">Descrição</label>
                    <input class="input" type="text" id="<?= $prefixo ?>-descricao" name="descricao" placeholder="Ex: Compra no supermercado" style="border-radius: 12px; padding: 10px 14px; font-size: 13.5px;" required>
                    <span style="font-size: 11px; color: var(--muted); display: block; margin-top: 4px;">A descrição ajuda a sugerir a categoria. Você pode escolher outra.</span>
                </div>

                <!-- Valor -->
                <div class="form-group" style="margin-bottom: 14px;">
                    <label for="<?= $prefixo ?>-valor" style="font-size: 13px; font-weight: 600; margin-bottom: 4px; display: block;">Valor</label>
                    <input class="input" type="text" id="<?= $prefixo ?>-valor" name="valor" data-money placeholder="PYG 0"
                           inputmode="<?= moeda_decimais() > 0 ? 'decimal' : 'numeric' ?>" style="border-radius: 12px; padding: 10px 14px; font-size: 16px; font-weight: 700;" required>
                </div>

                <!-- Categoria -->
                <div class="form-group" style="margin-bottom: 14px;">
                    <label for="<?= $prefixo ?>-categoria" style="font-size: 13px; font-weight: 600; margin-bottom: 4px; display: block;">Categoria</label>
                    <select class="input" id="<?= $prefixo ?>-categoria" name="categoria_id" data-gf-categoria-select data-subcategoria-atual="" style="border-radius: 12px; padding: 10px 14px; font-size: 13.5px;">
                        <option value="">Escolha uma categoria</option>
                        <?php foreach ($categoriasArvore as $cat): ?>
                            <option value="<?= $cat['id'] ?>"><?= htmlspecialchars($cat['nome'], ENT_QUOTES, 'UTF-8') ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>

                <!-- Subcategoria -->
                <div class="form-group" style="margin-bottom: 14px;">
                    <label for="<?= $prefixo ?>-subcategoria" style="font-size: 13px; font-weight: 600; margin-bottom: 4px; display: block;">Subcategoria</label>
                    <select class="input" id="<?= $prefixo ?>-subcategoria" name="subcategoria_id" data-gf-subcategoria-select disabled style="border-radius: 12px; padding: 10px 14px; font-size: 13.5px;">
                        <option value="">Selecione uma categoria primeiro</option>
                    </select>
                </div>
            </div>

            <!-- SEÇÃO 2: CONFIGURAÇÕES DE TRANSAÇÃO -->
            <div>
                <h4 style="font-size: 12px; text-transform: uppercase; letter-spacing: 0.05em; color: var(--muted); font-weight: 700; margin-bottom: 12px;">Configurações de Transação</h4>

                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <!-- Card Status Payment Toggle (Não Foi Recebida / Foi Recebida e Não Foi Pago / Foi Pago) -->
                    <div style="border: 1px solid var(--border); border-radius: 14px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; background: var(--bg);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 32px; height: 32px; border-radius: 8px; background: var(--red-bg); display: flex; align-items: center; justify-content: center;" data-status-icon-box>
                                <i class="ph ph-trend-down" style="font-size: 18px; color: var(--red);" data-status-icon></i>
                            </div>
                            <div>
                                <strong style="font-size: 13px; display: block;" data-status-title><?= htmlspecialchars($labelStatus, ENT_QUOTES, 'UTF-8') ?></strong>
                                <span style="font-size: 11px; color: var(--muted);">Status do pagamento/recebimento</span>
                            </div>
                        </div>
                        <label class="toggle" style="margin: 0;">
                            <input type="checkbox" name="foi_pago" value="1" data-gf-status-toggle data-tipo="<?= $tipoModal ?>">
                            <span class="toggle__track"><span class="toggle__thumb"></span></span>
                        </label>
                    </div>

                    <!-- Card Data de Vencimento / Pagamento / Recebimento -->
                    <div style="border: 1px solid var(--border); border-radius: 14px; padding: 12px 16px; background: var(--bg);">
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                            <div style="width: 32px; height: 32px; border-radius: 8px; background: var(--card); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center;">
                                <i class="ph ph-calendar" style="font-size: 18px; color: var(--muted);"></i>
                            </div>
                            <div>
                                <strong style="font-size: 13px; display: block;" data-status-date-label>Data de Vencimento</strong>
                                <span style="font-size: 11px; color: var(--muted);">Quando a transação deve ser paga/recebida</span>
                            </div>
                        </div>
                        <input class="input" type="date" id="<?= $prefixo ?>-data-pagamento" name="data_pagamento" value="<?= date('Y-m-d') ?>" style="border-radius: 10px; padding: 8px 12px; font-size: 13px;">
                    </div>

                    <!-- Card Conta -->
                    <div style="border: 1px solid var(--border); border-radius: 14px; padding: 12px 16px; background: var(--bg);">
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                            <div style="width: 32px; height: 32px; border-radius: 8px; background: var(--card); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center;">
                                <i class="ph ph-bank" style="font-size: 18px; color: var(--muted);"></i>
                            </div>
                            <div>
                                <strong style="font-size: 13px; display: block;">Conta</strong>
                                <span style="font-size: 11px; color: var(--muted);">Escolha a conta para esta transação</span>
                            </div>
                        </div>
                        <select class="input" id="<?= $prefixo ?>-conta" name="conta_id" required style="border-radius: 10px; padding: 8px 12px; font-size: 13px;">
                            <?php foreach ($contas as $c): ?>
                                <option value="<?= $c['id'] ?>"><?= htmlspecialchars($c['nome'], ENT_QUOTES, 'UTF-8') ?></option>
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
                                <strong style="font-size: 13px; display: block;"><?= htmlspecialchars($labelFixa, ENT_QUOTES, 'UTF-8') ?></strong>
                                <span style="font-size: 11px; color: var(--muted);"><?= htmlspecialchars($ajudaFixa, ENT_QUOTES, 'UTF-8') ?></span>
                            </div>
                        </div>
                        <label class="toggle" style="margin: 0;">
                            <input type="checkbox" name="recorrente" value="1">
                            <span class="toggle__track"><span class="toggle__thumb"></span></span>
                        </label>
                    </div>

                    <!-- Card Repetir Transação -->
                    <div style="border: 1px solid var(--border); border-radius: 14px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; background: var(--bg);">
                        <div style="display: flex; align-items: center; gap: 12px;">
                            <div style="width: 32px; height: 32px; border-radius: 8px; background: var(--card); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center;">
                                <i class="ph ph-arrows-clockwise" style="font-size: 18px; color: var(--muted);"></i>
                            </div>
                            <div>
                                <strong style="font-size: 13px; display: block;">Repetir Transação</strong>
                                <span style="font-size: 11px; color: var(--muted);">Criar múltiplas transações automaticamente</span>
                            </div>
                        </div>
                        <label class="toggle" style="margin: 0;">
                            <input type="checkbox" name="repetir" value="1" data-gf-toggle-repetir>
                            <span class="toggle__track"><span class="toggle__thumb"></span></span>
                        </label>
                    </div>

                    <div class="form-group" data-gf-repetir-alvo hidden style="padding: 10px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg);">
                        <label for="<?= $prefixo ?>-quantidade-repeticoes" style="font-size: 12px; font-weight: 600;">Quantidade de repetições (meses)</label>
                        <input class="input" type="number" id="<?= $prefixo ?>-quantidade-repeticoes" name="quantidade_repeticoes" min="2" max="60" value="12" style="border-radius: 8px; padding: 6px 10px; font-size: 13px;">
                    </div>

                    <!-- Card Data de Competência -->
                    <div style="border: 1px solid var(--border); border-radius: 14px; padding: 12px 16px; background: var(--bg);">
                        <div style="display: flex; align-items: center; gap: 12px; margin-bottom: 8px;">
                            <div style="width: 32px; height: 32px; border-radius: 8px; background: var(--card); border: 1px solid var(--border); display: flex; align-items: center; justify-content: center;">
                                <i class="ph ph-calendar-blank" style="font-size: 18px; color: var(--muted);"></i>
                            </div>
                            <div>
                                <strong style="font-size: 13px; display: block;">Data de Competência <i class="ph ph-info" style="font-size: 12px; color: var(--muted);" title="Data de aquisição ou emissão do produto ou serviço"></i></strong>
                                <span style="font-size: 11px; color: var(--muted);">Data de aquisição ou emissão do produto ou serviço</span>
                            </div>
                        </div>
                        <input class="input" type="date" id="<?= $prefixo ?>-data" name="data_competencia" value="<?= date('Y-m-d') ?>" required style="border-radius: 10px; padding: 8px 12px; font-size: 13px;">
                    </div>
                </div>
            </div>

            <!-- BOTÕES DO RODAPÉ -->
            <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 8px;">
                <button type="submit" class="btn" style="background: <?= $corTema ?>; color: #fff; border: none; border-radius: 12px; padding: 12px; font-size: 14px; font-weight: 700; width: 100%; display: flex; align-items: center; justify-content: center; gap: 8px;">
                    <i class="ph ph-floppy-disk" style="font-size: 18px;"></i> Salvar <?= $ehReceita ? 'Receita' : 'Despesa' ?>
                </button>
                <button type="button" class="btn btn-outline" data-modal-close style="border-radius: 12px; padding: 10px; font-size: 13.5px; font-weight: 600; width: 100%;">
                    Cancelar
                </button>
            </div>
        </form>
    </div>
</div>
