// Mostra, nas listas do Painel e dos Pendentes, os lancamentos feitos sem internet que ainda aguardam envio
// (com a etiqueta "Aguardando envio" e o estado: pago/recebido ou pendente). Tambem marca como pagos os pendentes
// que foram pagos offline. As linhas somem sozinhas quando o servidor confirma e a pagina e recarregada com os dados reais.
(function () {
    if (typeof window === 'undefined' || !window.AppDb || !window.indexedDB) return;
    const T = window.GF_OFF_T || {};
    const tr = (k, v) => T[k] || v || k;
    const FILTROS_QUE_ESCONDEM = ['q', 'busca', 'categoria_id', 'conta_id', 'status', 'categoria', 'conta'];
    let injetando = false;

    const fmtData = (ymd) => { const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ymd || '')); return m ? `${m[3]}/${m[2]}/${m[1]}` : ''; };
    const dataYmd = (v) => String(v || '').slice(0, 10);
    function fmtValor(v) { return window.GfFormatarValor ? window.GfFormatarValor(v) : String(v); }

    function criar(tag, classe, texto) { const e = document.createElement(tag); if (classe) e.className = classe; if (texto != null) e.textContent = texto; return e; }

    function estadoDe(l) {
        if (l.status === 'pago') return { texto: tr(l.tipo === 'receita' ? 'st_recebido' : 'st_pago'), classe: 'badge badge-sucesso' };
        return { texto: tr('st_pendente'), classe: 'badge badge-alerta' };
    }

    function categoriaDe(l, cats) {
        const c = cats.get(Number(l.categoria_id));
        if (!c) return null;
        const pai = c.parent_id ? cats.get(Number(c.parent_id)) : null;
        return { nome: pai ? pai.nome : c.nome, sub: pai ? c.nome : null, cor: (pai || c).cor || '#3b82f6' };
    }

    // Linha do Painel (7 colunas: descricao, categoria, conta, data, valor, estado, acoes)
    function linhaPainel(l, contas, cats) {
        const tr_ = criar('tr', 'gf-prov-row');
        const d = criar('td'); const forte = criar('strong', null, l.descricao || ''); d.appendChild(forte);
        d.appendChild(criar('span', 'badge badge-neutro gf-prov-etiqueta', tr('aguardando_envio')));
        tr_.appendChild(d);
        const c = criar('td'); const cat = categoriaDe(l, cats);
        if (cat) { const w = criar('div'); const n = criar('span', null, cat.nome); n.style.fontWeight = '600'; n.style.fontSize = '13px'; w.appendChild(n); if (cat.sub) { const s = criar('div', 'muted', cat.sub); s.style.fontSize = '11px'; w.appendChild(s); } c.appendChild(w); } else c.appendChild(criar('span', 'muted', '—'));
        tr_.appendChild(c);
        tr_.appendChild(criar('td', null, (contas.get(Number(l.conta_id)) || {}).nome || '—'));
        tr_.appendChild(criar('td', null, fmtData(l.data_competencia)));
        const v = criar('td', null, fmtValor(Number(l.valor))); v.style.fontWeight = '700'; v.style.whiteSpace = 'nowrap'; v.style.color = Number(l.valor) < 0 ? 'var(--red)' : 'var(--green)';
        tr_.appendChild(v);
        const e = criar('td'); const est = estadoDe(l); e.appendChild(criar('span', est.classe, est.texto)); tr_.appendChild(e);
        const a = criar('td', 'td-acoes'); const rel = criar('i', 'ph ph-clock-counter-clockwise'); rel.title = tr('aguardando_envio'); rel.style.color = 'var(--muted)'; const ed = criar('button', 'icon-btn gf-prov-editar'); ed.type = 'button'; ed.title = tr('editar'); ed.setAttribute('aria-label', tr('editar')); ed.setAttribute('data-gf-editar-fila', l.client_id); const edi = criar('i', 'ph ph-pencil-simple'); ed.appendChild(edi); a.appendChild(ed); a.appendChild(rel); tr_.appendChild(a);
        return tr_;
    }

    // Linha das tabelas de Pendentes (4 colunas: descricao/categoria, data, valor, acoes)
    function linhaPendente(l, contas, cats) {
        const tr_ = criar('tr', 'gf-prov-row');
        const d = criar('td'); const forte = criar('strong', null, l.descricao || ''); forte.style.display = 'block'; d.appendChild(forte);
        const cat = categoriaDe(l, cats);
        const sub = criar('div', null, (cat ? cat.nome + (cat.sub ? ' / ' + cat.sub : '') : '—') + ' • ' + ((contas.get(Number(l.conta_id)) || {}).nome || '—'));
        sub.style.fontSize = '11px'; sub.style.color = 'var(--muted)'; d.appendChild(sub);
        d.appendChild(criar('span', 'badge badge-neutro gf-prov-etiqueta', tr('aguardando_envio')));
        tr_.appendChild(d);
        const dt = criar('td', null, fmtData(l.data_competencia)); dt.style.whiteSpace = 'nowrap'; dt.style.fontSize = '13px'; tr_.appendChild(dt);
        const v = criar('td', null, fmtValor(Number(l.valor))); v.style.fontWeight = '700'; v.style.whiteSpace = 'nowrap'; v.style.color = Number(l.valor) < 0 ? 'var(--red)' : 'var(--green)'; tr_.appendChild(v);
        const a = criar('td'); const rel = criar('i', 'ph ph-clock-counter-clockwise'); rel.title = tr('aguardando_envio'); rel.style.color = 'var(--muted)'; const ed = criar('button', 'icon-btn gf-prov-editar'); ed.type = 'button'; ed.title = tr('editar'); ed.setAttribute('aria-label', tr('editar')); ed.setAttribute('data-gf-editar-fila', l.client_id); const edi = criar('i', 'ph ph-pencil-simple'); ed.appendChild(edi); a.appendChild(ed); a.appendChild(rel); tr_.appendChild(a);
        return tr_;
    }

    // Lancamentos que ja existiam no servidor e foram pagos/desfeitos offline: a linha mostra o novo estado.
    function marcarPagosOffline(locais) {
        locais.filter((l) => l.id && l.pendente_sync).forEach((l) => {
            document.querySelectorAll(`form[action$="/lancamentos/${l.id}/marcar-pago"]`).forEach((f) => {
                const linha = f.closest('tr, .pendencias__item'); if (!linha || linha.dataset.gfProvMarcada === '1') return;
                linha.dataset.gfProvMarcada = '1';
                linha.classList.add('gf-pendente-envio');
                f.querySelectorAll('button').forEach((b) => { b.disabled = true; });
                const badge = linha.querySelector('td .badge:not(.badge-neutro)');
                if (badge && linha.tagName === 'TR') { const est = estadoDe(l); badge.className = est.classe; badge.textContent = est.texto; }
                if (!linha.querySelector('.gf-prov-etiqueta')) { const alvo = linha.querySelector('strong, .pendencias__desc'); if (alvo) alvo.insertAdjacentElement('afterend', criar('span', 'badge badge-neutro gf-prov-etiqueta', tr('aguardando_envio'))); }
            });
        });
    }

    async function injetar() {
        if (injetando) return;
        injetando = true;
        try {
            document.querySelectorAll('tr.gf-prov-row').forEach((e) => e.remove());
            const locais = (await window.AppDb.buscarTodos('lancamentos')).filter((l) => l.pendente_sync);
            if (!locais.length) return;
            const contas = new Map((await window.AppDb.buscarTodos('contas')).map((c) => [Number(c.id), c]));
            const cats = new Map((await window.AppDb.buscarTodos('categorias')).filter((c) => c.id).map((c) => [Number(c.id), c]));
            const novos = locais.filter((l) => !l.id); // criados offline (ainda sem numero do servidor)
            const params = new URLSearchParams(location.search);
            const filtrado = FILTROS_QUE_ESCONDEM.some((k) => params.get(k));

            // --- Painel ---
            const controles = document.querySelector('.myfinance-top-controls[data-periodo-ini]');
            const tabela = document.querySelector('table.tabela-lanc tbody');
            if (controles && tabela && !filtrado) {
                const ini = controles.dataset.periodoIni; const fim = controles.dataset.periodoFim;
                const tipo = params.get('tipo');
                novos.filter((l) => dataYmd(l.data_competencia) >= ini && dataYmd(l.data_competencia) <= fim)
                    .filter((l) => !tipo || tipo === 'todas' || (tipo === 'despesas' && l.tipo === 'despesa') || (tipo === 'receitas' && l.tipo === 'receita'))
                    .sort((a, b) => dataYmd(a.data_competencia) < dataYmd(b.data_competencia) ? 1 : -1)
                    .reverse().forEach((l) => tabela.insertBefore(linhaPainel(l, contas, cats), tabela.firstChild));
            }

            // --- Pendentes (aba de Informes): receitas na 1a tabela, gastos na 2a ---
            const tabelasPend = document.querySelectorAll('table.tabela-pend tbody');
            if (tabelasPend.length === 2) {
                const grupos = [novos.filter((l) => l.status === 'pendente' && l.tipo === 'receita'), novos.filter((l) => l.status === 'pendente' && l.tipo === 'despesa')];
                grupos.forEach((lista, i) => {
                    if (!lista.length) return;
                    const corpo = tabelasPend[i];
                    const vazio = corpo.querySelector('.tabela__vazio'); if (vazio) vazio.closest('tr').remove();
                    lista.slice().reverse().forEach((l) => corpo.insertBefore(linhaPendente(l, contas, cats), corpo.firstChild));
                });
            }
            marcarPagosOffline(locais);
        } catch (e) {
            console.warn('Falha ao mostrar pendentes de envio:', e && e.message);
        } finally {
            injetando = false;
        }
    }

    let agendado = null;
    const agendar = () => { clearTimeout(agendado); agendado = setTimeout(injetar, 60); };
    document.addEventListener('DOMContentLoaded', () => {
        injetar();
        // O conteudo e trocado sem recarregar (formularios data-ajax): as linhas provisorias voltam sozinhas.
        const main = document.querySelector('main.container');
        if (main) new MutationObserver((muts) => { if (!muts.every((m) => [...m.addedNodes, ...m.removedNodes].every((n) => n.nodeType === 1 && n.classList && n.classList.contains('gf-prov-row')))) agendar(); }).observe(main, { childList: true, subtree: true });
    });
    window.addEventListener('gf-fila-mudou', agendar);
})();
