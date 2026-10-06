// "Financeiro": notificacoes de cobranca por inatividade (estilo Duolingo). Quando a pessoa fica dias sem registrar
// movimentos, manda um push por noite, e o tom muda conforme os dias passam. Ligado por padrao; a pessoa pode
// pausar por 7 dias ou desativar (botoes da notificacao, tela /financeiro e Configuracoes > Lembretes).
const crypto = require('crypto');
const Financeiro = require('../models/Financeiro');
const Assinatura = require('../models/Assinatura');
const Lembrete = require('../models/Lembrete');
const lembretes = require('./lembretes');
const { t } = require('./i18n');

const HORA = /^([01]\d|2[0-3]):(00|30)$/.test(process.env.FINANCEIRO_HORA || '') ? process.env.FINANCEIRO_HORA : '20:00';
const PAUSA_DIAS = 7;
const MENSAGENS_POR_TOM = 5;
const MAX_ATRASO_MS = 2 * 3600 * 1000; // se o servidor ficou fora do ar, nao manda o aviso de madrugada
const VALIDADE_TOKEN_MS = 3 * 24 * 3600 * 1000;
const LOTE = 10;
const MAX_DIAS_COBRANDO = 30;

const TONS = ['brincalhao', 'cobrando', 'dramatico', 'saudade'];

// Liberacao: vale para todos (aparelhos novos entram ligados). Para voltar a fase de teste (so admins veem a opcao,
// ligam e recebem) basta FINANCEIRO_LIBERADO=admins no .env.
function liberadoParaTodos() {
    return String(process.env.FINANCEIRO_LIBERADO || '').toLowerCase() !== 'admins';
}

function liberadoPara(user) {
    return !!user && (liberadoParaTodos() || user.role === 'admin');
}

// Dias entre duas datas locais (YYYY-MM-DD).
function diferencaDias(deYMD, ateYMD) {
    const ms = (ymd) => { const [a, m, d] = ymd.split('-').map(Number); return Date.UTC(a, m - 1, d); };
    return Math.round((ms(ateYMD) - ms(deYMD)) / 86400000);
}

// 1 dia: brincalhao; 2: cobrando; 3-4: dramatico; 5 ou mais: saudade. Hoje ja registrou (0): nada.
function tomPara(dias) {
    if (dias < 1) return null;
    if (dias === 1) return 'brincalhao';
    if (dias === 2) return 'cobrando';
    if (dias <= 4) return 'dramatico';
    return 'saudade';
}

// Ate o 4o dia manda todo dia; depois so nos dias 5, 7, 14, 21 e 28 (nao enche); passado um mes, para.
function deveEnviar(dias) {
    if (dias < 1 || dias > MAX_DIAS_COBRANDO) return false;
    if (dias <= 4) return true;
    return dias === 5 || dias % 7 === 0;
}

function sortearMensagem(ultima) {
    let i;
    do { i = 1 + Math.floor(Math.random() * MENSAGENS_POR_TOM); } while (i === ultima && MENSAGENS_POR_TOM > 1);
    return i;
}

function texto(tom, indice, dias, idioma) {
    return t(`financeiro.msg.${tom}.${indice}`, { n: dias }, idioma);
}

// ---- Token das acoes da notificacao (o service worker nao tem sessao nem CSRF) ----
function segredo() {
    return `${process.env.SESSION_SECRET || 'chave-apenas-para-desenvolvimento'}:financeiro`;
}

function assinar(corpo) {
    return crypto.createHmac('sha256', segredo()).update(corpo).digest('base64url');
}

function gerarToken(userId, agoraMs = Date.now()) {
    const corpo = `${userId}.${agoraMs + VALIDADE_TOKEN_MS}`;
    return `${corpo}.${assinar(corpo)}`;
}

// Retorna o id do usuario ou null (formato errado, assinatura falsa ou vencido).
function validarToken(token, agoraMs = Date.now()) {
    const partes = String(token || '').split('.');
    if (partes.length !== 3) return null;
    const corpo = `${partes[0]}.${partes[1]}`;
    const esperado = Buffer.from(assinar(corpo));
    const recebido = Buffer.from(partes[2]);
    if (esperado.length !== recebido.length || !crypto.timingSafeEqual(esperado, recebido)) return null;
    const userId = parseInt(partes[0], 10);
    if (!userId || !(Number(partes[1]) > agoraMs)) return null;
    return userId;
}

function montarNotificacao({ userId, tom, indice, dias, idioma }) {
    return {
        title: t('financeiro.nome', {}, idioma),
        body: texto(tom, indice, dias, idioma),
        url: `/financeiro?tom=${tom}&m=${indice}&n=${dias}`,
        tag: 'financeiro',
        vibrate: [120, 60, 120],
        actions: [
            { action: 'pausar', title: t('financeiro.acao_pausar', {}, idioma) },
            { action: 'desativar', title: t('financeiro.acao_desativar', {}, idioma) }
        ],
        token: gerarToken(userId)
    };
}

async function podeReceber(cfg) {
    if (cfg.role === 'admin') return true;
    const ass = await Assinatura.garantir(cfg.user_id, 'pendente');
    return !(ass.bloqueada || ass.somente_leitura);
}

// Avalia uma pessoa cujo horario chegou. Retorna true se enviou a notificacao.
async function avaliar(cfg, agoraMs) {
    const fuso = cfg.fuso_efetivo && lembretes.fusoValido(cfg.fuso_efetivo) ? cfg.fuso_efetivo : lembretes.FUSO_PADRAO;
    const novo = lembretes.proximoEnvio(HORA, fuso, agoraMs);
    const anterior = cfg.proximo_envio === null || cfg.proximo_envio === undefined ? null : Number(cfg.proximo_envio);
    if (!(await Financeiro.reservar(cfg.user_id, anterior, novo))) return false;
    // Primeira vez (sem horario) ou horario perdido: so agenda o proximo.
    if (anterior === null || agoraMs - anterior > MAX_ATRASO_MS) return false;
    if (cfg.pausado_ate && Number(cfg.pausado_ate) > agoraMs) return false;

    const ultimoMs = Number(cfg.ultimo_ts || cfg.cadastro_ts) * 1000;
    const dias = diferencaDias(lembretes.dataLocalYMD(ultimoMs, fuso), lembretes.dataLocalYMD(agoraMs, fuso));
    const tom = tomPara(dias);
    if (!tom || !deveEnviar(dias)) return false;
    if (!(await podeReceber(cfg))) return false;

    const indice = sortearMensagem(cfg.ultima_msg);
    const entregues = await lembretes.enviarParaUsuario(cfg.user_id, montarNotificacao({ userId: cfg.user_id, tom, indice, dias, idioma: cfg.idioma }));
    if (entregues > 0) await Financeiro.marcarEnvio(cfg.user_id, indice);
    return entregues > 0;
}

// Teste do admin: faz agora a mesma checagem das 20h com os dados reais da pessoa (sem mexer no horario agendado) e
// diz o resultado: { motivo, dias, tom }. motivo = enviado | falha | sem_config | desativado | pausado | sem_aparelho
// | registrou_hoje | fora_do_dia | plano.
async function verificarAgora(userId, agoraMs = Date.now()) {
    const cfg = await Financeiro.paraUsuario(userId);
    if (!cfg) return { motivo: 'sem_config' };
    if (!cfg.ativo) return { motivo: 'desativado' };
    if (cfg.pausado_ate && Number(cfg.pausado_ate) > agoraMs) return { motivo: 'pausado' };
    if (!(await Lembrete.inscricoes(userId)).length) return { motivo: 'sem_aparelho' };

    const fuso = cfg.fuso_efetivo && lembretes.fusoValido(cfg.fuso_efetivo) ? cfg.fuso_efetivo : lembretes.FUSO_PADRAO;
    const ultimoMs = Number(cfg.ultimo_ts || cfg.cadastro_ts) * 1000;
    const dias = diferencaDias(lembretes.dataLocalYMD(ultimoMs, fuso), lembretes.dataLocalYMD(agoraMs, fuso));
    const tom = tomPara(dias);
    if (!tom) return { motivo: 'registrou_hoje', dias };
    if (!deveEnviar(dias)) return { motivo: 'fora_do_dia', dias };
    if (!(await podeReceber(cfg))) return { motivo: 'plano', dias };

    const indice = sortearMensagem(cfg.ultima_msg);
    const entregues = await lembretes.enviarParaUsuario(userId, montarNotificacao({ userId, tom, indice, dias, idioma: cfg.idioma }));
    return { motivo: entregues > 0 ? 'enviado' : 'falha', dias, tom };
}

// Chamado junto dos lembretes de vencimento (agendador interno e /cron/lembretes).
async function processarDevidos(agoraMs = Date.now()) {
    const resumo = { devidos: 0, avisos: 0, erros: 0 };
    const lista = await Financeiro.devidos(agoraMs, liberadoParaTodos());
    resumo.devidos = lista.length;
    for (let i = 0; i < lista.length; i += LOTE) {
        await Promise.all(lista.slice(i, i + LOTE).map(async (cfg) => {
            try {
                if (await avaliar(cfg, agoraMs)) resumo.avisos++;
            } catch (err) {
                resumo.erros++;
                console.error('Falha no Financeiro do usuario', cfg.user_id, err.message);
            }
        }));
    }
    return resumo;
}

async function pausar(userId, agoraMs = Date.now()) {
    await Financeiro.pausarAte(userId, agoraMs + PAUSA_DIAS * 86400000);
}

module.exports = {
    TONS, MENSAGENS_POR_TOM, PAUSA_DIAS, liberadoParaTodos, liberadoPara,
    diferencaDias, tomPara, deveEnviar, texto, gerarToken, validarToken, montarNotificacao,
    processarDevidos, verificarAgora, pausar
};
