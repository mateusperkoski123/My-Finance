// Primeiros passos (onboarding assistido). A lista e os passo a passo sao montados aqui e entregues ao navegador
// por GET /onboarding/dados; quem desenha e conduz e public/assets/js/onboarding.js. Textos em i18n_onboarding.js.
const db = require('../config/db');

// Contas criadas ha menos que isso veem os primeiros passos sozinhas; as outras so pelo menu (Mais > Passo a passo).
const DIAS_CONTA_NOVA = 21;

// visita: o passo conta como feito quando a pessoa abre a tela (guardado no aparelho).
// requer: so libera depois desse outro passo.
const PASSOS = [
    { id: 'conta', icone: 'ph-bank', pagina: '/contas', feito: (e) => e.contas > 0 },
    { id: 'categorias', icone: 'ph-tag', pagina: '/categorias', visita: true },
    { id: 'lancamento', icone: 'ph-arrow-circle-down', pagina: '/', feito: (e) => e.lancamentos > 0, requer: 'conta' },
    { id: 'cartao', icone: 'ph-credit-card', pagina: '/cartoes', feito: (e) => e.cartoes > 0, requer: 'conta', opcional: true },
    { id: 'relatorios', icone: 'ph-chart-bar', pagina: '/relatorios', visita: true }
];

// Cada passo aponta para o primeiro elemento visivel de "alvo". clicar: o passo avanca quando a pessoa toca no alvo
// (ele abre o formulario). opcional: some do passo a passo quando o alvo nao existe (ex.: forma de pagamento sem cartoes).
const TOURS = {
    conta: [
        { alvo: '[data-modal-open="modal-nova-conta"]', clicar: true },
        { alvo: '#modal-nova-conta [name="nome"]' },
        { alvo: '#modal-nova-conta [name="tipo"]' },
        { alvo: '#modal-nova-conta [name="saldo_inicial"]' },
        { alvo: '#modal-nova-conta [type="submit"]' }
    ],
    categorias: [
        { alvo: '.categorias-lista' },
        { alvo: '.categorias-lista [data-modal-open^="modal-sub-"]', opcional: true },
        { alvo: '.categorias-lista [data-modal-open^="modal-editar-"]', opcional: true },
        { alvo: '[data-modal-open="modal-nova-categoria"]' }
    ],
    lancamento: [
        { alvo: '.pkpi--despesas .pkpi__novo', clicar: true },
        { alvo: '#modal-novo-despesa [name="descricao"]' },
        { alvo: '#modal-novo-despesa [name="valor"]' },
        { alvo: '#modal-novo-despesa [name="categoria_id"]' },
        { alvo: '#modal-novo-despesa [data-gf-forma-pagamento-box]', opcional: true },
        { alvo: '#modal-novo-despesa [data-gf-status-box]', opcional: true },
        { alvo: '#modal-novo-despesa [name="conta_id"]', opcional: true },
        { alvo: '#modal-novo-despesa [type="submit"]' }
    ],
    cartao: [
        { alvo: '[data-modal-open="modal-novo-cartao"]', clicar: true },
        { alvo: '#modal-novo-cartao [name="nome"]' },
        { alvo: '#modal-novo-cartao [name="conta_id"]' },
        { alvo: '#modal-novo-cartao [name="limite_total"]' },
        { alvo: '#modal-novo-cartao [name="dia_fechamento"]' },
        { alvo: '#modal-novo-cartao [type="submit"]' }
    ],
    relatorios: [
        { alvo: '.tabs' },
        { alvo: 'form.card[action="/relatorios"]' },
        { alvo: '.resumo-grid', opcional: true }
    ]
};

const TEXTOS = ['titulo', 'progresso', 'abrir', 'minimizar', 'mostrar', 'de_novo', 'opcional', 'requer_conta', 'parabens', 'pronto_titulo',
    'pronto_texto', 'guia', 'ocultar', 'ocultado', 'passo_de', 'proximo', 'voltar', 'sair', 'concluir', 'nao_achou'];

async function estado(userId) {
    const [rows] = await db.query(
        `SELECT
            (SELECT COUNT(*) FROM contas WHERE user_id = ? AND status = 'ativa') AS contas,
            (SELECT COUNT(*) FROM lancamentos l JOIN categorias c ON c.id = l.categoria_id WHERE l.user_id = ? AND c.sistema = 0)
                + (SELECT COUNT(*) FROM cartao_compras WHERE user_id = ?) AS lancamentos,
            (SELECT COUNT(*) FROM cartoes WHERE user_id = ? AND status = 'ativo') AS cartoes`,
        [userId, userId, userId, userId]
    );
    const r = rows[0] || {};
    return { contas: Number(r.contas) || 0, lancamentos: Number(r.lancamentos) || 0, cartoes: Number(r.cartoes) || 0 };
}

// Tudo o que o navegador precisa, ja no idioma da conta.
async function dados(user, t) {
    const e = await estado(user.id);
    const criada = user.created_at ? new Date(user.created_at) : null;
    const textos = {};
    TEXTOS.forEach((k) => { textos[k] = t('onb.' + k); });
    const tours = {};
    Object.keys(TOURS).forEach((id) => {
        tours[id] = TOURS[id].map((p, i) => ({
            alvo: p.alvo, clicar: Boolean(p.clicar), opcional: Boolean(p.opcional),
            titulo: t(`onb.t.${id}.${i + 1}.titulo`), texto: t(`onb.t.${id}.${i + 1}.texto`)
        }));
    });
    return {
        novo: Boolean(criada && Date.now() - criada.getTime() < DIAS_CONTA_NOVA * 86400000),
        textos,
        passos: PASSOS.map((p) => ({
            id: p.id, icone: p.icone, pagina: p.pagina, visita: Boolean(p.visita), requer: p.requer || null, opcional: Boolean(p.opcional),
            feito: p.feito ? p.feito(e) : false,
            titulo: t(`onb.p.${p.id}.titulo`), texto: t(`onb.p.${p.id}.texto`)
        })),
        tours
    };
}

module.exports = { dados, PASSOS, TOURS };
