// Uso sem internet: registrar gasto/receita (unico, fixo ou repetido), marcar como pago/recebido, transferir e agendar transferencias
// entre contas e criar categorias. Quando nao ha conexao com o servidor, o formulario NAO e enviado: a operacao vai para a fila do
// aparelho (IndexedDB) e e enviada sozinha quando a internet voltar (app-sync.js). Com internet, tudo funciona exatamente como antes.
(function () {
    if (typeof window === 'undefined' || !window.AppDb || !window.indexedDB || !window.AppRegras) return;
    const T = window.GF_OFF_T || {};
    const cfg = window.GF_OFF || {};

    const toast = (msg, tipo) => { if (window.gfToast) window.gfToast(msg, tipo); };
    const tr = (chave, vazio) => T[chave] || vazio || chave;
    window.GF_FILA_N = 0;

    // Tem servidor de verdade? (navigator.onLine so diz que ha uma rede, nao que o servidor responde.)
    async function servidorAlcancavel() {
        if (window.GfConexao && window.GfConexao.verificar) return window.GfConexao.verificar();
        if (!navigator.onLine) return false;
        const ctl = new AbortController();
        const t = setTimeout(() => ctl.abort(), 3000);
        try {
            const r = await fetch('/offline', { method: 'HEAD', cache: 'no-store', signal: ctl.signal });
            return r.ok;
        } catch (e) {
            return false;
        } finally {
            clearTimeout(t);
        }
    }

    function classificar(form) {
        const acao = (form.getAttribute('action') || '').split('?')[0];
        if (acao === '/lancamentos' || acao === '/lancamentos/criar') return 'criar';
        if (/^\/lancamentos\/\d+\/marcar-pago$/.test(acao)) return 'pagar';
        if (acao === '/contas/transferir') return 'transferir';
        if (acao === '/contas/agendar-transferencia') return 'agendar';
        if (acao === '/categorias/criar') return 'categoria';
        return null;
    }

    // Ultimo valor preenchido (o formulario de transferencia envia o mesmo campo em hidden + select).
    const ultimo = (fd, nome) => fd.getAll(nome).map(String).reverse().find((v) => v !== '') || '';

    // As datas padrao vem do HTML guardado (que pode ser de dias atras). Se o usuario nao mexeu na data, vale o dia de HOJE no aparelho.
    function dataDe(form, nome) {
        const campo = form.elements[nome];
        const el = campo && campo.length !== undefined && !campo.tagName ? campo[campo.length - 1] : campo;
        if (!el || !el.value) return window.AppRegras.hojeYMD();
        return el.value === el.defaultValue ? window.AppRegras.hojeYMD() : el.value;
    }

    // Ao abrir um formulario sem conexao, a data ja aparece como hoje (e nao a data em que a pagina foi guardada).
    function renovarDatas(raiz) {
        const hoje = window.AppRegras.hojeYMD();
        raiz.querySelectorAll('input[type="date"][name="data_competencia"], input[type="date"][name="data_pagamento"], input[type="date"][name="data"]').forEach((el) => {
            if (el.value === el.defaultValue) el.value = hoje;
        });
    }

    // Fixo (24 meses) ou Repetir (N vezes); fixo vence se vierem os dois.
    function serieDe(fd) {
        const fixo = fd.get('e_fixo') === '1';
        const repetir = !fixo && fd.get('repetir') === '1';
        if (!repetir) return fixo ? { e_fixo: true } : {};
        const n = parseInt(fd.get('quantidade_repeticoes'), 10);
        if (!(n >= 2 && n <= 60)) return null;
        return { repetir: true, quantidade_repeticoes: n };
    }

    function montar(tipo, form) {
        const fd = new FormData(form);
        const R = window.AppRegras;
        if (tipo === 'criar') {
            const serie = serieDe(fd);
            const valor = R.parseMoeda(fd.get('valor'));
            const descricao = String(fd.get('descricao') || '').trim();
            const categoria = fd.get('subcategoria_id') || fd.get('categoria_id');
            const conta = fd.get('conta_id');
            if (!serie || !descricao || !(valor > 0) || !categoria || !conta) return { erro: 'invalido' };
            const pago = fd.get('foi_pago') === '1' || fd.get('foi_recebida') === '1' || fd.get('status') === 'pago';
            const dados = Object.assign({
                tipo: fd.get('tipo') === 'receita' ? 'receita' : 'despesa', conta_id: Number(conta), categoria_id: Number(categoria), descricao, valor,
                data_competencia: dataDe(form, 'data_competencia'), status: pago ? 'pago' : 'pendente'
            }, serie);
            if (pago) dados.data_pagamento = dataDe(form, 'data_pagamento');
            const obs = String(fd.get('observacoes') || '').trim();
            if (obs) dados.observacoes = obs;
            return { acao: 'create', dados, resumo: { titulo: descricao, valor: dados.tipo === 'despesa' ? -valor : valor, tipo: dados.tipo, serie: serie.e_fixo ? 'fixo' : (serie.repetir ? serie.quantidade_repeticoes : null) } };
        }
        if (tipo === 'pagar') {
            const id = Number((form.getAttribute('action').match(/\/lancamentos\/(\d+)\//) || [])[1]);
            const status = fd.get('status') === 'pendente' ? 'pendente' : 'pago';
            const linha = form.closest('.pendencias__item, tr, .lancamento, li, .card');
            const alvo = linha && linha.querySelector('.pendencias__desc, [data-descricao], .lancamento__descricao, td strong, td');
            const titulo = alvo ? alvo.textContent.trim().slice(0, 80) : '';
            const dados = { id, status };
            if (status === 'pago') dados.data_pagamento = R.hojeYMD();
            return { acao: 'pagar', dados, resumo: { titulo: titulo || ('#' + id), valor: null, tipo: status === 'pago' ? 'pagar' : 'desfazer' } };
        }
        if (tipo === 'transferir' || tipo === 'agendar') {
            const origem = ultimo(fd, 'origem_id'); const destino = ultimo(fd, 'destino_id'); const valor = R.parseMoeda(fd.get('valor'));
            if (!origem || !destino || origem === destino || !(valor > 0)) return { erro: 'invalido' };
            const descricao = String(fd.get('descricao') || '').trim();
            const dados = { conta_origem_id: Number(origem), conta_destino_id: Number(destino), valor, data: dataDe(form, 'data') };
            if (descricao) dados.descricao = descricao;
            if (tipo === 'agendar') {
                const serie = serieDe(fd);
                if (!serie) return { erro: 'invalido' };
                Object.assign(dados, serie);
            }
            return { acao: tipo === 'agendar' ? 'agendar_transferencia' : 'transferir', dados, resumo: { titulo: descricao || tr(tipo === 'agendar' ? 'tipo_agendar' : 'tipo_transferencia'), valor: -valor, tipo: tipo === 'agendar' ? 'agendar' : 'transferencia' } };
        }
        // categoria
        const nome = String(fd.get('nome') || '').trim();
        if (!nome) return { erro: 'invalido' };
        const dados = { nome, cor: String(fd.get('cor') || '#3b82f6') };
        const pai = fd.get('categoria_pai_id'); if (pai) dados.parent_id = /^\d+$/.test(String(pai)) ? Number(pai) : String(pai);
        const lim = R.parseMoeda(fd.get('limite_gasto')); if (lim > 0) dados.limite_gasto = lim;
        return { tabela: 'categorias', acao: 'create', dados, resumo: { titulo: nome, valor: null, tipo: 'categoria' } };
    }

    document.addEventListener('submit', async (e) => {
        const form = e.target;
        if (!form || !form.getAttribute) return;

        // Sair da conta com alteracoes ainda nao enviadas: avisa antes de apagar o aparelho.
        if (form.getAttribute('action') === '/logout') {
            if (form.dataset.gfSair === '1') return; // ja confirmado
            e.preventDefault();
            e.stopImmediatePropagation();
            let pendentes = 0;
            try { pendentes = (await window.AppDb.listarOutbox()).length; } catch (err) { pendentes = 0; }
            if (pendentes > 0 && !window.confirm(tr('confirmar_sair'))) return;
            form.dataset.gfSair = '1';
            form.requestSubmit(e.submitter || undefined);
            return;
        }

        const tipo = classificar(form);
        if (!tipo) return;
        if (form.dataset.gfOnline === '1') return; // segunda passada: ja confirmamos que ha servidor
        e.preventDefault();
        e.stopImmediatePropagation();
        if (form.dataset.gfBusy === '1') return;
        form.dataset.gfBusy = '1';
        const botao = e.submitter;
        try {
            if (await servidorAlcancavel()) {
                form.dataset.gfOnline = '1';
                form.requestSubmit(botao || undefined);
                setTimeout(() => { delete form.dataset.gfOnline; }, 0);
                return;
            }
            const m = montar(tipo, form);
            if (m.erro) { toast(tr('invalido'), 'erro'); return; }
            if (m.acao === 'pagar') {
                // Vale a ultima escolha: marcar e desmarcar o mesmo lancamento sem internet nao empilha operacoes.
                for (const antigo of await window.AppDb.listarOutbox()) {
                    if (antigo.acao === 'pagar' && antigo.status === 'pending' && antigo.dados.id === m.dados.id) await window.AppDb.descartarOutbox(antigo);
                }
            }
            await window.AppDb.adicionarOutbox({ tabela: m.tabela || 'lancamentos', acao: m.acao, dados: m.dados, resumo: m.resumo });
            const aberto = form.closest('.modal-backdrop'); if (aberto) aberto.classList.remove('is-open');
            if (tipo !== 'pagar') form.reset();
            if (tipo === 'pagar') { const linha = form.closest('tr, li, .card'); if (linha) linha.classList.add('gf-pendente-envio'); form.querySelectorAll('button').forEach((b) => { b.disabled = true; }); }
            toast(tr('salvo'), 'sucesso');
            atualizar();
        } catch (err) {
            console.warn('Falha ao guardar no aparelho:', err && err.message);
            toast(tr('falha_guardar'), 'erro');
        } finally {
            delete form.dataset.gfBusy;
        }
    }, true);

    // Abrir um formulario sem conexao: a data comeca em hoje.
    document.addEventListener('click', (e) => {
        const abrir = e.target.closest && e.target.closest('[data-modal-open]');
        if (!abrir || (window.GfConexao && window.GfConexao.online)) return;
        const modal = document.getElementById(abrir.getAttribute('data-modal-open'));
        if (modal) renovarDatas(modal);
    }, true);

    // ---------- Fila: contador e tela "Aguardando envio" ----------
    function formatarValor(v) {
        const n = Math.abs(Number(v));
        const simbolo = { PYG: 'Gs.', BRL: 'R$', USD: 'US$' }[cfg.moeda] || cfg.moeda || '';
        const casas = cfg.moeda === 'PYG' ? 0 : 2;
        const t = n.toLocaleString(cfg.lang || undefined, { minimumFractionDigits: casas, maximumFractionDigits: casas });
        return (v < 0 ? '- ' : '') + simbolo + ' ' + t;
    }

    function rotuloEstado(item) {
        if (item.status === 'rejected') return tr('erro_' + item.erro, tr('erro_generico'));
        if (item.status === 'conflict') return tr('conflito');
        if (item.status === 'syncing') return tr('enviando');
        return window.GfConexao && !window.GfConexao.online ? tr('aguardando_internet') : tr('aguardando_servidor');
    }

    function rotuloTipo(item) {
        const r = item.resumo || {};
        let t = tr('tipo_' + (r.tipo || 'generico'));
        if (r.serie === 'fixo') t += ' · ' + tr('serie_fixo');
        else if (r.serie) t += ' · ' + tr('serie_repetir').replace('{n}', r.serie);
        return t;
    }

    async function atualizar() {
        const btn = document.getElementById('pwa-fila-btn');
        if (!btn) return;
        let fila = [];
        try { fila = await window.AppDb.listarOutbox(); } catch (e) { return; }
        window.GF_FILA_N = fila.length;
        const problemas = fila.filter((i) => i.status === 'rejected' || i.status === 'conflict').length;
        document.getElementById('pwa-fila-n').textContent = String(fila.length);
        btn.hidden = fila.length === 0;
        btn.classList.toggle('tem-problema', problemas > 0);
        const modal = document.getElementById('modal-fila');
        if (modal && modal.classList.contains('is-open')) desenhar(fila);
    }

    async function desenhar(fila) {
        const lista = document.getElementById('fila-lista');
        if (!lista) return;
        lista.textContent = '';
        if (!fila.length) {
            const vazio = document.createElement('p'); vazio.className = 'muted'; vazio.textContent = tr('vazia'); lista.appendChild(vazio);
        }
        fila.forEach((item) => {
            const li = document.createElement('div'); li.className = 'fila-item' + (item.status === 'rejected' || item.status === 'conflict' ? ' fila-item--erro' : '');
            const info = document.createElement('div'); info.className = 'fila-item__info';
            const tit = document.createElement('strong'); tit.textContent = (item.resumo && item.resumo.titulo) || rotuloTipo(item);
            const sub = document.createElement('span'); sub.className = 'muted';
            sub.textContent = rotuloTipo(item) + (item.resumo && item.resumo.valor != null ? ' · ' + formatarValor(item.resumo.valor) : '') + ' · ' + rotuloEstado(item);
            info.appendChild(tit); info.appendChild(sub);
            li.appendChild(info);
            if (item.status !== 'syncing') {
                const b = document.createElement('button'); b.type = 'button'; b.className = 'btn btn-outline btn-sm'; b.textContent = tr('descartar');
                b.addEventListener('click', async () => {
                    if (!window.confirm(tr('confirmar_descartar'))) return;
                    await window.AppDb.descartarOutbox(item);
                    atualizar();
                });
                li.appendChild(b);
            }
            lista.appendChild(li);
        });
        // O que o servidor respondeu nos ultimos envios (para conferir se algo foi mesmo registrado).
        const hist = document.getElementById('fila-historico');
        if (hist) {
            hist.textContent = '';
            let envios = [];
            try { envios = (await window.AppDb.obterMeta('historico_envios')) || []; } catch (e) { envios = []; }
            if (envios.length) {
                const h = document.createElement('h3'); h.className = 'fila-historico__titulo'; h.textContent = tr('historico'); hist.appendChild(h);
                envios.slice(0, 8).forEach((x) => {
                    const l = document.createElement('div'); l.className = 'fila-historico__item' + (x.estado === 'ok' ? '' : ' fila-item--erro');
                    const hora = new Date(x.em).toLocaleString(cfg.lang || undefined, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
                    l.textContent = (x.estado === 'ok' ? '✓ ' : '✗ ') + x.titulo + (x.valor != null ? ' · ' + formatarValor(x.valor) : '') + ' · ' + hora + (x.estado === 'ok' ? (x.id_servidor ? ' · #' + x.id_servidor : '') : ' · ' + tr('erro_' + x.erro, tr('erro_generico')));
                    hist.appendChild(l);
                });
            }
        }
    }

    document.addEventListener('click', async (e) => {
        if (e.target.closest('#pwa-fila-btn')) {
            const modal = document.getElementById('modal-fila');
            if (modal) { modal.classList.add('is-open'); desenhar(await window.AppDb.listarOutbox()); }
        }
        if (e.target.closest('#fila-enviar')) {
            if (window.AppSync && window.AppSync.executarSincronizacao) { await window.AppSync.executarSincronizacao(); atualizar(); }
        }
    });

    // Depois que a fila foi enviada: avisa e atualiza a tela com os dados reais (sem mexer se o usuario esta digitando).
    window.addEventListener('gf-fila-mudou', (ev) => {
        atualizar();
        const n = ev.detail && ev.detail.enviadas;
        if (n > 0) {
            toast(tr('enviadas'), 'sucesso');
            const digitando = document.querySelector('.modal-backdrop.is-open') || (document.activeElement && /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName));
            if (!digitando) setTimeout(() => window.location.reload(), 900);
        }
    });
    window.addEventListener('online', atualizar);
    window.addEventListener('offline', atualizar);
    window.addEventListener('gf-conexao', atualizar);
    document.addEventListener('DOMContentLoaded', atualizar);
})();
