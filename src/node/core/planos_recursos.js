// Comparativo de recursos de cada plano, montado a partir das colunas da tabela `planos`
// (a mesma fonte que as travas do sistema usam). Textos em i18n_assinatura.js (chaves 'pr.*').
const { IA_LIMITE_PADRAO } = require('./negocio');

const ehPlano = (p, codigo) => p.codigo === codigo;

// Cada item: k = chave i18n ('pr.item.<k>'), on = incluso?, val = valor em destaque { key, n } (opcional).
const GRUPOS = [
    ['financas', [
        { k: 'painel', on: () => true },
        { k: 'contas', on: () => true, val: (p) => (p.max_contas === null || p.max_contas === undefined ? { key: 'pr.val.ilimitadas' } : { key: 'pr.val.ate_contas', n: p.max_contas }) },
        { k: 'lancamentos', on: () => true },
        { k: 'relatorios', on: () => true },
        { k: 'anual', on: (p) => !!p.rec_relatorio_anual },
        { k: 'exportar', on: (p) => !!p.rec_exportar && !!p.rec_backup }
    ]],
    ['ia', [
        { k: 'chat', on: (p) => !!p.rec_ia },
        { k: 'texto', on: (p) => !!p.rec_ia },
        { k: 'foto', on: (p) => !!p.rec_ia && !!p.rec_ia_midia },
        { k: 'audio', on: (p) => !!p.rec_ia && !!p.rec_ia_midia },
        { k: 'limite_ia', on: (p) => !!p.rec_ia, val: (p) => ({ key: 'pr.val.msgs_mes', n: p.ia_limite_mes || IA_LIMITE_PADRAO }) },
        { k: 'nivel2', on: (p) => !!p.rec_ia && !!p.rec_ia_nivel2 }
    ]],
    ['app', [
        { k: 'web', on: () => true },
        { k: 'mobile', on: () => true },
        { k: 'offline', on: (p) => !!p.rec_offline }
    ]],
    ['extras', [
        { k: 'comunidade', on: () => true },
        { k: 'suporte', on: () => true },
        // Beneficios do Pro que nao dependem de uma trava no sistema.
        { k: 'suporte_prio', on: (p) => ehPlano(p, 'pro') },
        { k: 'novidades', on: (p) => ehPlano(p, 'pro') }
    ]]
];

// Retorna [{ chave, nenhum, itens: [{ k, on, val }] }] para o plano informado.
function recursosDoPlano(plano) {
    return GRUPOS.map(([chave, itens]) => {
        const lista = itens.map((i) => {
            const on = i.on(plano);
            return { k: i.k, on, val: on && i.val ? i.val(plano) : null };
        });
        return { chave, nenhum: lista.every((i) => !i.on), itens: lista };
    });
}

module.exports = { recursosDoPlano };
