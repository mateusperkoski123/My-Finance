const Conta = require('../models/Conta');
const Categoria = require('../models/Categoria');
const Lancamento = require('../models/Lancamento');
const { parseMoeda, toLocalYMD, moeda, hojeLocal } = require('../core/helpers');

// Destino pos-acao: campo 'voltar' do formulario (somente caminho local), senao Referer, senao '/'.
const destinoRetorno = (req) => {
    const v = req.body && req.body.voltar;
    if (typeof v === 'string' && v.startsWith('/') && !v.startsWith('//')) return v;
    return req.get('Referrer') || '/';
};

const cleanVal = (v) => (v && v !== 'null' && v !== 'undefined' && v !== '' && v !== 'sem_agrupamento') ? String(v).trim() : null;

const dashboardController = {
    index: async (req, res) => {
        const userId = req.user.id;
        const query = req.query;

        // Period logic
        const hoje = hojeLocal();
        let mes = parseInt(query.mes || (hoje.getMonth() + 1), 10);
        let ano = parseInt(query.ano || hoje.getFullYear(), 10);

        let inicio, fim, customizado = false;
        if (query.data_inicio && query.data_fim) {
            inicio = query.data_inicio;
            fim = query.data_fim;
            customizado = true;
        } else {
            const start = new Date(ano, mes - 1, 1);
            const end = new Date(ano, mes, 0);
            inicio = toLocalYMD(start);
            fim = toLocalYMD(end);
        }

        const periodo = {
            mes,
            ano,
            inicio,
            fim,
            customizado,
            e_mes_atual: (!customizado && mes === (hoje.getMonth() + 1) && ano === hoje.getFullYear())
        };

        // Prev/Next month
        let mesAnt = mes - 1;
        let anoAnt = ano;
        if (mesAnt < 1) { mesAnt = 12; anoAnt--; }

        let mesProx = mes + 1;
        let anoProx = ano;
        if (mesProx > 12) { mesProx = 1; anoProx++; }

        periodo.mes_anterior = mesAnt;
        periodo.ano_anterior = anoAnt;
        periodo.mes_proximo = mesProx;
        periodo.ano_proximo = anoProx;

        const filtros = {
            tipo: cleanVal(query.tipo) || 'todas',
            busca: cleanVal(query.busca) || '',
            categoria_id: cleanVal(query.categoria_id),
            subcategoria_id: cleanVal(query.subcategoria_id)
        };

        const ordenacao = cleanVal(query.ordenar) || 'data';
        const agrupamento = cleanVal(query.agrupar) || 'sem_agrupamento';
        const pagina = parseInt(query.pagina || '1', 10);
        const porPagina = parseInt(query.por_pagina || '30', 10);

        const contas = await Conta.buscarPorUsuario(userId, false);
        await Categoria.garantirCategoriasBasicas(userId); // contas antigas sem categorias de despesa/receita
        const categoriasArvore = await Categoria.buscarArvore(userId, false);
        const resumo = await Lancamento.resumoPeriodo(userId, periodo);
        
        // Saldo previsto (ate o fim do periodo) = disponivel + a receber - nao pago (calculado em resumoPeriodo)

        const dadosLancamentos = await Lancamento.buscarFiltrados(userId, periodo, filtros, ordenacao, pagina, porPagina, agrupamento);

        const pendenciasUrgentes = await Lancamento.pendentesUrgentes(userId, toLocalYMD(hojeLocal()));
        const despesasPorCategoria = await Lancamento.resumoPorCategoriaPai(userId, periodo, 'despesa');

        res.render('dashboard/index', {
            title: req.t('pages.painel.titulo'),
            periodo,
            filtros,
            ordenacao,
            agrupamento,
            contas,
            categoriasArvore,
            resumo,
            pendenciasUrgentes,
            despesasPorCategoria,
            lancamentos: dadosLancamentos.lancamentos,
            grupos: dadosLancamentos.grupos,
            totalRegistros: dadosLancamentos.totalRegistros,
            somaFiltrada: dadosLancamentos.somaFiltrada,
            totalPaginas: dadosLancamentos.totalPaginas,
            paginaAtual: dadosLancamentos.paginaAtual,
            porPagina
        });
    },

    criarLancamento: async (req, res) => {
        const userId = req.user.id;
        const b = req.body;
        const val = parseMoeda(b.valor);

        if (!b.descricao || !b.descricao.trim()) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.lanc_descricao_obrigatoria') };
            return res.redirect('/');
        }
        if (val <= 0) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.lanc_valor_invalido') };
            return res.redirect('/');
        }
        if (!b.categoria_id) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.lanc_categoria_obrigatoria') };
            return res.redirect('/');
        }
        if (!b.conta_id) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.lancamento_conta_invalida') };
            return res.redirect('/');
        }

        const payload = {
            conta_id: b.conta_id,
            categoria_id: b.categoria_id || null,
            subcategoria_id: b.subcategoria_id || null,
            tipo: b.tipo || 'despesa',
            descricao: b.descricao.trim(),
            valor: val,
            data_competencia: b.data_competencia || toLocalYMD(hojeLocal()),
            data_vencimento: b.data_vencimento || null,
            data_pagamento: b.data_pagamento || null,
            status: (b.foi_pago === '1' || b.foi_recebida === '1' || b.status === 'pago') ? 'pago' : 'pendente',
            e_fixo: b.e_fixo === '1' || b.e_fixo === true ? 1 : 0,
            repetir: b.repetir === '1' || b.repetir === true ? 1 : 0,
            quantidade_repeticoes: b.quantidade_repeticoes || '1',
            observacoes: b.observacoes || null
        };

        let criados;
        try {
            criados = await Lancamento.criar(userId, payload);
        } catch (err) {
            if (err.codigo) {
                req.session.flash = { tipo: 'erro', mensagem: req.t('flash.lanc_conta_categoria_invalida') };
                return res.redirect(destinoRetorno(req));
            }
            throw err;
        }
        if (criados.length > 1) {
            req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.lancamentos_criados_repeticao', { n: criados.length }) };
        } else {
            req.session.flash = { tipo: 'sucesso', mensagem: payload.tipo === 'receita' ? req.t('flash.receita_criada') : req.t('flash.despesa_criada') };
        }

        res.redirect('/');
    },

    atualizarLancamento: async (req, res) => {
        const userId = req.user.id;
        const id = req.params.id;
        const b = req.body;
        const val = parseMoeda(b.valor);

        if (!b.descricao || !b.descricao.trim()) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.lanc_descricao_obrigatoria') };
            return res.redirect(destinoRetorno(req));
        }
        if (val <= 0) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.lanc_valor_invalido') };
            return res.redirect(destinoRetorno(req));
        }
        if (!b.categoria_id) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.lanc_categoria_obrigatoria') };
            return res.redirect(destinoRetorno(req));
        }

        const payload = {
            conta_id: b.conta_id,
            categoria_id: b.categoria_id || null,
            subcategoria_id: b.subcategoria_id || null,
            descricao: b.descricao ? b.descricao.trim() : '',
            valor: val,
            data_competencia: b.data_competencia,
            data_vencimento: b.data_vencimento || null,
            data_pagamento: b.data_pagamento || null,
            status: (b.foi_pago === '1' || b.foi_recebida === '1' || b.status === 'pago') ? 'pago' : 'pendente',
            e_fixo: b.e_fixo === '1' || b.e_fixo === true ? 1 : 0,
            observacoes: b.observacoes || null
        };

        const escopo = b.escopo_serie || 'apenas_esta';
        try {
            await Lancamento.atualizar(id, userId, payload, escopo);
        } catch (err) {
            if (err.codigo) {
                req.session.flash = { tipo: 'erro', mensagem: req.t('flash.lanc_conta_categoria_invalida') };
                return res.redirect(destinoRetorno(req));
            }
            throw err;
        }
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.lancamento_atualizado') };
        res.redirect(destinoRetorno(req));
    },

    excluirLancamento: async (req, res) => {
        const userId = req.user.id;
        const id = req.params.id;
        await Lancamento.excluir(id, userId, req.body.escopo_serie || 'apenas_esta');
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.lancamento_excluido') };
        res.redirect(destinoRetorno(req));
    },

    marcarPago: async (req, res) => {
        const userId = req.user.id;
        const id = req.params.id;
        const status = req.body.status === 'pendente' ? 'pendente' : 'pago';
        const antes = await Lancamento.buscarPorId(id, userId);
        await Lancamento.marcarComoPago(id, userId, status);
        let mensagem = status === 'pendente' ? req.t('flash.pagamento_desfeito') : req.t('flash.lancamento_marcado_pago');
        if (antes) {
            const conta = await Conta.buscarPorId(antes.conta_id, userId);
            if (conta) mensagem += ` — ${conta.nome}: ${moeda(conta.saldo_atual, res.locals.currency)}`;
        }
        req.session.flash = { tipo: 'sucesso', mensagem };
        res.redirect(destinoRetorno(req));
    }
};

module.exports = dashboardController;
