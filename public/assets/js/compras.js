// Modulo Compras: marcar itens e salvar precos sem recarregar a pagina; diferenca ao vivo ao fechar a compra;
// leitura de nota por foto. Sem JavaScript os formularios funcionam normalmente (envio e recarga da pagina).
(function () {
    'use strict';
    var meta = document.querySelector('meta[name="csrf-token"]');
    var csrf = meta ? meta.getAttribute('content') : '';

    function enviar(form) {
        return fetch(form.action, {
            method: 'POST', credentials: 'same-origin',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-CSRF-Token': csrf, Accept: 'application/json' },
            body: new URLSearchParams(new FormData(form)).toString()
        }).then(function (r) { if (!r.ok) throw new Error('http'); return r.json(); });
    }

    function progresso(est) {
        var el = document.getElementById('compras-progresso');
        if (!el || !est) return;
        var modelo = el.getAttribute('data-modelo');
        if (modelo) el.textContent = modelo.replace('{marcados}', est.marcados).replace('{total}', est.itens);
    }

    document.addEventListener('submit', function (e) {
        var form = e.target.closest('form[data-compras-ajax]');
        if (!form) return;
        e.preventDefault();
        var tipo = form.getAttribute('data-compras-ajax');
        var linha = form.closest('.compras-item');
        enviar(form).then(function (r) {
            if (tipo === 'marcar') {
                var campo = form.querySelector('input[name="marcado"]');
                var marcado = campo.value === '1';
                linha.classList.toggle('is-marcado', marcado);
                form.querySelector('.compras-check').setAttribute('aria-pressed', marcado ? 'true' : 'false');
                campo.value = marcado ? '0' : '1';
                progresso(r.estimativa);
            } else {
                // O preco muda a estimativa: recarrega para mostrar o novo valor.
                window.location.reload();
            }
        }).catch(function () { form.submit(); });
    });

    // Salvar o preco ao sair do campo.
    document.addEventListener('change', function (e) {
        var campo = e.target;
        var form = campo.form;
        if (form && form.getAttribute('data-compras-ajax') === 'preco') form.requestSubmit();
    });

    // ---------- Fechar a compra ----------
    var total = document.getElementById('fechar-total');
    var diff = document.getElementById('compras-diff');
    if (total && diff) {
        var estimativa = parseFloat(total.getAttribute('data-estimativa'));
        var formatar = function (v) {
            // GF_OFF e definido no fim da pagina, depois deste script: so existe na hora de digitar.
            var lang = (window.GF_OFF && window.GF_OFF.lang) || undefined;
            var moeda = (window.GF_OFF && window.GF_OFF.moeda) || '';
            try { return new Intl.NumberFormat(lang, moeda ? { style: 'currency', currency: moeda } : {}).format(v); } catch (err) { return String(v); }
        };
        var ler = function (s) {
            s = String(s || '').replace(/[^\d.,-]/g, '');
            if (s.indexOf(',') > -1 && s.indexOf('.') > -1) s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
            else if (s.indexOf(',') > -1) s = s.replace(',', '.');
            else if (/^\d{1,3}(\.\d{3})+$/.test(s)) s = s.replace(/\./g, '');
            return parseFloat(s);
        };
        var atualizar = function () {
            var v = ler(total.value);
            if (!(v > 0) || !(estimativa > 0)) { diff.textContent = ''; return; }
            var d = Math.round((v - estimativa) * 100) / 100;
            if (d === 0) diff.textContent = total.getAttribute('data-t-igual');
            else diff.textContent = total.getAttribute(d > 0 ? 'data-t-mais' : 'data-t-menos').replace('{valor}', formatar(Math.abs(d)));
        };
        total.addEventListener('input', atualizar);
        document.addEventListener('DOMContentLoaded', atualizar);
    }

    // ---------- Leitura de nota por foto ----------
    var cartao = document.getElementById('compras-nota');
    var arquivo = document.getElementById('compras-nota-arquivo');
    if (cartao && arquivo) {
        var status = document.getElementById('compras-nota-status');
        var bloco = document.getElementById('compras-nota-linhas');
        var T = function (k) { return cartao.getAttribute('data-t-' + k) || ''; };
        var mostrar = function (texto, erro) { status.textContent = texto; status.className = 'compras-nota__status ' + (erro ? 'is-erro' : 'muted'); };
        var quando = function (el, tipo, texto) { var d = document.createElement(el); if (texto) d.textContent = texto; if (tipo) d.className = tipo; return d; };

        // Reduz a foto do celular (varios MB) antes de enviar: o texto da nota continua legivel e o envio fica rapido.
        var reduzir = function (arq) {
            return new Promise(function (resolve) {
                if (!window.createImageBitmap || !arq.type || arq.type.indexOf('image/') !== 0) return resolve(arq);
                createImageBitmap(arq).then(function (img) {
                    var maior = Math.max(img.width, img.height), escala = Math.min(1, 2000 / maior);
                    if (escala === 1 && arq.size < 1500000) return resolve(arq);
                    var c = document.createElement('canvas');
                    c.width = Math.round(img.width * escala); c.height = Math.round(img.height * escala);
                    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
                    c.toBlob(function (b) { resolve(b && b.size < arq.size ? b : arq); }, 'image/jpeg', 0.88);
                }).catch(function () { resolve(arq); });
            });
        };

        var contador = 0;
        var linha = function (idNome, nome, valor, rotulo, campos) {
            var l = quando('div', 'compras-nota__linha');
            var chk = document.createElement('input');
            chk.type = 'checkbox'; chk.checked = true; chk.id = 'nota-l-' + (++contador);
            chk.setAttribute('aria-label', nome);
            var info = quando('label', 'compras-nota__nome'); info.setAttribute('for', chk.id);
            info.appendChild(quando('span', '', nome));
            info.appendChild(quando('small', 'muted', rotulo));
            var preco = document.createElement('input');
            preco.type = 'text'; preco.className = 'input'; preco.inputMode = 'decimal'; preco.maxLength = 20; preco.value = num(valor);
            preco.name = campos.preco; preco.setAttribute('aria-label', T('preco') + ': ' + nome);
            l.appendChild(chk); l.appendChild(info); l.appendChild(preco);
            var extras = [];
            Object.keys(campos.fixos).forEach(function (n) {
                var h = document.createElement('input'); h.type = 'hidden'; h.name = n; h.value = campos.fixos[n]; l.appendChild(h); extras.push(h);
            });
            // Desmarcar tira a linha do envio (campo desativado nao e enviado).
            chk.addEventListener('change', function () {
                preco.disabled = !chk.checked; extras.forEach(function (h) { h.disabled = !chk.checked; });
                l.classList.toggle('is-fora', !chk.checked);
            });
            return l;
        };

        // 38.4 vira "38.40"; valores inteiros (moedas sem centavos) ficam como estao.
        var num = function (v) { v = Number(v); return Math.round(v) === v ? String(v) : v.toFixed(2); };

        var aplicar = function (nota) {
            bloco.textContent = '';
            var avisos = [];
            if (nota.total) {
                total.value = num(nota.total);
                total.dispatchEvent(new Event('input', { bubbles: true }));
            }
            var data = document.getElementById('fechar-data');
            if (nota.data && data && (!data.max || nota.data <= data.max)) data.value = nota.data;
            var jaMarcados = 0, novos = 0, extras = 0, k = 0;
            nota.itens.forEach(function (it) {
                if (it.itemId) {
                    var existente = document.querySelector('input[name="preco_' + it.itemId + '"]');
                    if (existente) { existente.value = num(it.valor); jaMarcados++; return; }
                    // Item da lista que ainda nao estava marcado: a nota mostra que foi comprado.
                    var fixos = {}; fixos['comprou_' + it.itemId] = '1';
                    bloco.appendChild(linha(it.itemId, it.nome, it.valor, T('na-lista'), { preco: 'preco_' + it.itemId, fixos: fixos }));
                    var rest = document.querySelector('[data-restante="' + it.itemId + '"]');
                    if (rest) rest.hidden = true;
                    novos++;
                } else {
                    k++;
                    var f2 = {}; f2['extra_nome_' + k] = it.nome;
                    bloco.appendChild(linha(k, it.nome, it.valor, T('extra'), { preco: 'extra_preco_' + k, fixos: f2 }));
                    extras++;
                }
            });
            if (!nota.totalLido) avisos.push(T('total-somado'));
            if (!nota.somaConfere) avisos.push(T('nao-confere'));
            var resumo = T('aplicado').replace('{lista}', jaMarcados + novos).replace('{extras}', extras) + (nota.loja ? ' · ' + nota.loja : '');
            mostrar(resumo, false);
            avisos.forEach(function (a) { bloco.insertBefore(quando('p', 'compras-nota__aviso', a), bloco.firstChild); });
            bloco.hidden = !bloco.children.length;
            if (bloco.children.length) bloco.insertBefore(quando('p', 'muted compras-nota__ajuda', T('conferir')), bloco.firstChild);
        };

        arquivo.addEventListener('change', function () {
            var arq = arquivo.files && arquivo.files[0];
            if (!arq) return;
            mostrar(T('lendo'), false);
            cartao.classList.add('is-lendo');
            reduzir(arq).then(function (blob) {
                var fd = new FormData();
                fd.append('nota', blob, 'nota.jpg');
                return fetch(cartao.getAttribute('data-url'), { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf, Accept: 'application/json' }, body: fd });
            }).then(function (r) {
                return r.json().catch(function () { return { sucesso: false, erro: T('erro') }; });
            }).then(function (r) {
                if (!r.sucesso) throw new Error(r.erro || T('erro'));
                aplicar(r.nota);
            }).catch(function (err) {
                mostrar(err && err.message ? err.message : T('erro'), true);
            }).then(function () {
                cartao.classList.remove('is-lendo');
                arquivo.value = '';
            });
        });
    }
})();
