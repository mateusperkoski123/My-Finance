// Origem do cadastro: etiquetas utm_* do link de divulgacao (ex.: ?utm_source=whatsapp&utm_campaign=grupo-x).
// A primeira visita com etiqueta fica guardada na sessao e vai para a conta quando ela e criada (e-mail ou Google).
// A landing repassa as etiquetas do seu endereco para os links de cadastro. O funil do admin agrupa por elas.
const db = require('../config/db');

const limpar = (v, max) => String(v || '').toLowerCase().trim().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, max) || null;

function capturar(req, res, next) {
    if (req.method === 'GET' && req.session && !req.session.utm && req.query && typeof req.query.utm_source === 'string') {
        const source = limpar(req.query.utm_source, 60);
        if (source) req.session.utm = { source, medium: limpar(req.query.utm_medium, 60), campaign: limpar(req.query.utm_campaign, 80) };
    }
    next();
}

// So grava em conta recem-criada e que ainda nao tem origem (o login com Google tambem passa aqui para contas antigas).
async function gravarNaConta(userId, req) {
    const u = req.session && req.session.utm;
    if (!userId || !u || !u.source) return;
    try {
        await db.query(
            `UPDATE users SET utm_source = ?, utm_medium = ?, utm_campaign = ?
             WHERE id = ? AND utm_source IS NULL AND created_at > NOW() - INTERVAL 1 HOUR`,
            [u.source, u.medium, u.campaign, userId]
        );
    } catch (e) {
        console.error('[origem] nao foi possivel gravar a origem do cadastro:', e.message);
    }
}

module.exports = { capturar, gravarNaConta };
