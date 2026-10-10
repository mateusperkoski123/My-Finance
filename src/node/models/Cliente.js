// Modulo Clientes: clientes, servicos vendidos, contratos e cuotas (cada cuota e um lancamento de receita).
const { randomUUID } = require('crypto');
const db = require('../config/db');
const regras = require('../core/clientes_regras');
const { hojeLocal, toLocalYMD } = require('../core/helpers');
const SyncExclusao = require('./SyncExclusao');

const hojeYMD = () => toLocalYMD(hojeLocal());
const LOTE = 500;
const ND = '%Y-%m-%d';

// Nome da categoria "Servicos" (a pai de todos os servicos vendidos) no idioma da conta.
const CATEGORIA_SERVICOS = { 'pt-BR': 'Serviços', 'es-PY': 'Servicios', 'en-US': 'Services' };
const COR_SERVICOS = '#0EA5E9';

const limpar = (v, max) => {
    const s = String(v === null || v === undefined ? '' : v).trim();
    return s ? s.slice(0, max) : null;
};
const likeSeguro = (q) => `%${String(q).replace(/[\\%_]/g, (c) => '\\' + c)}%`;
// Cedula sem pontos, tracos e espacos (para achar repetidas mesmo escritas de jeito diferente).
const SQL_CEDULA_NORMAL = "REPLACE(REPLACE(REPLACE(REPLACE(LOWER(cedula), '.', ''), '-', ''), ' ', ''), '/', '')";

class Cliente {
    // ---------- Categoria "Servicos" e uma subcategoria por servico ----------
    static async categoriaServicos(userId, conn = db) {
        const [[u]] = await conn.query('SELECT idioma, categoria_servicos_id FROM users WHERE id = ? LIMIT 1', [userId]);
        if (u && u.categoria_servicos_id) {
            const [r] = await conn.query('SELECT id, status, parent_id FROM categorias WHERE id = ? AND user_id = ? LIMIT 1', [u.categoria_servicos_id, userId]);
            if (r[0] && !r[0].parent_id) {
                if (r[0].status !== 'ativa') await conn.query("UPDATE categorias SET status = 'ativa' WHERE id = ?", [r[0].id]);
                return r[0].id;
            }
        }
        const nome = CATEGORIA_SERVICOS[u && u.idioma] || CATEGORIA_SERVICOS['es-PY'];
        const nomes = Object.values(CATEGORIA_SERVICOS);
        const [ex] = await conn.query(
            'SELECT id FROM categorias WHERE user_id = ? AND parent_id IS NULL AND sistema = 0 AND nome IN (?) ORDER BY id LIMIT 1',
            [userId, nomes]
        );
        let id;
        if (ex[0]) {
            id = ex[0].id;
            await conn.query("UPDATE categorias SET status = 'ativa' WHERE id = ?", [id]);
        } else {
            const [ins] = await conn.query(
                `INSERT INTO categorias (user_id, parent_id, nome, cor, tipo, sistema, status, created_at, updated_at)
                 VALUES (?, NULL, ?, ?, 'ambas', 0, 'ativa', NOW(), NOW())`,
                [userId, nome, COR_SERVICOS]
            );
            id = ins.insertId;
        }
        await conn.query('UPDATE users SET categoria_servicos_id = ? WHERE id = ?', [id, userId]);
        return id;
    }

    // Subcategoria do servico dentro de "Servicos": reaproveita uma do mesmo nome e a reativa se estiver arquivada.
    static async subcategoriaDoServico(userId, nome, conn = db) {
        const pai = await this.categoriaServicos(userId, conn);
        const [ex] = await conn.query('SELECT id FROM categorias WHERE user_id = ? AND parent_id = ? AND nome = ? LIMIT 1', [userId, pai, nome.slice(0, 120)]);
        if (ex[0]) {
            await conn.query("UPDATE categorias SET status = 'ativa' WHERE id = ?", [ex[0].id]);
            return ex[0].id;
        }
        const [ins] = await conn.query(
            `INSERT INTO categorias (user_id, parent_id, nome, cor, tipo, sistema, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'ambas', 0, 'ativa', NOW(), NOW())`,
            [userId, pai, nome.slice(0, 120), COR_SERVICOS]
        );
        return ins.insertId;
    }

    // ---------- Servicos ----------
    static async listarServicos(userId, { arquivados = false } = {}) {
        const [rows] = await db.query(
            `SELECT s.*, (SELECT COUNT(*) FROM cliente_contratos k WHERE k.servico_id = s.id AND k.status = 'ativo') AS contratos_ativos
             FROM cliente_servicos s WHERE s.user_id = ? AND s.status = ? ORDER BY s.nome`,
            [userId, arquivados ? 'arquivado' : 'ativo']
        );
        return rows;
    }

    static async buscarServico(id, userId) {
        const [rows] = await db.query('SELECT * FROM cliente_servicos WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
        return rows[0] || null;
    }

    static async buscarServicoPorNome(userId, nome, conn = db) {
        const [rows] = await conn.query('SELECT * FROM cliente_servicos WHERE user_id = ? AND nome = ? LIMIT 1', [userId, nome]);
        return rows[0] || null;
    }

    static async criarServico(userId, { nome, valor, dia }, conn = db) {
        const catId = await this.subcategoriaDoServico(userId, nome, conn);
        try {
            const [r] = await conn.query(
                'INSERT INTO cliente_servicos (user_id, nome, valor_padrao, dia_vencimento, categoria_id) VALUES (?, ?, ?, ?, ?)',
                [userId, nome, valor || 0, dia || null, catId]
            );
            return { id: r.insertId, categoriaId: catId };
        } catch (err) {
            if (err.code === 'ER_DUP_ENTRY') return { duplicado: true };
            throw err;
        }
    }

    static async atualizarServico(userId, id, { nome, valor, dia }) {
        const atual = await this.buscarServico(id, userId);
        if (!atual) return { naoEncontrado: true };
        let catId = atual.categoria_id;
        if (nome !== atual.nome) {
            const [dup] = await db.query('SELECT id FROM cliente_servicos WHERE user_id = ? AND nome = ? AND id <> ? LIMIT 1', [userId, nome, id]);
            if (dup[0]) return { duplicado: true };
            // Renomeia a subcategoria junto; se ela sumiu ou o nome ja existe em outra, aponta para a certa.
            const [sub] = catId ? await db.query('SELECT id FROM categorias WHERE id = ? AND user_id = ?', [catId, userId]) : [[]];
            const pai = await this.categoriaServicos(userId);
            const [igual] = await db.query('SELECT id FROM categorias WHERE user_id = ? AND parent_id = ? AND nome = ? AND id <> ? LIMIT 1', [userId, pai, nome, catId || 0]);
            if (sub[0] && !igual[0]) await db.query('UPDATE categorias SET nome = ? WHERE id = ?', [nome.slice(0, 120), catId]);
            else catId = await this.subcategoriaDoServico(userId, nome);
        }
        await db.query(
            'UPDATE cliente_servicos SET nome = ?, valor_padrao = ?, dia_vencimento = ?, categoria_id = ? WHERE id = ? AND user_id = ?',
            [nome, valor || 0, dia || null, catId, id, userId]
        );
        if (nome !== atual.nome) await this.refrescarDescricoes(userId, { servicoId: id });
        return { ok: true };
    }

    static async definirStatusServico(userId, id, status) {
        await db.query('UPDATE cliente_servicos SET status = ? WHERE id = ? AND user_id = ?', [status === 'arquivado' ? 'arquivado' : 'ativo', id, userId]);
    }

    // ---------- Clientes ----------
    static _filtroClientes(userId, { q, status } = {}) {
        let where = 'c.user_id = ?';
        const params = [userId];
        if (status === 'ativo' || status === 'inativo') { where += ' AND c.status = ?'; params.push(status); }
        const termo = String(q || '').trim();
        if (termo) {
            const like = likeSeguro(termo);
            where += ' AND (c.nome LIKE ? OR c.cedula LIKE ? OR c.ruc LIKE ? OR c.celular LIKE ? OR c.email LIKE ?)';
            params.push(like, like, like, like, like);
        }
        return { where, params };
    }

    static async listarClientes(userId, filtros = {}, pagina = 1, porPagina = 30) {
        const { where, params } = this._filtroClientes(userId, filtros);
        const hoje = hojeYMD();
        const [[tot]] = await db.query(`SELECT COUNT(*) AS n FROM clientes c WHERE ${where}`, params);
        const [rows] = await db.query(
            `SELECT c.*,
                (SELECT COUNT(*) FROM cliente_contratos k WHERE k.cliente_id = c.id AND k.status = 'ativo') AS contratos_ativos,
                (SELECT COUNT(*) FROM lancamentos l JOIN cliente_contratos k ON k.id = l.contrato_id
                  WHERE k.cliente_id = c.id AND l.status = 'pendente' AND l.data_competencia < ?) AS vencidas
             FROM clientes c WHERE ${where} ORDER BY c.nome ASC LIMIT ? OFFSET ?`,
            [hoje, ...params, porPagina, (Math.max(1, pagina) - 1) * porPagina]
        );
        return { clientes: rows, total: tot.n };
    }

    static async buscarCliente(id, userId) {
        const [rows] = await db.query('SELECT * FROM clientes WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
        return rows[0] || null;
    }

    static dadosCliente(d) {
        return {
            nome: limpar(d.nome, 150),
            celular: limpar(d.celular, 40),
            cedula: limpar(d.cedula, 40),
            ruc: limpar(d.ruc, 40),
            email: limpar(d.email, 190),
            observacoes: limpar(d.observacoes, 1000),
            status: d.status === 'inativo' ? 'inativo' : 'ativo'
        };
    }

    // Ja existe outro cliente com esta cedula (ignorando pontos, tracos e espacos)?
    static async cedulaExistente(userId, cedula, ignorarId = 0) {
        const c = regras.chave(cedula);
        if (!c) return null;
        const [rows] = await db.query(
            `SELECT id, nome FROM clientes WHERE user_id = ? AND id <> ? AND cedula IS NOT NULL
               AND ${SQL_CEDULA_NORMAL} = ? LIMIT 1`,
            [userId, ignorarId, c]
        );
        return rows[0] || null;
    }

    static async criarCliente(userId, d, conn = db) {
        const v = this.dadosCliente(d);
        const [r] = await conn.query(
            'INSERT INTO clientes (user_id, nome, celular, cedula, ruc, email, observacoes, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            [userId, v.nome, v.celular, v.cedula, v.ruc, v.email, v.observacoes, v.status]
        );
        return r.insertId;
    }

    static async atualizarCliente(userId, id, d) {
        const v = this.dadosCliente(d);
        const [r] = await db.query(
            'UPDATE clientes SET nome = ?, celular = ?, cedula = ?, ruc = ?, email = ?, observacoes = ? WHERE id = ? AND user_id = ?',
            [v.nome, v.celular, v.cedula, v.ruc, v.email, v.observacoes, id, userId]
        );
        if (r.affectedRows) await this.refrescarDescricoes(userId, { clienteId: id });
        return r.affectedRows > 0;
    }

    static async definirStatusCliente(userId, id, status) {
        await db.query('UPDATE clientes SET status = ? WHERE id = ? AND user_id = ?', [status === 'inativo' ? 'inativo' : 'ativo', id, userId]);
    }

    // Exclui o cliente, os contratos e as cuotas pendentes. Quem ja pagou alguma cuota nao pode ser excluido (o historico
    // de receitas fica); nesse caso a saida e marcar como inativo.
    static async excluirCliente(userId, id) {
        const c = await this.buscarCliente(id, userId);
        if (!c) return { naoEncontrado: true };
        const [[p]] = await db.query(
            `SELECT COUNT(*) AS n FROM lancamentos l JOIN cliente_contratos k ON k.id = l.contrato_id
             WHERE k.cliente_id = ? AND k.user_id = ? AND l.status = 'pago'`, [id, userId]
        );
        if (p.n > 0) return { temPagas: true };
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const onde = 'user_id = ? AND contrato_id IN (SELECT id FROM cliente_contratos WHERE cliente_id = ? AND user_id = ?)';
            await SyncExclusao.registrar('lancamentos', onde, [userId, id, userId], conn);
            await conn.query(`DELETE FROM lancamentos WHERE ${onde}`, [userId, id, userId]);
            await conn.query('DELETE FROM clientes WHERE id = ? AND user_id = ?', [id, userId]);
            await conn.commit();
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
        return { ok: true };
    }

    // Todas as cedulas ja cadastradas (normalizadas): usado na importacao para pular repetidos sem consultar linha a linha.
    static async cedulasCadastradas(userId) {
        const [rows] = await db.query('SELECT cedula FROM clientes WHERE user_id = ? AND cedula IS NOT NULL', [userId]);
        return new Set(rows.map((r) => regras.chave(r.cedula)).filter(Boolean));
    }

    // ---------- Contratos e cuotas ----------
    // Insere as cuotas (lancamentos de receita) em lotes. `pagas` = quantas das primeiras ja foram pagas.
    static async _inserirCuotas(conn, ctx, lista, pagas = 0) {
        const hoje = hojeYMD();
        const linhas = lista.map((c) => {
            const pago = c.num <= pagas;
            const dataPag = pago ? (c.data <= hoje ? c.data : hoje) : null;
            return [
                ctx.userId, ctx.serieId, ctx.contaId, ctx.categoriaId, 'receita',
                regras.descricaoDaCuota(ctx.servicoNome, ctx.clienteNome, c.num, ctx.cuotasTotal),
                ctx.valor, c.data, dataPag, pago ? 'pago' : 'pendente', 0, ctx.contratoId, c.num
            ];
        });
        for (let i = 0; i < linhas.length; i += LOTE) {
            await conn.query(
                `INSERT INTO lancamentos (user_id, serie_id, conta_id, categoria_id, tipo, descricao, valor, data_competencia,
                    data_pagamento, status, recorrente, contrato_id, cuota_num) VALUES ?`,
                [linhas.slice(i, i + LOTE)]
            );
        }
    }

    // Cria o contrato e gera as cuotas. `d` ja validado por regras.validarContrato. Retorna { id, cuotas }.
    static async criarContrato(userId, { clienteId, servicoId, contaId, dados, pagas = 0 }, connExterna = null) {
        const conn = connExterna || await db.getConnection();
        try {
            if (!connExterna) await conn.beginTransaction();
            const [[cli]] = await conn.query('SELECT id, nome FROM clientes WHERE id = ? AND user_id = ? LIMIT 1', [clienteId, userId]);
            const [[srv]] = await conn.query('SELECT id, nome, categoria_id FROM cliente_servicos WHERE id = ? AND user_id = ? LIMIT 1', [servicoId, userId]);
            const [[cta]] = await conn.query("SELECT id FROM contas WHERE id = ? AND user_id = ? AND status = 'ativa' LIMIT 1", [contaId, userId]);
            if (!cli || !srv || !cta) throw Object.assign(new Error('referencia_invalida'), { codigo: 'referencia_invalida' });
            const categoriaId = await this.subcategoriaDoServico(userId, srv.nome, conn);
            if (categoriaId !== srv.categoria_id) await conn.query('UPDATE cliente_servicos SET categoria_id = ? WHERE id = ?', [categoriaId, srv.id]);

            const serieId = randomUUID();
            const [ins] = await conn.query(
                `INSERT INTO cliente_contratos (user_id, cliente_id, servico_id, conta_id, valor, periodicidade, prazo_meses, cuotas_total,
                    dia_vencimento, data_inicio, serie_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [userId, clienteId, servicoId, contaId, dados.valor, dados.periodicidade, dados.prazoMeses, dados.cuotasTotal, dados.dia, dados.inicio, serieId]
            );
            const primeiro = regras.primeiroVencimento(dados.inicio, dados.dia);
            const lista = regras.cuotasAGerar({ primeiro, periodicidade: dados.periodicidade, dia: dados.dia, total: dados.cuotasTotal, hoje: hojeYMD() });
            await this._inserirCuotas(conn, {
                userId, serieId, contaId, categoriaId, servicoNome: srv.nome, clienteNome: cli.nome,
                valor: dados.valor, cuotasTotal: dados.cuotasTotal, contratoId: ins.insertId
            }, lista, Math.min(pagas, lista.length));
            if (!connExterna) await conn.commit();
            return { id: ins.insertId, cuotas: lista.length };
        } catch (err) {
            if (!connExterna) await conn.rollback();
            throw err;
        } finally {
            if (!connExterna) conn.release();
        }
    }

    // Contratos do cliente com todas as cuotas (agrupadas por contrato).
    static async contratosDoCliente(userId, clienteId) {
        const [contratos] = await db.query(
            `SELECT k.*, DATE_FORMAT(k.data_inicio, '${ND}') AS inicio, DATE_FORMAT(k.cancelado_em, '${ND}') AS cancelado,
                    s.nome AS servico_nome, cb.nome AS conta_nome, cb.moeda AS conta_moeda
             FROM cliente_contratos k
             JOIN cliente_servicos s ON s.id = k.servico_id
             JOIN contas cb ON cb.id = k.conta_id
             WHERE k.user_id = ? AND k.cliente_id = ? ORDER BY (k.status = 'ativo') DESC, k.id DESC`,
            [userId, clienteId]
        );
        if (!contratos.length) return [];
        const [cuotas] = await db.query(
            `SELECT l.id, l.contrato_id, l.cuota_num, l.valor, l.status, DATE_FORMAT(l.data_competencia, '${ND}') AS venc,
                    DATE_FORMAT(l.data_pagamento, '${ND}') AS pago_em
             FROM lancamentos l WHERE l.user_id = ? AND l.contrato_id IN (?) ORDER BY l.contrato_id, l.cuota_num, l.data_competencia`,
            [userId, contratos.map((c) => c.id)]
        );
        const porContrato = {};
        cuotas.forEach((c) => { (porContrato[c.contrato_id] = porContrato[c.contrato_id] || []).push(c); });
        contratos.forEach((k) => { k.cuotas = porContrato[k.id] || []; });
        return contratos;
    }

    static async buscarContrato(id, userId) {
        const [rows] = await db.query('SELECT k.* FROM cliente_contratos k WHERE k.id = ? AND k.user_id = ? LIMIT 1', [id, userId]);
        return rows[0] || null;
    }

    // Muda valor e/ou dia de vencimento do contrato. Vale para as cuotas pendentes do mes atual em diante; o que ja foi
    // pago, e as pendentes de meses anteriores, ficam como estao.
    static async atualizarContrato(userId, id, { valor, dia }) {
        const k = await this.buscarContrato(id, userId);
        if (!k || k.status !== 'ativo') return { naoEncontrado: true };
        const hoje = hojeYMD();
        const inicioMes = `${hoje.slice(0, 7)}-01`;
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const [pend] = await conn.query(
                `SELECT id, DATE_FORMAT(data_competencia, '${ND}') AS venc FROM lancamentos
                 WHERE user_id = ? AND contrato_id = ? AND status = 'pendente' AND data_competencia >= ?`,
                [userId, id, inicioMes]
            );
            if (valor !== k.valor || dia !== k.dia_vencimento) {
                for (const p of pend) {
                    const [a, m] = p.venc.split('-').map(Number);
                    const novaData = dia !== k.dia_vencimento ? regras.vencimento(a, m, dia) : p.venc;
                    await conn.query('UPDATE lancamentos SET valor = ?, data_competencia = ?, updated_at = NOW(3) WHERE id = ? AND user_id = ?', [valor, novaData, p.id, userId]);
                }
            }
            await conn.query('UPDATE cliente_contratos SET valor = ?, dia_vencimento = ? WHERE id = ? AND user_id = ?', [valor, dia, id, userId]);
            await conn.commit();
            return { ok: true, atualizadas: pend.length };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    // Cancela: apaga as cuotas futuras ainda pendentes (as pagas e as vencidas nao pagas continuam).
    static async cancelarContrato(userId, id, motivo) {
        const k = await this.buscarContrato(id, userId);
        if (!k || k.status !== 'ativo') return { naoEncontrado: true };
        const hoje = hojeYMD();
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const onde = "user_id = ? AND contrato_id = ? AND status = 'pendente' AND data_competencia > ?";
            await SyncExclusao.registrar('lancamentos', onde, [userId, id, hoje], conn);
            const [del] = await conn.query(`DELETE FROM lancamentos WHERE ${onde}`, [userId, id, hoje]);
            await conn.query(
                "UPDATE cliente_contratos SET status = 'cancelado', cancelado_em = ?, motivo_cancelamento = ? WHERE id = ? AND user_id = ?",
                [hoje, limpar(motivo, 255), id, userId]
            );
            await conn.commit();
            return { ok: true, removidas: del.affectedRows };
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    // Contratos sem prazo: mantem as cuotas geradas ate o horizonte (12 meses a frente; 24 se anual).
    static async renovarContratos(userId) {
        const hoje = hojeYMD();
        const [contratos] = await db.query(
            `SELECT k.*, s.nome AS servico_nome, s.categoria_id, c.nome AS cliente_nome,
                    (SELECT MAX(l.cuota_num) FROM lancamentos l WHERE l.contrato_id = k.id) AS ultimo_num,
                    (SELECT DATE_FORMAT(MAX(l.data_competencia), '${ND}') FROM lancamentos l WHERE l.contrato_id = k.id) AS ultima_data
             FROM cliente_contratos k
             JOIN cliente_servicos s ON s.id = k.servico_id
             JOIN clientes c ON c.id = k.cliente_id AND c.status = 'ativo'
             WHERE k.user_id = ? AND k.status = 'ativo' AND k.prazo_meses IS NULL`,
            [userId]
        );
        let geradas = 0;
        for (const k of contratos) {
            if (!k.ultimo_num) continue;
            const alvo = regras.horizonte(hoje, k.periodicidade);
            if (k.ultima_data >= alvo) continue;
            const [a, m] = k.ultima_data.split('-').map(Number);
            const passo = regras.passoMeses(k.periodicidade);
            const lista = [];
            for (let i = 1; i < 200; i++) {
                const data = regras.vencimento(a, m + i * passo, k.dia_vencimento);
                lista.push({ num: k.ultimo_num + i, data });
                if (data >= alvo) break;
            }
            const conn = await db.getConnection();
            try {
                await conn.beginTransaction();
                await this._inserirCuotas(conn, {
                    userId, serieId: k.serie_id, contaId: k.conta_id, categoriaId: k.categoria_id, servicoNome: k.servico_nome,
                    clienteNome: k.cliente_nome, valor: k.valor, cuotasTotal: null, contratoId: k.id
                }, lista, 0);
                await conn.commit();
                geradas += lista.length;
            } catch (err) {
                await conn.rollback();
                throw err;
            } finally {
                conn.release();
            }
        }
        return geradas;
    }

    // Reescreve a descricao das cuotas quando o nome do cliente ou do servico muda.
    static async refrescarDescricoes(userId, { clienteId = null, servicoId = null }) {
        const filtro = clienteId ? 'k.cliente_id = ?' : 'k.servico_id = ?';
        await db.query(
            `UPDATE lancamentos l
             JOIN cliente_contratos k ON k.id = l.contrato_id
             JOIN cliente_servicos s ON s.id = k.servico_id
             JOIN clientes c ON c.id = k.cliente_id
             SET l.descricao = LEFT(CONCAT(s.nome, ' · ', c.nome, ' · ',
                    IF(k.cuotas_total IS NULL, CAST(l.cuota_num AS CHAR), CONCAT(l.cuota_num, '/', k.cuotas_total))), 190),
                 l.updated_at = NOW(3)
             WHERE l.user_id = ? AND ${filtro}`,
            [userId, clienteId || servicoId]
        );
    }

    // ---------- Cuotas: pagar, desfazer e consultas do painel ----------
    static async pagarCuota(userId, id, dataPagamento) {
        const [r] = await db.query(
            `UPDATE lancamentos SET status = 'pago', data_pagamento = ?, updated_at = NOW(3)
             WHERE id = ? AND user_id = ? AND contrato_id IS NOT NULL`,
            [dataPagamento || hojeYMD(), id, userId]
        );
        return r.affectedRows > 0;
    }

    static async desfazerPagamento(userId, id) {
        const [r] = await db.query(
            `UPDATE lancamentos SET status = 'pendente', data_pagamento = NULL, updated_at = NOW(3)
             WHERE id = ? AND user_id = ? AND contrato_id IS NOT NULL`,
            [id, userId]
        );
        return r.affectedRows > 0;
    }

    static _baseCuotas = `FROM lancamentos l
        JOIN cliente_contratos k ON k.id = l.contrato_id
        JOIN clientes c ON c.id = k.cliente_id AND c.status = 'ativo'
        JOIN cliente_servicos s ON s.id = k.servico_id
        JOIN contas cb ON cb.id = l.conta_id AND cb.status = 'ativa'`;

    static _condEstado(estado, hoje, params) {
        if (estado === 'pagas') return " AND l.status = 'pago'";
        if (estado === 'pendentes') { params.push(hoje); return " AND l.status = 'pendente' AND l.data_competencia >= ?"; }
        if (estado === 'vencidas') { params.push(hoje); return " AND l.status = 'pendente' AND l.data_competencia < ?"; }
        return '';
    }

    // Cuotas do periodo (mes) com filtros; paginado. `dia` (YYYY-MM-DD) mostra so os vencimentos daquele dia.
    static async cuotasDoPeriodo(userId, { inicio, fim, estado, servicoId, q, dia }, pagina = 1, porPagina = 30) {
        const hoje = hojeYMD();
        const params = [userId];
        let where = 'WHERE l.user_id = ?';
        if (dia) { where += ' AND l.data_competencia = ?'; params.push(dia); }
        else { where += ' AND l.data_competencia BETWEEN ? AND ?'; params.push(inicio, fim); }
        where += this._condEstado(estado, hoje, params);
        if (servicoId) { where += ' AND k.servico_id = ?'; params.push(servicoId); }
        const termo = String(q || '').trim();
        if (termo) {
            const like = likeSeguro(termo);
            where += ' AND (c.nome LIKE ? OR c.cedula LIKE ? OR c.ruc LIKE ? OR c.celular LIKE ?)';
            params.push(like, like, like, like);
        }
        const [[tot]] = await db.query(`SELECT COUNT(*) AS n ${this._baseCuotas} ${where}`, params);
        const [rows] = await db.query(
            `SELECT l.id, l.cuota_num, l.valor, l.status, DATE_FORMAT(l.data_competencia, '${ND}') AS venc,
                    DATE_FORMAT(l.data_pagamento, '${ND}') AS pago_em, k.id AS contrato_id, k.cuotas_total,
                    c.id AS cliente_id, c.nome AS cliente_nome, c.celular, s.nome AS servico_nome, cb.moeda AS moeda
             ${this._baseCuotas} ${where}
             ORDER BY l.data_competencia ASC, c.nome ASC, l.id ASC LIMIT ? OFFSET ?`,
            [...params, porPagina, (Math.max(1, pagina) - 1) * porPagina]
        );
        return { cuotas: rows, total: tot.n };
    }

    // Totais do mes por moeda: pagas, pendentes (vencem de hoje em diante) e vencidas (nao pagas ate ontem).
    static async resumoPeriodo(userId, inicio, fim, servicoId = null) {
        const hoje = hojeYMD();
        const params = [hoje, hoje, hoje, hoje, userId, inicio, fim];
        let extra = '';
        if (servicoId) { extra = ' AND k.servico_id = ?'; params.push(servicoId); }
        const [rows] = await db.query(
            `SELECT cb.moeda,
                SUM(l.status = 'pago') AS pagas_n,
                COALESCE(SUM(CASE WHEN l.status = 'pago' THEN l.valor END), 0) AS pagas_v,
                SUM(l.status = 'pendente' AND l.data_competencia >= ?) AS pendentes_n,
                COALESCE(SUM(CASE WHEN l.status = 'pendente' AND l.data_competencia >= ? THEN l.valor END), 0) AS pendentes_v,
                SUM(l.status = 'pendente' AND l.data_competencia < ?) AS vencidas_n,
                COALESCE(SUM(CASE WHEN l.status = 'pendente' AND l.data_competencia < ? THEN l.valor END), 0) AS vencidas_v,
                COUNT(*) AS total_n, COALESCE(SUM(l.valor), 0) AS total_v
             ${this._baseCuotas}
             WHERE l.user_id = ? AND l.data_competencia BETWEEN ? AND ?${extra}
             GROUP BY cb.moeda ORDER BY total_v DESC`,
            params
        );
        return rows;
    }

    // Pendentes ja vencidas (qualquer mes) por moeda: o "devendo" acumulado.
    static async vencidoAcumulado(userId) {
        const hoje = hojeYMD();
        const [rows] = await db.query(
            `SELECT cb.moeda, COUNT(*) AS n, COUNT(DISTINCT c.id) AS clientes, COALESCE(SUM(l.valor), 0) AS valor
             ${this._baseCuotas}
             WHERE l.user_id = ? AND l.status = 'pendente' AND l.data_competencia < ?
             GROUP BY cb.moeda`,
            [userId, hoje]
        );
        return rows;
    }

    static async totaisClientes(userId) {
        const [[r]] = await db.query(
            `SELECT SUM(status = 'ativo') AS ativos, SUM(status = 'inativo') AS inativos FROM clientes WHERE user_id = ?`, [userId]
        );
        return { ativos: Number(r.ativos) || 0, inativos: Number(r.inativos) || 0 };
    }

    // Aviso de vencimento: quantos clientes vencem no dia (e quantos estao atrasados), com o total a cobrar por moeda.
    static async vencimentosDoDia(userId, dataYMD) {
        const [dia] = await db.query(
            `SELECT cb.moeda, COUNT(DISTINCT c.id) AS clientes, COUNT(*) AS cuotas, COALESCE(SUM(l.valor), 0) AS valor
             ${this._baseCuotas}
             WHERE l.user_id = ? AND l.status = 'pendente' AND l.data_competencia = ? GROUP BY cb.moeda`,
            [userId, dataYMD]
        );
        const [[atr]] = await db.query(
            `SELECT COUNT(DISTINCT c.id) AS clientes ${this._baseCuotas}
             WHERE l.user_id = ? AND l.status = 'pendente' AND l.data_competencia < ?`,
            [userId, dataYMD]
        );
        return { porMoeda: dia, atrasados: Number(atr.clientes) || 0 };
    }

    // ---------- Importacao pendente de confirmacao ----------
    static async guardarImportacao(userId, arquivo, dados) {
        // Uma por usuario; as esquecidas ha mais de um dia tambem saem.
        await db.query('DELETE FROM cliente_importacoes WHERE user_id = ? OR created_at < DATE_SUB(NOW(), INTERVAL 1 DAY)', [userId]);
        const [r] = await db.query('INSERT INTO cliente_importacoes (user_id, arquivo, dados) VALUES (?, ?, ?)', [userId, arquivo, JSON.stringify(dados)]);
        return r.insertId;
    }

    static async buscarImportacao(userId, id) {
        if (!id) return null;
        const [rows] = await db.query('SELECT arquivo, dados FROM cliente_importacoes WHERE id = ? AND user_id = ? LIMIT 1', [id, userId]);
        if (!rows[0]) return null;
        return { arquivo: rows[0].arquivo, ...JSON.parse(rows[0].dados) };
    }

    static async apagarImportacao(userId) {
        await db.query('DELETE FROM cliente_importacoes WHERE user_id = ?', [userId]);
    }

    // Usuarios com o modulo ligado (para a renovacao diaria dos contratos sem prazo).
    static async usuariosComModulo() {
        const [rows] = await db.query("SELECT id FROM users WHERE clientes_habilitado = 1 AND status = 'ativo'");
        return rows.map((r) => r.id);
    }
}

module.exports = Cliente;
