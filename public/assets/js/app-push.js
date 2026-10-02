// Notificacoes push deste aparelho (lembretes de vencimento). Usado em Configuracoes > Lembretes.
(function () {
    'use strict';

    function suportado() {
        return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
    }

    function chaveParaBytes(base64) {
        var preenchida = (base64 + '='.repeat((4 - (base64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
        var bruto = atob(preenchida);
        var bytes = new Uint8Array(bruto.length);
        for (var i = 0; i < bruto.length; i++) bytes[i] = bruto.charCodeAt(i);
        return bytes;
    }

    function enviar(url, corpo, csrf) {
        return fetch(url, {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json', 'x-csrf-token': csrf },
            body: JSON.stringify(corpo || {})
        }).then(function (r) { return r.json().catch(function () { return { sucesso: false }; }); });
    }

    function inscricaoAtual() {
        return navigator.serviceWorker.ready.then(function (reg) { return reg.pushManager.getSubscription(); });
    }

    // 'nao_suportado' | 'bloqueado' | 'ativo' | 'inativo'
    function estado() {
        if (!suportado()) return Promise.resolve('nao_suportado');
        if (Notification.permission === 'denied') return Promise.resolve('bloqueado');
        if (Notification.permission !== 'granted') return Promise.resolve('inativo');
        return inscricaoAtual().then(function (s) { return s ? 'ativo' : 'inativo'; }).catch(function () { return 'inativo'; });
    }

    // Pede permissao, cria a inscricao no navegador e a registra no servidor. Retorna o novo estado.
    function ativar(chavePublica, csrf) {
        if (!suportado()) return Promise.resolve('nao_suportado');
        return Notification.requestPermission().then(function (perm) {
            if (perm !== 'granted') return perm === 'denied' ? 'bloqueado' : 'inativo';
            return navigator.serviceWorker.ready.then(function (reg) {
                return reg.pushManager.getSubscription().then(function (existente) {
                    return existente || reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: chaveParaBytes(chavePublica) });
                });
            }).then(function (sub) {
                return enviar('/configuracoes/lembretes/inscrever', { subscription: sub.toJSON() }, csrf).then(function (r) {
                    return r.sucesso ? 'ativo' : 'inativo';
                });
            });
        });
    }

    function desativar(csrf) {
        return inscricaoAtual().then(function (sub) {
            if (!sub) return 'inativo';
            var endpoint = sub.endpoint;
            return sub.unsubscribe().then(function () {
                return enviar('/configuracoes/lembretes/desinscrever', { endpoint: endpoint }, csrf);
            }).then(function () { return 'inativo'; });
        });
    }

    // Mantem o servidor com a inscricao mais recente (o navegador pode renova-la sem avisar).
    function sincronizar(csrf) {
        return inscricaoAtual().then(function (sub) {
            if (sub && Notification.permission === 'granted') return enviar('/configuracoes/lembretes/inscrever', { subscription: sub.toJSON() }, csrf);
        }).catch(function () {});
    }

    function testar(csrf) {
        return enviar('/configuracoes/lembretes/testar', {}, csrf);
    }

    window.GfPush = { suportado: suportado, estado: estado, ativar: ativar, desativar: desativar, sincronizar: sincronizar, testar: testar };
})();
