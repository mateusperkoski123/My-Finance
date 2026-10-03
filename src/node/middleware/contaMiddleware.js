// Regras de conta aplicadas a toda requisicao de usuario logado:
//  1) conta suspensa -> encerra a sessao;
//  2) termos de uso pendentes -> obriga aceitar;
//  3) teste ainda sem plano escolhido, ou teste ja usado sem contratar -> so as telas de escolher/contratar um plano;
//  4) assinatura paga vencida/cancelada -> modo somente leitura (consulta e exportacao continuam).
const Assinatura = require('../models/Assinatura');
const negocio = require('../core/negocio');
const db = require('../config/db');

const ROTAS_TERMOS = ['/termos', '/privacidade', '/aceitar-termos', '/logout'];

function comecaCom(caminho, bases) {
    return bases.some((b) => caminho === b || caminho.startsWith(b + '/'));
}

// Chamadas feitas pelo JavaScript do app (sincronizacao, IA, fotos) recebem a resposta em JSON, nunca um redirecionamento.
const querJson = (req) => Boolean(req.xhr || (req.headers.accept && req.headers.accept.includes('application/json'))
    || req.path.startsWith('/api/') || req.path.startsWith('/app/'));

async function contaMiddleware(req, res, next) {
    res.locals.assinatura = null;
    res.locals.ehAdmin = false;
    res.locals.emailNaoVerificado = false;
    res.locals.acessoBloqueado = false;
    res.locals.negocio = negocio;
    res.locals.pode = () => false;
    const user = req.user;
    if (!user) return next();

    if (user.status && user.status !== 'ativo') {
        delete req.session.user_id;
        req.session.flash = { tipo: 'erro', mensagem: req.t('flash.conta_suspensa') };
        return res.redirect('/login');
    }

    const ehAdmin = user.role === 'admin';
    req.ehAdmin = ehAdmin;
    res.locals.ehAdmin = ehAdmin;

    // Termos de uso (versao atual) precisam estar aceitos.
    if (user.termos_versao !== negocio.TERMOS_VERSAO && !comecaCom(req.path, ROTAS_TERMOS)) {
        return res.redirect('/aceitar-termos');
    }

    const ass = await Assinatura.garantir(user.id, ehAdmin ? 'beta' : 'pendente');
    req.assinatura = ass;
    res.locals.assinatura = ass;
    res.locals.emailNaoVerificado = !user.email_verificado_em;
    // O plano atual inclui o recurso? (ex.: pode('rec_estado')). Admin sempre pode.
    req.pode = (recurso) => Boolean(ehAdmin || (ass.plano && ass.plano[recurso]));
    res.locals.pode = req.pode;

    // Sem teste em andamento e sem plano contratado: a conta so abre as telas de escolher/contratar um plano.
    const bloqueado = ass.bloqueada && !ehAdmin;
    res.locals.acessoBloqueado = bloqueado;
    if (bloqueado && !comecaCom(req.path, negocio.ROTAS_LIVRES_BLOQUEIO)) {
        const escolher = ass.status_efetivo === 'escolher';
        const destino = escolher ? '/teste' : '/assinatura';
        const chave = escolher ? 'flash.escolha_plano' : 'flash.teste_encerrado';
        if (querJson(req)) return res.status(403).json({ sucesso: false, erro: req.t(chave), codigo: escolher ? 'escolher_plano' : 'teste_encerrado' });
        // Entrar no sistema (GET) cai direto na tela certa, que ja explica a situacao; o aviso so vai junto de uma acao barrada.
        if (req.method !== 'GET' && req.method !== 'HEAD') req.session.flash = { tipo: 'erro', mensagem: req.t(chave) };
        return res.redirect(destino);
    }

    if (ass.somente_leitura && !ehAdmin && req.method !== 'GET' && req.method !== 'HEAD') {
        const livre = comecaCom(req.path, negocio.ROTAS_LIVRES_SOMENTE_LEITURA)
            && !negocio.ROTAS_BLOQUEADAS_SOMENTE_LEITURA.includes(req.path);
        if (!livre) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.somente_leitura') };
            return res.redirect('/assinatura');
        }
    }
    next();
}

// Barra a rota quando o plano atual nao inclui o recurso (ex.: 'rec_backup').
function exigirRecurso(recurso, chaveMensagem = 'flash.recurso_premium') {
    return (req, res, next) => {
        const ass = req.assinatura;
        if (req.ehAdmin || (ass && ass.plano && ass.plano[recurso])) return next();
        req.session.flash = { tipo: 'erro', mensagem: req.t(chaveMensagem) };
        return res.redirect('/assinatura');
    };
}

// Limite de contas bancarias ativas do plano (ex.: Basico = 2). Vale para criar e restaurar.
async function limiteContas(req, res, next) {
    const max = req.assinatura && req.assinatura.plano ? req.assinatura.plano.max_contas : null;
    if (req.ehAdmin || max === null || max === undefined) return next();
    const [[r]] = await db.query("SELECT COUNT(*) AS n FROM contas WHERE user_id = ? AND status = 'ativa'", [req.user.id]);
    if (r.n >= max) {
        req.session.flash = { tipo: 'erro', mensagem: req.t('flash.limite_contas', { n: max }) };
        return res.redirect('/contas');
    }
    next();
}

function exigirAdmin(req, res, next) {
    if (req.ehAdmin) return next();
    return res.status(404).render('404', { title: req.t('erro404.titulo') });
}

module.exports = { contaMiddleware, exigirRecurso, exigirAdmin, limiteContas };
