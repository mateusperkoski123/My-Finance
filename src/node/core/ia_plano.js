// Execucao das operacoes do Chat IA: cada uma e aplicada na hora e devolve um "desfazer" (dados para voltar ao estado anterior),
// usado pelo botao Reverter do cartao durante a janela de alguns segundos.
// Cada operacao reutiliza as funcoes normais do sistema (mesmas validacoes de propriedade por user_id).
const db = require('../config/db');
const Lancamento = require('../models/Lancamento');
const Categoria = require('../models/Categoria');
const Conta = require('../models/Conta');
const SyncExclusao = require('../models/SyncExclusao');
const { toLocalYMD } = require('./helpers');

const marcas = (n) => Array(n).fill('?').join(',');

// Colunas que as operacoes do plano podem mudar em um lancamento (para restaurar na reversao).
const COLUNAS_RESTAURAR = ['conta_id', 'categoria_id', 'descricao', 'valor', 'data_competencia', 'data_pagamento', 'status', 'recorrente', 'observacoes'];

async function excluirIds(userId, ids) {
    if (!ids.length) return;
    const onde = `user_id = ? AND id IN (${marcas(ids.length)})`;
    const params = [userId, ...ids];
    await SyncExclusao.registrar('lancamentos', onde, params);
    await db.query(`DELETE FROM lancamentos WHERE ${onde}`, params);
}

// Retorna o "desfazer" da operacao (objeto simples, salvo no payload da acao).
async function executarOp(userId, op) {
    switch (op.op) {
        case 'lancamento': {
            const ids = await Lancamento.criar(userId, {
                conta_id: op.conta_id, categoria_id: op.categoria_id, subcategoria_id: null,
                tipo: op.tipo, descricao: op.descricao, valor: op.valor,
                data_competencia: op.data_competencia, status: op.status, data_pagamento: op.data_pagamento,
                observacoes: 'Registrado pelo Chat IA'
            });
            return { t: 'excluir', ids };
        }

        case 'status': {
            const anteriores = [];
            for (const item of op.itens) {
                const l = await Lancamento.buscarPorId(item.id, userId);
                if (!l) throw new Error(`Lançamento não encontrado: ${item.descricao}`);
                if (l.status === op.status) continue;
                anteriores.push({ id: item.id, status: l.status, data_pagamento: l.data_pagamento ? toLocalYMD(new Date(l.data_pagamento)) : null });
                await Lancamento.marcarComoPago(item.id, userId, op.status, op.status === 'pago' ? (op.data_pagamento || toLocalYMD(new Date())) : null);
            }
            return { t: 'status', itens: anteriores };
        }

        case 'editar': {
            const l = await Lancamento.buscarPorId(op.id, userId);
            if (!l) throw new Error(`Lançamento não encontrado: ${op.descricao_atual}`);
            if (!['receita', 'despesa'].includes(l.tipo)) throw new Error('Só receitas e despesas podem ser editadas.');
            const a = op.aplicar || {};
            // Foto do estado anterior de todas as linhas que a edicao pode tocar (a propria ou a serie).
            let onde = 'id = ? AND user_id = ?'; let params = [op.id, userId];
            if (l.serie_id && op.escopo === 'esta_e_proximas') { onde = 'user_id = ? AND serie_id = ? AND data_competencia >= ?'; params = [userId, l.serie_id, l.data_competencia]; }
            else if (l.serie_id && op.escopo === 'toda_serie') { onde = 'user_id = ? AND serie_id = ?'; params = [userId, l.serie_id]; }
            const [linhas] = await db.query(`SELECT id, ${COLUNAS_RESTAURAR.join(', ')} FROM lancamentos WHERE ${onde}`, params);
            await Lancamento.atualizar(op.id, userId, {
                conta_id: a.conta_id || l.conta_id,
                categoria_id: a.categoria_id || l.categoria_id,
                subcategoria_id: null,
                descricao: a.descricao || l.descricao,
                valor: a.valor != null ? a.valor : Math.abs(Number(l.valor)),
                data_competencia: a.data_competencia || toLocalYMD(new Date(l.data_competencia)),
                status: l.status,
                data_pagamento: l.data_pagamento ? toLocalYMD(new Date(l.data_pagamento)) : null,
                e_fixo: l.recorrente ? 1 : 0,
                observacoes: l.observacoes
            }, op.escopo || 'apenas_esta');
            const antes = linhas.map((r) => ({
                ...r,
                data_competencia: r.data_competencia ? toLocalYMD(new Date(r.data_competencia)) : null,
                data_pagamento: r.data_pagamento ? toLocalYMD(new Date(r.data_pagamento)) : null
            }));
            return { t: 'restaurar', linhas: antes };
        }

        case 'categoria_criar': {
            const id = await Categoria.criar(userId, { nome: op.nome, categoria_pai_id: op.pai_id || null });
            return { t: 'categoria_excluir', id };
        }

        case 'categoria_renomear': {
            const c = await Categoria.buscarPorId(op.id, userId);
            if (!c || c.sistema) throw new Error(`Categoria não encontrada: ${op.de}`);
            await Categoria.atualizar(op.id, userId, { nome: op.para, cor: c.cor, limite_gasto: c.limite_gasto });
            return { t: 'categoria_renomear', id: op.id, nome: c.nome, cor: c.cor, limite_gasto: c.limite_gasto };
        }

        case 'transferencia': {
            const origem = await Conta.buscarPorId(op.origem_id, userId);
            const destino = await Conta.buscarPorId(op.destino_id, userId);
            if (!origem || !destino || origem.status !== 'ativa' || destino.status !== 'ativa' || origem.id === destino.id) {
                throw new Error('Conta de origem ou destino inválida.');
            }
            const ids = [];
            await Lancamento.criarTransferencia({
                userId, origem, destino, valor: op.valor, data: op.data, descricao: op.descricao || '',
                agendada: Boolean(op.agendada), eFixo: op.repeticao === 'fixa', quantidade: op.quantidade || 1, idsCriados: ids
            });
            return { t: 'excluir', ids };
        }

        default:
            throw new Error('Operação desconhecida.');
    }
}

// Desfaz uma operacao a partir do "desfazer" que executarOp devolveu.
async function desfazerOp(userId, d) {
    switch (d && d.t) {
        case 'excluir':
            await excluirIds(userId, (d.ids || []).map(Number).filter(Number.isInteger));
            return;

        case 'status':
            for (const item of d.itens || []) {
                await Lancamento.marcarComoPago(item.id, userId, item.status, item.status === 'pago' ? item.data_pagamento : null);
            }
            return;

        case 'restaurar':
            for (const r of d.linhas || []) {
                await db.query(
                    `UPDATE lancamentos SET ${COLUNAS_RESTAURAR.map((c) => `${c} = ?`).join(', ')}, updated_at = NOW(3) WHERE id = ? AND user_id = ?`,
                    [...COLUNAS_RESTAURAR.map((c) => r[c]), r.id, userId]
                );
            }
            return;

        case 'categoria_excluir': {
            const [uso] = await db.query('SELECT COUNT(*) AS n FROM lancamentos WHERE user_id = ? AND categoria_id = ?', [userId, d.id]);
            if (uso[0].n > 0) { await Categoria.arquivar(d.id, userId); return; }
            const onde = 'user_id = ? AND id = ? AND sistema = 0';
            await SyncExclusao.registrar('categorias', onde, [userId, d.id]);
            await db.query(`DELETE FROM categorias WHERE ${onde}`, [userId, d.id]);
            return;
        }

        case 'categoria_renomear':
            await Categoria.atualizar(d.id, userId, { nome: d.nome, cor: d.cor, limite_gasto: d.limite_gasto });
            return;

        default:
            throw new Error('Nada a desfazer.');
    }
}

// Desfaz na ordem inversa; devolve quantas operacoes nao puderam ser desfeitas.
async function desfazerTudo(userId, lista) {
    let falhas = 0;
    for (const d of [...lista].reverse()) {
        try { await desfazerOp(userId, d); } catch (err) { falhas++; console.error('Chat IA: falha ao reverter operacao:', err.message); }
    }
    return falhas;
}

// Tempo que o usuario tem para clicar em Reverter (o servidor aceita um pouco mais, por causa da latencia da rede).
const JANELA_REVERTER_SEG = 10;

module.exports = { executarOp, desfazerOp, desfazerTudo, JANELA_REVERTER_SEG };
