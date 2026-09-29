<?php
/** @var string $conteudo */
/** @var array $config */
/** @var array|null $usuarioLogado */
/** @var string $tema */
/** @var string $idiomaAtual */
/** @var array $flash */

$rotaAtual = parse_url($_SERVER['REQUEST_URI'] ?? '/', PHP_URL_PATH) ?: '/';
$rotaAtual = rtrim($rotaAtual, '/') ?: '/';

$abas = [
    '/'             => ['label' => t('nav.visao_geral'), 'icone' => '<i class="ph ph-squares-four"></i>'],
    '/relatorios'   => ['label' => t('nav.relatorios'), 'icone' => '<i class="ph ph-chart-bar"></i>'],
    '/categorias'   => ['label' => t('nav.categorias'), 'icone' => '<i class="ph ph-tag"></i>'],
    '/contas'       => ['label' => t('nav.contas'), 'icone' => '<i class="ph ph-bank"></i>'],
    '/configuracoes'=> ['label' => t('nav.configuracoes'), 'icone' => '<i class="ph ph-gear"></i>'],
    '#comunidade'   => ['label' => t('nav.comunidade'), 'icone' => '<i class="ph ph-users"></i>'],
    '#indicar'      => ['label' => t('nav.indicar'), 'icone' => '<i class="ph ph-gift"></i>'],
];
?>
<!doctype html>
<html lang="<?= htmlspecialchars($idiomaAtual, ENT_QUOTES, 'UTF-8') ?>" data-tema="<?= htmlspecialchars($tema, ENT_QUOTES, 'UTF-8') ?>">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title><?= htmlspecialchars($config['app']['nome'], ENT_QUOTES, 'UTF-8') ?></title>
    <script src="https://unpkg.com/@phosphor-icons/web"></script>
    <link rel="stylesheet" href="/assets/css/app.css">
</head>
<body>
<header class="navbar">
    <div class="navbar__inner">
        <div style="display: flex; align-items: center; gap: 10px;">
            <?php if ($usuarioLogado): ?>
                <button type="button" class="mobile-menu-toggle" id="btn-toggle-menu" aria-label="Abrir Menu">
                    <i class="ph ph-list"></i>
                </button>
            <?php endif; ?>
            <a href="/" class="navbar__brand">
                <i class="ph-fill ph-hands-clapping" style="font-size: 24px;"></i>
                <span style="font-size: 10px; text-transform: uppercase;">MyFinance</span>
            </a>
        </div>
        <nav class="navbar__links">
            <?php foreach ($abas as $rota => $aba): ?>
                <a href="<?= $rota ?>" class="navbar__link <?= $rotaAtual === $rota ? 'is-active' : '' ?>">
                    <span class="navbar__icon" aria-hidden="true"><?= $aba['icone'] ?></span>
                    <span class="navbar__label"><?= htmlspecialchars($aba['label'], ENT_QUOTES, 'UTF-8') ?></span>
                </a>
            <?php endforeach; ?>
        </nav>
        <div class="navbar__user">
            <?php if ($usuarioLogado): ?>
                <span class="navbar__user-nome"><?= htmlspecialchars($usuarioLogado['nome'], ENT_QUOTES, 'UTF-8') ?></span>
                <a href="/logout" class="btn btn-outline btn-sm"><?= htmlspecialchars(t('nav.sair'), ENT_QUOTES, 'UTF-8') ?></a>
            <?php endif; ?>
        </div>
    </div>
</header>

<main class="container">
    <?php foreach (($flash['sucesso'] ?? []) as $msg): ?>
        <div class="alert alert-sucesso"><?= htmlspecialchars($msg, ENT_QUOTES, 'UTF-8') ?></div>
    <?php endforeach; ?>
    <?php foreach (($flash['erro'] ?? []) as $msg): ?>
        <div class="alert alert-erro"><?= htmlspecialchars($msg, ENT_QUOTES, 'UTF-8') ?></div>
    <?php endforeach; ?>

    <?= $conteudo ?>
</main>

<?php if ($usuarioLogado): ?>
    <!-- Mobile Bottom Navigation Bar -->
    <nav class="mobile-bottom-nav" aria-label="Navegação inferior mobile">
        <?php 
        $abasMobile = array_slice($abas, 0, 5, true);
        foreach ($abasMobile as $rota => $aba): 
        ?>
            <a href="<?= $rota ?>" class="mobile-bottom-nav__item <?= $rotaAtual === $rota ? 'is-active' : '' ?>">
                <span class="mobile-bottom-nav__icon"><?= $aba['icone'] ?></span>
                <span class="mobile-bottom-nav__label"><?= htmlspecialchars($aba['label'], ENT_QUOTES, 'UTF-8') ?></span>
            </a>
        <?php endforeach; ?>
    </nav>

    <!-- Mobile Drawer Overlay & Menu Panel -->
    <div class="drawer-backdrop" id="mobile-drawer-backdrop" style="display: none;" onclick="fecharMenuMobile()">
        <div class="drawer-panel" onclick="event.stopPropagation()">
            <div class="drawer-header">
                <div style="display: flex; align-items: center; gap: 10px;">
                    <i class="ph-fill ph-hands-clapping" style="font-size: 24px; color: var(--green);"></i>
                    <strong style="font-size: 16px;">MyFinance</strong>
                </div>
                <button type="button" class="drawer-close-btn" onclick="fecharMenuMobile()">&times;</button>
            </div>
            
            <div class="drawer-user-info">
                <div class="drawer-user-avatar"><?= htmlspecialchars(mb_strtoupper(mb_substr($usuarioLogado['nome'] ?? 'U', 0, 1, 'UTF-8'), 'UTF-8'), ENT_QUOTES, 'UTF-8') ?></div>
                <div style="min-width: 0; flex: 1;">
                    <div style="font-weight: 700; font-size: 14px; color: var(--text); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><?= htmlspecialchars($usuarioLogado['nome'], ENT_QUOTES, 'UTF-8') ?></div>
                    <div style="font-size: 11px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap;"><?= htmlspecialchars($usuarioLogado['email'] ?? '', ENT_QUOTES, 'UTF-8') ?></div>
                </div>
            </div>

            <nav class="drawer-links">
                <?php foreach ($abas as $rota => $aba): ?>
                    <a href="<?= $rota ?>" class="drawer-link <?= $rotaAtual === $rota ? 'is-active' : '' ?>">
                        <span aria-hidden="true"><?= $aba['icone'] ?></span>
                        <span><?= htmlspecialchars($aba['label'], ENT_QUOTES, 'UTF-8') ?></span>
                    </a>
                <?php endforeach; ?>
            </nav>

            <div class="drawer-footer">
                <a href="/logout" class="btn btn-outline btn-block" style="color: var(--red); border-color: var(--red-bg); justify-content: flex-start; gap: 8px; text-decoration: none; min-height: 44px;">
                    <i class="ph ph-sign-out" style="font-size: 18px;"></i>
                    <span><?= htmlspecialchars(t('nav.sair'), ENT_QUOTES, 'UTF-8') ?></span>
                </a>
            </div>
        </div>
    </div>
<?php endif; ?>

<script>
window.gfMoeda = <?= json_encode(\App\Core\Money::configParaJs(), JSON_UNESCAPED_UNICODE) ?>;

function abrirMenuMobile() {
    if (window.innerWidth > 768) return;
    const backdrop = document.getElementById('mobile-drawer-backdrop');
    if (backdrop) {
        backdrop.style.display = 'block';
        setTimeout(() => backdrop.classList.add('is-open'), 10);
    }
}
function fecharMenuMobile() {
    const backdrop = document.getElementById('mobile-drawer-backdrop');
    if (backdrop) {
        backdrop.classList.remove('is-open');
        setTimeout(() => { backdrop.style.display = 'none'; }, 200);
    }
}
document.addEventListener('DOMContentLoaded', () => {
    const toggleBtn = document.getElementById('btn-toggle-menu');
    if (toggleBtn) {
        toggleBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            abrirMenuMobile();
        });
    }
    window.addEventListener('resize', () => {
        if (window.innerWidth > 768) {
            fecharMenuMobile();
        }
    });
});
</script>
<script src="/assets/js/app.js"></script>
</body>
</html>
