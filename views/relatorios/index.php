<?php

use App\Core\Csrf;
use App\Core\I18n;

/** @var array $periodo */
/** @var string $aba */
/** @var array $despesasPorCategoria */
/** @var array $receitasPorCategoria */
/** @var float $totalDespesas */
/** @var float $totalReceitas */
/** @var array $frequencia */
/** @var array $pendentes */
/** @var int $anoAnual */
/** @var int $anoAtual */
/** @var array|null $demonstrativoAnual */

$formatoData = I18n::idioma() === 'en-US' ? 'm/d/Y' : 'd/m/Y';
$formatarData = function (?string $valor) use ($formatoData): string {
    return $valor ? date($formatoData, strtotime($valor)) : '—';
};

$semCategoriaNome = t('relatorios.sem_categoria');
$semCategoriaCor = '#9aa0aa';

// Rotula as linhas "sem categoria" (categoria_id = 0, vindas do Model sem
// nome/cor porque Models nao lidam com traducao) - feito aqui na view, ja
// que so aqui o idioma correto do usuario esta garantidamente carregado.
$comLabel = function (array $linhas) use ($semCategoriaNome, $semCategoriaCor): array {
    foreach ($linhas as &$linha) {
        if ((int) $linha['categoria_id'] === 0 || $linha['categoria_nome'] === null) {
            $linha['categoria_id'] = 0;
            $linha['categoria_nome'] = $semCategoriaNome;
            $linha['categoria_cor'] = $semCategoriaCor;
        }
    }
    return $linhas;
};

$despesasPorCategoria = $comLabel($despesasPorCategoria);
$receitasPorCategoria = $comLabel($receitasPorCategoria);

$queryBase = [];
if (!$periodo['customizado']) {
    $queryBase['mes'] = $periodo['mes'];
    $queryBase['ano'] = $periodo['ano'];
} else {
    $queryBase['data_inicio'] = $periodo['inicio'];
    $queryBase['data_fim'] = $periodo['fim'];
}

$linkMes = function (?int $mes = null, ?int $ano = null) use ($aba): string {
    $mes = $mes ?? (int) date('n');
    $ano = $ano ?? (int) date('Y');
    $q = ['mes' => $mes, 'ano' => $ano];
    if ($aba !== 'graficos') {
        $q['aba'] = $aba;
    }
    return '/relatorios?' . http_build_query($q);
};

$linkHoje = function () use ($aba): string {
    return $aba !== 'graficos' ? ('/relatorios?' . http_build_query(['aba' => $aba])) : '/relatorios';
};

$linkAba = function (string $novaAba) use ($queryBase): string {
    return '/relatorios?' . http_build_query($queryBase + ['aba' => $novaAba]);
};

$nomesMeses = [
    1 => t('painel.mes.1'), 2 => t('painel.mes.2'), 3 => t('painel.mes.3'), 4 => t('painel.mes.4'),
    5 => t('painel.mes.5'), 6 => t('painel.mes.6'), 7 => t('painel.mes.7'), 8 => t('painel.mes.8'),
    9 => t('painel.mes.9'), 10 => t('painel.mes.10'), 11 => t('painel.mes.11'), 12 => t('painel.mes.12'),
];
// Versao abreviada (3 letras) dos meses, so pro cabecalho da tabela do
// Demonstrativo Anual - evita 12 chaves de traducao novas so pra isso.
$nomesMesesAbrev = array_map(static fn (string $nome): string => mb_substr($nome, 0, 3), $nomesMeses);

$abas = [
    'graficos'            => ['icone' => '<i class="ph ph-chart-line"></i>', 'label' => 'Gráficos'],
    'pendentes'           => ['icone' => '<i class="ph ph-clock"></i>', 'label' => 'Lançamentos pendentes'],
    'demonstrativo'       => ['icone' => '<i class="ph ph-file-text"></i>', 'label' => 'Demonstrativo Financeiro'],
    'demonstrativo_anual' => ['icone' => '<i class="ph ph-calendar"></i>', 'label' => 'Demonstrativo Anual'],
];

// Navegacao de ano da aba Demonstrativo Anual - parametro proprio
$linkAnoAnual = function (int $ano) use ($queryBase): string {
    return '/relatorios?' . http_build_query($queryBase + ['aba' => 'demonstrativo_anual', 'ano_anual' => $ano]);
};

$dataHoje = date('Y-m-d');
$data7Dias = date('Y-m-d', strtotime('-7 days'));
$dataAnoInicio = date('Y-01-01');
$dataAnoFim = date('Y-12-31');

$linkDataRange = function(string $inicio, string $fim) use ($aba): string {
    $q = ['data_inicio' => $inicio, 'data_fim' => $fim];
    if ($aba !== 'graficos') {
        $q['aba'] = $aba;
    }
    return '/relatorios?' . http_build_query($q);
};

$e7Dias = $periodo['customizado'] && $periodo['inicio'] === $data7Dias && $periodo['fim'] === $dataHoje;
$eAno = $periodo['customizado'] && $periodo['inicio'] === $dataAnoInicio && $periodo['fim'] === $dataAnoFim;
$eMes = !$periodo['customizado'] && $periodo['e_mes_atual'];
$eHoje = $periodo['customizado'] && $periodo['inicio'] === $dataHoje && $periodo['fim'] === $dataHoje;
?>

<!-- Breadcrumb Granazen > Relatórios -->
<div style="font-size: 12px; color: var(--muted); margin-bottom: 12px; display: flex; align-items: center; gap: 6px;">
    <span>Granazen</span> <i class="ph ph-caret-right" style="font-size: 10px;"></i> <strong style="color: var(--text);">Relatórios</strong>
</div>

<!-- Sub-menu de Relatórios no estilo MyFinance -->
<div class="tabs" style="display: flex; gap: 16px; margin-bottom: 20px; border-bottom: 1px solid var(--border); padding-bottom: 8px; overflow-x: auto;">
    <?php foreach ($abas as $chave => $info): ?>
        <a href="<?= $linkAba($chave) ?>" class="tabs__item <?= $aba === $chave ? 'is-active' : '' ?>" style="display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 600; padding: 8px 12px; border-radius: 8px; text-decoration: none; color: <?= $aba === $chave ? 'var(--text)' : 'var(--muted)' ?>; background: <?= $aba === $chave ? 'var(--card)' : 'transparent' ?>; border: <?= $aba === $chave ? '1px solid var(--border)' : 'none' ?>;">
            <?= $info['icone'] ?> <?= htmlspecialchars($info['label'], ENT_QUOTES, 'UTF-8') ?>
            <?php if ($chave === 'pendentes' && $pendentes): ?><span class="badge badge-neutro" style="font-size: 10px; padding: 2px 6px;"><?= count($pendentes) ?></span><?php endif; ?>
        </a>
    <?php endforeach; ?>
</div>

<!-- Barra de Filtros e Controles de Período MyFinance -->
<div class="myfinance-top-controls card" style="display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 20px; padding: 12px 18px;">
    <div style="display: flex; align-items: center; gap: 8px;">
        <a class="btn btn-outline btn-sm" href="<?= $linkMes($periodo['mes_anterior'], $periodo['ano_anterior']) ?>"><i class="ph ph-caret-left"></i></a>
        <strong style="font-size: 15px; font-weight: 600; min-width: 100px; text-align: center;"><?= htmlspecialchars($nomesMeses[$periodo['mes']], ENT_QUOTES, 'UTF-8') ?></strong>
        <a class="btn btn-outline btn-sm" href="<?= $linkMes($periodo['mes_proximo'], $periodo['ano_proximo']) ?>"><i class="ph ph-caret-right"></i></a>
        <a href="<?= $linkDataRange($dataHoje, $dataHoje) ?>" class="btn <?= $eHoje ? 'btn-primary' : 'btn-outline' ?> btn-sm" style="border-radius: 20px; margin-left: 8px;"><?= htmlspecialchars(t('painel.hoje'), ENT_QUOTES, 'UTF-8') ?></a>
        <a href="<?= $linkDataRange($data7Dias, $dataHoje) ?>" class="btn <?= $e7Dias ? 'btn-primary' : 'btn-outline' ?> btn-sm" style="border-radius: 20px;">7 dias atrás</a>
        <a href="<?= $linkMes(date('n'), date('Y')) ?>" class="btn <?= $eMes ? 'btn-primary' : 'btn-outline' ?> btn-sm" style="border-radius: 20px;">Esse mês</a>
        <a href="<?= $linkDataRange($dataAnoInicio, $dataAnoFim) ?>" class="btn <?= $eAno ? 'btn-primary' : 'btn-outline' ?> btn-sm" style="border-radius: 20px;">Esse ano</a>
        <span class="muted" style="font-size: 13px; background: var(--bg); padding: 6px 12px; border-radius: 20px; border: 1px solid var(--border);">
            <i class="ph ph-calendar-blank"></i> <?= date('d/m/Y', strtotime($periodo['inicio'])) ?> - <?= date('d/m/Y', strtotime($periodo['fim'])) ?>
        </span>
    </div>
    <div style="display: flex; align-items: center; gap: 8px;">
        <button class="btn btn-outline btn-sm"><i class="ph ph-eye"></i></button>
        <button class="btn btn-outline btn-sm"><i class="ph ph-sliders-horizontal"></i> Filtrar</button>
        <button class="btn btn-outline btn-sm" onclick="location.reload()"><i class="ph ph-arrows-clockwise"></i> Atualizar</button>
    </div>
</div>

<?php if ($aba === 'graficos'): ?>

    <div style="margin-bottom: 20px;">
        <h2 style="font-size: 20px; font-weight: 700; margin: 0 0 4px 0; color: var(--text);"><?= htmlspecialchars(t('painel.graficos_analise'), ENT_QUOTES, 'UTF-8') ?></h2>
        <span style="font-size: 13px; color: var(--muted);"><?= htmlspecialchars(t('painel.analise_subtitulo'), ENT_QUOTES, 'UTF-8') ?></span>
    </div>

    <!-- 3x2 Grid de Gráficos de Análise -->
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 20px; margin-bottom: 24px;">

        <!-- Card 1 (Topo Esquerda): Receitas por Categoria -->
        <div class="card" style="border-radius: 16px; padding: 20px; background: var(--card); border: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div>
                    <h3 style="font-size: 15px; font-weight: 700; margin: 0; color: var(--green);"><?= htmlspecialchars(t('relatorios.rec_categoria'), ENT_QUOTES, 'UTF-8') ?></h3>
                    <span style="font-size: 11px; color: var(--muted);"><?= date('d/m/Y', strtotime($periodo['inicio'])) ?> - <?= date('d/m/Y', strtotime($periodo['fim'])) ?></span>
                </div>
                <i class="ph ph-dots-three-vertical muted" style="cursor: pointer;"></i>
            </div>
            <?php if (!$receitasPorCategoria): ?>
                <p class="muted" style="font-size: 13px; text-align: center; padding: 30px 0;"><?= htmlspecialchars(t('relatorios.sem_dados_periodo'), ENT_QUOTES, 'UTF-8') ?></p>
            <?php else: ?>
                <div style="height: 180px; position: relative; margin-bottom: 16px;">
                    <canvas id="chart-receitas"></canvas>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px;">
                    <?php foreach ($receitasPorCategoria as $linha): ?>
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span class="categoria-dot" style="--cor: <?= htmlspecialchars($linha['categoria_cor'], ENT_QUOTES, 'UTF-8') ?>"></span>
                                <span style="font-weight: 500; color: var(--text);"><?= htmlspecialchars($linha['categoria_nome'], ENT_QUOTES, 'UTF-8') ?></span>
                            </div>
                            <div>
                                <strong style="margin-right: 8px; color: var(--text);"><?= htmlspecialchars(moeda((float) $linha['total']), ENT_QUOTES, 'UTF-8') ?></strong>
                                <span class="muted"><?= $totalReceitas > 0 ? number_format(($linha['total'] / $totalReceitas) * 100, 1) : '0' ?>%</span>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </div>

        <!-- Card 2 (Topo Centro): Despesas por Categoria -->
        <div class="card" style="border-radius: 16px; padding: 20px; background: var(--card); border: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div>
                    <h3 style="font-size: 15px; font-weight: 700; margin: 0; color: var(--red);"><?= htmlspecialchars(t('relatorios.desp_categoria'), ENT_QUOTES, 'UTF-8') ?></h3>
                    <span style="font-size: 11px; color: var(--muted);"><?= date('d/m/Y', strtotime($periodo['inicio'])) ?> - <?= date('d/m/Y', strtotime($periodo['fim'])) ?></span>
                </div>
                <i class="ph ph-dots-three-vertical muted" style="cursor: pointer;"></i>
            </div>
            <?php if (!$despesasPorCategoria): ?>
                <p class="muted" style="font-size: 13px; text-align: center; padding: 30px 0;"><?= htmlspecialchars(t('relatorios.sem_dados_periodo'), ENT_QUOTES, 'UTF-8') ?></p>
            <?php else: ?>
                <div style="height: 180px; position: relative; margin-bottom: 16px;">
                    <canvas id="chart-despesas"></canvas>
                </div>
                <div style="display: flex; flex-direction: column; gap: 8px; font-size: 12px;">
                    <?php foreach ($despesasPorCategoria as $linha): ?>
                        <div style="display: flex; align-items: center; justify-content: space-between;">
                            <div style="display: flex; align-items: center; gap: 6px;">
                                <span class="categoria-dot" style="--cor: <?= htmlspecialchars($linha['categoria_cor'], ENT_QUOTES, 'UTF-8') ?>"></span>
                                <span style="font-weight: 500; color: var(--text);"><?= htmlspecialchars($linha['categoria_nome'], ENT_QUOTES, 'UTF-8') ?></span>
                            </div>
                            <div>
                                <strong style="margin-right: 8px; color: var(--text);"><?= htmlspecialchars(moeda((float) $linha['total']), ENT_QUOTES, 'UTF-8') ?></strong>
                                <span class="muted"><?= $totalDespesas > 0 ? number_format(($linha['total'] / $totalDespesas) * 100, 1) : '0' ?>%</span>
                            </div>
                        </div>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>
        </div>

        <!-- Card 3 (Topo Direita): Despesas por Pessoa -->
        <div class="card" style="border-radius: 16px; padding: 20px; background: var(--card); border: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div>
                    <h3 style="font-size: 15px; font-weight: 700; margin: 0; color: var(--red);"><?= htmlspecialchars(t('relatorios.desp_pessoa'), ENT_QUOTES, 'UTF-8') ?></h3>
                    <span style="font-size: 11px; color: var(--muted);"><?= date('d/m/Y', strtotime($periodo['inicio'])) ?> - <?= date('d/m/Y', strtotime($periodo['fim'])) ?></span>
                </div>
                <i class="ph ph-dots-three-vertical muted" style="cursor: pointer;"></i>
            </div>
            <div style="margin-top: 10px;">
                <span class="muted" style="font-size: 11px; text-transform: uppercase; font-weight: 600;">Total</span>
                <div style="font-size: 20px; font-weight: 800; color: var(--text); margin: 2px 0 16px;">
                    <?= htmlspecialchars(moeda($totalDespesas), ENT_QUOTES, 'UTF-8') ?>
                </div>
                <div style="display: flex; align-items: center; justify-content: space-between; font-size: 13px; margin-bottom: 6px; color: var(--text);">
                    <span style="display: flex; align-items: center; gap: 8px; font-weight: 600;">
                        <i class="ph ph-user-circle" style="font-size: 20px;"></i> Usuario
                    </span>
                    <strong><?= htmlspecialchars(moeda($totalDespesas), ENT_QUOTES, 'UTF-8') ?></strong>
                </div>
                <div style="width: 100%; height: 8px; background: var(--bg); border-radius: 4px; overflow: hidden;">
                    <div style="width: 100%; height: 100%; background: var(--green); border-radius: 4px;"></div>
                </div>
                <div style="text-align: right; font-size: 11px; color: var(--muted); margin-top: 4px;">100.0%</div>
            </div>
        </div>

        <!-- Card 4 (Baixo Esquerda): Receitas por Subcategoria -->
        <div class="card" style="border-radius: 16px; padding: 20px; background: var(--card); border: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div>
                    <h3 style="font-size: 15px; font-weight: 700; margin: 0; color: var(--green);"><?= htmlspecialchars(t('relatorios.rec_subcat'), ENT_QUOTES, 'UTF-8') ?></h3>
                    <span style="font-size: 11px; color: var(--muted);"><?= date('d/m/Y', strtotime($periodo['inicio'])) ?> - <?= date('d/m/Y', strtotime($periodo['fim'])) ?></span>
                </div>
                <i class="ph ph-dots-three-vertical muted" style="cursor: pointer;"></i>
            </div>
            <?php if (!$receitasPorCategoria): ?>
                <p class="muted" style="font-size: 13px; text-align: center; padding: 30px 0;"><?= htmlspecialchars(t('relatorios.sem_dados_periodo'), ENT_QUOTES, 'UTF-8') ?></p>
            <?php else: ?>
                <div style="height: 180px; position: relative; margin-bottom: 16px;">
                    <canvas id="chart-receitas-sub"></canvas>
                </div>
            <?php endif; ?>
        </div>

        <!-- Card 5 (Baixo Centro): Despesas por Subcategoria -->
        <div class="card" style="border-radius: 16px; padding: 20px; background: var(--card); border: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div>
                    <h3 style="font-size: 15px; font-weight: 700; margin: 0; color: var(--red);"><?= htmlspecialchars(t('relatorios.desp_subcat'), ENT_QUOTES, 'UTF-8') ?></h3>
                    <span style="font-size: 11px; color: var(--muted);"><?= date('d/m/Y', strtotime($periodo['inicio'])) ?> - <?= date('d/m/Y', strtotime($periodo['fim'])) ?></span>
                </div>
                <i class="ph ph-dots-three-vertical muted" style="cursor: pointer;"></i>
            </div>
            <?php if (!$despesasPorCategoria): ?>
                <p class="muted" style="font-size: 13px; text-align: center; padding: 30px 0;"><?= htmlspecialchars(t('relatorios.sem_dados_periodo'), ENT_QUOTES, 'UTF-8') ?></p>
            <?php else: ?>
                <div style="height: 180px; position: relative; margin-bottom: 16px;">
                    <canvas id="chart-despesas-sub"></canvas>
                </div>
            <?php endif; ?>
        </div>

        <!-- Card 6 (Baixo Direita): Receitas e Despesas (Frequência) -->
        <div class="card" style="border-radius: 16px; padding: 20px; background: var(--card); border: 1px solid var(--border);">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px;">
                <div>
                    <h3 style="font-size: 15px; font-weight: 700; margin: 0; color: var(--text);"><?= htmlspecialchars(t('relatorios.rec_desp'), ENT_QUOTES, 'UTF-8') ?></h3>
                    <span style="font-size: 11px; color: var(--muted);"><?= date('d/m/Y', strtotime($periodo['inicio'])) ?> - <?= date('d/m/Y', strtotime($periodo['fim'])) ?></span>
                </div>
                <i class="ph ph-dots-three-vertical muted" style="cursor: pointer;"></i>
            </div>
            <div style="height: 220px; position: relative;">
                <?php if (!$frequencia): ?>
                    <p class="muted" style="font-size: 13px; text-align: center; padding: 30px 0;"><?= htmlspecialchars(t('relatorios.sem_dados_periodo'), ENT_QUOTES, 'UTF-8') ?></p>
                <?php else: ?>
                    <canvas id="chart-frequencia"></canvas>
                <?php endif; ?>
            </div>
        </div>

    </div>


    <script src="https://cdn.jsdelivr.net/npm/chart.js"></script>
    <script>
    (function () {
        var estilo = getComputedStyle(document.documentElement);
        var corVerde = estilo.getPropertyValue('--green').trim() || '#16a34a';
        var corVermelha = estilo.getPropertyValue('--red').trim() || '#dc2626';
        var corTexto = estilo.getPropertyValue('--text').trim() || '#16181d';
        var corMuted = estilo.getPropertyValue('--muted').trim() || '#6b7280';

        var donutOpcoes = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { display: false } },
        };

        <?php if ($despesasPorCategoria): ?>
        new Chart(document.getElementById('chart-despesas'), {
            type: 'doughnut',
            data: {
                labels: <?= json_encode(array_column($despesasPorCategoria, 'categoria_nome'), JSON_UNESCAPED_UNICODE) ?>,
                datasets: [{
                    data: <?= json_encode(array_map('floatval', array_column($despesasPorCategoria, 'total'))) ?>,
                    backgroundColor: <?= json_encode(array_column($despesasPorCategoria, 'categoria_cor')) ?>,
                    borderWidth: 0,
                }],
            },
            options: donutOpcoes,
        });
        <?php endif; ?>

        <?php if ($despesasPorCategoria): ?>
        var canvasDespSub = document.getElementById('chart-despesas-sub');
        if (canvasDespSub) {
            new Chart(canvasDespSub, {
                type: 'doughnut',
                data: {
                    labels: <?= json_encode(array_column($despesasPorCategoria, 'categoria_nome'), JSON_UNESCAPED_UNICODE) ?>,
                    datasets: [{
                        data: <?= json_encode(array_map('floatval', array_column($despesasPorCategoria, 'total'))) ?>,
                        backgroundColor: <?= json_encode(array_column($despesasPorCategoria, 'categoria_cor')) ?>,
                        borderWidth: 0,
                    }],
                },
                options: donutOpcoes,
            });
        }
        <?php endif; ?>

        <?php if ($receitasPorCategoria): ?>
        var canvasRecSub = document.getElementById('chart-receitas-sub');
        if (canvasRecSub) {
            new Chart(canvasRecSub, {
                type: 'doughnut',
                data: {
                    labels: <?= json_encode(array_column($receitasPorCategoria, 'categoria_nome'), JSON_UNESCAPED_UNICODE) ?>,
                    datasets: [{
                        data: <?= json_encode(array_map('floatval', array_column($receitasPorCategoria, 'total'))) ?>,
                        backgroundColor: <?= json_encode(array_column($receitasPorCategoria, 'categoria_cor')) ?>,
                        borderWidth: 0,
                    }],
                },
                options: donutOpcoes,
            });
        }
        <?php endif; ?>

        <?php if ($frequencia): ?>
        var freqLabels = <?= json_encode(array_map($formatarData, array_column($frequencia, 'data'))) ?>;
        var freqReceitas = <?= json_encode(array_map('floatval', array_column($frequencia, 'receitas'))) ?>;
        var freqDespesas = <?= json_encode(array_map('floatval', array_column($frequencia, 'despesas'))) ?>;

        var chartFrequencia = null;
        function gfMontarFrequencia(tipo) {
            if (chartFrequencia) {
                chartFrequencia.destroy();
            }
            chartFrequencia = new Chart(document.getElementById('chart-frequencia'), {
                type: tipo,
                data: {
                    labels: freqLabels,
                    datasets: [
                        {
                            label: <?= json_encode(t('relatorios.serie_receitas'), JSON_UNESCAPED_UNICODE) ?>,
                            data: freqReceitas,
                            backgroundColor: tipo === 'line' ? 'transparent' : corVerde,
                            borderColor: corVerde,
                            tension: 0.25,
                        },
                        {
                            label: <?= json_encode(t('relatorios.serie_despesas'), JSON_UNESCAPED_UNICODE) ?>,
                            data: freqDespesas,
                            backgroundColor: tipo === 'line' ? 'transparent' : corVermelha,
                            borderColor: corVermelha,
                            tension: 0.25,
                        },
                    ],
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: { legend: { labels: { color: corTexto } } },
                    scales: {
                        x: { ticks: { color: corMuted }, grid: { color: 'transparent' } },
                        y: { ticks: { color: corMuted }, grid: { color: corMuted, display: false } },
                    },
                },
            });
        }
        gfMontarFrequencia('bar');

        window.gfTrocarTipoFrequencia = function (tipo, botao) {
            gfMontarFrequencia(tipo);
            var grupo = botao.parentElement.querySelectorAll('button');
            grupo.forEach(function (b) { b.classList.remove('is-active'); });
            botao.classList.add('is-active');
        };
        <?php endif; ?>
    })();
    </script>

<?php elseif ($aba === 'pendentes'): ?>

    <?php
    $receitasPendentes = array_filter($pendentes ?? [], fn($l) => (float)$l['valor'] >= 0 || ($l['tipo'] ?? '') === 'receita');
    $despesasPendentes = array_filter($pendentes ?? [], fn($l) => (float)$l['valor'] < 0 || ($l['tipo'] ?? '') === 'despesa');

    $totalAReceber = array_reduce($receitasPendentes, fn($acc, $l) => $acc + abs((float)$l['valor']), 0.0);
    $totalAPagar = array_reduce($despesasPendentes, fn($acc, $l) => $acc + abs((float)$l['valor']), 0.0);
    ?>

    <!-- Cards Superiores de Resumo MyFinance -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 16px; margin-bottom: 24px;">
        <div class="card" style="border-radius: 16px; padding: 18px 20px; position: relative;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <span class="muted" style="font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                    <i class="ph ph-trend-up" style="color: var(--green);"></i> Total a receber
                </span>
                <i class="ph ph-eye-slash muted" style="cursor: pointer;"></i>
            </div>
            <div style="font-size: 22px; font-weight: 700; color: var(--green); margin: 8px 0 4px;">
                <?= htmlspecialchars(moeda($totalAReceber), ENT_QUOTES, 'UTF-8') ?>
            </div>
            <span class="muted" style="font-size: 11px;">1 De <?= $nomesMeses[$periodo['mes']] ?> - 30 De <?= $nomesMeses[$periodo['mes']] ?></span>
        </div>

        <div class="card" style="border-radius: 16px; padding: 18px 20px; position: relative;">
            <div style="display: flex; justify-content: space-between; align-items: flex-start;">
                <span class="muted" style="font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                    <i class="ph ph-trend-down" style="color: var(--red);"></i> Total a pagar
                </span>
                <i class="ph ph-eye-slash muted" style="cursor: pointer;"></i>
            </div>
            <div style="font-size: 22px; font-weight: 700; color: var(--red); margin: 8px 0 4px;">
                <?= htmlspecialchars(moeda($totalAPagar), ENT_QUOTES, 'UTF-8') ?>
            </div>
            <span class="muted" style="font-size: 11px;">1 De <?= $nomesMeses[$periodo['mes']] ?> - 30 De <?= $nomesMeses[$periodo['mes']] ?></span>
            <div style="font-size: 10px; color: var(--red); margin-top: 2px; cursor: pointer;"><i class="ph ph-question"></i> Por que este valor?</div>
        </div>

        <div class="card" style="border-radius: 16px; padding: 18px 20px;">
            <div style="margin-bottom: 12px;">
                <span class="muted" style="font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                    <i class="ph ph-trend-up" style="color: var(--green);"></i> Saldo Disponível
                </span>
                <div style="font-size: 18px; font-weight: 700; color: var(--green); margin-top: 2px;">
                    <?= htmlspecialchars(moeda(0.0), ENT_QUOTES, 'UTF-8') ?>
                </div>
            </div>
            <div>
                <span class="muted" style="font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 6px;">
                    <i class="ph ph-trend-up" style="color: #2563eb;"></i> Saldo Previsto
                </span>
                <div style="font-size: 18px; font-weight: 700; color: #2563eb; margin-top: 2px;">
                    <?= htmlspecialchars(moeda($totalAReceber - $totalAPagar), ENT_QUOTES, 'UTF-8') ?>
                </div>
            </div>
        </div>
    </div>

    <!-- Duas Colunas: Receitas Pendentes & Despesas Pendentes -->
    <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px;">

        <!-- Coluna Receitas Pendentes -->
        <div class="card" style="border-radius: 16px; padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <div>
                    <h3 style="font-size: 16px; font-weight: 700; margin: 0;">Receitas pendentes</h3>
                    <span class="muted" style="font-size: 12px;">Lançamentos a receber</span>
                </div>
                <button class="btn btn-primary btn-sm" style="background: var(--green); border: none; border-radius: 20px; font-size: 12px; padding: 6px 14px;">
                    + Receita
                </button>
            </div>

            <!-- Filtros Internos -->
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                <button class="btn btn-outline btn-sm" style="border-radius: 20px; font-size: 12px;"><i class="ph ph-gear"></i> Sem agrupamento <i class="ph ph-caret-down"></i></button>
                <div style="position: relative; flex: 1;">
                    <i class="ph ph-magnifying-glass" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--muted); font-size: 13px;"></i>
                    <input class="input" type="text" placeholder="Pesquisar por descrição ou valor..." style="border-radius: 20px; padding-left: 30px; font-size: 12px; height: 32px;">
                </div>
                <button class="btn btn-outline btn-sm" style="border-radius: 50%; width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center;"><i class="ph ph-arrows-down-up"></i></button>
                <button class="btn btn-outline btn-sm" style="border-radius: 50%; width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center;"><i class="ph ph-funnel"></i></button>
            </div>

            <!-- Lista de Receitas Pendentes -->
            <?php if (!$receitasPendentes): ?>
                <p class="muted" style="font-size: 13px; text-align: center; padding: 20px 0;">Nenhuma receita pendente no período.</p>
            <?php else: ?>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <?php foreach ($receitasPendentes as $l): ?>
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg);">
                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                <strong style="font-size: 13.5px;"><?= htmlspecialchars($l['descricao'], ENT_QUOTES, 'UTF-8') ?></strong>
                                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                    <span class="badge badge-pendente" style="font-size: 10px; padding: 2px 6px;">Não Pago</span>
                                    <?php if ($l['categoria_nome']): ?>
                                        <span class="lancamento-tag" style="--cor: <?= htmlspecialchars($l['categoria_cor'], ENT_QUOTES, 'UTF-8') ?>; font-size: 10px; padding: 2px 8px;">
                                            <?= htmlspecialchars($l['categoria_nome'], ENT_QUOTES, 'UTF-8') ?>
                                        </span>
                                    <?php endif; ?>
                                    <span class="lancamento-tag muted" style="font-size: 10px; padding: 2px 8px;"><i class="ph ph-bank"></i> <?= htmlspecialchars($l['conta_nome'], ENT_QUOTES, 'UTF-8') ?></span>
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <form method="post" action="/lancamentos/<?= $l['id'] ?>/marcar-pago" style="margin: 0;">
                                    <?= Csrf::campo() ?>
                                    <button type="submit" style="background: var(--green); border: none; color: #fff; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Marcar como recebido">
                                        <i class="ph ph-check" style="font-size: 16px; font-weight: bold;"></i>
                                    </button>
                                </form>
                                <div style="text-align: right;">
                                    <div style="font-size: 13.5px; font-weight: 700; color: var(--green);"><?= htmlspecialchars(moeda(abs((float)$l['valor'])), ENT_QUOTES, 'UTF-8') ?></div>
                                    <div class="muted" style="font-size: 10px;"><?= htmlspecialchars($formatarData($l['data_competencia']), ENT_QUOTES, 'UTF-8') ?></div>
                                </div>
                                <button type="button" class="icon-btn" title="Editar" data-modal-open="modal-editar-lancamento-<?= $l['id'] ?>" style="background: none; border: none; cursor: pointer; color: var(--muted);"><i class="ph ph-pencil-simple" style="font-size: 18px;"></i></button>
                                <?php if (!empty($l['serie_id'])): ?>
                                    <button type="button" class="icon-btn" title="Excluir" data-modal-open="modal-excluir-lancamento-<?= $l['id'] ?>" style="background: none; border: none; cursor: pointer; color: var(--red);"><i class="ph ph-trash" style="font-size: 18px;"></i></button>
                                <?php else: ?>
                                    <form method="post" action="/lancamentos/<?= $l['id'] ?>/excluir" onsubmit="return confirm('<?= htmlspecialchars(t('painel.lancamento.confirmar_exclusao'), ENT_QUOTES, 'UTF-8') ?>')" style="margin: 0;">
                                        <?= Csrf::campo() ?>
                                        <button type="submit" class="icon-btn" title="Excluir" style="background: none; border: none; cursor: pointer; color: var(--red);"><i class="ph ph-trash" style="font-size: 18px;"></i></button>
                                    </form>
                                <?php endif; ?>
                            </div>
                        </div>
                        <?php $alvo = $l; require __DIR__ . '/../dashboard/_modal_editar.php'; ?>
                        <?php if (!empty($l['serie_id'])): require __DIR__ . '/../dashboard/_modal_excluir.php'; endif; ?>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>

            <!-- Rodapé Padrão MyFinance -->
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 16px; font-size: 12px; color: var(--muted);">
                <span>Mostrar 30 : Total: <?= count($receitasPendentes) ?></span>
                <div style="display: flex; gap: 6px;">
                    <button class="btn btn-outline btn-sm" disabled style="border-radius: 8px; font-size: 11px;">Voltar</button>
                    <button class="btn btn-outline btn-sm" disabled style="border-radius: 8px; font-size: 11px;">Próximo</button>
                </div>
            </div>
        </div>

        <!-- Coluna Despesas Pendentes -->
        <div class="card" style="border-radius: 16px; padding: 20px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <div>
                    <h3 style="font-size: 16px; font-weight: 700; margin: 0;">Despesas pendentes</h3>
                    <span class="muted" style="font-size: 12px;">Lançamentos a pagar</span>
                </div>
                <button class="btn btn-primary btn-sm" style="background: var(--red); border: none; border-radius: 20px; font-size: 12px; padding: 6px 14px;">
                    - Despesa
                </button>
            </div>

            <!-- Filtros Internos -->
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 16px;">
                <button class="btn btn-outline btn-sm" style="border-radius: 20px; font-size: 12px;"><i class="ph ph-gear"></i> Sem agrupamento <i class="ph ph-caret-down"></i></button>
                <div style="position: relative; flex: 1;">
                    <i class="ph ph-magnifying-glass" style="position: absolute; left: 10px; top: 50%; transform: translateY(-50%); color: var(--muted); font-size: 13px;"></i>
                    <input class="input" type="text" placeholder="Pesquisar por descrição ou valor..." style="border-radius: 20px; padding-left: 30px; font-size: 12px; height: 32px;">
                </div>
                <button class="btn btn-outline btn-sm" style="border-radius: 50%; width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center;"><i class="ph ph-arrows-down-up"></i></button>
                <button class="btn btn-outline btn-sm" style="border-radius: 50%; width: 32px; height: 32px; padding: 0; display: inline-flex; align-items: center; justify-content: center;"><i class="ph ph-funnel"></i></button>
            </div>

            <!-- Lista de Despesas Pendentes -->
            <?php if (!$despesasPendentes): ?>
                <p class="muted" style="font-size: 13px; text-align: center; padding: 20px 0;">Nenhuma despesa pendente no período.</p>
            <?php else: ?>
                <div style="display: flex; flex-direction: column; gap: 10px;">
                    <?php foreach ($despesasPendentes as $l): ?>
                        <div style="display: flex; align-items: center; justify-content: space-between; padding: 12px 14px; border: 1px solid var(--border); border-radius: 12px; background: var(--bg);">
                            <div style="display: flex; flex-direction: column; gap: 4px;">
                                <strong style="font-size: 13.5px;"><?= htmlspecialchars($l['descricao'], ENT_QUOTES, 'UTF-8') ?></strong>
                                <div style="display: flex; align-items: center; gap: 6px; flex-wrap: wrap;">
                                    <span class="badge badge-pendente" style="font-size: 10px; padding: 2px 6px;">Não Pago</span>
                                    <?php if ($l['categoria_nome']): ?>
                                        <span class="lancamento-tag" style="--cor: <?= htmlspecialchars($l['categoria_cor'], ENT_QUOTES, 'UTF-8') ?>; font-size: 10px; padding: 2px 8px;">
                                            <?= htmlspecialchars($l['categoria_nome'], ENT_QUOTES, 'UTF-8') ?>
                                        </span>
                                    <?php endif; ?>
                                    <span class="lancamento-tag muted" style="font-size: 10px; padding: 2px 8px;"><i class="ph ph-bank"></i> <?= htmlspecialchars($l['conta_nome'], ENT_QUOTES, 'UTF-8') ?></span>
                                </div>
                            </div>
                            <div style="display: flex; align-items: center; gap: 8px;">
                                <form method="post" action="/lancamentos/<?= $l['id'] ?>/marcar-pago" style="margin: 0;">
                                    <?= Csrf::campo() ?>
                                    <button type="submit" style="background: var(--green); border: none; color: #fff; width: 28px; height: 28px; border-radius: 50%; cursor: pointer; display: flex; align-items: center; justify-content: center;" title="Marcar como pago">
                                        <i class="ph ph-check" style="font-size: 16px; font-weight: bold;"></i>
                                    </button>
                                </form>
                                <div style="text-align: right;">
                                    <div style="font-size: 13.5px; font-weight: 700; color: var(--red);"><?= htmlspecialchars(moeda(abs((float)$l['valor'])), ENT_QUOTES, 'UTF-8') ?></div>
                                    <div class="muted" style="font-size: 10px;"><?= htmlspecialchars($formatarData($l['data_competencia']), ENT_QUOTES, 'UTF-8') ?></div>
                                </div>
                                <button type="button" class="icon-btn" title="Editar" data-modal-open="modal-editar-lancamento-<?= $l['id'] ?>" style="background: none; border: none; cursor: pointer; color: var(--muted);"><i class="ph ph-pencil-simple" style="font-size: 18px;"></i></button>
                                <?php if (!empty($l['serie_id'])): ?>
                                    <button type="button" class="icon-btn" title="Excluir" data-modal-open="modal-excluir-lancamento-<?= $l['id'] ?>" style="background: none; border: none; cursor: pointer; color: var(--red);"><i class="ph ph-trash" style="font-size: 18px;"></i></button>
                                <?php else: ?>
                                    <form method="post" action="/lancamentos/<?= $l['id'] ?>/excluir" onsubmit="return confirm('<?= htmlspecialchars(t('painel.lancamento.confirmar_exclusao'), ENT_QUOTES, 'UTF-8') ?>')" style="margin: 0;">
                                        <?= Csrf::campo() ?>
                                        <button type="submit" class="icon-btn" title="Excluir" style="background: none; border: none; cursor: pointer; color: var(--red);"><i class="ph ph-trash" style="font-size: 18px;"></i></button>
                                    </form>
                                <?php endif; ?>
                            </div>
                        </div>
                        <?php $alvo = $l; require __DIR__ . '/../dashboard/_modal_editar.php'; ?>
                        <?php if (!empty($l['serie_id'])): require __DIR__ . '/../dashboard/_modal_excluir.php'; endif; ?>
                    <?php endforeach; ?>
                </div>
            <?php endif; ?>

            <!-- Rodapé Padrão MyFinance -->
            <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 16px; font-size: 12px; color: var(--muted);">
                <span>Mostrar 30 : Total: <?= count($despesasPendentes) ?></span>
                <div style="display: flex; gap: 6px;">
                    <button class="btn btn-outline btn-sm" disabled style="border-radius: 8px; font-size: 11px;">Voltar</button>
                    <button class="btn btn-outline btn-sm" disabled style="border-radius: 8px; font-size: 11px;">Próximo</button>
                </div>
            </div>
        </div>

    </div>

<?php elseif ($aba === 'demonstrativo'): ?>

    <div class="relatorios-resumo-grid">
        <div class="card resumo-card">
            <span class="resumo-card__label"><?= htmlspecialchars(t('relatorios.demonstrativo_total_receitas'), ENT_QUOTES, 'UTF-8') ?></span>
            <span class="resumo-card__valor valor-positivo"><?= htmlspecialchars(moeda($totalReceitas), ENT_QUOTES, 'UTF-8') ?></span>
        </div>
        <div class="card resumo-card">
            <span class="resumo-card__label"><?= htmlspecialchars(t('relatorios.demonstrativo_total_despesas'), ENT_QUOTES, 'UTF-8') ?></span>
            <span class="resumo-card__valor valor-negativo"><?= htmlspecialchars(moeda($totalDespesas), ENT_QUOTES, 'UTF-8') ?></span>
        </div>
        <div class="card resumo-card">
            <span class="resumo-card__label"><?= htmlspecialchars(t('relatorios.demonstrativo_resultado'), ENT_QUOTES, 'UTF-8') ?></span>
            <?php $resultado = $totalReceitas - $totalDespesas; ?>
            <span class="resumo-card__valor <?= $resultado < 0 ? 'valor-negativo' : 'valor-positivo' ?>"><?= htmlspecialchars(moeda($resultado), ENT_QUOTES, 'UTF-8') ?></span>
        </div>
    </div>

    <div class="relatorios-dre-grid">
        <div class="card">
            <h3 class="grafico-card__titulo"><?= htmlspecialchars(t('relatorios.demonstrativo_receitas_titulo'), ENT_QUOTES, 'UTF-8') ?></h3>
            <?php if (!$receitasPorCategoria): ?>
                <p class="muted"><?= htmlspecialchars(t('relatorios.demonstrativo_sem_dados'), ENT_QUOTES, 'UTF-8') ?></p>
            <?php else: ?>
                <div class="relatorios-dre-lista">
                    <?php foreach ($receitasPorCategoria as $linha): ?>
                        <div class="relatorios-dre-linha">
                            <span class="relatorios-dre-linha__nome">
                                <span class="categoria-dot" style="--cor: <?= htmlspecialchars($linha['categoria_cor'], ENT_QUOTES, 'UTF-8') ?>"></span>
                                <?= htmlspecialchars($linha['categoria_nome'], ENT_QUOTES, 'UTF-8') ?>
                            </span>
                            <span class="relatorios-dre-linha__valor valor-positivo"><?= htmlspecialchars(moeda((float) $linha['total']), ENT_QUOTES, 'UTF-8') ?></span>
                        </div>
                    <?php endforeach; ?>
                </div>
                <div class="relatorios-dre-total">
                    <span><?= htmlspecialchars(t('relatorios.demonstrativo_total_receitas'), ENT_QUOTES, 'UTF-8') ?></span>
                    <span class="valor-positivo"><?= htmlspecialchars(moeda($totalReceitas), ENT_QUOTES, 'UTF-8') ?></span>
                </div>
            <?php endif; ?>
        </div>

        <div class="card">
            <h3 class="grafico-card__titulo"><?= htmlspecialchars(t('relatorios.demonstrativo_despesas_titulo'), ENT_QUOTES, 'UTF-8') ?></h3>
            <?php if (!$despesasPorCategoria): ?>
                <p class="muted"><?= htmlspecialchars(t('relatorios.demonstrativo_sem_dados'), ENT_QUOTES, 'UTF-8') ?></p>
            <?php else: ?>
                <div class="relatorios-dre-lista">
                    <?php foreach ($despesasPorCategoria as $linha): ?>
                        <div class="relatorios-dre-linha">
                            <span class="relatorios-dre-linha__nome">
                                <span class="categoria-dot" style="--cor: <?= htmlspecialchars($linha['categoria_cor'], ENT_QUOTES, 'UTF-8') ?>"></span>
                                <?= htmlspecialchars($linha['categoria_nome'], ENT_QUOTES, 'UTF-8') ?>
                            </span>
                            <span class="relatorios-dre-linha__valor valor-negativo"><?= htmlspecialchars(moeda((float) $linha['total']), ENT_QUOTES, 'UTF-8') ?></span>
                        </div>
                    <?php endforeach; ?>
                </div>
                <div class="relatorios-dre-total">
                    <span><?= htmlspecialchars(t('relatorios.demonstrativo_total_despesas'), ENT_QUOTES, 'UTF-8') ?></span>
                    <span class="valor-negativo"><?= htmlspecialchars(moeda($totalDespesas), ENT_QUOTES, 'UTF-8') ?></span>
                </div>
            <?php endif; ?>
        </div>
    </div>

<?php elseif ($aba === 'demonstrativo_anual'): ?>

    <div class="periodo-nav card">
        <a class="periodo-nav__seta" href="<?= $linkAnoAnual($anoAnual - 1) ?>" title="<?= htmlspecialchars(t('relatorios.ano_anterior'), ENT_QUOTES, 'UTF-8') ?>">←</a>
        <div class="periodo-nav__label">
            <strong><?= $anoAnual ?></strong>
            <?php if ($anoAnual !== $anoAtual): ?>
                <a href="<?= $linkAnoAnual($anoAtual) ?>" class="periodo-nav__hoje"><?= htmlspecialchars(t('relatorios.ano_atual'), ENT_QUOTES, 'UTF-8') ?></a>
            <?php endif; ?>
        </div>
        <a class="periodo-nav__seta" href="<?= $linkAnoAnual($anoAnual + 1) ?>" title="<?= htmlspecialchars(t('relatorios.ano_proximo'), ENT_QUOTES, 'UTF-8') ?>">→</a>
    </div>

    <?php
    // Rotula as categorias de topo "sem categoria" (categoria_nome nulo,
    // vindo do Model sem traducao) - mesma ideia de $comLabel() acima, so
    // que aqui a estrutura tem 'categoria_nome'/'categoria_cor' em vez de
    // 'categoria_nome'/'categoria_cor' no nivel raiz do array (subcategorias
    // nunca ficam sem categoria, entao so precisa tratar o nivel de topo).
    $comLabelAnual = function (array $categorias) use ($semCategoriaNome, $semCategoriaCor): array {
        foreach ($categorias as &$cat) {
            if ($cat['categoria_nome'] === null) {
                $cat['categoria_nome'] = $semCategoriaNome;
                $cat['categoria_cor'] = $semCategoriaCor;
            }
        }
        return $categorias;
    };
    if ($demonstrativoAnual) {
        $demonstrativoAnual['receitas'] = $comLabelAnual($demonstrativoAnual['receitas']);
        $demonstrativoAnual['despesas'] = $comLabelAnual($demonstrativoAnual['despesas']);
    }
    ?>

    <?php if (!$demonstrativoAnual['receitas'] && !$demonstrativoAnual['despesas']): ?>
        <div class="card placeholder-card">
            <p class="muted"><?= htmlspecialchars(t('relatorios.demonstrativo_anual_vazio'), ENT_QUOTES, 'UTF-8') ?></p>
        </div>
    <?php else: ?>
        <?php
        // Renderiza uma secao (Receitas ou Despesas) inteira: titulo, linhas
        // de categoria (com subcategorias recolhiveis via <details>-like JS,
        // ver data-anual-toggle/data-anual-pai em app.js) e a linha de
        // subtotal da secao.
        $renderizarSecao = function (array $categorias, string $tituloChave, string $totalChave, float $totalGeral, string $classeValor) use ($nomesMesesAbrev): void {
            ?>
            <tr class="tabela-anual__secao">
                <td colspan="<?= count($nomesMesesAbrev) + 2 ?>"><?= htmlspecialchars(t($tituloChave), ENT_QUOTES, 'UTF-8') ?></td>
            </tr>
            <?php foreach ($categorias as $cat): ?>
                <?php $temSub = count($cat['subcategorias']) > 0; ?>
                <tr class="tabela-anual__linha <?= $temSub ? 'tabela-anual__linha--expansivel' : '' ?>" <?= $temSub ? 'data-anual-toggle="cat-' . $cat['categoria_id'] . '"' : '' ?>>
                    <td class="tabela-anual__nome">
                        <?php if ($temSub): ?><span class="tabela-anual__seta">▸</span><?php endif; ?>
                        <span class="categoria-dot" style="--cor: <?= htmlspecialchars((string) $cat['categoria_cor'], ENT_QUOTES, 'UTF-8') ?>"></span>
                        <?= htmlspecialchars((string) $cat['categoria_nome'], ENT_QUOTES, 'UTF-8') ?>
                    </td>
                    <?php foreach ($cat['meses'] as $valorMes): ?>
                        <td class="tabela__num"><?= $valorMes > 0 ? htmlspecialchars(moeda($valorMes), ENT_QUOTES, 'UTF-8') : '—' ?></td>
                    <?php endforeach; ?>
                    <td class="tabela__num"><strong><?= htmlspecialchars(moeda((float) $cat['total']), ENT_QUOTES, 'UTF-8') ?></strong></td>
                </tr>
                <?php foreach ($cat['subcategorias'] as $sub): ?>
                    <tr class="tabela-anual__linha tabela-anual__linha--sub" data-anual-pai="cat-<?= $cat['categoria_id'] ?>" hidden>
                        <td class="tabela-anual__nome">
                            <span class="categoria-dot" style="--cor: <?= htmlspecialchars((string) $sub['categoria_cor'], ENT_QUOTES, 'UTF-8') ?>"></span>
                            <?= htmlspecialchars((string) $sub['categoria_nome'], ENT_QUOTES, 'UTF-8') ?>
                        </td>
                        <?php foreach ($sub['meses'] as $valorMes): ?>
                            <td class="tabela__num"><?= $valorMes > 0 ? htmlspecialchars(moeda($valorMes), ENT_QUOTES, 'UTF-8') : '—' ?></td>
                        <?php endforeach; ?>
                        <td class="tabela__num"><?= htmlspecialchars(moeda((float) $sub['total']), ENT_QUOTES, 'UTF-8') ?></td>
                    </tr>
                <?php endforeach; ?>
            <?php endforeach; ?>
            <tr class="tabela-anual__subtotal">
                <td><?= htmlspecialchars(t($totalChave), ENT_QUOTES, 'UTF-8') ?></td>
                <?php
                $somaPorMes = array_fill(1, 12, 0.0);
                foreach ($categorias as $cat) {
                    foreach ($cat['meses'] as $mes => $valorMes) {
                        $somaPorMes[$mes] += $valorMes;
                    }
                    // O total do pai so soma seus lancamentos diretos (ver
                    // Lancamento::demonstrativoAnual) - o subtotal da secao
                    // precisa somar tambem as subcategorias, senao valores
                    // lancados so na subcategoria ficam de fora do total.
                    foreach ($cat['subcategorias'] as $sub) {
                        foreach ($sub['meses'] as $mes => $valorMes) {
                            $somaPorMes[$mes] += $valorMes;
                        }
                    }
                }
                ?>
                <?php foreach ($somaPorMes as $valorMes): ?>
                    <td class="tabela__num <?= $classeValor ?>"><?= htmlspecialchars(moeda($valorMes), ENT_QUOTES, 'UTF-8') ?></td>
                <?php endforeach; ?>
                <td class="tabela__num <?= $classeValor ?>"><?= htmlspecialchars(moeda($totalGeral), ENT_QUOTES, 'UTF-8') ?></td>
            </tr>
            <?php
        };
        ?>
        <div class="card tabela-wrapper">
            <table class="tabela tabela-anual">
                <thead>
                    <tr>
                        <th><?= htmlspecialchars(t('relatorios.demonstrativo_categoria_col'), ENT_QUOTES, 'UTF-8') ?></th>
                        <?php foreach ($nomesMesesAbrev as $mesAbrev): ?>
                            <th class="tabela__num"><?= htmlspecialchars($mesAbrev, ENT_QUOTES, 'UTF-8') ?></th>
                        <?php endforeach; ?>
                        <th class="tabela__num"><?= htmlspecialchars(t('relatorios.demonstrativo_total_geral'), ENT_QUOTES, 'UTF-8') ?></th>
                    </tr>
                </thead>
                <tbody>
                    <?php
                    // Soma o 'total' das categorias de topo + o das
                    // subcategorias (o 'total' de um pai so conta seus
                    // lancamentos diretos - ver Lancamento::demonstrativoAnual).
                    $somarComSubs = static function (array $categorias): float {
                        $soma = 0.0;
                        foreach ($categorias as $cat) {
                            $soma += (float) $cat['total'];
                            foreach ($cat['subcategorias'] as $sub) {
                                $soma += (float) $sub['total'];
                            }
                        }
                        return $soma;
                    };
                    $totalAnoReceitas = $somarComSubs($demonstrativoAnual['receitas']);
                    $totalAnoDespesas = $somarComSubs($demonstrativoAnual['despesas']);
                    $renderizarSecao($demonstrativoAnual['receitas'], 'relatorios.demonstrativo_receitas_titulo', 'relatorios.demonstrativo_total_receitas', $totalAnoReceitas, 'valor-positivo');
                    $renderizarSecao($demonstrativoAnual['despesas'], 'relatorios.demonstrativo_despesas_titulo', 'relatorios.demonstrativo_total_despesas', $totalAnoDespesas, 'valor-negativo');
                    ?>
                    <tr class="tabela-anual__saldo">
                        <td><?= htmlspecialchars(t('relatorios.saldo'), ENT_QUOTES, 'UTF-8') ?></td>
                        <?php foreach ($demonstrativoAnual['saldo_mensal'] as $valorMes): ?>
                            <td class="tabela__num <?= $valorMes < 0 ? 'valor-negativo' : 'valor-positivo' ?>"><?= htmlspecialchars(moeda($valorMes), ENT_QUOTES, 'UTF-8') ?></td>
                        <?php endforeach; ?>
                        <?php $saldoAno = $totalAnoReceitas - $totalAnoDespesas; ?>
                        <td class="tabela__num <?= $saldoAno < 0 ? 'valor-negativo' : 'valor-positivo' ?>"><?= htmlspecialchars(moeda($saldoAno), ENT_QUOTES, 'UTF-8') ?></td>
                    </tr>
                </tbody>
            </table>
        </div>
    <?php endif; ?>

<?php endif; ?>
