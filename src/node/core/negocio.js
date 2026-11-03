// Constantes de negocio centralizadas.
module.exports = {
    NOME_APP: process.env.APP_NAME || 'MyFinance',
    // Teste gratis: a pessoa escolhe o plano e usa esse plano por TRIAL_DIAS dias (uma vez so).
    TRIAL_DIAS: 3,
    // Promocao de Black Friday: quem comeca o teste neste periodo ganha mais dias (horario do Paraguai; o fim nao entra).
    // A landing repete o periodo em PROMO_TESTE (views/landing.ejs).
    TRIAL_PROMO: { dias: 10, inicio: '2026-11-20T00:00:00-03:00', fim: '2026-12-01T00:00:00-03:00' },
    // Cores do tema (Configuracoes > Preferencia), na ordem do seletor; verde e o padrao. topo = cor da barra do
    // navegador no celular em cada tema (igual ao --nav-bg do app.css), amostra = as duas cores mostradas no seletor.
    // A chave "roxo" aparece como Violeta. Corporativo tambem muda a forma (cantos retos, topo liso; ver app.css).
    CORES_TEMA: {
        verde: { topo: { claro: '#15803d', escuro: '#0f2a1c' }, amostra: ['#15803d', '#ecfdf3'] },
        azul: { topo: { claro: '#1d4ed8', escuro: '#0f1d3a' }, amostra: ['#1d4ed8', '#eff6ff'] },
        petroleo: { topo: { claro: '#0e7490', escuro: '#0b3a47' }, amostra: ['#0e7490', '#ecfeff'] },
        roxo: { topo: { claro: '#4338ca', escuro: '#28246a' }, amostra: ['#4338ca', '#eef2ff'] },
        rosa: { topo: { claro: '#be185d', escuro: '#561236' }, amostra: ['#be185d', '#fdf2f8'] },
        preto: { topo: { claro: '#0b0d12', escuro: '#000000' }, amostra: ['#0b0d12', '#f1f2f4'] },
        corporativo: { topo: { claro: '#14233c', escuro: '#14233c' }, amostra: ['#14233c', '#dadfe6'] }
    },
    // Telas de entrada (quem ainda nao entrou na conta): a paleta da landing, topo preto com destaques roxos.
    // Fica fora de CORES_TEMA de proposito: nao aparece no seletor nem pode ser gravada na conta.
    COR_VISITANTE: 'landing',
    TOPO_VISITANTE: '#0b0d12',
    // Limite mensal de mensagens do Chat IA quando o plano nao define um (planos.ia_limite_mes).
    IA_LIMITE_PADRAO: parseInt(process.env.IA_LIMITE_MENSAGENS_MES || '300', 10),
    // Mudar este valor obriga todos os usuarios a aceitar os termos novamente.
    TERMOS_VERSAO: '1.2',
    EMAIL_SUPORTE: process.env.SUPPORT_EMAIL || '',
    CICLOS: ['mensal', 'anual'],
    // Planos que podem ser testados e contratados (o "prueba" e o teste antigo de 7 dias, com tudo liberado).
    PLANOS_VENDA: ['basico', 'premium', 'pro'],
    // Rotas que continuam funcionando quando a assinatura venceu/cancelou (modo somente leitura).
    ROTAS_LIVRES_SOMENTE_LEITURA: ['/logout', '/assinatura', '/aceitar-termos', '/verificar-email', '/admin', '/configuracoes', '/ia'],
    // Dentro de /configuracoes, esta acao grava dados financeiros e fica bloqueada em somente leitura.
    ROTAS_BLOQUEADAS_SOMENTE_LEITURA: ['/configuracoes/dados/importar'],
    // Unicas rotas abertas para quem ainda nao escolheu o plano do teste ou ja usou o teste e nao contratou:
    // escolher/contratar um plano, sair, ler os termos e excluir a propria conta.
    ROTAS_LIVRES_BLOQUEIO: ['/logout', '/api/app/logout', '/assinatura', '/teste', '/termos', '/privacidade', '/aceitar-termos', '/verificar-email', '/configuracoes/conta', '/perfil/foto', '/idioma', '/offline', '/landing']
};

// Dias de teste de quem comeca agora: os da promocao, se estiver no periodo.
module.exports.trialDias = (agora = new Date()) => {
    const { dias, inicio, fim } = module.exports.TRIAL_PROMO;
    return agora >= new Date(inicio) && agora < new Date(fim) ? dias : module.exports.TRIAL_DIAS;
};
