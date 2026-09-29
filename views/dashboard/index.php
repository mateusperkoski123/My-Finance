<?php

use App\Core\Csrf;
use App\Core\I18n;

/** @var array $resumo */
/** @var array $lancamentos */
/** @var array $contas */
/** @var array $categoriasArvore */
/** @var array $periodo */
/** @var array $filtros */
/** @var string $voltarPara */
/** @var array $mesesTira */
/** @var string $ordenacao */
/** @var int $paginaAtual */
/** @var int $porPagina */
/** @var int $totalRegistros */
/** @var int $totalPaginas */

$formatoData = I18n::idioma() === 'en-US' ? 'm/d/Y' : 'd/m/Y';
$formatarData = function (?string $valor) use ($formatoData): string {
    return $valor ? date($formatoData, strtotime($valor)) : '—';
};

$queryFiltros = [];
if ($filtros['tipo'] !== 'todas') {
    $queryFiltros['tipo'] = $filtros['tipo'];
}
if ($filtros['busca'] !== '') {
    $queryFiltros['busca'] = $filtros['busca'];
}

$linkMes = function (int $mes, int $ano) use ($queryFiltros): string {
    return '/?' . http_build_query(['mes' => $mes, 'ano' => $ano] + $queryFiltros);
};

// Base do periodo atualmente navegado (mes/ano OU intervalo customizado),
// para montar links que preservam o periodo sem troca-lo (ordenacao e
// paginacao) - mesmo padrao de $queryBase usado em views/relatorios/index.php.
$queryBase = [];
if (!$periodo['customizado']) {
    $queryBase['mes'] = $periodo['mes'];
    $queryBase['ano'] = $periodo['ano'];
} else {
    $queryBase['data_inicio'] = $periodo['inicio'];
    $queryBase['data_fim'] = $periodo['fim'];
}
$queryAtual = $queryBase + $queryFiltros;

$linkOrdenar = function (string $novaOrdenacao) use ($queryAtual): string {
    return '/?' . http_build_query($queryAtual + ['ordenar' => $novaOrdenacao]);
};

$linkPagina = function (int $novaPagina) use ($queryAtual, $ordenacao): string {
    $q = $queryAtual;
    if ($ordenacao !== 'data') {
        $q['ordenar'] = $ordenacao;
    }
    $q['pagina'] = $novaPagina;
    return '/?' . http_build_query($q);
};

$nomesMeses = [
    1 => t('painel.mes.1'), 2 => t('painel.mes.2'), 3 => t('painel.mes.3'), 4 => t('painel.mes.4'),
    5 => t('painel.mes.5'), 6 => t('painel.mes.6'), 7 => t('painel.mes.7'), 8 => t('painel.mes.8'),
    9 => t('painel.mes.9'), 10 => t('painel.mes.10'), 11 => t('painel.mes.11'), 12 => t('painel.mes.12'),
];
// Versao abreviada (3 letras) so pra faixa de meses - mesma ideia de
// $nomesMesesAbrev em views/relatorios/index.php, evita chaves de traducao novas.
$nomesMesesAbrev = array_map(static fn (string $nome): string => mb_substr($nome, 0, 3), $nomesMeses);

$temContas = count($contas) > 0;

// Totais Todas/Receitas/Despesas para o mini grafico lateral (Parte C) -
// reaproveita os campos que Lancamento::resumoPeriodo() ja calcula, sem
// nenhuma query nova. Os 3 conjuntos (um por aba) sao embutidos como JSON
// mais abaixo e a troca de aba e 100% client-side (ver script no fim do
// arquivo).
$lateralReceitasTotal = (float) $resumo['receitas_recebidas'] + (float) $resumo['receitas_a_receber'];
$lateralDespesasTotal = (float) $resumo['despesas_pagas'] + (float) $resumo['despesas_nao_pagas'];
$temDadosLateral = ($lateralReceitasTotal + $lateralDespesasTotal) > 0;

$dadosLateral = [
    'todas' => [
        'labels'     => [t('painel.lateral.aba_receitas'), t('painel.lateral.aba_despesas')],
        'valores'    => [$lateralReceitasTotal, $lateralDespesasTotal],
        'formatados' => [moeda($lateralReceitasTotal), moeda($lateralDespesasTotal)],
    ],
    'receitas' => [
        'labels'     => [t('painel.lateral.recebidas'), t('painel.resumo.a_receber')],
        'valores'    => [(float) $resumo['receitas_recebidas'], (float) $resumo['receitas_a_receber']],
        'formatados' => [moeda((float) $resumo['receitas_recebidas']), moeda((float) $resumo['receitas_a_receber'])],
    ],
    'despesas' => [
        'labels'     => [t('painel.lateral.pagas'), t('painel.resumo.nao_pagas')],
        'valores'    => [(float) $resumo['despesas_pagas'], (float) $resumo['despesas_nao_pagas']],
        'formatados' => [moeda((float) $resumo['despesas_pagas']), moeda((float) $resumo['despesas_nao_pagas'])],
    ],
];
?>


<?php
$dataHoje = date('Y-m-d');
$data7Dias = date('Y-m-d', strtotime('-7 days'));
$dataAnoInicio = date('Y-01-01');
$dataAnoFim = date('Y-12-31');

$e7Dias = $periodo['customizado'] && $periodo['inicio'] === $data7Dias && $periodo['fim'] === $dataHoje;
$eAno = $periodo['customizado'] && $periodo['inicio'] === $dataAnoInicio && $periodo['fim'] === $dataAnoFim;
$eMes = !$periodo['customizado'] && $periodo['e_mes_atual'];
$eHoje = $periodo['customizado'] && $periodo['inicio'] === $dataHoje && $periodo['fim'] === $dataHoje;
?>
<div class="myfinance-top-controls card" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; padding: 12px 18px;">
    <div style="display: flex; align-items: center; gap: 8px;">
        <a class="btn btn-outline btn-sm" href="<?= $linkMes($periodo['mes_anterior'], $periodo['ano_anterior']) ?>"><i class="ph ph-caret-left"></i></a>
        <strong style="font-size: 15px; font-weight: 600; min-width: 100px; text-align: center;"><?= htmlspecialchars($nomesMeses[$periodo['mes'] ?? date('n')], ENT_QUOTES, 'UTF-8') ?></strong>
        <a class="btn btn-outline btn-sm" href="<?= $linkMes($periodo['mes_proximo'], $periodo['ano_proximo']) ?>"><i class="ph ph-caret-right"></i></a>
        <a href="/?data_inicio=<?= $dataHoje ?>&data_fim=<?= $dataHoje ?>" class="btn <?= $eHoje ? 'btn-primary' : 'btn-outline' ?> btn-sm" style="border-radius: 20px; margin-left: 8px;"><?= htmlspecialchars(t('painel.hoje'), ENT_QUOTES, 'UTF-8') ?></a>
        <a href="/?data_inicio=<?= $data7Dias ?>&data_fim=<?= $dataHoje ?>" class="btn <?= $e7Dias ? 'btn-primary' : 'btn-outline' ?> btn-sm" style="border-radius: 20px;">7 dias atrás</a>
        <a href="/?mes=<?= date('n') ?>&ano=<?= date('Y') ?>" class="btn <?= $eMes ? 'btn-primary' : 'btn-outline' ?> btn-sm" style="border-radius: 20px;">Esse mês</a>
        <a href="/?data_inicio=<?= $dataAnoInicio ?>&data_fim=<?= $dataAnoFim ?>" class="btn <?= $eAno ? 'btn-primary' : 'btn-outline' ?> btn-sm" style="border-radius: 20px;">Esse ano</a>
        <span class="muted" style="font-size: 13px; background: var(--bg); padding: 6px 12px; border-radius: 20px; border: 1px solid var(--border);">
            <i class="ph ph-calendar-blank"></i> <?= date('d/m/Y', strtotime($periodo['inicio'])) ?> - <?= date('d/m/Y', strtotime($periodo['fim'])) ?>
        </span>
    </div>
    <div style="display: flex; align-items: center; gap: 8px;">
        <?php if ($temContas): ?>
            <button type="button" class="btn btn-primary btn-sm" data-modal-open="modal-novo-receita" style="background: var(--green); border: none;"><i class="ph ph-plus"></i> Receita</button>
            <button type="button" class="btn btn-primary btn-sm" data-modal-open="modal-novo-despesa" style="background: var(--red); border: none;"><i class="ph ph-minus"></i> Despesa</button>
        <?php endif; ?>
        <button type="button" class="btn btn-outline btn-sm" onclick="document.querySelector('input[name=busca]')?.focus()"><i class="ph ph-sliders-horizontal"></i> Filtrar</button>
        <button class="btn btn-outline btn-sm" onclick="location.reload()"><i class="ph ph-arrows-clockwise"></i> Atualizar</button>
    </div>
</div>

<?php if (!$temContas): ?>
    <div class="card placeholder-card">
        <p class="muted"><?= htmlspecialchars(t('painel.sem_contas'), ENT_QUOTES, 'UTF-8') ?></p>
        <p><a href="/contas" class="btn btn-primary"><?= htmlspecialchars(t('painel.ir_para_contas'), ENT_QUOTES, 'UTF-8') ?></a></p>
    </div>
<?php else: ?>

<!-- Card da Linha do Tempo / Timeline Mensal estilo MyFinance -->
<div class="card" style="border-radius: 16px; padding: 18px 24px; margin-bottom: 16px;">
    <!-- Sub-filtros superiores -->
    <?php
    $queryParams = $_GET;
    $buildLink = function(array $novosParams) use ($queryParams) {
        return '/?' . http_build_query(array_merge($queryParams, $novosParams));
    };
    ?>
    <div style="display: flex; gap: 16px; margin-bottom: 8px; font-size: 12px; font-weight: 600; flex-wrap: wrap;">
        <a href="<?= $buildLink(['tipo' => 'todas']) ?>" style="text-decoration: none; color: <?= $filtros['tipo'] === 'todas' ? 'var(--text)' : 'var(--muted)' ?>; <?= $filtros['tipo'] === 'todas' ? 'border-bottom: 2px solid var(--text); padding-bottom: 2px;' : '' ?>">Despesas e receitas</a>
        <a href="<?= $buildLink(['tipo' => 'despesas']) ?>" style="text-decoration: none; color: <?= $filtros['tipo'] === 'despesas' ? 'var(--text)' : 'var(--muted)' ?>; <?= $filtros['tipo'] === 'despesas' ? 'border-bottom: 2px solid var(--text); padding-bottom: 2px;' : '' ?>">Despesas</a>
        <a href="<?= $buildLink(['tipo' => 'receitas']) ?>" style="text-decoration: none; color: <?= $filtros['tipo'] === 'receitas' ? 'var(--text)' : 'var(--muted)' ?>; <?= $filtros['tipo'] === 'receitas' ? 'border-bottom: 2px solid var(--text); padding-bottom: 2px;' : '' ?>">Receitas</a>
    </div>
    <p class="muted" style="font-size: 11px; margin: 0 0 16px 0;">Lançamentos de <?= htmlspecialchars($filtros['tipo'], ENT_QUOTES, 'UTF-8') ?> no período selecionado.</p>

    <!-- Linha de Meses com Curva Grafica -->
    <div style="position: relative; overflow-x: auto; padding: 20px 10px 10px;">
        <!-- Curva SVG de fundo -->
        <svg style="position: absolute; top: 35px; left: 0; width: 100%; height: 40px; pointer-events: none; z-index: 1;" preserveAspectRatio="none" viewBox="0 0 1000 40">
            <path d="M 40 25 Q 140 30, 240 10 T 440 25 L 960 25" fill="none" stroke="#ef4444" stroke-width="2.5" stroke-dasharray="0" />
            <path d="M 440 25 L 960 25" fill="none" stroke="#9aa0aa" stroke-width="1.5" stroke-dasharray="4" />
        </svg>

        <div style="display: flex; justify-content: space-between; min-width: 900px; position: relative; z-index: 2;">
            <?php if (!empty($mesesTira)): ?>
                <?php foreach ($mesesTira as $item): ?>
                    <?php
                    $nomeMes = $nomesMeses[$item['mes']] . ($item['ano'] !== $periodo['ano'] ? " '" . substr((string)$item['ano'], -2) : '');
                    $valorFormatado = moeda((float) $item['total']);
                    ?>
                    <a href="<?= $linkMes($item['mes'], $item['ano']) ?>" style="text-decoration: none; color: inherit; display: flex; flex-direction: column; align-items: center; gap: 8px;">
                        <div style="border-radius: 12px; padding: 6px 14px; text-align: center; border: <?= $item['atual'] ? '2px solid #ef4444' : '1px solid transparent' ?>; background: <?= $item['atual'] ? 'var(--card)' : 'transparent' ?>; box-shadow: <?= $item['atual'] ? '0 4px 12px rgba(239, 68, 68, 0.15)' : 'none' ?>;">
                            <span style="font-size: 11px; font-weight: 600; color: <?= $item['atual'] ? '#ef4444' : 'var(--muted)' ?>; display: block;"><?= htmlspecialchars($nomeMes, ENT_QUOTES, 'UTF-8') ?></span>
                            <div style="width: 6px; height: 6px; border-radius: 50%; background: <?= $item['atual'] ? '#ef4444' : '#9aa0aa' ?>; margin: 4px auto;"></div>
                            <span style="font-size: 10.5px; font-weight: 700; color: <?= $item['atual'] ? '#ef4444' : 'var(--muted)' ?>;"><?= htmlspecialchars($valorFormatado, ENT_QUOTES, 'UTF-8') ?></span>
                        </div>
                    </a>
                <?php endforeach; ?>
            <?php endif; ?>
        </div>
    </div>
</div>

<!-- Grid dos 4 Cards de Resumo MyFinance -->
<div class="resumo-grid" style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px; margin-bottom: 20px;">
    <!-- Card 1: Saldo Anterior -->
    <div class="card resumo-card" style="border-radius: 16px; padding: 18px 20px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
            <span class="resumo-card__label" style="font-size: 12px; color: var(--muted); font-weight: 600; display: flex; align-items: center; gap: 6px;">
                <i class="ph ph-bank"></i> Saldo Anterior
            </span>
            <span class="muted" style="font-size: 10.5px;">Até 31 De Agosto</span>
        </div>
        <div class="resumo-card__valor" style="font-size: 20px; font-weight: 700; color: #2563eb; margin-top: 12px;">
            <?= htmlspecialchars(moeda((float) $resumo['saldo_anterior']), ENT_QUOTES, 'UTF-8') ?>
        </div>
    </div>

    <!-- Card 2: Receitas -->
    <div class="card resumo-card" style="border-radius: 16px; padding: 18px 20px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
                <span class="resumo-card__label" style="font-size: 12px; color: var(--green); font-weight: 600; display: flex; align-items: center; gap: 6px;">
                    <i class="ph ph-trend-up"></i> Receitas
                </span>
                <span class="muted" style="font-size: 10.5px;">1 De <?= $nomesMeses[$periodo['mes']] ?> - 30 De <?= $nomesMeses[$periodo['mes']] ?></span>
            </div>
            <span class="resumo-card__valor" style="font-size: 18px; font-weight: 700; color: var(--green);">
                <?= htmlspecialchars(moeda((float) $resumo['receitas_recebidas']), ENT_QUOTES, 'UTF-8') ?>
            </span>
        </div>
        <div style="margin-top: 14px; display: flex; flex-direction: column; gap: 4px; font-size: 11px; border-top: 1px solid var(--border); padding-top: 8px;">
            <div style="display: flex; justify-content: space-between;"><span class="muted"><i class="ph ph-check-circle" style="color: var(--green);"></i> Recebido</span> <strong><?= htmlspecialchars(moeda((float) $resumo['receitas_recebidas']), ENT_QUOTES, 'UTF-8') ?></strong></div>
            <div style="display: flex; justify-content: space-between;"><span class="muted"><i class="ph ph-clock" style="color: var(--muted);"></i> A receber</span> <strong><?= htmlspecialchars(moeda((float) $resumo['receitas_a_receber']), ENT_QUOTES, 'UTF-8') ?></strong></div>
        </div>
    </div>

    <!-- Card 3: Despesas -->
    <div class="card resumo-card" style="border-radius: 16px; padding: 18px 20px;">
        <div style="display: flex; justify-content: space-between; align-items: flex-start;">
            <div>
                <span class="resumo-card__label" style="font-size: 12px; color: var(--red); font-weight: 600; display: flex; align-items: center; gap: 6px;">
                    <i class="ph ph-trend-down"></i> Despesas
                </span>
                <span class="muted" style="font-size: 10.5px;">1 De <?= $nomesMeses[$periodo['mes']] ?> - 30 De <?= $nomesMeses[$periodo['mes']] ?></span>
            </div>
            <span class="resumo-card__valor" style="font-size: 18px; font-weight: 700; color: var(--red);">
                <?= htmlspecialchars(moeda((float) -$resumo['despesas_pagas']), ENT_QUOTES, 'UTF-8') ?>
            </span>
        </div>
        <div style="margin-top: 14px; display: flex; flex-direction: column; gap: 4px; font-size: 11px; border-top: 1px solid var(--border); padding-top: 8px;">
            <div style="display: flex; justify-content: space-between;"><span class="muted"><i class="ph ph-check-circle" style="color: var(--green);"></i> Pago</span> <strong><?= htmlspecialchars(moeda((float) $resumo['despesas_pagas']), ENT_QUOTES, 'UTF-8') ?></strong></div>
            <div style="display: flex; justify-content: space-between;"><span class="muted"><i class="ph ph-clock" style="color: var(--red);"></i> Não pago</span> <strong><?= htmlspecialchars(moeda((float) $resumo['despesas_nao_pagas']), ENT_QUOTES, 'UTF-8') ?></strong></div>
        </div>
    </div>

    <!-- Card 4: Saldo Disponível & Previsto -->
    <div class="card resumo-card" style="border-radius: 16px; padding: 18px 20px; display: flex; flex-direction: column; justify-content: space-between;">
        <div>
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span class="muted" style="font-size: 11px; font-weight: 600;"><i class="ph ph-wallet" style="color: var(--green);"></i> Saldo Disponível</span>
                <strong style="font-size: 14px; color: var(--green);"><?= htmlspecialchars(moeda((float) $resumo['saldo_disponivel']), ENT_QUOTES, 'UTF-8') ?></strong>
            </div>
            <span class="muted" style="font-size: 10px;">Até 30 De <?= $nomesMeses[$periodo['mes']] ?></span>
        </div>
        <div style="border-top: 1px solid var(--border); padding-top: 8px; margin-top: 8px;">
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <span class="muted" style="font-size: 11px; font-weight: 600;"><i class="ph ph-chart-line" style="color: #2563eb;"></i> Saldo Previsto</span>
                <strong style="font-size: 14px; color: #2563eb;"><?= htmlspecialchars(moeda((float) $resumo['saldo_previsto']), ENT_QUOTES, 'UTF-8') ?></strong>
            </div>
            <span class="muted" style="font-size: 10px;">Até 30 De <?= $nomesMeses[$periodo['mes']] ?></span>
        </div>
    </div>
</div>

<form method="get" action="/" class="card categorias-filtros" style="border-radius: 16px; padding: 12px 18px; margin-bottom: 20px; display: flex; align-items: center; justify-content: space-between; gap: 12px;">
    <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
        <?php if (!$periodo['customizado']): ?>
            <input type="hidden" name="mes" value="<?= $periodo['mes'] ?>">
            <input type="hidden" name="ano" value="<?= $periodo['ano'] ?>">
        <?php else: ?>
            <input type="hidden" name="data_inicio" value="<?= htmlspecialchars($periodo['inicio'], ENT_QUOTES, 'UTF-8') ?>">
            <input type="hidden" name="data_fim" value="<?= htmlspecialchars($periodo['fim'], ENT_QUOTES, 'UTF-8') ?>">
        <?php endif; ?>
        <select class="input" name="tipo" onchange="this.form.submit()" style="max-width:140px; border-radius: 20px;">
            <option value="todas" <?= $filtros['tipo'] === 'todas' ? 'selected' : '' ?>><?= htmlspecialchars(t('painel.filtro.todas'), ENT_QUOTES, 'UTF-8') ?></option>
            <option value="receitas" <?= $filtros['tipo'] === 'receitas' ? 'selected' : '' ?>><?= htmlspecialchars(t('painel.filtro.receitas'), ENT_QUOTES, 'UTF-8') ?></option>
            <option value="despesas" <?= $filtros['tipo'] === 'despesas' ? 'selected' : '' ?>><?= htmlspecialchars(t('painel.filtro.despesas'), ENT_QUOTES, 'UTF-8') ?></option>
        </select>
        <div style="position: relative; flex: 1; max-width: 320px;">
            <i class="ph ph-magnifying-glass" style="position: absolute; left: 12px; top: 50%; transform: translateY(-50%); color: var(--muted);"></i>
            <input class="input" type="text" name="busca" placeholder="<?= htmlspecialchars(t('painel.filtro.buscar_placeholder'), ENT_QUOTES, 'UTF-8') ?>"
                   value="<?= htmlspecialchars($filtros['busca'], ENT_QUOTES, 'UTF-8') ?>" style="padding-left: 36px; border-radius: 20px;">
        </div>
    </div>

    <div class="grafico-toggle painel-ordenacao">
        <a href="<?= $linkOrdenar('data') ?>" class="btn btn-outline btn-sm <?= $ordenacao === 'data' ? 'is-active' : '' ?>" style="border-radius: 20px;"><?= htmlspecialchars(t('painel.ordenar.data'), ENT_QUOTES, 'UTF-8') ?></a>
        <a href="<?= $linkOrdenar('valor') ?>" class="btn btn-outline btn-sm <?= $ordenacao === 'valor' ? 'is-active' : '' ?>" style="border-radius: 20px;"><?= htmlspecialchars(t('painel.ordenar.valor'), ENT_QUOTES, 'UTF-8') ?> ↕</a>
    </div>
</form>

<div class="painel-layout">
<div class="painel-layout__principal">
<?php if (!$lancamentos): ?>
    <div class="card placeholder-card">
        <p class="muted"><?= htmlspecialchars(t('painel.lista_vazia'), ENT_QUOTES, 'UTF-8') ?></p>
    </div>
<?php else: ?>
    <div class="card lancamentos-lista">
        <?php foreach ($lancamentos as $l): ?>
            <?php 
            $ehManual = in_array($l['tipo'], \App\Models\Lancamento::TIPOS_MANUAIS, true); 
            $corBarra = $l['categoria_cor'] ? htmlspecialchars($l['categoria_cor'], ENT_QUOTES, 'UTF-8') : ($l['valor'] < 0 ? 'var(--red)' : 'var(--green)');
            ?>
            <div class="lancamento-linha" style="border-left: 4px solid <?= $corBarra ?>; border-radius: 8px 14px 14px 8px; margin-bottom: 8px;">
                <div class="lancamento-linha__data muted"><?= htmlspecialchars($formatarData($l['data_competencia']), ENT_QUOTES, 'UTF-8') ?></div>

                <div class="lancamento-linha__principal">
                    <div class="lancamento-linha__descricao">
                        <?php if (!$ehManual): ?>
                            <span class="badge badge-neutro"><i class="<?= $l['tipo'] === 'transferencia' ? 'ph ph-arrows-left-right' : 'ph ph-scales' ?>"></i> <?= htmlspecialchars(t('lancamento.tipo.' . $l['tipo']), ENT_QUOTES, 'UTF-8') ?></span>
                        <?php endif; ?>
                        <strong><?= htmlspecialchars($l['descricao'], ENT_QUOTES, 'UTF-8') ?></strong>
                    </div>
                    <div class="lancamento-linha__tags">
                        <?php if ($l['categoria_nome']): ?>
                            <?php $corCategoria = htmlspecialchars($l['categoria_cor'], ENT_QUOTES, 'UTF-8'); ?>
                            <span class="lancamento-tag" style="--cor: <?= $corCategoria ?>"><span class="categoria-dot" style="--cor: <?= $corCategoria ?>"></span><?= htmlspecialchars($l['categoria_nome'], ENT_QUOTES, 'UTF-8') ?></span>
                        <?php endif; ?>
                        <span class="lancamento-tag muted"><i class="ph ph-bank"></i> <?= htmlspecialchars($l['conta_nome'], ENT_QUOTES, 'UTF-8') ?></span>
                        <span class="badge <?= $l['status'] === 'pago' ? 'badge-sucesso' : 'badge-pendente' ?>"><?= htmlspecialchars(t('lancamento.status.' . $l['status']), ENT_QUOTES, 'UTF-8') ?></span>
                        <?php if ($l['recorrente']): ?><span class="badge badge-neutro" title="<?= htmlspecialchars(t('painel.lancamento.recorrente_label'), ENT_QUOTES, 'UTF-8') ?>"><i class="ph ph-arrows-clockwise"></i></span><?php endif; ?>
                    </div>
                </div>

                <div style="text-align: right;">
                    <div class="lancamento-linha__valor <?= $l['valor'] < 0 ? 'valor-negativo' : 'valor-positivo' ?>">
                        <?= htmlspecialchars(moeda((float) $l['valor']), ENT_QUOTES, 'UTF-8') ?>
                    </div>
                    <div style="font-size: 11px; color: var(--muted); margin-top: 2px;">
                        <?= htmlspecialchars($formatarData(substr($l['created_at'] ?? $l['data_competencia'], 0, 10)), ENT_QUOTES, 'UTF-8') ?>
                        <?php if (!empty($l['data_pagamento']) && $l['data_pagamento'] !== $l['data_competencia']): ?>
                            · Venc: <?= htmlspecialchars($formatarData($l['data_pagamento']), ENT_QUOTES, 'UTF-8') ?>
                        <?php endif; ?>
                    </div>
                </div>

                <div class="lancamento-linha__acoes">
                    <?php if ($ehManual): ?>
                        <?php if ($l['status'] === 'pendente'): ?>
                            <form method="post" action="/lancamentos/<?= $l['id'] ?>/marcar-pago">
                                <?= Csrf::campo() ?>
                                <input type="hidden" name="voltar" value="<?= htmlspecialchars($voltarPara, ENT_QUOTES, 'UTF-8') ?>">
                                <button type="submit" class="icon-btn" title="<?= htmlspecialchars(t('painel.lancamento.marcar_pago'), ENT_QUOTES, 'UTF-8') ?>"><i class="ph ph-check-circle" style="color: var(--green); font-size: 18px;"></i></button>
                            </form>
                        <?php endif; ?>
                        <button type="button" class="icon-btn" title="<?= htmlspecialchars(t('categorias.editar'), ENT_QUOTES, 'UTF-8') ?>" data-modal-open="modal-editar-lancamento-<?= $l['id'] ?>"><i class="ph ph-pencil-simple" style="font-size: 16px;"></i></button>
                        <form method="post" action="/lancamentos/<?= $l['id'] ?>/excluir" onsubmit="return confirm('<?= htmlspecialchars(t('painel.lancamento.confirmar_exclusao'), ENT_QUOTES, 'UTF-8') ?>');">
                            <?= Csrf::campo() ?>
                            <input type="hidden" name="voltar" value="<?= htmlspecialchars($voltarPara, ENT_QUOTES, 'UTF-8') ?>">
                            <button type="submit" class="icon-btn" title="<?= htmlspecialchars(t('painel.lancamento.excluir'), ENT_QUOTES, 'UTF-8') ?>"><i class="ph ph-trash" style="color: var(--red); font-size: 16px;"></i></button>
                        </form>
                    <?php endif; ?>
                </div>
            </div>

            <?php if ($ehManual): $alvo = $l; require __DIR__ . '/_modal_editar.php'; endif; ?>
        <?php endforeach; ?>
    </div>

    <div class="card paginacao">
        <span class="paginacao__info muted">
            <?= htmlspecialchars(t('painel.paginacao.mostrando', ['n' => $porPagina]), ENT_QUOTES, 'UTF-8') ?>
            · <?= htmlspecialchars(t('painel.paginacao.total', ['n' => $totalRegistros]), ENT_QUOTES, 'UTF-8') ?>
        </span>
        <div class="paginacao__nav">
            <?php if ($paginaAtual > 1): ?>
                <a href="<?= $linkPagina($paginaAtual - 1) ?>" class="btn btn-outline btn-sm">← <?= htmlspecialchars(t('painel.paginacao.voltar'), ENT_QUOTES, 'UTF-8') ?></a>
            <?php endif; ?>
            <?php if ($paginaAtual < $totalPaginas): ?>
                <a href="<?= $linkPagina($paginaAtual + 1) ?>" class="btn btn-outline btn-sm"><?= htmlspecialchars(t('painel.paginacao.proximo'), ENT_QUOTES, 'UTF-8') ?> →</a>
            <?php endif; ?>
        </div>
    </div>
<?php endif; ?>
</div>

<div class="card painel-lateral" style="border-radius: 16px; padding: 20px;">
    <h3 class="grafico-card__titulo" style="font-size: 15px; font-weight: 700; margin-bottom: 12px;">Gráficos</h3>

    <!-- Abas de filtro do gráfico -->
    <div class="tabs" style="display: flex; gap: 8px; overflow-x: auto; margin-bottom: 16px; font-size: 11px; padding-bottom: 4px;">
        <button type="button" class="btn btn-outline btn-sm tabs__item is-active" style="border-radius: 20px; font-size: 11px;" onclick="gfTrocarAbaLateral('todas', this)">Todas</button>
        <button type="button" class="btn btn-outline btn-sm tabs__item" style="border-radius: 20px; font-size: 11px;" onclick="gfTrocarAbaLateral('receitas', this)">Receitas</button>
        <button type="button" class="btn btn-outline btn-sm tabs__item" style="border-radius: 20px; font-size: 11px;" onclick="gfTrocarAbaLateral('despesas', this)">Despesas</button>
    </div>

    <div style="text-align: center; margin-bottom: 16px;">
        <h4 style="margin: 0; font-size: 13px; font-weight: 700;">Todas Receitas e Despesas</h4>
        <span class="muted" style="font-size: 11px;">1 De <?= $nomesMeses[$periodo['mes']] ?> - 30 De <?= $nomesMeses[$periodo['mes']] ?></span>
    </div>

    <?php if (!$temDadosLateral): ?>
        <p class="muted" style="text-align: center; font-size: 13px; padding: 20px 0;"><?= htmlspecialchars(t('relatorios.sem_dados_periodo'), ENT_QUOTES, 'UTF-8') ?></p>
    <?php else: ?>
        <div class="grafico-card__canvas-wrap" style="position: relative; width: 200px; height: 200px; margin: 0 auto 20px;">
            <canvas id="chart-painel-lateral"></canvas>
            <div style="position: absolute; top: 50%; left: 50%; transform: translate(-50%, -50%); text-align: center; pointer-events: none;">
                <div style="font-size: 13px; font-weight: 800; color: var(--text);"><?= htmlspecialchars(moeda(abs((float)$resumo['despesas_pagas'] - (float)$resumo['receitas_recebidas'])), ENT_QUOTES, 'UTF-8') ?></div>
                <span class="muted" style="font-size: 10px; text-transform: uppercase;">Balanço</span>
            </div>
        </div>

        <div id="painel-lateral-legenda" style="display: flex; justify-content: space-around; border-top: 1px solid var(--border); padding-top: 14px; font-size: 12px;">
            <div style="display: flex; flex-direction: column; gap: 2px;">
                <span style="display: flex; align-items: center; gap: 6px; color: var(--green); font-weight: 600;">
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--green);"></span> <span data-lateral-nome>Receitas</span>
                </span>
                <strong data-lateral-valor><?= htmlspecialchars(moeda((float) $resumo['receitas_recebidas']), ENT_QUOTES, 'UTF-8') ?></strong>
            </div>
            <div style="display: flex; flex-direction: column; gap: 2px;">
                <span style="display: flex; align-items: center; gap: 6px; color: var(--red); font-weight: 600;">
                    <span style="width: 8px; height: 8px; border-radius: 50%; background: var(--red);"></span> <span data-lateral-nome>Despesas</span>
                </span>
                <strong data-lateral-valor><?= htmlspecialchars(moeda((float) $resumo['despesas_pagas']), ENT_QUOTES, 'UTF-8') ?></strong>
            </div>
        </div>
    <?php endif; ?>
</div>
</div>

<?php $tipoModal = 'receita'; require __DIR__ . '/_modal_novo.php'; ?>
<?php $tipoModal = 'despesa'; require __DIR__ . '/_modal_novo.php'; ?>

<script>
// Arvore de categorias (topo + subcategorias) usada pelos selects
// dependentes Categoria -> Subcategoria em todos os modais de lançamento
// desta página (nova receita, nova despesa, e cada modal de edição).
window.gfCategoriasArvore = <?= json_encode(array_map(static function (array $cat): array {
    return [
        'id'   => (int) $cat['id'],
        'nome' => $cat['nome'],
        'subcategorias' => array_map(static function (array $sub): array {
            return ['id' => (int) $sub['id'], 'nome' => $sub['nome']];
        }, $cat['subcategorias']),
    ];
}, $categoriasArvore), JSON_UNESCAPED_UNICODE) ?>;
</script>

<?php if ($temDadosLateral): ?>
<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
<script>
// Mini donut do card lateral do Painel (Todas/Receitas/Despesas). Os 3
// conjuntos de dados (valores brutos pro grafico + ja formatados na moeda
// atual pra legenda) vem prontos do PHP - calculados a partir do mesmo
// $resumo que os cards de resumo acima ja mostram, sem nenhum request novo
// ao servidor - e a troca de aba so atualiza o dataset do Chart.js + a
// legenda, 100% client-side.
var gfDadosLateral = <?= json_encode($dadosLateral, JSON_UNESCAPED_UNICODE) ?>;

(function () {
    var estilo = getComputedStyle(document.documentElement);
    var corVerde = estilo.getPropertyValue('--green').trim() || '#16a34a';
    var corVermelha = estilo.getPropertyValue('--red').trim() || '#dc2626';

    var dados = gfDadosLateral;
    var abaAtual = 'todas';

    var chartLateral = new Chart(document.getElementById('chart-painel-lateral'), {
        type: 'doughnut',
        data: {
            labels: dados[abaAtual].labels,
            datasets: [{
                data: dados[abaAtual].valores,
                backgroundColor: [corVerde, corVermelha],
                borderWidth: 0,
            }],
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            cutout: '75%',
            plugins: { legend: { display: false } },
        },
    });

    function gfAtualizarLegendaLateral(chave) {
        document.querySelectorAll('#painel-lateral-legenda [data-lateral-nome]').forEach(function (el, i) {
            el.textContent = dados[chave].labels[i];
        });
        document.querySelectorAll('#painel-lateral-legenda [data-lateral-valor]').forEach(function (el, i) {
            el.textContent = dados[chave].formatados[i];
        });
    }
    gfAtualizarLegendaLateral(abaAtual);

    window.gfTrocarAbaLateral = function (chave, botao) {
        abaAtual = chave;
        chartLateral.data.labels = dados[chave].labels;
        chartLateral.data.datasets[0].data = dados[chave].valores;
        chartLateral.update();
        gfAtualizarLegendaLateral(chave);

        botao.parentElement.querySelectorAll('.tabs__item').forEach(function (b) { b.classList.remove('is-active'); });
        botao.classList.add('is-active');
    };
})();
</script>
<?php endif; ?>

<?php endif; ?>
