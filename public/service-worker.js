// Service Worker do MyFinance (PWA).
// O servidor troca o marcador abaixo pelo identificador do build: a cada deploy os caches antigos sao descartados.
const BUILD = '__BUILD_ID__';
const CACHE_SHELL = `myfinance-shell-${BUILD}`;
const CACHE_PAGINAS = `myfinance-paginas-${BUILD}`;
const CACHE_EXTERNO = 'myfinance-externo-v1'; // icones e graficos (CDN, em versao fixa), nao muda a cada build
const MAX_PAGINAS = 30;
const CHAVE_USUARIO = '/__usuario__';

// Itens obrigatorios do app shell (se algum falhar, a instalacao falha e tenta de novo depois).
const SHELL_OBRIGATORIO = [
    '/offline',
    '/assets/css/app.css',
    '/assets/js/app.js',
    '/assets/icons/icon-192.png',
    '/assets/icons/icon-512.png'
];
// Itens complementares (falha nao impede a instalacao).
const SHELL_OPCIONAL = [
    '/assets/js/charts.js',
    '/assets/js/app-conexao.js',
    '/assets/js/app-instalar.js',
    '/assets/js/app-foto.js',
    '/assets/js/app-provisorios.js',
    '/assets/js/app-db.js',
    '/assets/js/app-regras.js',
    '/assets/js/app-sync.js',
    '/assets/js/app-offline.js',
    '/assets/icons/icon-192-maskable.png',
    '/assets/icons/icon-512-maskable.png'
];

// Rotas que nunca passam pelo cache (autenticacao, admin, IA, pagamentos, API).
const NUNCA_CACHEAR = [
    /^\/login/, /^\/logout/, /^\/cadastro/, /^\/esqueci-senha/, /^\/redefinir-senha/, /^\/auth\//,
    /^\/admin/, /^\/ia(\/|$)/, /^\/assinatura/, /^\/comunidade/, /^\/api\//, /^\/lembretes/, /^\/financeiro/, /^\/cron\//, /^\/service-worker\.js$/, /^\/verificar-email/, /^\/aceitar-termos/
];

function deveIgnorar(pathname) {
    return NUNCA_CACHEAR.some((r) => r.test(pathname));
}

function ehEstatico(pathname) {
    return pathname.startsWith('/assets/');
}

self.addEventListener('install', (event) => {
    event.waitUntil((async () => {
        const cache = await caches.open(CACHE_SHELL);
        // credentials omit: a pagina /offline do shell nunca leva dados de um usuario logado.
        await Promise.all(SHELL_OBRIGATORIO.map(async (url) => {
            const resp = await fetch(new Request(url, { credentials: 'omit', cache: 'reload' }));
            if (!resp.ok || resp.redirected) throw new Error('precache_falhou:' + url);
            await cache.put(url, resp);
        }));
        await Promise.all(SHELL_OPCIONAL.map(async (url) => {
            try {
                const resp = await fetch(new Request(url, { credentials: 'omit', cache: 'reload' }));
                if (resp.ok && !resp.redirected) await cache.put(url, resp);
            } catch (e) { /* opcional */ }
        }));
        // Sem skipWaiting aqui: a versao nova espera o usuario aceitar (ou fechar todas as abas).
    })());
});

self.addEventListener('activate', (event) => {
    event.waitUntil((async () => {
        const manter = new Set([CACHE_SHELL, CACHE_PAGINAS, CACHE_EXTERNO]);
        for (const chave of await caches.keys()) {
            if (!manter.has(chave)) await caches.delete(chave);
        }
        await self.clients.claim();
    })());
});

self.addEventListener('message', (event) => {
    const msg = event.data || {};
    if (msg.type === 'SKIP_WAITING') self.skipWaiting();
    if (msg.type === 'CLEAR_USER_DATA') event.waitUntil(limparPaginas());
    if (msg.type === 'SET_USER') event.waitUntil(definirUsuario(String(msg.id || '')));
});

async function limparPaginas() {
    await caches.delete(CACHE_PAGINAS);
}

// Se o usuario da pagina mudou, as paginas guardadas do anterior sao apagadas.
async function definirUsuario(id) {
    const cache = await caches.open(CACHE_PAGINAS);
    const atual = await cache.match(CHAVE_USUARIO);
    const anterior = atual ? await atual.text() : '';
    if (anterior !== id) {
        await caches.delete(CACHE_PAGINAS);
        if (id) {
            const novo = await caches.open(CACHE_PAGINAS);
            await novo.put(CHAVE_USUARIO, new Response(id));
        }
    }
}

async function limitarPaginas(cache) {
    const chaves = (await cache.keys()).filter((r) => new URL(r.url).pathname !== CHAVE_USUARIO);
    for (let i = 0; i < chaves.length - MAX_PAGINAS; i++) await cache.delete(chaves[i]);
}

// Estaticos do app: rede primeiro (sempre atualizado), cache como reserva sem internet.
async function estatico(req) {
    try {
        const resp = await fetch(req);
        if (resp.ok && !resp.redirected) {
            const cache = await caches.open(CACHE_SHELL);
            cache.put(new URL(req.url).pathname, resp.clone()).catch(() => {});
        }
        return resp;
    } catch (e) {
        const guardado = await caches.match(new URL(req.url).pathname, { cacheName: CACHE_SHELL });
        if (guardado) return guardado;
        throw e;
    }
}

// Navegacao: rede primeiro. So guarda paginas autenticadas (cabecalho X-Cache-User), nunca redirecionamentos nem erros.
async function navegacao(req) {
    try {
        const resp = await fetch(req);
        const usuario = resp.headers.get('X-Cache-User');
        if (resp.status === 200 && !resp.redirected && usuario) {
            const cache = await caches.open(CACHE_PAGINAS);
            const marca = await cache.match(CHAVE_USUARIO);
            const marcaTexto = marca ? await marca.text() : null;
            if (marcaTexto !== null && marcaTexto !== usuario) {
                await caches.delete(CACHE_PAGINAS);
            }
            const alvo = await caches.open(CACHE_PAGINAS);
            await alvo.put(CHAVE_USUARIO, new Response(usuario));
            await alvo.put(req.url, resp.clone());
            await limitarPaginas(alvo);
        }
        return resp;
    } catch (e) {
        // Mesma pagina com outros parametros (ex.: o atalho do app abre "/?source=pwa" e o guardado e "/") tambem serve.
        const guardada = (await caches.match(req, { cacheName: CACHE_PAGINAS })) || (await caches.match(req, { cacheName: CACHE_PAGINAS, ignoreSearch: true }));
        if (guardada) return guardada;
        const offline = await caches.match('/offline', { cacheName: CACHE_SHELL });
        if (offline) return offline;
        throw e;
    }
}

// Icones e graficos (CSS/JS/fontes de CDN): cache primeiro, atualiza em segundo plano.
async function externo(req) {
    const cache = await caches.open(CACHE_EXTERNO);
    const guardado = await cache.match(req);
    const rede = fetch(req).then((resp) => {
        if (resp.ok || resp.type === 'opaque') cache.put(req, resp.clone()).catch(() => {});
        return resp;
    }).catch(() => null);
    return guardado || (await rede) || Response.error();
}

self.addEventListener('fetch', (event) => {
    const req = event.request;
    if (req.method !== 'GET') return;
    const url = new URL(req.url);

    // Icones e graficos vem de CDN (folhas de estilo, fontes e Chart.js): guardados para o app funcionar sem internet.
    if (url.origin === 'https://cdn.jsdelivr.net' || url.origin === 'https://unpkg.com') {
        event.respondWith(externo(req));
        return;
    }
    if (url.origin !== self.location.origin) return;
    if (deveIgnorar(url.pathname)) {
        // Nunca vai para o cache, mas sem internet a navegacao mostra a tela "offline" em vez do erro do navegador.
        if (req.mode === 'navigate') {
            event.respondWith(fetch(req).catch(async () => (await caches.match('/offline', { cacheName: CACHE_SHELL })) || Response.error()));
        }
        return;
    }

    if (ehEstatico(url.pathname)) {
        event.respondWith(estatico(req));
        return;
    }
    if (req.mode === 'navigate') {
        event.respondWith(navegacao(req));
    }
});

// ---- Notificacoes push (lembretes de vencimento) ----
self.addEventListener('push', (event) => {
    let dados = {};
    try { dados = event.data ? event.data.json() : {}; } catch (e) { dados = {}; }
    // O servidor pode mandar botoes e vibracao (Financeiro); o icone e sempre o do app.
    const opcoes = {
        body: dados.body || '',
        icon: '/assets/icons/icon-192.png',
        badge: '/assets/icons/icon-192.png',
        tag: dados.tag || 'myfinance',
        renotify: true,
        timestamp: Date.now(),
        data: { url: dados.url || '/', token: dados.token || null }
    };
    if (dados.vibrate) opcoes.vibrate = dados.vibrate;
    if (Array.isArray(dados.actions) && dados.actions.length) opcoes.actions = dados.actions.slice(0, 2);
    event.waitUntil(self.registration.showNotification(dados.title || 'MyFinance', opcoes));
});

// Botoes da notificacao do Financeiro (nao ha sessao aqui: a acao vai com um token assinado pelo servidor).
async function acaoFinanceiro(acao, token, destino) {
    try {
        const resp = await fetch('/financeiro/acao', {
            method: 'POST',
            credentials: 'omit',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ acao, token })
        });
        const r = await resp.json();
        await self.registration.showNotification(r.titulo || 'MyFinance', {
            body: r.mensagem || '',
            icon: '/assets/icons/icon-192.png',
            badge: '/assets/icons/icon-192.png',
            tag: 'financeiro-confirma'
        });
        await new Promise((ok) => setTimeout(ok, 6000));
        const abertas = await self.registration.getNotifications({ tag: 'financeiro-confirma' });
        abertas.forEach((n) => n.close());
    } catch (e) {
        // Sem internet ou token vencido: abre a tela do Financeiro, onde os mesmos botoes funcionam.
        await self.clients.openWindow(destino);
    }
}

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const info = event.notification.data || {};
    const destino = new URL(info.url || '/', self.location.origin).href;
    if ((event.action === 'pausar' || event.action === 'desativar') && info.token) {
        event.waitUntil(acaoFinanceiro(event.action, info.token, destino));
        return;
    }
    event.waitUntil((async () => {
        const abas = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
        for (const aba of abas) {
            if (new URL(aba.url).origin === self.location.origin && 'focus' in aba) {
                await aba.focus();
                if ('navigate' in aba) await aba.navigate(destino).catch(() => {});
                return;
            }
        }
        await self.clients.openWindow(destino);
    })());
});
