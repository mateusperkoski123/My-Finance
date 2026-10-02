// Categorias iniciais (e de sistema) em cada idioma. Todas valem para receita e despesa.
const PADRAO = {
    'pt-BR': {
        despesas: [['Alimentação', '#F97316'], ['Moradia', '#EF4444'], ['Transporte', '#3B82F6'], ['Saúde', '#10B981'],
            ['Lazer', '#8B5CF6'], ['Educação', '#06B6D4'], ['Assinaturas', '#6366F1'], ['Outros', '#64748B']],
        receitas: [['Salário', '#16A34A'], ['Renda extra', '#F59E0B']],
        sistema: { ajuste_saldo: 'Ajuste de Saldo', transferencia: 'Transferência Bancária' }
    },
    'es-PY': {
        despesas: [['Alimentación', '#F97316'], ['Vivienda', '#EF4444'], ['Transporte', '#3B82F6'], ['Salud', '#10B981'],
            ['Ocio', '#8B5CF6'], ['Educación', '#06B6D4'], ['Suscripciones', '#6366F1'], ['Otros', '#64748B']],
        receitas: [['Salario', '#16A34A'], ['Ingreso extra', '#F59E0B']],
        sistema: { ajuste_saldo: 'Ajuste de saldo', transferencia: 'Transferencia bancaria' }
    },
    'en-US': {
        despesas: [['Food', '#F97316'], ['Housing', '#EF4444'], ['Transportation', '#3B82F6'], ['Health', '#10B981'],
            ['Leisure', '#8B5CF6'], ['Education', '#06B6D4'], ['Subscriptions', '#6366F1'], ['Other', '#64748B']],
        receitas: [['Salary', '#16A34A'], ['Extra income', '#F59E0B']],
        sistema: { ajuste_saldo: 'Balance adjustment', transferencia: 'Bank transfer' }
    }
};

const para = (idioma) => PADRAO[idioma] || PADRAO['pt-BR'];

// Todos os nomes que uma categoria de sistema ja teve (para achar contas criadas em qualquer idioma).
const nomesDeSistema = (chave) => Object.values(PADRAO).map((p) => p.sistema[chave]);

module.exports = { PADRAO, para, nomesDeSistema };
