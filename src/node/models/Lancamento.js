const db = require('../config/db');
const { randomUUID: uuidv4 } = require('crypto');
const { toLocalYMD, formatDate, addMonthsYMD, hojeLocal, passoMeses, regrasCambio } = require('../core/helpers');

// Lancamento marcado como fixo (receita/despesa recorrente) gera 24 meses, a atual incluida.
const MESES_FIXO = 24;

const cleanParam = (v) => (v && v !== 'null' && v !== 'undefined' && v !== '' && v !== 'sem_agrupamento') ? String(v).trim() : null;

// Mesmo criterio do resumo e dos saldos: so contas ativas entram em listas, graficos e totais, e so as da moeda em foco
// (paineis e relatorios mostram uma moeda por vez; ver core/moedaFoco.js). CONTA_ATIVA vira SQL ao ser usado em texto.
const { CONTA_ATIVA, filtroConta } = require('../core/moedaFoco');

class Lancamento {
    static async buscarPorId(id, userId) {
        const [rows] = await db.query(
            `SELECT l.*, c.nome as categoria_nome, c.parent_id as categoria_parent_id, cb.nome as conta_nome, cb.moeda as conta_moeda 
             FROM lancamentos l
             LEFT JOIN categorias c ON l.categoria_id = c.id
             LEFT JOIN contas cb ON l.conta_id = cb.id
             WHERE l.id = ? AND l.user_id = ? LIMIT 1`,
            [id, userId]
        );
        return rows[0] || null;
    }

    static async buscarFiltrados(userId, periodo, filtros = {}, ordenacao = 'data', pagina = 1, porPagina = 30, agrupamento = 'sem_agrupamento', extra = {}) {
        let where = 'WHERE l.user_id = ? AND l.data_competencia BETWEEN ? AND ? AND ' + CONTA_ATIVA;
        // Transferencia agendada tem duas pernas; na lista aparece so a de saida (a entrada continua no extrato da conta de destino).
        where += " AND NOT (l.tipo = 'transferencia' AND l.transferencia_par_id IS NOT NULL AND l.valor > 0)";
        const params = [userId, periodo.inicio, periodo.fim];

        // extra.status ('pago'|'pendente'): so essa situacao. extra.atrasadas: alem do periodo, inclui o que venceu antes dele.
        if (extra.status === 'pago' || extra.status === 'pendente') {
            where += ' AND l.status = ?';
            params.push(extra.status);
        }
        if (extra.atrasadas) {
            where = where.replace('l.data_competencia BETWEEN ? AND ?', '(l.data_competencia BETWEEN ? AND ? OR l.data_competencia < ?)');
            params.splice(3, 0, periodo.inicio);
        }

        const fTipo = cleanParam(filtros.tipo);
        const fSub = cleanParam(filtros.subcategoria_id);
        const fCat = cleanParam(filtros.categoria_id);
        const fBusca = cleanParam(filtros.busca);

        // So tipos conhecidos filtram; qualquer outro valor equivale a "todas" (antes virava "receitas" sem querer).
        const tipoFiltro = { despesas: 'despesa', despesa: 'despesa', receitas: 'receita', receita: 'receita', transferencias: 'transferencia', transferencia: 'transferencia' }[fTipo];
        if (tipoFiltro) {
            where += ' AND l.tipo = ?';
            params.push(tipoFiltro);
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
                    cb.nome as conta_nome, cb.cor as conta_cor, cb.moeda as conta_moeda,
                    (SELECT p.valor FROM lancamentos p WHERE p.id = l.transferencia_par_id) AS par_valor,
                    (SELECT cp.moeda FROM lancamentos p JOIN contas cp ON cp.id = p.conta_id WHERE p.id = l.transferencia_par_id) AS par_moeda,
                    (SELECT cp.nome FROM lancamentos p JOIN contas cp ON cp.id = p.conta_id WHERE p.id = l.transferencia_par_id) AS par_conta_nome,
                    IF(l.serie_id IS NULL, NULL, (SELECT COUNT(*) FROM lancamentos s WHERE s.user_id = l.user_id AND s.serie_id = l.serie_id AND s.tipo = l.tipo AND (s.data_competencia < l.data_competencia OR (s.data_competencia = l.data_competencia AND s.id <= l.id)))) AS serie_pos,
                    IF(l.serie_id IS NULL, NULL, (SELECT COUNT(*) FROM lancamentos s WHERE s.user_id = l.user_id AND s.serie_id = l.serie_id AND s.tipo = l.tipo)) AS serie_total
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
            // Repetir pode ser mensal, trimestral, semestral ou anual; o fixo e sempre mensal.
            const passo = eRepetir ? passoMeses(data.periodicidade) : 1;
            const serieId = totalOcorrencias > 1 ? uuidv4() : null;

            const dataBase = data.data_competencia || toLocalYMD(hojeLocal());
            const pagDate = data.status === 'pago' ? (data.data_pagamento || dataBase) : null;
            const categoriaFinalId = data.subcategoria_id || data.categoria_id || null;
            const rawValor = Math.abs(parseFloat(data.valor) || 0);
            const finalValor = data.tipo === 'despesa' ? -rawValor : rawValor;

            const lancamentosCriados = [];

            for (let i = 0; i < totalOcorrencias; i++) {
                const dateCompStr = addMonthsYMD(dataBase, i * passo);
                // So a primeira ocorrencia herda o status escolhido; as futuras ficam pendentes (a pagar/receber).
                const statusOcorrencia = i === 0 ? (data.status || 'pendente') : 'pendente';
                const datePagStr = i === 0 && pagDate ? pagDate : null;

                const [res] = await conn.query(
                    `INSERT INTO lancamentos 
                     (user_id, serie_id, conta_id, categoria_id, tipo, descricao, valor, 
                      data_competencia, data_pagamento, status, recorrente, observacoes, client_id, created_at, updated_at) 
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
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
                        data.observacoes || null,
                        i === 0 ? (data.client_id || null) : null
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

    // Transferencia entre contas: par de lancamentos (saida + entrada) ligados por transferencia_par_id.
    // Imediata = os dois ja pagos na data; agendada = os dois pendentes (o saldo so move ao marcar como pago).
    static async criarTransferencia({ userId, origem, destino, valor, data, descricao = '', agendada = false, eFixo = false, quantidade = 1, periodicidade = 'mensal', valorEntrada = null, cotacao = null, clientId = null, idsCriados = null }) {
        const Categoria = require('./Categoria');
        const catId = await Categoria.idSistema(userId, 'transferencia');
        const total = Math.max(1, quantidade);
        const passo = eFixo ? 1 : passoMeses(periodicidade);
        const serieId = total > 1 ? uuidv4() : null;
        const sufixo = descricao ? ' - ' + descricao : '';
        // Entre moedas diferentes cada perna tem o seu valor (saida na moeda da origem, entrada na do destino).
        const valorDestino = valorEntrada != null && valorEntrada > 0 ? valorEntrada : valor;
        const novosIds = [];
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            // clientId (sincronizacao do app) fica so na perna de saida da primeira ocorrencia.
            const inserir = (contaId, valorLinha, desc, dataComp, cid = null) => conn.query(
                `INSERT INTO lancamentos (user_id, serie_id, conta_id, categoria_id, tipo, descricao, valor, data_competencia, data_pagamento, status, recorrente, client_id, cotacao, created_at, updated_at)
                 VALUES (?, ?, ?, ?, 'transferencia', ?, ?, ?, ?, ?, ?, ?, ?, NOW(3), NOW(3))`,
                [userId, serieId, contaId, catId, desc, valorLinha, dataComp, agendada ? null : dataComp, agendada ? 'pendente' : 'pago', eFixo ? 1 : 0, cid, cotacao || null]
            );
            for (let i = 0; i < total; i++) {
                const dataComp = addMonthsYMD(data, i * passo);
                const [saida] = await inserir(origem.id, -valor, `Transferência enviada para ${destino.nome}${sufixo}`, dataComp, i === 0 ? clientId : null);
                const [entrada] = await inserir(destino.id, valorDestino, `Transferência recebida de ${origem.nome}${sufixo}`, dataComp);
                await conn.query('UPDATE lancamentos SET transferencia_par_id = ? WHERE id = ?', [entrada.insertId, saida.insertId]);
                await conn.query('UPDATE lancamentos SET transferencia_par_id = ? WHERE id = ?', [saida.insertId, entrada.insertId]);
                novosIds.push(saida.insertId, entrada.insertId);
            }
            await conn.commit();
            if (idsCriados) idsCriados.push(...novosIds);
            return total;
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
        // So receita e despesa sao editadas por aqui: transferencia e ajuste tem as proprias regras (duas pernas, sinal).
        if (itemAtual.tipo !== 'receita' && itemAtual.tipo !== 'despesa') return false;
        await this.validarPropriedade(userId, data.conta_id, data.subcategoria_id || data.categoria_id);

        const statusStr = data.status === 'pago' || data.status === 1 ? 'pago' : 'pendente';
        const dataAntes = toLocalYMD(itemAtual.data_competencia);
        const pagAntes = itemAtual.data_pagamento ? toLocalYMD(itemAtual.data_pagamento) : null;
        const dataNova = data.data_competencia || dataAntes;
        // Data do pagamento: a informada; senao a que ja existia - acompanhando a data do lancamento quando as duas eram iguais
        // (quem corrige o dia de uma compra ja paga espera que o pagamento va junto).
        const dataPagStr = statusStr === 'pago' ? (data.data_pagamento || (pagAntes && pagAntes !== dataAntes ? pagAntes : dataNova)) : null;
        const categoriaFinalId = data.subcategoria_id || data.categoria_id || itemAtual.categoria_id;
        const rawValor = Math.abs(parseFloat(data.valor) || Math.abs(parseFloat(itemAtual.valor)));
        const finalValor = itemAtual.tipo === 'despesa' ? -rawValor : rawValor;

        // Campos comuns. "Fixa" (recorrente) e observacoes so mudam quando o chamador informa: o formulario do site nao
        // envia nenhum dos dois ao editar uma serie, e nesse caso fica o que ja estava gravado.
        const campos = ['conta_id = ?', 'categoria_id = ?', 'descricao = ?', 'valor = ?'];
        const valores = [data.conta_id || itemAtual.conta_id, categoriaFinalId, data.descricao || itemAtual.descricao, finalValor];
        if (data.e_fixo !== undefined || data.recorrente !== undefined) {
            campos.push('recorrente = ?');
            valores.push(data.e_fixo || data.recorrente ? 1 : 0);
        }
        if (data.observacoes !== undefined) {
            campos.push('observacoes = ?');
            valores.push(data.observacoes || null);
        }
        const set = campos.join(', ');

        if (itemAtual.serie_id && escopoSerie !== 'apenas_esta') {
            if (escopoSerie === 'esta_e_proximas') {
                await db.query(
                    `UPDATE lancamentos SET ${set}, updated_at = NOW(3)
                     WHERE user_id = ? AND serie_id = ? AND tipo = ? AND data_competencia >= ?`,
                    [...valores, userId, itemAtual.serie_id, itemAtual.tipo, dataAntes]
                );
            } else if (escopoSerie === 'toda_serie') {
                await db.query(
                    `UPDATE lancamentos SET ${set}, updated_at = NOW(3)
                     WHERE user_id = ? AND serie_id = ? AND tipo = ?`,
                    [...valores, userId, itemAtual.serie_id, itemAtual.tipo]
                );
            }
            // Data, status e data de pagamento valem so para a ocorrencia editada (nao marca a serie inteira como paga).
            await db.query(
                'UPDATE lancamentos SET data_competencia = ?, status = ?, data_pagamento = ?, updated_at = NOW(3) WHERE id = ? AND user_id = ?',
                [dataNova, statusStr, dataPagStr, id, userId]
            );
        } else {
            await db.query(
                `UPDATE lancamentos SET ${set}, data_competencia = ?, data_pagamento = ?, status = ?, updated_at = NOW(3)
                 WHERE id = ? AND user_id = ?`,
                [...valores, dataNova, dataPagStr, statusStr, id, userId]
            );
        }
        return true;
    }

    // Transacao avulsa que vira fixa (24 meses) ou repetida (N vezes, parcelas): esta continua como esta e as proximas
    // ocorrencias, ja pendentes, sao criadas na periodicidade escolhida (mensal por padrao). Nao mexe em transacao que ja faz parte de uma serie.
    static async converterEmSerie(id, userId, { fixo = false, quantidade = 1, periodicidade = 'mensal' } = {}) {
        const item = await this.buscarPorId(id, userId);
        if (!item || item.serie_id || (item.tipo !== 'receita' && item.tipo !== 'despesa')) return 0;
        const total = fixo ? MESES_FIXO : Math.min(Math.max(parseInt(quantidade, 10) || 1, 1), 60);
        if (total <= 1) return 0;
        const serieId = uuidv4();
        const passo = fixo ? 1 : passoMeses(periodicidade);
        const dataBase = toLocalYMD(item.data_competencia);
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            await conn.query('UPDATE lancamentos SET serie_id = ?, recorrente = ?, updated_at = NOW(3) WHERE id = ? AND user_id = ?', [serieId, fixo ? 1 : 0, id, userId]);
            for (let i = 1; i < total; i++) {
                await conn.query(
                    `INSERT INTO lancamentos
                     (user_id, serie_id, conta_id, categoria_id, tipo, descricao, valor,
                      data_competencia, data_pagamento, status, recorrente, observacoes, created_at, updated_at)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 'pendente', ?, ?, NOW(3), NOW(3))`,
                    [userId, serieId, item.conta_id, item.categoria_id, item.tipo, item.descricao, item.valor,
                     addMonthsYMD(dataBase, i * passo), fixo ? 1 : 0, item.observacoes || null]
                );
            }
            await conn.commit();
            return total;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    // Perna oposta de uma transferencia. As antigas (feitas na hora, sem transferencia_par_id) sao ligadas pelo valor oposto,
    // mesma data e o id mais proximo; se achar, a ligacao e gravada para as proximas edicoes.
    static async localizarParTransferencia(item, userId, conn = null) {
        const q = (conn || db).query.bind(conn || db);
        if (item.transferencia_par_id) {
            const [r] = await q('SELECT * FROM lancamentos WHERE id = ? AND user_id = ? LIMIT 1', [item.transferencia_par_id, userId]);
            return r[0] || null;
        }
        const [r] = await q(
            `SELECT * FROM lancamentos WHERE user_id = ? AND tipo = 'transferencia' AND transferencia_par_id IS NULL AND id <> ?
               AND data_competencia = ? AND valor = ? ORDER BY ABS(id - ?) ASC LIMIT 1`,
            [userId, item.id, toLocalYMD(item.data_competencia), -parseFloat(item.valor), item.id]
        );
        const par = r[0] || null;
        if (par) {
            await q('UPDATE lancamentos SET transferencia_par_id = ? WHERE id = ? AND user_id = ?', [par.id, item.id, userId]);
            await q('UPDATE lancamentos SET transferencia_par_id = ? WHERE id = ? AND user_id = ?', [item.id, par.id, userId]);
        }
        return par;
    }

    // Edita uma transferencia (as duas pernas juntas): valor, data e situacao. Em serie, o valor pode valer so para esta,
    // para esta e as proximas ou para toda a serie; data e situacao valem sempre so para a ocorrencia editada.
    // "valor" e o que sai da conta de origem. Entre moedas diferentes, "valorEntrada" (ou "cotacao") define o que entra no destino;
    // sem nenhum dos dois, mantem a cotacao que a transferencia ja tinha.
    static async atualizarTransferencia(id, userId, { valor, valorEntrada = null, cotacao = null, data, pago, dataPagamento = null, escopo = 'apenas_esta' }) {
        const item = await this.buscarPorId(id, userId);
        if (!item || item.tipo !== 'transferencia') return false;
        const conn = await db.getConnection();
        try {
            await conn.beginTransaction();
            const par = await this.localizarParTransferencia(item, userId, conn);
            const ids = par ? [item.id, par.id] : [item.id];
            const marcas = ids.map(() => '?').join(',');

            // Moedas das duas pontas: a perna de saida e a negativa.
            const saida = parseFloat(item.valor) < 0 ? item : par;
            const entradaLeg = parseFloat(item.valor) < 0 ? par : item;
            let moedaSaida = null, moedaEntrada = null;
            if (saida && entradaLeg) {
                const [ms] = await conn.query('SELECT id, moeda FROM contas WHERE user_id = ? AND id IN (?, ?)', [userId, saida.conta_id, entradaLeg.conta_id]);
                moedaSaida = (ms.find((m) => m.id === saida.conta_id) || {}).moeda;
                moedaEntrada = (ms.find((m) => m.id === entradaLeg.conta_id) || {}).moeda;
            }
            let entrada = valor, cot = null;
            if (moedaSaida && moedaEntrada && moedaSaida !== moedaEntrada) {
                if (valorEntrada > 0) entrada = valorEntrada;
                else if (cotacao > 0) entrada = regrasCambio.calcularEntrada(valor, cotacao, moedaSaida, moedaEntrada);
                else if (parseFloat(item.cotacao) > 0) entrada = regrasCambio.calcularEntrada(valor, parseFloat(item.cotacao), moedaSaida, moedaEntrada);
                else { await conn.rollback(); return false; }
                // Se o valor recebido bate com a cotacao informada (diferenca so de arredondamento), a cotacao digitada e mantida.
                cot = cotacao > 0 && Math.abs(regrasCambio.calcularEntrada(valor, cotacao, moedaSaida, moedaEntrada) - entrada) < 0.0051 * Math.pow(10, 2 - regrasCambio.casasDaMoeda(moedaEntrada))
                    ? cotacao : regrasCambio.calcularCotacao(valor, entrada, moedaSaida, moedaEntrada);
            }

            // Valor: a perna de saida e negativa e a de entrada positiva.
            const sinal = 'CASE WHEN valor < 0 THEN -? ELSE ? END';
            const campos = `valor = ${sinal}, cotacao = ?, updated_at = NOW(3)`;
            const vals = [valor, entrada, cot];
            if (item.serie_id && escopo === 'esta_e_proximas') {
                await conn.query(`UPDATE lancamentos SET ${campos} WHERE user_id = ? AND tipo = 'transferencia' AND serie_id = ? AND data_competencia >= ?`,
                    [...vals, userId, item.serie_id, toLocalYMD(item.data_competencia)]);
            } else if (item.serie_id && escopo === 'toda_serie') {
                await conn.query(`UPDATE lancamentos SET ${campos} WHERE user_id = ? AND tipo = 'transferencia' AND serie_id = ?`,
                    [...vals, userId, item.serie_id]);
            } else {
                await conn.query(`UPDATE lancamentos SET ${campos} WHERE user_id = ? AND id IN (${marcas})`, [...vals, userId, ...ids]);
            }

            // Data e situacao da ocorrencia editada (as duas pernas).
            await conn.query(
                `UPDATE lancamentos SET data_competencia = ?, status = ?, data_pagamento = ?, updated_at = NOW(3) WHERE user_id = ? AND id IN (${marcas})`,
                [data, pago ? 'pago' : 'pendente', pago ? (dataPagamento || data) : null, userId, ...ids]
            );
            await conn.commit();
            return true;
        } catch (err) {
            await conn.rollback();
            throw err;
        } finally {
            conn.release();
        }
    }

    static async excluir(id, userId, escopoSerie = 'apenas_esta') {
        const SyncExclusao = require('./SyncExclusao');
        const item = await this.buscarPorId(id, userId);
        if (!item) return;
        let onde; let params;
        if (item.serie_id && escopoSerie === 'esta_e_proximas') {
            onde = 'user_id = ? AND serie_id = ? AND data_competencia >= ?'; params = [userId, item.serie_id, item.data_competencia];
        } else if (item.serie_id && escopoSerie === 'toda_serie') {
            onde = 'user_id = ? AND serie_id = ?'; params = [userId, item.serie_id];
        } else {
            const { ids } = await this.idsDoPar(id, userId);
            const lista = ids.length ? ids : [id];
            onde = `user_id = ? AND id IN (${lista.map(() => '?').join(',')})`; params = [userId, ...lista];
        }
        // O app precisa saber o que foi apagado: registra antes de excluir de verdade.
        await SyncExclusao.registrar('lancamentos', onde, params);
        await db.query(`DELETE FROM lancamentos WHERE ${onde}`, params);
    }

    // Transferencia agendada = duas pernas (saida e entrada) ligadas por transferencia_par_id; as duas andam juntas.
    static async idsDoPar(id, userId) {
        const item = await this.buscarPorId(id, userId);
        if (!item) return { item: null, ids: [] };
        const ids = [item.id];
        if (item.tipo === 'transferencia') {
            // Transferencias antigas nao tem a ligacao gravada: o par e achado pelo valor oposto na mesma data (e fica ligado dai em diante).
            const par = await this.localizarParTransferencia(item, userId);
            if (par) ids.push(par.id);
        }
        return { item, ids };
    }

    static async marcarComoPago(id, userId, status = 'pago', dataPagamento = null) {
        const pagDate = status === 'pago' ? (dataPagamento || toLocalYMD(hojeLocal())) : null;
        const { ids } = await this.idsDoPar(id, userId);
        if (!ids.length) return;
        await db.query(
            `UPDATE lancamentos SET status = ?, data_pagamento = ?, updated_at = NOW(3) WHERE user_id = ? AND id IN (${ids.map(() => '?').join(',')})`,
            [status, pagDate, userId, ...ids]
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
             JOIN contas c ON c.id = l.conta_id AND c.status = 'ativa'${filtroConta('c')}
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
            "SELECT COALESCE(SUM(saldo_inicial), 0) AS total FROM contas WHERE user_id = ? AND status = 'ativa'" + filtroConta('contas'),
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

    // Receitas/despesas do periodo separadas em fixas (recorrente = 1) e variaveis, mais o saldo previsto ao fim do periodo.
    static async resumoFixoVariavel(userId, periodo) {
        const [rows] = await db.query(
            `SELECT
                COALESCE(SUM(CASE WHEN l.tipo = 'receita' AND l.recorrente = 1 THEN ABS(l.valor) ELSE 0 END), 0) AS receita_fixa,
                COALESCE(SUM(CASE WHEN l.tipo = 'receita' AND l.recorrente = 0 THEN ABS(l.valor) ELSE 0 END), 0) AS receita_variavel,
                COALESCE(SUM(CASE WHEN l.tipo = 'despesa' AND l.recorrente = 1 THEN ABS(l.valor) ELSE 0 END), 0) AS despesa_fixa,
                COALESCE(SUM(CASE WHEN l.tipo = 'despesa' AND l.recorrente = 0 THEN ABS(l.valor) ELSE 0 END), 0) AS despesa_variavel
             FROM lancamentos l
             JOIN contas c ON c.id = l.conta_id AND c.status = 'ativa'${filtroConta('c')}
             WHERE l.user_id = ? AND l.data_competencia BETWEEN ? AND ?`,
            [userId, periodo.inicio, periodo.fim]
        );
        const resumo = await this.resumoPeriodo(userId, periodo);
        const r = rows[0] || {};
        return {
            receita_fixa: parseFloat(r.receita_fixa) || 0,
            receita_variavel: parseFloat(r.receita_variavel) || 0,
            despesa_fixa: parseFloat(r.despesa_fixa) || 0,
            despesa_variavel: parseFloat(r.despesa_variavel) || 0,
            saldo_total: resumo.saldo_previsto
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
             JOIN contas cb ON cb.id = l.conta_id AND cb.status = 'ativa'${filtroConta('cb')}
             WHERE l.user_id = ? AND l.status = 'pendente' AND l.data_competencia <= ?
               AND (l.tipo IN ('receita', 'despesa') OR (l.tipo = 'transferencia' AND l.transferencia_par_id IS NOT NULL AND l.valor < 0))`;
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
             WHERE l.user_id = ? AND l.tipo = ? AND l.data_competencia BETWEEN ? AND ? AND ${CONTA_ATIVA}
             GROUP BY COALESCE(p.id, c.id), COALESCE(p.nome, c.nome, 'Sem categoria'), COALESCE(p.cor, c.cor)
             ORDER BY total DESC`,
            [userId, tipo, periodo.inicio, periodo.fim]
        );
        return rows.map(r => ({ nome: r.nome, cor: r.cor, valor: parseFloat(r.total) || 0 }));
    }

    static async totalDespesasMes(userId, mes, ano) {
        const [rows] = await db.query(
            `SELECT SUM(ABS(l.valor)) as total FROM lancamentos l
             WHERE l.user_id = ? AND l.tipo = 'despesa' AND l.status = 'pago' AND ${CONTA_ATIVA}
               AND MONTH(l.data_competencia) = ? AND YEAR(l.data_competencia) = ?`,
            [userId, mes, ano]
        );
        return parseFloat(rows[0]?.total) || 0;
    }

    static async relatorioPendentes(userId, periodo = null, filtros = {}, ordenacao = 'vencimento') {
        let where = "WHERE l.user_id = ? AND l.status = 'pendente' AND " + CONTA_ATIVA;
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
        let where = "WHERE l.user_id = ? AND l.tipo IN ('receita', 'despesa') AND l.data_competencia BETWEEN ? AND ? AND " + CONTA_ATIVA;
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
        let where = "WHERE l.user_id = ? AND l.status = 'pago' AND l.data_competencia BETWEEN ? AND ? AND " + CONTA_ATIVA;
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
             WHERE l.user_id = ? AND l.tipo IN ('receita', 'despesa') AND YEAR(l.data_competencia) = ? AND ${CONTA_ATIVA}
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
module.exports.CONTA_ATIVA = CONTA_ATIVA;
