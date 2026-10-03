const Conta = require('../models/Conta');
const Categoria = require('../models/Categoria');
const Lancamento = require('../models/Lancamento');
const db = require('../config/db');
const { parseMoeda, toLocalYMD, hojeLocal, dataValida, mesAnoValidos, corValida } = require('../core/helpers');

const MESES_FIXO = 24;
const TIPOS_CONTA = ['corrente', 'poupanca', 'carteira', 'investimento', 'outra'];

// Nome, tipo e cor vindos do formulario, ja limpos (nome vazio = invalido).
const dadosConta = (b) => ({
    nome: typeof b.nome === 'string' ? b.nome.trim().slice(0, 120) : '',
    tipo: TIPOS_CONTA.includes(b.tipo) ? b.tipo : 'corrente',
    cor: corValida(b.cor) ? b.cor : '#3b82f6',
    e_padrao: b.e_padrao === '1' || b.e_padrao === true ? 1 : 0
});

// O modal de transferencia envia origem_id em campo hidden + select (o select pode estar desabilitado): vale o ultimo preenchido.
const unico = (v) => (Array.isArray(v) ? ([...v].reverse().find((x) => x !== '' && x != null) || '') : v);

const contasController = {
    index: async (req, res) => {
        try {
            const userId = req.user.id;
            const abaArquivadas = req.query.aba === 'arquivadas';
            const contas = await Conta.calcularSaldos(userId);

            const ativas = contas.filter(c => c.status !== 'arquivada');
            const arquivadas = contas.filter(c => c.status === 'arquivada');

            const saldoTotal = ativas.reduce((acc, c) => acc + (parseFloat(c.saldo_atual) || 0), 0);

            res.render('contas/index', {
                title: req.t('pages.contas.titulo'),
                contas: abaArquivadas ? arquivadas : ativas,
                abaArquivadas,
                saldoTotal,
                totalContas: (abaArquivadas ? arquivadas : ativas).length
            });
        } catch (err) {
            console.error('Erro em contasController.index:', err);
            res.status(500).render('500', { message: req.t('flash.conta_erro_listar') });
        }
    },

    criar: async (req, res) => {
        try {
            const userId = req.user.id;
            const dados = dadosConta(req.body);
            if (!dados.nome) {
                req.session.flash = { tipo: 'erro', mensagem: req.t('flash.conta_nome_obrigatorio') };
                return res.redirect('/contas');
            }

            await Conta.criar(userId, Object.assign(dados, { saldo_inicial: parseMoeda(req.body.saldo_inicial) }));

            req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.conta_criada') };
        } catch (err) {
            console.error('Erro em contasController.criar:', err);
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.conta_erro_criar') };
        }
        res.redirect('/contas');
    },

    atualizar: async (req, res) => {
        try {
            const userId = req.user.id;
            const id = req.params.id;
            const dados = dadosConta(req.body);
            if (!dados.nome) {
                req.session.flash = { tipo: 'erro', mensagem: req.t('flash.conta_nome_obrigatorio') };
                return res.redirect('/contas');
            }

            await Conta.atualizar(id, userId, dados);

            req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.conta_atualizada') };
        } catch (err) {
            console.error('Erro em contasController.atualizar:', err);
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.conta_erro_atualizar') };
        }
        res.redirect('/contas');
    },

    arquivar: async (req, res) => {
        try {
            const userId = req.user.id;
            const id = req.params.id;
            await Conta.arquivar(id, userId);
            req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.conta_arquivada') };
        } catch (err) {
            console.error('Erro em contasController.arquivar:', err);
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.conta_erro_arquivar') };
        }
        res.redirect('/contas');
    },

    restaurar: async (req, res) => {
        try {
            const userId = req.user.id;
            const id = req.params.id;
            await Conta.restaurar(id, userId);
            req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.conta_restaurada') };
        } catch (err) {
            console.error('Erro em contasController.restaurar:', err);
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.conta_erro_restaurar') };
        }
        res.redirect('/contas?aba=arquivadas');
    },

    excluir: async (req, res) => {
        try {
            const userId = req.user.id;
            const id = req.params.id;
            await Conta.excluir(id, userId);
            req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.conta_eliminada') };
        } catch (err) {
            console.error('Erro em contasController.excluir:', err);
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.conta_erro_eliminar') };
        }
        res.redirect('/contas');
    },

    definirPadrao: async (req, res) => {
        try {
            const userId = req.user.id;
            const id = req.params.id;
            await Conta.definirPadrao(id, userId);
            req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.conta_atualizada') };
        } catch (err) {
            console.error('Erro em contasController.definirPadrao:', err);
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.conta_erro_padrao') };
        }
        res.redirect('/contas');
    },

    ajustarSaldo: async (req, res) => {
        try {
            const userId = req.user.id;
            const id = req.params.id;
            const b = req.body;
            const valAjuste = Math.abs(parseMoeda(b.valor_ajuste || b.novo_saldo));
            const tipoAjuste = b.tipo_ajuste || 'ingreso';

            const conta = await Conta.buscarPorId(id, userId);
            if (!conta) {
                req.session.flash = { tipo: 'erro', mensagem: req.t('flash.conta_invalida') };
                return res.redirect('/contas');
            }
            if (!(valAjuste > 0)) {
                req.session.flash = { tipo: 'erro', mensagem: req.t('flash.lanc_valor_invalido') };
                return res.redirect('/contas');
            }

            const catId = await Categoria.idSistema(userId, 'ajuste_saldo');

            const delta = tipoAjuste === 'ingreso' ? valAjuste : -valAjuste;
            const dataAjuste = dataValida(b.data) ? b.data : toLocalYMD(hojeLocal());

            await db.query(
                `INSERT INTO lancamentos (user_id, conta_id, categoria_id, tipo, descricao, valor, data_competencia, data_pagamento, status, created_at, updated_at)
                 VALUES (?, ?, ?, 'ajuste', ?, ?, ?, ?, 'pago', NOW(3), NOW(3))`,
                [
                    userId, conta.id, catId,
                    delta >= 0 ? 'Ajuste de saldo (entrada)' : 'Ajuste de saldo (saída)',
                    delta,
                    dataAjuste,
                    dataAjuste
                ]
            );

            req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.saldo_ajustado') };
        } catch (err) {
            console.error('Erro em contasController.ajustarSaldo:', err);
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.conta_erro_ajuste') };
        }
        res.redirect('/contas');
    },

    transferir: async (req, res) => {
        try {
            const userId = req.user.id;
            const origemId = unico(req.body.origem_id);
            const destinoId = unico(req.body.destino_id);
            const val = parseMoeda(req.body.valor);
            const descricao = String(req.body.descricao || '').trim().slice(0, 100);
            const dataComp = req.body.data || toLocalYMD(hojeLocal());
            const origem = origemId ? await Conta.buscarPorId(origemId, userId) : null;
            const destino = destinoId ? await Conta.buscarPorId(destinoId, userId) : null;
            if (!origem || !destino || origem.status !== 'ativa' || destino.status !== 'ativa') {
                req.session.flash = { tipo: 'erro', mensagem: req.t('flash.conta_invalida') };
                return res.redirect('/contas');
            }
            if (origem.id === destino.id) {
                req.session.flash = { tipo: 'erro', mensagem: req.t('flash.transferencia_contas_iguais') };
                return res.redirect('/contas');
            }
            if (!(val > 0)) {
                req.session.flash = { tipo: 'erro', mensagem: req.t('flash.transferencia_valor_invalido') };
                return res.redirect('/contas');
            }
            if (!dataValida(dataComp)) {
                req.session.flash = { tipo: 'erro', mensagem: req.t('flash.lanc_data_invalida') };
                return res.redirect('/contas');
            }

            // Saida da origem + entrada no destino, ja ligadas e gravadas juntas (ou as duas, ou nenhuma).
            await Lancamento.criarTransferencia({ userId, origem, destino, valor: val, data: dataComp, descricao });
            req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.transferencia_realizada') };
        } catch (err) {
            console.error('Erro em contasController.transferir:', err);
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.conta_erro_transferir') };
        }
        res.redirect('/contas');
    },

    // Agenda transferencias entre contas: cada ocorrencia vira um par de lancamentos PENDENTES (saida + entrada).
    // O saldo so se move quando o usuario marca como pago (manual). Mesma logica de Fixo (24 meses) / Repetir (N) / uma vez.
    agendarTransferencia: async (req, res) => {
        const userId = req.user.id;
        const volta = (tipo, chave, extra) => { req.session.flash = { tipo, mensagem: req.t(chave, extra) }; return res.redirect('/contas'); };
        try {
            const origemId = unico(req.body.origem_id);
            const destinoId = unico(req.body.destino_id);
            const valor = parseMoeda(req.body.valor);
            const data = String(req.body.data || '');
            const descricao = String(req.body.descricao || '').trim().slice(0, 100);
            if (!dataValida(data)) return volta('erro', 'flash.agendar_invalido');
            if (!origemId || !destinoId || String(origemId) === String(destinoId)) return volta('erro', 'flash.transferencia_contas_iguais');
            if (!(valor > 0)) return volta('erro', 'flash.transferencia_valor_invalido');

            const origem = await Conta.buscarPorId(origemId, userId);
            const destino = await Conta.buscarPorId(destinoId, userId);
            if (!origem || !destino || origem.status !== 'ativa' || destino.status !== 'ativa') return volta('erro', 'flash.conta_invalida');

            // Fixo e Repetir sao excludentes; se vierem os dois, vale o fixo.
            const eFixo = req.body.e_fixo === '1';
            const eRepetir = !eFixo && req.body.repetir === '1';
            const qtd = eFixo ? MESES_FIXO : (eRepetir ? Math.min(Math.max(parseInt(req.body.quantidade_repeticoes, 10) || 1, 1), 60) : 1);

            // Mesma rotina da transferencia imediata, do app e do Chat IA: pares pendentes, um por mes.
            await Lancamento.criarTransferencia({ userId, origem, destino, valor, data, descricao, agendada: true, eFixo, quantidade: qtd });
            return volta('sucesso', 'flash.transferencia_agendada', { n: qtd });
        } catch (err) {
            console.error('Erro em contasController.agendarTransferencia:', err);
            return volta('erro', 'flash.conta_erro_transferir');
        }
    },

    extrato: async (req, res) => {
        try {
            const userId = req.user.id;
            const id = req.params.id;
            const conta = await Conta.buscarPorId(id, userId);
            if (!conta) {
                req.session.flash = { tipo: 'erro', mensagem: req.t('flash.conta_invalida') };
                return res.redirect('/contas');
            }
            const q = req.query;
            const hojeObj = hojeLocal();
            const hoje = toLocalYMD(hojeObj);
            const { mes, ano } = mesAnoValidos(q.mes, q.ano, hojeObj);
            let preset = ['hoje', '7dias', 'mes', 'anual', 'todo', 'custom'].includes(q.preset) ? q.preset : 'mes';
            let inicio, fim;
            if (dataValida(q.data_inicio) && dataValida(q.data_fim) && (q.aplicar || preset === 'custom')) {
                preset = 'custom'; inicio = q.data_inicio; fim = q.data_fim;
            } else if (preset === 'hoje') {
                inicio = fim = hoje;
            } else if (preset === '7dias') {
                const d = hojeLocal(); d.setDate(d.getDate() - 7);
                inicio = toLocalYMD(d); fim = hoje;
            } else if (preset === 'anual') {
                inicio = `${ano}-01-01`; fim = `${ano}-12-31`;
            } else if (preset === 'todo') {
                inicio = fim = null;
            } else {
                preset = 'mes';
                inicio = toLocalYMD(new Date(ano, mes - 1, 1));
                fim = toLocalYMD(new Date(ano, mes, 0));
            }
            const mesAnt = new Date(ano, mes - 2, 1), mesProx = new Date(ano, mes, 1);
            const periodo = {
                preset, inicio, fim, mes, ano,
                mes_anterior: mesAnt.getMonth() + 1, ano_anterior: mesAnt.getFullYear(),
                mes_proximo: mesProx.getMonth() + 1, ano_proximo: mesProx.getFullYear()
            };
            const filtros = {
                tipo: ['receita', 'despesa', 'transferencia'].includes(q.tipo) ? q.tipo : '',
                status: ['pago', 'pendente'].includes(q.status) ? q.status : '',
                busca: String(q.busca || '').trim().slice(0, 80),
                ordenar: ['vencimento', 'valor'].includes(q.ordenar) ? q.ordenar : ''
            };
            const itens = await Conta.extrato(id, userId, { inicio, fim, ...filtros });
            const contas = await Conta.buscarPorUsuario(userId, false);
            const categoriasArvore = await Categoria.buscarArvore(userId, false);
            const somar = (fn) => itens.reduce((s, l) => s + (fn(parseFloat(l.valor) || 0) ? Math.abs(parseFloat(l.valor) || 0) : 0), 0);
            const totais = { entradas: somar((v) => v > 0), saidas: somar((v) => v < 0) };
            totais.resultado = totais.entradas - totais.saidas;
            res.render('contas/extrato', {
                title: `${req.t('contas.extrato.titulo')} - ${conta.nome}`,
                conta,
                lancamentos: itens,
                contas,
                categoriasArvore,
                periodo,
                filtros,
                totais
            });
        } catch (err) {
            console.error('Erro em contasController.extrato:', err);
            res.redirect('/contas');
        }
    }
};

module.exports = contasController;
