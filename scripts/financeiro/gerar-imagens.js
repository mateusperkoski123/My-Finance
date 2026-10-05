// Gera as imagens do "Financeiro" (personagem moeda) em public/assets/financeiro/ usando o Chrome instalado:
//   avatar-192.png (icone da notificacao), badge-96.png (selo monocromatico da barra de status do Android)
//   e banner-<tom>.png (imagem grande da notificacao, 2:1), um por tom de mensagem.
// Uso: node scripts/financeiro/gerar-imagens.js   (CHROME_PATH aponta para o chrome.exe se nao for o padrao)
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const SAIDA = path.join(__dirname, '../../public/assets/financeiro');
const CHROME = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

// Rosto da moeda (espaco 200x200) para cada tom.
const ROSTOS = {
    brincalhao: `
        <ellipse cx="72" cy="88" rx="13" ry="16" fill="#fff"/><circle cx="75" cy="90" r="7" fill="#2b2140"/>
        <path d="M118 90 Q132 78 146 90" stroke="#2b2140" stroke-width="7" fill="none" stroke-linecap="round"/>
        <path d="M60 122 Q104 156 144 112" stroke="#2b2140" stroke-width="8" fill="none" stroke-linecap="round"/>
        <circle cx="52" cy="116" r="9" fill="#ff9d6c" opacity=".55"/>`,
    cobrando: `
        <ellipse cx="70" cy="92" rx="14" ry="14" fill="#fff"/><circle cx="72" cy="96" r="7" fill="#2b2140"/>
        <ellipse cx="130" cy="92" rx="14" ry="14" fill="#fff"/><circle cx="128" cy="96" r="7" fill="#2b2140"/>
        <path d="M52 86 L88 84" stroke="#2b2140" stroke-width="8" stroke-linecap="round"/>
        <path d="M112 76 L148 66" stroke="#2b2140" stroke-width="8" stroke-linecap="round"/>
        <path d="M70 130 L130 126" stroke="#2b2140" stroke-width="8" fill="none" stroke-linecap="round"/>`,
    dramatico: `
        <ellipse cx="70" cy="90" rx="17" ry="21" fill="#fff"/><circle cx="70" cy="92" r="6" fill="#2b2140"/>
        <ellipse cx="130" cy="90" rx="17" ry="21" fill="#fff"/><circle cx="130" cy="92" r="6" fill="#2b2140"/>
        <path d="M50 60 Q70 46 90 60" stroke="#2b2140" stroke-width="7" fill="none" stroke-linecap="round"/>
        <path d="M110 60 Q130 46 150 60" stroke="#2b2140" stroke-width="7" fill="none" stroke-linecap="round"/>
        <ellipse cx="100" cy="136" rx="20" ry="24" fill="#2b2140"/><ellipse cx="100" cy="146" rx="11" ry="9" fill="#ff7a8a"/>
        <path d="M168 62 Q178 82 168 90 Q158 82 168 62Z" fill="#7fd4ff"/>`,
    saudade: `
        <ellipse cx="70" cy="94" rx="16" ry="19" fill="#fff"/><circle cx="72" cy="98" r="10" fill="#2b2140"/><circle cx="76" cy="93" r="4" fill="#fff"/>
        <ellipse cx="130" cy="94" rx="16" ry="19" fill="#fff"/><circle cx="128" cy="98" r="10" fill="#2b2140"/><circle cx="132" cy="93" r="4" fill="#fff"/>
        <path d="M50 70 L88 60" stroke="#2b2140" stroke-width="7" stroke-linecap="round"/>
        <path d="M150 70 L112 60" stroke="#2b2140" stroke-width="7" stroke-linecap="round"/>
        <path d="M78 140 Q100 122 122 140" stroke="#2b2140" stroke-width="8" fill="none" stroke-linecap="round"/>
        <path d="M56 116 Q62 130 56 136 Q50 130 56 116Z" fill="#7fd4ff"/>`
};

// Cor do fundo e simbolo do balao de cada tom (simbolos valem em qualquer idioma).
const TONS = {
    brincalhao: { de: '#19c3b1', ate: '#2f7bff', balao: '$?' },
    cobrando: { de: '#ffb347', ate: '#ff6b35', balao: '?!' },
    dramatico: { de: '#ff5f7e', ate: '#8a2be2', balao: '!!!' },
    saudade: { de: '#8fa8ff', ate: '#6b4fd8', balao: '...' }
};

const MOEDA_BASE = `
    <defs>
        <linearGradient id="ouro" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffe27a"/><stop offset="1" stop-color="#f2a21e"/></linearGradient>
    </defs>
    <circle cx="100" cy="100" r="96" fill="#d98a0c"/>
    <circle cx="100" cy="100" r="90" fill="url(#ouro)"/>
    <circle cx="100" cy="100" r="76" fill="none" stroke="#e8a21f" stroke-width="4" opacity=".7"/>
    <path d="M40 60 Q60 30 96 24" stroke="#fff" stroke-width="8" fill="none" stroke-linecap="round" opacity=".55"/>`;

const moeda = (tom, tamanho, x, y) => `
    <svg x="${x}" y="${y}" width="${tamanho}" height="${tamanho}" viewBox="0 0 200 200">${MOEDA_BASE}${ROSTOS[tom]}</svg>`;

function banner(tom) {
    const c = TONS[tom];
    return `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="512" viewBox="0 0 1024 512">
        <defs><linearGradient id="fundo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${c.de}"/><stop offset="1" stop-color="${c.ate}"/></linearGradient></defs>
        <rect width="1024" height="512" fill="url(#fundo)"/>
        <circle cx="880" cy="90" r="190" fill="#fff" opacity=".08"/><circle cx="120" cy="470" r="150" fill="#fff" opacity=".08"/>
        <circle cx="70" cy="70" r="14" fill="#fff" opacity=".35"/><circle cx="170" cy="140" r="8" fill="#fff" opacity=".35"/><circle cx="940" cy="440" r="12" fill="#fff" opacity=".35"/>
        <g transform="translate(110 150)"><rect width="330" height="190" rx="52" fill="#fff"/><path d="M330 120 L392 176 L318 168Z" fill="#fff"/>
            <text x="165" y="132" font-family="Segoe UI, Arial, sans-serif" font-size="110" font-weight="800" fill="${c.ate}" text-anchor="middle">${c.balao}</text></g>
        ${moeda(tom, 330, 560, 90)}
    </svg>`;
}

function avatar() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192" viewBox="0 0 192 192">
        <defs><linearGradient id="fundo" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#19c3b1"/><stop offset="1" stop-color="#2f7bff"/></linearGradient></defs>
        <rect width="192" height="192" fill="url(#fundo)"/>${moeda('brincalhao', 150, 21, 21)}</svg>`;
}

// Selo da barra de status: so a forma (branco com transparencia), o Android pinta por cima.
function selo() {
    return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96" viewBox="0 0 96 96">
        <defs><mask id="furos"><rect width="96" height="96" fill="#fff"/>
            <circle cx="35" cy="42" r="7" fill="#000"/><circle cx="61" cy="42" r="7" fill="#000"/>
            <path d="M30 58 Q48 76 66 58" stroke="#000" stroke-width="6" fill="none" stroke-linecap="round"/></mask></defs>
        <circle cx="48" cy="48" r="44" fill="#fff" mask="url(#furos)"/></svg>`;
}

function renderizar(svg, largura, altura, destino, transparente) {
    const html = path.join(os.tmpdir(), `financeiro-${path.basename(destino)}.html`);
    fs.writeFileSync(html, `<!doctype html><meta charset="utf-8"><style>html,body{margin:0;background:${transparente ? 'transparent' : '#fff'}}svg{display:block}</style>${svg}`);
    execFileSync(CHROME, [
        '--headless=new', '--disable-gpu', '--hide-scrollbars', '--force-device-scale-factor=1',
        ...(transparente ? ['--default-background-color=00000000'] : []),
        `--window-size=${largura},${altura}`, `--screenshot=${destino}`, 'file:///' + html.replace(/\\/g, '/')
    ], { stdio: 'ignore' });
    fs.unlinkSync(html);
}

fs.mkdirSync(SAIDA, { recursive: true });
renderizar(avatar(), 192, 192, path.join(SAIDA, 'avatar-192.png'), false);
renderizar(selo(), 96, 96, path.join(SAIDA, 'badge-96.png'), true);
Object.keys(TONS).forEach((tom) => renderizar(banner(tom), 1024, 512, path.join(SAIDA, `banner-${tom}.png`), false));
console.log('Imagens geradas em', SAIDA);
