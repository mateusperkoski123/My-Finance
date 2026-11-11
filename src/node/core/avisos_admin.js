// Avisos para os administradores quando um cliente novo cria a conta, comeca o teste gratis ou contrata um plano pelo
// Pagopar: notificacao nos aparelhos em que o admin ativou as notificacoes (Configuracoes > Lembretes) e e-mail.
// Nunca atrapalha o cliente: quem chama nao espera (sem await) e qualquer falha so vai para o log.
// Cada evento acontece uma vez so no codigo que chama (conta criada, teste iniciado, pedido marcado como pago).
// Liga/desliga cada canal em negocio.AVISOS_ADMIN.
const db = require('../config/db');
const { t } = require('./i18n');
const { AVISOS_ADMIN } = require('./negocio');
const push = require('./push');
const mailer = require('./mailer');
const { PAISES_CONTA } = require('./paises');
const { urlPublica } = require('./helpers');

const SIMBOLOS = { PYG: 'Gs.', USD: 'US$', BRL: 'R$', ARS: 'AR$', EUR: '€' };
const milhar = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.');
const curto = (idioma) => { const l = String(idioma || '').toLowerCase(); return l.startsWith('es') ? 'es' : l.startsWith('en') ? 'en' : 'pt'; };

async function administradores() {
    const [rows] = await db.query("SELECT id, email, idioma FROM users WHERE role = 'admin' AND status = 'ativo'");
    return rows;
}

async function cliente(userId) {
    const [rows] = await db.query('SELECT id, nome, email, pais, utm_source, utm_campaign FROM users WHERE id = ? LIMIT 1', [userId]);
    return rows[0] || null;
}

// Manda para cada admin, no idioma dele. montar(idioma) devolve { titulo, texto }.
async function enviar(montar, caminho, tag) {
    const admins = await administradores();
    const link = urlPublica() + caminho;
    let entregues = 0;
    for (const a of admins) {
        const { titulo, texto } = montar(a.idioma);
        if (AVISOS_ADMIN.push && push.disponivel()) {
            try {
                entregues += await require('./lembretes').enviarParaUsuario(a.id, { title: titulo, body: texto, url: caminho, tag });
            } catch (err) {
                console.error('Falha no push do aviso ao admin', a.id, err.message);
            }
        }
        if (AVISOS_ADMIN.email && a.email) {
            try {
                await mailer.sendAdminNotice(a.email, { titulo, texto, link }, a.idioma);
            } catch (err) {
                console.error('Falha no e-mail do aviso ao admin', a.id, err.code || '', err.message);
            }
        }
    }
    return { admins: admins.length, push: entregues };
}

// Roda sem lancar erro: quem chama pode ignorar a promessa.
function seguro(fn) {
    return fn().catch((err) => { console.error('Falha no aviso ao admin:', err.message); return null; });
}

const linkCliente = (c) => '/admin/usuarios?q=' + encodeURIComponent(c.email);

// via: 'email' (cadastro com senha) ou 'google'. Chamar depois de gravar a origem (utm) na conta.
function contaCriada(userId, via) {
    return seguro(async () => {
        const c = await cliente(userId);
        if (!c) return null;
        const origem = c.utm_source ? c.utm_source + (c.utm_campaign ? ' / ' + c.utm_campaign : '') : '';
        return enviar((idioma) => {
            const pais = PAISES_CONTA[c.pais] ? PAISES_CONTA[c.pais].nome[curto(idioma)] : c.pais;
            const partes = [c.email, t(via === 'google' ? 'avisoadmin.via_google' : 'avisoadmin.via_email', {}, idioma), pais];
            if (origem) partes.push(t('avisoadmin.origem', { origem }, idioma));
            return { titulo: t('avisoadmin.conta.titulo', { nome: c.nome }, idioma), texto: partes.filter(Boolean).join(' · ') };
        }, linkCliente(c), 'admin-conta-' + c.id);
    });
}

function testeIniciado(userId, planoCodigo, dias) {
    return seguro(async () => {
        const c = await cliente(userId);
        if (!c) return null;
        return enviar((idioma) => ({
            titulo: t('avisoadmin.teste.titulo', { nome: c.nome }, idioma),
            texto: t('avisoadmin.teste.texto', { plano: t('plano.' + planoCodigo + '.nome', {}, idioma), dias, email: c.email }, idioma)
        }), linkCliente(c), 'admin-teste-' + c.id);
    });
}

// pedido: linha de pagopar_pedidos ja confirmada como paga (user_id, plano_codigo, ciclo, valor em guaranis).
function planoContratado(pedido, moeda = 'PYG') {
    return seguro(async () => {
        const c = await cliente(pedido.user_id);
        if (!c) return null;
        const valor = `${SIMBOLOS[moeda] || moeda} ${milhar(pedido.valor)}`;
        return enviar((idioma) => ({
            titulo: t('avisoadmin.pago.titulo', { nome: c.nome }, idioma),
            texto: t('avisoadmin.pago.texto', {
                plano: t('plano.' + pedido.plano_codigo + '.nome', {}, idioma),
                ciclo: t('assinatura.ciclo_' + pedido.ciclo, {}, idioma),
                valor, email: c.email
            }, idioma)
        }), linkCliente(c), 'admin-pago-' + c.id);
    });
}

module.exports = { contaCriada, testeIniciado, planoContratado };
