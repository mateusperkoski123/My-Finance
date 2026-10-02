// Menu do perfil (icone da direita) e foto de perfil: escolher/trocar/remover. A imagem e recortada em quadrado e reduzida
// no proprio aparelho (256x256 JPEG, poucos KB) antes de ir ao servidor.
(function () {
    if (typeof window === 'undefined') return;
    const T = window.GF_FOTO_T || {};
    const tr = (k, v) => T[k] || v || k;
    const toast = (m, tipo) => { if (window.gfToast) window.gfToast(m, tipo || 'sucesso'); };
    const csrf = () => { const m = document.querySelector('meta[name="csrf-token"]'); return m ? m.getAttribute('content') : ''; };
    const LADO = 256;

    // ---------- Menu do icone do perfil ----------
    function menu() { return document.getElementById('menu-perfil'); }
    function botao() { return document.getElementById('btn-toggle-menu'); }
    function fecharMenu() { const m = menu(); if (m) { m.hidden = true; } const b = botao(); if (b) b.setAttribute('aria-expanded', 'false'); }
    function alternarMenu() {
        const m = menu(); if (!m) return;
        const abrir = m.hidden;
        m.hidden = !abrir;
        botao().setAttribute('aria-expanded', abrir ? 'true' : 'false');
    }

    // ---------- Avatares na tela ----------
    function desenharAvatares(url) {
        document.querySelectorAll('.js-avatar').forEach((el) => {
            el.textContent = '';
            if (url) {
                const img = document.createElement('img');
                img.alt = ''; img.src = url;
                img.addEventListener('error', () => { el.textContent = el.dataset.inicial || ''; });
                el.appendChild(img);
            } else {
                el.textContent = el.dataset.inicial || '';
            }
        });
        window.GF_TEM_FOTO = Boolean(url);
        atualizarRotulos();
    }

    function atualizarRotulos() {
        const tem = Boolean(window.GF_TEM_FOTO);
        document.querySelectorAll('[data-rotulo-foto]').forEach((el) => { el.textContent = tem ? tr('alterar') : tr('adicionar'); });
        const rem = document.getElementById('foto-remover'); if (rem) rem.hidden = !tem;
    }

    // ---------- Modal da foto ----------
    let blobPronto = null;
    function modal() { return document.getElementById('modal-foto'); }

    function limparEscolha() {
        blobPronto = null;
        const salvar = document.getElementById('foto-salvar'); if (salvar) salvar.disabled = true;
        const entrada = document.getElementById('foto-arquivo'); if (entrada) entrada.value = '';
        const prev = document.getElementById('foto-previa');
        if (prev) {
            prev.textContent = '';
            const origem = document.querySelector('.navbar__avatar.js-avatar img');
            if (origem && window.GF_TEM_FOTO) { const i = document.createElement('img'); i.alt = ''; i.src = origem.src; prev.appendChild(i); }
            else prev.textContent = prev.dataset.inicial || '';
        }
        const erro = document.getElementById('foto-erro'); if (erro) { erro.hidden = true; erro.textContent = ''; }
    }
    function mostrarErro(msg) { const e = document.getElementById('foto-erro'); if (e) { e.textContent = msg; e.hidden = false; } }

    function abrirModal() {
        fecharMenu();
        const m = modal(); if (!m) return;
        limparEscolha(); atualizarRotulos();
        m.classList.add('is-open');
    }

    async function carregarImagem(arquivo) {
        if (window.createImageBitmap) {
            try { return await createImageBitmap(arquivo, { imageOrientation: 'from-image' }); } catch (e) { /* tenta o metodo classico */ }
        }
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(arquivo);
            const img = new Image();
            img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('imagem')); };
            img.src = url;
        });
    }

    // Recorta o centro em quadrado e reduz para LADO x LADO (JPEG).
    async function prepararFoto(arquivo) {
        const img = await carregarImagem(arquivo);
        const w = img.width || img.naturalWidth; const h = img.height || img.naturalHeight;
        if (!w || !h) throw new Error('imagem');
        const lado = Math.min(w, h);
        const c = document.createElement('canvas'); c.width = LADO; c.height = LADO;
        const ctx = c.getContext('2d');
        ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, LADO, LADO);
        ctx.drawImage(img, (w - lado) / 2, (h - lado) / 2, lado, lado, 0, 0, LADO, LADO);
        const blob = await new Promise((res) => c.toBlob(res, 'image/jpeg', 0.85));
        if (!blob) throw new Error('imagem');
        return { blob, url: c.toDataURL('image/jpeg', 0.85) };
    }

    document.addEventListener('change', async (e) => {
        if (e.target.id !== 'foto-arquivo') return;
        const arq = e.target.files && e.target.files[0];
        if (!arq) return;
        if (!/^image\/(jpeg|png|webp|gif|bmp)/.test(arq.type)) { mostrarErro(tr('erro_tipo')); return; }
        try {
            const r = await prepararFoto(arq);
            blobPronto = r.blob;
            const prev = document.getElementById('foto-previa');
            prev.textContent = ''; const i = document.createElement('img'); i.alt = ''; i.src = r.url; prev.appendChild(i);
            document.getElementById('foto-salvar').disabled = false;
            const erro = document.getElementById('foto-erro'); erro.hidden = true;
        } catch (err) {
            blobPronto = null;
            mostrarErro(tr('erro_tipo'));
        }
    });

    function semInternet() {
        if (window.GfConexao && window.GfConexao.online === false) { toast(tr('sem_internet'), 'erro'); return true; }
        return false;
    }

    async function salvar() {
        if (!blobPronto || semInternet()) return;
        const btn = document.getElementById('foto-salvar'); btn.disabled = true;
        try {
            const fd = new FormData(); fd.append('foto', blobPronto, 'foto.jpg');
            const r = await fetch('/perfil/foto', { method: 'POST', body: fd, credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf(), Accept: 'application/json' } });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || !j.sucesso) { mostrarErro(j.erro === 'foto_grande' ? tr('erro_grande') : tr('erro_salvar')); btn.disabled = false; return; }
            desenharAvatares(j.url);
            modal().classList.remove('is-open');
            toast(tr('salva'));
        } catch (err) {
            mostrarErro(tr('erro_salvar')); btn.disabled = false;
        }
    }

    async function remover() {
        if (semInternet()) return;
        try {
            const r = await fetch('/perfil/foto/remover', { method: 'POST', credentials: 'same-origin', headers: { 'X-CSRF-Token': csrf(), Accept: 'application/json' } });
            const j = await r.json().catch(() => ({}));
            if (!r.ok || !j.sucesso) { mostrarErro(tr('erro_salvar')); return; }
            desenharAvatares(null);
            modal().classList.remove('is-open');
            toast(tr('removida'));
        } catch (err) { mostrarErro(tr('erro_salvar')); }
    }

    document.addEventListener('click', (e) => {
        if (e.target.closest('#btn-toggle-menu')) { e.stopPropagation(); alternarMenu(); return; }
        if (e.target.closest('[data-abrir-foto]')) { abrirModal(); return; }
        if (e.target.closest('#foto-escolher')) { document.getElementById('foto-arquivo').click(); return; }
        if (e.target.closest('#foto-salvar')) { salvar(); return; }
        if (e.target.closest('#foto-remover')) { remover(); return; }
        if (menu() && !menu().hidden && !e.target.closest('#menu-perfil')) fecharMenu();
        else if (e.target.closest('#menu-perfil a')) fecharMenu();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') fecharMenu(); });
    document.addEventListener('DOMContentLoaded', atualizarRotulos);
})();
