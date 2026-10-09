const Assinatura = require('../models/Assinatura');
const User = require('../models/User');
const telefone = require('../core/telefone');
const { fmt } = require('../core/legal');
const { recursosDoPlano } = require('../core/planos_recursos');
const { sendPlanRequestNotice } = require('../core/mailer');
const { TRIAL_DIAS, PLANOS_VENDA, NOME_APP } = require('../core/negocio');
const { caminhoLocal } = require('../middleware/authMiddleware');
const pagopar = require('../core/pagopar');

// Caminho local para voltar depois de trocar o plano em teste (nunca um endereco externo).
const voltarLocal = (v) => (caminhoLocal(v) && !String(v).startsWith('/teste') ? v : '/assinatura');

// Ativa o plano de um pedido do Pagopar ja confirmado como pago (so uma vez, mesmo que webhook e retorno cheguem juntos).
async function concluirPedido(pedido) {
    if (!(await pagopar.Pedido.marcarPago(pedido.id))) return false;
    try {
        await Assinatura.ativar(pedido.user_id, pedido.plano_codigo, pedido.ciclo, {
            metodo: 'pagopar', referencia: pedido.hash_pedido, valor: pedido.valor, gateway: 'pagopar', gatewayRef: pedido.hash_pedido
        });
    } catch (err) {
        await pagopar.Pedido.desmarcarPago(pedido.id);
        throw err;
    }
    return true;
}

const assinaturaController = {
    // Teste gratis: a pessoa escolhe o plano que quer testar (uma vez so) e usa esse plano por TRIAL_DIAS dias.
    escolherTeste: async (req, res) => {
        const ass = req.assinatura;
        if (!ass || ass.status_efetivo !== 'escolher') return res.redirect(req.ehAdmin ? '/' : '/assinatura');
        const planos = (await Assinatura.listarPlanos()).filter((p) => PLANOS_VENDA.includes(p.codigo));
        const sugerido = planos.some((p) => p.codigo === req.session.plano_teste) ? req.session.plano_teste : 'premium';
        res.render('assinatura/escolher', {
            title: req.t('teste.titulo', { dias: TRIAL_DIAS }),
            planos,
            sugerido,
            fmt,
            recursosDoPlano,
            // Quem terminou o teste antigo de 7 dias ve um texto diferente de quem acabou de criar a conta.
            veioDoTesteAntigo: Boolean(ass.trial_fim)
        });
    },

    iniciarTeste: async (req, res) => {
        const plano = await Assinatura.iniciarTeste(req.user.id, String(req.body.plano || ''));
        if (!plano) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.teste_indisponivel') };
            return res.redirect('/assinatura');
        }
        delete req.session.plano_teste;
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.teste_iniciado', { plano: req.t('plano.' + plano.codigo + '.nome'), dias: TRIAL_DIAS }) };
        res.redirect('/');
    },

    // Durante o teste a pessoa pode passar a testar outro plano; o prazo continua o mesmo.
    trocarTeste: async (req, res) => {
        const voltar = voltarLocal(req.body.voltar);
        const plano = await Assinatura.trocarPlanoTeste(req.user.id, String(req.body.plano || ''));
        if (!plano) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.teste_troca_indisponivel') };
            return res.redirect('/assinatura');
        }
        const dias = req.assinatura ? req.assinatura.dias_restantes : null;
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.teste_trocado', { plano: req.t('plano.' + plano.codigo + '.nome'), dias: dias || 1 }) };
        res.redirect(voltar);
    },

    index: async (req, res) => {
        const [planos, pagamentos] = await Promise.all([
            Assinatura.listarPlanos(),
            Assinatura.historicoPagamentos(req.user.id)
        ]);
        res.render('assinatura/index', {
            title: req.t('assinatura.titulo'),
            menuAtivo: 'assinatura',
            planos,
            pagamentos,
            fmt,
            recursosDoPlano,
            paises: telefone.PAISES,
            pagoOnline: pagopar.disponivel(),
            idiomaTel: telefone.idiomaCurto(req.lang || req.session.idioma)
        });
    },

    solicitar: async (req, res) => {
        const { plano, ciclo } = req.body;
        // O telefone e obrigatorio: e por ele que entramos em contato para fechar a contratacao.
        const tel = telefone.normalizar(req.body.telefone_codigo, req.body.telefone_numero);
        if (!tel) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.telefone_invalido') };
            return res.redirect('/assinatura');
        }
        const solicitado = await Assinatura.solicitar(req.user.id, plano, ciclo);
        if (!solicitado) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.plano_invalido') };
            return res.redirect('/assinatura');
        }
        await User.salvarTelefone(req.user.id, tel.codigo, tel.numero);
        // Com o Pagopar configurado, a pessoa vai direto pagar; sem ele (ou se falhar) segue o pedido manual abaixo.
        if (pagopar.disponivel()) {
            const url = await assinaturaController.iniciarPagopar(req, solicitado, ciclo, tel);
            if (url) return res.redirect(url);
        }
        // Aviso ao admin; falha de e-mail nao pode quebrar o pedido.
        try {
            await sendPlanRequestNotice({
                usuario: req.user, plano: solicitado.nome, ciclo, telefone: telefone.formatar(tel.codigo, tel.numero),
                link: `${req.protocol || 'https'}://${req.get('host')}/admin`
            });
        } catch (err) {
            console.error('Falha ao avisar admin sobre pedido de plano:', err.message);
        }
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.pedido_registrado') };
        res.redirect('/assinatura');
    },

    // Cria o pedido no Pagopar e devolve o endereco de pagamento (ou null se nao foi possivel).
    iniciarPagopar: async (req, plano, ciclo, tel) => {
        const valor = Number(ciclo === 'anual' ? plano.preco_anual : plano.preco_mensal);
        const documento = String(req.body.documento || '').replace(/[^0-9A-Za-z-]/g, '').slice(0, 20);
        if (!documento || !valor) return null;
        const pedidoId = await pagopar.Pedido.criar(req.user.id, plano.codigo, ciclo, valor);
        try {
            const descricao = `${NOME_APP} - ${plano.nome} (${ciclo})`;
            const r = await pagopar.criarPedido({
                pedidoId, valor, descricao, usuario: req.user, documento, telefone: '+' + `${tel.codigo}${tel.numero}`.replace(/\D/g, '')
            });
            await pagopar.Pedido.definirHash(pedidoId, r.hash);
            return r.url;
        } catch (err) {
            console.error('Falha ao criar pedido no Pagopar:', err.message);
            await pagopar.Pedido.falhou(pedidoId);
            return null;
        }
    },

    // Pagopar devolve a pessoa para ca (URL de redirecionamento do comercio). Confirma o pagamento direto no Pagopar.
    retornoPagopar: async (req, res) => {
        const hash = String(req.params.hash || '').replace(/[^0-9A-Za-z_-]/g, '');
        const pedido = hash ? await pagopar.Pedido.porHash(hash) : null;
        if (!pedido || pedido.user_id !== req.user.id) return res.redirect('/assinatura');
        let pago = pedido.estado === 'pago';
        if (!pago) {
            try {
                const c = await pagopar.consultarPago(hash);
                if (c.pago && c.valor === Number(pedido.valor)) { await concluirPedido(pedido); pago = true; }
            } catch (err) {
                console.error('Falha ao consultar pedido no Pagopar:', err.message);
            }
        }
        req.session.flash = pago
            ? { tipo: 'sucesso', mensagem: req.t('flash.pagopar_pago') }
            : { tipo: 'erro', mensagem: req.t('flash.pagopar_pendente') };
        res.redirect('/assinatura');
    },

    // Aviso do Pagopar (URL de resposta do comercio). Sem sessao: vale pelo token (sha1 da chave privada + hash).
    // A resposta tem de repetir o "resultado" recebido.
    webhookPagopar: async (req, res) => {
        const lista = req.body && Array.isArray(req.body.resultado) ? req.body.resultado : [];
        if (!pagopar.disponivel() || !lista.length) return res.status(400).json({ error: 'invalido' });
        for (const item of lista) {
            if (!pagopar.tokenValido(item.hash_pedido, item.token)) return res.status(401).json({ error: 'token invalido' });
        }
        for (const item of lista) {
            try {
                const pedido = item.pagado === true ? await pagopar.Pedido.porHash(String(item.hash_pedido)) : null;
                // Confere o valor e confirma no proprio Pagopar antes de liberar o plano.
                if (pedido && Number(item.monto) === Number(pedido.valor) && (await pagopar.consultarPago(pedido.hash_pedido)).pago) {
                    await concluirPedido(pedido);
                }
            } catch (err) {
                console.error('Falha ao processar aviso do Pagopar:', err.message);
                return res.status(500).json({ error: 'falha' });
            }
        }
        res.json(lista);
    }
};

module.exports = assinaturaController;
