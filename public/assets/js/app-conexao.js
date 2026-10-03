// Estado real da conexao: navigator.onLine so diz se existe uma rede (ela pode estar sem internet ou o servidor fora do ar).
// Aqui o servidor e consultado de verdade (a cada poucos segundos e quando o navegador avisa uma mudanca).
// Sem conexao: o indicador do topo mostra "Sem conexao", os modulos que precisam de internet ficam bloqueados com um aviso
// e as acoes que dependem do servidor explicam o motivo em vez de falhar.
(function () {
    if (typeof window === 'undefined') return;
    const T = window.GF_OFF_T || {};
    const tr = (k, vazio) => T[k] || vazio || k;
    // Modulos que so funcionam com internet (IA, comunidade, administracao, assinatura/pagamentos).
    const SO_ONLINE = /^\/(ia|comunidade|admin|assinatura)(\/|\?|$)/;
    const estado = { online: navigator.onLine };
    window.GfConexao = estado;

    function aplicar(online) {
        const mudou = estado.online !== online;
        estado.online = online;
        if (document.body) document.body.classList.toggle('sem-internet', !online);
        marcarLinks();
        if (mudou) window.dispatchEvent(new CustomEvent('gf-conexao', { detail: { online } }));
        avisoOffline(online);
        const badge = document.getElementById('pwa-status-badge');
        const texto = document.getElementById('pwa-status-text');
        if (badge && texto) {
            badge.classList.toggle('is-offline', !online);
            badge.classList.toggle('is-online', online);
            texto.textContent = online ? tr('conectado', 'Conectado') : tr('sem_conexao', 'Sem conexão');
        }
    }

    // Aviso "voce esta sem internet": aparece uma vez por periodo offline, pode ser fechado e o app segue funcionando.
    function avisoOffline(online) {
        try {
            if (online) { sessionStorage.removeItem('gf_aviso_offline'); return; }
            if (!window.GF_USER_ID || sessionStorage.getItem('gf_aviso_offline') === '1') return;
            const m = document.getElementById('modal-offline-aviso');
            if (!m) return;
            sessionStorage.setItem('gf_aviso_offline', '1');
            m.classList.add('is-open');
        } catch (e) { /* sem sessionStorage: mostra sempre que mudar de estado */ }
    }

    async function verificar() {
        if (!navigator.onLine) { aplicar(false); return false; }
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 3500);
        let ok = false;
        // /ping responde sem sessao nem banco (server.js): e chamado a cada poucos segundos e antes de cada envio de formulario.
        try { ok = (await fetch('/ping', { method: 'HEAD', cache: 'no-store', signal: ctl.signal })).ok; } catch (e) { ok = false; } finally { clearTimeout(t); }
        aplicar(ok);
        return ok;
    }

    function marcarLinks() {
        document.querySelectorAll('a[href]').forEach((a) => {
            const h = a.getAttribute('href') || '';
            if (SO_ONLINE.test(h)) {
                a.dataset.requerInternet = '1';
                a.classList.toggle('requer-internet-bloqueado', !estado.online);
                if (!estado.online) a.setAttribute('title', tr('modulo_requer', 'Este módulo precisa de internet')); else if (a.getAttribute('title') === tr('modulo_requer', '')) a.removeAttribute('title');
            }
        });
    }

    // Clique em modulo que precisa de internet, sem conexao: explica em vez de abrir uma tela de erro.
    document.addEventListener('click', (e) => {
        const a = e.target.closest && e.target.closest('a[data-requer-internet="1"]');
        if (a && !estado.online) {
            e.preventDefault();
            if (window.gfToast) window.gfToast(tr('modulo_requer', 'Este módulo precisa de internet'), 'erro');
        }
    }, true);

    // Qualquer outro formulario (categorias, configuracoes...) sem conexao: avisa. As operacoes que funcionam offline
    // (gasto/receita, pagar, transferir) sao tratadas por app-offline.js, que roda antes e interrompe o evento.
    document.addEventListener('submit', (e) => {
        if (estado.online) return;
        const f = e.target;
        const acao = f && f.getAttribute ? (f.getAttribute('action') || '').split('?')[0] : '';
        const funcionaOffline = acao === '/lancamentos' || acao === '/lancamentos/criar' || acao === '/contas/transferir' || acao === '/contas/agendar-transferencia' || acao === '/categorias/criar' || /^\/lancamentos\/\d+\/marcar-pago$/.test(acao) || /^\/fila\/[^/]+\/editar$/.test(acao);
        if (!funcionaOffline && f && f.getAttribute && (f.getAttribute('method') || 'get').toLowerCase() === 'post') {
            e.preventDefault();
            e.stopImmediatePropagation();
            if (window.gfToast) window.gfToast(tr('acao_requer', 'Esta ação precisa de internet'), 'erro');
        }
    }, true);

    window.addEventListener('online', verificar);
    window.addEventListener('offline', () => aplicar(false));
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') verificar(); });
    window.addEventListener('focus', verificar);
    document.addEventListener('DOMContentLoaded', () => { marcarLinks(); verificar(); setInterval(() => { if (document.visibilityState === 'visible') verificar(); }, 8000); });
    window.GfConexao.verificar = verificar;
})();
