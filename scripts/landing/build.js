// Gera a landing estatica (myfinance.systempy.com) a partir de views/landing.ejs: uma pagina por idioma ja traduzida
// no HTML (bom para buscadores), SEO completo (title, description, canonical, hreflang, Open Graph, JSON-LD),
// icones inline (sem depender de CDN), sitemap.xml e robots.txt. Saida em dist-landing/.
//
// Uso: cd scripts/landing && npm install && npm run build
const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');

const RAIZ = path.resolve(__dirname, '..', '..');
const SAIDA = path.join(RAIZ, 'dist-landing');
const SITE = 'https://myfinance.systempy.com';
const APP = 'https://myfinanceacess.systempy.com';
const ICONES = path.join(__dirname, 'node_modules', '@phosphor-icons', 'core', 'assets');

const IDIOMAS = [
    { dict: 'pt-BR', lang: 'pt-BR', hreflang: 'pt', rota: '/', og: 'pt_BR', arquivo: 'index.html', img: 'og-pt.jpg' },
    { dict: 'es-PY', lang: 'es', hreflang: 'es', rota: '/es/', og: 'es_PY', arquivo: 'es/index.html', img: 'og-es.jpg' },
    { dict: 'en-US', lang: 'en', hreflang: 'en', rota: '/en/', og: 'en_US', arquivo: 'en/index.html', img: 'og-en.jpg' }
];

const SEO = {
    'pt-BR': {
        titulo: 'MyFinance: controle financeiro com IA para contas e parcelas',
        descricao: 'Organize contas, parcelas e gastos num só lugar. A IA registra por texto, foto ou voz. Teste grátis por 3 dias, sem cartão. Para Gs., R$, US$ e €.',
        imagemAlt: 'MyFinance: controle financeiro com inteligência artificial'
    },
    'es-PY': {
        titulo: 'MyFinance: control financiero con IA para cuentas y cuotas',
        descricao: 'Organice cuentas, cuotas y gastos en un solo lugar. La IA registra por texto, foto o voz. Pruebe gratis 3 días, sin tarjeta. Para Gs., R$, US$ y €.',
        imagemAlt: 'MyFinance: control financiero con inteligencia artificial'
    },
    'en-US': {
        titulo: 'MyFinance: personal finance tracker with AI',
        descricao: 'Keep accounts, installments and spending in one place. AI records by text, photo or voice. Free 3-day trial, no card. Works in Gs., R$, US$ and €.',
        imagemAlt: 'MyFinance: personal finance control with artificial intelligence'
    }
};

const ano = new Date().getFullYear();
let fonte = fs.readFileSync(path.join(RAIZ, 'views', 'landing.ejs'), 'utf8').replace('<%= new Date().getFullYear() %>', String(ano));
if (fonte.includes('<%')) throw new Error('landing.ejs ainda tem tags EJS que o build nao sabe resolver.');

// Dicionarios de traducao (o JS da pagina estatica nao precisa deles: o HTML ja sai traduzido).
const iniDict = fonte.indexOf('const TRANSLATIONS = {');
const fimDict = fonte.indexOf('// Idioma Engine');
const TRANSLATIONS = new Function(fonte.slice(iniDict, fimDict) + '; return TRANSLATIONS;')();
fonte = fonte.slice(0, iniDict) + 'const TRANSLATIONS = {};\n\n        ' + fonte.slice(fimDict);

const textoPuro = (html) => cheerio.load('<div>' + html + '</div>')('div').text().replace(/\s+/g, ' ').trim();

// ---- Icones Phosphor usados na pagina viram um sprite SVG inline
const sprite = new Map(); // id -> corpo do svg
function iconeId(peso, nome) {
    const id = `ph-${peso}-${nome}`;
    if (!sprite.has(id)) {
        const arq = path.join(ICONES, peso, peso === 'regular' ? `${nome}.svg` : `${nome}-${peso}.svg`);
        if (!fs.existsSync(arq)) throw new Error('Icone nao encontrado: ' + arq);
        const svg = fs.readFileSync(arq, 'utf8');
        sprite.set(id, svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, ''));
    }
    return id;
}
const svgUso = (id) => `<svg aria-hidden="true" focusable="false"><use href="#${id}"/></svg>`;

// Icones criados pelo JS (botao de tema) tambem entram no sprite.
const jsTema = (nome) => `'<i class="ph ph-${nome}">${svgUso(iconeId('regular', nome))}</i>'`;
fonte = fonte.replace(`'<i class="ph ph-moon"></i>'`, jsTema('moon')).replace(`'<i class="ph ph-sun"></i>'`, jsTema('sun'));

function precos($) {
    return $('.plano-card').map((_, el) => ({
        codigo: ($(el).find('a[href*="plano="]').attr('href') || '').split('plano=')[1],
        valor: ($(el).find('.preco-val').attr('data-mensal') || '').replace(/\./g, '')
    })).get().filter((p) => p.codigo && p.valor);
}

function montar(idioma, base) {
    const dict = TRANSLATIONS[idioma.dict];
    const seo = SEO[idioma.dict];
    const url = SITE + idioma.rota;
    const imagem = fs.existsSync(path.join(__dirname, 'assets', idioma.img)) ? `${SITE}/${idioma.img}` : `${SITE}/icon-192.png`;
    const $ = cheerio.load(base);

    // Idioma e traducao no proprio HTML
    $('html').attr('lang', idioma.lang).attr('data-prerender', '');
    if (idioma.rota === '/') $('html').attr('data-raiz', '');
    $('[data-i18n]').each((_, el) => {
        const chave = $(el).attr('data-i18n');
        if (dict[chave] !== undefined) $(el).html(dict[chave]);
    });
    const chaveCob = idioma.lang.slice(0, 2) === 'pt' ? 'pt' : idioma.lang.slice(0, 2);
    $('.plano-cobranca').each((_, el) => {
        const t = $(el).attr(`data-cobranca-mensal-${chaveCob}`);
        if (t) $(el).text(t);
    });
    $('nav.navbar__links').attr('aria-label', { pt: 'Principal', es: 'Principal', en: 'Main' }[chaveCob]);

    // Seletor de idioma: cada opcao aponta para a URL do idioma
    $('#lang-toggle option').each((_, el) => {
        const alvo = IDIOMAS.find((i) => i.dict === $(el).attr('value'));
        if (alvo) $(el).attr('data-href', alvo.rota);
    });

    // Links para o sistema (outro dominio) e para a propria pagina
    $('a[href]').each((_, el) => {
        const h = $(el).attr('href');
        if (/^\/(cadastro|login|termos|privacidade)(\?|$)/.test(h)) $(el).attr('href', APP + h);
        else if (h === '/') $(el).attr('href', idioma.rota);
    });

    // <head>: SEO
    $('title').text(seo.titulo);
    $('meta[name="description"]').attr('content', seo.descricao);
    $('link[rel="canonical"]').attr('href', url);
    $('link[rel="icon"]').attr('href', '/icon-192.png');
    $('script[src*="phosphor"]').remove();
    $('head').contents().filter((_, n) => n.type === 'comment' && /Phosphor/.test(n.data)).remove();
    $('head').append(`
    <link rel="apple-touch-icon" href="/icon-192.png">
    ${IDIOMAS.map((i) => `<link rel="alternate" hreflang="${i.hreflang}" href="${SITE}${i.rota}">`).join('\n    ')}
    <link rel="alternate" hreflang="x-default" href="${SITE}/">
    <meta property="og:type" content="website">
    <meta property="og:site_name" content="MyFinance">
    <meta property="og:title" content="${seo.titulo}">
    <meta property="og:description" content="${seo.descricao}">
    <meta property="og:url" content="${url}">
    <meta property="og:locale" content="${idioma.og}">
    ${IDIOMAS.filter((i) => i !== idioma).map((i) => `<meta property="og:locale:alternate" content="${i.og}">`).join('\n    ')}
    <meta property="og:image" content="${imagem}">
    <meta property="og:image:alt" content="${seo.imagemAlt}">
    <meta name="twitter:card" content="summary_large_image">
    <meta name="twitter:title" content="${seo.titulo}">
    <meta name="twitter:description" content="${seo.descricao}">
    <meta name="twitter:image" content="${imagem}">`);

    // Dados estruturados: aplicativo com ofertas e perguntas frequentes (sem avaliacao inventada)
    const planos = precos($);
    const nomePlano = { basico: dict.p_basico_nome, premium: dict.p_premium_nome, pro: dict.p_pro_nome };
    const jsonld = [
        {
            '@context': 'https://schema.org', '@type': 'SoftwareApplication', name: 'MyFinance',
            applicationCategory: 'FinanceApplication', operatingSystem: 'Web, Android, iOS',
            url, inLanguage: idioma.lang, description: seo.descricao,
            offers: planos.map((p) => ({
                '@type': 'Offer', name: textoPuro(nomePlano[p.codigo] || p.codigo), price: p.valor, priceCurrency: 'PYG',
                url: `${APP}/cadastro?plano=${p.codigo}`, availability: 'https://schema.org/InStock'
            }))
        },
        {
            '@context': 'https://schema.org', '@type': 'FAQPage', inLanguage: idioma.lang,
            mainEntity: [1, 2, 3, 4, 5, 6, 7].filter((n) => dict['faq_q' + n]).map((n) => ({
                '@type': 'Question', name: textoPuro(dict['faq_q' + n]),
                acceptedAnswer: { '@type': 'Answer', text: textoPuro(dict['faq_a' + n]) }
            }))
        }
    ];
    for (const bloco of jsonld) $('head').append(`\n    <script type="application/ld+json">${JSON.stringify(bloco).replace(/</g, '\\u003c')}</script>`);

    // Icones: <i class="ph-bold ph-x"> ganha o SVG inline
    $('i').each((_, el) => {
        const cls = ($(el).attr('class') || '').split(/\s+/);
        const nome = (cls.find((c) => /^ph-[a-z0-9-]+$/.test(c) && !/^ph-(bold|fill)$/.test(c)) || '').slice(3);
        if (!nome) return;
        const peso = cls.includes('ph-bold') ? 'bold' : (cls.includes('ph-fill') ? 'fill' : 'regular');
        $(el).attr('aria-hidden', 'true').html(svgUso(iconeId(peso, nome)));
    });
    return $;
}

// Limpa o conteudo (e nao a pasta: o OneDrive/terminal pode estar com ela aberta e o Windows nega a remocao).
fs.mkdirSync(SAIDA, { recursive: true });
for (const item of fs.readdirSync(SAIDA)) fs.rmSync(path.join(SAIDA, item), { recursive: true, force: true });
const base = fonte;
const paginas = IDIOMAS.map((idioma) => ({ idioma, $: montar(idioma, base) }));

// O sprite precisa existir antes de gravar (icones novos surgem durante a montagem)
const spriteHtml = `<svg xmlns="http://www.w3.org/2000/svg" style="display:none" aria-hidden="true">${[...sprite].map(([id, corpo]) => `<symbol id="${id}" viewBox="0 0 256 256">${corpo}</symbol>`).join('')}</svg>`;
for (const { idioma, $ } of paginas) {
    $('body').prepend(spriteHtml);
    const destino = path.join(SAIDA, idioma.arquivo);
    fs.mkdirSync(path.dirname(destino), { recursive: true });
    fs.writeFileSync(destino, $.html().replace(/\n\s*\n\s*\n+/g, '\n\n'), 'utf8');
}

// sitemap.xml e robots.txt
const hoje = new Date().toISOString().slice(0, 10);
const alternativas = IDIOMAS.map((i) => `    <xhtml:link rel="alternate" hreflang="${i.hreflang}" href="${SITE}${i.rota}"/>`).join('\n') + `\n    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE}/"/>`;
fs.writeFileSync(path.join(SAIDA, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">
${IDIOMAS.map((i) => `  <url>\n    <loc>${SITE}${i.rota}</loc>\n    <lastmod>${hoje}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${i.rota === '/' ? '1.0' : '0.9'}</priority>\n${alternativas}\n  </url>`).join('\n')}
</urlset>
`, 'utf8');
fs.writeFileSync(path.join(SAIDA, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`, 'utf8');

// Arquivos de apoio
fs.copyFileSync(path.join(RAIZ, 'public', 'assets', 'icons', 'icon-192.png'), path.join(SAIDA, 'icon-192.png'));
const assets = path.join(__dirname, 'assets');
if (fs.existsSync(assets)) for (const f of fs.readdirSync(assets)) fs.copyFileSync(path.join(assets, f), path.join(SAIDA, f));

console.log(`Landing gerada em ${SAIDA}`);
for (const { idioma } of paginas) console.log(' -', idioma.arquivo, `${(fs.statSync(path.join(SAIDA, idioma.arquivo)).size / 1024).toFixed(0)} KB`);
console.log(' - icones no sprite:', sprite.size);
