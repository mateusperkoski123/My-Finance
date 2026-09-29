const nodemailer = require('nodemailer');

async function sendResetPasswordEmail(email, magicLink) {
    const host = process.env.SMTP_HOST;
    const user = process.env.SMTP_USER;
    const pass = process.env.SMTP_PASS;
    const port = parseInt(process.env.SMTP_PORT || '587', 10);
    const from = process.env.SMTP_FROM || '"Gestão Financeira" <noreply@gestaofinanceira.com>';

    const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 540px; margin: 0 auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 16px; background-color: #ffffff;">
            <div style="text-align: center; margin-bottom: 24px;">
                <h2 style="color: #1e293b; margin-bottom: 8px;">🔑 Recuperação de Senha</h2>
                <p style="color: #64748b; font-size: 14px;">Recebemos uma solicitação para redefinir a senha da sua conta no <strong>Gestão Financeira</strong>.</p>
            </div>
            
            <div style="margin-bottom: 28px; text-align: center;">
                <a href="${magicLink}" target="_blank" style="background-color: #2563eb; color: #ffffff; padding: 14px 28px; font-weight: bold; text-decoration: none; border-radius: 12px; display: inline-block; font-size: 15px; box-shadow: 0 4px 12px rgba(37, 99, 235, 0.2);">
                    Redefinir Minha Senha (Magic Link)
                </a>
            </div>

            <p style="color: #64748b; font-size: 12px; line-height: 1.5; margin-bottom: 12px;">
                Este link é válido por <strong>1 hora</strong>. Se você não solicitou a redefinição de senha, ignore este e-mail.
            </p>

            <div style="border-top: 1px solid #f1f5f9; padding-top: 16px; margin-top: 24px; text-align: center;">
                <span style="font-size: 11px; color: #94a3b8;">Link direto: <a href="${magicLink}" style="color: #2563eb;">${magicLink}</a></span>
            </div>
        </div>
    `;

    if (host && user && pass) {
        const transporter = nodemailer.createTransport({
            host,
            port,
            secure: port === 465,
            auth: { user, pass }
        });

        await transporter.sendMail({
            from,
            to: email,
            subject: '🔑 Recuperação de Senha - Gestão Financeira',
            html: htmlContent
        });
        console.log(`[MAILER] E-mail de recuperação enviado via SMTP para: ${email}`);
    } else {
        console.log(`=======================================================`);
        console.log(`[MAILER DEV FALLBACK] Link de recuperação para ${email}:`);
        console.log(magicLink);
        console.log(`=======================================================`);
    }
}

module.exports = { sendResetPasswordEmail };
