// Sincronizacao do app (PWA / Capacitor): envia a fila de operacoes feitas offline (push) e baixa o que mudou no servidor (pull).
// O token do aparelho fica no IndexedDB (nunca em localStorage) e e apagado ao sair da conta.
(function (exports) {
    let emAndamento = false;
    const LOTE_PUSH = 100;

    function dbDisponivel() { return typeof window !== 'undefined' && window.AppDb && window.indexedDB; }

    function atualizarIndicador(texto) {
        const el = document.getElementById('pwa-sync-status');
        if (el) el.textContent = texto;
    }

    function csrf() {
        const m = document.querySelector('meta[name="csrf-token"]');
        return m ? m.getAttribute('content') : '';
    }

    // Garante o token deste aparelho para o usuario logado no site (e apaga dados locais de outro usuario).
    async function garantirToken() {
        const usuario = window.GF_USER_ID;
        if (!usuario) return null;
        const donoLocal = await window.AppDb.obterMeta('user_id');
        if (donoLocal && Number(donoLocal) !== Number(usuario)) {
            // Outro usuario neste aparelho: os dados do anterior saem (mas isso so acontece depois do logout, que avisa sobre pendencias).
            await window.AppDb.limparTudo();
        }
        const existente = await window.AppDb.obterMeta('app_token');
        if (existente) return existente;
        const r = await fetch('/app/dispositivo', {
            method: 'POST', credentials: 'same-origin',
            headers: { 'X-CSRF-Token': csrf(), 'X-Requested-With': 'XMLHttpRequest', Accept: 'application/json' }
        });
        if (!r.ok) return null;
        const j = await r.json();
        if (!j || !j.sucesso || !j.token) return null;
        await window.AppDb.salvarMeta('app_token', j.token);
        await window.AppDb.salvarMeta('user_id', j.user_id);
        return j.token;
    }

    // Envia a fila em ordem. Para na primeira falha de rede (preserva a ordem); recusas de validacao nao travam as demais.
    async function enviarFila(token) {
        let enviadas = 0;
        const avisar = () => { try { window.dispatchEvent(new CustomEvent('gf-fila-mudou', { detail: { enviadas } })); } catch (e) { /* sem DOM */ } };
        const headers = { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token };
        for (;;) {
            const pendentes = (await window.AppDb.buscarOutboxPendentes()).slice(0, LOTE_PUSH);
            if (!pendentes.length) { avisar(); return true; }
            atualizarIndicador('Sync: ' + pendentes.length);
            for (const item of pendentes) {
                await window.AppDb.atualizarOutboxItem(item.id, { status: 'syncing', tentativas: (item.tentativas || 0) + 1 });
            }
            const voltarParaPendente = async (erro) => {
                for (const item of pendentes) await window.AppDb.atualizarOutboxItem(item.id, { status: 'pending', erro: erro || null });
            };

            let resp;
            try {
                resp = await fetch('/api/app/sync/push', {
                    method: 'POST', headers,
                    body: JSON.stringify({
                        operacoes: pendentes.map((o) => ({ op_id: o.client_id, tabela: o.tabela, acao: o.acao, dados: o.dados, base_updated_at: o.base_updated_at }))
                    })
                });
            } catch (e) {
                await voltarParaPendente();
                avisar();
                return false; // sem rede: tenta depois
            }
            if (resp.status === 401) {
                await voltarParaPendente();
                throw Object.assign(new Error('token'), { codigo: 401 });
            }
            if (resp.status === 403) {
                let motivo = null;
                try { motivo = (await resp.json()).erro; } catch (e) { motivo = null; }
                if (motivo === 'plano_sem_offline') {
                    for (const item of pendentes) await window.AppDb.atualizarOutboxItem(item.id, { status: 'rejected', erro: 'plano_sem_offline' });
                    avisar();
                    return false;
                }
            }
            if (!resp.ok) {
                await voltarParaPendente('HTTP ' + resp.status); // 429/5xx/413: respeita o limite do servidor e para aqui
                return false;
            }
            const dados = await resp.json();
            const porId = new Map((dados.resultados || []).map((r) => [r.op_id, r]));
            let andou = false;
            for (const item of pendentes) {
                const r = porId.get(item.client_id);
                if (!r) { await window.AppDb.atualizarOutboxItem(item.id, { status: 'pending' }); continue; }
                const titulo = (item.resumo && item.resumo.titulo) || item.acao;
                if (r.estado === 'ok') {
                    await window.AppDb.registrarHistorico({ titulo, estado: 'ok', id_servidor: r.id_servidor || null, valor: item.resumo ? item.resumo.valor : null }).catch(() => {});
                    await window.AppDb.concluirOutbox(item);
                    andou = true;
                    enviadas++;
                } else if (r.estado === 'conflito') {
                    await window.AppDb.atualizarOutboxItem(item.id, { status: 'conflict', erro: 'conflito', servidor: r.servidor || null });
                    andou = true;
                } else if (r.estado === 'rejeitada') {
                    await window.AppDb.registrarHistorico({ titulo, estado: 'rejeitada', erro: r.erro || null }).catch(() => {});
                    await window.AppDb.atualizarOutboxItem(item.id, { status: 'rejected', erro: r.erro || 'rejeitada' });
                    andou = true;
                } else {
                    await window.AppDb.atualizarOutboxItem(item.id, { status: 'pending', erro: r.erro || null }); // ocupada / erro temporario
                }
            }
            if (!andou) { avisar(); return false; } // nada avancou: evita laco infinito
            if (pendentes.length < LOTE_PUSH) { avisar(); return true; }
        }
    }

    // Baixa o que mudou, pagina por pagina, ate o servidor dizer que nao ha mais.
    async function baixarMudancas(token) {
        for (let pagina = 0; pagina < 200; pagina++) {
            const cursor = await window.AppDb.obterMeta('sync_cursor');
            const url = '/api/app/sync' + (cursor ? '?since=' + encodeURIComponent(cursor) : '');
            const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token } });
            if (r.status === 401) throw Object.assign(new Error('token'), { codigo: 401 });
            if (!r.ok) throw new Error('HTTP ' + r.status);
            const d = await r.json();
            if (!d || !d.sucesso) throw new Error('resposta_invalida');
            await window.AppDb.salvarItens('contas', d.contas || []);
            await window.AppDb.salvarItens('categorias', d.categorias || []);
            await window.AppDb.salvarItens('lancamentos', d.lancamentos || []);
            if (d.exclusoes && d.exclusoes.length) await window.AppDb.removerExcluidos(d.exclusoes);
            // O cursor so avanca depois de gravar tudo localmente.
            await window.AppDb.salvarMeta('sync_cursor', d.cursor);
            if (d.dados_referencia) await window.AppDb.salvarMeta('dados_referencia', d.dados_referencia);
            if (!d.mais) return;
        }
    }

    async function executarSincronizacao() {
        if (!dbDisponivel() || !navigator.onLine || emAndamento) return;
        emAndamento = true;
        try {
            const token = await garantirToken();
            if (!token) return;
            await enviarFila(token);
            await baixarMudancas(token);
            const hora = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
            await window.AppDb.salvarMeta('ultima_sincronizacao_em', hora);
            await window.AppDb.salvarMeta('ultima_sincronizacao_ms', Date.now());
            try { window.dispatchEvent(new CustomEvent('gf-fila-mudou', { detail: { sincronizou: true } })); } catch (e) { /* sem DOM */ }
            const problemas = await window.AppDb.buscarOutboxComProblema();
            atualizarIndicador(problemas.length ? '!' + problemas.length : hora);
        } catch (err) {
            if (err && err.codigo === 401) {
                // Token revogado ou expirado: NUNCA apaga as alteracoes que ainda nao foram enviadas.
                // Descarta so o token; na proxima rodada o site (sessao ativa) emite um novo.
                await window.AppDb.salvarMeta('app_token', null);
            } else {
                console.warn('Falha na sincronizacao:', err && err.message);
            }
        } finally {
            emAndamento = false;
        }
    }

    // Ao sair da conta: revoga o token deste aparelho e apaga tudo que ficou guardado.
    async function encerrarSessaoLocal() {
        if (!dbDisponivel()) return;
        try {
            const token = await window.AppDb.obterMeta('app_token');
            if (token) {
                fetch('/api/app/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token }, keepalive: true }).catch(() => {});
            }
            await window.AppDb.limparTudo();
        } catch (e) { /* melhor esforco */ }
    }

    // Ao abrir uma pagina: so sincroniza se houver algo na fila para enviar ou se a ultima sincronizacao ja tem mais de
    // INTERVALO_MIN_MS. Navegar entre as telas nao precisa baixar tudo de novo a cada clique (e nao estoura o limite do servidor).
    const INTERVALO_MIN_MS = 30 * 1000;
    async function sincronizarAoAbrir() {
        if (!dbDisponivel()) return;
        try {
            const pendentes = await window.AppDb.buscarOutboxPendentes();
            const ultima = Number(await window.AppDb.obterMeta('ultima_sincronizacao_ms')) || 0;
            const decorrido = Date.now() - ultima;
            if (!pendentes.length && decorrido >= 0 && decorrido < INTERVALO_MIN_MS) return;
        } catch (e) { /* na duvida, sincroniza */ }
        await executarSincronizacao();
    }

    function iniciar() {
        window.addEventListener('online', executarSincronizacao);
        document.addEventListener('DOMContentLoaded', () => {
            sincronizarAoAbrir();
            setInterval(() => { if (document.visibilityState === 'visible') executarSincronizacao(); }, 5 * 60 * 1000);
        });
    }

    exports.executarSincronizacao = executarSincronizacao;
    exports.encerrarSessaoLocal = encerrarSessaoLocal;
    exports.iniciar = iniciar;

    if (typeof window !== 'undefined') iniciar();
})(typeof exports !== 'undefined' ? exports : (window.AppSync = {}));
