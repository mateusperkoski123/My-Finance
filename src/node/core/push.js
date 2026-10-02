// Envio de Web Push (VAPID). Sem as chaves no .env o recurso fica desligado (disponivel() = false).
const webpush = require('web-push');

const PUBLICA = process.env.VAPID_PUBLIC_KEY || '';
const PRIVADA = process.env.VAPID_PRIVATE_KEY || '';
const ASSUNTO = process.env.VAPID_SUBJECT || 'mailto:' + (process.env.SUPPORT_EMAIL || 'suporte@localhost');

if (PUBLICA && PRIVADA) webpush.setVapidDetails(ASSUNTO, PUBLICA, PRIVADA);

function disponivel() {
    return !!(PUBLICA && PRIVADA);
}

// Retorna { ok } ou { ok:false, expirada:true } quando o aparelho nao existe mais (404/410) e a inscricao deve ser apagada.
async function enviar(inscricao, payload) {
    try {
        await webpush.sendNotification(
            { endpoint: inscricao.endpoint, keys: { p256dh: inscricao.chave_p256dh, auth: inscricao.chave_auth } },
            JSON.stringify(payload),
            { TTL: 12 * 3600, urgency: 'high' }
        );
        return { ok: true };
    } catch (err) {
        const expirada = err.statusCode === 404 || err.statusCode === 410;
        if (!expirada) console.error('Falha ao enviar push:', err.statusCode || '', err.body || err.message);
        return { ok: false, expirada };
    }
}

module.exports = { disponivel, enviar, chavePublica: PUBLICA };
