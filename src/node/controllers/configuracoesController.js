const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Conta = require('../models/Conta');
const Categoria = require('../models/Categoria');
const Lancamento = require('../models/Lancamento');
const db = require('../config/db');
const { IDIOMAS } = require('../core/idiomas');
const { t: traduzir } = require('../core/i18n');
const { CORES_TEMA, SENHA_MINIMA } = require('../core/negocio');
const { PAISES_CONTA, PAIS_PADRAO, normalizarPais } = require('../core/paises');

// Opcoes oferecidas em Configuracoes > Preferencia (e as unicas aceitas ao salvar).
const MOEDAS = {
    'PYG': 'Guaraní (PYG)',
    'BRL': 'Real (BRL)',
    'USD': 'Dólar (USD)',
    'ARS': 'Peso Argentino (ARS)',
    'EUR': 'Euro (EUR)'
};
const TEMAS = { 'claro': 'Claro', 'escuro': 'Escuro' };
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const configuracoesController = {
    index: (req, res) => {
        res.render('configuracoes/index', {
            title: req.t('config.titulo'),
            menuAtivo: 'preferencia',
            config: { idiomas: IDIOMAS, paises: PAISES_CONTA, moedas: MOEDAS, temas: TEMAS, cores: CORES_TEMA },
            paisAtual: normalizarPais(req.user.pais) || PAIS_PADRAO
        });
    },

    salvarPreferencia: async (req, res) => {
        const userId = req.user.id;
        // Valor fora da lista (formulario adulterado) mantem o que o usuario ja tinha.
        const idioma = IDIOMAS[req.body.idioma] ? req.body.idioma : (req.user.idioma || 'pt-BR');
        // Pais nao muda a moeda ja escolhida; muda o fuso do "hoje" e os Termos (outro pais pede aceitar os termos de la).
        const pais = normalizarPais(req.body.pais) || normalizarPais(req.user.pais) || PAIS_PADRAO;
        const moeda = MOEDAS[req.body.moeda] ? req.body.moeda : (req.user.moeda || 'PYG');
        const tema = TEMAS[req.body.tema] ? req.body.tema : (req.user.tema || 'claro');
        const cor_tema = CORES_TEMA[req.body.cor_tema] ? req.body.cor_tema : (CORES_TEMA[req.user.cor_tema] ? req.user.cor_tema : 'verde');
        await User.updatePreferencias(userId, { idioma, pais, moeda, tema, cor_tema });
        req.session.idioma = idioma;
        // A confirmacao ja sai no idioma que acabou de ser escolhido.
        req.session.flash = { tipo: 'sucesso', mensagem: traduzir('flash.preferencias_salvas', {}, idioma) };
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
        const nome = typeof req.body.nome === 'string' ? req.body.nome.trim().slice(0, 120) : '';
        const email = typeof req.body.email === 'string' ? req.body.email.trim() : '';
        if (!nome) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.perfil_nome_obrigatorio') };
            return res.redirect('/configuracoes/perfil');
        }
        if (!email) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.perfil_email_obrigatorio') };
            return res.redirect('/configuracoes/perfil');
        }
        if (!EMAIL_RE.test(email) || email.length > 190) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.email_invalido') };
            return res.redirect('/configuracoes/perfil');
        }

        const existing = await User.findByEmail(email);
        if (existing && existing.id !== userId) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.perfil_email_em_uso') };
            return res.redirect('/configuracoes/perfil');
        }

        await User.updatePerfil(userId, { nome, email });
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.perfil_atualizado') };
        res.redirect('/configuracoes/perfil');
    },

    salvarSenha: async (req, res) => {
        const userId = req.user.id;
        const senha_atual = typeof req.body.senha_atual === 'string' ? req.body.senha_atual : '';
        const nova_senha = typeof req.body.nova_senha === 'string' ? req.body.nova_senha : '';
        const confirmar_nova_senha = typeof req.body.confirmar_nova_senha === 'string' ? req.body.confirmar_nova_senha : '';
        if (!senha_atual || !nova_senha) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.senha_obrigatoria') };
            return res.redirect('/configuracoes/perfil');
        }

        const user = await User.findById(userId);
        if (!(await bcrypt.compare(senha_atual, user.senha_hash))) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.senha_atual_incorreta') };
            return res.redirect('/configuracoes/perfil');
        }
        if (nova_senha !== confirmar_nova_senha) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.senhas_diferentes') };
            return res.redirect('/configuracoes/perfil');
        }
        if (nova_senha.length < SENHA_MINIMA) {
            req.session.flash = { tipo: 'erro', mensagem: req.t('flash.senha_curta', { n: SENHA_MINIMA }) };
            return res.redirect('/configuracoes/perfil');
        }

        const hash = await bcrypt.hash(nova_senha, 10);
        // As outras sessoes e os aparelhos com a senha antiga saem; esta continua valendo.
        req.session.iniciada_em = await User.updateSenha(userId, hash);
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
        // Cartoes de credito: compras em aberto (ainda fora do saldo) e faturas pagas tambem fazem parte do backup.
        const [cartoes] = await db.query(
            'SELECT id, conta_id, nome, bandeira, limite_total, reintegro_pct, dia_fechamento, dia_vencimento, status FROM cartoes WHERE user_id = ? ORDER BY id', [userId]);
        const [cartaoCompras] = await db.query(
            `SELECT id, cartao_id, categoria_id, descricao, valor, reintegro_pct, reintegro_valor, DATE_FORMAT(data_compra, '%Y-%m-%d') AS data_compra, fatura_mes,
                    lancamento_id, serie_id, recorrente
             FROM cartao_compras WHERE user_id = ? ORDER BY id`, [userId]);
        const [cartaoFaturas] = await db.query(
            "SELECT id, cartao_id, mes, total, DATE_FORMAT(pago_em, '%Y-%m-%d') AS pago_em FROM cartao_faturas WHERE user_id = ? ORDER BY id", [userId]);

        const payload = {
            versao: "1.0",
            exportado_em: new Date().toISOString(),
            perfil: {
                nome: user.nome,
                email: user.email,
                idioma: user.idioma,
                moeda: user.moeda,
                tema: user.tema,
                cor_tema: user.cor_tema
            },
            contas,
            categorias,
            lancamentos: lancamentosExport,
            cartoes,
            cartao_compras: cartaoCompras,
            cartao_faturas: cartaoFaturas
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

        // O arquivo vem de fora: so listas sao aceitas, e nomes/cores sao conferidos antes de gravar.
        const lista = (v) => (Array.isArray(v) ? v.filter((x) => x && typeof x === 'object') : []);
        const contasData = lista(payload && payload.contas);
        const lancamentosData = lista(payload && payload.lancamentos);
        // As categorias podem vir em arvore (como o backup exporta, com "subcategorias" dentro) ou em lista simples.
        const categoriasData = [];
        lista(payload && payload.categorias).forEach((c) => {
            categoriasData.push(c);
            lista(c.subcategorias).forEach((s) => categoriasData.push(s));
        });

        const { toLocalYMD, hojeLocal, corValida, normalizarMoeda } = require('../core/helpers');
        // Backups antigos nao tinham moeda por conta: valem a moeda do perfil do arquivo (ou a atual do usuario).
        const moedaPadraoArquivo = normalizarMoeda(payload && payload.perfil && payload.perfil.moeda, normalizarMoeda(req.user.moeda));
        const TIPOS_CONTA = ['corrente', 'poupanca', 'carteira', 'investimento', 'outra'];
        const nomeDe = (v) => String(v || '').trim().slice(0, 120);
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
                const nome = nomeDe(c.nome);
                if (!nome) continue;
                const [existente] = await conn.query('SELECT id FROM contas WHERE user_id = ? AND nome = ? LIMIT 1', [userId, nome]);
                if (existente.length) {
                    if (c.id) contaMap[c.id] = existente[0].id;
                    continue;
                }
                const [resAcc] = await conn.query(
                    `INSERT INTO contas (user_id, nome, moeda, tipo, cor, saldo_inicial, conta_padrao, status, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, 0, ?, NOW(3), NOW(3))`,
                    [userId, nome, normalizarMoeda(c.moeda, moedaPadraoArquivo), TIPOS_CONTA.includes(c.tipo) ? c.tipo : 'corrente', corValida(c.cor) ? c.cor : '#2563eb', parseFloat(c.saldo_inicial) || 0, c.status === 'arquivada' ? 'arquivada' : 'ativa']
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

            // Categorias-pai primeiro: as subcategorias precisam do id novo do pai.
            const sortedCats = [...categoriasData].sort((a, b) => (a.parent_id ? 1 : 0) - (b.parent_id ? 1 : 0));
            for (const cat of sortedCats) {
                const nome = nomeDe(cat.nome);
                if (!nome) continue;
                if (cat.sistema && cat.chave_sistema && sysCatMap[cat.chave_sistema]) {
                    catMap[cat.id] = sysCatMap[cat.chave_sistema];
                    continue;
                }
                const parentId = cat.parent_id ? (catMap[cat.parent_id] || null) : null;
                if (cat.parent_id && !parentId) continue; // subcategoria cujo pai nao veio no arquivo
                const [existente] = await conn.query(
                    'SELECT id FROM categorias WHERE user_id = ? AND nome = ? AND parent_id <=> ? LIMIT 1',
                    [userId, nome, parentId]
                );
                if (existente.length) {
                    if (cat.id) catMap[cat.id] = existente[0].id;
                    continue;
                }
                const tipoCat = 'ambas'; // categorias nao tem tipo
                const [resCat] = await conn.query(
                    `INSERT INTO categorias (user_id, parent_id, nome, cor, tipo, limite_gasto, sistema, chave_sistema, status, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, 0, NULL, ?, NOW(3), NOW(3))`,
                    [userId, parentId, nome, corValida(cat.cor) ? cat.cor : '#3b82f6', tipoCat, parseFloat(cat.limite_gasto) > 0 ? parseFloat(cat.limite_gasto) : null, cat.status === 'arquivada' ? 'arquivada' : 'ativa']
                );
                if (cat.id) catMap[cat.id] = resCat.insertId;
                categoriasCount++;
            }

            // 3. Lancamentos (ignora os que ja existem identicos: importar 2x nao duplica)
            let lancamentosCount = 0;
            const lancMap = {}; // id no arquivo -> id gravado (para religar as duas pernas das transferencias)
            for (const l of lancamentosData) {
                if (!l.descricao || !l.valor) continue;
                const mappedContaId = contaMap[l.conta_id] || fallbackAccountId;
                if (!mappedContaId) continue;
                const mappedCatId = l.categoria_id ? (catMap[l.categoria_id] || null) : null;
                const tipo = TIPOS.includes(l.tipo) ? l.tipo : 'despesa';
                const status = STATUS.includes(l.status) ? l.status : 'pendente';
                const dataComp = normData(l.data_competencia) || toLocalYMD(hojeLocal());
                const dataPag = normData(l.data_pagamento);
                const descricao = String(l.descricao).slice(0, 190);
                let valor = parseFloat(l.valor) || 0;
                // Invariante do sistema: despesa e negativa, receita e positiva (ajuste/transferencia mantem o sinal informado).
                if (tipo === 'despesa') valor = -Math.abs(valor);
                else if (tipo === 'receita') valor = Math.abs(valor);

                const [dup] = await conn.query(
                    'SELECT id FROM lancamentos WHERE user_id = ? AND conta_id = ? AND tipo = ? AND descricao = ? AND valor = ? AND data_competencia = ? LIMIT 1',
                    [userId, mappedContaId, tipo, descricao, valor, dataComp]
                );
                if (dup.length) {
                    if (l.id) lancMap[l.id] = dup[0].id;
                    continue;
                }

                const [resLanc] = await conn.query(
                    `INSERT INTO lancamentos (user_id, conta_id, categoria_id, tipo, descricao, valor,
                                               data_competencia, data_pagamento, status, recorrente,
                                               serie_id, observacoes, cotacao, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
                    [userId, mappedContaId, mappedCatId, tipo, descricao, valor, dataComp,
                     status === 'pago' ? (dataPag || dataComp) : null, status, l.recorrente || l.e_fixo ? 1 : 0,
                     l.serie_id ? String(l.serie_id).slice(0, 36) : null, l.observacoes ? String(l.observacoes).slice(0, 500) : null, parseFloat(l.cotacao) > 0 ? parseFloat(l.cotacao) : null]
                );
                if (l.id) lancMap[l.id] = resLanc.insertId;
                lancamentosCount++;
            }

            // Transferencias: religa saida e entrada quando as duas pernas vieram no arquivo (as duas continuam andando juntas).
            for (const l of lancamentosData) {
                const meu = l.id ? lancMap[l.id] : null;
                const par = l.transferencia_par_id ? lancMap[l.transferencia_par_id] : null;
                if (l.tipo === 'transferencia' && meu && par) {
                    await conn.query('UPDATE lancamentos SET transferencia_par_id = ? WHERE id = ? AND user_id = ? AND transferencia_par_id IS NULL', [par, meu, userId]);
                }
            }

            // 4. Cartoes de credito (backups a partir de nov/2026): cartao (mescla por nome + conta), faturas pagas e compras.
            // Cartao alem do limite do plano entra arquivado (os dados ficam guardados e podem ser restaurados depois).
            const dia = (v) => Math.min(Math.max(parseInt(v, 10) || 1, 1), 31);
            const pct = (v) => Math.min(Math.max(Math.round((parseFloat(v) || 0) * 100) / 100, 0), 99.99);
            const mesFatura = (v) => (/^\d{4}-(0[1-9]|1[0-2])$/.test(String(v || '')) ? String(v) : null);
            const maxCartoes = req.ehAdmin || !req.assinatura || !req.assinatura.plano ? null : req.assinatura.plano.max_cartoes;
            const [[{ ativosCartoes }]] = await conn.query("SELECT COUNT(*) AS ativosCartoes FROM cartoes WHERE user_id = ? AND status = 'ativo'", [userId]);
            let cartoesAtivos = Number(ativosCartoes) || 0;
            const cartaoMap = {};
            for (const k of lista(payload && payload.cartoes)) {
                const nome = String(k.nome || '').trim().slice(0, 80);
                const contaId = contaMap[k.conta_id];
                if (!nome || !contaId) continue;
                const [existente] = await conn.query('SELECT id FROM cartoes WHERE user_id = ? AND conta_id = ? AND nome = ? LIMIT 1', [userId, contaId, nome]);
                if (existente.length) { cartaoMap[k.id] = existente[0].id; continue; }
                let status = k.status === 'arquivado' ? 'arquivado' : 'ativo';
                if (status === 'ativo' && maxCartoes !== null && maxCartoes !== undefined && cartoesAtivos >= maxCartoes) status = 'arquivado';
                if (status === 'ativo') cartoesAtivos++;
                const [r] = await conn.query(
                    `INSERT INTO cartoes (user_id, conta_id, nome, bandeira, limite_total, reintegro_pct, dia_fechamento, dia_vencimento, status)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [userId, contaId, nome, String(k.bandeira || '').trim().slice(0, 30), Math.max(parseFloat(k.limite_total) || 0, 0),
                     pct(k.reintegro_pct), dia(k.dia_fechamento), dia(k.dia_vencimento), status]
                );
                cartaoMap[k.id] = r.insertId;
            }
            for (const f of lista(payload && payload.cartao_faturas)) {
                const cartaoId = cartaoMap[f.cartao_id];
                const mes = mesFatura(f.mes);
                const pagoEm = normData(f.pago_em);
                if (!cartaoId || !mes || !pagoEm) continue;
                await conn.query('INSERT IGNORE INTO cartao_faturas (user_id, cartao_id, mes, total, pago_em) VALUES (?, ?, ?, ?, ?)',
                    [userId, cartaoId, mes, Math.abs(parseFloat(f.total) || 0), pagoEm]);
            }
            for (const c of lista(payload && payload.cartao_compras)) {
                const cartaoId = cartaoMap[c.cartao_id];
                const mes = mesFatura(c.fatura_mes);
                const dataCompra = normData(c.data_compra);
                const valor = Math.abs(parseFloat(c.valor) || 0);
                const descricao = String(c.descricao || '').trim().slice(0, 190);
                if (!cartaoId || !mes || !dataCompra || !(valor > 0) || !descricao) continue;
                const [dup] = await conn.query(
                    'SELECT id FROM cartao_compras WHERE user_id = ? AND cartao_id = ? AND descricao = ? AND valor = ? AND data_compra = ? AND fatura_mes = ? LIMIT 1',
                    [userId, cartaoId, descricao, valor, dataCompra, mes]
                );
                if (dup.length) continue;
                await conn.query(
                    `INSERT INTO cartao_compras (user_id, cartao_id, categoria_id, descricao, valor, reintegro_pct, reintegro_valor, data_compra, fatura_mes, lancamento_id, serie_id, recorrente)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    [userId, cartaoId, c.categoria_id ? (catMap[c.categoria_id] || null) : null, descricao, valor,
                     pct(c.reintegro_pct), Math.min(Math.max(parseFloat(c.reintegro_valor) || 0, 0), valor), dataCompra, mes,
                     c.lancamento_id ? (lancMap[c.lancamento_id] || null) : null,
                     c.serie_id ? String(c.serie_id).slice(0, 36) : null, c.recorrente ? 1 : 0]
                );
            }

            await conn.commit();
            // Depois de gravar (a consulta usa outra conexao e so enxerga o que ja foi confirmado): garante uma conta padrao.
            await Conta.garantirContaPadrao(userId);
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
    },

    dispositivos: async (req, res) => {
        const userId = req.user.id;
        const Dispositivo = require('../models/Dispositivo');
        const lista = await Dispositivo.listarPorUsuario(userId);
        res.render('configuracoes/dispositivos', {
            title: req.t('config.dispositivos.titulo'),
            menuAtivo: 'dispositivos',
            dispositivos: lista
        });
    },

    revogarDispositivo: async (req, res) => {
        const userId = req.user.id;
        const dispId = req.params.id;
        const Dispositivo = require('../models/Dispositivo');
        await Dispositivo.revogar(dispId, userId);
        req.session.flash = { tipo: 'sucesso', mensagem: req.t('flash.dispositivo_revogado') };
        res.redirect('/configuracoes/dispositivos');
    }
};

module.exports = configuracoesController;
