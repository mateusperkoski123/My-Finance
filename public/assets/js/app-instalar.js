// Instalacao do aplicativo (PWA). Pergunta UMA vez ("Voce deseja instalar o Aplicativo?"), lembra a resposta neste aparelho e deixa
// a opcao de instalar em Configuracoes. Nao pergunta de novo se o app ja foi instalado ou se o usuario disse "Nao".
// Este arquivo e carregado no <head> para nao perder o evento beforeinstallprompt do navegador.
(function () {
    if (typeof window === 'undefined') return;
    const CH_INSTALADO = 'pwa_instalado';
    const CH_NAO = 'pwa_install_dismissed';
    const T = () => window.GF_INSTALAR_T || {};
    const tr = (k, vazio) => T()[k] || vazio || k;

    const ler = (k) => { try { return localStorage.getItem(k) === '1'; } catch (e) { return false; } };
    const gravar = (k) => { try { localStorage.setItem(k, '1'); } catch (e) { /* navegador sem armazenamento */ } };

    let prompt = null; // evento beforeinstallprompt guardado
    const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) && !window.MSStream;
    const standalone = () => Boolean(window.navigator.standalone || (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches));

    // Rodando como aplicativo ja e prova de que esta instalado.
    if (standalone()) gravar(CH_INSTALADO);

    // 'instalado' | 'disponivel' | 'ios' | 'indisponivel'
    function estado() {
        if (ler(CH_INSTALADO) || standalone()) return 'instalado';
        if (prompt) return 'disponivel';
        if (ios) return 'ios';
        return 'indisponivel';
    }

    function avisar() { window.dispatchEvent(new CustomEvent('gf-instalar-estado', { detail: { estado: estado() } })); }

    const aviso = (msg) => { if (window.gfToast) window.gfToast(msg, 'sucesso'); };

    // ---------- Banner: pergunta unica ----------
    function banner() { return document.getElementById('pwa-install-banner'); }
    function esconder() { const b = banner(); if (b) b.style.display = 'none'; }

    function mostrarSePreciso() {
        const b = banner();
        if (!b || !window.GF_USER_ID) return; // so para quem entrou na conta
        if (ler(CH_INSTALADO) || ler(CH_NAO) || standalone()) return;
        if (!prompt && !ios) return; // navegador sem instalacao: nao pergunta
        document.getElementById('pwa-install-text').textContent = tr('pergunta', 'Você deseja instalar o Aplicativo?');
        document.getElementById('btn-pwa-sim').textContent = tr('sim', 'Sim');
        document.getElementById('btn-pwa-nao').textContent = tr('nao', 'Não');
        document.getElementById('btn-pwa-sim').style.display = '';
        document.getElementById('btn-pwa-nao').style.display = '';
        b.style.display = 'flex';
    }

    // Abre a janela de instalacao do navegador. Devolve 'aceito' | 'recusado' | 'ios' | 'indisponivel'.
    async function instalar() {
        if (prompt) {
            const p = prompt; prompt = null;
            try {
                p.prompt();
                const r = await p.userChoice;
                if (r && r.outcome === 'accepted') { gravar(CH_INSTALADO); avisar(); return 'aceito'; }
            } catch (e) { /* janela fechada */ }
            avisar();
            return 'recusado';
        }
        return ios ? 'ios' : 'indisponivel';
    }

    async function responderSim() {
        const r = await instalar();
        if (r === 'ios') {
            // No iPhone/iPad a instalacao e manual: mostra o passo a passo e nao pergunta de novo.
            document.getElementById('pwa-install-text').textContent = tr('dica_ios', '');
            document.getElementById('btn-pwa-sim').style.display = 'none';
            const nao = document.getElementById('btn-pwa-nao'); nao.textContent = tr('entendi', 'Entendi');
            gravar(CH_NAO);
            return;
        }
        esconder();
        if (r === 'aceito') aviso(tr('instalado_toast', 'Aplicativo instalado!'));
        else gravar(CH_NAO); // cancelou a janela do navegador = nao quer: nao pergunta de novo
    }

    function responderNao() { gravar(CH_NAO); esconder(); avisar(); }

    window.addEventListener('beforeinstallprompt', (e) => {
        e.preventDefault();
        prompt = e;
        avisar();
        if (document.readyState !== 'loading') mostrarSePreciso();
    });
    window.addEventListener('appinstalled', () => {
        gravar(CH_INSTALADO); prompt = null; esconder(); avisar();
        aviso(tr('instalado_toast', 'Aplicativo instalado!'));
    });

    document.addEventListener('DOMContentLoaded', () => {
        const sim = document.getElementById('btn-pwa-sim'); const nao = document.getElementById('btn-pwa-nao');
        if (sim) sim.addEventListener('click', responderSim);
        if (nao) nao.addEventListener('click', responderNao);
        mostrarSePreciso();
        avisar();
    });

    window.GfInstalar = { estado, instalar, avisar };
})();
