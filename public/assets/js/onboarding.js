// Primeiros passos: a lista do que configurar (botao no canto da tela) e o passo a passo que destaca onde tocar.
// Passos, alvos e textos vem de GET /onboarding/dados (src/node/core/onboarding.js). Neste aparelho ficam so as
// telas ja visitadas, a escolha de esconder a lista e quantos passos ja estavam feitos (para dar os parabens).
(function () {
    'use strict';
    var uid = window.GF_USER_ID;
    if (!uid) return;

    var VERSAO = (document.currentScript && document.currentScript.src.split('?')[1]) || '';
    var dados = null;
    var tour = null;
    var ui = {};

    function chave(n) { return 'gf_onb_' + n + '_' + uid; }
    function ler(n) { try { return localStorage.getItem(chave(n)); } catch (e) { return null; } }
    function gravar(n, v) { try { if (v === null) localStorage.removeItem(chave(n)); else localStorage.setItem(chave(n), String(v)); } catch (e) {} }

    function esc(s) {
        return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function fmt(s) { return esc(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>'); }
    function txt(k, p) {
        var s = (dados && dados.textos[k]) || '';
        Object.keys(p || {}).forEach(function (c) { s = s.split('{' + c + '}').join(String(p[c])); });
        return s;
    }
    function el(tag, cls, html) {
        var e = document.createElement(tag);
        if (cls) e.className = cls;
        if (html !== undefined) e.innerHTML = html;
        return e;
    }

    // Telas que contam como passo feito so por serem abertas.
    var rota = location.pathname;
    if (rota === '/categorias') gravar('visto_categorias', '1');
    if (rota === '/relatorios') gravar('visto_relatorios', '1');

    // ?tour=id (vindo da lista em outra tela) comeca o passo a passo desta tela.
    var params = new URLSearchParams(location.search);
    var tourPedido = params.get('tour');
    if (tourPedido) {
        params.delete('tour');
        var qs = params.toString();
        history.replaceState(history.state, '', location.pathname + (qs ? '?' + qs : '') + location.hash);
    }

    function carregarCss() {
        if (document.getElementById('onb-css')) return;
        var l = document.createElement('link');
        l.id = 'onb-css';
        l.rel = 'stylesheet';
        l.href = '/assets/css/onboarding.css' + (VERSAO ? '?' + VERSAO : '');
        document.head.appendChild(l);
    }

    function carregar() {
        if (dados) return Promise.resolve(dados);
        return fetch('/onboarding/dados', { credentials: 'same-origin', headers: { Accept: 'application/json' } })
            .then(function (r) {
                var tipo = r.headers.get('Content-Type') || '';
                if (!r.ok || tipo.indexOf('application/json') < 0) throw new Error('indisponivel');
                return r.json();
            })
            .then(function (d) {
                d.passos.forEach(function (p) { if (p.visita) p.feito = ler('visto_' + p.id) === '1'; });
                d.passos.forEach(function (p) {
                    var req = p.requer && d.passos.filter(function (o) { return o.id === p.requer; })[0];
                    p.bloqueado = Boolean(req && !req.feito);
                });
                dados = d;
                carregarCss();
                return d;
            });
    }

    function contagem() {
        var feitos = dados.passos.filter(function (p) { return p.feito; }).length;
        return { feitos: feitos, total: dados.passos.length };
    }
    function proximoPasso() {
        return dados.passos.filter(function (p) { return !p.feito && !p.bloqueado; })[0] || null;
    }

    // ---------- Lista de primeiros passos ----------
    function montarLista() {
        if (ui.lancador) return;
        ui.lancador = el('button', 'onb-lancador');
        ui.lancador.type = 'button';
        ui.lancador.setAttribute('aria-expanded', 'false');
        ui.lancador.addEventListener('click', function () { if (ui.painel.hidden) abrirPainel(); else fecharPainel(); });

        ui.painel = el('section', 'onb-painel');
        ui.painel.hidden = true;
        ui.painel.setAttribute('role', 'dialog');
        ui.painel.setAttribute('aria-label', txt('titulo'));
        ui.painel.addEventListener('click', function (e) {
            var b = e.target.closest('[data-onb-acao]');
            if (!b) return;
            var acao = b.getAttribute('data-onb-acao');
            if (acao === 'minimizar') fecharPainel();
            else if (acao === 'ocultar') ocultarLista();
            else if (acao === 'mostrar') mostrarPasso(b.getAttribute('data-onb-id'));
        });
        document.body.appendChild(ui.painel);
        document.body.appendChild(ui.lancador);
        document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !tour && !ui.painel.hidden) fecharPainel(); });
    }

    function desenharLista(aviso) {
        var c = contagem();
        var tudo = c.feitos === c.total;
        ui.lancador.innerHTML = '<i class="ph ph-rocket-launch" aria-hidden="true"></i><span class="onb-lancador__txt">' + esc(txt('titulo')) +
            '</span><b>' + c.feitos + '/' + c.total + '</b>';
        ui.lancador.setAttribute('aria-label', txt('abrir') + ' (' + txt('progresso', c) + ')');

        var prox = proximoPasso();
        var h = '<header class="onb-painel__topo"><div><strong>' + esc(tudo ? txt('pronto_titulo') : txt('titulo')) + '</strong><small>' +
            esc(txt('progresso', c)) + '</small></div><button type="button" class="onb-painel__x" data-onb-acao="minimizar" aria-label="' +
            esc(txt('minimizar')) + '" title="' + esc(txt('minimizar')) + '"><i class="ph ph-minus" aria-hidden="true"></i></button></header>' +
            '<div class="onb-barra" aria-hidden="true"><span style="width:' + Math.round(c.feitos / c.total * 100) + '%"></span></div>';
        if (tudo) h += '<p class="onb-aviso onb-aviso--pronto"><i class="ph-fill ph-confetti" aria-hidden="true"></i> ' + esc(txt('pronto_texto')) + '</p>';
        else if (aviso && prox) h += '<p class="onb-aviso"><i class="ph-fill ph-check-circle" aria-hidden="true"></i> ' + esc(txt('parabens')) + ' <strong>' + esc(prox.titulo) + '</strong></p>';
        h += '<ol class="onb-lista">';
        dados.passos.forEach(function (p, i) {
            var classe = p.feito ? 'is-feito' : (p.bloqueado ? 'is-bloqueado' : (prox && prox.id === p.id ? 'is-proximo' : ''));
            h += '<li class="onb-item ' + classe + '"><span class="onb-item__marca" aria-hidden="true">' +
                (p.feito ? '<i class="ph-bold ph-check"></i>' : (i + 1)) + '</span><div class="onb-item__txt"><strong>' + esc(p.titulo) +
                (p.opcional ? ' <em>' + esc(txt('opcional')) + '</em>' : '') + '</strong><small>' + esc(p.bloqueado ? txt('requer_conta') : p.texto) + '</small></div>' +
                (p.bloqueado ? '' : '<button type="button" class="btn btn-sm ' + (classe === 'is-proximo' ? 'btn-primary' : 'btn-outline') +
                    '" data-onb-acao="mostrar" data-onb-id="' + esc(p.id) + '">' + esc(p.feito ? txt('de_novo') : txt('mostrar')) + '</button>') + '</li>';
        });
        h += '</ol><footer class="onb-painel__rodape"><a href="/guia"><i class="ph ph-book-open" aria-hidden="true"></i> ' + esc(txt('guia')) +
            '</a><button type="button" class="onb-link" data-onb-acao="ocultar">' + esc(txt('ocultar')) + '</button></footer>';
        ui.painel.innerHTML = h;
    }

    function abrirPainel(aviso) {
        montarLista();
        desenharLista(aviso);
        ui.lancador.hidden = false;
        ui.painel.hidden = false;
        ui.lancador.setAttribute('aria-expanded', 'true');
    }
    function fecharPainel() {
        if (!ui.painel) return;
        ui.painel.hidden = true;
        ui.lancador.setAttribute('aria-expanded', 'false');
    }
    function ocultarLista() {
        gravar('fechado', '1');
        fecharPainel();
        ui.lancador.hidden = true;
        aviso(txt('ocultado'));
    }
    function aviso(msg) {
        var a = el('div', 'onb-toast', fmt(msg));
        a.setAttribute('role', 'status');
        document.body.appendChild(a);
        setTimeout(function () { a.classList.add('is-saindo'); }, 4200);
        setTimeout(function () { a.remove(); }, 4700);
    }

    function mostrarPasso(id) {
        var p = dados.passos.filter(function (o) { return o.id === id; })[0];
        if (!p) return;
        fecharPainel();
        if (p.pagina === rota) iniciarTour(id);
        else location.href = p.pagina + '?tour=' + encodeURIComponent(id);
    }

    // ---------- Passo a passo ----------
    function visivel(e) {
        if (!e || !e.getClientRects().length) return false;
        var r = e.getBoundingClientRect();
        return r.width > 0 && r.height > 0 && getComputedStyle(e).visibility !== 'hidden';
    }
    function achar(seletor) {
        var lista = document.querySelectorAll(seletor);
        for (var i = 0; i < lista.length; i++) if (visivel(lista[i])) return lista[i];
        return null;
    }
    // O alvo pode demorar a aparecer (o formulario abre com animacao).
    function esperarAlvo(seletor, pronto) {
        var inicio = Date.now();
        (function tentar() {
            if (!tour) return;
            var a = achar(seletor);
            if (a || Date.now() - inicio > 2500) pronto(a);
            else setTimeout(tentar, 100);
        })();
    }

    function iniciarTour(id) {
        var passos = dados.tours[id];
        if (!passos || !passos.length) return;
        encerrarTour();
        if (ui.lancador) ui.lancador.hidden = true;
        tour = { id: id, passos: passos, i: 0, direcao: 1, alvo: null };
        ui.foco = el('div', 'onb-foco');
        ui.balao = el('div', 'onb-balao');
        ui.balao.setAttribute('role', 'dialog');
        ui.balao.setAttribute('aria-live', 'polite');
        ui.balao.addEventListener('click', function (e) {
            var b = e.target.closest('[data-onb-tour]');
            if (!b) return;
            var acao = b.getAttribute('data-onb-tour');
            if (acao === 'sair') encerrarTour();
            else if (acao === 'voltar') irPara(tour.i - 1, -1);
            else avancar();
        });
        ui.veus = [0, 1, 2, 3].map(function () { return document.body.appendChild(el('div', 'onb-veu')); });
        document.body.appendChild(ui.foco);
        document.body.appendChild(ui.balao);
        ui.acompanhar = setInterval(acompanhar, 200);
        window.addEventListener('resize', posicionar);
        window.addEventListener('scroll', posicionar, true);
        document.addEventListener('keydown', teclaTour);
        irPara(0, 1);
    }

    function teclaTour(e) { if (e.key === 'Escape') encerrarTour(); }

    function irPara(i, direcao) {
        if (!tour) return;
        if (i < 0) i = 0;
        if (i >= tour.passos.length) { encerrarTour(true); return; }
        tour.i = i;
        tour.direcao = direcao;
        soltarAlvo();
        var p = tour.passos[i];
        ui.balao.classList.add('is-esperando');
        esperarAlvo(p.alvo, function (alvo) {
            if (!tour || tour.i !== i) return;
            if (!alvo && p.opcional) {
                var seguinte = i + direcao;
                if (seguinte < 0) seguinte = i + 1;
                irPara(seguinte, direcao < 0 && seguinte > i ? 1 : direcao);
                return;
            }
            exibir(p, alvo);
        });
    }

    function soltarAlvo() {
        if (tour && tour.alvo && tour.aoClicar) tour.alvo.removeEventListener('click', tour.aoClicar);
        if (tour) { tour.alvo = null; tour.aoClicar = null; }
    }

    function exibir(p, alvo) {
        tour.alvo = alvo;
        tour.sumiuEm = 0;
        var ultimo = tour.i === tour.passos.length - 1;
        var total = tour.passos.length;
        ui.balao.innerHTML = '<small class="onb-balao__passo">' + esc(txt('passo_de', { n: tour.i + 1, total: total })) + '</small>' +
            '<strong class="onb-balao__titulo">' + esc(p.titulo) + '</strong>' +
            '<p>' + fmt(alvo ? p.texto : p.texto + ' ' + txt('nao_achou')) + '</p>' +
            '<div class="onb-balao__acoes"><button type="button" class="onb-link" data-onb-tour="sair">' + esc(txt('sair')) + '</button><span></span>' +
            (tour.i > 0 ? '<button type="button" class="btn btn-sm btn-outline" data-onb-tour="voltar">' + esc(txt('voltar')) + '</button>' : '') +
            '<button type="button" class="btn btn-sm btn-primary" data-onb-tour="proximo">' + esc(ultimo ? txt('concluir') : txt('proximo')) + '</button></div>';
        ui.balao.classList.remove('is-esperando');
        if (alvo && p.clicar) {
            var i = tour.i;
            tour.aoClicar = function () { setTimeout(function () { if (tour && tour.i === i) irPara(i + 1, 1); }, 250); };
            alvo.addEventListener('click', tour.aoClicar);
        }
        if (alvo) {
            var r = alvo.getBoundingClientRect();
            var folga = window.innerHeight - 12;
            if (r.top < 70 || r.bottom > folga) alvo.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
        posicionar();
    }

    function avancar() {
        var p = tour.passos[tour.i];
        // Num passo de tocar, "Proximo" faz o toque (abre o formulario); o clique leva ao passo seguinte.
        if (p.clicar && tour.alvo) { tour.alvo.click(); return; }
        irPara(tour.i + 1, 1);
    }

    // Se o formulario do passo fechou (salvou sem recarregar a pagina, cancelou ou tocou fora), o passo a passo termina
    // e o servidor diz se o passo ficou feito.
    function acompanhar() {
        if (!tour || !tour.alvo) return;
        if (visivel(tour.alvo)) { tour.sumiuEm = 0; posicionar(); return; }
        if (!tour.sumiuEm) tour.sumiuEm = Date.now();
        else if (Date.now() - tour.sumiuEm > 600) encerrarTour(false, true);
    }

    function caixa(e, top, left, w, h) {
        e.style.top = top + 'px';
        e.style.left = left + 'px';
        e.style.width = Math.max(0, w) + 'px';
        e.style.height = Math.max(0, h) + 'px';
    }

    function posicionar() {
        if (!tour || !ui.balao) return;
        var vw = document.documentElement.clientWidth, vh = window.innerHeight, m = 12;
        var a = tour.alvo && visivel(tour.alvo) ? tour.alvo.getBoundingClientRect() : null;
        if (a) {
            var pad = 6, t = a.top - pad, l = a.left - pad, w = a.width + pad * 2, h = a.height + pad * 2;
            caixa(ui.foco, t, l, w, h);
            ui.foco.hidden = false;
            // Escuro em volta: em cima, embaixo, a esquerda e a direita do destaque.
            caixa(ui.veus[0], 0, 0, vw, t);
            caixa(ui.veus[1], t + h, 0, vw, vh - t - h);
            caixa(ui.veus[2], t, 0, l, h);
            caixa(ui.veus[3], t, l + w, vw - l - w, h);
        } else {
            ui.foco.hidden = true;
            caixa(ui.veus[0], 0, 0, vw, vh);
            for (var k = 1; k < 4; k++) caixa(ui.veus[k], 0, 0, 0, 0);
        }
        var bw = Math.min(360, vw - m * 2);
        ui.balao.style.width = bw + 'px';
        var bh = ui.balao.offsetHeight;
        var top, left;
        if (!a) {
            top = Math.max(m, (vh - bh) / 2);
            left = (vw - bw) / 2;
        } else {
            if (vh - a.bottom >= bh + 22) top = a.bottom + 14;
            else if (a.top >= bh + 22) top = a.top - bh - 14;
            else top = a.bottom + bh + 14 < vh ? a.bottom + 14 : vh - bh - m; // alvo grande: o balao fica na parte de baixo
            left = Math.min(Math.max(m, a.left + a.width / 2 - bw / 2), vw - bw - m);
        }
        ui.balao.style.top = Math.max(m, Math.min(top, vh - bh - m)) + 'px';
        ui.balao.style.left = left + 'px';
    }

    function encerrarTour(concluiu, conferir) {
        if (!tour) return;
        var id = tour.id;
        soltarAlvo();
        clearInterval(ui.acompanhar);
        window.removeEventListener('resize', posicionar);
        window.removeEventListener('scroll', posicionar, true);
        document.removeEventListener('keydown', teclaTour);
        if (ui.foco) ui.foco.remove();
        if (ui.balao) ui.balao.remove();
        (ui.veus || []).forEach(function (v) { v.remove(); });
        ui.foco = ui.balao = ui.veus = null;
        tour = null;
        if (ui.lancador && ler('fechado') !== '1') ui.lancador.hidden = false;
        var p = dados && dados.passos.filter(function (o) { return o.id === id; })[0];
        if (!p || ler('fechado') === '1') return;
        // Telas de consulta (categorias, relatorios) ja contam como feitas ao abrir: mostra o que vem depois.
        if (concluiu && p.visita) { gravar('feitos', contagem().feitos); abrirPainel(true); return; }
        if (conferir && !p.feito) atualizarEstado();
    }

    function atualizarEstado() {
        var antes = contagem().feitos;
        dados = null;
        setTimeout(function () {
            carregar().then(function () {
                var c = contagem();
                gravar('feitos', c.feitos);
                if (c.feitos > antes) abrirPainel(true);
                else if (ui.lancador) desenharLista();
            }).catch(function () {});
        }, 500);
    }

    // ---------- Inicio ----------
    function decidir() {
        var c = contagem();
        var antes = ler('feitos');
        gravar('feitos', c.feitos);
        if (dados.novo) gravar('auto', '1');
        else if (ler('auto') !== '1') gravar('auto', '0');
        if (tourPedido) { montarLista(); desenharLista(); ui.lancador.hidden = ler('fechado') === '1'; iniciarTour(tourPedido); return; }
        if (ler('fechado') === '1' || ler('auto') !== '1') return;
        montarLista();
        desenharLista();
        ui.lancador.hidden = false;
        // Primeira vez, ou um passo acabou de ser feito (ex.: voltou de salvar a conta): abre a lista com o proximo passo.
        if (antes === null ? rota === '/' : c.feitos > Number(antes)) abrirPainel(antes !== null);
    }

    // Mais > Passo a passo: volta a mostrar a lista mesmo depois de escondida.
    document.addEventListener('click', function (e) {
        var b = e.target.closest('[data-onb-abrir]');
        if (!b) return;
        e.preventDefault();
        if (typeof window.fecharFolhas === 'function') window.fecharFolhas();
        var d = b.closest('details');
        if (d) d.removeAttribute('open');
        gravar('fechado', null);
        gravar('auto', '1');
        carregar().then(function () { abrirPainel(); }).catch(function () { location.href = '/guia'; });
    });

    var precisa = tourPedido || (ler('fechado') !== '1' && ler('auto') !== '0');
    if (precisa) carregar().then(decidir).catch(function () {});
})();
