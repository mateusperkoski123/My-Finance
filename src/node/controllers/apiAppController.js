// API do app (PWA / Capacitor): login por token, sincronizacao incremental (pull) e envio de operacoes feitas offline (push).
// Regras de negocio vivem nos models (Lancamento, Categoria, Conta): aqui so validamos, deduplicamos e traduzimos o resultado.
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../config/db');
const User = require('../models/User');
const Conta = require('../models/Conta');
const Lancamento = require('../models/Lancamento');
const Categoria = require('../models/Categoria');
const Dispositivo = require('../models/Dispositivo');
const SyncExclusao = require('../models/SyncExclusao');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FORMATO_TS = '%Y-%m-%d %H:%i:%s.%f'; // datas de controle sempre como texto (sem depender de fuso)
const SOBREPOSICAO_SEG = 2; // o fim do pull volta 2 s para nao perder linhas confirmadas depois do instante delas
const HASH_FALSO = bcrypt.hashSync('senha-falsa-para-igualar-o-tempo', 10);

// Erro "esperado" de uma operacao (validacao/regra): vira estado "rejeitada" com um codigo estavel.
class ErroOp extends Error {
    constructor(codigo, { guardar = true } = {}) {
        super(codigo);
        this.codigo = codigo;
        this.guardar = guardar; // false = nao e definitivo (ex.: somente leitura), a operacao pode ser reenviada
    }
}

// ---------- validacao ----------
const texto = (v, max, { obrigatorio = false, campo = 'texto' } = {}) => {
    const s = v === undefined || v === null ? '' : String(v).trim();
    if (!s && obrigatorio) throw new ErroOp(`${campo}_obrigatorio`);
    if (s.length > max) throw new ErroOp(`${campo}_muito_longo`);
    return s || null;
};

function valorPositivo(v) {
    const n = typeof v === 'number' ? v : Number(String(v === undefined || v === null ? '' : v).trim().replace(',', '.'));
    if (!Number.isFinite(n) || n <= 0 || n >= 1e11) throw new ErroOp('valor_invalido');
    return Math.round(n * 100) / 100;
}

function dataYMD(v, { obrigatoria = false } = {}) {
    if (v === undefined || v === null || v === '') {
        if (obrigatoria) throw new ErroOp('data_invalida');
        return null;
    }
    const s = String(v);
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s);
    const d = m && new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    if (!m || d.getUTCFullYear() !== +m[1] || d.getUTCMonth() !== +m[2] - 1 || d.getUTCDate() !== +m[3] || +m[1] < 1990 || +m[1] > 2100) throw new ErroOp('data_invalida');
    return s;
}

const uuidOuNulo = (v) => {
    if (v === undefined || v === null || v === '') return null;
    if (!UUID.test(String(v))) throw new ErroOp('client_id_invalido');
    return String(v).toLowerCase();
};

// Referencia a um registro: id numerico do servidor ou client_id (UUID) criado no aparelho.
function referencia(v) {
    if (v === undefined || v === null || v === '') return null;
    const s = String(v);
    if (/^\d{1,10}$/.test(s)) return { id: Number(s) };
    if (UUID.test(s)) return { client_id: s.toLowerCase() };
    throw new ErroOp('referencia_invalida');
}

async function achar(tabela, userId, ref, campos) {
    if (!ref) return null;
    const onde = ref.id ? 'id = ?' : 'client_id = ?';
    const [rows] = await db.query(`SELECT ${campos} FROM ${tabela} WHERE user_id = ? AND ${onde} LIMIT 1`, [userId, ref.id || ref.client_id]);
    return rows[0] || null;
}

const CAMPOS_LANC = `id, client_id, conta_id, categoria_id, tipo, descricao, valor, status, recorrente, transferencia_par_id, observacoes, serie_id,
    DATE_FORMAT(data_competencia, '%Y-%m-%d') AS data_competencia, DATE_FORMAT(data_pagamento, '%Y-%m-%d') AS data_pagamento,
    DATE_FORMAT(updated_at, '${FORMATO_TS}') AS updated_at`;

async function contaDoUsuario(userId, v) {
    const ref = referencia(v);
    if (!ref) throw new ErroOp('conta_obrigatoria');
    const c = await achar('contas', userId, ref, 'id, nome, status');
    if (!c || c.status !== 'ativa') throw new ErroOp('conta_invalida');
    return c;
}

async function categoriaDoUsuario(userId, v) {
    const ref = referencia(v);
    if (!ref) return null;
    const c = await achar('categorias', userId, ref, 'id, status');
    if (!c || c.status === 'arquivada') throw new ErroOp('categoria_invalida');
    return c.id;
}

const tsLinha = async (tabela, id) => (await db.query(`SELECT DATE_FORMAT(updated_at, '${FORMATO_TS}') AS t FROM ${tabela} WHERE id = ?`, [id]))[0][0]?.t || null;

// Fixo (24 meses) e Repetir (N vezes) sao excludentes; se vierem os dois, vale o fixo (mesma regra do site).
function serieDe(dados) {
    const eFixo = ['1', 1, true, 'true'].includes(dados.e_fixo);
    const repetir = !eFixo && ['1', 1, true, 'true'].includes(dados.repetir);
    let quantidade = 1;
    if (repetir) {
        quantidade = Number(dados.quantidade_repeticoes);
        if (!Number.isInteger(quantidade) || quantidade < 2 || quantidade > 60) throw new ErroOp('quantidade_invalida');
    }
    return { eFixo, repetir, quantidade };
}

// ---------- operacoes (push) ----------
const OPERACOES = {
    // Receita ou despesa: unica, fixa (24 meses) ou repetida N vezes. O servidor gera as parcelas com a mesma regra do site.
    'lancamentos.create': async (userId, dados) => {
        const serie = serieDe(dados);
        const tipo = String(dados.tipo || '');
        if (!['receita', 'despesa'].includes(tipo)) throw new ErroOp('tipo_invalido');
        const status = dados.status === undefined ? 'pago' : String(dados.status);
        if (!['pago', 'pendente'].includes(status)) throw new ErroOp('status_invalido');
        const conta = await contaDoUsuario(userId, dados.conta_id);
        const categoriaId = await categoriaDoUsuario(userId, dados.categoria_id);
        const clientId = uuidOuNulo(dados.client_id);
        const novo = {
            conta_id: conta.id, categoria_id: categoriaId, tipo, status,
            descricao: texto(dados.descricao, 190, { obrigatorio: true, campo: 'descricao' }),
            valor: valorPositivo(dados.valor),
            data_competencia: dataYMD(dados.data_competencia, { obrigatoria: true }),
            data_pagamento: dataYMD(dados.data_pagamento),
            observacoes: texto(dados.observacoes, 500, { campo: 'observacoes' }),
            client_id: clientId,
            e_fixo: serie.eFixo ? 1 : 0,
            repetir: serie.repetir ? 1 : 0,
            quantidade_repeticoes: serie.quantidade
        };
        if (clientId) {
            const ja = await achar('lancamentos', userId, { client_id: clientId }, 'id');
            if (ja) return { id_servidor: ja.id, updated_at: await tsLinha('lancamentos', ja.id) };
        }
        const [id] = await Lancamento.criar(userId, novo);
        return { id_servidor: id, updated_at: await tsLinha('lancamentos', id) };
    },

    // Editar descricao, valor, categoria, data e observacoes de um lancamento avulso. Exige a versao que o app tinha.
    'lancamentos.update': async (userId, dados) => {
        const ref = referencia(dados.id || dados.client_id);
        const atual = await achar('lancamentos', userId, ref, CAMPOS_LANC);
        if (!atual) throw new ErroOp('nao_encontrado');
        if (['transferencia', 'ajuste'].includes(atual.tipo)) throw new ErroOp('tipo_nao_editavel');
        if (!dados.base_updated_at) throw new ErroOp('versao_base_obrigatoria');
        if (String(dados.base_updated_at) !== atual.updated_at) return { estado: 'conflito', id_servidor: atual.id, servidor: atual };
        const tem = (k) => dados[k] !== undefined;
        const categoria = tem('categoria_id') ? await categoriaDoUsuario(userId, dados.categoria_id) : atual.categoria_id;
        await Lancamento.atualizar(atual.id, userId, {
            conta_id: atual.conta_id,
            categoria_id: categoria,
            descricao: tem('descricao') ? texto(dados.descricao, 190, { obrigatorio: true, campo: 'descricao' }) : atual.descricao,
            valor: tem('valor') ? valorPositivo(dados.valor) : Math.abs(Number(atual.valor)),
            data_competencia: tem('data_competencia') ? dataYMD(dados.data_competencia, { obrigatoria: true }) : atual.data_competencia,
            status: atual.status,
            data_pagamento: atual.data_pagamento,
            recorrente: atual.recorrente,
            observacoes: tem('observacoes') ? texto(dados.observacoes, 500, { campo: 'observacoes' }) : atual.observacoes
        }, 'apenas_esta');
        return { id_servidor: atual.id, updated_at: await tsLinha('lancamentos', atual.id) };
    },

    // Marcar como pago/recebido (ou voltar a pendente). Repetir e inofensivo.
    'lancamentos.pagar': async (userId, dados) => {
        const atual = await achar('lancamentos', userId, referencia(dados.id || dados.client_id), CAMPOS_LANC);
        if (!atual) throw new ErroOp('nao_encontrado');
        const status = dados.status === undefined ? 'pago' : String(dados.status);
        if (!['pago', 'pendente'].includes(status)) throw new ErroOp('status_invalido');
        if (atual.status !== status) await Lancamento.marcarComoPago(atual.id, userId, status, dataYMD(dados.data_pagamento));
        return { id_servidor: atual.id, updated_at: await tsLinha('lancamentos', atual.id) };
    },

    // Transferencia imediata entre duas contas (as duas pernas, de uma vez).
    'lancamentos.transferir': async (userId, dados) => {
        const origem = await contaDoUsuario(userId, dados.conta_origem_id);
        const destino = await contaDoUsuario(userId, dados.conta_destino_id);
        if (origem.id === destino.id) throw new ErroOp('contas_iguais');
        const clientId = uuidOuNulo(dados.client_id);
        if (clientId) {
            const ja = await achar('lancamentos', userId, { client_id: clientId }, 'id');
            if (ja) return { id_servidor: ja.id, updated_at: await tsLinha('lancamentos', ja.id) };
        }
        await Lancamento.criarTransferencia({
            userId, origem, destino, valor: valorPositivo(dados.valor),
            data: dataYMD(dados.data, { obrigatoria: true }),
            descricao: texto(dados.descricao, 100, { campo: 'descricao' }) || '',
            clientId
        });
        const perna = clientId ? await achar('lancamentos', userId, { client_id: clientId }, 'id') : null;
        return { id_servidor: perna ? perna.id : null, updated_at: perna ? await tsLinha('lancamentos', perna.id) : null };
    },

    // Transferencia agendada: as pernas ficam pendentes e o saldo so move ao marcar como pago (igual ao site).
    'lancamentos.agendar_transferencia': async (userId, dados) => {
        const origem = await contaDoUsuario(userId, dados.conta_origem_id);
        const destino = await contaDoUsuario(userId, dados.conta_destino_id);
        if (origem.id === destino.id) throw new ErroOp('contas_iguais');
        const serie = serieDe(dados);
        const clientId = uuidOuNulo(dados.client_id);
        if (clientId) {
            const ja = await achar('lancamentos', userId, { client_id: clientId }, 'id');
            if (ja) return { id_servidor: ja.id, updated_at: await tsLinha('lancamentos', ja.id) };
        }
        await Lancamento.criarTransferencia({
            userId, origem, destino, valor: valorPositivo(dados.valor), data: dataYMD(dados.data, { obrigatoria: true }),
            descricao: texto(dados.descricao, 100, { campo: 'descricao' }) || '',
            agendada: true, eFixo: serie.eFixo, quantidade: serie.eFixo ? 24 : serie.quantidade, clientId
        });
        const perna = clientId ? await achar('lancamentos', userId, { client_id: clientId }, 'id') : null;
        return { id_servidor: perna ? perna.id : null, updated_at: perna ? await tsLinha('lancamentos', perna.id) : null };
    },

    'categorias.create': async (userId, dados) => {
        const clientId = uuidOuNulo(dados.client_id);
        if (clientId) {
            const ja = await achar('categorias', userId, { client_id: clientId }, 'id');
            if (ja) return { id_servidor: ja.id, updated_at: await tsLinha('categorias', ja.id) };
        }
        const cor = dados.cor === undefined || dados.cor === null || dados.cor === '' ? null : String(dados.cor);
        if (cor && !/^#[0-9a-fA-F]{6}$/.test(cor)) throw new ErroOp('cor_invalida');
        const pai = dados.parent_id ? await categoriaDoUsuario(userId, dados.parent_id) : null;
        const limite = dados.limite_gasto === undefined || dados.limite_gasto === null || dados.limite_gasto === '' ? null : valorPositivo(dados.limite_gasto);
        const id = await Categoria.criar(userId, { parent_id: pai, nome: texto(dados.nome, 100, { obrigatorio: true, campo: 'nome' }), cor, limite_gasto: limite, client_id: clientId });
        return { id_servidor: id, updated_at: await tsLinha('categorias', id) };
    }
};

class ApiAppController {
    // POST /api/app/login  { email, senha, nome_dispositivo?, plataforma? }
    static async login(req, res) {
        try {
            const { email, senha, nome_dispositivo, plataforma } = req.body || {};
            if (typeof email !== 'string' || typeof senha !== 'string' || !email.trim() || !senha) {
                return res.status(400).json({ sucesso: false, erro: 'dados_incompletos' });
            }
            const user = await User.findByEmail(email.trim());
            const infoLog = { email: email.trim(), ip: req.ip, userAgent: req.get('User-Agent') };
            // compara sempre (hash falso se o usuario nao existe) para nao revelar pelo tempo se a conta existe
            const senhaOk = await bcrypt.compare(senha, user && user.senha_hash ? user.senha_hash : HASH_FALSO);
            if (!user || !senhaOk) {
                await User.registrarLogin(user ? user.id : null, { ...infoLog, sucesso: false }).catch(() => {});
                return res.status(401).json({ sucesso: false, erro: 'credenciais_invalidas' });
            }
            if (user.status && user.status !== 'ativo') {
                await User.registrarLogin(user.id, { ...infoLog, sucesso: false }).catch(() => {});
                return res.status(403).json({ sucesso: false, erro: 'conta_inativa' });
            }
            await User.registrarLogin(user.id, infoLog).catch(() => {});
            const emitido = await ApiAppController._emitirToken(user.id, nome_dispositivo, plataforma);
            return res.json({ sucesso: true, token: emitido, user: { id: user.id, nome: user.nome, email: user.email, idioma: user.idioma, moeda: user.moeda, tema: user.tema } });
        } catch (err) {
            console.error('Erro no login do app:', err.message);
            return res.status(500).json({ sucesso: false, erro: 'erro_interno' });
        }
    }

    static async _emitirToken(userId, nome, plataforma) {
        const token = crypto.randomBytes(32).toString('hex');
        await Dispositivo.criar({
            userId, token,
            nome: nome ? String(nome).trim().slice(0, 100) : 'Aplicativo',
            plataforma: plataforma ? String(plataforma).trim().slice(0, 50) : 'web_pwa'
        });
        return token;
    }

    // POST /app/dispositivo (sessao do site + CSRF): o navegador logado recebe o token do proprio aparelho.
    static async registrarDispositivoWeb(req, res) {
        try {
            const ua = String(req.get('User-Agent') || '');
            const nome = (/iPhone|iPad/.test(ua) ? 'iPhone/iPad' : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : 'Navegador') + ' (web)';
            const token = await ApiAppController._emitirToken(req.user.id, nome, 'web_pwa');
            return res.json({ sucesso: true, token, user_id: req.user.id });
        } catch (err) {
            console.error('Erro ao registrar dispositivo:', err.message);
            return res.status(500).json({ sucesso: false, erro: 'erro_interno' });
        }
    }

    // POST /api/app/logout
    static async logout(req, res) {
        try {
            if (req.dispositivo && req.user) await Dispositivo.revogar(req.dispositivo.id, req.user.id);
            return res.json({ sucesso: true });
        } catch (err) {
            console.error('Erro no logout do app:', err.message);
            return res.status(500).json({ sucesso: false, erro: 'erro_interno' });
        }
    }

    // GET /api/app/sync?since=<cursor>
    // Cursor proprio por tabela (atualizado_em + id): uma tabela volumosa nunca faz outra "pular" registros.
    // `mais: true` = ha mais paginas, o app deve pedir de novo ate vir false.
    static async sync(req, res) {
        try {
            const userId = req.user.id;
            const lote = Math.min(Math.max(parseInt(process.env.SYNC_LOTE_MAX, 10) || 500, 10), 2000);
            let cur = null;
            if (req.query.since) {
                try { cur = JSON.parse(Buffer.from(String(req.query.since), 'base64').toString('utf8')); } catch (e) { cur = null; }
                if (!cur || typeof cur !== 'object') return res.status(400).json({ sucesso: false, erro: 'cursor_invalido' });
            }
            const completo = !cur;
            const hoje = require('../core/helpers').hojeLocal();
            // Primeira carga: lancamentos de 12 meses atras ate 24 meses a frente (cobre as series fixas).
            const janela = completo
                ? [`${hoje.getFullYear() - 1}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`, `${hoje.getFullYear() + 2}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`]
                : (Array.isArray(cur.w) && cur.w.length === 2 ? [dataYMD(cur.w[0]), dataYMD(cur.w[1])] : null);

            const ponto = (k) => (cur && cur[k] && typeof cur[k].t === 'string' ? { t: cur[k].t, id: Number(cur[k].id) || 0 } : { t: null, id: 0 });
            const pagina = async (tabela, campos, k, extraOnde = '', extraParams = []) => {
                const p = ponto(k);
                let sql = `SELECT ${campos}, DATE_FORMAT(updated_at, '${FORMATO_TS}') AS updated_at FROM ${tabela} WHERE user_id = ?`;
                const params = [userId];
                if (p.t) { sql += ' AND (updated_at > ? OR (updated_at = ? AND id > ?))'; params.push(p.t, p.t, p.id); }
                sql += extraOnde;
                params.push(...extraParams);
                sql += ' ORDER BY updated_at ASC, id ASC LIMIT ?';
                params.push(lote);
                const [rows] = await db.query(sql, params);
                const cheia = rows.length === lote;
                let proximo = p;
                if (rows.length) proximo = { t: rows[rows.length - 1].updated_at, id: rows[rows.length - 1].id };
                if (!cheia) {
                    // Leu tudo o que existia: o proximo pull recomeca alguns segundos ANTES de agora (linhas confirmadas depois
                    // do instante delas); o app trata repeticoes como atualizacao e a sobreposicao some no pull seguinte.
                    const [[r]] = await db.query(`SELECT DATE_FORMAT(DATE_SUB(NOW(3), INTERVAL ${SOBREPOSICAO_SEG} SECOND), '${FORMATO_TS}') AS t`);
                    proximo = { t: r.t, id: 0 };
                }
                return { rows, cheia, proximo };
            };

            const contas = await pagina('contas', 'id, client_id, nome, tipo, cor, saldo_inicial, conta_padrao, status', 'c');
            const categorias = await pagina('categorias', 'id, client_id, parent_id, nome, cor, tipo, limite_gasto, sistema, chave_sistema, status', 'k');
            const lanc = await pagina('lancamentos',
                `id, client_id, conta_id, categoria_id, tipo, descricao, valor, status, recorrente, transferencia_par_id, observacoes, serie_id,
                 DATE_FORMAT(data_competencia, '%Y-%m-%d') AS data_competencia, DATE_FORMAT(data_pagamento, '%Y-%m-%d') AS data_pagamento`,
                'l', janela && !(cur && cur.l && cur.l.fim) ? ' AND data_competencia BETWEEN ? AND ?' : '', janela && !(cur && cur.l && cur.l.fim) ? janela : []);

            let ultimaExclusao;
            let exclusoes = [];
            if (completo) {
                const [[m]] = await db.query('SELECT COALESCE(MAX(id), 0) AS m FROM sync_exclusoes WHERE user_id = ?', [userId]);
                ultimaExclusao = Number(m.m);
            } else {
                ultimaExclusao = Number(cur.x) || 0;
                exclusoes = await SyncExclusao.desde(userId, ultimaExclusao, lote);
                if (exclusoes.length) ultimaExclusao = exclusoes[exclusoes.length - 1].id;
            }

            const mais = contas.cheia || categorias.cheia || lanc.cheia || exclusoes.length === lote;
            // A janela da primeira carga vale ate acabarem os lancamentos; depois disso o pull incremental traz tudo o que mudar.
            const lancEncerrado = Boolean(janela) && !lanc.cheia;
            const novoCursor = {
                c: contas.proximo, k: categorias.proximo,
                l: lancEncerrado ? { ...lanc.proximo, fim: 1 } : lanc.proximo,
                x: ultimaExclusao,
                w: janela && !lancEncerrado ? janela : null
            };

            return res.json({
                sucesso: true,
                completo,
                mais,
                cursor: Buffer.from(JSON.stringify(novoCursor)).toString('base64'),
                dados_referencia: {
                    idioma: req.user.idioma || 'pt-BR',
                    moeda: req.user.moeda || 'PYG',
                    tema: req.user.tema || 'escuro',
                    fuso: process.env.IA_TIMEZONE || 'America/Asuncion',
                    assinatura: {
                        status_efetivo: req.statusEfetivo,
                        dias_restantes: req.assinatura ? req.assinatura.dias_restantes : null,
                        somente_leitura: req.somenteLeitura
                    },
                    app_versao_minima: process.env.APP_VERSAO_MINIMA || '1.0.0'
                },
                contas: contas.rows,
                categorias: categorias.rows,
                lancamentos: lanc.rows,
                exclusoes: exclusoes.map((e) => ({ tabela: e.tabela, id: e.registro_id, client_id: e.client_id }))
            });
        } catch (err) {
            if (err instanceof ErroOp) return res.status(400).json({ sucesso: false, erro: err.codigo });
            console.error('Erro no sync do app:', err.message);
            return res.status(500).json({ sucesso: false, erro: 'erro_interno' });
        }
    }

    // POST /api/app/sync/push  { operacoes: [{ op_id, tabela, acao, dados }] }
    // Cada operacao: estado "ok", "conflito" (o servidor mudou depois) ou "rejeitada" (com um codigo). Repetir a mesma op_id nao duplica.
    static async push(req, res) {
        const lista = Array.isArray(req.body) ? req.body : (req.body && req.body.operacoes);
        const max = Math.min(Math.max(parseInt(process.env.SYNC_PUSH_MAX, 10) || 100, 1), 500);
        if (!Array.isArray(lista)) return res.status(400).json({ sucesso: false, erro: 'formato_invalido' });
        if (lista.length > max) return res.status(413).json({ sucesso: false, erro: 'lote_grande_demais', max });

        const resultados = [];
        for (const op of lista) resultados.push(await ApiAppController._processar(req, op));
        return res.json({ sucesso: true, resultados });
    }

    static async _processar(req, op) {
        const userId = req.user.id;
        const opId = op && typeof op === 'object' ? String(op.op_id || op.client_id || '') : '';
        const base = { op_id: opId, client_id: opId };
        if (!UUID.test(opId)) return { ...base, estado: 'rejeitada', sucesso: false, erro: 'op_id_invalido' };
        const chave = `${String(op.tabela)}.${String(op.acao)}`;
        const executar = OPERACOES[chave];
        if (!executar) return { ...base, estado: 'rejeitada', sucesso: false, erro: 'operacao_nao_suportada' };

        const idLower = opId.toLowerCase();
        try {
            // Reserva a op_id (unica por usuario): duas requisicoes iguais ao mesmo tempo nao aplicam duas vezes.
            const [ins] = await db.query('INSERT IGNORE INTO sync_operacoes (user_id, op_id, resultado, aplicada_em) VALUES (?, ?, NULL, NOW(3))', [userId, idLower]);
            if (!ins.affectedRows) {
                const [[ja]] = await db.query('SELECT resultado, TIMESTAMPDIFF(SECOND, aplicada_em, NOW(3)) AS idade FROM sync_operacoes WHERE user_id = ? AND op_id = ?', [userId, idLower]);
                if (ja && ja.resultado) {
                    let anterior = ja.resultado;
                    try { anterior = typeof anterior === 'string' ? JSON.parse(anterior) : anterior; } catch (e) { anterior = {}; }
                    return { ...base, ...anterior, repetida: true };
                }
                if (ja && ja.idade < 120) return { ...base, estado: 'ocupada', sucesso: false, erro: 'em_processamento' };
                // reserva antiga sem resultado (queda do servidor no meio): assume e reaplica
                await db.query('UPDATE sync_operacoes SET aplicada_em = NOW(3) WHERE user_id = ? AND op_id = ? AND resultado IS NULL', [userId, idLower]);
            }

            let resultado;
            let definitivo = true;
            try {
                if (req.somenteLeitura) throw new ErroOp('somente_leitura', { guardar: false });
                const dados = op.dados && typeof op.dados === 'object' && !Array.isArray(op.dados) ? { ...op.dados } : {};
                if (op.base_updated_at !== undefined && dados.base_updated_at === undefined) dados.base_updated_at = op.base_updated_at;
                if (chave.endsWith('.create') || chave === 'lancamentos.transferir' || chave === 'lancamentos.agendar_transferencia') dados.client_id = dados.client_id || idLower;
                const r = await executar(userId, dados);
                resultado = { estado: 'ok', sucesso: true, ...r };
                if (r.estado) { resultado = { ...r, sucesso: false }; }
            } catch (err) {
                if (!(err instanceof ErroOp)) throw err;
                resultado = { estado: 'rejeitada', sucesso: false, erro: err.codigo };
                definitivo = err.guardar;
            }

            if (definitivo) {
                await db.query('UPDATE sync_operacoes SET resultado = ?, aplicada_em = NOW(3) WHERE user_id = ? AND op_id = ?', [JSON.stringify(resultado), userId, idLower]);
            } else {
                await db.query('DELETE FROM sync_operacoes WHERE user_id = ? AND op_id = ? AND resultado IS NULL', [userId, idLower]);
            }
            return { ...base, ...resultado };
        } catch (err) {
            // Falha inesperada (banco, etc.): libera a reserva para o app tentar de novo e nao vaza detalhes.
            console.error(`Falha ao processar ${chave}:`, err.message);
            await db.query('DELETE FROM sync_operacoes WHERE user_id = ? AND op_id = ? AND resultado IS NULL', [userId, idLower]).catch(() => {});
            return { ...base, estado: 'erro', sucesso: false, erro: 'erro_interno' };
        }
    }
}

module.exports = ApiAppController;
