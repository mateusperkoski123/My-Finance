const db = require('../config/db');
const { randomUUID: uuidv4 } = require('crypto');
const { toLocalYMD, formatDate, addMonthsYMD } = require('../core/helpers');

// Lancamento marcado como fixo (receita/despesa recorrente) gera 24 meses, a atual incluida.
const MESES_FIXO = 24;

const cleanParam = (v) => (v && v !== 'null' && v !== 'undefined' && v !== '' && v !== 'sem_agrupamento') ? String(v).trim() : null;

class Lancamento {
    static async buscarPorId(id, userId) {
        const [rows] = await db.query(
            `SELECT l.*, c.nome as categoria_nome, c.parent_id as categoria_parent_id, cb.nome as conta_nome 
             FROM lancamentos l
             LEFT JOIN categorias c ON l.categoria_id = c.id
             LEFT JOIN contas cb ON l.conta_id = cb.id
             WHERE l.id = ? AND l.user_id = ? LIMIT 1`,
            [id, userId]
        );
        return rows[0] || null;
    }

    static async buscarFiltrados(userId, periodo, filtros = {}, ordenacao = 'data', pagina = 1, porPagina = 30, agrupamento = 'sem_agrupamento') {
        let where = 'WHERE l.user_id = ? AND l.data_competencia BETWEEN ? AND ?';
        const params = [userId, periodo.inicio, periodo.fim];

        const fTipo = cleanParam(filtros.tipo);
        const fSub = cleanParam(filtros.subcategoria_id);
        const fCat = cleanParam(filtros.categoria_id);
        const fBusca = cleanParam(filtros.busca);

        if (fTipo && fTipo !== 'todas') {
            where += ' AND l.tipo = ?';
            params.push((fTipo === 'despesas' || fTipo === 'despesa') ? 'despesa' : 'receita');
        }

        if (fSub) {
            where += ' AND l.categoria_id = ?';
            params.push(fSub);
        } else if (fCat) {
            where += ' AND (l.categoria_id = ? OR c.parent_id = ?)';
            params.push(fCat, fCat);
        }

        if (fBusca) {
            where += ' AND (l.descricao LIKE ? OR c.nome LIKE ?)';
            const term = `%${fBusca}%`;
            params.push(term, term);
        }

        // Count total
        const [countRes] = await db.query(
            `SELECT COUNT(*) as total 
             FROM lancamentos l
             LEFT JOIN categorias c ON l.categoria_id = c.id
             ${where}`,
            params
        );
        const totalRegistros = countRes[0].total || 0;
        const [somaRes] = await db.query(
            `SELECT COALESCE(SUM(ABS(l.valor)), 0) AS soma
             FROM lancamentos l
             LEFT JOIN categorias c ON l.categoria_id = c.id
             ${where}`,
            params
        );
        const somaFiltrada = parseFloat(somaRes[0].soma) || 0;
        let effectivePorPagina = porPagina;
        let effectiveOffset = (pagina - 1) * porPagina;

        if (agrupamento && agrupamento !== 'sem_agrupamento') {
            effectivePorPagina = 1000;
            effectiveOffset = 0;
        }

        const totalPaginas = Math.ceil(totalRegistros / effectivePorPagina) || 1;

        let orderBy = 'l.data_competencia DESC, l.id DESC';
        if (ordenacao === 'valor' || ordenacao === 'preco') {
            orderBy = 'ABS(l.valor) DESC, l.data_competencia DESC';
        } else if (ordenacao === 'vencimento') {
            orderBy = 'l.data_competencia ASC, l.id ASC';
        } else if (ordenacao === 'criacao') {
            orderBy = 'l.created_at DESC, l.id DESC';
        }

        const [rows] = await db.query(
            `SELECT l.*, 
                    IF(c.parent_id IS NULL, c.nome, (SELECT p.nome FROM categorias p WHERE p.id = c.parent_id)) as categoria_nome,
                    IF(c.parent_id IS NULL, c.cor, (SELECT p.cor FROM categorias p WHERE p.id = c.parent_id)) as categoria_cor,
                    IF(c.parent_id IS NOT NULL, c.nome, NULL) as subcategoria_nome,
                    cb.nome as conta_nome, cb.cor as conta_cor
             FROM lancamentos l
             LEFT JOIN categorias c ON l.categoria_id = c.id
             LEFT JOIN contas cb ON l.conta_id = cb.id
             ${where}
             ORDER BY ${orderBy}
             LIMIT ? OFFSET ?`,
            [...params, effectivePorPagina, effectiveOffset]
        );

        // Process grouping if requested
        let grupos = null;
        if (agrupamento && agrupamento !== 'sem_agrupamento') {
            grupos = [];
            const mapaGrupos = {};

            rows.forEach(l => {
                let key = 'Outros';
                if (agrupamento === 'categoria') {
                    key = l.categoria_nome || 'Sem categoria';
                } else if (agrupamento === 'subcategoria') {
                    key = l.subcategoria_nome ? `${l.categoria_nome || 'Sem Categoria'} / ${l.subcategoria_nome}` : (l.categoria_nome || 'Sem categoria');
                } else if (agrupamento === 'vencimento' || agrupamento === 'criacao') {
                    const rawDate = (agrupamento === 'criacao' && l.created_at) ? l.created_at : l.data_competencia;
                    key = rawDate ? formatDate(rawDate, 'DD/MM/YYYY') : 'Sem Data';
                } else if (agrupamento === 'status') {
                    key = l.status === 'pago' ? 'Pagos' : 'Pendentes';
                }

                if (!mapaGrupos[key]) {
                    mapaGrupos[key] = {
                        key,
                        count: 0,
                        pagoCount: 0,
                        pendenteCount: 0,
                        totalReceitas: 0,
                        totalDespesas: 0,
                        lancamentos: []
                    };
                    grupos.push(mapaGrupos[key]);
                }

                const g = mapaGrupos[key];
                g.count++;
                if (l.status === 'pago') {
                    g.pagoCount++;
                } else {
                    g.pendenteCount++;
                }

                const val = parseFloat(l.valor) || 0;
                if (l.tipo === 'receita') {
                    g.totalReceitas += Math.abs(val);
                } else if (l.tipo === 'despesa') {
                    g.totalDespesas += Math.abs(val);
                }
                g.lancamentos.push(l);
            });
        }

        return {
            lancamentos: rows,
            grupos,
            totalRegistros,
            somaFiltrada,
            totalPaginas,
            paginaAtual: pagina
        };
    }

    // Garante que conta e categoria informadas pertencem ao usuario (evita mexer no saldo de terceiros).
    static async validarPropriedade(userId, contaId, categoriaId) {
        if (contaId) {
            const [c] = await db.query('SELECT id FROM contas WHERE id = ? AND user_id = ? LIMIT 1', [contaId, userId]);
            if (!c.length) { const e = new Error('conta_invalida'); e.codigo = 'conta_invalida'; throw e; }
        }
        if (categoriaId) {
            const [c] = await db.query('SELECT id FROM categorias WHERE id = ? AND user_id = ? LIMIT 1', [categoriaId, userId]);
            if (!c.length) { const e = new Error('categoria_invalida'); e.codigo = 'categoria_invalida'; throw e; }
        }
    }

    static async criar(userId, data) {
        await this.validarPropriedade(userId, data.conta_id, data.subcategoria_id || data.categoria_id);
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();

            const eFixo = data.e_fixo === '1' || data.e_fixo === 1 || data.e_fixo === true || data.recorrente === 1;
            // Fixo e Repetir sao excludentes (a tela ja impede); se vierem os dois, vale o fixo.
            const eRepetir = !eFixo && (data.repetir === '1' || data.repetir === 1 || data.repetir === true);
            // Repetir: cria a quantidade pedida (a atual + as proximas). Fixo: 24 meses (a atual + 23).
            const qtdPedida = eRepetir ? Math.min(Math.max(parseInt(data.quantidade_repeticoes, 10) || 1, 1), 60) : 1;
            const totalOcorrencias = eFixo ? MESES_FIXO : qtdPedida;
            const serieId = totalOcorrencias > 1 ? uuidv4() : null;

            const dataBase = data.data_competencia || toLocalYMD(new Date());
            const pagDate = data.status === 'pago' ? (data.data_pagamento || dataBase) : null;
            const categoriaFinalId = data.subcategoria_id || data.categoria_id || null;
            const rawValor = Math.abs(parseFloat(data.valor) || 0);
            const finalValor = data.tipo === 'despesa' ? -rawValor : rawValor;

            const lancamentosCriados = [];

            for (let i = 0; i < totalOcorrencias; i++) {
                const dateCompStr = addMonthsYMD(dataBase, i);
                // So a primeira ocorrencia herda o status escolhido; as futuras ficam pendentes (a pagar/receber).
                const statusOcorrencia = i === 0 ? (data.status || 'pendente') : 'pendente';
                const datePagStr = i === 0 && pagDate ? pagDate : null;

                const [res] = await conn.query(
                    `INSERT INTO lancamentos 
                     (user_id, serie_id, conta_id, categoria_id, tipo, descricao, valor, 
                      data_competencia, data_pagamento, status, recorrente, observacoes, created_at, updated_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(), NOW())`,
                    [
                        userId,
                        serieId,
                        data.conta_id,
                        categoriaFinalId,
                        data.tipo || 'despesa',
                        data.descricao,
                        finalValor,
                        dateCompStr,
                        datePagStr,
                        statusOcorrencia,
                        eFixo ? 1 : 0,
                        data.observacoes || null
                    ]
                );
                lancamentosCriados.push(res.insertId);
            }

            await conn.commit();
            return lancamentosCriados;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    static async atualizar(id, userId, data, escopoSerie = 'apenas_esta') {
        const itemAtual = await this.buscarPorId(id, userId);
        if (!itemAtual) return false;
        await this.validarPropriedade(userId, data.conta_id, data.subcategoria_id || data.categoria_id);

        const statusStr = data.status === 'pago' || data.status === 1 ? 'pago' : 'pendente';
        const dataPagStr = statusStr === 'pago' ? (data.data_pagamento || itemAtual.data_pagamento || data.data_competencia || itemAtual.data_competencia) : null;
        const categoriaFinalId = data.subcategoria_id || data.categoria_id || itemAtual.categoria_id;
        const rawValor = Math.abs(parseFloat(data.valor) || Math.abs(parseFloat(itemAtual.valor)));
        const finalValor = itemAtual.tipo === 'despesa' ? -rawValor : rawValor;

        if (itemAtual.serie_id && escopoSerie !== 'apenas_esta') {
            if (escopoSerie === 'esta_e_proximas') {
                await db.query(
                    `UPDATE lancamentos SET 
                     conta_id = ?, categoria_id = ?, descricao = ?, 
                     valor = ?, recorrente = ?, observacoes = ?, 
                     updated_at = NOW() 
                     WHERE user_id = ? AND serie_id = ? AND data_competencia >= ?`,
                    [
                        data.conta_id || itemAtual.conta_id, categoriaFinalId, data.descricao || itemAtual.descricao,
                        finalValor, data.e_fixo || data.recorrente ? 1 : 0, data.observacoes || null,
                        userId, itemAtual.serie_id, itemAtual.data_competencia
                    ]
                );
            } else if (escopoSerie === 'toda_serie') {
                await db.query(
                    `UPDATE lancamentos SET 
                     conta_id = ?, categoria_id = ?, descricao = ?, 
                     valor = ?, recorrente = ?, observacoes = ?, 
                     updated_at = NOW() 
                     WHERE user_id = ? AND serie_id = ?`,
                    [
                        data.conta_id || itemAtual.conta_id, categoriaFinalId, data.descricao || itemAtual.descricao,
                        finalValor, data.e_fixo || data.recorrente ? 1 : 0, data.observacoes || null,
                        userId, itemAtual.serie_id
                    ]
                );
            }
            // Status/data de pagamento valem so para a ocorrencia editada (nao marca a serie inteira como paga).
            await db.query('UPDATE lancamentos SET status = ?, data_pagamento = ?, updated_at = NOW() WHERE id = ? AND user_id = ?', [statusStr, dataPagStr, id, userId]);
        } else {
            await db.query(
                `UPDATE lancamentos SET 
                 conta_id = ?, categoria_id = ?, descricao = ?, 
                 valor = ?, data_competencia = ?, data_pagamento = ?, 
                 status = ?, recorrente = ?, observacoes = ?, updated_at = NOW() 
                 WHERE id = ? AND user_id = ?`,
                [
                    data.conta_id || itemAtual.conta_id, categoriaFinalId, data.descricao || itemAtual.descricao,
                    finalValor, data.data_competencia || itemAtual.data_competencia, dataPagStr,
                    statusStr, data.e_fixo || data.recorrente ? 1 : 0, data.observacoes || null,
                    id, userId
                ]
            );
        }
        return true;
    }

    static async excluir(id, userId, escopoSerie = 'apenas_esta') {
        const item = await this.buscarPorId(id, userId);
        if (!item) return;
        if (item.serie_id && escopoSerie === 'esta_e_proximas') {
            await db.query('DELETE FROM lancamentos WHERE user_id = ? AND serie_id = ? AND data_competencia >= ?', [userId, item.serie_id, item.data_competencia]);
        } else if (item.serie_id && escopoSerie === 'toda_serie') {
            await db.query('DELETE FROM lancamentos WHERE user_id = ? AND serie_id = ?', [userId, item.serie_id]);
        } else {
            await db.query('DELETE FROM lancamentos WHERE id = ? AND user_id = ?', [id, userId]);
        }
    }

    static async marcarComoPago(id, userId, status = 'pago', dataPagamento = null) {
        const pagDate = status === 'pago' ? (dataPagamento || toLocalYMD(new Date())) : null;
        await db.query(
            'UPDATE lancamentos SET status = ?, data_pagamento = ?, updated_at = NOW() WHERE id = ? AND user_id = ?',
            [status, pagDate, id, userId]
        );
    }

    static async resumoPeriodo(userId, periodo) {
        // Considera apenas contas ativas, no mesmo criterio do saldo exibido em Contas Bancarias.
        const [rows] = await db.query(
            `SELECT
                COALESCE(SUM(CASE WHEN l.tipo = 'receita' AND l.status = 'pago' AND l.data_competencia BETWEEN ? AND ? THEN ABS(l.valor) ELSE 0 END), 0) as receitas_recebidas,
                COALESCE(SUM(CASE WHEN l.tipo = 'receita' AND l.status = 'pendente' AND l.data_competencia BETWEEN ? AND ? THEN ABS(l.valor) ELSE 0 END), 0) as receitas_a_receber,
                COALESCE(SUM(CASE WHEN l.tipo = 'despesa' AND l.status = 'pago' AND l.data_competencia BETWEEN ? AND ? THEN ABS(l.valor) ELSE 0 END), 0) as despesas_pagas,
                COALESCE(SUM(CASE WHEN l.tipo = 'despesa' AND l.status = 'pendente' AND l.data_competencia BETWEEN ? AND ? THEN ABS(l.valor) ELSE 0 END), 0) as despesas_nao_pagas,
                COALESCE(SUM(CASE WHEN l.tipo IN ('ajuste', 'transferencia') AND l.status = 'pago' AND l.data_competencia BETWEEN ? AND ? THEN l.valor ELSE 0 END), 0) as ajustes_periodo,
                COALESCE(SUM(CASE WHEN l.status = 'pago' AND l.data_competencia < ? THEN l.valor ELSE 0 END), 0) as movimento_anterior
             FROM lancamentos l
             JOIN contas c ON c.id = l.conta_id AND c.status = 'ativa'
             WHERE l.user_id = ?`,
            [
                periodo.inicio, periodo.fim,
                periodo.inicio, periodo.fim,
                periodo.inicio, periodo.fim,
                periodo.inicio, periodo.fim,
                periodo.inicio, periodo.fim,
                periodo.inicio,
                userId
            ]
        );
        const [inicial] = await db.query(
            "SELECT COALESCE(SUM(saldo_inicial), 0) AS total FROM contas WHERE user_id = ? AND status = 'ativa'",
            [userId]
        );

        const r = rows[0] || {};
        const recRec = parseFloat(r.receitas_recebidas) || 0;
        const recPen = parseFloat(r.receitas_a_receber) || 0;
        const despPag = parseFloat(r.despesas_pagas) || 0;
        const despPen = parseFloat(r.despesas_nao_pagas) || 0;
        const ajustes = parseFloat(r.ajustes_periodo) || 0;
        const saldoAnt = (parseFloat(inicial[0].total) || 0) + (parseFloat(r.movimento_anterior) || 0);

        return {
            saldo_anterior: saldoAnt,
            receitas_recebidas: recRec,
            receitas_a_receber: recPen,
            despesas_pagas: despPag,
            despesas_nao_pagas: despPen,
            ajustes_periodo: ajustes,
            saldo_disponivel: saldoAnt + recRec - despPag + ajustes,
            saldo_previsto: saldoAnt + recRec + recPen - despPag - despPen + ajustes
        };
    }

    // Corrige registros legados (ex.: importados de simulacao) com sinal incompativel com o tipo. Idempotente.
    static async normalizarSinais() {
        const [d] = await db.query("UPDATE lancamentos SET valor = -ABS(valor) WHERE tipo = 'despesa' AND valor > 0");
        const [r] = await db.query("UPDATE lancamentos SET valor = ABS(valor) WHERE tipo = 'receita' AND valor < 0");
        return { despesas: d.affectedRows || 0, receitas: r.affectedRows || 0 };
    }

    // Pendencias vencidas ou que vencem hoje (contas ativas), mais antigas primeiro.
    static async pendentesUrgentes(userId, hojeYMD, limite = 5) {
        const base = `FROM lancamentos l
             JOIN contas cb ON cb.id = l.conta_id AND cb.status = 'ativa'
             WHERE l.user_id = ? AND l.status = 'pendente' AND l.tipo IN ('receita', 'despesa') AND l.data_competencia <= ?`;
        const [rows] = await db.query(
            `SELECT l.id, l.tipo, l.descricao, l.valor, l.data_competencia, cb.nome AS conta_nome,
                    DATEDIFF(?, l.data_competencia) AS dias_atraso
             ${base} ORDER BY l.data_competencia ASC, l.id ASC LIMIT ?`,
            [hojeYMD, userId, hojeYMD, limite]
        );
        const [cnt] = await db.query(`SELECT COUNT(*) AS total ${base}`, [userId, hojeYMD]);
        return { itens: rows, total: cnt[0].total || 0 };
    }

    // Total por categoria (subcategorias somadas na categoria pai), so receitas/despesas do periodo.
    static async resumoPorCategoriaPai(userId, periodo, tipo) {
        const [rows] = await db.query(
            `SELECT COALESCE(p.nome, c.nome, 'Sem categoria') AS nome, COALESCE(p.cor, c.cor) AS cor, SUM(ABS(l.valor)) AS total
             FROM lancamentos l
             LEFT JOIN categorias c ON l.categoria_id = c.id
             LEFT JOIN categorias p ON c.parent_id = p.id
             WHERE l.user_id = ? AND l.tipo = ? AND l.data_competencia BETWEEN ? AND ?
             GROUP BY COALESCE(p.id, c.id), COALESCE(p.nome, c.nome, 'Sem categoria'), COALESCE(p.cor, c.cor)
             ORDER BY total DESC`,
            [userId, tipo, periodo.inicio, periodo.fim]
        );
        return rows.map(r => ({ nome: r.nome, cor: r.cor, valor: parseFloat(r.total) || 0 }));
    }

    static async totalDespesasMes(userId, mes, ano) {
        const [rows] = await db.query(
            `SELECT SUM(ABS(valor)) as total FROM lancamentos 
             WHERE user_id = ? AND tipo = 'despesa' AND status = 'pago' 
               AND MONTH(data_competencia) = ? AND YEAR(data_competencia) = ?`,
            [userId, mes, ano]
        );
        return parseFloat(rows[0]?.total) || 0;
    }

    static async relatorioPendentes(userId, periodo = null, filtros = {}, ordenacao = 'vencimento') {
        let where = "WHERE l.user_id = ? AND l.status = 'pendente'";
        const params = [userId];

        if (periodo && periodo.inicio && periodo.fim) {
            where += " AND l.data_competencia BETWEEN ? AND ?";
            params.push(periodo.inicio, periodo.fim);
        }

        if (filtros.subcategoria_id) {
            where += " AND l.categoria_id = ?";
            params.push(filtros.subcategoria_id);
        } else if (filtros.categoria_id) {
            where += " AND (l.categoria_id = ? OR c.parent_id = ?)";
            params.push(filtros.categoria_id, filtros.categoria_id);
        }

        if (filtros.busca && filtros.busca.trim() !== '') {
            where += " AND (l.descricao LIKE ? OR c.nome LIKE ?)";
            const term = `%${filtros.busca.trim()}%`;
            params.push(term, term);
        }

        let orderBy = "l.data_competencia ASC, l.id ASC";
        if (ordenacao === 'preco' || ordenacao === 'valor') {
            orderBy = "ABS(l.valor) DESC";
        } else if (ordenacao === 'criacao') {
            orderBy = "l.created_at DESC";
        }

        const [rows] = await db.query(
            `SELECT l.*, c.nome as categoria_nome, cb.nome as conta_nome
             FROM lancamentos l
             LEFT JOIN categorias c ON l.categoria_id = c.id
             LEFT JOIN contas cb ON l.conta_id = cb.id
             ${where}
             ORDER BY ${orderBy}`,
            params
        );
        return rows;
    }

    static async frequenciaDiaria(userId, dataInicio, dataFim, filtros = {}) {
        let where = "WHERE l.user_id = ? AND l.tipo IN ('receita', 'despesa') AND l.data_competencia BETWEEN ? AND ?";
        const params = [userId, dataInicio, dataFim];

        if (filtros.subcategoria_id) {
            where += " AND l.categoria_id = ?";
            params.push(filtros.subcategoria_id);
        } else if (filtros.categoria_id) {
            where += " AND (l.categoria_id = ? OR c.parent_id = ?)";
            params.push(filtros.categoria_id, filtros.categoria_id);
        }

        const [rows] = await db.query(
            `SELECT l.data_competencia AS data,
                    COALESCE(SUM(CASE WHEN l.tipo = 'receita' THEN ABS(l.valor) ELSE 0 END), 0) AS receitas,
                    COALESCE(SUM(CASE WHEN l.tipo = 'despesa' THEN ABS(l.valor) ELSE 0 END), 0) AS despesas
             FROM lancamentos l
             LEFT JOIN categorias c ON l.categoria_id = c.id
             ${where}
             GROUP BY l.data_competencia
             ORDER BY l.data_competencia ASC`,
            params
        );
        return rows;
    }

    static async resumoCategorias(userId, periodo, filtros = {}) {
        let where = "WHERE l.user_id = ? AND l.status = 'pago' AND l.data_competencia BETWEEN ? AND ?";
        const params = [userId, periodo.inicio, periodo.fim];

        if (filtros.subcategoria_id) {
            where += " AND l.categoria_id = ?";
            params.push(filtros.subcategoria_id);
        } else if (filtros.categoria_id) {
            where += " AND (l.categoria_id = ? OR c.parent_id = ?)";
            params.push(filtros.categoria_id, filtros.categoria_id);
        }

        const [rows] = await db.query(
            `SELECT c.nome, c.cor, l.tipo, SUM(ABS(l.valor)) as total
             FROM lancamentos l
             LEFT JOIN categorias c ON l.categoria_id = c.id
             ${where}
             GROUP BY c.nome, c.cor, l.tipo`,
            params
        );
        return rows;
    }

    static async demonstrativoAnual(userId, ano) {
        const [linhas] = await db.query(
            `SELECT l.categoria_id, cat.nome, cat.cor, cat.parent_id, l.tipo,
                    MONTH(l.data_competencia) AS mes, SUM(ABS(l.valor)) AS total
             FROM lancamentos l
             LEFT JOIN categorias cat ON cat.id = l.categoria_id
             WHERE l.user_id = ? AND l.tipo IN ('receita', 'despesa') AND YEAR(l.data_competencia) = ?
             GROUP BY l.categoria_id, cat.nome, cat.cor, cat.parent_id, l.tipo, MONTH(l.data_competencia)`,
            [userId, ano]
        );

        const novoNo = (nome, cor) => ({
            categoria_nome: nome,
            categoria_cor: cor,
            meses: Array(13).fill(0),
            total: 0,
            subcategorias: {}
        });

        const topo = { receita: {}, despesa: {} };

        for (const linha of linhas) {
            const tipo = linha.tipo;
            const mes = parseInt(linha.mes, 10);
            const valor = parseFloat(linha.total) || 0;
            const categoriaId = linha.categoria_id ? parseInt(linha.categoria_id, 10) : 0;
            const parentId = linha.parent_id ? parseInt(linha.parent_id, 10) : null;

            if (parentId === null) {
                if (!topo[tipo][categoriaId]) {
                    topo[tipo][categoriaId] = novoNo(linha.nome, linha.cor);
                }
                topo[tipo][categoriaId].meses[mes] += valor;
                topo[tipo][categoriaId].total += valor;
            } else {
                if (!topo[tipo][parentId]) {
                    const [paiRows] = await db.query('SELECT nome, cor FROM categorias WHERE id = ? AND user_id = ? LIMIT 1', [parentId, userId]);
                    const pai = paiRows[0] || {};
                    topo[tipo][parentId] = novoNo(pai.nome || null, pai.cor || null);
                }
                if (!topo[tipo][parentId].subcategorias[categoriaId]) {
                    topo[tipo][parentId].subcategorias[categoriaId] = novoNo(linha.nome, linha.cor);
                }
                topo[tipo][parentId].subcategorias[categoriaId].meses[mes] += valor;
                topo[tipo][parentId].subcategorias[categoriaId].total += valor;

                // ITEM 11 FIX: Increment parent category node monthly total as well!
                topo[tipo][parentId].meses[mes] += valor;
                topo[tipo][parentId].total += valor;
            }
        }

        const formatar = (porId) => {
            const lista = [];
            for (const id in porId) {
                const no = porId[id];
                no.categoria_id = parseInt(id, 10);
                const subs = [];
                for (const subId in no.subcategorias) {
                    const sub = no.subcategorias[subId];
                    sub.categoria_id = parseInt(subId, 10);
                    subs.push(sub);
                }
                subs.sort((a, b) => (a.categoria_nome || '').localeCompare(b.categoria_nome || ''));
                no.subcategorias = subs;
                lista.push(no);
            }
            lista.sort((a, b) => (a.categoria_nome || '').localeCompare(b.categoria_nome || ''));
            return lista;
        };

        const saldoMensal = Array(13).fill(0);
        for (const linha of linhas) {
            const mes = parseInt(linha.mes, 10);
            const valor = parseFloat(linha.total) || 0;
            saldoMensal[mes] += (linha.tipo === 'receita' ? valor : -valor);
        }

        return {
            receitas: formatar(topo.receita),
            despesas: formatar(topo.despesa),
            saldo_mensal: saldoMensal
        };
    }
}

module.exports = Lancamento;
