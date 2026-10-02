const Assinatura = require('../models/Assinatura');
const User = require('../models/User');
const { fmt } = require('../core/legal');

const redirecionar = (res) => res.redirect('/admin');
const Ia = require('../models/Ia');
const { hojeUso } = require('../core/ia_precos');

// 'YYYY-MM-DD' somado em n dias (n pode ser negativo), sem depender do fuso do servidor.
const somarDias = (ymd, n) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
};

const adminController = {
    index: async (req, res) => {
        const busca = String(req.query.q || '').trim().slice(0, 100);
        // Consumo da IA por usuario: este mes (padrao), ultimos 30 dias ou tudo.
        const periodo = ['mes', '30d', 'total'].includes(req.query.periodo) ? req.query.periodo : 'mes';
        const hoje = hojeUso();
        const desde = periodo === 'mes' ? hoje.slice(0, 8) + '01' : (periodo === '30d' ? somarDias(hoje, -29) : null);
        const [metricas, usuarios, planos, consumo] = await Promise.all([
            Assinatura.metricas(),
            Assinatura.listarUsuariosAdmin({ busca }),
            Assinatura.listarPlanos(),
            Ia.consumoPorUsuario(desde)
        ]);
        res.render('admin/index', { title: req.t('admin.titulo'), metricas, usuarios, planos, busca, fmt, consumo, periodo });
    },

    // Consumo da IA: tokens (texto / fotos / audios), custo estimado por dia e saldo de creditos (informado manualmente).
    iaConsumo: async (req, res) => {
        const aba = ['geral', 'texto', 'audio', 'fotos'].includes(req.query.aba) ? req.query.aba : 'geral';
        const hoje = hojeUso();
        const d7 = somarDias(hoje, -6);
        const d30 = somarDias(hoje, -29);
        const mesIni = hoje.slice(0, 8) + '01';
        const [serieBruta, tHoje, t7, t30, tMes, tTotal, usuarios, creditos] = await Promise.all([
            Ia.serieDiaria(d30, hoje), Ia.totalPeriodo(hoje, hoje), Ia.totalPeriodo(d7), Ia.totalPeriodo(d30),
            Ia.totalPeriodo(mesIni), Ia.totalPeriodo('2000-01-01'), Ia.usuariosNoPeriodo(d30), Ia.listarCreditos()
        ]);
        // Preenche os dias sem consumo com zero (30 dias completos).
        const porDia = {};
        serieBruta.forEach((r) => { porDia[r.dia] = r; });
        const serie = [];
        for (let i = 29; i >= 0; i--) { const dia = somarDias(hoje, -i); serie.push(porDia[dia] || { dia }); }

        // Creditos: comprado - gasto estimado desde a primeira compra registrada.
        let cred = null;
        if (creditos.length) {
            const comprado = creditos.reduce((s, c) => s + Number(c.valor_usd), 0);
            const primeira = creditos.map((c) => c.data_compra).sort()[0];
            const desdePrimeira = await Ia.totalPeriodo(primeira);
            const gasto = Number(desdePrimeira.custo_total || 0) / 1e6;
            const media7 = Number(t7.custo_total || 0) / 1e6 / 7;
            const restante = comprado - gasto;
            cred = { comprado, gasto, restante, media7, dias: media7 > 0 ? Math.floor(Math.max(restante, 0) / media7) : null, primeira };
        }
        res.render('admin/ia_consumo', {
            title: req.t('iac.titulo'), aba, hoje, serie, totais: { hoje: tHoje, d7: t7, d30: t30, mes: tMes, total: tTotal },
            usuarios, creditos, cred
        });
    },

    adicionarCredito: async (req, res) => {
        const valor = Number(String(req.body.valor_usd || '').replace(',', '.'));
        const data = String(req.body.data_compra || '');
        if (!(valor > 0) || valor > 100000 || !/^\d{4}-\d{2}-\d{2}$/.test(data)) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.admin_credito_invalido') };
            return res.redirect('/admin/ia');
        }
        await Ia.adicionarCredito(Math.round(valor * 100) / 100, data, String(req.body.nota || '').trim());
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.admin_credito_ok') };
        res.redirect('/admin/ia');
    },

    excluirCredito: async (req, res) => {
        await Ia.excluirCredito(parseInt(req.params.id, 10));
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.admin_credito_excluido') };
        res.redirect('/admin/ia');
    },

    // Registra um pagamento recebido (transferencia, Tigo Money, etc.) e ativa o plano.
    registrarPagamento: async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const { plano, ciclo, metodo, referencia } = req.body;
        try {
            await Assinatura.ativar(id, plano, ciclo, {
                metodo: String(metodo || 'manual').slice(0, 30),
                referencia: referencia ? String(referencia).slice(0, 100) : null,
                registradoPor: req.user.id
            });
            req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.admin_plano_ativado') };
        } catch (err) {
            console.error('Admin: erro ao ativar plano:', err.message);
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.plano_invalido') };
        }
        redirecionar(res);
    },

    estenderTrial: async (req, res) => {
        const dias = Math.min(Math.max(parseInt(req.body.dias, 10) || 7, 1), 365);
        await Assinatura.estenderTrial(parseInt(req.params.id, 10), dias);
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.admin_trial_estendido', { dias }) };
        redirecionar(res);
    },

    cancelar: async (req, res) => {
        await Assinatura.cancelar(parseInt(req.params.id, 10));
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.admin_assinatura_cancelada') };
        redirecionar(res);
    },

    alterarStatus: async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const status = req.body.status === 'suspenso' ? 'suspenso' : 'ativo';
        if (id === req.user.id) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.admin_nao_pode_si_mesmo') };
            return redirecionar(res);
        }
        const alvo = await User.findById(id);
        if (!alvo || alvo.status === 'arquivado') {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.admin_usuario_nao_encontrado') };
            return redirecionar(res);
        }
        await User.atualizarStatus(id, status);
        req.session.flash = { tipo: 'sucesso', mensagem: req.t(status === 'suspenso' ? 'flash.admin_usuario_suspenso' : 'flash.admin_usuario_reativado') };
        redirecionar(res);
    },

    // Liga/desliga o Chat IA para um usuario (admin sempre tem acesso, entao so vale para os demais).
    alternarIa: async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const ligar = req.body.ia === '1';
        const alvo = await User.findById(id);
        if (!alvo) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.admin_usuario_nao_encontrado') };
            return redirecionar(res);
        }
        await require('../models/Ia').definirHabilitada(id, ligar);
        req.session.flash = { tipo: 'sucesso', mensagem: req.t(ligar ? 'flash.admin_ia_ativada' : 'flash.admin_ia_desativada') };
        redirecionar(res);
    },

    alternarIaNivel: async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const nivel = req.body.nivel === '2' ? 2 : 1;
        const alvo = await User.findById(id);
        if (!alvo) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.admin_usuario_nao_encontrado') };
            return redirecionar(res);
        }
        await require('../models/Ia').definirNivel(id, nivel);
        req.session.flash = { tipo: 'sucesso', mensagem: req.t(nivel === 2 ? 'flash.admin_ia_nivel2' : 'flash.admin_ia_nivel1') };
        redirecionar(res);
    },

    // REVISAR (seguranca): acoes em massa. Cada acao so atinge usuarios compativeis; admins e o proprio admin logado nunca
    // sao suspensos, arquivados, excluidos nem alterados em massa. Exclusao so vale para contas ja arquivadas.
    acaoEmMassa: async (req, res) => {
        const voltar = req.body.voltar === 'arquivados' ? '/admin/arquivados' : '/admin';
        const bruto = [].concat(req.body.ids || []).flatMap((v) => String(v).split(','));
        const ids = [...new Set(bruto.map((v) => parseInt(v, 10)).filter((n) => Number.isInteger(n) && n > 0))].slice(0, 200);
        const acao = String(req.body.acao || '');
        const dias = Math.min(Math.max(parseInt(req.body.dias, 10) || 7, 1), 365);

        const usuarios = await User.buscarVarios(ids);
        const comum = (u) => u.role !== 'admin' && u.id !== req.user.id;
        const regras = {
            ia_on: (u) => comum(u),
            ia_off: (u) => comum(u),
            ia_nivel_1: (u) => comum(u),
            ia_nivel_2: (u) => comum(u),
            suspender: (u) => comum(u) && u.status === 'ativo',
            reativar: (u) => comum(u) && u.status === 'suspenso',
            arquivar: (u) => comum(u) && u.status !== 'arquivado',
            trial: (u) => comum(u) && u.status !== 'arquivado',
            desarquivar: (u) => u.status === 'arquivado',
            excluir: (u) => comum(u) && u.status === 'arquivado'
        };
        const regra = regras[acao];
        if (!regra) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.admin_massa_nada') };
            return res.redirect(voltar);
        }
        const alvo = usuarios.filter(regra).map((u) => u.id);
        if (!alvo.length) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.admin_massa_nada') };
            return res.redirect(voltar);
        }

        if (acao === 'ia_on' || acao === 'ia_off') await User.definirIaVarios(alvo, acao === 'ia_on');
        else if (acao === 'ia_nivel_1' || acao === 'ia_nivel_2') await User.definirIaNivelVarios(alvo, acao === 'ia_nivel_2' ? 2 : 1);
        else if (acao === 'suspender') await User.atualizarStatusVarios(alvo, 'suspenso');
        else if (acao === 'reativar' || acao === 'desarquivar') await User.atualizarStatusVarios(alvo, 'ativo');
        else if (acao === 'arquivar') await User.atualizarStatusVarios(alvo, 'arquivado');
        else if (acao === 'trial') { for (const id of alvo) await Assinatura.estenderTrial(id, dias); }
        else if (acao === 'excluir') { for (const id of alvo) await User.excluir(id); }

        const ignorados = ids.length - alvo.length;
        req.session.flash = {
            tipo: 'sucesso',
            mensagem: ignorados > 0 ? req.t('flash.admin_massa_parcial', { n: alvo.length, ignorados }) : req.t('flash.admin_massa_ok', { n: alvo.length })
        };
        res.redirect(voltar);
    },

    // REVISAR (seguranca): arquivar bloqueia o acesso e tira o usuario da lista principal. Nunca vale para admin nem para si mesmo.
    arquivar: async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const alvo = await User.findById(id);
        if (id === req.user.id || (alvo && alvo.role === 'admin')) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.admin_nao_pode_si_mesmo') };
            return redirecionar(res);
        }
        if (!alvo) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.admin_usuario_nao_encontrado') };
            return redirecionar(res);
        }
        await User.atualizarStatus(id, 'arquivado');
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.admin_usuario_arquivado') };
        redirecionar(res);
    },

    arquivados: async (req, res) => {
        const busca = String(req.query.q || '').trim().slice(0, 100);
        const usuarios = await Assinatura.listarUsuariosAdmin({ busca, arquivados: true });
        res.render('admin/arquivados', { title: req.t('admin.arquivados_titulo'), usuarios, busca });
    },

    desarquivar: async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const alvo = await User.findById(id);
        if (!alvo || alvo.status !== 'arquivado') {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.admin_usuario_nao_encontrado') };
            return res.redirect('/admin/arquivados');
        }
        await User.atualizarStatus(id, 'ativo');
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.admin_usuario_desarquivado') };
        res.redirect('/admin/arquivados');
    },

    // REVISAR (seguranca): exclusao definitiva so para conta ja arquivada, nunca admin nem o proprio usuario.
    excluirDefinitivo: async (req, res) => {
        const id = parseInt(req.params.id, 10);
        const alvo = await User.findById(id);
        if (!alvo || alvo.status !== 'arquivado' || alvo.role === 'admin' || id === req.user.id) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.admin_exclusao_negada') };
            return res.redirect('/admin/arquivados');
        }
        await User.excluir(id);
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.admin_usuario_excluido') };
        res.redirect('/admin/arquivados');
    }
};

module.exports = adminController;
