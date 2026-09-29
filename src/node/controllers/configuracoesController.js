const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Conta = require('../models/Conta');
const Categoria = require('../models/Categoria');
const Lancamento = require('../models/Lancamento');
const db = require('../config/db');

const configuracoesController = {
    index: (req, res) => {
        res.render('configuracoes/index', {
            title: req.t('config.titulo'),
            menuAtivo: 'preferencia',
            config: {
                idiomas: {
                    'pt-BR': 'Português (Brasil)',
                    'es-PY': 'Español (Paraguay)',
                    'en-US': 'English (US)'
                },
                moedas: {
                    'PYG': 'Guaraní (PYG)',
                    'BRL': 'Real (BRL)',
                    'USD': 'Dólar (USD)',
                    'ARS': 'Peso Argentino (ARS)',
                    'EUR': 'Euro (EUR)'
                },
                temas: {
                    'claro': 'Claro',
                    'escuro': 'Escuro'
                }
            }
        });
    },

    salvarPreferencia: async (req, res) => {
        const userId = req.user.id;
        const { idioma, moeda, tema } = req.body;
        await User.updatePreferencias(userId, {
            idioma: idioma || 'pt-BR',
            moeda: moeda || 'PYG',
            tema: tema || 'claro'
        });
        req.session.idioma = idioma;
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.preferencias_salvas') };
        res.redirect('/configuracoes');
    },

    perfil: (req, res) => {
        res.render('configuracoes/perfil', {
            title: req.t('config.perfil.titulo'),
            menuAtivo: 'perfil'
        });
    },

    salvarPerfil: async (req, res) => {
        const userId = req.user.id;
        const { nome, email } = req.body;
        if (!nome || !nome.trim()) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.perfil_nome_obrigatorio') };
            return res.redirect('/configuracoes/perfil');
        }
        if (!email || !email.trim()) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.perfil_email_obrigatorio') };
            return res.redirect('/configuracoes/perfil');
        }

        const existing = await User.findByEmail(email.trim());
        if (existing && existing.id !== userId) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.perfil_email_em_uso') };
            return res.redirect('/configuracoes/perfil');
        }

        await User.updatePerfil(userId, { nome: nome.trim(), email: email.trim() });
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.perfil_atualizado') };
        res.redirect('/configuracoes/perfil');
    },

    salvarSenha: async (req, res) => {
        const userId = req.user.id;
        const { senha_atual, nova_senha, confirmar_nova_senha } = req.body;

        const user = await User.findById(userId);
        if (!bcrypt.compareSync(senha_atual, user.senha_hash)) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.senha_atual_incorreta') };
            return res.redirect('/configuracoes/perfil');
        }
        if (nova_senha !== confirmar_nova_senha) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.senhas_diferentes') };
            return res.redirect('/configuracoes/perfil');
        }
        if (nova_senha.length < 6) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.senha_curta') };
            return res.redirect('/configuracoes/perfil');
        }

        const hash = bcrypt.hashSync(nova_senha, 10);
        await User.updateSenha(userId, hash);
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.senha_atualizada') };
        res.redirect('/configuracoes/perfil');
    },

    dados: (req, res) => {
        res.render('configuracoes/dados', {
            title: req.t('config.dados.titulo'),
            menuAtivo: 'dados'
        });
    },

    exportarDados: async (req, res) => {
        const userId = req.user.id;
        const user = await User.findById(userId);
        const contas = await Conta.buscarPorUsuario(userId, true);
        const categorias = await Categoria.buscarArvore(userId, true);

        const [lancamentos] = await db.query(
            "SELECT * FROM lancamentos WHERE user_id = ? ORDER BY data_competencia ASC, id ASC",
            [userId]
        );

        const ymd = (v) => (v ? require('../core/helpers').toLocalYMD(v) : null);
        const lancamentosExport = lancamentos.map(l => Object.assign({}, l, {
            data_competencia: ymd(l.data_competencia),
            data_pagamento: ymd(l.data_pagamento)
        }));

        const payload = {
            versao: "1.0",
            exportado_em: new Date().toISOString(),
            perfil: {
                nome: user.nome,
                email: user.email,
                idioma: user.idioma,
                moeda: user.moeda,
                tema: user.tema
            },
            contas,
            categorias,
            lancamentos: lancamentosExport
        };

        const filename = `backup_gestao_financeira_${new Date().toISOString().slice(0,10)}.json`;
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        res.send(JSON.stringify(payload, null, 2));
    },

    importarDados: async (req, res) => {
        const userId = req.user.id;

        if (!req.file || !req.file.buffer) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.dados_arquivo_obrigatorio') };
            return res.redirect('/configuracoes/dados');
        }

        let payload;
        try {
            payload = JSON.parse(req.file.buffer.toString('utf-8'));
        } catch (err) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.dados_json_invalido') };
            return res.redirect('/configuracoes/dados');
        }

        const contasData = payload.contas || [];
        const categoriasData = payload.categorias || [];
        const lancamentosData = payload.lancamentos || [];

        const { toLocalYMD } = require('../core/helpers');
        // Aceita 'YYYY-MM-DD' ou ISO com fuso (backups antigos gravavam '...T03:00:00.000Z').
        const normData = (v) => {
            if (!v) return null;
            const t = String(v);
            if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
            const d = new Date(t);
            return isNaN(d.getTime()) ? null : toLocalYMD(d);
        };
        const TIPOS = ['receita', 'despesa', 'transferencia', 'ajuste'];
        const STATUS = ['pago', 'pendente'];

        await Categoria.garantirCategoriasSistema(userId);

        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            // 1. Contas (mescla por nome: reaproveita a conta existente)
            const contaMap = {};
            let contasCount = 0;
            for (const c of contasData) {
                if (!c.nome) continue;
                const [existente] = await conn.query('SELECT id FROM contas WHERE user_id = ? AND nome = ? LIMIT 1', [userId, c.nome]);
                if (existente.length) {
                    if (c.id) contaMap[c.id] = existente[0].id;
                    continue;
                }
                const [resAcc] = await conn.query(
                    `INSERT INTO contas (user_id, nome, tipo, cor, saldo_inicial, conta_padrao, status, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, 0, ?, NOW(), NOW())`,
                    [userId, c.nome, c.tipo || 'corrente', c.cor || '#2563eb', parseFloat(c.saldo_inicial) || 0, c.status === 'arquivada' ? 'arquivada' : 'ativa']
                );
                if (c.id) contaMap[c.id] = resAcc.insertId;
                contasCount++;
            }

            const [userAccounts] = await conn.query("SELECT id FROM contas WHERE user_id = ? AND status = 'ativa' ORDER BY id ASC LIMIT 1", [userId]);
            const fallbackAccountId = userAccounts[0]?.id || null;

            // 2. Categorias (mescla por nome + pai; categorias de sistema reaproveitadas)
            const catMap = {};
            let categoriasCount = 0;
            const [existingSysCats] = await conn.query('SELECT id, chave_sistema FROM categorias WHERE user_id = ? AND sistema = 1', [userId]);
            const sysCatMap = {};
            existingSysCats.forEach(sc => { sysCatMap[sc.chave_sistema] = sc.id; });

            const sortedCats = [...categoriasData].sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0));
            for (const cat of sortedCats) {
                if (!cat.nome) continue;
                if (cat.sistema && cat.chave_sistema && sysCatMap[cat.chave_sistema]) {
                    catMap[cat.id] = sysCatMap[cat.chave_sistema];
                    continue;
                }
                const parentId = cat.parent_id ? (catMap[cat.parent_id] || null) : null;
                const [existente] = await conn.query(
                    'SELECT id FROM categorias WHERE user_id = ? AND nome = ? AND parent_id <=> ? LIMIT 1',
                    [userId, cat.nome, parentId]
                );
                if (existente.length) {
                    if (cat.id) catMap[cat.id] = existente[0].id;
                    continue;
                }
                const tipoCat = ['receita', 'despesa', 'ambas'].includes(cat.tipo) ? cat.tipo : 'despesa';
                const [resCat] = await conn.query(
                    `INSERT INTO categorias (user_id, parent_id, nome, cor, tipo, limite_gasto, sistema, chave_sistema, status, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, NOW(), NOW())`,
                    [userId, parentId, cat.nome, cat.cor || '#3b82f6', tipoCat, cat.limite_gasto ? parseFloat(cat.limite_gasto) : null, cat.status === 'arquivada' ? 'arquivada' : 'ativa']
                );
                if (cat.id) catMap[cat.id] = resCat.insertId;
                categoriasCount++;
            }

            // 3. Lancamentos (ignora os que ja existem identicos: importar 2x nao duplica)
            let lancamentosCount = 0;
            for (const l of lancamentosData) {
                if (!l.descricao || !l.valor) continue;
                const mappedContaId = contaMap[l.conta_id] || fallbackAccountId;
                if (!mappedContaId) continue;
                const mappedCatId = l.categoria_id ? (catMap[l.categoria_id] || null) : null;
                const tipo = TIPOS.includes(l.tipo) ? l.tipo : 'despesa';
                const status = STATUS.includes(l.status) ? l.status : 'pendente';
                const dataComp = normData(l.data_competencia) || toLocalYMD(new Date());
                const dataPag = normData(l.data_pagamento);
                let valor = parseFloat(l.valor) || 0;
                // Invariante do sistema: despesa e negativa, receita e positiva (ajuste/transferencia mantem o sinal informado).
                if (tipo === 'despesa') valor = -Math.abs(valor);
                else if (tipo === 'receita') valor = Math.abs(valor);

                const [dup] = await conn.query(
                    'SELECT id FROM lancamentos WHERE user_id = ? AND conta_id = ? AND tipo = ? AND descricao = ? AND valor = ? AND data_competencia = ? LIMIT 1',
                    [userId, mappedContaId, tipo, l.descricao, valor, dataComp]
                );
                if (dup.length) continue;

                await conn.query(
                    `INSERT INTO lancamentos (user_id, conta_id, categoria_id, tipo, descricao, valor,
                                               data_competencia, data_pagamento, status, recorrente,
                                               serie_id, observacoes, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                    [userId, mappedContaId, mappedCatId, tipo, String(l.descricao).slice(0, 190), valor, dataComp,
                     status === 'pago' ? (dataPag || dataComp) : null, status, l.recorrente || l.e_fixo ? 1 : 0,
                     l.serie_id ? String(l.serie_id).slice(0, 36) : null, l.observacoes ? String(l.observacoes).slice(0, 500) : null]
                );
                lancamentosCount++;
            }

            await Conta.garantirContaPadrao(userId);
            await conn.commit();
            req.session.flash = {
                tipo: 'sucesso',
                mensagem: req.t('flash.dados_importado_sucesso', { contas: contasCount, categorias: categoriasCount, lancamentos: lancamentosCount })
            };
        } catch (err) {
            await conn.rollback();
            console.error('Erro na importacao de dados:', err);
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.dados_erro_importar') };
        } finally {
            conn.release();
        }

        res.redirect('/configuracoes/dados');
    }
};

module.exports = configuracoesController;
