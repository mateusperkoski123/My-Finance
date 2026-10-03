const nodemailer = require('nodemailer');
const { t } = require('./i18n');
const { NOME_APP } = require('./negocio');

function escapar(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Envia por SMTP quando configurado; senao registra o conteudo no log (desenvolvimento).
async function enviar({ to, subject, html, textoLog }) {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const from = process.env.SMTP_FROM || `"${NOME_APP}" <noreply@gestaofinanceira.com>`;

    if (host && user && pass) {
        // Prazos curtos: se a hospedagem bloquear a saida SMTP ou o servidor de e-mail nao responder, falha em segundos
        // (o padrao do nodemailer espera 30 s a 2 min) e o motivo vai para o log.
        const transporter = nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass },
            connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000 });
        await transporter.sendMail({ from, to, subject, html });
        console.log(`[MAILER] "${subject}" enviado via SMTP para: ${to}`);
    } else {
        console.log('=======================================================');
        console.log(`[MAILER DEV FALLBACK] Para: ${to} | Assunto: ${subject}`);
        console.log(textoLog || '');
        console.log('=======================================================');
    }
}

// Layout simples e igual para todos os e-mails transacionais.
function modelo({ titulo, texto, botao, link, aviso, lang }) {
    return `
        <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 24px;">
                <h2 style="color: #1e293b; margin-bottom: 8px;">${escapar(titulo)}</h2>
                <p style="color: #64748b; font-size: 14px;">${escapar(texto)}</p>
            </div>
            <div style="margin-bottom: 28px; text-align: center;">
                <a href="${escapar(link)}" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 14px 28px; font-weight: bold; text-decoration: none; border-radius: 12px; display: inline-block; font-size: 15px;">${escapar(botao)}</a>
            </div>
            <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin-bottom: 12px;">${escapar(aviso)}</p>
            <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 24px; text-align: center;">
                <span style="font-size: 11px; color: #94a3b8;">${escapar(t('email.link_direto', {}, lang))}: <a href="${escapar(link)}" style="color: #2563eb;">${escapar(link)}</a></span>
            </div>
        </div>`;
}

async function sendResetPasswordEmail(email, magicLink, lang = 'pt-BR') {
    const subject = t('email.reset_assunto', { app: NOME_APP }, lang);
    await enviar({
        to: email, subject, textoLog: `Link de recuperacao: ${magicLink}`,
        html: modelo({ titulo: t('email.reset_titulo', {}, lang), texto: t('email.reset_texto', { app: NOME_APP }, lang),
            botao: t('email.reset_botao', {}, lang), link: magicLink, aviso: t('email.reset_aviso', {}, lang), lang })
    });
}

async function sendVerificationEmail(email, link, lang = 'pt-BR') {
    const subject = t('email.verif_assunto', { app: NOME_APP }, lang);
    await enviar({
        to: email, subject, textoLog: `Link de verificacao: ${link}`,
        html: modelo({ titulo: t('email.verif_titulo', {}, lang), texto: t('email.verif_texto', { app: NOME_APP }, lang),
            botao: t('email.verif_botao', {}, lang), link, aviso: t('email.verif_aviso', {}, lang), lang })
    });
}

// Aviso para o(s) administrador(es) quando alguem pede um plano pago.
async function sendPlanRequestNotice({ usuario, plano, ciclo, telefone = '', link }) {
    const admins = (process.env.ADMIN_EMAILS || '').split(',').map((e) => e.trim()).filter(Boolean);
    if (!admins.length) return;
    const lang = 'es-PY';
    await enviar({
        to: admins.join(','), subject: t('email.pedido_assunto', { app: NOME_APP }, lang),
        textoLog: `${usuario.nome} <${usuario.email}> pediu ${plano} (${ciclo}) - tel ${telefone}`,
        html: modelo({ titulo: t('email.pedido_titulo', {}, lang),
            texto: t('email.pedido_texto', { nome: usuario.nome, email: usuario.email, plano, ciclo, telefone }, lang),
            botao: t('email.pedido_botao', {}, lang), link: link.replace(/\/admin$/, '/admin/pedidos'), aviso: '', lang })
    });
}

module.exports = { sendResetPasswordEmail, sendVerificationEmail, sendPlanRequestNotice };
