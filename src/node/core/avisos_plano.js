// Avisos de fim do teste gratis e de vencimento do plano pago, por notificacao no celular (push) e por e-mail.
// Antes so existia a faixa dentro do app: quem nao abria o sistema no ultimo dia nunca ficava sabendo.
//   Teste:  2 dias antes, no ultimo dia (com a hora em que termina) e depois de terminar (ate 3 dias).
//   Plano:  de 3 a 1 dia antes, no dia do vencimento e depois de vencer (ate 3 dias).
// Cada aviso sai uma vez so (AvisoPlano.reservar grava antes de enviar) e so entre 9h e 21h no fuso da pessoa.
// E-mail so para quem confirmou o e-mail; o push vai para os aparelhos inscritos nos lembretes.
// Roda no agendador dos lembretes (core/lembretes.js > processarDevidos), a cada 30 minutos.
const AvisoPlano = require('../models/AvisoPlano');
const { t } = require('./i18n');
const { NOME_APP } = require('./negocio');
const lembretes = require('./lembretes');
const push = require('./push');
const mailer = require('./mailer');
const { dadosPais } = require('./paises');
const { urlPublica } = require('./helpers');

const HORA_INICIO = 9;
const HORA_FIM = 21; // nao entra
const DIA_MIN = 24 * 60;

// Qual aviso cabe agora para esta assinatura (ou null). As janelas nao se sobrepoem.
function avisoDevido(r) {
    if (r.status === 'trial') {
        const min = Number(r.min_trial);
        if (!Number.isFinite(min)) return null;
        if (min > DIA_MIN && min <= 2 * DIA_MIN) return { tipo: 'teste_2d', ref: r.ref_trial };
        if (min > 0 && min <= DIA_MIN) return { tipo: 'teste_1d', ref: r.ref_trial };
        if (min <= 0 && min > -3 * DIA_MIN) return { tipo: 'teste_fim', ref: r.ref_trial };
        return null;
    }
    if (r.status === 'ativa') {
        const d = Number(r.dias_periodo);
        if (!Number.isFinite(d)) return null;
        if (d >= 1 && d <= 3) return { tipo: 'plano_3d', ref: r.ref_periodo, dias: d };
        if (d === 0) return { tipo: 'plano_hoje', ref: r.ref_periodo };
        if (d < 0 && d >= -3) return { tipo: 'plano_fim', ref: r.ref_periodo };
    }
    return null;
}

function fusoDe(r) {
    if (r.fuso && lembretes.fusoValido(r.fuso)) return r.fuso;
    return dadosPais(r.pais).fuso || lembretes.FUSO_PADRAO;
}

const doisDigitos = (n) => String(n).padStart(2, '0');

// "hoje as 14:30" / "amanha as 09:10" / "em 2 dias, as 08:00" no fuso da pessoa, a partir dos minutos que faltam
// para o fim do teste (contar dias por 24 h diria "2 dias" para um teste que acaba amanha a noite).
function quandoTermina(minRestantes, agoraMs, fuso, idioma) {
    const fimMs = agoraMs + Number(minRestantes) * 60000;
    const fim = lembretes.partesNoFuso(fimMs, fuso);
    const hoje = lembretes.partesNoFuso(agoraMs, fuso);
    const dias = Math.round((Date.UTC(fim.year, fim.month - 1, fim.day) - Date.UTC(hoje.year, hoje.month - 1, hoje.day)) / 86400000);
    const hora = `${doisDigitos(fim.hour)}:${doisDigitos(fim.minute)}`;
    if (dias <= 0) return t('avisoplano.quando_hoje', { hora }, idioma);
    if (dias === 1) return t('avisoplano.quando_amanha', { hora }, idioma);
    return t('avisoplano.quando_dias', { hora, dias }, idioma);
}

// Textos do aviso no idioma da conta: { titulo, texto, botao }.
function montarTextos(aviso, r, agoraMs) {
    const idioma = r.idioma;
    const params = {
        app: NOME_APP,
        dias: aviso.dias,
        plano: t('plano.' + r.plano_codigo + '.nome', {}, idioma)
    };
    if (aviso.tipo === 'teste_2d' || aviso.tipo === 'teste_1d') params.quando = quandoTermina(r.min_trial, agoraMs, fusoDe(r), idioma);
    const ehTeste = aviso.tipo.startsWith('teste_');
    return {
        titulo: t(`avisoplano.${aviso.tipo}.titulo`, params, idioma),
        texto: t(`avisoplano.${aviso.tipo}.texto`, params, idioma),
        botao: t(ehTeste ? 'avisoplano.botao_teste' : 'avisoplano.botao_renovar', {}, idioma)
    };
}

// Endereco publico do app para o link do e-mail (sem requisicao: o agendador roda sozinho).
const linkAssinatura = () => `${urlPublica()}/assinatura`;

async function enviarAviso(r, aviso, agoraMs) {
    const id = await AvisoPlano.reservar(r.user_id, aviso.tipo, aviso.ref);
    if (!id) return false; // ja enviado antes (ou outra instancia pegou)
    const txt = montarTextos(aviso, r, agoraMs);
    let entregues = 0;
    let emailOk = false;
    if (push.disponivel()) {
        try {
            entregues = await lembretes.enviarParaUsuario(r.user_id, { title: txt.titulo, body: txt.texto, url: '/assinatura', tag: 'aviso-plano' });
        } catch (err) {
            console.error('Falha no push do aviso de plano', r.user_id, err.message);
        }
    }
    if (r.email && r.email_verificado_em) {
        try {
            await mailer.sendPlanNotice(r.email, { titulo: txt.titulo, texto: txt.texto, botao: txt.botao, link: linkAssinatura() }, r.idioma);
            emailOk = true;
        } catch (err) {
            console.error('Falha no e-mail do aviso de plano', r.user_id, err.message);
        }
    }
    await AvisoPlano.registrarEnvio(id, { push: entregues, email: emailOk });
    return true;
}

async function processar(agoraMs = Date.now()) {
    const resumo = { candidatos: 0, enviados: 0, erros: 0 };
    const lista = await AvisoPlano.candidatos();
    resumo.candidatos = lista.length;
    for (const r of lista) {
        try {
            const aviso = avisoDevido(r);
            if (!aviso) continue;
            const hora = lembretes.partesNoFuso(agoraMs, fusoDe(r)).hour;
            if (hora < HORA_INICIO || hora >= HORA_FIM) continue;
            if (await enviarAviso(r, aviso, agoraMs)) resumo.enviados++;
        } catch (err) {
            resumo.erros++;
            console.error('Falha no aviso de plano do usuario', r.user_id, err.message);
        }
    }
    if (resumo.enviados || resumo.erros) console.log(`Avisos de plano: ${resumo.enviados} enviado(s), ${resumo.erros} erro(s).`);
    return resumo;
}

module.exports = { avisoDevido, montarTextos, quandoTermina, processar };
