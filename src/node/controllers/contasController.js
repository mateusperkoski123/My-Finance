const Conta = require('../models/Conta');
const Categoria = require('../models/Categoria');
const db = require('../config/db');
const { parseMoeda, toLocalYMD } = require('../core/helpers');

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
            res.status(500).render('500', { message: 'Erro ao carregar a lista de contas.' });
        }
    },

    criar: async (req, res) => {
        try {
            const userId = req.user.id;
            const b = req.body;
            if (!b.nome || !b.nome.trim()) {
                req.session.flash = { tipo: 'erro', mensagem: req.t('flash.conta_nome_obrigatorio') };
                return res.redirect('/contas');
            }

            await Conta.criar(userId, {
                nome: b.nome.trim(),
                tipo: b.tipo || 'corrente',
                saldo_inicial: parseMoeda(b.saldo_inicial),
                cor: b.cor || '#3b82f6',
                e_padrao: b.e_padrao === '1' || b.e_padrao === true ? 1 : 0
            });

            req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.conta_criada') };
        } catch (err) {
            console.error('Erro em contasController.criar:', err);
            req.session.flash = { tipo: 'erro', mensagem: 'Erro ao criar a conta.' };
        }
        res.redirect('/contas');
    },

    atualizar: async (req, res) => {
        try {
            const userId = req.user.id;
            const id = req.params.id;
            const b = req.body;

            await Conta.atualizar(id, userId, {
                nome: b.nome.trim(),
                tipo: b.tipo,
                cor: b.cor,
                e_padrao: b.e_padrao === '1' || b.e_padrao === true ? 1 : 0
            });

            req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.conta_atualizada') };
        } catch (err) {
            console.error('Erro em contasController.atualizar:', err);
            req.session.flash = { tipo: 'erro', mensagem: 'Erro ao atualizar a conta.' };
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
            req.session.flash = { tipo: 'erro', mensagem: 'Erro ao arquivar a conta.' };
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
            req.session.flash = { tipo: 'erro', mensagem: 'Erro ao restaurar a conta.' };
        }
        res.redirect('/contas?aba=arquivadas');
    },

    excluir: async (req, res) => {
        try {
            const userId = req.user.id;
            const id = req.params.id;
            await Conta.excluir(id, userId);
            req.session.flash = { tipo: 'sucesso', mensagem: 'Conta eliminada com sucesso.' };
        } catch (err) {
            console.error('Erro em contasController.excluir:', err);
            req.session.flash = { tipo: 'erro', mensagem: 'Erro ao eliminar a conta.' };
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
            req.session.flash = { tipo: 'erro', mensagem: 'Erro ao definir a conta padrão.' };
        }
        res.redirect('/contas');
    },

    ajustarSaldo: async (req, res) => {
        try {
            const userId = req.user.id;
            const id = req.params.id;
            const b = req.body;
            const valAjuste = parseMoeda(b.valor_ajuste || b.novo_saldo);
            const tipoAjuste = b.tipo_ajuste || 'ingreso';

            const conta = await Conta.buscarPorId(id, userId);
            if (!conta) {
                req.session.flash = { tipo: 'erro', mensagem: req.t('flash.conta_invalida') };
                return res.redirect('/contas');
            }

            await Categoria.garantirCategoriasSistema(userId);
            const [catRes] = await db.query("SELECT id FROM categorias WHERE user_id = ? AND nome = 'Ajuste de Saldo' LIMIT 1", [userId]);
            const catId = catRes[0] ? catRes[0].id : null;

            const delta = tipoAjuste === 'ingreso' ? valAjuste : -valAjuste;

            await db.query(
                `INSERT INTO lancamentos (user_id, conta_id, categoria_id, tipo, descricao, valor, data_competencia, data_pagamento, status, created_at, updated_at) 
                 VALUES (?, ?, ?, 'ajuste', ?, ?, ?, ?, 'pago', NOW(), NOW())`,
                [
                    userId, id, catId,
                    `Ajuste de Saldo (${delta >= 0 ? '+' : ''}${delta})`,
                    delta,
                    b.data || toLocalYMD(new Date()),
                    b.data || toLocalYMD(new Date())
                ]
            );

            req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.saldo_ajustado') };
        } catch (err) {
            console.error('Erro em contasController.ajustarSaldo:', err);
            req.session.flash = { tipo: 'erro', mensagem: 'Erro ao realizar o ajuste de saldo.' };
        }
        res.redirect('/contas');
    },

    transferir: async (req, res) => {
        try {
            const userId = req.user.id;
            // O modal envia origem_id em campo hidden + select (o select pode estar desabilitado): usa o ultimo valor preenchido.
            const unico = (v) => Array.isArray(v) ? ([...v].reverse().find(x => x !== '' && x != null) || '') : v;
            const origem_id = unico(req.body.origem_id);
            const destino_id = unico(req.body.destino_id);
            const { valor, descricao, data } = req.body;
            const val = parseMoeda(valor);
            const contaOrigem = origem_id ? await Conta.buscarPorId(origem_id, userId) : null;
            const contaDestino = destino_id ? await Conta.buscarPorId(destino_id, userId) : null;
            if (!contaOrigem || !contaDestino) {
                req.session.flash = { tipo: 'erro', mensagem: req.t('flash.conta_invalida') };
                return res.redirect('/contas');
            }

            if (!origem_id || !destino_id || origem_id === destino_id) {
                req.session.flash = { tipo: 'erro', mensagem: req.t('flash.transferencia_contas_iguais') };
                return res.redirect('/contas');
            }
            if (val <= 0) {
                req.session.flash = { tipo: 'erro', mensagem: req.t('flash.transferencia_valor_invalido') };
                return res.redirect('/contas');
            }

            await Categoria.garantirCategoriasSistema(userId);
            const [catRes] = await db.query("SELECT id FROM categorias WHERE user_id = ? AND nome = 'Transferência Bancária' LIMIT 1", [userId]);
            const catId = catRes[0] ? catRes[0].id : null;

            const dataComp = data || toLocalYMD(new Date());
            const descStr = descricao ? descricao.trim() : 'Transferência entre contas';

            // Saída da origem
            await db.query(
                `INSERT INTO lancamentos (user_id, conta_id, categoria_id, tipo, descricao, valor, data_competencia, data_pagamento, status, created_at, updated_at) 
                 VALUES (?, ?, ?, 'transferencia', ?, ?, ?, ?, 'pago', NOW(), NOW())`,
                [userId, origem_id, catId, `Transferência para ${contaDestino.nome} - ${descStr}`, -val, dataComp, dataComp]
            );

            // Entrada no destino
            await db.query(
                `INSERT INTO lancamentos (user_id, conta_id, categoria_id, tipo, descricao, valor, data_competencia, data_pagamento, status, created_at, updated_at) 
                 VALUES (?, ?, ?, 'transferencia', ?, ?, ?, ?, 'pago', NOW(), NOW())`,
                [userId, destino_id, catId, `Transferência recebida de ${contaOrigem.nome} - ${descStr}`, val, dataComp, dataComp]
            );

            req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.transferencia_realizada') };
        } catch (err) {
            console.error('Erro em contasController.transferir:', err);
            req.session.flash = { tipo: 'erro', mensagem: 'Erro ao realizar a transferência.' };
        }
        res.redirect('/contas');
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
            const itens = await Conta.extrato(id, userId);
            res.render('contas/extrato', {
                title: `${req.t('contas.extrato.titulo')} - ${conta.nome}`,
                conta,
                lancamentos: itens
            });
        } catch (err) {
            console.error('Erro em contasController.extrato:', err);
            res.redirect('/contas');
        }
    }
};

module.exports = contasController;
