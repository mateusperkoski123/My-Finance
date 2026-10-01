// Execucao do "plano" do Chat IA Nivel 2: so roda DEPOIS do clique em Confirmar tudo.
// Cada operacao reutiliza as funcoes normais do sistema (mesmas validacoes de propriedade por user_id) e e
// reconferida aqui, porque o estado pode ter mudado entre a proposta e a confirmacao.
const Lancamento = require('../models/Lancamento');
const Categoria = require('../models/Categoria');
const Conta = require('../models/Conta');
const { toLocalYMD } = require('./helpers');

async function executarOp(userId, op) {
    switch (op.op) {
        case 'lancamento':
            await Lancamento.criar(userId, {
                conta_id: op.conta_id, categoria_id: op.categoria_id, subcategoria_id: null,
                tipo: op.tipo, descricao: op.descricao, valor: op.valor,
                data_competencia: op.data_competencia, status: op.status, data_pagamento: op.data_pagamento,
                observacoes: 'Registrado pelo Chat IA'
            });
            return;

        case 'status': {
            for (const item of op.itens) {
                const l = await Lancamento.buscarPorId(item.id, userId);
                if (!l) throw new Error(`Lançamento não encontrado: ${item.descricao}`);
                if (l.status === op.status) continue;
                await Lancamento.marcarComoPago(item.id, userId, op.status, op.status === 'pago' ? (op.data_pagamento || toLocalYMD(new Date())) : null);
            }
            return;
        }

        case 'editar': {
            const l = await Lancamento.buscarPorId(op.id, userId);
            if (!l) throw new Error(`Lançamento não encontrado: ${op.descricao_atual}`);
            if (!['receita', 'despesa'].includes(l.tipo)) throw new Error('Só receitas e despesas podem ser editadas.');
            const a = op.aplicar || {};
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
            return;
        }

        case 'categoria_criar':
            await Categoria.criar(userId, { nome: op.nome, categoria_pai_id: op.pai_id || null });
            return;

        case 'categoria_renomear': {
            const c = await Categoria.buscarPorId(op.id, userId);
            if (!c || c.sistema) throw new Error(`Categoria não encontrada: ${op.de}`);
            await Categoria.atualizar(op.id, userId, { nome: op.para, cor: c.cor, limite_gasto: c.limite_gasto });
            return;
        }

        case 'transferencia': {
            const origem = await Conta.buscarPorId(op.origem_id, userId);
            const destino = await Conta.buscarPorId(op.destino_id, userId);
            if (!origem || !destino || origem.status !== 'ativa' || destino.status !== 'ativa' || origem.id === destino.id) {
                throw new Error('Conta de origem ou destino inválida.');
            }
            await Lancamento.criarTransferencia({
                userId, origem, destino, valor: op.valor, data: op.data, descricao: op.descricao || '',
                agendada: Boolean(op.agendada), eFixo: op.repeticao === 'fixa', quantidade: op.quantidade || 1
            });
            return;
        }

        default:
            throw new Error('Operação desconhecida.');
    }
}

// Executa em ordem; cada operacao e independente (uma falha nao desfaz as ja aplicadas, e o resultado diz o que foi feito).
async function executarPlano(userId, operacoes) {
    const resultados = [];
    for (const op of operacoes) {
        try {
            await executarOp(userId, op);
            resultados.push({ ok: true });
        } catch (err) {
            resultados.push({ ok: false, erro: String(err.message || 'Erro').slice(0, 200) });
        }
    }
    return resultados;
}

module.exports = { executarPlano, executarOp };
